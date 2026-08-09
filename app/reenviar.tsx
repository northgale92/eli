import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  cargarConversaciones, cargarMensajesLocal, enviarMensaje, enviarMensajeAudio,
  enviarUbicacion, enviarImagen, enviarVideo, enviarDocumento,
  type Conversacion, type Mensaje,
} from '../services/chat';
import {
  cargarGruposLocal, enviarMensajeGrupo, enviarMensajeAudioGrupo, enviarUbicacionGrupo,
  enviarImagenGrupo, enviarVideoGrupo, enviarDocumentoGrupo,
  type Grupo,
} from '../services/grupos';
import { obtenerIdentidad } from '../services/identidad';

type Destino =
  | { esGrupo: false; conv: Conversacion }
  | { esGrupo: true; grupo: Grupo };

// Reenvía un mensaje ya conocido (cargado del historial local del canal de
// origen) a otra conversación o grupo existente. Se trata como contenido
// nuevo: se vuelve a cifrar para el/los destinatario(s) NUEVO(s) a través del
// mismo pipeline enviarX/enviarXGrupo — el cifrado original es específico del
// par (o del fan-out) emisor→receptor original y no sirve para nadie más.
// Reenviar a un grupo reutiliza exactamente el mismo fan-out (un NaCl box por
// miembro) que ya usa el envío normal de grupo — ver services/grupos.ts.
export default function Reenviar() {
  const { mensajeId, canalOrigen } = useLocalSearchParams<{ mensajeId: string; canalOrigen: string }>();
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviandoA, setEnviandoA] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!canalOrigen || !mensajeId) { setCargando(false); return; }
      const [convs, gruposLocal, mensajesOrigen] = await Promise.all([
        cargarConversaciones(),
        cargarGruposLocal(),
        cargarMensajesLocal(canalOrigen),
      ]);
      setDestinos([
        ...convs.map((conv): Destino => ({ esGrupo: false, conv })),
        ...gruposLocal.map((grupo): Destino => ({ esGrupo: true, grupo })),
      ]);
      setMensaje(mensajesOrigen.find(m => m.id === mensajeId) ?? null);
      setCargando(false);
    })();
  }, [canalOrigen, mensajeId]);

  const reenviarA1a1 = async (
    destinatario: string, id: NonNullable<Awaited<ReturnType<typeof obtenerIdentidad>>>,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!mensaje) return { ok: false };
    switch (mensaje.tipo) {
      case 'audio':
        if (!mensaje.audioBase64) return { ok: false };
        return enviarMensajeAudio(
          mensaje.audioBase64, mensaje.duracionMs ?? 0,
          id.usuario, id.clavePublica, id.clavePrivada, destinatario, true,
        );
      case 'ubicacion':
        if (mensaje.lat == null || mensaje.lon == null) return { ok: false };
        return enviarUbicacion(
          mensaje.lat, mensaje.lon,
          id.usuario, id.clavePublica, id.clavePrivada, destinatario, true,
        );
      case 'imagen':
        if (!mensaje.archivoBase64) return { ok: false };
        return enviarImagen(
          mensaje.archivoBase64, mensaje.archivoMime ?? 'image/jpeg',
          mensaje.ancho ?? 0, mensaje.alto ?? 0, mensaje.archivoTamano ?? 0,
          id.usuario, id.clavePublica, id.clavePrivada, destinatario, true,
        );
      case 'video':
        if (!mensaje.archivoBase64) return { ok: false };
        return enviarVideo(
          mensaje.archivoBase64, mensaje.miniaturaBase64, mensaje.archivoMime ?? 'video/mp4',
          mensaje.duracionMs ?? 0, mensaje.ancho ?? 0, mensaje.alto ?? 0, mensaje.archivoTamano ?? 0,
          id.usuario, id.clavePublica, id.clavePrivada, destinatario, true,
        );
      case 'documento':
        if (!mensaje.archivoBase64) return { ok: false };
        return enviarDocumento(
          mensaje.archivoBase64, mensaje.archivoNombre ?? 'documento', mensaje.archivoMime ?? 'application/octet-stream',
          mensaje.archivoTamano ?? 0,
          id.usuario, id.clavePublica, id.clavePrivada, destinatario, true,
        );
      default:
        return enviarMensaje(
          mensaje.texto, id.usuario, id.clavePublica, id.clavePrivada, destinatario, undefined, true,
        );
    }
  };

  const reenviarAGrupo = async (
    grupo: Grupo, id: NonNullable<Awaited<ReturnType<typeof obtenerIdentidad>>>,
  ): Promise<{ ok: boolean }> => {
    if (!mensaje) return { ok: false };
    switch (mensaje.tipo) {
      case 'audio':
        if (!mensaje.audioBase64) return { ok: false };
        return enviarMensajeAudioGrupo(
          mensaje.audioBase64, mensaje.duracionMs ?? 0,
          id.usuario, id.clavePrivada, grupo.id, grupo.participantes, true,
        );
      case 'ubicacion':
        if (mensaje.lat == null || mensaje.lon == null) return { ok: false };
        return enviarUbicacionGrupo(
          mensaje.lat, mensaje.lon,
          id.usuario, id.clavePrivada, grupo.id, grupo.participantes, true,
        );
      case 'imagen':
        if (!mensaje.archivoBase64) return { ok: false };
        return enviarImagenGrupo(
          mensaje.archivoBase64, mensaje.archivoMime ?? 'image/jpeg',
          mensaje.ancho ?? 0, mensaje.alto ?? 0, mensaje.archivoTamano ?? 0,
          id.usuario, id.clavePrivada, grupo.id, grupo.participantes, true,
        );
      case 'video':
        if (!mensaje.archivoBase64) return { ok: false };
        return enviarVideoGrupo(
          mensaje.archivoBase64, mensaje.miniaturaBase64, mensaje.archivoMime ?? 'video/mp4',
          mensaje.duracionMs ?? 0, mensaje.ancho ?? 0, mensaje.alto ?? 0, mensaje.archivoTamano ?? 0,
          id.usuario, id.clavePrivada, grupo.id, grupo.participantes, true,
        );
      case 'documento':
        if (!mensaje.archivoBase64) return { ok: false };
        return enviarDocumentoGrupo(
          mensaje.archivoBase64, mensaje.archivoNombre ?? 'documento', mensaje.archivoMime ?? 'application/octet-stream',
          mensaje.archivoTamano ?? 0,
          id.usuario, id.clavePrivada, grupo.id, grupo.participantes, true,
        );
      default:
        return enviarMensajeGrupo(
          mensaje.texto, id.usuario, id.clavePrivada, grupo.id, grupo.participantes, true,
        );
    }
  };

  const reenviarA = async (destino: Destino) => {
    if (!mensaje || enviandoA) return;
    const id = await obtenerIdentidad();
    if (!id) return;

    const clave = destino.esGrupo ? destino.grupo.id : destino.conv.contraparte;
    setEnviandoA(clave);
    try {
      const resultado = destino.esGrupo
        ? await reenviarAGrupo(destino.grupo, id)
        : await reenviarA1a1(destino.conv.contraparte, id);

      if (!resultado.ok) {
        Alert.alert('No se pudo reenviar', 'Ocurrió un problema al reenviar el mensaje.');
        return;
      }
      if (destino.esGrupo) {
        router.replace({ pathname: '/grupo', params: { grupoId: destino.grupo.id, nombre: destino.grupo.nombre } });
      } else {
        router.replace({ pathname: '/conversacion', params: { destinatario: destino.conv.contraparte } });
      }
    } finally {
      setEnviandoA(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Cancelar" accessibilityRole="button">
          <Text style={styles.headerBoton}>Cancelar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reenviar a…</Text>
        <View style={{ width: 64 }} />
      </View>

      {mensaje && (
        <View style={styles.previewMensaje}>
          <Text style={styles.previewTexto} numberOfLines={2}>{mensaje.texto}</Text>
        </View>
      )}

      {cargando ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.eli.primary} />
      ) : (
        <ScrollView style={styles.lista}>
          {destinos.length === 0 && (
            <Text style={styles.vacioTexto}>No tienes conversaciones ni grupos para reenviar.</Text>
          )}
          {destinos
            .filter(d => d.esGrupo || d.conv.id !== canalOrigen)
            .map(d => {
              const clave = d.esGrupo ? d.grupo.id : d.conv.id;
              const etiqueta = d.esGrupo ? d.grupo.nombre : d.conv.contraparte;
              const enviandoClave = d.esGrupo ? d.grupo.id : d.conv.contraparte;
              return (
                <TouchableOpacity
                  key={clave}
                  style={styles.fila}
                  onPress={() => reenviarA(d)}
                  disabled={!!enviandoA}
                  accessibilityLabel={`Reenviar a ${etiqueta}`}
                  accessibilityRole="button"
                >
                  <View style={[styles.avatar, d.esGrupo && styles.avatarGrupo]}>
                    <Text style={styles.avatarText}>{d.esGrupo ? '👥' : etiqueta[0].toUpperCase()}</Text>
                  </View>
                  <Text style={styles.usuario}>{etiqueta}</Text>
                  {enviandoA === enviandoClave && <ActivityIndicator color={Colors.eli.primary} />}
                </TouchableOpacity>
              );
            })}
        </ScrollView>
      )}
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
  headerBoton: { color: Colors.eli.grayLight, fontSize: 16, fontWeight: '500', width: 64 },
  headerTitle: { color: Colors.eli.white, fontSize: 18, fontWeight: '600' },
  previewMensaje: {
    margin: 16, padding: 12, borderRadius: 10,
    backgroundColor: Colors.eli.grayDark, borderWidth: 1, borderColor: Colors.eli.border,
  },
  previewTexto: { color: Colors.eli.grayLight, fontSize: 13 },
  lista: { flex: 1 },
  vacioTexto: { color: Colors.eli.grayLight, textAlign: 'center', marginTop: 40, fontSize: 14 },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.eli.border,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.eli.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarGrupo: { backgroundColor: Colors.eli.grayDark, borderWidth: 1, borderColor: Colors.eli.border },
  avatarText: { color: Colors.eli.background, fontWeight: 'bold', fontSize: 18 },
  usuario: { color: Colors.eli.white, fontSize: 15, fontWeight: '600', flex: 1 },
});
