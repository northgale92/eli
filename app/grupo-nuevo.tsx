import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { Colors } from '../constants/Colors';
import { leerClavePublica } from '../services/gun';
import { crearGrupo } from '../services/grupos';
import { obtenerUsuario } from '../services/identidad';

export default function GrupoNuevo() {
  const [nombre, setNombre] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [participantes, setParticipantes] = useState<string[]>([]);
  const [creando, setCreando] = useState(false);

  const agregarParticipante = async () => {
    const username = busqueda.trim().replace(/^@/, '').toLowerCase();
    if (!username) return;
    const miId = await obtenerUsuario();
    if (username === miId) {
      Alert.alert('Ese eres tú', 'No hace falta que te añadas a ti mismo.');
      return;
    }
    if (participantes.includes(username)) {
      setBusqueda('');
      return;
    }
    setBuscando(true);
    const clave = await leerClavePublica(username);
    setBuscando(false);
    if (!clave) {
      Alert.alert('Usuario no encontrado', `@${username} aún no está visible en la red.`);
      return;
    }
    setParticipantes(prev => [...prev, username]);
    setBusqueda('');
  };

  const quitarParticipante = (username: string) => {
    setParticipantes(prev => prev.filter(p => p !== username));
  };

  const crear = async () => {
    if (!nombre.trim() || participantes.length === 0 || creando) return;
    setCreando(true);
    const miId = await obtenerUsuario();
    if (!miId) { setCreando(false); return; }
    const grupo = await crearGrupo(nombre.trim(), miId, [miId, ...participantes]);
    setCreando(false);
    router.replace({ pathname: '/grupo', params: { grupoId: grupo.id, nombre: grupo.nombre } });
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
        <Text style={styles.headerTitle}>Nuevo grupo</Text>
        <View style={{ width: 64 }} />
      </View>

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.etiqueta}>Nombre del grupo</Text>
        <TextInput
          style={styles.inputNombre}
          value={nombre}
          onChangeText={setNombre}
          placeholder="Ej. Proyecto ELI"
          placeholderTextColor={Colors.eli.grayLight}
          accessibilityLabel="Nombre del grupo"
        />

        <Text style={styles.etiqueta}>Añadir participantes</Text>
        <View style={styles.buscadorRow}>
          <TextInput
            style={styles.buscador}
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="@nombre_usuario"
            placeholderTextColor={Colors.eli.grayLight}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={agregarParticipante}
            accessibilityLabel="Buscar usuario para añadir al grupo"
          />
          <TouchableOpacity
            style={[styles.botonAnadir, (!busqueda.trim() || buscando) && { opacity: 0.4 }]}
            onPress={agregarParticipante}
            disabled={!busqueda.trim() || buscando}
            accessibilityLabel="Añadir participante"
            accessibilityRole="button"
          >
            {buscando ? <ActivityIndicator color={Colors.eli.background} /> : <Text style={styles.botonAnadirTexto}>Añadir</Text>}
          </TouchableOpacity>
        </View>

        {participantes.length > 0 && (
          <View style={styles.chips}>
            {participantes.map(p => (
              <TouchableOpacity
                key={p}
                style={styles.chip}
                onPress={() => quitarParticipante(p)}
                accessibilityLabel={`Quitar a ${p} del grupo`}
                accessibilityRole="button"
              >
                <Text style={styles.chipTexto}>@{p}  ✕</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {participantes.length === 0 && (
          <Text style={styles.ayuda}>
            Añade al menos una persona con su @usuario exacto para poder crear el grupo.
          </Text>
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.botonCrear, (!nombre.trim() || participantes.length === 0 || creando) && { opacity: 0.4 }]}
        onPress={crear}
        disabled={!nombre.trim() || participantes.length === 0 || creando}
        accessibilityLabel="Crear grupo"
        accessibilityRole="button"
      >
        <Text style={styles.botonCrearTexto}>{creando ? 'Creando…' : `Crear grupo (${participantes.length + 1} miembros)`}</Text>
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
  scroll: { flex: 1, padding: 16 },
  etiqueta: {
    color: Colors.eli.grayLight, fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16,
  },
  inputNombre: {
    backgroundColor: Colors.eli.grayDark, borderWidth: 1, borderColor: Colors.eli.border,
    borderRadius: 12, padding: 14, color: Colors.eli.white, fontSize: 16,
  },
  buscadorRow: { flexDirection: 'row', gap: 10 },
  buscador: {
    flex: 1, backgroundColor: Colors.eli.grayDark, borderWidth: 1, borderColor: Colors.eli.border,
    borderRadius: 12, padding: 14, color: Colors.eli.white, fontSize: 16,
  },
  botonAnadir: {
    backgroundColor: Colors.eli.primary, borderRadius: 12,
    paddingHorizontal: 16, justifyContent: 'center',
  },
  botonAnadirTexto: { color: Colors.eli.background, fontWeight: '700', fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: {
    backgroundColor: 'rgba(0,201,177,0.12)', borderWidth: 1, borderColor: 'rgba(0,201,177,0.3)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
  },
  chipTexto: { color: Colors.eli.primary, fontSize: 13, fontWeight: '600' },
  ayuda: { color: Colors.eli.grayLight, fontSize: 13, lineHeight: 20, marginTop: 12 },
  botonCrear: {
    backgroundColor: Colors.eli.primary, margin: 16, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  botonCrearTexto: { color: Colors.eli.background, fontWeight: '700', fontSize: 15 },
});
