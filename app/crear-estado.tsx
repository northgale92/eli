import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Image, Alert, ActivityIndicator, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { Colors } from '../constants/Colors';
import { obtenerIdentidad } from '../services/identidad';
import {
  publicarEstadoTexto, publicarEstadoImagen, publicarEstadoVideo, obtenerContactosParaEstados,
  LIMITE_ESTADO_IMAGEN_LADO_PX, LIMITE_ESTADO_VIDEO_BYTES, LIMITE_ESTADO_VIDEO_DURACION_S,
} from '../services/estados';

const COLORES_FONDO = ['#00B5A0', '#E05555', '#3B5AE0', '#8A4FE0', '#E0A200', '#2c2c2c'];

// Umbral a partir del cual avisamos del coste de fan-out (ver nota de
// cabecera en services/estados.ts): un estado con foto/vídeo se cifra y
// escribe una vez POR CONTACTO, así que audiencias grandes son más lentas/
// menos fiables por P2P puro que un mensaje 1:1.
const UMBRAL_AVISO_AUDIENCIA = 15;

type Modo = 'texto' | 'media';

export default function CrearEstado() {
  const [modo, setModo] = useState<Modo>('texto');
  const [texto, setTexto] = useState('');
  const [colorFondo, setColorFondo] = useState(COLORES_FONDO[0]);
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [textoSuperpuesto, setTextoSuperpuesto] = useState('');
  const [publicando, setPublicando] = useState(false);

  const elegirDesdeGaleria = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permiso.status !== 'granted') return;
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
      videoMaxDuration: LIMITE_ESTADO_VIDEO_DURACION_S,
    });
    if (resultado.canceled || !resultado.assets[0]) return;
    setAsset(resultado.assets[0]);
    setModo('media');
  };

  const elegirDesdeCamara = async () => {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (permiso.status !== 'granted') return;
    const resultado = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
      videoMaxDuration: LIMITE_ESTADO_VIDEO_DURACION_S,
    });
    if (resultado.canceled || !resultado.assets[0]) return;
    setAsset(resultado.assets[0]);
    setModo('media');
  };

  const confirmarAudienciaGrande = (n: number): Promise<boolean> => {
    if (n < UMBRAL_AVISO_AUDIENCIA) return Promise.resolve(true);
    return new Promise((resolve) => {
      Alert.alert(
        'Audiencia grande',
        `Vas a enviar este estado a ${n} contactos. Al ser una red P2P sin servidor de medios, esto puede tardar más o fallar para algunos contactos con foto/vídeo. ¿Continuar?`,
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Publicar de todas formas', onPress: () => resolve(true) },
        ],
      );
    });
  };

  const publicarTexto = async () => {
    if (!texto.trim() || publicando) return;
    setPublicando(true);
    try {
      const id = await obtenerIdentidad();
      if (!id) return;
      const contactos = await obtenerContactosParaEstados();
      const resultado = await publicarEstadoTexto(texto.trim(), colorFondo, id.usuario, id.clavePrivada, contactos);
      if (resultado.ok) router.back();
    } finally {
      setPublicando(false);
    }
  };

  const publicarMedia = async () => {
    if (!asset || publicando) return;
    setPublicando(true);
    try {
      const id = await obtenerIdentidad();
      if (!id) return;
      const contactos = await obtenerContactosParaEstados();
      if (!(await confirmarAudienciaGrande(contactos.length))) return;

      let resultado;
      if (asset.type === 'video') {
        const archivo = new File(asset.uri);
        if (archivo.size > LIMITE_ESTADO_VIDEO_BYTES) {
          Alert.alert(
            'Vídeo demasiado grande',
            `Pesa ${(archivo.size / (1024 * 1024)).toFixed(1)} MB. El límite para un estado (se envía a cada contacto) es ${LIMITE_ESTADO_VIDEO_BYTES / (1024 * 1024)} MB.`,
          );
          return;
        }
        const base64 = await archivo.base64();
        resultado = await publicarEstadoVideo(
          base64, asset.mimeType ?? 'video/mp4', Math.round(asset.duration ?? 0),
          textoSuperpuesto.trim() || undefined, id.usuario, id.clavePrivada, contactos,
        );
      } else {
        const manipulada = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: LIMITE_ESTADO_IMAGEN_LADO_PX } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        if (!manipulada.base64) { Alert.alert('No se pudo procesar la imagen'); return; }
        resultado = await publicarEstadoImagen(
          manipulada.base64, 'image/jpeg',
          textoSuperpuesto.trim() || undefined, id.usuario, id.clavePrivada, contactos,
        );
      }

      if (!resultado.ok) {
        Alert.alert('No se pudo publicar', 'Ocurrió un problema al publicar el estado.');
        return;
      }
      router.back();
    } catch {
      Alert.alert('No se pudo publicar', 'Ocurrió un problema al procesar el archivo.');
    } finally {
      setPublicando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Cancelar" accessibilityRole="button">
          <Text style={styles.headerBoton}>Cancelar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nuevo estado</Text>
        <View style={{ width: 64 }} />
      </View>

      {modo === 'texto' ? (
        <View style={[styles.lienzo, { backgroundColor: colorFondo }]}>
          <TextInput
            style={styles.inputTexto}
            placeholder="Escribe un estado…"
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={texto}
            onChangeText={setTexto}
            multiline
            autoFocus
            maxLength={200}
            accessibilityLabel="Texto del estado"
          />
        </View>
      ) : asset ? (
        <View style={styles.lienzo}>
          {asset.type === 'video' ? (
            <View style={styles.videoPreview}>
              <Text style={styles.videoPreviewTexto}>🎥 Vídeo listo · {Math.round(asset.duration ?? 0)}ms</Text>
            </View>
          ) : (
            <Image source={{ uri: asset.uri }} style={styles.imagenPreview} resizeMode="contain" />
          )}
          <TextInput
            style={styles.inputSuperpuesto}
            placeholder="Añadir texto…"
            placeholderTextColor="rgba(255,255,255,0.7)"
            value={textoSuperpuesto}
            onChangeText={setTextoSuperpuesto}
            maxLength={120}
            accessibilityLabel="Texto superpuesto"
          />
        </View>
      ) : (
        <View style={styles.vacioContenedor}>
          <Text style={styles.vacioTexto}>Elige una foto o vídeo, o escribe un estado de texto.</Text>
        </View>
      )}

      {modo === 'texto' && (
        <View style={styles.coloresFila}>
          {COLORES_FONDO.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.colorSwatch, { backgroundColor: c }, c === colorFondo && styles.colorSwatchActivo]}
              onPress={() => setColorFondo(c)}
              accessibilityLabel={`Color de fondo ${c}`}
              accessibilityRole="button"
            />
          ))}
        </View>
      )}

      <View style={styles.barraInferior}>
        <TouchableOpacity
          style={[styles.opcion, modo === 'texto' && styles.opcionActiva]}
          onPress={() => setModo('texto')}
          accessibilityLabel="Estado de texto"
          accessibilityRole="button"
          disabled={publicando}
        >
          <Text style={styles.opcionTexto}>Aa Texto</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.opcion}
          onPress={elegirDesdeGaleria}
          accessibilityLabel="Elegir de la galería"
          accessibilityRole="button"
          disabled={publicando}
        >
          <Text style={styles.opcionTexto}>🖼 Galería</Text>
        </TouchableOpacity>
        {Platform.OS !== 'web' && (
          <TouchableOpacity
            style={styles.opcion}
            onPress={elegirDesdeCamara}
            accessibilityLabel="Tomar foto o vídeo"
            accessibilityRole="button"
            disabled={publicando}
          >
            <Text style={styles.opcionTexto}>📷 Cámara</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[
          styles.botonPublicar,
          ((modo === 'texto' && !texto.trim()) || (modo === 'media' && !asset) || publicando) && { opacity: 0.4 },
        ]}
        onPress={modo === 'texto' ? publicarTexto : publicarMedia}
        disabled={(modo === 'texto' ? !texto.trim() : !asset) || publicando}
        accessibilityLabel="Publicar estado"
        accessibilityRole="button"
      >
        {publicando
          ? <ActivityIndicator color={Colors.eli.background} />
          : <Text style={styles.botonPublicarTexto}>Publicar estado</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
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
  lienzo: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  inputTexto: {
    color: Colors.eli.white, fontSize: 26, fontWeight: '600', textAlign: 'center',
    width: '100%', maxHeight: '80%',
  },
  imagenPreview: { width: '100%', height: '100%' },
  videoPreview: {
    width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.eli.grayDark, borderRadius: 12,
  },
  videoPreviewTexto: { color: Colors.eli.white, fontSize: 16 },
  inputSuperpuesto: {
    position: 'absolute', bottom: 24, left: 24, right: 24,
    color: Colors.eli.white, fontSize: 18, fontWeight: '600', textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, padding: 10,
  },
  vacioContenedor: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  vacioTexto: { color: Colors.eli.grayLight, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  coloresFila: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingVertical: 12 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  colorSwatchActivo: { borderColor: Colors.eli.white },
  barraInferior: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.eli.border,
  },
  opcion: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  opcionActiva: { backgroundColor: 'rgba(0,201,177,0.15)' },
  opcionTexto: { color: Colors.eli.white, fontSize: 14, fontWeight: '600' },
  botonPublicar: {
    backgroundColor: Colors.eli.primary, margin: 16, borderRadius: 25,
    paddingVertical: 14, alignItems: 'center',
  },
  botonPublicarTexto: { color: Colors.eli.background, fontSize: 16, fontWeight: 'bold' },
});
