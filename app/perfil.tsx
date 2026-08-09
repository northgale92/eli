import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import { Colors } from '../constants/Colors';
import { Avatar } from '../components/Avatar';
import { obtenerUsuario, obtenerClavePublica, obtenerNombreVisible, obtenerFotoPerfil } from '../services/identidad';
import { obtenerSeguidos } from '../services/seguidos';
import { solicitarVerificacion, escucharVerificacion } from '../services/verificacion';

export default function Perfil() {
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [nombreVisible, setNombreVisible] = useState('');
  const [clavePublica, setClavePublica] = useState('');
  const [siguiendo, setSiguiendo] = useState(0);
  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null);
  const [verificado, setVerificado] = useState(false);
  const [estadoVerificacion, setEstadoVerificacion] = useState('sin_solicitud');

  // useFocusEffect (no useEffect) para recargar nombre/foto al volver de
  // editar-perfil.tsx, que es donde vive la edición real.
  useFocusEffect(
    useCallback(() => {
      let cancelado = false;
      (async () => {
        const [usuario, clave, seguidos, nombre, foto] = await Promise.all([
          obtenerUsuario(), obtenerClavePublica(), obtenerSeguidos(),
          obtenerNombreVisible(), obtenerFotoPerfil(),
        ]);
        if (cancelado) return;
        setNombreUsuario(usuario || 'sin_nombre');
        setClavePublica(clave || '');
        setSiguiendo(seguidos.length);
        setNombreVisible(nombre || usuario || '');
        setFotoPerfil(foto);
        if (usuario) {
          escucharVerificacion(usuario, (v, e) => {
            if (cancelado) return;
            setVerificado(v);
            setEstadoVerificacion(e);
          });
        }
      })();
      return () => { cancelado = true; };
    }, []),
  );

  const copiarClave = () => {
    console.log('Clave copiada:', clavePublica);
  };

  const solicitarVerif = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permiso.status !== 'granted') return;
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!resultado.canceled) {
      const res = await solicitarVerificacion(nombreUsuario, resultado.assets[0].uri);
      setEstadoVerificacion(res);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="Volver"
          accessibilityRole="button"
          style={styles.botonVolver}
        >
          <Text style={styles.textoVolver}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mi Perfil</Text>
      </View>

      <ScrollView style={styles.scroll}>
        <View style={styles.perfilSection}>
          <TouchableOpacity
            style={styles.avatarGrande}
            accessibilityLabel="Editar foto de perfil"
            accessibilityRole="button"
            onPress={() => router.push('/editar-perfil')}
          >
            <Avatar nombre={nombreVisible || nombreUsuario} fotoBase64={fotoPerfil} size={90} />
            <View style={styles.cameraBadge}>
              <Text style={styles.cameraIcon}>{'✉'}</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.nombreVisibleTexto}>{nombreVisible || nombreUsuario}</Text>
          <Text style={styles.nombreUsuario}>@{nombreUsuario}</Text>

          {verificado && (
            <Text style={styles.verificadoBadge}>✓ Periodista verificado</Text>
          )}
          {estadoVerificacion === 'pendiente' && (
            <Text style={styles.verificacionPendiente}>Verificación en proceso...</Text>
          )}

          <View style={styles.claveContainer}>
            <Text style={styles.claveLabel}>Clave pública</Text>
            <View style={styles.claveFila}>
              <Text style={styles.claveTexto} numberOfLines={1}>
                {clavePublica ? `${clavePublica.substring(0, 10)}...${clavePublica.substring(clavePublica.length - 6)}` : '—'}
              </Text>
              <TouchableOpacity
                style={styles.botonCopiar}
                onPress={copiarClave}
                accessibilityLabel="Copiar clave pública"
                accessibilityRole="button"
              >
                <Text style={styles.botonCopiarTexto}>Copiar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.estadisticasContainer}>
          <View style={styles.estadistica}>
            <Text style={styles.estadisticaNumero}>0</Text>
            <Text style={styles.estadisticaLabel}>Publicaciones</Text>
          </View>
          <View style={styles.estadisticaDivider} />
          <View style={styles.estadistica}>
            <Text style={styles.estadisticaNumero}>0</Text>
            <Text style={styles.estadisticaLabel}>Seguidores</Text>
          </View>
          <View style={styles.estadisticaDivider} />
          <View style={styles.estadistica}>
            <Text style={styles.estadisticaNumero}>{siguiendo}</Text>
            <Text style={styles.estadisticaLabel}>Siguiendo</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.botonEditar}
          accessibilityLabel="Editar perfil"
          accessibilityRole="button"
          onPress={() => router.push('/editar-perfil')}
        >
          <Text style={styles.botonEditarTexto}>Editar perfil</Text>
        </TouchableOpacity>

        {estadoVerificacion === 'sin_solicitud' && (
          <TouchableOpacity
            style={styles.botonVerificacion}
            accessibilityLabel="Solicitar verificación de periodista"
            accessibilityRole="button"
            onPress={solicitarVerif}
          >
            <Text style={styles.botonVerificacionTexto}>Solicitar verificación de periodista ✓</Text>
          </TouchableOpacity>
        )}

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
    padding: 16,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: Colors.eli.border,
  },
  botonVolver: {
    marginRight: 12,
  },
  textoVolver: {
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
  perfilSection: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  avatarGrande: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.eli.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  avatarTexto: {
    color: Colors.eli.background,
    fontWeight: 'bold',
    fontSize: 40,
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
  nombreVisibleTexto: {
    color: Colors.eli.white,
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 4,
  },
  nombreUsuario: {
    color: Colors.eli.grayLight,
    fontSize: 14,
    marginBottom: 20,
  },
  claveContainer: {
    width: '100%',
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.eli.border,
  },
  claveLabel: {
    color: Colors.eli.grayLight,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  claveFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  claveTexto: {
    color: Colors.eli.white,
    fontSize: 13,
    fontFamily: 'monospace',
    flex: 1,
    marginRight: 8,
  },
  botonCopiar: {
    backgroundColor: Colors.eli.primary,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  botonCopiarTexto: {
    color: Colors.eli.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  estadisticasContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.eli.grayDark,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    alignItems: 'center',
  },
  estadistica: {
    flex: 1,
    alignItems: 'center',
  },
  estadisticaNumero: {
    color: Colors.eli.white,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  estadisticaLabel: {
    color: Colors.eli.grayLight,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  estadisticaDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.eli.border,
  },
  botonEditar: {
    backgroundColor: Colors.eli.primary,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
  },
  botonEditarTexto: {
    color: Colors.eli.background,
    fontSize: 16,
    fontWeight: 'bold',
  },
  verificadoBadge: {
    color: Colors.eli.primary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 20,
  },
  verificacionPendiente: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    marginBottom: 20,
  },
  botonVerificacion: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.eli.primary,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 12,
  },
  botonVerificacionTexto: {
    color: Colors.eli.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
