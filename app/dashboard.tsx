import { View, Text, StyleSheet, ScrollView, TouchableOpacity, BackHandler } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { obtenerUsuario } from '../services/identidad';

const MURO_EJEMPLO = [
  { id: '1', texto: 'Bienvenidos a ELI 🌍', usuario: 'eli_user', likes: 24, comentarios: 5 },
  { id: '2', texto: 'La red social que nos merecemos', usuario: 'usuaria_eli', likes: 18, comentarios: 3 },
];

const CHATS_EJEMPLO = [
  { id: '1', nombre: 'Ana M.', inicial: 'A', color: '#FF6B6B', activo: true },
  { id: '2', nombre: 'Carlos R.', inicial: 'C', color: '#4ECDC4', activo: true },
  { id: '3', nombre: 'Laura P.', inicial: 'L', color: '#FFE66D', activo: false },
  { id: '4', nombre: 'Marcos V.', inicial: 'M', color: '#A8E6CF', activo: true },
  { id: '5', nombre: 'Sofia T.', inicial: 'S', color: '#FF8B94', activo: false },
];

const MERCADO_EJEMPLO = [
  { id: '1', nombre: 'Tienda Eco', precio: '23,00 €', variacion: '+3,3%', positivo: true },
  { id: '2', nombre: 'TrendStyle', precio: '19,99 €', variacion: '+11,75%', positivo: true },
  { id: '3', nombre: 'MercaLocal', precio: '28,50 €', variacion: '-5,2%', positivo: false },
];

const CANALES_EJEMPLO = [
  { id: '1', nombre: 'Noticias locales', miembros: '23 canales', icono: '📰' },
  { id: '2', nombre: 'Tecnología', miembros: '12 canales', icono: '💻' },
  { id: '3', nombre: 'Solidaridad', miembros: '6 canales', icono: '🤝' },
];

