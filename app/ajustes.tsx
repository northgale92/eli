import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, BackHandler } from 'react-native';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { router } from 'expo-router';
import { obtenerUsuario } from '../services/identidad';
import {
  ejecutarAutodestruccion,
  obtenerPreferenciaBorrarPublicaciones,
  guardarPreferenciaBorrarPublicaciones,
} from '../services/destruirApp';
import {
  estaActivado as codigoAccesoActivado,
  activar as activarCodigoAcceso,
  desactivar as desactivarCodigoAcceso,
} from '../services/codigoAcceso';

const secciones = [
  {
    titulo: 'Identidad',
    items: [
      { label: 'Ver mi clave pública', descripcion: 'Tu identidad en la red ELI' },
      { label: 'Copia de seguridad', descripcion: 'Exportar tu clave privada de forma segura' },
      { label: 'Cerrar sesión', descripcion: 'Salir de tu cuenta en este dispositivo' },
    ]
  },
  {
    titulo: 'Accesibilidad',
    items: [
      { label: 'Texto a voz', descripcion: 'ELI lee los mensajes en voz alta' },
      { label: 'Voz a texto', descripcion: 'Habla para enviar mensajes' },
      { label: 'Fuente grande', descripcion: 'Aumentar el tamaño del texto' },
      { label: 'Alto contraste', descripcion: 'Mayor contraste para baja visión' },
    ]
  },
  {
        titulo: 'Privacidad',
    items: [
      { label: 'Datos almacenados', descripcion: 'Ninguno. ELI no guarda nada tuyo' },
      { label: 'Conexión P2P', descripcion: 'Estado de tu nodo en la red' },
    ]
  },
  {
    titulo: 'Red P2P',
    items: [],
  },
  {
    titulo: 'Transparencia',
    items: [
      { label: 'Reservorio solidario', descripcion: 'Ver el estado actual del fondo' },
      { label: 'Auditoría ciudadana', descripcion: 'Facturas y documentos de proyectos apoyados' },
      { label: 'Historial de donaciones', descripcion: 'Todo el dinero distribuido y su destino' },
    ]
  },
  {
    titulo: 'Contribuir',
    items: [
      { label: 'Donar al servidor', descripcion: 'Ayuda a mantener ELI viva con 1-5 dólares' },
      { label: 'Nodo independiente', descripcion: 'Contribuye a la red con tu propio servidor. ELI no los vende.' },
      { label: 'Contribuir con código', descripcion: 'ELI es código abierto. Ayúdanos a mejorarla' },
    ]
  },
    {
    titulo: 'Emergencia offline',
    items: [],
  },
  {
    titulo: 'Apariencia',
    items: [],
  },
    {
    titulo: 'Notificaciones',
    items: [],
  },
    {
    titulo: 'Almacenamiento',
    items: [],
  },
  {
    titulo: 'Sobre ELI',
    items: [
      { label: 'Manifiesto', descripcion: 'Por qué existe ELI', ruta: '/manifiesto' },
      { label: 'Versión', descripcion: 'ELI v1.0 — Código abierto' },
      { label: 'Licencia', descripcion: 'MIT License — Para el mundo' },
    ]
  },
];

