import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { Colors } from '../constants/Colors';
import { leerClavePublica } from '../services/gun';
import { cargarConversaciones, type Conversacion } from '../services/chat';
import { obtenerUsuario } from '../services/identidad';

type EstadoBusqueda = 'idle' | 'buscando' | 'encontrado' | 'no_encontrado' | 'error_propio';

export default function NuevaConversacion() {
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<EstadoBusqueda>('idle');
  const [recientes, setRecientes] = useState<Conversacion[]>([]);
  const [miId, setMiId] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    Promise.all([cargarConversaciones(), obtenerUsuario()]).then(([convs, id]) => {
      setRecientes(convs.slice(0, 8));
      setMiId(id);
    });
    // Foco automático al abrir
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const username = busqueda.trim().replace(/^@/, '').toLowerCase();

  const buscar = async () => {
    if (!username) return;
    if (username === miId) {
      setEstado('error_propio');
      return;
    }
    setEstado('buscando');
    const clave = await leerClavePublica(username);
    setEstado(clave ? 'encontrado' : 'no_encontrado');
  };

  const iniciar = (destino: string) => {
    // replace para que "atrás" desde conversacion vuelva al tab de chat
    router.replace({ pathname: '/conversacion', params: { destinatario: destino } });
  };

  const cambiarTexto = (t: string) => {
    setBusqueda(t);
    if (estado !== 'idle') setEstado('idle');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="Cancelar"
          accessibilityRole="button"
        >
          <Text style={styles.headerBoton}>Cancelar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nueva conversación</Text>
        <View style={{ width: 64 }} />
      </View>

      {/* Buscador */}
      <View style={styles.buscadorRow}>
        <TextInput
          ref={inputRef}
          style={styles.buscador}
          value={busqueda}
          onChangeText={cambiarTexto}
          placeholder="@nombre_usuario"
          placeholderTextColor={Colors.eli.grayLight}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={buscar}
        />
        <TouchableOpacity
          style={[styles.botonBuscar, (!username || estado === 'buscando') && { opacity: 0.4 }]}
          onPress={buscar}
          disabled={!username || estado === 'buscando'}
          accessibilityLabel="Buscar usuario en la red"
          accessibilityRole="button"
        >
          <Text style={styles.botonBuscarTexto}>Buscar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Resultados de búsqueda */}
        {estado === 'buscando' && (
          <View style={styles.buscandoRow}>
            <ActivityIndicator color={Colors.eli.primary} />
            <Text style={styles.buscandoTexto}>Buscando @{username} en la red…</Text>
          </View>
        )}

        {estado === 'encontrado' && (
          <TouchableOpacity
            style={styles.resultado}
            onPress={() => iniciar(username)}
            accessibilityLabel={`Iniciar conversación cifrada con ${username}`}
            accessibilityRole="button"
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarTexto}>{username[0].toUpperCase()}</Text>
            </View>
            <View style={styles.resultadoInfo}>
              <Text style={styles.resultadoNombre}>@{username}</Text>
              <Text style={styles.resultadoSub}>Activo en la red ELI · Cifrado listo ✓</Text>
            </View>
            <Text style={styles.flecha}>›</Text>
          </TouchableOpacity>
        )}

        {estado === 'no_encontrado' && (
          <View style={styles.aviso}>
            <Text style={styles.avisoTitulo}>Usuario no encontrado</Text>
            <Text style={styles.avisoTexto}>
              @{username} aún no está visible en la red.{'\n'}
              El usuario debe haber abierto ELI al menos una vez para ser localizable.
            </Text>
          </View>
        )}

        {estado === 'error_propio' && (
          <View style={styles.aviso}>
            <Text style={styles.avisoTitulo}>Ése eres tú</Text>
            <Text style={styles.avisoTexto}>No puedes iniciar una conversación contigo mismo.</Text>
          </View>
        )}

        {/* Sección de recientes (solo cuando no hay búsqueda activa) */}
        {(estado === 'idle') && recientes.length > 0 && (
          <View style={styles.seccion}>
            <Text style={styles.seccionTitulo}>Recientes</Text>
            {recientes.map(conv => (
              <TouchableOpacity
                key={conv.id}
                style={styles.fila}
                onPress={() => iniciar(conv.contraparte)}
                accessibilityLabel={`Reabrir conversación con ${conv.contraparte}`}
                accessibilityRole="button"
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarTexto}>{conv.contraparte[0].toUpperCase()}</Text>
                </View>
                <Text style={styles.nombreUsuario}>@{conv.contraparte}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Ayuda cuando el campo está vacío y no hay recientes */}
        {estado === 'idle' && recientes.length === 0 && (
          <View style={styles.ayuda}>
            <Text style={styles.ayudaTitulo}>¿Cómo funciona?</Text>
            <Text style={styles.ayudaTexto}>
              Escribe el @usuario exacto de la persona con quien quieres hablar y pulsa Buscar.{'\n\n'}
              ELI busca su clave pública en la red para iniciar un chat cifrado de extremo a extremo. Nadie más puede leer los mensajes.
            </Text>
          </View>
        )}
      </ScrollView>
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
  buscadorRow: {
    flexDirection: 'row', alignItems: 'center',
    margin: 16, gap: 10,
  },
  buscador: {
    flex: 1, backgroundColor: Colors.eli.grayDark,
    borderWidth: 1, borderColor: Colors.eli.border,
    borderRadius: 12, padding: 14,
    color: Colors.eli.white, fontSize: 16,
  },
  botonBuscar: {
    backgroundColor: Colors.eli.primary,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
  },
  botonBuscarTexto: { color: Colors.eli.background, fontWeight: '700', fontSize: 15 },
  scroll: { flex: 1 },
  buscandoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 20,
  },
  buscandoTexto: { color: Colors.eli.grayLight, fontSize: 14 },
  resultado: {
    flexDirection: 'row', alignItems: 'center',
    margin: 16, padding: 16,
    backgroundColor: 'rgba(0,201,177,0.08)',
    borderRadius: 14, borderLeftWidth: 2, borderLeftColor: 'rgba(0,201,177,0.3)',
    gap: 12,
  },
  resultadoInfo: { flex: 1 },
  resultadoNombre: { color: Colors.eli.white, fontSize: 16, fontWeight: '700' },
  resultadoSub: { color: Colors.eli.primary, fontSize: 12, marginTop: 2 },
  flecha: { color: Colors.eli.primary, fontSize: 24 },
  aviso: {
    margin: 16, padding: 20,
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.eli.border,
  },
  avisoTitulo: { color: Colors.eli.white, fontWeight: '700', fontSize: 15, marginBottom: 8 },
  avisoTexto: { color: Colors.eli.grayLight, fontSize: 13, lineHeight: 20 },
  seccion: { marginTop: 8 },
  seccionTitulo: {
    color: Colors.eli.grayLight, fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  fila: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.eli.border,
    gap: 12,
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: Colors.eli.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTexto: { color: Colors.eli.background, fontWeight: 'bold', fontSize: 18 },
  nombreUsuario: { color: Colors.eli.white, fontSize: 15, fontWeight: '600' },
  ayuda: {
    margin: 24, padding: 20,
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.eli.border,
  },
  ayudaTitulo: { color: Colors.eli.primary, fontWeight: '700', fontSize: 14, marginBottom: 10 },
  ayudaTexto: { color: Colors.eli.grayLight, fontSize: 13, lineHeight: 21 },
});