export default function Dashboard() {
  const [usuario, setUsuario] = useState('');

  useEffect(() => {
    obtenerUsuario().then((u) => setUsuario(u || ''));
  }, []);

  useEffect(() => {
    const onBackPress = () => {
      AsyncStorage.setItem('eli-app-bloqueada', 'true').finally(() => {
        BackHandler.exitApp();
      });
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, []);

  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <LinearGradient colors={['#2c2c2c', '#1a1a1a', '#141414']} style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Image
            source={require('../assets/images/logo.png')}
            style={styles.logoImagen}
            contentFit="contain"
          />
          <View style={styles.headerUsuarioBox}>
            <View style={styles.avatarUsuario}>
              <Text style={styles.avatarLetra}>{usuario ? usuario[0].toUpperCase() : 'U'}</Text>
            </View>
            <Text style={styles.headerUsuario}>@{usuario || 'usuario'}</Text>
          </View>
        </View>

        <View style={styles.saludoBox}>
          <Text style={styles.saludo}>
            {saludo}, @{usuario || 'usuario'}!
          </Text>
          <Text style={styles.saludoSub}>
            Tu dashboard de ELI. Selecciona una sección o revisa tu feed.
          </Text>
        </View>

        <View style={styles.grid}>
          <TouchableOpacity
            style={[styles.tarjeta, styles.tarjetaMitad]}
            onPress={() => router.push('/(tabs)/muro')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['transparent', 'rgba(0,201,177,0.6)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.shimmerLine}
            />
            <View style={styles.tarjetaHeaderRow}>
              <Text style={styles.tarjetaTitulo}>Muro Social</Text>
              <Text style={styles.tarjetaIcono}>👥</Text>
            </View>
            {MURO_EJEMPLO.slice(0, 1).map((post) => (
              <Text key={post.id} style={styles.tarjetaDesc} numberOfLines={3}>
                {post.texto}
              </Text>
            ))}
            <View style={styles.tarjetaFooter}>
              <Text style={styles.tarjetaFooterTexto}>❤ {MURO_EJEMPLO[0].likes}</Text>
              <Text style={styles.tarjetaFooterTexto}>💬 {MURO_EJEMPLO[0].comentarios}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tarjeta, styles.tarjetaMitad]}
            onPress={() => router.push('/(tabs)/chat')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['transparent', 'rgba(0,201,177,0.6)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.shimmerLine}
            />
            <View style={styles.tarjetaHeaderRow}>
              <Text style={styles.tarjetaTitulo}>Chat Recientes</Text>
              <Text style={styles.tarjetaChevron}>›</Text>
            </View>
            <View style={styles.avatarGrid}>
              {CHATS_EJEMPLO.slice(0, 6).map((chat) => (
                <View key={chat.id} style={styles.avatarWrapper}>
                  <View style={[styles.avatarChat, { backgroundColor: chat.color }]}>
                    <Text style={styles.avatarChatLetra}>{chat.inicial}</Text>
                  </View>
                </View>
              ))}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tarjeta, styles.tarjetaMitad]}
            onPress={() => router.push('/(tabs)/mercado')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['transparent', 'rgba(0,201,177,0.6)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.shimmerLine}
            />
            <View style={styles.tarjetaHeaderRow}>
              <Text style={styles.tarjetaTitulo}>Mercado Highlights</Text>
            </View>
            <View style={styles.mercadoLista}>
              {MERCADO_EJEMPLO.map((item) => (
                <View key={item.id} style={styles.mercadoItem}>
                  <View style={styles.mercadoImagen}>
                    <Text style={styles.mercadoEmoji}>🛍</Text>
                  </View>
                  <View>
                    <Text style={styles.mercadoNombre} numberOfLines={1}>
                      {item.nombre}
                    </Text>
                    <Text
                      style={[
                        styles.mercadoVariacion,
                        { color: item.positivo ? '#00C9B1' : '#FF4444' },
                      ]}
                    >
                      {item.variacion}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tarjeta, styles.tarjetaMitad]}
            onPress={() => router.push('/(tabs)/canales')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['transparent', 'rgba(0,201,177,0.6)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.shimmerLine}
            />
            <View style={styles.tarjetaHeaderRow}>
              <Text style={styles.tarjetaTitulo}>Canales</Text>
            </View>
            <View style={styles.canalesLista}>
              {CANALES_EJEMPLO.map((canal) => (
                <View key={canal.id} style={styles.canalItem}>
                  <View style={styles.canalIconoBox}>
                    <Text style={styles.canalIcono}>{canal.icono}</Text>
                  </View>
                  <View>
                    <Text style={styles.canalNombre} numberOfLines={1}>
                      {canal.nombre}
                    </Text>
                    <Text style={styles.canalMiembros}>{canal.miembros}</Text>
                  </View>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.tarjetaSolidaria}
          onPress={() => router.push('/(tabs)/solidaria')}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['transparent', 'rgba(0,201,177,0.6)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.shimmerLine}
          />
          <View style={styles.solidariaHeader}>
            <Text style={styles.solidariaIcono}>♡</Text>
            <Text style={styles.solidariaTitulo}>Solidaria</Text>
            <Text style={styles.solidariaChevron}>›</Text>
          </View>
          <View style={styles.solidariaFilas}>
            <View style={styles.solidariaFila}>
              <Text style={styles.solidariaLabel}>Fondo total</Text>
              <Text style={styles.solidariaValor}>0,00 €</Text>
            </View>
          </View>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.navBar}>
        {([
          { label: 'Muro', ruta: '/(tabs)/muro' },
          { label: 'Chat', ruta: '/(tabs)/chat' },
          { label: 'Canales', ruta: '/(tabs)/canales' },
          { label: 'Mercado', ruta: '/(tabs)/mercado' },
          { label: 'Solidaria', ruta: '/(tabs)/solidaria' },
        ] as { label: string; ruta: string }[]).map(({ label, ruta }) => (
          <TouchableOpacity
            key={label}
            style={styles.navItem}
            onPress={() => router.push(ruta as any)}
            activeOpacity={0.7}
          >
            <Text style={styles.navLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  logoImagen: {
    width: 60,
    height: 60,
  },
  headerUsuarioBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarUsuario: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#00C9B1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetra: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  headerUsuario: {
    color: '#888888',
    fontSize: 13,
  },
  saludoBox: {
    marginBottom: 24,
  },
  saludo: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  saludoSub: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  tarjeta: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
    overflow: 'hidden',
  },
  shimmerLine: {
    height: 1,
    marginHorizontal: -14,
    marginTop: -14,
    marginBottom: 10,
  },
  tarjetaMitad: {
    width: '47.5%',
    minHeight: 160,
  },
  tarjetaHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  tarjetaTitulo: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  tarjetaIcono: {
    fontSize: 18,
  },
  tarjetaChevron: {
    color: '#00C9B1',
    fontSize: 22,
    fontWeight: '300',
  },
  tarjetaDesc: {
    color: '#aaaaaa',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  tarjetaFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 'auto',
  },
  tarjetaFooterTexto: {
    color: '#888888',
    fontSize: 12,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarChat: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarChatLetra: {
    color: '#142338',
    fontSize: 14,
    fontWeight: 'bold',
  },
  mercadoLista: {
    gap: 8,
  },
  mercadoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mercadoImagen: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mercadoEmoji: {
    fontSize: 16,
  },
  mercadoNombre: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    maxWidth: 80,
  },
  mercadoVariacion: {
    fontSize: 11,
    fontWeight: '600',
  },
  canalesLista: {
    gap: 10,
  },
  canalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  canalIconoBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canalIcono: {
    fontSize: 16,
  },
  canalNombre: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    maxWidth: 80,
  },
  canalMiembros: {
    color: '#888888',
    fontSize: 10,
  },
  tarjetaSolidaria: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  solidariaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  solidariaIcono: {
    color: '#00C9B1',
    fontSize: 18,
  },
  solidariaTitulo: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  solidariaChevron: {
    color: '#00C9B1',
    fontSize: 22,
    fontWeight: '300',
  },
  solidariaFilas: {
    gap: 0,
  },
  solidariaFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,201,177,0.25)',
  },
  solidariaLabel: {
    color: '#888888',
    fontSize: 13,
  },
  solidariaValor: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  solidariaDisponible: {
    color: '#00C9B1',
  },
  navBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(20,35,56,0.97)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,201,177,0.2)',
    paddingBottom: 48,
    paddingTop: 10,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
  },
  navLabel: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '600',
  },
});
