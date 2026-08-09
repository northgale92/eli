import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useState, useEffect, useCallback } from 'react';
import { cargarConversaciones, borrarConversacion, alternarFijado, suscribirConversacionesEntrantes, type Conversacion } from '../../services/chat';
import { cargarGrupos, borrarGrupoLocal, suscribirGruposPropios, agregarGrupoSiNuevo, type Grupo } from '../../services/grupos';
import { obtenerUsuario, obtenerNombreVisible, obtenerFotoPerfil, obtenerIdentidad } from '../../services/identidad';
import { leerPerfil } from '../../services/gun';
import { Avatar } from '../../components/Avatar';
import {
  cargarEstadosPropios, cargarEstadosRecibidos, suscribirEstadosDeContactos, obtenerContactosParaEstados,
  limpiarEstadosPropiosExpirados, cargarVistosLocalmente, type Estado,
} from '../../services/estados';

function agruparPorAutor(estados: Estado[]): Record<string, Estado[]> {
  const grupos: Record<string, Estado[]> = {};
  estados.forEach(e => {
    if (!grupos[e.autor]) grupos[e.autor] = [];
    grupos[e.autor].push(e);
  });
  return grupos;
}

type ItemLista =
  | { esGrupo: false; conv: Conversacion }
  | { esGrupo: true; grupo: Grupo };

