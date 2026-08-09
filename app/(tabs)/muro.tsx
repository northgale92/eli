import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import { Colors } from '../../constants/Colors';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import * as Speech from 'expo-speech';
import { escucharPublicaciones, darLike, eliminarPublicacion } from '../../services/publicaciones';
import { seguirUsuario, dejarDeSeguir, estaSiguiendo, obtenerSeguidos } from '../../services/seguidos';
import { obtenerUsuario } from '../../services/identidad';
import { obtenerEstadoVerificacion } from '../../services/verificacion';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Muro() {
  const [publicaciones, setPublicaciones] = useState<any[]>([]);
  const [miUsuario, setMiUsuario] = useState('');
  const [seguidos, setSeguidos] = useState<string[]>([]);
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);
  const [verificados, setVerificados] = useState<Record<string, boolean>>({});
  const [bannerVisible, setBannerVisible] = useState(true);
  const [leyendoPub, setLeyendoPub] = useState<string | null>(null);
  const [mostrarAvisoMod, setMostrarAvisoMod] = useState(false);

  useEffect(() => {
    const cargarBanner = async () => {
      try {
        const cerrado = await AsyncStorage.getItem('eli-banner-muro-cerrado');
        if (cerrado === 'true') setBannerVisible(false);
      } catch {}
    };
    cargarBanner();
  }, []);

  useEffect(() => {
    const comprobarAviso = async () => {
      const visto = await AsyncStorage.getItem('muro_aviso_moderacion_visto');
      if (!visto) setMostrarAvisoMod(true);
    };
    comprobarAviso();
  }, []);

  const cerrarAvisoMod = async () => {
    await AsyncStorage.setItem('muro_aviso_moderacion_visto', 'true');
    setMostrarAvisoMod(false);
  };

  useEffect(() => {
    const cargar = async () => {
      const usuario = await obtenerUsuario();
      const listaSeguidos = await obtenerSeguidos();
      setMiUsuario(usuario || '');
      setSeguidos(listaSeguidos);
    };
    cargar();

    escucharPublicaciones((pub) => {
      setPublicaciones(prev => {
        const existe = prev.findIndex(p => p.id === pub.id);
        if (existe >= 0) {
          const nueva = [...prev];
          nueva[existe] = { ...nueva[existe], likes: pub.likes };
          return nueva;
        }
        return [pub, ...prev];
      });
      if (pub.usuario && !(pub.usuario in verificados)) {
        obtenerEstadoVerificacion(pub.usuario).then(resultado => {
          setVerificados(prev => ({ ...prev, [pub.usuario]: resultado.verificado }));
        });
      }
    });
  }, []);

  const leerPublicacion = async (pub: any) => {
    if (leyendoPub === pub.id) {
      await Speech.stop();
      setLeyendoPub(null);
    } else {
      setLeyendoPub(pub.id);
      Speech.speak(pub.texto || '', {
        language: 'es-ES',
        onDone: () => setLeyendoPub(null),
        onError: () => setLeyendoPub(null),
        onStopped: () => setLeyendoPub(null),
      });
    }
  };

  const compartir = async (pub: any) => {
    try {
      await Share.share({
        message: `${pub.usuario} en ELI:\n\n${pub.texto}\n\nDescarga ELI en eli-app.org`,
      });
    } catch (error) {
      console.error('Error al compartir:', error);
    }
  };

  const cerrarBanner = async () => {
    try {
      await AsyncStorage.setItem('eli-banner-muro-cerrado', 'true');
    } catch {}
    setBannerVisible(false);
  };

  const toggleSeguir = async (usuario: string) => {
    if (usuario === miUsuario) return;
    const yaSigue = seguidos.includes(usuario);
    if (yaSigue) {
      await dejarDeSeguir(usuario);
      setSeguidos(prev => prev.filter(u => u !== usuario));
    } else {
      await seguirUsuario(usuario);
      setSeguidos(prev => [...prev, usuario]);
    }
  };

  return (
    <LinearGradient colors={['#2c2c2c', '#1a1a1a', '#141414']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>ELI</Text>
        <Text style={styles.headerTitle}>Muro</Text>
        <TouchableOpacity
          onPress={() => router.push('/buscar-usuario')}
          accessibilityLabel="Buscar usuarios"
          accessibilityRole="button"
          style={{ marginLeft: 'auto', marginRight: 8, padding: 8 }}
        >
          <Text style={{ color: Colors.eli.grayLight, fontSize: 20 }}>⌕</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/perfil')}
          accessibilityLabel="Ver mi perfil"
          accessibilityRole="button"
          style={{ marginRight: 8 }}
        >
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.eli.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: Colors.eli.background, fontWeight: 'bold', fontSize: 14 }}>
              {miUsuario ? miUsuario[0].toUpperCase() : '?'}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/ajustes')}
          accessibilityLabel="Abrir ajustes"
          accessibilityRole="button"
          style={{ padding: 8 }}
        >
          <Text style={{ color: Colors.eli.grayLight, fontSize: 22, letterSpacing: 2 }}>···</Text>
        </TouchableOpacity>
      </View>

      {bannerVisible && (
        <View style={styles.bannerLibertad}>
          <Text style={styles.bannerTexto}>
            Estás en una app de libertad. Por favor, mantén las formas.
          </Text>
          <TouchableOpacity
            onPress={cerrarBanner}
            accessibilityLabel="Cerrar aviso"
            accessibilityRole="button"
            style={styles.bannerCerrar}
          >
            <Text style={styles.bannerCerrarTexto}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {mostrarAvisoMod && (
        <View style={styles.bannerModeracion}>
          <View style={styles.bannerModIcono}>
            <Text style={styles.bannerModIconoTexto}>⚠</Text>
          </View>
          <View style={styles.bannerModContenido}>
            <Text style={styles.bannerModTitulo}>
              ZONA MODERADA POR IA — SIN EXCEPCIONES
            </Text>
            <Text style={styles.bannerModTexto}>
              Todo lo que publicas pasa por moderación automática antes de aparecer. Si subes contenido prohibido — pornografía, violencia real, abuso, o cualquier material intolerable — una IA lo detectará.
            </Text>
            <View style={styles.bannerModSeparador} />
            <Text style={styles.bannerModConsecuencias}>
              Las consecuencias son inmediatas y permanentes:
            </Text>
            {[
              'Tu cuenta será clausurada para siempre',
              'Todo tu contenido será borrado sin excepción',
              'Si tenías un canal, desaparecerá con todo lo que contenía',
              'No hay apelación. No hay segunda oportunidad.',
            ].map((item, i) => (
              <View key={i} style={styles.bannerModFila}>
                <Text style={styles.bannerModPunto}>•</Text>
                <Text style={styles.bannerModItem}>{item}</Text>
              </View>
            ))}
            <Text style={styles.bannerModPie}>
              No hay un humano que decida. El sistema actúa solo.
            </Text>
            <TouchableOpacity onPress={cerrarAvisoMod} style={styles.bannerModBoton}>
              <Text style={styles.bannerModBotonTexto}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView style={styles.feed}>
        {publicaciones.length === 0 && (
          <View style={styles.vacio}>
            <Text style={styles.vacioTexto}>No hay publicaciones todavía.</Text>
            <Text style={styles.vacioSub}>Sé el primero en publicar algo.</Text>
          </View>
        )}

        {publicaciones.map((pub) => {
          const esMio = pub.usuario === miUsuario;
          const yaSigue = seguidos.includes(pub.usuario);

          return (
            <View key={pub.id} style={styles.tarjeta}>
              <View style={styles.tarjetaHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {pub.usuario ? pub.usuario[0].toUpperCase() : '?'}
                  </Text>
                </View>
                <View style={styles.usuarioInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.usuario}>@{pub.usuario}</Text>
                    {verificados[pub.usuario] === true && (
                      <Text style={{ color: Colors.eli.primary, fontSize: 12 }}>✓</Text>
                    )}
                  </View>
                  <Text style={styles.tiempo}>{pub.tiempo || 'justo ahora'}</Text>
                </View>
                {!esMio && (
                  <TouchableOpacity
                    onPress={() => toggleSeguir(pub.usuario)}
                    style={[styles.botonSeguirHeader, yaSigue && styles.botonSiguiendoHeader]}
                    accessibilityLabel={yaSigue ? 'Dejar de seguir' : 'Seguir usuario'}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.botonSeguirHeaderTexto, yaSigue && styles.botonSiguiendoHeaderTexto]}>
                      {yaSigue ? 'Siguiendo' : '+ Seguir'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setMenuAbierto(menuAbierto === pub.id ? null : pub.id)}
                  style={styles.botonMenu}
                  accessibilityLabel="Más opciones"
                  accessibilityRole="button"
                >
                  <Text style={styles.botonMenuTexto}>···</Text>
                </TouchableOpacity>
              </View>

              {pub.texto ? <Text style={styles.texto}>{pub.texto}</Text> : null}

              {pub.imagen && (
                <Image
                  source={{ uri: pub.imagen }}
                  style={{ width: '100%', height: 200, borderRadius: 12, marginBottom: 12 }}
                  resizeMode="cover"
                />
              )}

              {pub.video && (
                <Video
                  source={{ uri: pub.video }}
                  style={{ width: '100%', height: 200, borderRadius: 12, marginBottom: 12 }}
                  resizeMode={ResizeMode.COVER}
                  useNativeControls
                  isLooping={false}
                />
              )}

              {menuAbierto === pub.id && (
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
                        router.push({ pathname: '/reportar', params: { pubId: pub.id } });
                      }}
                    >
                      <Text style={styles.menuItemTexto}>🚩 Reportar</Text>
                    </TouchableOpacity>
                    {esMio && (
                      <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => {
                          eliminarPublicacion(pub.id);
                          setPublicaciones(prev => prev.filter(p => p.id !== pub.id));
                          setMenuAbierto(null);
                        }}
                      >
                        <Text style={[styles.menuItemTexto, { color: '#ff6b6b' }]}>🗑 Eliminar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}

              <View style={styles.acciones}>
                <TouchableOpacity
                  style={styles.boton}
                  accessibilityLabel={`Me gusta, ${pub.likes || 0} likes`}
                  accessibilityRole="button"
                  onPress={() => darLike(pub.id, pub.likes || 0)}
                >
                  <Text style={styles.botonTexto}>♡ {pub.likes || 0}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.boton}
                  accessibilityLabel="Comentarios"
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/comentarios', params: { pubId: pub.id } })}
                >
                  <Text style={styles.botonTexto}>💬 {pub.comentarios || 0}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.boton}
                  accessibilityLabel={leyendoPub === pub.id ? 'Detener lectura' : 'Leer en voz alta'}
                  accessibilityRole="button"
                  onPress={() => leerPublicacion(pub)}
                >
                  <Text style={[styles.botonTexto, leyendoPub === pub.id && { color: Colors.eli.primary }]}>
                    {leyendoPub === pub.id ? '⏹' : '🔊'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.boton}
                  accessibilityLabel="Compartir publicación"
                  accessibilityRole="button"
                  onPress={() => compartir(pub)}
                >
                  <Text style={styles.botonTexto}>↗ Compartir</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        style={styles.botonPublicar}
        accessibilityLabel="Crear nueva publicación"
        accessibilityRole="button"
        onPress={() => router.push('/nueva-publicacion')}
      >
        <Text style={styles.botonPublicarTexto}>+ Publicar</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: Colors.eli.border,
  },
  logo: {
    color: Colors.eli.primary,
    fontSize: 22,
    fontWeight: 'bold',
    marginRight: 12,
  },
  headerTitle: {
    color: Colors.eli.white,
    fontSize: 18,
    fontWeight: '600',
  },
  feed: {
    flex: 1,
    padding: 16,
  },
  vacio: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 8,
  },
  vacioTexto: {
    color: Colors.eli.white,
    fontSize: 16,
    fontWeight: '600',
  },
  vacioSub: {
    color: Colors.eli.grayLight,
    fontSize: 14,
  },
  tarjeta: {
    backgroundColor: 'transparent',
    padding: 16,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#323D54',
  },
  tarjetaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.eli.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: Colors.eli.background,
    fontWeight: 'bold',
    fontSize: 16,
  },
  usuarioInfo: {
    flex: 1,
  },
  usuario: {
    color: Colors.eli.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  tiempo: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    marginTop: 2,
  },
  botonSeguirHeader: {
    borderWidth: 1,
    borderColor: Colors.eli.primary,
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  botonSiguiendoHeader: {
    borderColor: Colors.eli.grayLight,
  },
  botonSeguirHeaderTexto: {
    color: Colors.eli.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  botonSiguiendoHeaderTexto: {
    color: Colors.eli.grayLight,
  },
  texto: {
    color: Colors.eli.white,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  acciones: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.eli.border,
    paddingTop: 10,
    gap: 16,
  },
  boton: {
    paddingVertical: 4,
  },
  botonTexto: {
    color: Colors.eli.grayLight,
    fontSize: 13,
  },
  botonPublicar: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    backgroundColor: Colors.eli.primary,
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  botonPublicarTexto: {
    color: Colors.eli.background,
    fontWeight: 'bold',
    fontSize: 15,
  },
  botonMenu: {
    marginLeft: 8,
    padding: 4,
    paddingHorizontal: 8,
  },
  botonMenuTexto: {
    color: Colors.eli.grayLight,
    fontSize: 18,
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
    top: 50,
    right: 0,
    backgroundColor: '#1E2A3A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    zIndex: 20,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.eli.border,
  },
  menuItemTexto: {
    color: Colors.eli.white,
    fontSize: 14,
  },
  bannerLibertad: {
    backgroundColor: 'rgba(0,201,177,0.08)',
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,201,177,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerTexto: {
    flex: 1,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontStyle: 'italic',
  },
  bannerCerrar: {
    padding: 4,
  },
  bannerCerrarTexto: {
    color: Colors.eli.grayLight,
    fontSize: 16,
  },
  bannerModeracion: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,60,60,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,60,60,0.25)',
    borderRadius: 10,
    padding: 14,
    marginHorizontal: 12,
    marginBottom: 12,
    gap: 12,
  },
  bannerModIcono: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,60,60,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,60,60,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  bannerModIconoTexto: {
    fontSize: 16,
    color: '#ff4444',
  },
  bannerModContenido: {
    flex: 1,
  },
  bannerModTitulo: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ff6b6b',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  bannerModTexto: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 18,
    marginBottom: 8,
  },
  bannerModSeparador: {
    height: 1,
    backgroundColor: 'rgba(255,60,60,0.15)',
    marginBottom: 8,
  },
  bannerModConsecuencias: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 4,
  },
  bannerModFila: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 2,
  },
  bannerModPunto: {
    fontSize: 12,
    color: '#ff4444',
    lineHeight: 18,
  },
  bannerModItem: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 18,
    flex: 1,
  },
  bannerModPie: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontStyle: 'italic',
    marginTop: 6,
    marginBottom: 10,
  },
  bannerModBoton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,60,60,0.4)',
  },
  bannerModBotonTexto: {
    fontSize: 12,
    color: '#ff6b6b',
    fontWeight: '600',
  },
});
