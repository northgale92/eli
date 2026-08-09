import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors } from '../constants/Colors';
import { router } from 'expo-router';
import { useState } from 'react';
import { seguirUsuario, dejarDeSeguir, estaSiguiendo } from '../services/seguidos';
import { obtenerUsuario } from '../services/identidad';

export default function BuscarUsuario() {
  const [busqueda, setBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [siguiendo, setSiguiendo] = useState(false);
  const [error, setError] = useState('');

  const buscar = async () => {
    const termino = busqueda.replace('@', '').trim().toLowerCase();
    if (termino.length < 3) {
      setError('Escribe al menos 3 caracteres');
      return;
    }
    setBuscando(true);
    setError('');
    setResultado(null);
    const miUsuario = await obtenerUsuario();
    if (termino === miUsuario) {
      setError('Este eres tú');
      setBuscando(false);
      return;
    }
    setTimeout(async () => {
      setResultado(termino);
      const yaSigue = await estaSiguiendo(termino);
      setSiguiendo(yaSigue);
      setBuscando(false);
    }, 600);
  };

  const toggleSeguir = async () => {
    if (!resultado) return;
    if (siguiendo) {
      await dejarDeSeguir(resultado);
      setSiguiendo(false);
    } else {
      await seguirUsuario(resultado);
      setSiguiendo(true);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.botonVolver}
          accessibilityLabel="Volver"
          accessibilityRole="button"
        >
          <Text style={styles.textoVolver}>{'< Volver'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Buscar usuario</Text>
      </View>

      <View style={styles.contenido}>
        <View style={styles.inputContainer}>
          <Text style={styles.arroba}>@</Text>
          <TextInput
            style={styles.input}
            placeholder="nombre_usuario"
            placeholderTextColor={Colors.eli.grayLight}
            value={busqueda}
            onChangeText={(t) => { setBusqueda(t); setError(''); setResultado(null); }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={buscar}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.botonBuscar, busqueda.length < 3 && { opacity: 0.4 }]}
          onPress={buscar}
          disabled={busqueda.length < 3}
          accessibilityLabel="Buscar usuario"
          accessibilityRole="button"
        >
          <Text style={styles.botonBuscarTexto}>Buscar</Text>
        </TouchableOpacity>

        {buscando && <ActivityIndicator color={Colors.eli.primary} style={{ marginTop: 32 }} />}

        {resultado && !buscando && (
          <View style={styles.resultadoCard}>
            <View style={styles.resultadoAvatar}>
              <Text style={styles.resultadoAvatarTexto}>{resultado[0].toUpperCase()}</Text>
            </View>
            <View style={styles.resultadoInfo}>
              <Text style={styles.resultadoNombre}>@{resultado}</Text>
              <Text style={styles.resultadoSub}>Usuario de ELI</Text>
            </View>
            <TouchableOpacity
              style={[styles.botonSeguir, siguiendo && styles.botonSiguiendo]}
              onPress={toggleSeguir}
              accessibilityLabel={siguiendo ? 'Dejar de seguir' : 'Seguir usuario'}
              accessibilityRole="button"
            >
              <Text style={[styles.botonSeguirTexto, siguiendo && styles.botonSiguiendoTexto]}>
                {siguiendo ? 'Siguiendo' : 'Seguir'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.eli.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, paddingTop: 50,
    borderBottomWidth: 1, borderBottomColor: Colors.eli.border, gap: 12,
  },
  botonVolver: {},
  textoVolver: { color: Colors.eli.primary, fontSize: 16, fontWeight: '600' },
  headerTitle: { color: Colors.eli.white, fontSize: 18, fontWeight: '600' },
  contenido: { padding: 24 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.eli.grayDark, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.eli.primary,
    paddingHorizontal: 16, marginBottom: 12,
  },
  arroba: { color: Colors.eli.primary, fontSize: 20, fontWeight: 'bold', marginRight: 4 },
  input: { flex: 1, color: Colors.eli.white, fontSize: 18, paddingVertical: 14 },
  error: { color: '#FF6B6B', fontSize: 13, marginBottom: 12 },
  botonBuscar: {
    backgroundColor: Colors.eli.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginBottom: 24,
  },
  botonBuscarTexto: { color: Colors.eli.background, fontSize: 16, fontWeight: 'bold' },
  resultadoCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.eli.grayDark, borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: Colors.eli.border,
  },
  resultadoAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.eli.primary,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  resultadoAvatarTexto: { color: Colors.eli.background, fontWeight: 'bold', fontSize: 20 },
  resultadoInfo: { flex: 1 },
  resultadoNombre: { color: Colors.eli.white, fontSize: 16, fontWeight: '600' },
  resultadoSub: { color: Colors.eli.grayLight, fontSize: 13 },
  botonSeguir: {
    backgroundColor: Colors.eli.primary, borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 16,
  },
  botonSiguiendo: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.eli.primary },
  botonSeguirTexto: { color: Colors.eli.background, fontWeight: 'bold', fontSize: 14 },
  botonSiguiendoTexto: { color: Colors.eli.primary },
});
