


import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { useEffect, useState } from 'react';
import { escucharCanales, obtenerSuscritos, suscribirse, desuscribirse } from '../../services/canales';
import { obtenerUsuario } from '../../services/identidad';


type Filtro = 'canales' | 'usuarios';

const TARIFAS = [
  { rango: '0 – 1.000 seguidores', precio: 'Gratis' },
  { rango: '1.000 – 10.000', precio: '5 €/mes' },
  { rango: '10.000 – 50.000', precio: '10 €/mes' },
  { rango: '50.000 – 100.000', precio: '20 €/mes' },
  { rango: '+100.000', precio: '50 €/mes' },
];

function TarifasMenu() {
  return (
    <View style={tarifasStyles.box}>
      <Text style={tarifasStyles.titulo}>Canal verificado (medio o marca)</Text>
      {TARIFAS.map(({ rango, precio }) => (
        <View key={rango} style={tarifasStyles.fila}>
          <Text style={tarifasStyles.rango}>{rango}</Text>
          <Text style={tarifasStyles.precio}>{precio}</Text>
        </View>
      ))}
      <View style={tarifasStyles.descuento}>
        <Text style={tarifasStyles.descuentoTexto}>
          Hispanoamérica, Asia y África: mitad de precio.{'\n'}
          Los canales de comunidad son siempre gratuitos.
        </Text>
      </View>
    </View>
  );
}

const tarifasStyles = StyleSheet.create({
  box: {
    backgroundColor: 'rgba(0,201,177,0.08)',
    borderTopWidth: 0,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,201,177,0.3)',
    borderTopColor: 'transparent',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 0,
  },
  titulo: {
    color: Colors.eli.primary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.eli.border,
  },
  rango: {
    color: Colors.eli.grayLight,
    fontSize: 13,
  },
  precio: {
    color: Colors.eli.white,
    fontSize: 13,
    fontWeight: '600',
  },
  descuento: {
    marginTop: 10,
    backgroundColor: 'rgba(0,201,177,0.08)',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,201,177,0.3)',
  },
  descuentoTexto: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    lineHeight: 18,
  },
});