export default function Ajustes() {
  const [modoRed, setModoRed] = useState<'estandar' | 'descentralizado' | 'automatico'>('automatico');
  const [notifMensajes, setNotifMensajes] = useState(true);
  const [notifCanales, setNotifCanales] = useState(true);
  const [notifMuro, setNotifMuro] = useState(true);
  const [notifSolidaria, setNotifSolidaria] = useState(true);
    const [modoP2P, setModoP2P] = useState(false);
  const [bluetoothActivo, setBluetoothActivo] = useState(false);
  const [wifiDirectActivo, setWifiDirectActivo] = useState(false);
  const [idioma, setIdioma] = useState<'es' | 'en'>('es');
  const [temaOscuro, setTemaOscuro] = useState(true);
  const [fuenteChat, setFuenteChat] = useState<'A' | 'AA' | 'AAA'>('AA');
  const [borrarPublicacionesAlSalir, setBorrarPublicacionesAlSalir] = useState(false);
  const [destruyendo, setDestruyendo] = useState(false);

  // "Código de acceso alternativo" — ver services/codigoAcceso.ts. Desactivado
  // por defecto; se carga una sola vez al montar la pantalla, igual que el
  // resto de preferencias en SecureStore de esta pantalla.
  const [codigoAltActivo, setCodigoAltActivo] = useState(false);
  const [modalCodigoVisible, setModalCodigoVisible] = useState(false);
  const [pasoCodigo, setPasoCodigo] = useState<'advertencia' | 'crear' | 'confirmar'>('advertencia');
  const [codigoTemp, setCodigoTemp] = useState('');
  const [codigoInput, setCodigoInput] = useState('');
  const [errorCodigo, setErrorCodigo] = useState(false);

  // El toggle vive en SecureStore (no AsyncStorage), desactivado por defecto.
  // Se carga una sola vez al montar la pantalla.
  useEffect(() => {
    obtenerPreferenciaBorrarPublicaciones().then(setBorrarPublicacionesAlSalir);
    codigoAccesoActivado().then(setCodigoAltActivo);
  }, []);

  // ─── "Código de acceso alternativo" ────────────────────────────────────────
  // La fila en Ajustes es deliberadamente neutra (no debe delatar su función a
  // quien la vea de reojo sin haberla activado). Pero quien SÍ la activa tiene
  // que entender exactamente qué hace antes de poder configurar el PIN — por
  // eso el modal arranca siempre en el paso 'advertencia', tan explícito como
  // el banner rojo de autodestrucción, y solo pasa a 'crear' tras confirmación
  // expresa. Cancelar en cualquier paso no activa nada.
  const abrirConfiguracionCodigo = () => {
    setPasoCodigo('advertencia');
    setCodigoTemp('');
    setCodigoInput('');
    setErrorCodigo(false);
    setModalCodigoVisible(true);
  };

  const confirmarAdvertenciaCodigo = () => {
    setPasoCodigo('crear');
  };

  const onDigitoCodigo = (texto: string) => {
    const limpio = texto.replace(/[^0-9]/g, '').slice(0, 4);
    setCodigoInput(limpio);
    setErrorCodigo(false);
    if (limpio.length !== 4) return;

    if (pasoCodigo === 'crear') {
      setCodigoTemp(limpio);
      setCodigoInput('');
      setPasoCodigo('confirmar');
      return;
    }

    if (limpio === codigoTemp) {
      activarCodigoAcceso(limpio).then(() => {
        setCodigoAltActivo(true);
        setModalCodigoVisible(false);
      });
    } else {
      setErrorCodigo(true);
      setCodigoInput('');
      setPasoCodigo('crear');
      setCodigoTemp('');
    }
  };

  const alternarCodigoAlt = () => {
    if (codigoAltActivo) {
      Alert.alert(
        'Desactivar código de acceso alternativo',
        'Dejará de estar disponible como método de desbloqueo.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Desactivar',
            onPress: async () => {
              await desactivarCodigoAcceso();
              setCodigoAltActivo(false);
            },
          },
        ],
      );
    } else {
      abrirConfiguracionCodigo();
    }
  };

  const alternarBorrarPublicaciones = () => {
    const nuevo = !borrarPublicacionesAlSalir;
    setBorrarPublicacionesAlSalir(nuevo);
    guardarPreferenciaBorrarPublicaciones(nuevo);
  };

  // ─── "Cerrar sesión": logout simple y reversible ───────────────────────────
  // NO llama a destruirApp.ts, NO toca identidad/claves NaCl, NO hace
  // AsyncStorage.clear(). Reutiliza el mismo flag que ya usa dashboard.tsx
  // para el botón atrás (eli-app-bloqueada): solo exige volver a
  // desbloquear la app la próxima vez que se abra; identidad y datos
  // permanecen intactos en el dispositivo.
  const cerrarSesionSimple = () => {
    AsyncStorage.setItem('eli-app-bloqueada', 'true').finally(() => {
      BackHandler.exitApp();
    });
  };

  const confirmarCerrarSesion = () => {
    Alert.alert(
      'Cerrar sesión',
      'Volverás a la pantalla de bloqueo. Tu identidad y tus datos permanecen en este dispositivo — puedes volver a entrar cuando quieras.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesión', onPress: cerrarSesionSimple },
      ],
    );
  };

  // ─── Autodestrucción de cuenta: banner rojo separado, ver más abajo ────────
  // Acción completamente distinta de "Cerrar sesión" — nunca se dispara
  // desde ahí. Es la única que llama a ejecutarAutodestruccion().
  const ejecutarDestruccion = async () => {
    if (destruyendo) return;
    setDestruyendo(true);
    try {
      const usuario = await obtenerUsuario();
      const resultado = await ejecutarAutodestruccion(usuario ?? '', borrarPublicacionesAlSalir);
      if (!resultado.exito) {
        console.warn('[Autodestrucción] completada con errores:', resultado.errores);
      }
    } finally {
      // Los datos locales ya se borraron (o se intentó) — volver siempre al
      // inicio, incluso si algún bloque falló parcialmente.
      router.replace('/terminos');
    }
  };

  const confirmarAutodestruccion = () => {
    Alert.alert(
      'Autodestruir cuenta',
      borrarPublicacionesAlSalir
        ? 'Se borrará tu identidad y todos los datos de ELI en este dispositivo, y también tus publicaciones en el Muro y en los canales. Esta acción no se puede deshacer.'
        : 'Se borrará tu identidad y todos los datos de ELI en este dispositivo. Tus publicaciones en el Muro y canales NO se borrarán. Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar todo', style: 'destructive', onPress: ejecutarDestruccion },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>ELI</Text>
        <Text style={styles.headerTitle}>Ajustes</Text>
      </View>
      <ScrollView style={styles.scroll}>
        {/* Banner de autodestrucción — primera posición, visualmente inconfundible
            del resto del menú (mismo patrón que el aviso de batería Bluetooth/P2P),
            para que nunca se confunda con "Cerrar sesión" más abajo. */}
        <View style={styles.bannerAutodestruccion}>
          <Text style={styles.bannerAutodestruccionTitulo}>⚠️ Autodestrucción de cuenta</Text>
          <Text style={styles.bannerAutodestruccionTexto}>
            Borra tu identidad y todos los datos de ELI en este dispositivo de forma permanente. No se puede deshacer.
          </Text>
          <View style={styles.bannerAutodestruccionToggleFila}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.bannerAutodestruccionToggleLabel}>
                Borrar también mis publicaciones públicas
              </Text>
              <Text style={styles.bannerAutodestruccionTexto}>
                Muro y canales. Apagado: solo se borran los datos de este dispositivo.
              </Text>
            </View>
            <TouchableOpacity
              onPress={alternarBorrarPublicaciones}
              style={{
                width: 48, height: 28, borderRadius: 14,
                backgroundColor: borrarPublicacionesAlSalir ? '#FF3B30' : Colors.eli.border,
                justifyContent: 'center', paddingHorizontal: 3,
              }}
              accessibilityRole="switch"
              accessibilityState={{ checked: borrarPublicacionesAlSalir }}
              accessibilityLabel="Borrar también mis publicaciones públicas al autodestruir la cuenta"
            >
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.eli.white, alignSelf: borrarPublicacionesAlSalir ? 'flex-end' : 'flex-start' }} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={confirmarAutodestruccion}
            disabled={destruyendo}
            style={[styles.bannerAutodestruccionBoton, destruyendo && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Autodestruir cuenta. Borra permanentemente tu identidad y los datos de este dispositivo."
          >
            <Text style={styles.bannerAutodestruccionBotonTexto}>
              {destruyendo ? 'Borrando…' : 'Autodestruir cuenta'}
            </Text>
          </TouchableOpacity>
        </View>
        {secciones.map((seccion) => (
          <View key={seccion.titulo} style={styles.seccion}>
            <Text style={styles.seccionTitulo}>{seccion.titulo}</Text>
            <View style={styles.seccionCaja}>
              {seccion.items.map((item, index) => (
                <TouchableOpacity
                  key={item.label}
                  style={[
                    styles.item,
                    index < seccion.items.length - 1 && styles.itemBorde
                  ]}
                  accessibilityLabel={`${item.label}. ${item.descripcion}`}
                  accessibilityRole="button"
                  onPress={() => {
                    if (item.label === 'Cerrar sesión') {
                      confirmarCerrarSesion();
                      return;
                    }
                    if (item.ruta) router.push(item.ruta as any);
                  }}
                >
                  <View style={styles.itemTextos}>
                    <Text style={styles.itemLabel}>{item.label}</Text>
                    <Text style={styles.itemDesc}>{item.descripcion}</Text>
                  </View>
                  <Text style={styles.flecha}>›</Text>
                </TouchableOpacity>
              ))}
              {seccion.titulo === 'Identidad' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Colors.eli.border }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ color: Colors.eli.white, fontSize: 15, marginBottom: 2 }}>Código de acceso alternativo</Text>
                    <Text style={{ color: Colors.eli.grayLight, fontSize: 12 }}>Un código adicional de 4 dígitos para desbloquear la app</Text>
                  </View>
                  <TouchableOpacity
                    onPress={alternarCodigoAlt}
                    style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: codigoAltActivo ? Colors.eli.primary : Colors.eli.border, justifyContent: 'center', paddingHorizontal: 3 }}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: codigoAltActivo }}
                    accessibilityLabel="Código de acceso alternativo"
                  >
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.eli.white, alignSelf: codigoAltActivo ? 'flex-end' : 'flex-start' }} />
                  </TouchableOpacity>
                </View>
              )}
                            {seccion.titulo === 'Privacidad' && (
                <View style={{ borderTopWidth: 1, borderTopColor: Colors.eli.border, padding: 14 }}>
                  <Text style={{ color: Colors.eli.white, fontSize: 15, marginBottom: 4 }}>Modo de red</Text>
                  <Text style={{ color: Colors.eli.grayLight, fontSize: 12, marginBottom: 12 }}>
                    Cómo ELI se conecta a la red
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(['automatico', 'estandar', 'descentralizado'] as const).map((modo) => (
                      <TouchableOpacity
                        key={modo}
                        style={{
                          flex: 1,
                          paddingVertical: 8,
                          paddingHorizontal: 4,
                          borderRadius: 8,
                          backgroundColor: modoRed === modo ? Colors.eli.primary : Colors.eli.background,
                          alignItems: 'center',
                        }}
                        onPress={() => setModoRed(modo)}
                      >
                        <Text
                          style={{
                            color: modoRed === modo ? Colors.eli.background : Colors.eli.grayLight,
                            fontSize: 11,
                            fontWeight: '600',
                            textTransform: 'capitalize',
                          }}
                        >
                          {modo === 'automatico' ? 'Automático' : modo === 'estandar' ? 'Estándar' : 'Desc.'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
                            {seccion.titulo === 'Red P2P' && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.eli.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: Colors.eli.white, fontSize: 15, marginBottom: 2 }}>Activar modo P2P</Text>
                      <Text style={{ color: Colors.eli.grayLight, fontSize: 12 }}>Tu dispositivo actúa como nodo de la red ELI</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setModoP2P(!modoP2P)}
                      style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: modoP2P ? Colors.eli.primary : Colors.eli.border, justifyContent: 'center', paddingHorizontal: 3 }}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: modoP2P }}
                    >
                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.eli.white, alignSelf: modoP2P ? 'flex-end' : 'flex-start' }} />
                    </TouchableOpacity>
                  </View>
                  {modoP2P && (
                    <View style={{ backgroundColor: '#2B1A00', borderLeftWidth: 3, borderLeftColor: '#FFA500', padding: 12, margin: 12, borderRadius: 8 }}>
                      <Text style={{ color: '#FFA500', fontSize: 13, fontWeight: '600', marginBottom: 4 }}>⚡ Aviso de batería</Text>
                      <Text style={{ color: '#FFD580', fontSize: 12, lineHeight: 18 }}>
                        El modo P2P mantiene conexiones activas en segundo plano. Puede aumentar significativamente el consumo de batería.
                      </Text>
                    </View>
                  )}
                  <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.eli.border }}>
                    <Text style={{ color: Colors.eli.white, fontSize: 14, fontWeight: '600', marginBottom: 6 }}>¿Qué es un nodo?</Text>
                    <Text style={{ color: Colors.eli.grayLight, fontSize: 13, lineHeight: 20 }}>
                      En ELI, cada dispositivo con modo P2P activo retransmite mensajes cifrados entre usuarios cercanos o conectados a la red. Esto hace que la red sea más resistente y descentralizada: cuantos más nodos, más difícil es bloquear ELI.
                    </Text>
                  </View>
                  <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.eli.border }}>
                    <Text style={{ color: Colors.eli.white, fontSize: 14, fontWeight: '600', marginBottom: 6 }}>¿Qué es un nodo externo?</Text>
                    <Text style={{ color: Colors.eli.grayLight, fontSize: 13, lineHeight: 20 }}>
                      Un nodo externo es un servidor independiente que mantiene la red P2P disponible de forma permanente. Lo gestiona un tercero, no ELI. Si conectas un nodo externo en Contribuir → Nodo independiente, los datos cifrados de la red pasarán también por ese servidor. ELI no vende nodos ni se responsabiliza del funcionamiento o la seguridad de nodos gestionados por terceros.
                    </Text>
                  </View>
                  <View style={{ padding: 14 }}>
                    <Text style={{ color: Colors.eli.grayLight, fontSize: 12, fontStyle: 'italic', lineHeight: 18 }}>
                      Todos los mensajes que pasan por nodos —propios o externos— viajan cifrados de extremo a extremo. Ningún nodo puede leer el contenido.
                    </Text>
                  </View>
                </>
              )}
                            {seccion.titulo === 'Notificaciones' && (
                <>
                  {[
                    { label: 'Mensajes nuevos', desc: 'Avisar cuando recibes un mensaje', state: notifMensajes, setter: setNotifMensajes },
                    { label: 'Publicaciones en canales', desc: 'Avisar cuando hay contenido nuevo', state: notifCanales, setter: setNotifCanales },
                    { label: 'Actividad en el Muro', desc: 'Likes y comentarios en tus publicaciones', state: notifMuro, setter: setNotifMuro },
                    { label: 'Proyectos solidarios', desc: 'Novedades de proyectos que apoyas', state: notifSolidaria, setter: setNotifSolidaria },
                  ].map((item, index, arr) => (
                    <View key={item.label} style={[{ flexDirection: 'row', alignItems: 'center', padding: 14, justifyContent: 'space-between' }, index < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.eli.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: Colors.eli.white, fontSize: 15, marginBottom: 2 }}>{item.label}</Text>
                        <Text style={{ color: Colors.eli.grayLight, fontSize: 12 }}>{item.desc}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => item.setter(!item.state)}
                        style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: item.state ? Colors.eli.primary : Colors.eli.border, justifyContent: 'center', paddingHorizontal: 3 }}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: item.state }}
                      >
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.eli.white, alignSelf: item.state ? 'flex-end' : 'flex-start' }} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}
              {seccion.titulo === 'Emergencia offline' && (
                <>
                  <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.eli.border }}>
                    <Text style={{ color: Colors.eli.white, fontSize: 14, fontWeight: '600', marginBottom: 6 }}>¿Cuándo usar este modo?</Text>
                    <Text style={{ color: Colors.eli.grayLight, fontSize: 13, lineHeight: 20 }}>
                      El modo offline permite que ELI funcione sin conexión a internet usando Bluetooth y WiFi Direct entre dispositivos cercanos. Úsalo solo en situaciones de emergencia real: desastre natural, corte de red, zonas sin cobertura.
                    </Text>
                  </View>
                  <View style={{ backgroundColor: '#2B1A00', borderLeftWidth: 3, borderLeftColor: '#FFA500', padding: 12, margin: 12, borderRadius: 8, marginBottom: 0 }}>
                    <Text style={{ color: '#FFA500', fontSize: 13, fontWeight: '600', marginBottom: 4 }}>⚡ Aviso de batería</Text>
                    <Text style={{ color: '#FFD580', fontSize: 12, lineHeight: 18 }}>
                      Bluetooth y WiFi Direct consumen batería de forma intensiva. Actívalos solo cuando sea necesario y desactívalos en cuanto tengas conexión normal.
                    </Text>
                  </View>
                  {[
                    {
                      label: 'Bluetooth',
                      desc: 'Mensajes entre dispositivos a corta distancia (~10 m)',
                      activo: bluetoothActivo,
                      setter: setBluetoothActivo,
                    },
                    {
                      label: 'WiFi Direct',
                      desc: 'Red local entre dispositivos sin router (~200 m)',
                      activo: wifiDirectActivo,
                      setter: setWifiDirectActivo,
                    },
                  ].map((item, index, arr) => (
                    <View key={item.label} style={[{ flexDirection: 'row', alignItems: 'center', padding: 14, justifyContent: 'space-between' }, index < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.eli.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: Colors.eli.white, fontSize: 15, marginBottom: 2 }}>{item.label}</Text>
                        <Text style={{ color: Colors.eli.grayLight, fontSize: 12 }}>{item.desc}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => item.setter(!item.activo)}
                        style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: item.activo ? '#FFA500' : Colors.eli.border, justifyContent: 'center', paddingHorizontal: 3 }}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: item.activo }}
                      >
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.eli.white, alignSelf: item.activo ? 'flex-end' : 'flex-start' }} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}
              {seccion.titulo === 'Apariencia' && (
                <>
                  <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.eli.border }}>
                    <Text style={{ color: Colors.eli.white, fontSize: 15, marginBottom: 4 }}>Idioma</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      {(['es', 'en'] as const).map((lang) => (
                        <TouchableOpacity
                          key={lang}
                          onPress={() => setIdioma(lang)}
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: idioma === lang ? Colors.eli.primary : Colors.eli.border, backgroundColor: idioma === lang ? Colors.eli.primary + '22' : 'transparent', alignItems: 'center' }}
                        >
                          <Text style={{ color: idioma === lang ? Colors.eli.primary : Colors.eli.grayLight, fontWeight: idioma === lang ? '700' : '400', fontSize: 14 }}>
                            {lang === 'es' ? 'Español' : 'English'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: Colors.eli.white, fontSize: 15, marginBottom: 2 }}>Tema</Text>
                      <Text style={{ color: Colors.eli.grayLight, fontSize: 12 }}>{temaOscuro ? 'Oscuro' : 'Claro'}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setTemaOscuro(!temaOscuro)}
                      style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: temaOscuro ? Colors.eli.primary : Colors.eli.border, justifyContent: 'center', paddingHorizontal: 3 }}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: temaOscuro }}
                    >
                                            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.eli.white, alignSelf: temaOscuro ? 'flex-end' : 'flex-start' }} />
                    </TouchableOpacity>
                  </View>
                  <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: Colors.eli.border }}>
                    <Text style={{ color: Colors.eli.white, fontSize: 15, marginBottom: 8 }}>Fuente del chat</Text>
                    <Text style={{ color: Colors.eli.grayLight, fontSize: 12, marginBottom: 12 }}>Tamaño del texto en conversaciones</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(['A', 'AA', 'AAA'] as const).map((size) => (
                        <TouchableOpacity
                          key={size}
                          onPress={() => setFuenteChat(size)}
                          style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: fuenteChat === size ? Colors.eli.primary : Colors.eli.border, backgroundColor: fuenteChat === size ? Colors.eli.primary + '22' : 'transparent', alignItems: 'center' }}
                        >
                          <Text style={{ color: fuenteChat === size ? Colors.eli.primary : Colors.eli.grayLight, fontWeight: fuenteChat === size ? '700' : '400', fontSize: size === 'A' ? 12 : size === 'AA' ? 16 : 20 }}>
                            {size === 'A' ? 'Pequeña' : size === 'AA' ? 'Normal' : 'Grande'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </>
              )}
              {seccion.titulo === 'Contribuir' && (
                <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.eli.border }}>
                  <Text style={{ color: Colors.eli.white, fontSize: 15, fontWeight: '600', marginBottom: 8 }}>
                    Costes reales de ELI
                  </Text>
                  <Text style={{ color: Colors.eli.grayLight, fontSize: 12, lineHeight: 20, marginBottom: 12 }}>
                    ELI es gratuita y siempre lo será. El servidor ciego y la IA de moderación tienen un coste real que publicamos aquí cada mes con total transparencia. A más usuarios, más coste de servidor.
                  </Text>
                  <View style={{ backgroundColor: 'rgba(0,201,177,0.08)', borderRadius: 8, padding: 12, marginBottom: 12, borderLeftWidth: 2, borderLeftColor: 'rgba(0,201,177,0.3)' }}>
                    <Text style={{ color: Colors.eli.grayLight, fontSize: 12, marginBottom: 4 }}>Coste mensual del servidor</Text>
                    <Text style={{ color: Colors.eli.white, fontSize: 22, fontWeight: '700' }}>0,00 €</Text>
                    <Text style={{ color: Colors.eli.grayLight, fontSize: 11, marginTop: 2 }}>Marzo 2025</Text>
                  </View>
                  <Text style={{ color: Colors.eli.grayLight, fontSize: 11, lineHeight: 16, fontStyle: 'italic' }}>
                    Este proyecto no busca beneficios. Todo coste se publica para que sepas exactamente a dónde va cada donación.
                                    </Text>
                </View>
              )}
              {seccion.titulo === 'Almacenamiento' && (
                <>
                  <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.eli.border }}>
                    <Text style={{ color: Colors.eli.white, fontSize: 15, marginBottom: 4 }}>Uso de almacenamiento</Text>
                    <Text style={{ color: Colors.eli.grayLight, fontSize: 12, marginBottom: 12 }}>Espacio que ocupa ELI en tu dispositivo</Text>
                    <View style={{ backgroundColor: 'rgba(0,201,177,0.08)', borderRadius: 8, padding: 12, borderLeftWidth: 2, borderLeftColor: 'rgba(0,201,177,0.3)' }}>
                      <Text style={{ color: Colors.eli.white, fontSize: 22, fontWeight: 'bold' }}>24 MB</Text>
                      <Text style={{ color: Colors.eli.grayLight, fontSize: 11, marginTop: 4 }}>App + caché + archivos descargados</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={{ padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.eli.border }}
                    accessibilityLabel="Vaciar caché de la app"
                    accessibilityRole="button"
                    onPress={() => console.log('Caché vaciada')}
                  >
                    <View>
                      <Text style={{ color: Colors.eli.white, fontSize: 15, marginBottom: 2 }}>Vaciar caché</Text>
                      <Text style={{ color: Colors.eli.grayLight, fontSize: 12 }}>Libera espacio eliminando datos temporales</Text>
                    </View>
                    <Text style={{ color: Colors.eli.primary, fontSize: 14, fontWeight: '600' }}>Vaciar</Text>
                  </TouchableOpacity>
                  <View style={{ padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text style={{ color: Colors.eli.white, fontSize: 15, marginBottom: 2 }}>Archivos descargados</Text>
                      <Text style={{ color: Colors.eli.grayLight, fontSize: 12 }}>Ninguno por ahora</Text>
                    </View>
                    <Text style={{ color: Colors.eli.grayLight, fontSize: 14 }}>0 MB</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={modalCodigoVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalCodigoVisible(false)}
      >
        <View style={styles.modalOverlay}>
          {pasoCodigo === 'advertencia' ? (
            <View style={styles.modalCajaAdvertencia}>
              <Text style={styles.modalAdvertenciaIcono}>⚠️</Text>
              <Text style={styles.modalAdvertenciaTitulo}>Esto borra tu cuenta, no la protege</Text>
              <Text style={styles.modalAdvertenciaTexto}>
                Esta función NO añade seguridad adicional. Es un mecanismo de borrado de emergencia:
                si activas el código y luego lo introduces en la pantalla de desbloqueo, se
                borrará de forma permanente tu identidad y todos los datos de ELI en este
                dispositivo.
              </Text>
              <Text style={styles.modalAdvertenciaTexto}>
                Esta acción no se puede deshacer.
              </Text>
              <TouchableOpacity onPress={confirmarAdvertenciaCodigo} style={styles.modalAdvertenciaBotonConfirmar}>
                <Text style={styles.modalAdvertenciaBotonConfirmarTexto}>Entiendo, continuar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setModalCodigoVisible(false)} style={styles.modalCancelar}>
                <Text style={styles.modalCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.modalCaja}>
              <Text style={styles.modalTitulo}>
                {pasoCodigo === 'crear' ? 'Crear código de acceso' : 'Confirma el código'}
              </Text>
              <Text style={styles.modalSubtitulo}>
                {pasoCodigo === 'crear'
                  ? 'Introduce 4 dígitos.'
                  : 'Vuelve a introducir los mismos 4 dígitos.'}
              </Text>
              {errorCodigo && (
                <Text style={styles.modalError}>Los códigos no coinciden. Inténtalo de nuevo.</Text>
              )}
              <TextInput
                style={styles.modalInput}
                value={codigoInput}
                onChangeText={onDigitoCodigo}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                autoFocus
                placeholder="····"
                placeholderTextColor={Colors.eli.grayLight}
              />
              <TouchableOpacity onPress={() => setModalCodigoVisible(false)} style={styles.modalCancelar}>
                <Text style={styles.modalCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
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
  scroll: {
    flex: 1,
  },
  seccion: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  seccionTitulo: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  seccionCaja: {
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    justifyContent: 'space-between',
  },
  itemBorde: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.eli.border,
  },
  itemTextos: {
    flex: 1,
  },
  itemLabel: {
    color: Colors.eli.white,
    fontSize: 15,
    marginBottom: 2,
  },
  itemDesc: {
    color: Colors.eli.grayLight,
    fontSize: 12,
  },
  flecha: {
    color: Colors.eli.grayLight,
    fontSize: 20,
    marginLeft: 8,
  },
  bannerAutodestruccion: {
    backgroundColor: '#2B0000',
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 20,
  },
  bannerAutodestruccionTitulo: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  bannerAutodestruccionTexto: {
    color: '#FFADA3',
    fontSize: 12,
    lineHeight: 17,
  },
  bannerAutodestruccionToggleFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,59,48,0.3)',
  },
  bannerAutodestruccionToggleLabel: {
    color: Colors.eli.white,
    fontSize: 13,
    marginBottom: 2,
  },
  bannerAutodestruccionBoton: {
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  bannerAutodestruccionBotonTexto: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalCaja: {
    width: '100%',
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    padding: 24,
    alignItems: 'center',
  },
  modalCajaAdvertencia: {
    width: '100%',
    backgroundColor: '#2B0000',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FF3B30',
    padding: 24,
    alignItems: 'center',
  },
  modalAdvertenciaIcono: {
    fontSize: 32,
    marginBottom: 8,
  },
  modalAdvertenciaTitulo: {
    color: '#FF3B30',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  modalAdvertenciaTexto: {
    color: '#FFADA3',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 14,
  },
  modalAdvertenciaBotonConfirmar: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 6,
  },
  modalAdvertenciaBotonConfirmarTexto: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  modalTitulo: {
    color: Colors.eli.white,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  modalSubtitulo: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalError: {
    color: '#FF3B30',
    fontSize: 12,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalInput: {
    width: 120,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    borderRadius: 10,
    paddingVertical: 10,
    textAlign: 'center',
    color: Colors.eli.white,
    fontSize: 22,
    letterSpacing: 10,
    marginBottom: 20,
  },
  modalCancelar: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  modalCancelarTexto: {
    color: Colors.eli.grayLight,
    fontSize: 14,
    fontWeight: '600',
  },
});
