import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Colors } from '../constants/Colors';
import { obtenerIdentidad } from '../services/identidad';
import {
  cargarEstadosPropios, cargarEstadosRecibidos, marcarEstadoVisto, marcarVistoLocalmente, suscribirVistoPor,
  type Estado,
} from '../services/estados';

const DURACION_TEXTO_IMAGEN_MS = 5000;

// Ventana de gracia tras montar en la que se ignora un toque sobre el
// contenido: en Android, el mismo toque que abre esta pantalla desde el
// círculo de "Ver estado de X" puede llegar como onResponderRelease al
// TouchableOpacity de contenido de esta pantalla recién montada bajo el
// mismo dedo (touch "fantasma" del mismo gesto). Sin este guard, con un
// único estado eso dispara siguiente() -> router.back() casi al instante,
// dando la impresión de que la pantalla "rebota" y nunca llega a mostrarse.
// Confirmado con logging en dispositivo real (Samsung SM-A057G): el mismo
// toque generaba un onResponderRelease -> onPress en esta pantalla a los
// pocos milisegundos de montar, con indice=0 y un único estado disponible.
const VENTANA_IGNORAR_TOQUE_MS = 400;

export default function VerEstado() {
  const { autorId } = useLocalSearchParams<{ autorId: string }>();
  const [miId, setMiId] = useState('');
  const [estados, setEstados] = useState<Estado[]>([]);
  const [indice, setIndice] = useState(0);
  const [vistoPor, setVistoPor] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const montadoEnRef = useRef(Date.now());

  const esPropio = !!miId && autorId === miId;
  const actual = estados[indice];

  useEffect(() => {
    (async () => {
      const id = await obtenerIdentidad();
      if (!id || !autorId) return;
      setMiId(id.usuario);

      const lista = autorId === id.usuario
        ? await cargarEstadosPropios()
        : await cargarEstadosRecibidos([autorId]);
      lista.sort((a, b) => a.creadoEn - b.creadoEn);
      if (lista.length === 0) { router.back(); return; }
      setEstados(lista);
    })();
  }, [autorId]);

  const siguiente = useCallback(() => {
    if (indice + 1 >= estados.length) {
      router.back();
    } else {
      setIndice(indice + 1);
    }
  }, [indice, estados.length]);

  const avanzarPorToque = useCallback(() => {
    if (Date.now() - montadoEnRef.current < VENTANA_IGNORAR_TOQUE_MS) return;
    siguiente();
  }, [siguiente]);

  // Marca "visto" (si no es propio) y programa el avance automático.
  useEffect(() => {
    if (!actual || !miId) return;
    if (!esPropio) marcarEstadoVisto(actual.autor, actual.id, miId);
    marcarVistoLocalmente(actual.id);

    if (timerRef.current) clearTimeout(timerRef.current);
    const duracion = actual.tipo === 'video' && actual.duracionMs ? actual.duracionMs : DURACION_TEXTO_IMAGEN_MS;
    timerRef.current = setTimeout(siguiente, duracion);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [actual, esPropio, miId, siguiente]);

  // Solo el autor consulta quién ha visto su estado.
  useEffect(() => {
    if (!esPropio || !actual) return;
    setVistoPor([]);
    const cancelar = suscribirVistoPor(actual.autor, actual.id, (usuario) => {
      setVistoPor(prev => (prev.includes(usuario) ? prev : [...prev, usuario]));
    });
    return cancelar;
  }, [esPropio, actual]);

  if (!actual) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <View style={styles.segmentosFila}>
        {estados.map((e, i) => (
          <View key={e.id} style={styles.segmentoFondo}>
            <View style={[styles.segmentoRelleno, i <= indice && styles.segmentoLleno]} />
          </View>
        ))}
      </View>

      <View style={styles.header}>
        <Text style={styles.autorTexto}>{esPropio ? 'Tu estado' : autorId}</Text>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Cerrar" accessibilityRole="button">
          <Text style={styles.cerrarTexto}>✕</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.contenido} activeOpacity={1} onPress={avanzarPorToque}>
        {actual.tipo === 'texto' ? (
          <View style={[styles.lienzoTexto, { backgroundColor: actual.colorFondo || Colors.eli.grayDark }]}>
            <Text style={styles.textoEstado}>{actual.texto}</Text>
          </View>
        ) : actual.tipo === 'imagen' && actual.archivoBase64 ? (
          <>
            <Image
              source={{ uri: `data:${actual.archivoMime ?? 'image/jpeg'};base64,${actual.archivoBase64}` }}
              style={styles.media}
              resizeMode="contain"
            />
            {!!actual.texto && <Text style={styles.superpuestoTexto}>{actual.texto}</Text>}
          </>
        ) : actual.tipo === 'video' && actual.archivoBase64 ? (
          <>
            <Video
              source={{ uri: `data:${actual.archivoMime ?? 'video/mp4'};base64,${actual.archivoBase64}` }}
              style={styles.media}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
            />
            {!!actual.texto && <Text style={styles.superpuestoTexto}>{actual.texto}</Text>}
          </>
        ) : null}
      </TouchableOpacity>

      {esPropio && (
        <TouchableOpacity
          style={styles.vistoPorBarra}
          onPress={() => Alert.alert('Visto por', vistoPor.length ? vistoPor.join('\n') : 'Aún nadie lo ha visto.')}
          accessibilityLabel={`Visto por ${vistoPor.length} contactos`}
          accessibilityRole="button"
        >
          <Text style={styles.vistoPorTexto}>👁 Visto por {vistoPor.length}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  segmentosFila: { flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingTop: 50, marginBottom: 8 },
  segmentoFondo: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  segmentoRelleno: { flex: 1, backgroundColor: 'transparent' },
  segmentoLleno: { backgroundColor: Colors.eli.primary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8,
  },
  autorTexto: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cerrarTexto: { color: '#fff', fontSize: 22 },
  contenido: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lienzoTexto: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', padding: 24 },
  textoEstado: { color: '#fff', fontSize: 26, fontWeight: '600', textAlign: 'center' },
  media: { width: '100%', height: '100%' },
  superpuestoTexto: {
    position: 'absolute', bottom: 40, left: 24, right: 24,
    color: '#fff', fontSize: 18, fontWeight: '600', textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, padding: 10,
  },
  vistoPorBarra: { padding: 16, alignItems: 'center' },
  vistoPorTexto: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
