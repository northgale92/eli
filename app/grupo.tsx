import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert, Image, ActivityIndicator, Linking,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { router, useLocalSearchParams } from 'expo-router';
import { Audio, Video, ResizeMode } from 'expo-av';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  cargarGruposLocal, cargarMensajesGrupoLocal, enviarMensajeGrupo,
  suscribirMensajesGrupo, marcarGrupoLeido, borrarGrupoLocal,
  type MensajeGrupo, type Grupo,
} from '../services/grupos';
import { obtenerIdentidad } from '../services/identidad';

function formatoHora(ts: number): string {
  return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatoTamano(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconoDocumento(mime?: string): string {
  if (!mime) return '📄';
  if (mime.includes('pdf')) return '📕';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return '🗜️';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('sheet') || mime.includes('excel')) return '📊';
  return '📄';
}

export default function GrupoChat() {
  const insets = useSafeAreaInsets();
  const { grupoId, nombre } = useLocalSearchParams<{ grupoId: string; nombre: string }>();
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [mensajes, setMensajes] = useState<MensajeGrupo[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [miId, setMiId] = useState('');
  const [reproduciendoId, setReproduciendoId] = useState<string | null>(null);
  const [videoActivoId, setVideoActivoId] = useState<string | null>(null);
  const [abriendoDocId, setAbriendoDocId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const sonidoRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    if (!grupoId) return;
    let cancelar: (() => void) | null = null;

    (async () => {
      const id = await obtenerIdentidad();
      if (!id) return;
      setMiId(id.usuario);

      const lista = await cargarGruposLocal();
      const g = lista.find(x => x.id === grupoId) ?? null;
      setGrupo(g);

      const existentes = await cargarMensajesGrupoLocal(grupoId);
      setMensajes(existentes);
      await marcarGrupoLeido(grupoId);

      if (g) {
        cancelar = suscribirMensajesGrupo(grupoId, id.usuario, id.clavePrivada, (msg) => {
          setMensajes(prev => {
            if (prev.find(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        });
      }
    })();

    return () => {
      cancelar?.();
      sonidoRef.current?.unloadAsync().catch(() => {});
    };
  }, [grupoId]);

  useEffect(() => {
    if (mensajes.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [mensajes.length]);

  const enviar = useCallback(async () => {
    if (!texto.trim() || enviando || !miId || !grupo || !grupoId) return;
    const textoEnviar = texto.trim();
    setTexto('');
    setEnviando(true);

    const id = await obtenerIdentidad();
    if (!id) { setEnviando(false); return; }

    const resultado = await enviarMensajeGrupo(textoEnviar, id.usuario, id.clavePrivada, grupoId, grupo.participantes);
    if (resultado.ok) {
      setMensajes(prev => [...prev, {
        id: `local_${Date.now()}`, texto: textoEnviar, de: id.usuario, hora: Date.now(), mio: true, tipo: 'texto',
      }]);
    } else {
      setTexto(textoEnviar);
    }
    setEnviando(false);
  }, [texto, enviando, miId, grupo, grupoId]);

  const confirmarSalir = () => {
    if (!grupoId) return;
    Alert.alert(
      'Salir del grupo',
      'Se eliminará el historial local de este grupo en este dispositivo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: async () => {
            await borrarGrupoLocal(grupoId);
            router.back();
          },
        },
      ],
    );
  };

  // ─── Reproducción de notas de voz ──────────────────────────────────────────

  const alternarReproduccion = async (item: MensajeGrupo) => {
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

  // Igual que abrirDocumento en app/conversacion.tsx: escribe el base64 ya
  // descifrado a un archivo temporal y delega en el selector nativo del SO.
  const abrirDocumento = async (item: MensajeGrupo) => {
    if (!item.archivoBase64 || abriendoDocId) return;
    setAbriendoDocId(item.id);
    try {
      const disponible = await Sharing.isAvailableAsync();
      if (!disponible) {
        Alert.alert('No disponible', 'Este dispositivo no admite abrir/compartir archivos.');
        return;
      }
      const nombreArchivo = item.archivoNombre?.trim() || `documento_${item.id}`;
      const destino = new File(Paths.cache, nombreArchivo);
      destino.create({ overwrite: true, intermediates: true });
      destino.write(item.archivoBase64, { encoding: 'base64' });
      await Sharing.shareAsync(destino.uri, { mimeType: item.archivoMime, dialogTitle: nombreArchivo });
    } catch {
      Alert.alert('No se pudo abrir el documento', 'Ocurrió un problema al preparar el archivo.');
    } finally {
      setAbriendoDocId(null);
    }
  };

  const manejarTapMensaje = (item: MensajeGrupo) => {
    if (item.tipo === 'audio') { alternarReproduccion(item); return; }
    if (item.tipo === 'ubicacion') {
      if (item.lat != null && item.lon != null) {
        Linking.openURL(`https://www.google.com/maps?q=${item.lat},${item.lon}`);
      }
      return;
    }
    if (item.tipo === 'video') { setVideoActivoId(prev => (prev === item.id ? null : item.id)); return; }
    if (item.tipo === 'documento') { void abrirDocumento(item); return; }
  };

  const renderMensaje = ({ item }: { item: MensajeGrupo }) => (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => manejarTapMensaje(item)}
      style={[styles.burbuja, item.mio ? styles.burbujaPropia : styles.burbujaAjena]}
    >
      {!item.mio && <Text style={styles.remitente}>{item.de}</Text>}
      {item.reenviado && <Text style={styles.reenviadoTexto}>↪ Reenviado</Text>}

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
            <Text style={[styles.burbujaTexto, item.mio ? styles.textoPropio : styles.textoAjeno]} numberOfLines={1}>
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

      <Text style={styles.burbujaHora}>{formatoHora(item.hora)}</Text>
    </TouchableOpacity>
  );

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
        <View style={styles.avatarPequeno}>
          <Text style={styles.avatarTexto}>{(nombre ?? '?')[0].toUpperCase()}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerNombre}>{nombre ?? 'Grupo'}</Text>
          <Text style={styles.headerEstado}>
            {grupo ? `${grupo.participantes.length} miembros · Cifrado E2E` : 'Grupo'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={confirmarSalir}
          style={styles.botonSalir}
          accessibilityLabel="Salir del grupo"
          accessibilityRole="button"
        >
          <Text style={styles.botonSalirTexto}>⋯</Text>
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
            <Text style={styles.bannerTitulo}>Grupo cifrado de extremo a extremo</Text>
            <Text style={styles.bannerTexto}>
              Cada mensaje se cifra por separado para cada miembro. Ni ELI, ni ningún servidor puede leerlos.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.sinMensajes}>Sin mensajes aún. ¡Escribe el primero!</Text>
        }
      />

      <View style={[styles.inputArea, { paddingBottom: 12 + insets.bottom }]}>
        <TextInput
          style={styles.input}
          placeholder="Mensaje cifrado..."
          placeholderTextColor={Colors.eli.grayLight}
          accessibilityLabel="Escribe un mensaje"
          value={texto}
          onChangeText={setTexto}
          multiline
          returnKeyType="send"
          onSubmitEditing={enviar}
        />
        <TouchableOpacity
          style={[styles.botonEnviar, (!texto.trim() || enviando) && { opacity: 0.4 }]}
          accessibilityLabel="Enviar mensaje"
          accessibilityRole="button"
          onPress={enviar}
          disabled={!texto.trim() || enviando}
        >
          <Text style={styles.botonEnviarTexto}>{enviando ? '…' : 'Enviar'}</Text>
        </TouchableOpacity>
      </View>
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
  botonSalir: { paddingHorizontal: 8 },
  botonSalirTexto: { color: Colors.eli.grayLight, fontSize: 22 },
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
  remitente: { fontSize: 11, fontWeight: '700', color: Colors.eli.primary, marginBottom: 2 },
  reenviadoTexto: { fontSize: 11, color: Colors.eli.grayLight, fontStyle: 'italic', marginBottom: 4 },
  burbujaTexto: { fontSize: 14, lineHeight: 20 },
  textoPropio: { color: Colors.eli.background },
  textoAjeno: { color: Colors.eli.white },
  burbujaHora: { fontSize: 10, color: Colors.eli.grayLight, textAlign: 'right', marginTop: 4 },
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
  botonEnviar: {
    backgroundColor: Colors.eli.primary, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  botonEnviarTexto: { color: Colors.eli.background, fontWeight: 'bold', fontSize: 14 },
});
