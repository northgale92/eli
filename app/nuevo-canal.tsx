import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from '../constants/Colors';
import { router } from 'expo-router';
import { useState } from 'react';
import { crearCanal } from '../services/canales';
import { obtenerUsuario } from '../services/identidad';

export default function NuevoCanal() {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [creando, setCreando] = useState(false);

  const handleCrear = async () => {
    if (!nombre.trim()) return;
    setCreando(true);
    const usuario = await obtenerUsuario();
    crearCanal(nombre.trim(), descripcion.trim(), usuario || 'anonimo');
    router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.botonCancelar}
          accessibilityLabel="Cancelar"
          accessibilityRole="button"
        >
          <Text style={styles.cancelar}>Cancelar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nuevo canal</Text>
        <TouchableOpacity
          style={[styles.botonCrear, !nombre.trim() && { opacity: 0.4 }]}
          onPress={handleCrear}
          disabled={!nombre.trim() || creando}
          accessibilityLabel="Crear canal"
          accessibilityRole="button"
        >
          <Text style={styles.crearTexto}>Crear</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll}>
        <View style={styles.campo}>
          <Text style={styles.campoLabel}>Nombre del canal</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Tecnología Libre"
            placeholderTextColor={Colors.eli.grayLight}
            value={nombre}
            onChangeText={setNombre}
            maxLength={50}
          />
          <Text style={styles.contador}>{nombre.length}/50</Text>
        </View>

        <View style={styles.campo}>
          <Text style={styles.campoLabel}>Descripción</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="De qué trata tu canal..."
            placeholderTextColor={Colors.eli.grayLight}
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={200}
          />
          <Text style={styles.contador}>{descripcion.length}/200</Text>
        </View>

        <View style={styles.info}>
          <Text style={styles.infoTitulo}>Sobre los canales en ELI</Text>
          <Text style={styles.infoTexto}>
            Los canales son espacios de difusión descentralizados. Solo el creador puede publicar. Los suscriptores reciben las publicaciones en tiempo real. Nadie puede censurarte ni quitarte el canal.
          </Text>
        </View>
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
  botonCancelar: {
    padding: 4,
  },
  cancelar: {
    color: Colors.eli.grayLight,
    fontSize: 15,
  },
  headerTitle: {
    color: Colors.eli.white,
    fontSize: 16,
    fontWeight: '600',
  },
  botonCrear: {
    backgroundColor: Colors.eli.primary,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  crearTexto: {
    color: Colors.eli.background,
    fontWeight: 'bold',
    fontSize: 14,
  },
  scroll: {
    flex: 1,
    padding: 16,
  },
  campo: {
    marginBottom: 24,
  },
  campoLabel: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    padding: 14,
    color: Colors.eli.white,
    fontSize: 16,
  },
  inputMultiline: {
    minHeight: 100,
  },
  contador: {
    color: Colors.eli.grayLight,
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
  },
  info: {
    backgroundColor: 'rgba(0,201,177,0.08)',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,201,177,0.3)',
    marginTop: 8,
  },
  infoTitulo: {
    color: Colors.eli.primary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  infoTexto: {
    color: Colors.eli.white,
    fontSize: 13,
    lineHeight: 20,
  },
});
