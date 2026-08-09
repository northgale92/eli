import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { router } from 'expo-router';
import { useState, useEffect } from 'react';
import { Colors } from '../constants/Colors';
import { Avatar } from '../components/Avatar';
import {
  obtenerUsuario, obtenerNombreVisible, obtenerFotoPerfil, guardarPerfilLocal,
} from '../services/identidad';
import { publicarPerfil } from '../services/gun';

// Lado máximo del avatar comprimido — mucho más pequeño que las imágenes de
// chat (LIMITE_IMAGEN_LADO_PX=1280 en services/chat.ts) porque este archivo se
// re-publica en Gun para CADA contacto que consulte el perfil, no una sola vez.
const LADO_AVATAR_PX = 320;

export default function EditarPerfil() {
  const [usuario, setUsuario] = useState('');
  const [nombre, setNombre] = useState('');
  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const [handle, nombreVisible, foto] = await Promise.all([
        obtenerUsuario(), obtenerNombreVisible(), obtenerFotoPerfil(),
      ]);
      setUsuario(handle ?? '');
      setNombre(nombreVisible ?? handle ?? '');
      setFotoPerfil(foto);
      setCargando(false);
    })();
  }, []);

  const cambiarFoto = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permiso.status !== 'granted') return;
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (resultado.canceled || !resultado.assets[0]) return;
    try {
      const manipulada = await ImageManipulator.manipulateAsync(
        resultado.assets[0].uri,
        [{ resize: { width: LADO_AVATAR_PX, height: LADO_AVATAR_PX } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (manipulada.base64) setFotoPerfil(manipulada.base64);
    } catch {
      Alert.alert('No se pudo procesar la imagen', 'Inténtalo con otra foto.');
    }
  };

  const guardar = async () => {
    if (!nombre.trim() || !usuario || guardando) return;
    setGuardando(true);
    try {
      const nombreFinal = nombre.trim();
      await guardarPerfilLocal(nombreFinal, fotoPerfil);
      publicarPerfil(usuario, { nombreVisible: nombreFinal, fotoPerfil });
      router.back();
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.eli.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="Cancelar"
          accessibilityRole="button"
          disabled={guardando}
        >
          <Text style={styles.headerBoton}>Cancelar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Editar Perfil</Text>
        <TouchableOpacity
          onPress={guardar}
          accessibilityLabel="Guardar cambios"
          accessibilityRole="button"
          disabled={!nombre.trim() || guardando}
        >
          {guardando
            ? <ActivityIndicator color={Colors.eli.primary} size="small" />
            : <Text style={styles.headerBotonGuardar}>Guardar</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll}>
        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={styles.avatarGrande}
            accessibilityLabel="Cambiar foto de perfil"
            accessibilityRole="button"
            onPress={cambiarFoto}
          >
            <Avatar nombre={nombre || usuario} fotoBase64={fotoPerfil} size={90} />
            <View style={styles.cameraBadge}>
              <Text style={styles.cameraIcon}>{'📷'}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={cambiarFoto}>
            <Text style={styles.cambiarFotoTexto}>Cambiar foto</Text>
          </TouchableOpacity>
          {fotoPerfil && (
            <TouchableOpacity onPress={() => setFotoPerfil(null)}>
              <Text style={styles.quitarFotoTexto}>Quitar foto</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.campoContainer}>
          <Text style={styles.campoLabel}>Nombre visible</Text>
          <TextInput
            style={styles.input}
            value={nombre}
            onChangeText={setNombre}
            placeholder="Tu nombre visible"
            placeholderTextColor="#5A5A6E"
            maxLength={40}
          />
          <Text style={styles.campoAyuda}>
            Es el nombre que verán tus contactos. Tu @{usuario} no cambia.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.botonGuardar, (!nombre.trim() || guardando) && { opacity: 0.5 }]}
          onPress={guardar}
          disabled={!nombre.trim() || guardando}
          accessibilityLabel="Guardar cambios"
          accessibilityRole="button"
        >
          <Text style={styles.botonGuardarTexto}>{guardando ? 'Guardando…' : 'Guardar cambios'}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.eli.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: Colors.eli.border,
  },
  headerBoton: {
    color: Colors.eli.grayLight,
    fontSize: 16,
    fontWeight: '500',
  },
  headerBotonGuardar: {
    color: Colors.eli.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    color: Colors.eli.white,
    fontSize: 18,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  avatarGrande: {
    width: 90,
    height: 90,
    borderRadius: 45,
    marginBottom: 12,
    position: 'relative',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.eli.grayDark,
    borderWidth: 2,
    borderColor: Colors.eli.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIcon: {
    fontSize: 14,
  },
  cambiarFotoTexto: {
    color: Colors.eli.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  quitarFotoTexto: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    marginTop: 6,
  },
  campoContainer: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  campoLabel: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.eli.grayDark,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    borderRadius: 12,
    padding: 14,
    color: Colors.eli.white,
    fontSize: 16,
  },
  campoAyuda: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    marginTop: 8,
  },
  botonGuardar: {
    backgroundColor: Colors.eli.primary,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
  },
  botonGuardarTexto: {
    color: Colors.eli.background,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
