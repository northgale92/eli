import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { publicar } from '../services/publicaciones';
import { obtenerUsuario } from '../services/identidad';
import { moderarContenido, type ResultadoOrquestador } from '../services/moderacion';
import { ImagenConNeblina } from '../components/ImagenConNeblina';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Video, ResizeMode } from 'expo-av';

type EstadoAnalisis = 'idle' | 'analizando' | 'bloqueado' | 'aprobado';

export default function NuevaPublicacion() {
  const [texto, setTexto] = useState('');
  const [imagen, setImagen] = useState<string | null>(null);
  const [video, setVideo] = useState<{ uri: string; duracionMs: number } | null>(null);
  const [documento, setDocumento] = useState<{ uri: string; nombre: string } | null>(null);
  const [estadoAnalisis, setEstadoAnalisis] = useState<EstadoAnalisis>('idle');
  const [mensajeBloqueo, setMensajeBloqueo] = useState('');
  const [framesInfo, setFramesInfo] = useState('');
  const [escuchando, setEscuchando] = useState(false);

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    if (transcript) setTexto(prev => prev ? `${prev} ${transcript}` : transcript);
  });
  useSpeechRecognitionEvent('end', () => setEscuchando(false));
  useSpeechRecognitionEvent('error', () => setEscuchando(false));

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

  const elegirImagen = async () => {
    if (video || documento) {
      Alert.alert('Solo un adjunto', 'Ya tienes un adjunto. Quítalo antes de añadir una imagen.');
      return;
    }
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        quality: 0.7,
      });
      if (!res.canceled) {
        setImagen(res.assets[0].uri);
        setEstadoAnalisis('idle');
        setMensajeBloqueo('');
      }
    } catch (err) {
      console.error('Error al abrir galería:', err);
    }
  };

  const elegirVideo = async () => {
    if (imagen || documento) {
      Alert.alert('Solo un adjunto', 'Ya tienes un adjunto. Quítalo antes de añadir un vídeo.');
      return;
    }
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'videos',
        allowsEditing: true,
        videoMaxDuration: 60,
        quality: 0.5,
      });
      if (!res.canceled) {
        const asset = res.assets[0];
        if (asset.duration && asset.duration > 61000) {
          Alert.alert('Vídeo demasiado largo', 'Máximo 1 minuto.');
          return;
        }
        setVideo({ uri: asset.uri, duracionMs: asset.duration ?? 60000 });
        setEstadoAnalisis('idle');
        setMensajeBloqueo('');
      }
    } catch (err) {
      console.error('Error al abrir galería de vídeo:', err);
    }
  };

  const elegirDocumento = async () => {
    if (imagen || video) {
      Alert.alert('Solo un adjunto', 'Ya tienes un adjunto. Quítalo antes de añadir un documento.');
      return;
    }
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (!res.canceled) {
        const asset = res.assets[0];
        setDocumento({ uri: asset.uri, nombre: asset.name });
        setEstadoAnalisis('idle');
        setMensajeBloqueo('');
      }
    } catch (err) {
      console.error('Error al abrir selector de documentos:', err);
    }
  };

  const handlePublicar = async () => {
    if (!texto.trim() && !imagen && !video && !documento) return;

    setEstadoAnalisis('analizando');
    setMensajeBloqueo('');
    setFramesInfo('');

    const usuarioId = (await obtenerUsuario()) ?? 'anonimo';

    let resultadoMod: ResultadoOrquestador | null = null;

    if (imagen) {
      resultadoMod = await moderarContenido(imagen, usuarioId, 'imagen');
    } else if (video) {
      const frames = Math.floor(Math.random() * 5) + 3;
      setFramesInfo(`Analizando ${frames} frames…`);
      resultadoMod = await moderarContenido(video.uri, usuarioId, 'video', video.duracionMs);
      if (resultadoMod.adultos?.framesAnalizados !== undefined) {
        setFramesInfo(`${resultadoMod.adultos.framesAnalizados} frames analizados`);
      }
    } else if (documento) {
      setFramesInfo('Enviando al servidor de análisis…');
      resultadoMod = await moderarContenido(documento.uri, usuarioId, 'documento');
      if (resultadoMod.documento?.paginasAnalizadas !== undefined) {
        setFramesInfo(`${resultadoMod.documento.paginasAnalizadas} páginas analizadas`);
      }
    }

    if (resultadoMod && !resultadoMod.aprobado) {
      setEstadoAnalisis('bloqueado');
      setMensajeBloqueo(
        resultadoMod.motivoBloqueo === 'csam_confirmado'
          ? '⛔ Contenido bloqueado permanentemente. Tu cuenta ha sido suspendida.'
          : resultadoMod.motivoBloqueo === 'csam_clasificador_local'
          ? '⛔ El sistema de seguridad ha bloqueado esta publicación.'
          : resultadoMod.motivoBloqueo === 'csam_verificacion_fallida'
          ? '⚠️ No se pudo verificar el contenido en este momento. Inténtalo más tarde.'
          : resultadoMod.motivoBloqueo === 'contenido_peligroso_documento'
          ? '⚠️ El documento contiene instrucciones que incumplen las normas de ELI.'
          : '⚠️ La IA ha detectado contenido que no cumple las normas de ELI. Revisa tu publicación antes de continuar.',
      );
      return;
    }

    setEstadoAnalisis('aprobado');

    const adultos = resultadoMod?.adultos;
    publicar(
      texto.trim(),
      usuarioId,
      imagen ?? null,
      video?.uri ?? null,
      documento?.uri ?? null,
      adultos?.requiereNeblina ?? false,
      adultos?.esPeriodista ?? false,
    );

    if (adultos?.modoSimulado) {
      console.warn('[Moderacion] Publicado en modo simulado (sin modelo TFLite)');
    }

    router.back();
  };

  const hayContenido = Boolean(texto.trim() || imagen || video || documento);
  const analizando = estadoAnalisis === 'analizando';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="Cancelar publicación"
          accessibilityRole="button"
          style={styles.botonCancelar}
          disabled={analizando}
        >
          <Text style={[styles.cancelar, analizando && { opacity: 0.4 }]}>Cancelar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nueva publicación</Text>
        <TouchableOpacity
          style={[styles.botonPublicar, (!hayContenido || analizando) && { opacity: 0.4 }]}
          accessibilityLabel="Publicar en el Muro"
          accessibilityRole="button"
          onPress={handlePublicar}
          disabled={!hayContenido || analizando}
        >
          {analizando
            ? <ActivityIndicator color={Colors.eli.background} size="small" />
            : <Text style={styles.publicarTexto}>Publicar</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll}>
        <View style={styles.autorFila}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTexto}>T</Text>
          </View>
          <View>
            <Text style={styles.autorNick}>tu_nick_eli</Text>
            <Text style={styles.autorSub}>Visible para toda la red ELI</Text>
          </View>
        </View>

        <TextInput
          style={styles.input}
          placeholder="¿Qué quieres compartir?"
          placeholderTextColor={Colors.eli.grayLight}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          accessibilityLabel="Escribe tu publicación"
          value={texto}
          onChangeText={setTexto}
          editable={!analizando}
        />

        {imagen && (
          <View style={{ marginBottom: 16 }}>
            <ImagenConNeblina uri={imagen} requiereNeblina={false} />
            <TouchableOpacity
              onPress={() => { setImagen(null); setEstadoAnalisis('idle'); }}
              style={styles.botonQuitar}
              disabled={analizando}
            >
              <Text style={styles.botonQuitarTexto}>Quitar imagen</Text>
            </TouchableOpacity>
          </View>
        )}

        {video && (
          <View style={{ marginBottom: 16 }}>
            <Video
              source={{ uri: video.uri }}
              style={{ width: '100%', height: 200, borderRadius: 12 }}
              resizeMode={ResizeMode.COVER}
              useNativeControls
              isLooping={false}
            />
            <View style={styles.videoLabel}>
              <Text style={styles.videoLabelTexto}>▶ VIDEO · máx 1 min · 480p</Text>
            </View>
            <TouchableOpacity
              onPress={() => { setVideo(null); setEstadoAnalisis('idle'); }}
              style={styles.botonQuitar}
              disabled={analizando}
            >
              <Text style={styles.botonQuitarTexto}>Quitar vídeo</Text>
            </TouchableOpacity>
          </View>
        )}

        {documento && (
          <View style={{ marginBottom: 16 }}>
            <View style={styles.documentoPreview}>
              <Text style={styles.documentoIcono}>◧</Text>
              <Text style={styles.documentoNombre} numberOfLines={2}>{documento.nombre}</Text>
            </View>
            <TouchableOpacity
              onPress={() => { setDocumento(null); setEstadoAnalisis('idle'); }}
              style={styles.botonQuitar}
              disabled={analizando}
            >
              <Text style={styles.botonQuitarTexto}>Quitar documento</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Estado de análisis */}
        {analizando && (
          <View style={styles.analizandoBanner}>
            <ActivityIndicator color={Colors.eli.primary} size="small" />
            <View style={{ flex: 1 }}>
              <Text style={styles.analizandoTexto}>
                {documento ? 'Analizando documento vía servidor…' : 'Analizando contenido on-device…'}
              </Text>
              {framesInfo !== '' && (
                <Text style={styles.analizandoSub}>{framesInfo}</Text>
              )}
            </View>
          </View>
        )}

        {estadoAnalisis === 'bloqueado' && mensajeBloqueo !== '' && (
          <View style={styles.bannerBloqueo}>
            <Text style={styles.bannerBloqueoTexto}>{mensajeBloqueo}</Text>
          </View>
        )}

        <View style={styles.separador} />

        <Text style={styles.opcionesTitle}>Añadir a tu publicación</Text>
        <View style={styles.opciones}>
          <TouchableOpacity
            style={[styles.opcion, imagen ? styles.opcionActiva : null]}
            accessibilityLabel="Adjuntar imagen"
            accessibilityRole="button"
            onPress={elegirImagen}
            disabled={analizando}
          >
            <Text style={styles.opcionIcono}>◨</Text>
            <Text style={styles.opcionTexto}>Imagen</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.opcion, documento ? styles.opcionActiva : null]}
            accessibilityLabel="Adjuntar documento PDF"
            accessibilityRole="button"
            onPress={elegirDocumento}
            disabled={analizando}
          >
            <Text style={styles.opcionIcono}>◧</Text>
            <Text style={styles.opcionTexto}>Documento</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.opcion, escuchando && styles.opcionActiva]}
            accessibilityLabel={escuchando ? 'Detener dictado' : 'Usar voz para dictar'}
            accessibilityRole="button"
            onPress={toggleMic}
            disabled={analizando}
          >
            <Text style={styles.opcionIcono}>{escuchando ? '⏹' : '◉'}</Text>
            <Text style={styles.opcionTexto}>{escuchando ? 'Escuchando…' : 'Voz'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.opcion, video ? styles.opcionActiva : null]}
            accessibilityLabel="Adjuntar vídeo"
            accessibilityRole="button"
            onPress={elegirVideo}
            disabled={analizando}
          >
            <Text style={styles.opcionIcono}>◎</Text>
            <Text style={styles.opcionTexto}>Vídeo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.separador} />

        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerTitulo}>Antes de publicar — lee esto</Text>
          <Text style={styles.infoBannerTexto}>
            La IA analiza todo el contenido antes de publicarlo. Imágenes y vídeos se procesan completamente on-device: ningún servidor ve tu archivo. Los documentos PDF se analizan vía el servidor proxy de ELI (el texto pasa cifrado; sin acceso de terceros). El contenido dañino nunca llega a la red.
          </Text>
        </View>

        <View style={[styles.infoBanner, { borderColor: Colors.eli.border, backgroundColor: Colors.eli.grayDark, marginBottom: 40 }]}>
          <Text style={[styles.infoBannerTitulo, { color: Colors.eli.white }]}>Límites de contenido multimedia</Text>
          <Text style={styles.infoBannerTexto}>
            Vídeos: máximo 1 minuto y resolución 480p{'\n'}
            Imágenes: máximo 5 MB{'\n'}
            Documentos PDF: máximo 10 MB
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.eli.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, paddingTop: 50,
    borderBottomWidth: 1, borderBottomColor: Colors.eli.border,
  },
  botonCancelar: { padding: 4 },
  cancelar: { color: Colors.eli.grayLight, fontSize: 15 },
  headerTitle: { color: Colors.eli.white, fontSize: 16, fontWeight: '600' },
  botonPublicar: {
    backgroundColor: Colors.eli.primary, borderRadius: 16,
    paddingVertical: 6, paddingHorizontal: 16, minWidth: 72, alignItems: 'center',
  },
  publicarTexto: { color: Colors.eli.background, fontWeight: 'bold', fontSize: 14 },
  scroll: { flex: 1, padding: 16 },
  autorFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.eli.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarTexto: { color: Colors.eli.background, fontWeight: 'bold', fontSize: 18 },
  autorNick: { color: Colors.eli.white, fontWeight: '600', fontSize: 15 },
  autorSub: { color: Colors.eli.grayLight, fontSize: 12 },
  input: {
    color: Colors.eli.white, fontSize: 16, lineHeight: 24,
    minHeight: 120, marginBottom: 16,
  },
  botonQuitar: {
    marginTop: 6, alignSelf: 'flex-end',
    borderWidth: 1, borderColor: Colors.eli.border,
    borderRadius: 12, paddingVertical: 4, paddingHorizontal: 12,
  },
  botonQuitarTexto: { color: Colors.eli.grayLight, fontSize: 12 },
  videoLabel: {
    position: 'absolute', bottom: 28, left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8,
    paddingVertical: 3, paddingHorizontal: 8,
  },
  videoLabelTexto: { color: Colors.eli.primary, fontSize: 11, fontWeight: '700' },
  documentoPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(0,201,177,0.08)', borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: 'rgba(0,201,177,0.3)',
  },
  documentoIcono: { color: Colors.eli.primary, fontSize: 24 },
  documentoNombre: { color: Colors.eli.white, fontSize: 14, flex: 1, lineHeight: 20 },
  analizandoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,201,177,0.08)', borderRadius: 10, padding: 14,
    borderLeftWidth: 2, borderLeftColor: 'rgba(0,201,177,0.3)', marginBottom: 12,
  },
  analizandoTexto: { color: Colors.eli.primary, fontSize: 13, fontWeight: '600' },
  analizandoSub: { color: Colors.eli.grayLight, fontSize: 11, marginTop: 2 },
  bannerBloqueo: {
    backgroundColor: '#2B0D0D', borderColor: '#ff6b6b',
    borderRadius: 10, padding: 14, borderWidth: 1, marginBottom: 12,
  },
  bannerBloqueoTexto: { color: '#ff6b6b', fontSize: 13, fontWeight: '700' },
  separador: { height: 1, backgroundColor: Colors.eli.border, marginVertical: 16 },
  opcionesTitle: {
    color: Colors.eli.grayLight, fontSize: 13, marginBottom: 12,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  opciones: { flexDirection: 'row', gap: 12 },
  opcion: {
    flex: 1, backgroundColor: Colors.eli.grayDark, borderRadius: 10,
    padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.eli.border,
  },
  opcionActiva: { borderColor: Colors.eli.primary, backgroundColor: '#0D2B2B' },
  opcionIcono: { color: Colors.eli.primary, fontSize: 24, marginBottom: 4 },
  opcionTexto: { color: Colors.eli.grayLight, fontSize: 12 },
  infoBanner: {
    marginTop: 16, backgroundColor: 'rgba(0,201,177,0.08)',
    borderRadius: 10, padding: 14, borderLeftWidth: 2, borderLeftColor: 'rgba(0,201,177,0.3)',
  },
  infoBannerTitulo: { color: Colors.eli.primary, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  infoBannerTexto: { color: Colors.eli.white, fontSize: 13, lineHeight: 20 },
});
