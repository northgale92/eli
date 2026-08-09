import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors } from '../constants/Colors';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { sanitizarEnlaces } from '../services/canales';
import { publicarComentario, escucharComentarios, eliminarComentario, type Comentario } from '../services/comentarios';
import { obtenerUsuario } from '../services/identidad';

function formatoHora(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'justo ahora';
  if (diff < 3600000) return `hace ${Math.round(diff / 60000)} min`;
  if (diff < 86400000) return `hace ${Math.round(diff / 3600000)} h`;
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export default function Comentarios() {
  const { pubId, canalId } = useLocalSearchParams<{ pubId?: string; canalId?: string }>();
  const contexto = canalId ? `canal_${canalId}` : 'muro';

  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [comentario, setComentario] = useState('');
  const [miUsuario, setMiUsuario] = useState('');
  const [cargando, setCargando] = useState(true);
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const usuario = await obtenerUsuario();
      setMiUsuario(usuario || '');
      setCargando(false);
    })();
  }, []);

  useEffect(() => {
    if (!pubId) return;
    setComentarios([]);
    return escucharComentarios(contexto, pubId, (nuevo) => {
      setComentarios(prev => {
        if (prev.find(c => c.id === nuevo.id)) return prev;
        return [nuevo, ...prev].sort((a, b) => b.timestamp - a.timestamp);
      });
    });
  }, [contexto, pubId]);

  const enviar = () => {
    if (!comentario.trim() || !pubId || !miUsuario) return;
    publicarComentario(contexto, pubId, miUsuario, comentario.trim());
    setComentario('');
  };

  const borrar = (com: Comentario) => {
    if (!pubId) return;
    eliminarComentario(contexto, pubId, com.id);
    setComentarios(prev => prev.filter(c => c.id !== com.id));
    setMenuAbierto(null);
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
          <Text style={styles.volver}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Comentarios</Text>
        <View style={{ width: 30 }} />
      </View>

      {!pubId ? (
        <View style={styles.vacio}>
          <Text style={styles.vacioTexto}>No se pudo cargar esta publicación.</Text>
        </View>
      ) : cargando ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.eli.primary} />
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 16 }}>
          {comentarios.length === 0 && (
            <Text style={styles.vacioTexto}>Sin comentarios todavía. ¡Escribe el primero!</Text>
          )}
          {comentarios.map((com) => (
            <View key={com.id} style={styles.comentario}>
              <View style={styles.avatar}>
                <Text style={styles.avatarTexto}>{com.usuario[0]?.toUpperCase() ?? '?'}</Text>
              </View>
              <View style={styles.contenido}>
                <Text style={styles.usuario}>{com.usuario}</Text>
                <Text style={styles.texto}>{sanitizarEnlaces(com.texto)}</Text>
                <Text style={styles.hora}>{formatoHora(com.timestamp)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setMenuAbierto(menuAbierto === com.id ? null : com.id)}
                style={styles.botonMenu}
                accessibilityLabel="Más opciones"
                accessibilityRole="button"
              >
                <Text style={styles.botonMenuTexto}>···</Text>
              </TouchableOpacity>
              {menuAbierto === com.id && (
                <>
                  <TouchableOpacity
                    style={styles.menuOverlay}
                    activeOpacity={1}
                    onPress={() => setMenuAbierto(null)}
                  />
                  <View style={styles.menu}>
                    <TouchableOpacity
                      style={styles.menuItem}
                      onPress={() => {
                        setMenuAbierto(null);
                        router.push({ pathname: '/reportar', params: { pubId: com.id } });
                      }}
                    >
                      <Text style={styles.menuItemTexto}>🚩 Reportar</Text>
                    </TouchableOpacity>
                    {com.usuario === miUsuario && (
                      <TouchableOpacity style={styles.menuItem} onPress={() => borrar(com)}>
                        <Text style={[styles.menuItemTexto, { color: '#ff6b6b' }]}>🗑 Eliminar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.inputArea}>
        <TextInput
          style={styles.input}
          placeholder="Escribe un comentario..."
          placeholderTextColor={Colors.eli.grayLight}
          accessibilityLabel="Escribe un comentario"
          value={comentario}
          onChangeText={setComentario}
          editable={!!pubId}
        />
        <TouchableOpacity
          style={[styles.botonEnviar, !comentario.trim() && { opacity: 0.4 }]}
          accessibilityLabel="Enviar comentario"
          accessibilityRole="button"
          onPress={enviar}
          disabled={!comentario.trim() || !pubId}
        >
          <Text style={styles.botonEnviarTexto}>Enviar</Text>
        </TouchableOpacity>
      </View>
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
  botonVolver: {
    width: 30,
  },
  volver: {
    color: Colors.eli.primary,
    fontSize: 28,
    lineHeight: 28,
  },
  headerTitle: {
    color: Colors.eli.white,
    fontSize: 16,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  vacio: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
  vacioTexto: {
    color: Colors.eli.grayLight,
    fontSize: 14,
    textAlign: 'center',
  },
  comentario: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    position: 'relative',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.eli.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: {
    color: Colors.eli.background,
    fontWeight: 'bold',
    fontSize: 14,
  },
  contenido: {
    flex: 1,
  },
  usuario: {
    color: Colors.eli.primary,
    fontWeight: '600',
    fontSize: 13,
    marginBottom: 2,
  },
  texto: {
    color: Colors.eli.white,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  hora: {
    color: Colors.eli.grayLight,
    fontSize: 11,
  },
  inputArea: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.eli.border,
    alignItems: 'center',
    gap: 10,
    paddingBottom: 30,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: Colors.eli.white,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.eli.border,
  },
  botonEnviar: {
    backgroundColor: Colors.eli.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  botonEnviarTexto: {
    color: Colors.eli.background,
    fontWeight: 'bold',
    fontSize: 14,
  },
  botonMenu: {
    padding: 4,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
  },
  botonMenuTexto: {
    color: Colors.eli.grayLight,
    fontSize: 16,
    letterSpacing: 2,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  menu: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#1E2A3A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    zIndex: 20,
    minWidth: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.eli.border,
  },
  menuItemTexto: {
    color: Colors.eli.white,
    fontSize: 13,
  },
});