function formatoHora(ts: number): string {
  const ahora = Date.now();
  const diff = ahora - ts;
  const d = new Date(ts);
  if (diff < 86400000) return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (diff < 172800000) return 'Ayer';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

export default function Chat() {
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [miId, setMiId] = useState<string | null>(null);
  const [miNombre, setMiNombre] = useState<string | null>(null);
  const [miFoto, setMiFoto] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  // usuario -> perfil ya resuelto desde Gun (nombre visible + foto), para
  // pintar el avatar real de cada conversación en la lista.
  const [perfilesContactos, setPerfilesContactos] = useState<Record<string, { nombreVisible?: string; fotoPerfil?: string }>>({});
  const [estadosPropios, setEstadosPropios] = useState<Estado[]>([]);
  const [estadosContactos, setEstadosContactos] = useState<Record<string, Estado[]>>({});
  const [vistosLocal, setVistosLocal] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    const [convs, gruposLocal, usuario, nombre, foto] = await Promise.all([
      cargarConversaciones(), cargarGrupos(), obtenerUsuario(), obtenerNombreVisible(), obtenerFotoPerfil(),
    ]);
    setConversaciones(convs);
    setGrupos(gruposLocal);
    setMiId(usuario);
    setMiNombre(nombre);
    setMiFoto(foto);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Resuelve el perfil (nombre visible + foto) de cada contraparte con
  // conversación activa. Solo se re-consulta cuando aparece un contraparte
  // nuevo que aún no tengamos en caché — evita relanzar N consultas a Gun en
  // cada refresco de la lista.
  useEffect(() => {
    const pendientes = conversaciones
      .map(c => c.contraparte)
      .filter(u => !(u in perfilesContactos));
    if (pendientes.length === 0) return;
    (async () => {
      const resultados = await Promise.all(pendientes.map(u => leerPerfil(u)));
      setPerfilesContactos(prev => {
        const copia = { ...prev };
        pendientes.forEach((u, i) => {
          copia[u] = { nombreVisible: resultados[i]?.nombreVisible, fotoPerfil: resultados[i]?.fotoPerfil };
        });
        return copia;
      });
    })();
  }, [conversaciones, perfilesContactos]);

  // Descubre grupos a los que alguien más nos añadió como miembro.
  useEffect(() => {
    if (!miId) return;
    const cancelar = suscribirGruposPropios(miId, async (grupo) => {
      await agregarGrupoSiNuevo(grupo);
      const lista = await cargarGrupos();
      setGrupos(lista);
    });
    return cancelar;
  }, [miId]);

  // Descubre conversaciones 1:1 entrantes (alguien nos escribió por primera
  // vez y nunca abrimos su conversación manualmente) y mantiene la lista al
  // día con nuevos mensajes en conversaciones ya conocidas. Ver
  // suscribirConversacionesEntrantes en services/chat.ts para el porqué esto
  // hacía falta además de la carga inicial de cargar().
  useEffect(() => {
    if (!miId) return;
    let cancelar: (() => void) | null = null;
    (async () => {
      const id = await obtenerIdentidad();
      if (!id) return;
      cancelar = suscribirConversacionesEntrantes(id.usuario, id.clavePrivada, async () => {
        const lista = await cargarConversaciones();
        setConversaciones(lista);
      });
    })();
    return () => cancelar?.();
  }, [miId]);

  // Estados: limpia los propios ya vencidos, carga los propios y los de
  // contactos ya en caché, y se suscribe a los nuevos que lleguen.
  useEffect(() => {
    if (!miId) return;
    let cancelar: (() => void) | null = null;

    (async () => {
      await limpiarEstadosPropiosExpirados(miId);
      const [propios, vistos] = await Promise.all([cargarEstadosPropios(), cargarVistosLocalmente()]);
      setEstadosPropios(propios);
      setVistosLocal(vistos);

      const id = await obtenerIdentidad();
      const contactos = await obtenerContactosParaEstados();
      if (!id || contactos.length === 0) return;

      const recibidosIniciales = await cargarEstadosRecibidos(contactos);
      setEstadosContactos(agruparPorAutor(recibidosIniciales));

      cancelar = suscribirEstadosDeContactos(contactos, id.usuario, id.clavePrivada, (estado) => {
        setEstadosContactos(prev => {
          const lista = prev[estado.autor] ? [...prev[estado.autor]] : [];
          if (lista.find(e => e.id === estado.id)) return prev;
          lista.push(estado);
          return { ...prev, [estado.autor]: lista };
        });
      });
    })();

    return () => cancelar?.();
  }, [miId]);

  const refrescar = async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  };

  const confirmarBorrar = (conv: Conversacion) => {
    Alert.alert(
      'Borrar conversación',
      `¿Borrar la conversación con ${conv.contraparte}? Los mensajes locales se eliminarán.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            if (!miId) return;
            await borrarConversacion(conv.id, conv.contraparte, miId);
            setConversaciones(prev => prev.filter(c => c.id !== conv.id));
          },
        },
      ],
    );
  };

  const confirmarSalirGrupo = (grupo: Grupo) => {
    Alert.alert(
      'Salir del grupo',
      `Se eliminará el historial local de "${grupo.nombre}" en este dispositivo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: async () => {
            await borrarGrupoLocal(grupo.id);
            setGrupos(prev => prev.filter(g => g.id !== grupo.id));
          },
        },
      ],
    );
  };

  const alternarFijar = async (conv: Conversacion) => {
    await alternarFijado(conv.id);
    await cargar();
  };

  const combinada: ItemLista[] = [
    ...conversaciones.map((conv): ItemLista => ({ esGrupo: false, conv })),
    ...grupos.map((grupo): ItemLista => ({ esGrupo: true, grupo })),
  ].sort((a, b) => {
    const aFijado = !a.esGrupo && !!a.conv.fijado;
    const bFijado = !b.esGrupo && !!b.conv.fijado;
    if (aFijado !== bFijado) return aFijado ? -1 : 1;
    const aHora = a.esGrupo ? a.grupo.ultimaHora : a.conv.ultimaHora;
    const bHora = b.esGrupo ? b.grupo.ultimaHora : b.conv.ultimaHora;
    return bHora - aHora;
  });

  const filtradas = busqueda.trim()
    ? combinada.filter(it => {
      const nombre = it.esGrupo ? it.grupo.nombre : it.conv.contraparte;
      return nombre.toLowerCase().includes(busqueda.toLowerCase());
    })
    : combinada;

  const abrirMenuNuevo = () => {
    Alert.alert('Nuevo', undefined, [
      { text: 'Nueva conversación', onPress: () => router.push('/nueva-conversacion') },
      { text: 'Nuevo grupo', onPress: () => router.push('/grupo-nuevo') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  return (
    <LinearGradient colors={['#2c2c2c', '#1a1a1a', '#141414']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>ELI</Text>
        <Text style={styles.headerTitle}>Chat</Text>
        <TouchableOpacity
          onPress={() => router.push('/perfil')}
          accessibilityLabel="Ver mi perfil"
          accessibilityRole="button"
          style={{ marginRight: 8 }}
        >
          <Avatar nombre={miNombre || miId || '?'} fotoBase64={miFoto} size={32} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerIcono, { marginRight: 4 }]}
          onPress={() => router.push('/contactos' as any)}
          accessibilityLabel="Contactos de la agenda"
          accessibilityRole="button"
        >
          <Text style={[styles.iconoTexto, { fontSize: 13, paddingHorizontal: 4 }]}>Agenda</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerIcono}
          onPress={abrirMenuNuevo}
          accessibilityLabel="Nueva conversación o grupo"
          accessibilityRole="button"
        >
          <Text style={styles.iconoTexto}>+</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.estadosFila} contentContainerStyle={{ paddingHorizontal: 12, gap: 14 }}>
        <TouchableOpacity
          style={styles.estadoCirculo}
          onPress={() => router.push((estadosPropios.length > 0 ? { pathname: '/ver-estado', params: { autorId: miId ?? '' } } : '/crear-estado') as any)}
          onLongPress={() => router.push('/crear-estado' as any)}
          accessibilityLabel={estadosPropios.length > 0 ? 'Ver tu estado' : 'Añadir un estado'}
          accessibilityRole="button"
        >
          <View style={[styles.anillo, estadosPropios.length > 0 && styles.anilloPropio]}>
            <Avatar nombre={miNombre || miId || '?'} fotoBase64={miFoto} size={54} />
          </View>
          {estadosPropios.length === 0 && (
            <View style={styles.masBadge}><Text style={styles.masBadgeTexto}>+</Text></View>
          )}
          <Text style={styles.estadoNombre} numberOfLines={1}>Tu estado</Text>
        </TouchableOpacity>

        {Object.entries(estadosContactos)
          .sort(([, a], [, b]) => Math.max(...b.map(e => e.creadoEn)) - Math.max(...a.map(e => e.creadoEn)))
          .map(([autor, lista]) => {
            const hayNoVisto = lista.some(e => !vistosLocal.has(e.id));
            return (
              <TouchableOpacity
                key={autor}
                style={styles.estadoCirculo}
                onPress={() => router.push({ pathname: '/ver-estado', params: { autorId: autor } } as any)}
                accessibilityLabel={`Ver estado de ${perfilesContactos[autor]?.nombreVisible || autor}`}
                accessibilityRole="button"
              >
                <View style={[styles.anillo, hayNoVisto && styles.anilloNoVisto]}>
                  <Avatar
                    nombre={perfilesContactos[autor]?.nombreVisible || autor}
                    fotoBase64={perfilesContactos[autor]?.fotoPerfil}
                    size={54}
                  />
                </View>
                <Text style={styles.estadoNombre} numberOfLines={1}>
                  {perfilesContactos[autor]?.nombreVisible || autor}
                </Text>
              </TouchableOpacity>
            );
          })}
      </ScrollView>

      <TextInput
        style={styles.buscador}
        placeholder="Buscar conversación..."
        placeholderTextColor={Colors.eli.grayLight}
        value={busqueda}
        onChangeText={setBusqueda}
        accessibilityLabel="Buscar conversación"
      />

      <ScrollView
        style={styles.lista}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} tintColor={Colors.eli.primary} />}
      >
        {filtradas.length === 0 && (
          <View style={styles.vacio}>
            <Text style={styles.vacioTexto}>
              {busqueda ? 'Sin resultados' : 'Sin conversaciones aún.\nPulsa + para empezar una.'}
            </Text>
          </View>
        )}
        {filtradas.map((it) => {
          if (it.esGrupo) {
            const { grupo } = it;
            return (
              <TouchableOpacity
                key={`g_${grupo.id}`}
                style={styles.fila}
                accessibilityLabel={`Grupo ${grupo.nombre}. ${grupo.noLeidos > 0 ? `${grupo.noLeidos} mensajes sin leer` : 'Sin mensajes nuevos'}`}
                accessibilityRole="button"
                accessibilityHint="Mantén pulsado para opciones"
                onPress={() => router.push({ pathname: '/grupo', params: { grupoId: grupo.id, nombre: grupo.nombre } })}
                onLongPress={() =>
                  Alert.alert(grupo.nombre, undefined, [
                    { text: 'Salir del grupo', style: 'destructive', onPress: () => confirmarSalirGrupo(grupo) },
                    { text: 'Cancelar', style: 'cancel' },
                  ])
                }
              >
                <View style={[styles.avatar, styles.avatarGrupo]}>
                  <Text style={styles.avatarText}>👥</Text>
                </View>
                <View style={styles.info}>
                  <View style={styles.filaArriba}>
                    <Text style={styles.usuario}>{grupo.nombre}</Text>
                    <Text style={styles.hora}>{grupo.ultimaHora ? formatoHora(grupo.ultimaHora) : ''}</Text>
                  </View>
                  <View style={styles.filaAbajo}>
                    <Text style={styles.ultimoMensaje} numberOfLines={1}>
                      {grupo.ultimoMensaje || `${grupo.participantes.length} miembros`}
                    </Text>
                    {grupo.noLeidos > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeTexto}>{grupo.noLeidos}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }

          const { conv } = it;
          return (
            <TouchableOpacity
              key={conv.id}
              style={styles.fila}
              accessibilityLabel={`Conversación con ${conv.contraparte}. Último mensaje: ${conv.ultimoMensaje}. ${conv.noLeidos > 0 ? `${conv.noLeidos} mensajes sin leer` : 'Sin mensajes nuevos'}`}
              accessibilityRole="button"
              accessibilityHint="Mantén pulsado para opciones"
              onPress={() => router.push({ pathname: '/conversacion', params: { destinatario: conv.contraparte } })}
              onLongPress={() =>
                Alert.alert(conv.contraparte, undefined, [
                  { text: 'Escuchar último mensaje', onPress: () => Speech.speak(conv.ultimoMensaje, { language: 'es-ES' }) },
                  { text: conv.fijado ? 'Desfijar conversación' : 'Fijar conversación', onPress: () => alternarFijar(conv) },
                  { text: 'Borrar conversación', style: 'destructive', onPress: () => confirmarBorrar(conv) },
                  { text: 'Cancelar', style: 'cancel' },
                ])
              }
            >
              <Avatar
                nombre={perfilesContactos[conv.contraparte]?.nombreVisible || conv.contraparte}
                fotoBase64={perfilesContactos[conv.contraparte]?.fotoPerfil}
                size={50}
                style={{ marginRight: 12 }}
              />
              <View style={styles.info}>
                <View style={styles.filaArriba}>
                  <Text style={styles.usuario}>
                    {conv.fijado ? '📌 ' : ''}{perfilesContactos[conv.contraparte]?.nombreVisible || conv.contraparte}
                  </Text>
                  <Text style={styles.hora}>{formatoHora(conv.ultimaHora)}</Text>
                </View>
                <View style={styles.filaAbajo}>
                  <Text style={styles.ultimoMensaje} numberOfLines={1}>{conv.ultimoMensaje}</Text>
                  {conv.noLeidos > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeTexto}>{conv.noLeidos}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        style={styles.botonNuevo}
        accessibilityLabel="Nueva conversación o grupo"
        accessibilityRole="button"
        onPress={abrirMenuNuevo}
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
  },
  logo: { color: Colors.eli.primary, fontSize: 22, fontWeight: 'bold', marginRight: 12 },
  headerTitle: { color: Colors.eli.white, fontSize: 18, fontWeight: '600', flex: 1 },
  avatarPropio: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.eli.primary,
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  avatarPropioTexto: { color: Colors.eli.background, fontWeight: 'bold', fontSize: 14 },
  headerIcono: { padding: 4 },
  iconoTexto: { fontSize: 20, color: Colors.eli.white },
  estadosFila: { maxHeight: 92, borderBottomWidth: 1, borderBottomColor: Colors.eli.border, paddingVertical: 10 },
  estadoCirculo: { alignItems: 'center', width: 64 },
  anillo: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  anilloPropio: { borderColor: Colors.eli.grayLight },
  anilloNoVisto: { borderColor: Colors.eli.primary },
  masBadge: {
    position: 'absolute', bottom: 14, right: 0,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.eli.primary, borderWidth: 2, borderColor: Colors.eli.background,
    alignItems: 'center', justifyContent: 'center',
  },
  masBadgeTexto: { color: Colors.eli.background, fontSize: 13, fontWeight: 'bold', lineHeight: 14 },
  estadoNombre: { color: Colors.eli.grayLight, fontSize: 11, marginTop: 4, maxWidth: 64, textAlign: 'center' },
  buscador: {
    margin: 12, backgroundColor: Colors.eli.grayDark,
    borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: Colors.eli.border,
    color: Colors.eli.white, fontSize: 14,
  },
  lista: { flex: 1 },
  vacio: { flex: 1, alignItems: 'center', paddingTop: 60 },
  vacioTexto: { color: Colors.eli.grayLight, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  fila: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.eli.border,
  },
  avatar: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: Colors.eli.primary,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarGrupo: { backgroundColor: Colors.eli.grayDark, borderWidth: 1, borderColor: Colors.eli.border },
  avatarText: { color: Colors.eli.background, fontWeight: 'bold', fontSize: 20 },
  info: { flex: 1 },
  filaArriba: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  filaAbajo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  usuario: { color: Colors.eli.white, fontWeight: '600', fontSize: 15 },
  hora: { color: Colors.eli.grayLight, fontSize: 12 },
  ultimoMensaje: { color: Colors.eli.grayLight, fontSize: 13, flex: 1, marginRight: 8 },
  badge: {
    backgroundColor: Colors.eli.primary, borderRadius: 10,
    minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeTexto: { color: Colors.eli.background, fontSize: 11, fontWeight: 'bold' },
  botonNuevo: {
    position: 'absolute', bottom: 80, right: 20,
    backgroundColor: Colors.eli.primary, borderRadius: 30,
    width: 56, height: 56,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 999, elevation: 10,
  },
  botonNuevoTexto: { fontSize: 24, color: Colors.eli.background },
});
