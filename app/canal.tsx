import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Image, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Colors } from '../constants/Colors';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, ResizeMode } from 'expo-av';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  escucharPublicacionesCanal, publicarEnCanal, suscribirse, desuscribirse, estaSuscrito,
  sanitizarEnlaces, type AdjuntoCanal,
} from '../services/canales';
import {
  LIMITE_IMAGEN_LADO_PX, LIMITE_VIDEO_BYTES, LIMITE_VIDEO_DURACION_S, LIMITE_DOCUMENTO_BYTES,
} from '../services/chat';
import { obtenerUsuario } from '../services/identidad';
import { ImagenConNeblina } from '../components/ImagenConNeblina';

type EstadoPublicacion = 'idle' | 'analizando' | 'bloqueado';

interface PublicacionCanal {
  id: string;
  usuario: string;
  texto: string;
  imagen: string | null;
  imagenMime?: string | null;
  video: string | null;
  videoMime?: string | null;
  videoDuracionMs?: number | null;
  documento: string | null;
  documentoMime?: string | null;
  documentoNombre?: string | null;
  requiereNeblina?: boolean;
  esPeriodista?: boolean;
  timestamp: number;
  likes: number;
}

interface AdjuntoPendiente {
  tipo: 'imagen' | 'video' | 'documento';
  uriPreview: string;
  nombre?: string;
  duracionMs?: number;
}

