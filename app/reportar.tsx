import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { Colors } from '../constants/Colors';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { MOTIVOS, MotivoReporte, enviarReporte } from '../services/reportes';

export default function Reportar() {
  const { contenidoId, tipo } = useLocalSearchParams<{ contenidoId: string, tipo: string }>();
  const [motivoSeleccionado, setMotivoSeleccionado] = useState<MotivoReporte | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [enviando, setEnviando] = useState(false);

  const handleEnviar = async () => {
    if (!motivoSeleccionado) return;
    setEnviando(true);
    await enviarReporte(
      contenidoId,
      tipo as 'publicacion' | 'comentario' | 'canal' | 'usuario',
      motivoSeleccionado,
      descripcion
    );
    setEnviando(false);
    Alert.alert(
      'Reporte enviado',
      'Gracias por ayudar a mantener ELI segura. Revisaremos el contenido.',
      [{ text: 'Entendido', onPress: () => router.back() }]
    );
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
        <Text style={styles.headerTitle}>Reportar contenido</Text>
        <TouchableOpacity
          style={[styles.botonEnviar, !motivoSeleccionado && { opacity: 0.4 }]}
          onPress={handleEnviar}
          disabled={!motivoSeleccionado || enviando}
          accessibilityLabel="Enviar reporte"
          accessibilityRole="button"
        >
          <Text style={styles.botonEnviarTexto}>Enviar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll}>
        <Text style={styles.titulo}>¿Por qué reportas este contenido?</Text>
        <Text style={styles.subtitulo}>
          Tu reporte es anónimo. La comunidad de ELI revisa todos los reportes.
        </Text>

        {MOTIVOS.map((motivo) => (
          <TouchableOpacity
            key={motivo.id}
            style={[styles.motivoItem, motivoSeleccionado === motivo.id && styles.motivoActivo]}
            onPress={() => setMotivoSeleccionado(motivo.id)}
            accessibilityLabel={motivo.label}
            accessibilityRole="button"
          >
            <View style={[styles.radio, motivoSeleccionado === motivo.id && styles.radioActivo]}>
              {motivoSeleccionado === motivo.id && <View style={styles.radioPunto} />}
            </View>
            <Text style={[styles.motivoTexto, motivoSeleccionado === motivo.id && styles.motivoTextoActivo]}>
              {motivo.label}
            </Text>
          </TouchableOpacity>
        ))}

        {motivoSeleccionado === 'otro' && (
          <TextInput
            style={styles.inputDescripcion}
            placeholder="Describe el motivo..."
            placeholderTextColor={Colors.eli.grayLight}
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={500}
          />
        )}

        <View style={styles.aviso}>
          <Text style={styles.avisoTitulo}>¿Qué pasa después?</Text>
          <Text style={styles.avisoTexto}>
            Los reportes con más de 3 votos se revisan automáticamente. El contenido que viole las normas de ELI se elimina. Los usuarios reincidentes son expulsados permanentemente. Nunca sabrán quién los reportó.
          </Text>
        </View>

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
  botonCancelar: { padding: 4 },
  cancelar: { color: Colors.eli.grayLight, fontSize: 15 },
  headerTitle: { color: Colors.eli.white, fontSize: 16, fontWeight: '600' },
  botonEnviar: {
    backgroundColor: '#CC3333',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  botonEnviarTexto: { color: Colors.eli.white, fontWeight: 'bold', fontSize: 14 },
  scroll: { flex: 1, padding: 16 },
  titulo: {
    color: Colors.eli.white,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 8,
  },
  subtitulo: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 24,
  },
  motivoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    marginBottom: 10,
    gap: 12,
    backgroundColor: Colors.eli.grayDark,
  },
  motivoActivo: {
    borderColor: Colors.eli.primary,
    backgroundColor: '#0D2B2B',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.eli.grayLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActivo: { borderColor: Colors.eli.primary },
  radioPunto: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.eli.primary,
  },
  motivoTexto: { color: Colors.eli.grayLight, fontSize: 15 },
  motivoTextoActivo: { color: Colors.eli.white, fontWeight: '600' },
  inputDescripcion: {
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    padding: 14,
    color: Colors.eli.white,
    fontSize: 14,
    minHeight: 100,
    marginBottom: 16,
  },
  aviso: {
    backgroundColor: '#1A1A2E',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    marginTop: 8,
  },
  avisoTitulo: {
    color: Colors.eli.white,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  avisoTexto: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    lineHeight: 20,
  },
});