export default function Canales() {
  const [canales, setCanales] = useState<any[]>([]);
  const [suscritos, setSuscritos] = useState<string[]>([]);
  const [miUsuario, setMiUsuario] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('canales');
  const [buscando, setBuscando] = useState(false);
  const [modoSearch, setModoSearch] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const usuario = await obtenerUsuario();
      setMiUsuario(usuario || '');
      if (usuario) setSuscritos(await obtenerSuscritos(usuario));
    })();

    return escucharCanales((canal) => {
      setCanales(prev => {
        const existe = prev.findIndex(c => c.id === canal.id);
        if (existe >= 0) return prev;
        return [canal, ...prev];
      });
    });
  }, []);

  const toggleSuscribirse = async (canalId: string) => {
    if (!miUsuario) return;
    if (suscritos.includes(canalId)) {
      await desuscribirse(canalId, miUsuario);
      setSuscritos(prev => prev.filter(id => id !== canalId));
    } else {
      await suscribirse(canalId, miUsuario);
      setSuscritos(prev => [...prev, canalId]);
    }
  };

  const handleBuscar = (texto: string) => {
    setBusqueda(texto);
    if (texto.length > 0) setBuscando(true);
    else setBuscando(false);
  };

    const canalesFiltrados = canales.filter(c => {
    if (!busqueda) return true;
    const termino = busqueda.toLowerCase();
    if (filtro === 'canales') {
      return c.nombre.toLowerCase().includes(termino) ||
             c.descripcion?.toLowerCase().includes(termino);
    }
    if (filtro === 'usuarios') {
      return c.creador?.toLowerCase().includes(termino);
    }
    return true;
  });

  const canalesSuscritos = canalesFiltrados.filter(c => suscritos.includes(c.id));
  const canalesDescubrir = canalesFiltrados.filter(c => !suscritos.includes(c.id));

  return (
    <LinearGradient colors={['#2c2c2c', '#1a1a1a', '#141414']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>ELI</Text>
        {modoSearch ? (
          <View style={styles.searchBox}>
            <Text style={styles.searchIcono}>⌕</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Canales, usuarios..."
              placeholderTextColor={Colors.eli.grayLight}
              value={busqueda}
              onChangeText={handleBuscar}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            {busqueda.length > 0 && (
              <TouchableOpacity onPress={() => setBusqueda('')}>
                <Text style={{ color: Colors.eli.grayLight, fontSize: 14 }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Text style={styles.headerTitle}>Canales</Text>
        )}
        <TouchableOpacity
          onPress={() => {
            setModoSearch(!modoSearch);
            setBusqueda('');
            setBuscando(false);
          }}
          style={styles.lupaBoton}
          accessibilityLabel={modoSearch ? 'Cerrar búsqueda' : 'Buscar canales'}
          accessibilityRole="button"
        >
          <Text style={styles.lupaIcono}>{modoSearch ? '✕' : '⌕'}</Text>
        </TouchableOpacity>
      </View>

      {modoSearch && (
        <View style={styles.filtros}>










                    {(['canales', 'usuarios'] as Filtro[]).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filtroBoton, filtro === f && styles.filtroActivo]}
              onPress={() => setFiltro(f)}
            >
              <Text style={[styles.filtroTexto, filtro === f && styles.filtroTextoActivo]}>
                {f === 'canales' ? 'Canales' : 'Usuarios'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView style={styles.lista}>
        {/* Bienvenida */}
        <View style={styles.bienvenidaBox}>
          <Text style={styles.bienvenidaTitulo}>Cómo funcionan los Canales</Text>
          <Text style={styles.bienvenidaTexto}>
            Un canal es un espacio de difusión:{' '}
            <Text style={styles.bienvenidaDestacado}>el creador publica, la comunidad sigue.</Text>
            {' '}Los canales de comunidad son{' '}
            <Text style={styles.bienvenidaDestacado}>siempre gratuitos.</Text>
            {'\n\n'}
            Los enlaces escritos en un canal aparecen como texto plano y{' '}
            <Text style={styles.bienvenidaDestacado}>nunca son clicables.</Text>
            {' '}Es una decisión de seguridad: los canales que enlazan a otros construyen redes invisibles de contenido ilegal o dañino. En ELI eso no ocurrirá.
          </Text>
        </View>

        {modoSearch && busqueda.length > 0 ? (
          <>
            {canalesFiltrados.length === 0 ? (
              <View style={styles.vacio}>
                <Text style={styles.vacioTexto}>Sin resultados.</Text>
                <Text style={styles.vacioSub}>Prueba con otro término.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.seccion}>Resultados</Text>
                {canalesFiltrados.map((canal) => (
                  <View key={canal.id}>
                    <TouchableOpacity
                      style={styles.tarjeta}
                      onPress={() => router.push({ pathname: '/canal', params: { id: canal.id, nombre: canal.nombre, descripcion: canal.descripcion, creador: canal.creador } })}
                    >
                      <View style={styles.canalAvatar}>
                        <Text style={styles.canalAvatarTexto}>{canal.nombre[0]}</Text>
                      </View>
                      <View style={styles.info}>
                        <Text style={styles.nombre}>{canal.nombre}</Text>
                        <Text style={styles.descripcion} numberOfLines={1}>{canal.descripcion}</Text>
                        <Text style={styles.creador}>por @{canal.creador}</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.botonAccion, suscritos.includes(canal.id) && styles.botonAccionActivo]}
                        onPress={() => toggleSuscribirse(canal.id)}
                      >
                        <Text style={[styles.botonAccionTexto, suscritos.includes(canal.id) && styles.botonAccionTextoActivo]}>
                          {suscritos.includes(canal.id) ? 'Suscrito' : '+ Unirse'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.menuBoton}
                        onPress={() => setMenuAbierto(menuAbierto === canal.id ? null : canal.id)}
                        accessibilityLabel="Ver tarifas del canal"
                        accessibilityRole="button"
                      >
                        <Text style={styles.menuBotonTexto}>···</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                    {menuAbierto === canal.id && <TarifasMenu />}
                  </View>
                ))}
              </>
            )}
          </>
        ) : (
          <>
            {canalesSuscritos.length > 0 && (
              <>
                <Text style={styles.seccion}>Suscritos</Text>
                {canalesSuscritos.map((canal) => (
                  <View key={canal.id}>
                    <TouchableOpacity
                      style={styles.tarjeta}
                      onPress={() => router.push({ pathname: '/canal', params: { id: canal.id, nombre: canal.nombre, descripcion: canal.descripcion, creador: canal.creador } })}
                    >
                      <View style={styles.canalAvatar}>
                        <Text style={styles.canalAvatarTexto}>{canal.nombre[0]}</Text>
                      </View>
                      <View style={styles.info}>
                        <Text style={styles.nombre}>{canal.nombre}</Text>
                        <Text style={styles.descripcion} numberOfLines={1}>{canal.descripcion}</Text>
                        <Text style={styles.creador}>por @{canal.creador}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.botonAccionActivo}
                        onPress={() => toggleSuscribirse(canal.id)}
                      >
                        <Text style={styles.botonAccionTextoActivo}>Suscrito</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.menuBoton}
                        onPress={() => setMenuAbierto(menuAbierto === canal.id ? null : canal.id)}
                        accessibilityLabel="Ver tarifas del canal"
                        accessibilityRole="button"
                      >
                        <Text style={styles.menuBotonTexto}>···</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                    {menuAbierto === canal.id && <TarifasMenu />}
                  </View>
                ))}
              </>
            )}

            {canalesDescubrir.length > 0 && (
              <>
                <Text style={styles.seccion}>
                  {canalesSuscritos.length > 0 ? 'Descubrir' : 'Canales'}
                </Text>
                {canalesDescubrir.map((canal) => (
                  <View key={canal.id}>
                    <TouchableOpacity
                      style={styles.tarjeta}
                      onPress={() => router.push({ pathname: '/canal', params: { id: canal.id, nombre: canal.nombre, descripcion: canal.descripcion, creador: canal.creador } })}
                    >
                      <View style={styles.canalAvatar}>
                        <Text style={styles.canalAvatarTexto}>{canal.nombre[0]}</Text>
                      </View>
                      <View style={styles.info}>
                        <Text style={styles.nombre}>{canal.nombre}</Text>
                        <Text style={styles.descripcion} numberOfLines={1}>{canal.descripcion}</Text>
                        <Text style={styles.creador}>por @{canal.creador}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.botonAccion}
                        onPress={() => toggleSuscribirse(canal.id)}
                      >
                        <Text style={styles.botonAccionTexto}>+ Unirse</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.menuBoton}
                        onPress={() => setMenuAbierto(menuAbierto === canal.id ? null : canal.id)}
                        accessibilityLabel="Ver tarifas del canal"
                        accessibilityRole="button"
                      >
                        <Text style={styles.menuBotonTexto}>···</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                    {menuAbierto === canal.id && <TarifasMenu />}
                  </View>
                ))}
              </>
            )}

            {canales.length === 0 && (
              <View style={styles.vacio}>
                <Text style={styles.vacioTexto}>No hay canales todavía.</Text>
                <Text style={styles.vacioSub}>Sé el primero en crear uno.</Text>
              </View>
            )}
          </>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      <TouchableOpacity
        style={styles.botonNuevo}
        accessibilityLabel="Crear nuevo canal"
        accessibilityRole="button"
        onPress={() => router.push('/nuevo-canal')}
      >
        <Text style={styles.botonNuevoTexto}>+</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, paddingTop: 50,
    borderBottomWidth: 1, borderBottomColor: Colors.eli.border,
    gap: 8,
  },
  logo: { color: Colors.eli.primary, fontSize: 22, fontWeight: 'bold' },
  headerTitle: { color: Colors.eli.white, fontSize: 18, fontWeight: '600', flex: 1 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.eli.grayDark, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.eli.primary,
    paddingHorizontal: 10, gap: 6,
  },
  searchIcono: { color: Colors.eli.grayLight, fontSize: 16 },
  searchInput: { flex: 1, color: Colors.eli.white, fontSize: 14, paddingVertical: 8 },
  lupaBoton: { padding: 4 },
  lupaIcono: { color: Colors.eli.grayLight, fontSize: 20 },
  filtros: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: Colors.eli.border,
  },
  filtroBoton: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  filtroActivo: { borderBottomWidth: 2, borderBottomColor: Colors.eli.primary },
  filtroTexto: { color: Colors.eli.grayLight, fontSize: 13, fontWeight: '600' },
  filtroTextoActivo: { color: Colors.eli.primary },
  lista: { flex: 1 },
  seccion: {
    color: Colors.eli.grayLight, fontSize: 11,
    fontWeight: '600', paddingHorizontal: 16,
    paddingVertical: 10, textTransform: 'uppercase', letterSpacing: 1,
  },
  tarjeta: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.eli.border,
    gap: 10,
  },
  canalAvatar: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: Colors.eli.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  canalAvatarTexto: { color: Colors.eli.background, fontWeight: 'bold', fontSize: 20 },
  info: { flex: 1 },
  nombre: { color: Colors.eli.white, fontWeight: '600', fontSize: 14, marginBottom: 2 },
  descripcion: { color: Colors.eli.grayLight, fontSize: 12, marginBottom: 2 },
  creador: { color: Colors.eli.primary, fontSize: 11 },
  botonAccion: {
    borderWidth: 1, borderColor: Colors.eli.primary,
    borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12,
  },
  botonAccionActivo: {
    borderWidth: 1, borderColor: Colors.eli.grayLight,
    borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12,
  },
  botonAccionTexto: { color: Colors.eli.primary, fontSize: 12, fontWeight: '600' },
  botonAccionTextoActivo: { color: Colors.eli.grayLight, fontSize: 12, fontWeight: '600' },
  vacio: { alignItems: 'center', paddingTop: 80, gap: 8 },
  vacioTexto: { color: Colors.eli.white, fontSize: 15, fontWeight: '600' },
  vacioSub: { color: Colors.eli.grayLight, fontSize: 13 },
  botonNuevo: {
    position: 'absolute', bottom: 80, right: 20,
    backgroundColor: Colors.eli.primary, borderRadius: 30,
    width: 56, height: 56, alignItems: 'center', justifyContent: 'center',
  },
  botonNuevoTexto: { color: Colors.eli.background, fontSize: 32, fontWeight: 'bold' },
  bienvenidaBox: {
    margin: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(0,201,177,0.08)',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,201,177,0.3)',
  },
  bienvenidaTitulo: {
    color: Colors.eli.white,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  bienvenidaTexto: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    lineHeight: 20,
  },
  bienvenidaDestacado: {
    color: Colors.eli.white,
    fontWeight: '600',
  },
  menuBoton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 4,
  },
  menuBotonTexto: {
    color: Colors.eli.grayLight,
    fontSize: 18,
    letterSpacing: 2,
  },
});
