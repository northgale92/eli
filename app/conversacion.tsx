import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert, Modal, Linking, Image, ActivityIndicator,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { Audio, Video, ResizeMode } from 'expo-av';
import { File, Paths } from 'expo-file-system';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Video as VideoCompressor } from 'react-native-compressor';
import * as Sharing from 'expo-sharing';
import EmojiPicker, { type EmojiType } from 'rn-emoji-keyboard';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  cargarMensajesLocal, enviarMensaje, suscribirMensajes,
  suscribirEstados, marcarLeidos, borrarMensaje, editarMensaje,
  eliminarMensajeParaTodos, LIMITE_ELIMINAR_PARA_TODOS_MS,
  enviarMensajeAudio, enviarUbicacion,
  enviarImagen, enviarVideo, enviarDocumento,
  LIMITE_IMAGEN_LADO_PX, LIMITE_VIDEO_DURACION_S, LIMITE_VIDEO_BYTES, LIMITE_DOCUMENTO_BYTES,
  LIMITE_VIDEO_LADO_PX, BITRATE_VIDEO_BPS,
  reaccionarMensaje, suscribirReacciones,
  notificarEscribiendo, suscribirEscribiendo,
  type Mensaje, type EstadoMensaje, type RespuestaCitada,
} from '../services/chat';
import { obtenerIdentidad } from '../services/identidad';
import { idCanal, publicarClavePublica, suscribirPerfil } from '../services/gun';
import { Avatar } from '../components/Avatar';

const ICONOS_ESTADO: Record<EstadoMensaje, string> = {
  enviado: '✓',
  entregado: '✓✓',
  leido: '✓✓',
  error: '⚠',
};

const EMOJIS_RAPIDOS = ['❤️', '😂', '👍', '😮', '😢', '🙏'];