export default function Canal() {
  const insets = useSafeAreaInsets();
  const { id, nombre, descripcion, creador } = useLocalSearchParams<{
    id: string; nombre: string; descripcion: string; creador: string;
  }>();

  const [publicaciones, setPublicaciones] = useState<PublicacionCanal[]>([]);
  const [suscrito, setSuscrito] = useState(false);
  const [miUsuario, setMiUsuario] = useState('');
  const [texto, setTexto] = useState('');
  const [adjunto, setAdjunto] = useState<AdjuntoPendiente | null>(null);
  const [estado, setEstado] = useState<EstadoPublicacion>('idle');
  const [mensajeBloqueo, setMensajeBloqueo] = useState('');
  const [videoActivoId, setVideoActivoId] = useState<string | null>(null);
  const [abriendoDocId, setAbriendoDocId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const usuario = await obtenerUsuario();
      setMiUsuario(usuario || '');
      if (usuario) setSuscrito(await estaSuscrito(id, usuario));
    })();

    return escucharPublicacionesCanal(id, (pub) => {
      setPublicaciones(prev => (prev.find(p => p.id === pub.id) ? prev : [pub, ...prev]));
    });
  }, [id]);

  const toggleSuscribirse = async () => {
    if (!miUsuario) return;
    if (suscrito) { await desuscribirse(id, miUsuario); setSuscrito(false); }
    else { await suscribirse(id, miUsuario); setSuscrito(true); }
  };

  const limpiarAdjunto = () => {
    setAdjunto(null);
    setEstado('idle');
    setMensajeBloqueo('');
  };

  const elegirImagen = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, quality: 0.7 });
      if (res.canceled) return;
      limpiarAdjunto();
      setAdjunto({ tipo: 'imagen', uriPreview: res.assets[0].uri });
    } catch (err) {
      console.error('Error al abrir galería:', err);
    }
  };

  const elegirVideo = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'videos', quality: 0.5, videoMaxDuration: LIMITE_VIDEO_DURACION_S,
      });
      if (res.canceled) return;
      const asset = res.assets[0];
      limpiarAdjunto();
      setAdjunto({ tipo: 'video', uriPreview: asset.uri, duracionMs: Math.round(asset.duration ?? 0) });
    } catch (err) {
      console.error('Error al abrir galería de vídeo:', err);
    }
  };

  const elegirDocumento = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (res.canceled) return;
      const asset = res.assets[0];
      limpiarAdjunto();
      setAdjunto({ tipo: 'documento', uriPreview: asset.uri, nombre: asset.name });
    } catch (err) {
      console.error('Error al abrir selector de documentos:', err);
    }
  };

  // Lee/comprime el adjunto pendiente a base64 justo antes de publicar — mismo
  // momento que services/chat.ts (la UI compone el AdjuntoCanal, el servicio
  // solo modera y escribe en Gun).
  const construirAdjuntoCanal = async (): Promise<AdjuntoCanal | null> => {
    if (!adjunto) return null;

    if (adjunto.tipo === 'imagen') {
      const manipulada = await ImageManipulator.manipulateAsync(
        adjunto.uriPreview,
        [{ resize: { width: LIMITE_IMAGEN_LADO_PX } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!manipulada.base64) throw new Error('No se pudo procesar la imagen.');
      return { tipo: 'imagen', uri: adjunto.uriPreview, base64: manipulada.base64, mime: 'image/jpeg' };
    }

    if (adjunto.tipo === 'video') {
      const archivo = new File(adjunto.uriPreview);
      if (archivo.size > LIMITE_VIDEO_BYTES) {
        throw new Error(`El vídeo pesa ${(archivo.size / (1024 * 1024)).toFixed(1)} MB. El límite es ${LIMITE_VIDEO_BYTES / (1024 * 1024)} MB.`);
      }
      const base64 = await archivo.base64();
      return { tipo: 'video', uri: adjunto.uriPreview, base64, mime: 'video/mp4', duracionMs: adjunto.duracionMs };
    }

    // documento
    const archivo = new File(adjunto.uriPreview);
    if (archivo.size > LIMITE_DOCUMENTO_BYTES) {
      throw new Error(`El documento pesa ${(archivo.size / (1024 * 1024)).toFixed(1)} MB. El límite es ${LIMITE_DOCUMENTO_BYTES / (1024 * 1024)} MB.`);
    }
    const base64 = await archivo.base64();
    return {
      tipo: 'documento', uri: adjunto.uriPreview, base64, mime: 'application/pdf', nombre: adjunto.nombre ?? 'documento.pdf',
    };
  };

  const handlePublicar = async () => {
    if (!texto.trim() && !adjunto) return;

    setEstado('analizando');
    setMensajeBloqueo('');

    try {
      const adjuntoCanal = await construirAdjuntoCanal();
      const resultado = await publicarEnCanal(id, texto.trim(), miUsuario, adjuntoCanal);

      if (!resultado.publicado) {
        setEstado('bloqueado');
        setMensajeBloqueo(resultado.mensajeBloqueo ?? '⚠️ Contenido bloqueado.');
        return;
      }

      setTexto('');
      setAdjunto(null);
      setEstado('idle');
      setMensajeBloqueo('');
    } catch (err) {
      setEstado('bloqueado');
      setMensajeBloqueo(err instanceof Error ? err.message : 'No se pudo procesar el adjunto.');
    }
  };

  // Mismo patrón que abrirDocumento en app/conversacion.tsx: escribe el
  // base64 a un archivo temporal y delega en el selector nativo del SO.
  const abrirDocumento = async (pub: PublicacionCanal) => {
    if (!pub.documento || abriendoDocId) return;
    setAbriendoDocId(pub.id);
    try {
      const disponible = await Sharing.isAvailableAsync();
      if (!disponible) {
        Alert.alert('No disponible', 'Este dispositivo no admite abrir/compartir archivos.');
        return;
      }
      const nombreArchivo = pub.documentoNombre?.trim() || `documento_${pub.id}.pdf`;
      const destino = new File(Paths.cache, nombreArchivo);
      destino.create({ overwrite: true, intermediates: true });
      destino.write(pub.documento, { encoding: 'base64' });
      await Sharing.shareAsync(destino.uri, { mimeType: pub.documentoMime ?? 'application/pdf', dialogTitle: nombreArchivo });
    } catch {
      Alert.alert('No se pudo abrir el documento', 'Ocurrió un problema al preparar el archivo.');
    } finally {
      setAbriendoDocId(null);
    }
  };

  const esMiCanal = miUsuario === creador;
  const analizando = estado === 'analizando';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.botonVolver}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Text style={styles.textoVolver}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerNombre} numberOfLines={1}>{nombre}</Text>
        {!esMiCanal && (
          <TouchableOpacity
            onPress={toggleSuscribirse}
            style={[styles.botonSuscribirse, suscrito && styles.botonSuscrito]}
            accessibilityLabel={suscrito ? 'Cancelar suscripción' : 'Suscribirse'}
            accessibilityRole="button"
          >
            <Text style={[styles.botonSuscribirseTexto, suscrito && styles.botonSuscritoTexto]}>
              {suscrito ? 'Suscrito' : '+ Unirse'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.scroll}>
        <View style={styles.perfilSection}>
          <View style={styles.avatarGrande}>
            <Text style={styles.avatarTexto}>{nombre ? nombre[0] : '?'}</Text>
          </View>
          <Text style={styles.canalNombre}>{nombre}</Text>
          <Text style={styles.creadorTexto}>por @{creador}</Text>
          {descripcion ? <Text style={styles.descripcionTexto}>{descripcion}</Text> : null}
        </View>

        {publicaciones.length === 0 && (
          <View style={styles.vacio}>
            <Text style={styles.vacioTexto}>
              {esMiCanal ? 'Publica algo para empezar.' : 'Sin publicaciones todavía.'}
            </Text>
          </View>
        )}

        {publicaciones.map((pub) => (
          <View key={pub.id} style={styles.tarjeta}>
            {pub.texto ? (
              <Text style={styles.pubTexto}>{sanitizarEnlaces(pub.texto)}</Text>
            ) : null}

            {pub.imagen ? (
              <ImagenConNeblina
                uri={`data:${pub.imagenMime ?? 'image/jpeg'};base64,${pub.imagen}`}
                requiereNeblina={pub.requiereNeblina === true}
                esPeriodista={pub.esPeriodista === true}
                style={styles.imagenCanal}
              />
            ) : null}

            {pub.video ? (
              videoActivoId === pub.id ? (
                <Video
                  source={{ uri: `data:${pub.videoMime ?? 'video/mp4'};base64,${pub.video}` }}
                  style={styles.videoCanal}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                />
              ) : (
                <TouchableOpacity
                  style={styles.videoPreviewContenedor}
                  onPress={() => setVideoActivoId(pub.id)}
                  accessibilityLabel="Reproducir vídeo"
                  accessibilityRole="button"
                >
                  <View style={styles.videoPlayOverlay}>
                    <Text style={styles.videoPlayIcono}>▶</Text>
                  </View>
                  {!!pub.videoDuracionMs && (
                    <Text style={styles.videoDuracionTexto}>{Math.round(pub.videoDuracionMs / 1000)}s</Text>
                  )}
                </TouchableOpacity>
              )
            ) : null}

            {pub.documento ? (
              <TouchableOpacity
                style={styles.documentoBadge}
                onPress={() => abrirDocumento(pub)}
                accessibilityLabel={`Abrir documento ${pub.documentoNombre ?? ''}`}
                accessibilityRole="button"
                disabled={!!abriendoDocId}
              >
                {abriendoDocId === pub.id
                  ? <ActivityIndicator size="small" color={Colors.eli.primary} />
                  : <Text style={styles.documentoBadgeTexto}>◧ {pub.documentoNombre ?? 'PDF adjunto'}</Text>}
              </TouchableOpacity>
            ) : null}

            <View style={styles.pubFooter}>
              <Text style={styles.pubTiempo}>
                {pub.timestamp
                  ? new Date(pub.timestamp).toLocaleDateString('es-ES', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })
                  : 'justo ahora'}
              </Text>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/comentarios', params: { pubId: pub.id, canalId: id } })}
                accessibilityLabel="Ver comentarios"
                accessibilityRole="button"
              >
                <Text style={styles.comentariosBoton}>💬 Comentarios</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={{ height: 140 }} />
      </ScrollView>

      {esMiCanal && (
        <View style={[styles.inputContainer, { paddingBottom: 12 + insets.bottom }]}>
          <View style={{ flex: 1, gap: 6 }}>
            {adjunto && (
              <View style={styles.adjuntoPreviewRow}>
                {adjunto.tipo === 'imagen' && (
                  <Image source={{ uri: adjunto.uriPreview }} style={styles.adjuntoPreviewImagen} />
                )}
                <Text style={styles.adjuntoPreviewTexto} numberOfLines={1}>
                  {adjunto.tipo === 'imagen' ? '◨ Imagen adjunta'
                    : adjunto.tipo === 'video' ? '◎ Vídeo adjunto'
                    : `◧ ${adjunto.nombre}`}
                </Text>
                <TouchableOpacity onPress={limpiarAdjunto} disabled={analizando}>
                  <Text style={styles.adjuntoPreviewQuitar}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            {estado === 'bloqueado' && mensajeBloqueo !== '' && (
              <Text style={styles.textoBloqueo}>{mensajeBloqueo}</Text>
            )}

            <View style={styles.inputFila}>
              <TouchableOpacity
                onPress={elegirImagen}
                style={[styles.botonAdjunto, adjunto?.tipo === 'imagen' && styles.botonAdjuntoActivo]}
                accessibilityLabel="Adjuntar imagen"
                accessibilityRole="button"
                disabled={analizando}
              >
                <Text style={styles.botonAdjuntoTexto}>◨</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={elegirVideo}
                style={[styles.botonAdjunto, adjunto?.tipo === 'video' && styles.botonAdjuntoActivo]}
                accessibilityLabel="Adjuntar vídeo"
                accessibilityRole="button"
                disabled={analizando}
              >
                <Text style={styles.botonAdjuntoTexto}>◎</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={elegirDocumento}
                style={[styles.botonAdjunto, adjunto?.tipo === 'documento' && styles.botonAdjuntoActivo]}
                accessibilityLabel="Adjuntar documento PDF"
                accessibilityRole="button"
                disabled={analizando}
              >
                <Text style={styles.botonAdjuntoTexto}>◧</Text>
              </TouchableOpacity>

              <TextInput
                style={styles.input}
                placeholder="Escribe una publicación..."
                placeholderTextColor={Colors.eli.grayLight}
                value={texto}
                onChangeText={setTexto}
                multiline
                maxLength={1000}
                editable={!analizando}
              />

              <TouchableOpacity
                style={[
                  styles.botonEnviar,
                  ((!texto.trim() && !adjunto) || analizando) && { opacity: 0.4 },
                ]}
                onPress={handlePublicar}
                disabled={(!texto.trim() && !adjunto) || analizando}
                accessibilityLabel="Publicar en canal"
                accessibilityRole="button"
              >
                {analizando
                  ? <ActivityIndicator color={Colors.eli.background} size="small" />
                  : <Text style={styles.botonEnviarTexto}>↑</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.eli.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, paddingTop: 50,
    borderBottomWidth: 1, borderBottomColor: Colors.eli.border, gap: 12,
  },
  botonVolver: { marginRight: 4 },
  textoVolver: { color: Colors.eli.primary, fontSize: 16, fontWeight: '600' },
  headerNombre: { color: Colors.eli.white, fontSize: 18, fontWeight: '600', flex: 1 },
  botonSuscribirse: {
    borderWidth: 1, borderColor: Colors.eli.primary,
    borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12,
  },
  botonSuscrito: { borderColor: Colors.eli.grayLight },
  botonSuscribirseTexto: { color: Colors.eli.primary, fontSize: 12, fontWeight: '600' },
  botonSuscritoTexto: { color: Colors.eli.grayLight },
  scroll: { flex: 1 },
  perfilSection: {
    alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: Colors.eli.border,
  },
  avatarGrande: {
    width: 80, height: 80, borderRadius: 20,
    backgroundColor: Colors.eli.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarTexto: { color: Colors.eli.background, fontWeight: 'bold', fontSize: 36 },
  canalNombre: { color: Colors.eli.white, fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  creadorTexto: { color: Colors.eli.primary, fontSize: 13, marginBottom: 8 },
  descripcionTexto: {
    color: Colors.eli.grayLight, fontSize: 14, textAlign: 'center',
    lineHeight: 20, paddingHorizontal: 20,
  },
  vacio: { alignItems: 'center', paddingTop: 60 },
  vacioTexto: { color: Colors.eli.grayLight, fontSize: 15 },
  tarjeta: { padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.eli.border, gap: 8 },
  pubTexto: { color: Colors.eli.white, fontSize: 15, lineHeight: 22 },
  imagenCanal: { marginTop: 4 },
  videoCanal: { width: '100%', height: 220, borderRadius: 12, backgroundColor: Colors.eli.grayDark },
  videoPreviewContenedor: {
    width: '100%', height: 220, borderRadius: 12, backgroundColor: Colors.eli.grayDark,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  videoPlayOverlay: { alignItems: 'center', justifyContent: 'center' },
  videoPlayIcono: {
    fontSize: 28, color: Colors.eli.white, backgroundColor: 'rgba(0,0,0,0.45)',
    width: 52, height: 52, borderRadius: 26, textAlign: 'center', textAlignVertical: 'center',
    overflow: 'hidden',
  },
  videoDuracionTexto: {
    position: 'absolute', bottom: 8, right: 10, fontSize: 11, color: Colors.eli.white,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  documentoBadge: {
    backgroundColor: 'rgba(0,201,177,0.08)', borderRadius: 8,
    paddingVertical: 4, paddingHorizontal: 10, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: 'rgba(0,201,177,0.2)',
  },
  documentoBadgeTexto: { color: Colors.eli.primary, fontSize: 12 },
  pubFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pubTiempo: { color: Colors.eli.grayLight, fontSize: 12 },
  comentariosBoton: { color: Colors.eli.primary, fontSize: 12, fontWeight: '600' },
  inputContainer: {
    padding: 12, borderTopWidth: 1, borderTopColor: Colors.eli.border,
    backgroundColor: Colors.eli.background,
  },
  adjuntoPreviewRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,201,177,0.08)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, gap: 8,
  },
  adjuntoPreviewImagen: { width: 28, height: 28, borderRadius: 4 },
  adjuntoPreviewTexto: { color: Colors.eli.primary, fontSize: 12, flex: 1 },
  adjuntoPreviewQuitar: { color: Colors.eli.grayLight, fontSize: 14, paddingHorizontal: 4 },
  textoBloqueo: { color: '#ff6b6b', fontSize: 12, fontWeight: '600' },
  inputFila: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  botonAdjunto: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.eli.grayDark,
    borderWidth: 1, borderColor: Colors.eli.border,
    alignItems: 'center', justifyContent: 'center',
  },
  botonAdjuntoActivo: { borderColor: Colors.eli.primary, backgroundColor: '#0D2B2B' },
  botonAdjuntoTexto: { color: Colors.eli.primary, fontSize: 20 },
  input: {
    flex: 1, backgroundColor: Colors.eli.grayDark,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.eli.border,
    padding: 12, color: Colors.eli.white, fontSize: 15, maxHeight: 100,
  },
  botonEnviar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.eli.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  botonEnviarTexto: { color: Colors.eli.background, fontSize: 20, fontWeight: 'bold' },
});