function formatoHora(ts: number): string {
  return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export default function Conversacion() {
  const insets = useSafeAreaInsets();
  const { destinatario } = useLocalSearchParams<{ destinatario: string }>();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [miId, setMiId] = useState('');
  const [leyendoMsg, setLeyendoMsg] = useState<string | null>(null);
  const [escuchando, setEscuchando] = useState(false);
  const [otroEscribiendo, setOtroEscribiendo] = useState(false);
  const [respondiendoA, setRespondiendoA] = useState<RespuestaCitada | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [reaccionandoA, setReaccionandoA] = useState<Mensaje | null>(null);
  // Menú de opciones al mantener pulsado un mensaje (Responder/Reaccionar/
  // Reenviar/Eliminar). Es un Modal propio, NO Alert.alert: Alert.alert en
  // Android solo renderiza los 3 primeros botones del array que se le pase
  // (ver node_modules/react-native/Libraries/Alert/Alert.js, `buttons.slice(0, 3)`)
  // — con 4 opciones, "Eliminar" quedaba descartado en silencio sin ningún
  // error ni warning visible. No es una regresión de wiring: borrarMensaje()
  // en services/chat.ts y confirmarBorrarMensaje() de abajo siempre
  // estuvieron completos y correctamente conectados.
  const [menuMensaje, setMenuMensaje] = useState<Mensaje | null>(null);
  const [grabando, setGrabando] = useState(false);
  const [reproduciendoId, setReproduciendoId] = useState<string | null>(null);
  const [adjuntando, setAdjuntando] = useState(false);
  // Solo se usa mientras se comprime un vídeo (VideoCompressor.compress puede
  // tardar varios segundos); null el resto del tiempo, incl. imagen/documento.
  const [progresoCompresion, setProgresoCompresion] = useState<number | null>(null);
  const [videoActivoId, setVideoActivoId] = useState<string | null>(null);
  const [abriendoDocId, setAbriendoDocId] = useState<string | null>(null);
  const [emojiPickerAbierto, setEmojiPickerAbierto] = useState(false);
  const [seleccionTexto, setSeleccionTexto] = useState({ start: 0, end: 0 });
  const [perfilDestinatario, setPerfilDestinatario] = useState<{ nombreVisible?: string; fotoPerfil?: string }>({});
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const grabacionRef = useRef<Audio.Recording | null>(null);
  const grabacionActivaRef = useRef(false);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sonidoRef = useRef<Audio.Sound | null>(null);
  const ultimoAvisoEscribiendo = useRef(0);

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    if (transcript) setTexto(prev => prev ? `${prev} ${transcript}` : transcript);
  });
  useSpeechRecognitionEvent('end', () => setEscuchando(false));
  useSpeechRecognitionEvent('error', () => setEscuchando(false));

  // Carga inicial y suscripciones
  useEffect(() => {
    if (!destinatario) return;
    let cancelarMensajes: (() => void) | null = null;
    let cancelarEstados: (() => void) | null = null;
    let cancelarReacciones: (() => void) | null = null;
    let cancelarEscribiendo: (() => void) | null = null;

    (async () => {
      const id = await obtenerIdentidad();
      if (!id) return;
      setMiId(id.usuario);

      // Publicar nuestra clave pública para que el destinatario pueda cifrar
      publicarClavePublica(id.usuario, id.clavePublica);

      const ch = idCanal(id.usuario, destinatario);
      const existentes = await cargarMensajesLocal(ch);
      setMensajes(existentes);
      await marcarLeidos(ch, id.usuario);

      // Suscribir mensajes entrantes (y ediciones de los ya recibidos)
      cancelarMensajes = suscribirMensajes(ch, id.usuario, id.clavePrivada, (msg) => {
        setMensajes(prev => {
          const idx = prev.findIndex(m => m.id === msg.id);
          if (idx >= 0) {
            const copia = [...prev];
            copia[idx] = msg;
            return copia;
          }
          return [...prev, msg];
        });
      });

      // Suscribir cambios de estado (enviado→entregado→leido) en mensajes propios
      cancelarEstados = suscribirEstados(ch, (msgId, estado) => {
        setMensajes(prev =>
          prev.map(m => m.id === msgId && m.mio ? { ...m, estado } : m),
        );
      });

      // Suscribir reacciones de cualquiera de los dos participantes
      cancelarReacciones = suscribirReacciones(ch, (mensajeId, usuario, emoji) => {
        setMensajes(prev => prev.map(m => {
          if (m.id !== mensajeId) return m;
          const reacciones = { ...(m.reacciones ?? {}) };
          if (emoji) reacciones[usuario] = emoji; else delete reacciones[usuario];
          return { ...m, reacciones };
        }));
      });

      // Suscribir indicador de "escribiendo…" de la contraparte
      cancelarEscribiendo = suscribirEscribiendo(ch, id.usuario, setOtroEscribiendo);
    })();

    return () => {
      cancelarMensajes?.();
      cancelarEstados?.();
      cancelarReacciones?.();
      cancelarEscribiendo?.();
      sonidoRef.current?.unloadAsync().catch(() => {});
    };
  }, [destinatario]);

  // Perfil (nombre visible + foto) del destinatario, para el avatar del
  // header — suscripción en vivo, no una lectura única: justo tras reiniciar
  // la app, una lectura .once() puede resolver antes de que la conexión al
  // relay esté lista y quedarse con el perfil vacío/desactualizado para
  // siempre, ya que este efecto no volvía a consultar. Ver suscribirPerfil
  // en services/gun.ts.
  useEffect(() => {
    if (!destinatario) return;
    setPerfilDestinatario({});
    const cancelar = suscribirPerfil(destinatario, (perfil) => {
      setPerfilDestinatario({ nombreVisible: perfil.nombreVisible, fotoPerfil: perfil.fotoPerfil });
    });
    return cancelar;
  }, [destinatario]);

  // Scroll al último mensaje
  useEffect(() => {
    if (mensajes.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [mensajes.length]);

  const leerMensaje = async (msg: Mensaje) => {
    if (leyendoMsg === msg.id) {
      await Speech.stop();
      setLeyendoMsg(null);
    } else {
      setLeyendoMsg(msg.id);
      Speech.speak(msg.texto, {
        language: 'es-ES',
        onDone: () => setLeyendoMsg(null),
        onError: () => setLeyendoMsg(null),
        onStopped: () => setLeyendoMsg(null),
      });
    }
  };

  const toggleMic = async () => {
    if (escuchando) {
      ExpoSpeechRecognitionModule.stop();
    } else {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) return;
      setEscuchando(true);
      ExpoSpeechRecognitionModule.start({ lang: 'es-ES', interimResults: false });
    }
  };

  // ─── Grabación de notas de voz (mantener pulsado el micro) ────────────────

  const iniciarGrabacion = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const grabacion = new Audio.Recording();
      await grabacion.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await grabacion.startAsync();
      grabacionRef.current = grabacion;
      setGrabando(true);
    } catch {
      grabacionRef.current = null;
      setGrabando(false);
    }
  };

  const detenerYEnviarGrabacion = async () => {
    const grabacion = grabacionRef.current;
    grabacionRef.current = null;
    setGrabando(false);
    if (!grabacion || !destinatario) return;
    try {
      const statusPrevio = await grabacion.getStatusAsync();
      await grabacion.stopAndUnloadAsync();
      const uri = grabacion.getURI();
      const duracionMs = statusPrevio.isRecording ? (statusPrevio.durationMillis ?? 0) : 0;
      if (!uri || duracionMs < 500) return; // grabación demasiado corta, descartar

      const id = await obtenerIdentidad();
      if (!id) return;
      const base64 = await new File(uri).base64();
      const resultado = await enviarMensajeAudio(
        base64, duracionMs, id.usuario, id.clavePublica, id.clavePrivada, destinatario,
      );
      if (resultado.ok) {
        setMensajes(prev => [...prev, {
          id: `local_audio_${Date.now()}`, texto: '🎤 Mensaje de voz',
          de: id.usuario, para: destinatario, hora: Date.now(),
          estado: 'enviado', mio: true, tipo: 'audio', audioBase64: base64, duracionMs,
        }]);
      }
    } catch {
      // Grabación fallida — no bloquear la UI del chat por esto.
    }
  };

  const manejarPressInMic = () => {
    pressTimerRef.current = setTimeout(() => {
      grabacionActivaRef.current = true;
      iniciarGrabacion();
    }, 350);
  };

  const manejarPressOutMic = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (grabacionActivaRef.current) {
      grabacionActivaRef.current = false;
      detenerYEnviarGrabacion();
    } else {
      toggleMic();
    }
  };

  // ─── Reproducción de notas de voz recibidas ────────────────────────────────

  const alternarReproduccion = async (item: Mensaje) => {
    if (!item.audioBase64) return;
    if (reproduciendoId === item.id) {
      await sonidoRef.current?.stopAsync().catch(() => {});
      await sonidoRef.current?.unloadAsync().catch(() => {});
      sonidoRef.current = null;
      setReproduciendoId(null);
      return;
    }
    await sonidoRef.current?.unloadAsync().catch(() => {});
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/m4a;base64,${item.audioBase64}` },
        { shouldPlay: true },
      );
      sonidoRef.current = sound;
      setReproduciendoId(item.id);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setReproduciendoId(null);
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch {
      setReproduciendoId(null);
    }
  };

  // ─── Compartir ubicación ───────────────────────────────────────────────────

  const compartirUbicacion = async () => {
    if (!destinatario) return;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const id = await obtenerIdentidad();
    if (!id) return;
    try {
      const pos = await Location.getCurrentPositionAsync({});
      const resultado = await enviarUbicacion(
        pos.coords.latitude, pos.coords.longitude,
        id.usuario, id.clavePublica, id.clavePrivada, destinatario,
      );
      if (resultado.ok) {
        setMensajes(prev => [...prev, {
          id: `local_loc_${Date.now()}`, texto: '📍 Ubicación compartida',
          de: id.usuario, para: destinatario, hora: Date.now(),
          estado: 'enviado', mio: true, tipo: 'ubicacion',
          lat: pos.coords.latitude, lon: pos.coords.longitude,
        }]);
      }
    } catch {
      // Sin ubicación disponible — no bloquear el chat.
    }
  };

  // ─── Adjuntar imagen / vídeo / documento ───────────────────────────────────
  //
  // Igual que la nota de voz y la ubicación: el archivo se cifra con el mismo
  // NaCl box de siempre y viaja por Gun. NO pasa por moderacionCSAM.ts ni
  // moderacionAdultos.ts — esos escáneres solo aplican al contenido público
  // de Muro/Canales; este chat es E2E y nadie salvo el destinatario puede
  // verlo, así que no hay lado servidor donde "moderar" nada.

  const enviarImagenSeleccionada = async (asset: ImagePicker.ImagePickerAsset) => {
    const id = await obtenerIdentidad();
    if (!id || !destinatario) return;
    const manipulada = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: LIMITE_IMAGEN_LADO_PX } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    if (!manipulada.base64) return;
    const tamanoBytes = Math.ceil((manipulada.base64.length * 3) / 4);
    const resultado = await enviarImagen(
      manipulada.base64, 'image/jpeg', manipulada.width, manipulada.height, tamanoBytes,
      id.usuario, id.clavePublica, id.clavePrivada, destinatario,
    );
    // Se muestra la burbuja tanto en éxito como en fallo confirmado
    // (resultado.persistido): el estado ('enviado' | 'error') refleja si la
    // escritura en Gun se confirmó de verdad (ver enviarAdjunto en
    // services/chat.ts). Si no se persistió nada (p. ej. sin clave pública
    // del destinatario), no hay burbuja que mostrar.
    if (resultado.persistido) {
      setMensajes(prev => [...prev, {
        id: `local_img_${Date.now()}`, texto: '📷 Foto',
        de: id.usuario, para: destinatario, hora: Date.now(),
        estado: resultado.ok ? 'enviado' : 'error', mio: true, tipo: 'imagen',
        archivoBase64: manipulada.base64, archivoMime: 'image/jpeg',
        ancho: manipulada.width, alto: manipulada.height, archivoTamano: tamanoBytes,
      }]);
    }
  };

  const enviarVideoSeleccionado = async (asset: ImagePicker.ImagePickerAsset) => {
    const id = await obtenerIdentidad();
    if (!id || !destinatario) return;

    // Recodifica antes de enviar: sin esto, un vídeo de móvil típico (1080p+,
    // varios Mbps) casi siempre supera lo que este relay P2P sin CDN puede
    // mover de forma fiable (ver el análisis de overhead real, doble base64 +
    // cifrado, en LIMITE_VIDEO_BYTES de services/chat.ts). Si la compresión
    // falla (códec raro, formato no soportado), se sigue con el archivo
    // original — mejor intentar enviarlo sin comprimir que no enviarlo.
    let uriFinal = asset.uri;
    setProgresoCompresion(0);
    try {
      uriFinal = await VideoCompressor.compress(
        asset.uri,
        { compressionMethod: 'manual', maxSize: LIMITE_VIDEO_LADO_PX, bitrate: BITRATE_VIDEO_BPS },
        // El nativo emite el progreso ya en escala 0-100 (ver
        // Compressor.kt: `presentationTimeUs / duration * 100`), no una
        // fracción 0-1 — sin este ajuste se mostraría hasta "10000%".
        (progreso) => setProgresoCompresion(Math.min(100, Math.round(progreso))),
      );
    } catch {
      // Se sigue con asset.uri (sin comprimir); el chequeo de tamaño de
      // abajo sigue aplicando igual.
    } finally {
      setProgresoCompresion(null);
    }

    const archivo = new File(uriFinal);
    if (archivo.size > LIMITE_VIDEO_BYTES) {
      Alert.alert(
        'Vídeo demasiado grande',
        `Incluso comprimido, el vídeo pesa ${(archivo.size / (1024 * 1024)).toFixed(1)} MB. El límite por P2P es ${LIMITE_VIDEO_BYTES / (1024 * 1024)} MB.`,
      );
      return;
    }

    let miniaturaBase64: string | undefined;
    try {
      const miniatura = await VideoThumbnails.getThumbnailAsync(asset.uri, { quality: 0.5 });
      const miniaturaComprimida = await ImageManipulator.manipulateAsync(
        miniatura.uri, [{ resize: { width: 400 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      miniaturaBase64 = miniaturaComprimida.base64;
    } catch {
      // Sin miniatura disponible — se muestra la burbuja sin preview.
    }

    const base64 = await archivo.base64();
    const resultado = await enviarVideo(
      base64, miniaturaBase64, asset.mimeType ?? 'video/mp4',
      Math.round((asset.duration ?? 0)), asset.width, asset.height, archivo.size,
      id.usuario, id.clavePublica, id.clavePrivada, destinatario,
    );
    if (resultado.persistido) {
      setMensajes(prev => [...prev, {
        id: `local_vid_${Date.now()}`, texto: '🎥 Vídeo',
        de: id.usuario, para: destinatario, hora: Date.now(),
        estado: resultado.ok ? 'enviado' : 'error', mio: true, tipo: 'video',
        archivoBase64: base64, archivoMime: asset.mimeType ?? 'video/mp4', miniaturaBase64,
        duracionMs: Math.round((asset.duration ?? 0)), ancho: asset.width, alto: asset.height,
        archivoTamano: archivo.size,
      }]);
    }
  };

  const procesarAssetSeleccionado = async (asset: ImagePicker.ImagePickerAsset) => {
    setAdjuntando(true);
    try {
      if (asset.type === 'video') await enviarVideoSeleccionado(asset);
      else await enviarImagenSeleccionada(asset);
    } catch {
      Alert.alert('No se pudo adjuntar', 'Ocurrió un problema al procesar el archivo.');
    } finally {
      setAdjuntando(false);
    }
  };

  const adjuntarDesdeGaleria = async () => {
    try {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) return;
      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.7,
        videoMaxDuration: LIMITE_VIDEO_DURACION_S,
      });
      if (resultado.canceled || !resultado.assets[0]) return;
      await procesarAssetSeleccionado(resultado.assets[0]);
    } catch {
      Alert.alert('No se pudo adjuntar', 'Ocurrió un problema al abrir la galería.');
    }
  };

  const adjuntarDesdeCamara = async () => {
    try {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) return;
      const resultado = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.7,
        videoMaxDuration: LIMITE_VIDEO_DURACION_S,
      });
      if (resultado.canceled || !resultado.assets[0]) return;
      await procesarAssetSeleccionado(resultado.assets[0]);
    } catch {
      Alert.alert('No se pudo adjuntar', 'Ocurrió un problema al abrir la cámara.');
    }
  };

  const adjuntarDocumento = async () => {
    const resultado = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (resultado.canceled || !resultado.assets[0]) return;
    const asset = resultado.assets[0];
    const id = await obtenerIdentidad();
    if (!id || !destinatario) return;

    setAdjuntando(true);
    try {
      const archivo = new File(asset.uri);
      const tamano = asset.size ?? archivo.size;
      if (tamano > LIMITE_DOCUMENTO_BYTES) {
        Alert.alert(
          'Documento demasiado grande',
          `Pesa ${(tamano / (1024 * 1024)).toFixed(1)} MB. El límite por P2P es ${LIMITE_DOCUMENTO_BYTES / (1024 * 1024)} MB.`,
        );
        return;
      }
      const base64 = await archivo.base64();
      const mime = asset.mimeType ?? 'application/octet-stream';
      const resultadoEnvio = await enviarDocumento(
        base64, asset.name, mime, tamano,
        id.usuario, id.clavePublica, id.clavePrivada, destinatario,
      );
      if (resultadoEnvio.persistido) {
        setMensajes(prev => [...prev, {
          id: `local_doc_${Date.now()}`, texto: `📄 ${asset.name}`,
          de: id.usuario, para: destinatario, hora: Date.now(),
          estado: resultadoEnvio.ok ? 'enviado' : 'error', mio: true, tipo: 'documento',
          archivoBase64: base64, archivoMime: mime, archivoNombre: asset.name, archivoTamano: tamano,
        }]);
      }
    } catch {
      Alert.alert('No se pudo adjuntar', 'Ocurrió un problema al procesar el documento.');
    } finally {
      setAdjuntando(false);
    }
  };

  const abrirSelectorAdjunto = () => {
    if (adjuntando) return;
    Alert.alert('Adjuntar', undefined, [
      { text: 'Galería (foto o vídeo)', onPress: () => { void adjuntarDesdeGaleria(); } },
      { text: 'Cámara', onPress: () => { void adjuntarDesdeCamara(); } },
      { text: 'Documento', onPress: () => { void adjuntarDocumento(); } },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const formatoTamano = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const iconoDocumento = (mime?: string): string => {
    if (!mime) return '📄';
    if (mime.includes('pdf')) return '📕';
    if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return '🗜️';
    if (mime.includes('word') || mime.includes('document')) return '📝';
    if (mime.includes('sheet') || mime.includes('excel')) return '📊';
    return '📄';
  };

  // Abre un documento recibido: lo escribe (ya descifrado, en base64) a un
  // archivo temporal en caché y delega en el selector nativo "Abrir con /
  // Compartir" de Android. Todo el proceso es local — no hay descarga ni
  // llamada a red, el contenido ya está descifrado en memoria desde que
  // llegó por Gun.
  const abrirDocumento = async (item: Mensaje) => {
    if (!item.archivoBase64 || abriendoDocId) return;
    setAbriendoDocId(item.id);
    try {
      const disponible = await Sharing.isAvailableAsync();
      if (!disponible) {
        Alert.alert('No disponible', 'Este dispositivo no admite abrir/compartir archivos.');
        return;
      }
      const nombre = item.archivoNombre?.trim() || `documento_${item.id}`;
      const destino = new File(Paths.cache, nombre);
      destino.create({ overwrite: true, intermediates: true });
      destino.write(item.archivoBase64, { encoding: 'base64' });
      await Sharing.shareAsync(destino.uri, {
        mimeType: item.archivoMime,
        dialogTitle: nombre,
      });
      // El archivo temporal se deja en caché (bajo el límite de 5MB por
      // documento) para que "Abrir con" pueda seguir leyéndolo mientras el
      // usuario elige una app; el propio SO limpia la caché cuando hace falta.
    } catch {
      Alert.alert('No se pudo abrir el documento', 'Ocurrió un problema al preparar el archivo.');
    } finally {
      setAbriendoDocId(null);
    }
  };

  // ─── Responder / reaccionar / editar / borrar ──────────────────────────────

  const iniciarEdicion = (item: Mensaje) => {
    setRespondiendoA(null);
    setEditandoId(item.id);
    setTexto(item.texto);
  };

  const confirmarBorrarMensaje = (item: Mensaje) => {
    if (!miId || !destinatario) return;
    Alert.alert(
      'Eliminar mensaje',
      'Se eliminará solo de tu dispositivo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const ch = idCanal(miId, destinatario);
            await borrarMensaje(ch, item.id);
            setMensajes(prev => prev.filter(m => m.id !== item.id));
          },
        },
      ],
    );
  };

  // "Eliminar para todos": tombstona el mensaje en Gun (ver
  // eliminarMensajeParaTodos en services/chat.ts) para que la eliminación se
  // propague al otro dispositivo por la sincronización normal. A diferencia
  // de confirmarBorrarMensaje (arriba), aquí SÍ hace falta reflejar el
  // resultado como una burbuja "eliminado", no quitar el mensaje de la lista.
  const confirmarEliminarParaTodos = (item: Mensaje) => {
    if (!miId || !destinatario) return;
    Alert.alert(
      'Eliminar para todos',
      'Se eliminará este mensaje para ti y para la otra persona.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar para todos',
          style: 'destructive',
          onPress: async () => {
            const ch = idCanal(miId, destinatario);
            const resultado = await eliminarMensajeParaTodos(ch, item.id, miId);
            if (resultado.ok) {
              setMensajes(prev => prev.map(m => (m.id === item.id ? {
                id: m.id, de: m.de, para: m.para, hora: m.hora, estado: m.estado, mio: m.mio,
                tipo: 'texto', texto: '', eliminadoParaTodos: true,
              } : m)));
            } else {
              Alert.alert('No se pudo eliminar', resultado.error ?? 'Ocurrió un problema al eliminar el mensaje.');
            }
          },
        },
      ],
    );
  };

  const abrirMenuMensaje = (item: Mensaje) => {
    if (!miId || !destinatario) return;
    setMenuMensaje(item);
  };

  const manejarTapMensaje = (item: Mensaje) => {
    if (item.tipo === 'audio') { alternarReproduccion(item); return; }
    if (item.tipo === 'ubicacion') {
      if (item.lat != null && item.lon != null) {
        Linking.openURL(`https://www.google.com/maps?q=${item.lat},${item.lon}`);
      }
      return;
    }
    if (item.tipo === 'video') {
      setVideoActivoId(prev => (prev === item.id ? null : item.id));
      return;
    }
    if (item.tipo === 'documento') { void abrirDocumento(item); return; }
    if (item.tipo === 'imagen') return;
    if (item.mio) iniciarEdicion(item);
  };

  const elegirEmoji = (emoji: string) => {
    if (reaccionandoA && miId && destinatario) {
      reaccionarMensaje(idCanal(miId, destinatario), reaccionandoA.id, miId, emoji);
    }
    setReaccionandoA(null);
  };

  // ─── Envío / edición de texto ──────────────────────────────────────────────

  const manejarCambioTexto = (t: string) => {
    setTexto(t);
    if (!miId || !destinatario || editandoId) return;
    const ahora = Date.now();
    if (ahora - ultimoAvisoEscribiendo.current > 1500) {
      ultimoAvisoEscribiendo.current = ahora;
      notificarEscribiendo(idCanal(miId, destinatario), miId);
    }
  };

  // Inserta el emoji elegido en el punto del cursor (no siempre al final).
  // rn-emoji-keyboard solo se usa aquí para escribir emojis dentro del propio
  // texto — es un componente distinto del modal de reacciones (EMOJIS_RAPIDOS)
  // que ya existía para reaccionar a un mensaje ajeno.
  const insertarEmoji = (emojiSeleccionado: EmojiType) => {
    const inicio = seleccionTexto.start;
    const fin = seleccionTexto.end;
    const nuevoTexto = texto.slice(0, inicio) + emojiSeleccionado.emoji + texto.slice(fin);
    const nuevaPosicion = inicio + emojiSeleccionado.emoji.length;
    setTexto(nuevoTexto);
    setSeleccionTexto({ start: nuevaPosicion, end: nuevaPosicion });
    requestAnimationFrame(() => inputRef.current?.setSelection(nuevaPosicion, nuevaPosicion));
  };

  const enviar = useCallback(async () => {
    if (!texto.trim() || enviando || !miId || !destinatario) return;
    const textoEnviar = texto.trim();
    const idEditando = editandoId;
    const respuesta = respondiendoA;
    setTexto('');
    setRespondiendoA(null);
    setEditandoId(null);
    setEnviando(true);

    try {
      const id = await obtenerIdentidad();
      if (!id) { setEnviando(false); return; }

      if (idEditando) {
        const ch = idCanal(id.usuario, destinatario);
        const resultado = await editarMensaje(ch, idEditando, id.clavePrivada, destinatario, textoEnviar);
        if (resultado.ok) {
          setMensajes(prev => prev.map(m => m.id === idEditando ? { ...m, texto: textoEnviar, editado: true } : m));
        } else {
          setTexto(textoEnviar);
          setEditandoId(idEditando);
        }
        return;
      }

      const resultado = await enviarMensaje(
        textoEnviar,
        id.usuario,
        id.clavePublica,
        id.clavePrivada,
        destinatario,
        respuesta ?? undefined,
      );

      if (!resultado.ok) {
        setTexto(textoEnviar);
        setRespondiendoA(respuesta);
      } else {
        // Actualizar la lista local inmediatamente (sin esperar a Gun)
        setMensajes(prev => {
          const yaExiste = prev.find(m => m.texto === textoEnviar && m.mio && Date.now() - m.hora < 5000);
          if (yaExiste) return prev;
          return [...prev, {
            id: `local_${Date.now()}`,
            texto: textoEnviar,
            de: id.usuario,
            para: destinatario,
            hora: Date.now(),
            estado: 'enviado',
            mio: true,
            tipo: 'texto',
            respondeA: respuesta ?? undefined,
          }];
        });
      }
    } catch {
      setTexto(textoEnviar);
      setRespondiendoA(respuesta);
      setEditandoId(idEditando);
      Alert.alert('No se pudo enviar', 'Ocurrió un problema al enviar el mensaje.');
    } finally {
      setEnviando(false);
    }
  }, [texto, enviando, miId, destinatario, editandoId, respondiendoA]);

  const renderMensaje = ({ item }: { item: Mensaje }) => {
    // Mensaje tombstonado vía "Eliminar para todos" (ver eliminarMensajeParaTodos):
    // se muestra como una burbuja de aviso, sin acciones (nada que responder,
    // reaccionar, reenviar o volver a eliminar), en vez de desaparecer sin
    // rastro o dejar un hueco vacío en la conversación.
    if (item.eliminadoParaTodos) {
      return (
        <View style={[styles.burbuja, item.mio ? styles.burbujaPropia : styles.burbujaAjena]}>
          <Text style={[styles.burbujaTexto, styles.textoEliminado, item.mio ? styles.textoPropio : styles.textoAjeno]}>
            🚫 Este mensaje fue eliminado
          </Text>
          <View style={styles.burbujaMetadata}>
            <Text style={styles.burbujaHora}>{formatoHora(item.hora)}</Text>
          </View>
        </View>
      );
    }
    return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => manejarTapMensaje(item)}
      onLongPress={() => abrirMenuMensaje(item)}
      style={[styles.burbuja, item.mio ? styles.burbujaPropia : styles.burbujaAjena]}
    >
      {item.reenviado && (
        <Text style={styles.reenviadoTexto}>↪ Reenviado</Text>
      )}
      {item.respondeA && (
        <View style={styles.citaContenedor}>
          <Text style={styles.citaAutor}>{item.respondeA.de}</Text>
          <Text style={styles.citaTexto} numberOfLines={1}>{item.respondeA.texto}</Text>
        </View>
      )}

      {item.tipo === 'audio' ? (
        <View style={styles.filaAudio}>
          <Text style={styles.audioIcono}>{reproduciendoId === item.id ? '⏸' : '▶'}</Text>
          <Text style={[styles.burbujaTexto, item.mio ? styles.textoPropio : styles.textoAjeno]}>
            Nota de voz{item.duracionMs ? ` · ${Math.round(item.duracionMs / 1000)}s` : ''}
          </Text>
        </View>
      ) : item.tipo === 'ubicacion' ? (
        <Text style={[styles.burbujaTexto, item.mio ? styles.textoPropio : styles.textoAjeno]}>
          📍 Ubicación compartida (toca para ver el mapa)
        </Text>
      ) : item.tipo === 'imagen' && item.archivoBase64 ? (
        <Image
          source={{ uri: `data:${item.archivoMime ?? 'image/jpeg'};base64,${item.archivoBase64}` }}
          style={styles.imagenAdjunta}
          resizeMode="cover"
        />
      ) : item.tipo === 'video' && item.archivoBase64 ? (
        videoActivoId === item.id ? (
          <Video
            source={{ uri: `data:${item.archivoMime ?? 'video/mp4'};base64,${item.archivoBase64}` }}
            style={styles.imagenAdjunta}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
          />
        ) : (
          <View style={styles.videoPreviewContenedor}>
            {item.miniaturaBase64 && (
              <Image
                source={{ uri: `data:image/jpeg;base64,${item.miniaturaBase64}` }}
                style={styles.imagenAdjunta}
                resizeMode="cover"
              />
            )}
            <View style={styles.videoPlayOverlay}>
              <Text style={styles.videoPlayIcono}>▶</Text>
            </View>
            {!!item.duracionMs && (
              <Text style={styles.videoDuracionTexto}>{Math.round(item.duracionMs / 1000)}s</Text>
            )}
          </View>
        )
      ) : item.tipo === 'documento' ? (
        <View style={styles.filaDocumento}>
          {abriendoDocId === item.id ? (
            <ActivityIndicator size="small" color={item.mio ? Colors.eli.background : Colors.eli.primary} />
          ) : (
            <Text style={styles.documentoIcono}>{iconoDocumento(item.archivoMime)}</Text>
          )}
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.burbujaTexto, item.mio ? styles.textoPropio : styles.textoAjeno]}
              numberOfLines={1}
            >
              {item.archivoNombre ?? 'Documento'}
            </Text>
            {!!item.archivoTamano && (
              <Text style={styles.documentoTamanoTexto}>{formatoTamano(item.archivoTamano)}</Text>
            )}
          </View>
        </View>
      ) : (
        <Text style={[styles.burbujaTexto, item.mio ? styles.textoPropio : styles.textoAjeno]}>
          {item.texto}
        </Text>
      )}

      {item.tipo === 'texto' && item.preview && (
        <TouchableOpacity
          style={styles.previewEnlaceContenedor}
          onPress={() => Linking.openURL(item.preview!.url)}
          accessibilityLabel={`Abrir enlace: ${item.preview.titulo ?? item.preview.url}`}
          accessibilityRole="link"
        >
          {item.preview.imagen && (
            <Image source={{ uri: item.preview.imagen }} style={styles.previewEnlaceImagen} resizeMode="cover" />
          )}
          <View style={styles.previewEnlaceTexto}>
            {!!item.preview.titulo && (
              <Text style={styles.previewEnlaceTitulo} numberOfLines={2}>{item.preview.titulo}</Text>
            )}
            {!!item.preview.descripcion && (
              <Text style={styles.previewEnlaceDescripcion} numberOfLines={2}>{item.preview.descripcion}</Text>
            )}
            <Text style={styles.previewEnlaceUrl} numberOfLines={1}>{item.preview.url}</Text>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.burbujaMetadata}>
        {item.editado && <Text style={styles.editadoTexto}>editado</Text>}
        <Text style={styles.burbujaHora}>{formatoHora(item.hora)}</Text>
        {item.mio && (
          <Text style={[
            styles.estadoIcono,
            item.estado === 'leido' && styles.estadoLeido,
            item.estado === 'error' && styles.estadoError,
          ]}>
            {ICONOS_ESTADO[item.estado]}
          </Text>
        )}
        <TouchableOpacity
          onPress={() => leerMensaje(item)}
          accessibilityLabel={leyendoMsg === item.id ? 'Detener lectura' : 'Leer mensaje en voz alta'}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.estadoIcono, leyendoMsg === item.id && { color: Colors.eli.primary }]}>
            {leyendoMsg === item.id ? '⏹' : '🔊'}
          </Text>
        </TouchableOpacity>
      </View>

      {item.reacciones && Object.keys(item.reacciones).length > 0 && (
        <View style={styles.reaccionesFila}>
          {Object.entries(item.reacciones).map(([usuario, emoji]) => (
            <Text key={usuario} style={styles.reaccionTexto}>{emoji}</Text>
          ))}
        </View>
      )}
    </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="Volver al chat"
          accessibilityRole="button"
          style={styles.botonVolver}
        >
          <Text style={styles.volver}>‹</Text>
        </TouchableOpacity>
        <Avatar
          nombre={perfilDestinatario.nombreVisible || destinatario || '?'}
          fotoBase64={perfilDestinatario.fotoPerfil}
          size={36}
          style={{ marginRight: 10 }}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.headerNombre}>{perfilDestinatario.nombreVisible || destinatario || '—'}</Text>
          <Text style={styles.headerEstado}>{otroEscribiendo ? 'escribiendo…' : 'Cifrado E2E · NaCl box'}</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            if (!miId || !destinatario) return;
            router.push(
              `/llamada?tipo=saliente&destinatario=${encodeURIComponent(destinatario)}&miPubKey=${encodeURIComponent(miId)}`,
            );
          }}
          style={styles.botonVideo}
          accessibilityLabel="Iniciar llamada de voz"
          accessibilityRole="button"
        >
          <Text style={styles.botonVideoTexto}>📞</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={mensajes}
        keyExtractor={m => m.id}
        renderItem={renderMensaje}
        contentContainerStyle={styles.listaPadding}
        ListHeaderComponent={
          <View style={styles.bannerCifrado}>
            <Text style={styles.bannerTitulo}>Conversación cifrada de extremo a extremo</Text>
            <Text style={styles.bannerTexto}>
              Nadie puede leer estos mensajes excepto tú y {destinatario}. Ni ELI, ni ningún servidor.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.sinMensajes}>Sin mensajes aún. ¡Escribe el primero!</Text>
        }
      />

      {(respondiendoA || editandoId) && (
        <View style={styles.previewBarra}>
          <View style={{ flex: 1 }}>
            <Text style={styles.previewTitulo}>
              {editandoId ? 'Editando mensaje' : `Respondiendo a ${respondiendoA?.de}`}
            </Text>
            {respondiendoA && (
              <Text style={styles.previewTexto} numberOfLines={1}>{respondiendoA.texto}</Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => {
              if (editandoId) { setEditandoId(null); setTexto(''); }
              else setRespondiendoA(null);
            }}
            accessibilityLabel="Cancelar"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.previewCerrar}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {grabando && (
        <View style={styles.previewBarra}>
          <Text style={styles.grabandoTexto}>🔴 Grabando… suelta para enviar</Text>
        </View>
      )}

      <View style={[styles.inputArea, { paddingBottom: 12 + insets.bottom }]}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Mensaje cifrado..."
          placeholderTextColor={Colors.eli.grayLight}
          accessibilityLabel="Escribe un mensaje"
          value={texto}
          onChangeText={manejarCambioTexto}
          onSelectionChange={(e) => setSeleccionTexto(e.nativeEvent.selection)}
          multiline
          returnKeyType="send"
          onSubmitEditing={enviar}
        />
        <TouchableOpacity
          style={styles.botonUbicacion}
          accessibilityLabel="Insertar emoji"
          accessibilityRole="button"
          onPress={() => setEmojiPickerAbierto(true)}
        >
          <Text style={styles.botonMicTexto}>😀</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.botonUbicacion}
          accessibilityLabel={
            progresoCompresion !== null ? `Comprimiendo vídeo, ${progresoCompresion}%`
              : adjuntando ? 'Adjuntando…' : 'Adjuntar imagen, vídeo o documento'
          }
          accessibilityRole="button"
          onPress={abrirSelectorAdjunto}
          disabled={adjuntando}
        >
          <Text style={[styles.botonMicTexto, progresoCompresion !== null && styles.botonMicTextoProgreso]}>
            {progresoCompresion !== null ? `${progresoCompresion}%` : adjuntando ? '⏳' : '📎'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.botonUbicacion}
          accessibilityLabel="Compartir ubicación"
          accessibilityRole="button"
          onPress={compartirUbicacion}
        >
          <Text style={styles.botonMicTexto}>📍</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.botonMic, (escuchando || grabando) && styles.botonMicActivo]}
          accessibilityLabel={escuchando ? 'Detener dictado' : 'Mantén pulsado para grabar una nota de voz'}
          accessibilityRole="button"
          onPressIn={manejarPressInMic}
          onPressOut={manejarPressOutMic}
        >
          <Text style={styles.botonMicTexto}>{escuchando ? '⏹' : grabando ? '●' : '🎤'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.botonEnviar, (!texto.trim() || enviando) && { opacity: 0.4 }]}
          accessibilityLabel="Enviar mensaje"
          accessibilityRole="button"
          onPress={enviar}
          disabled={!texto.trim() || enviando}
        >
          <Text style={styles.botonEnviarTexto}>{enviando ? '…' : editandoId ? 'Guardar' : 'Enviar'}</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={!!menuMensaje}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuMensaje(null)}
      >
        <TouchableOpacity
          style={styles.modalFondo}
          activeOpacity={1}
          onPress={() => setMenuMensaje(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.menuMensajeCard}>
            {!!menuMensaje && (
              <Text style={styles.menuMensajePreview} numberOfLines={2}>
                {menuMensaje.texto.length > 60 ? `${menuMensaje.texto.slice(0, 60)}…` : menuMensaje.texto}
              </Text>
            )}
            <TouchableOpacity
              style={styles.menuMensajeOpcion}
              accessibilityRole="button"
              onPress={() => {
                if (!menuMensaje) return;
                setEditandoId(null);
                setRespondiendoA({ id: menuMensaje.id, texto: menuMensaje.texto, de: menuMensaje.de });
                setMenuMensaje(null);
              }}
            >
              <Text style={styles.menuMensajeOpcionTexto}>Responder</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuMensajeOpcion}
              accessibilityRole="button"
              onPress={() => {
                if (!menuMensaje) return;
                setReaccionandoA(menuMensaje);
                setMenuMensaje(null);
              }}
            >
              <Text style={styles.menuMensajeOpcionTexto}>Reaccionar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuMensajeOpcion}
              accessibilityRole="button"
              onPress={() => {
                if (!menuMensaje || !miId || !destinatario) return;
                const canal = idCanal(miId, destinatario);
                router.push({ pathname: '/reenviar', params: { mensajeId: menuMensaje.id, canalOrigen: canal } });
                setMenuMensaje(null);
              }}
            >
              <Text style={styles.menuMensajeOpcionTexto}>Reenviar</Text>
            </TouchableOpacity>
            {!!menuMensaje && menuMensaje.mio
              && Date.now() - menuMensaje.hora <= LIMITE_ELIMINAR_PARA_TODOS_MS && (
              <TouchableOpacity
                style={styles.menuMensajeOpcion}
                accessibilityRole="button"
                onPress={() => {
                  if (!menuMensaje) return;
                  const item = menuMensaje;
                  setMenuMensaje(null);
                  confirmarEliminarParaTodos(item);
                }}
              >
                <Text style={[styles.menuMensajeOpcionTexto, styles.menuMensajeOpcionDestructiva]}>
                  Eliminar para todos
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.menuMensajeOpcion, styles.menuMensajeOpcionUltima]}
              accessibilityRole="button"
              onPress={() => {
                if (!menuMensaje) return;
                const item = menuMensaje;
                setMenuMensaje(null);
                confirmarBorrarMensaje(item);
              }}
            >
              <Text style={[styles.menuMensajeOpcionTexto, styles.menuMensajeOpcionDestructiva]}>Eliminar para mí</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={!!reaccionandoA}
        transparent
        animationType="fade"
        onRequestClose={() => setReaccionandoA(null)}
      >
        <TouchableOpacity
          style={styles.modalFondo}
          activeOpacity={1}
          onPress={() => setReaccionandoA(null)}
        >
          <View style={styles.modalEmojis}>
            {EMOJIS_RAPIDOS.map(e => (
              <TouchableOpacity key={e} onPress={() => elegirEmoji(e)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.modalEmojiTexto}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <EmojiPicker
        open={emojiPickerAbierto}
        onClose={() => setEmojiPickerAbierto(false)}
        onEmojiSelected={insertarEmoji}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.eli.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, paddingTop: 50,
    borderBottomWidth: 1, borderBottomColor: Colors.eli.border,
  },
  botonVolver: { marginRight: 8 },
  volver: { color: Colors.eli.primary, fontSize: 28, lineHeight: 28 },
  avatarPequeno: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.eli.primary,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  avatarTexto: { color: Colors.eli.background, fontWeight: 'bold', fontSize: 16 },
  headerInfo: { flex: 1 },
  headerNombre: { color: Colors.eli.white, fontWeight: '600', fontSize: 15 },
  headerEstado: { color: Colors.eli.primary, fontSize: 11 },
  listaPadding: { padding: 16, paddingBottom: 8 },
  bannerCifrado: {
    backgroundColor: 'rgba(0,201,177,0.08)', borderRadius: 8, padding: 12,
    marginBottom: 16, borderLeftWidth: 2, borderLeftColor: 'rgba(0,201,177,0.3)',
  },
  bannerTitulo: {
    color: Colors.eli.primary, fontSize: 12, fontWeight: '700',
    marginBottom: 4, textAlign: 'center',
  },
  bannerTexto: { color: Colors.eli.grayLight, fontSize: 11, textAlign: 'center', lineHeight: 16 },
  sinMensajes: { color: Colors.eli.grayLight, textAlign: 'center', marginTop: 40, fontSize: 14 },
  burbuja: { maxWidth: '75%', borderRadius: 16, padding: 10, marginBottom: 8 },
  burbujaPropia: {
    alignSelf: 'flex-end', backgroundColor: Colors.eli.primary, borderBottomRightRadius: 4,
  },
  burbujaAjena: {
    alignSelf: 'flex-start', backgroundColor: Colors.eli.grayDark, borderBottomLeftRadius: 4,
  },
  burbujaTexto: { fontSize: 14, lineHeight: 20 },
  textoPropio: { color: Colors.eli.background },
  textoAjeno: { color: Colors.eli.white },
  textoEliminado: { fontStyle: 'italic', opacity: 0.7 },
  burbujaMetadata: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, gap: 4 },
  burbujaHora: { fontSize: 10, color: Colors.eli.grayLight },
  estadoIcono: { fontSize: 10, color: Colors.eli.grayLight },
  estadoLeido: { color: Colors.eli.primary },
  estadoError: { color: Colors.eli.error, fontSize: 12 },
  editadoTexto: { fontSize: 10, color: Colors.eli.grayLight, fontStyle: 'italic' },
  citaContenedor: {
    borderLeftWidth: 2, borderLeftColor: Colors.eli.primary,
    paddingLeft: 8, marginBottom: 6, opacity: 0.85,
  },
  citaAutor: { fontSize: 11, fontWeight: '700', color: Colors.eli.primary },
  citaTexto: { fontSize: 12, color: Colors.eli.grayLight },
  reenviadoTexto: { fontSize: 11, color: Colors.eli.grayLight, fontStyle: 'italic', marginBottom: 4 },
  filaAudio: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  audioIcono: { fontSize: 18, color: Colors.eli.white },
  imagenAdjunta: { width: 220, height: 220, borderRadius: 10, backgroundColor: Colors.eli.grayDark },
  videoPreviewContenedor: { width: 220, height: 220, borderRadius: 10, overflow: 'hidden' },
  videoPlayOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  videoPlayIcono: {
    fontSize: 28, color: Colors.eli.white, backgroundColor: 'rgba(0,0,0,0.45)',
    width: 52, height: 52, borderRadius: 26, textAlign: 'center', textAlignVertical: 'center',
    overflow: 'hidden',
  },
  videoDuracionTexto: {
    position: 'absolute', bottom: 6, right: 8, fontSize: 11, color: Colors.eli.white,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  filaDocumento: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 160 },
  documentoIcono: { fontSize: 26 },
  documentoTamanoTexto: { fontSize: 11, color: Colors.eli.grayLight, marginTop: 2 },
  previewEnlaceContenedor: {
    marginTop: 8, borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', maxWidth: 240,
  },
  previewEnlaceImagen: { width: '100%', height: 120, backgroundColor: Colors.eli.grayDark },
  previewEnlaceTexto: { padding: 8, backgroundColor: 'rgba(0,0,0,0.15)' },
  previewEnlaceTitulo: { fontSize: 12, fontWeight: '700', color: Colors.eli.white },
  previewEnlaceDescripcion: { fontSize: 11, color: Colors.eli.grayLight, marginTop: 2 },
  previewEnlaceUrl: { fontSize: 10, color: Colors.eli.grayLight, marginTop: 4 },
  reaccionesFila: { flexDirection: 'row', marginTop: 4, gap: 2 },
  reaccionTexto: { fontSize: 14 },
  previewBarra: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: Colors.eli.border,
    backgroundColor: Colors.eli.grayDark,
  },
  previewTitulo: { fontSize: 12, fontWeight: '700', color: Colors.eli.primary },
  previewTexto: { fontSize: 12, color: Colors.eli.grayLight, marginTop: 2 },
  previewCerrar: { fontSize: 16, color: Colors.eli.grayLight, paddingHorizontal: 8 },
  grabandoTexto: { fontSize: 13, color: Colors.eli.primary, fontWeight: '600' },
  inputArea: {
    flexDirection: 'row', padding: 12,
    borderTopWidth: 1, borderTopColor: Colors.eli.border,
    alignItems: 'flex-end', gap: 10,
  },
  input: {
    flex: 1, backgroundColor: Colors.eli.grayDark,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    color: Colors.eli.white, fontSize: 14,
    borderWidth: 1, borderColor: Colors.eli.border, maxHeight: 120,
  },
  botonUbicacion: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.eli.grayDark,
    borderWidth: 1, borderColor: Colors.eli.border,
    alignItems: 'center', justifyContent: 'center',
  },
  botonMic: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.eli.grayDark,
    borderWidth: 1, borderColor: Colors.eli.border,
    alignItems: 'center', justifyContent: 'center',
  },
  botonMicActivo: { borderColor: Colors.eli.primary, backgroundColor: '#0D2B2B' },
  botonMicTexto: { fontSize: 18 },
  botonMicTextoProgreso: { fontSize: 10, fontWeight: '700' },
  botonEnviar: {
    backgroundColor: Colors.eli.primary, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  botonEnviarTexto: { color: Colors.eli.background, fontWeight: 'bold', fontSize: 14 },
  botonVideo: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.eli.grayDark,
    borderWidth: 1, borderColor: Colors.eli.border,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 6,
  },
  botonVideoTexto: { fontSize: 18 },
  modalFondo: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalEmojis: {
    flexDirection: 'row', backgroundColor: Colors.eli.grayDark,
    borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, gap: 14,
    borderWidth: 1, borderColor: Colors.eli.border,
  },
  modalEmojiTexto: { fontSize: 28 },
  menuMensajeCard: {
    backgroundColor: Colors.eli.grayDark, borderRadius: 14, width: 240,
    borderWidth: 1, borderColor: Colors.eli.border, overflow: 'hidden',
  },
  menuMensajePreview: {
    color: Colors.eli.grayLight, fontSize: 12, padding: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.eli.border,
  },
  menuMensajeOpcion: {
    paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.eli.border,
  },
  menuMensajeOpcionUltima: { borderBottomWidth: 0 },
  menuMensajeOpcionTexto: { color: Colors.eli.white, fontSize: 15 },
  menuMensajeOpcionDestructiva: { color: Colors.eli.error },
});
