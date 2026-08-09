import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { useState, useEffect } from 'react';
import { obtenerCiudadUsuario, escucharTiendasGlobales, escucharTiendasCiudad, registrarClic, Tienda } from '../../services/mercado';

const categorias = ['Todo', 'Moda', 'Tecnología', 'Deporte', 'Hogar', 'Cultura'];

export default function Mercado() {
  const [tiendasGlobales, setTiendasGlobales] = useState<Tienda[]>([]);
  const [tiendasCiudad, setTiendasCiudad] = useState<Tienda[]>([]);
  const [ciudadUsuario, setCiudadUsuario] = useState('');
  const [locationPermiso, setLocationPermiso] = useState<boolean | null>(null);
  const [seccionActiva, setSeccionActiva] = useState<'globales' | 'ciudad' | 'precios'>('globales');
  const [comisionActual, setComisionActual] = useState('');
  const [calculadoraMostrar, setCalculadoraMostrar] = useState(false);
  const [categoriaActiva, setCategoriaActiva] = useState('Todo');
  const [buscador, setBuscador] = useState('');
  const [cargandoUbicacion, setCargandoUbicacion] = useState(false);

  useEffect(() => {
    const idsGlobales = new Set<string>();
    escucharTiendasGlobales((tienda) => {
      if (!idsGlobales.has(tienda.id)) {
        idsGlobales.add(tienda.id);
        setTiendasGlobales((prev) => [...prev, tienda]);
      }
    });

    (async () => {
      const resultado = await obtenerCiudadUsuario();
      if (resultado) {
        setCiudadUsuario(resultado.ciudad);
        setLocationPermiso(true);
        escucharTiendasCiudad(resultado.lat, resultado.lng, (tienda) => {
          setTiendasCiudad((prev) => {
            const existe = prev.find((t) => t.id === tienda.id);
            if (existe) return prev;
            return [...prev, tienda];
          });
        });
      } else {
        setLocationPermiso(false);
      }
    })();
  }, []);
    const tiendasFiltradas = (tiendas: Tienda[]) => {
    return tiendas.filter((t) => {
      const coincideCategoria = categoriaActiva === 'Todo' || t.categoria === categoriaActiva;
      const coincideBusqueda = t.nombre.toLowerCase().includes(buscador.toLowerCase()) ||
        t.descripcion.toLowerCase().includes(buscador.toLowerCase());
      return coincideCategoria && coincideBusqueda;
    });
  };

  const manejarAbrirTienda = (tienda: Tienda, tipo: 'global' | 'ciudad') => {
    if (tipo === 'global') {
      registrarClic(tienda.id, 'global');
      Linking.openURL(tienda.url);
    } else {
      if (tienda.url) {
        registrarClic(tienda.id, 'ciudad');
        Linking.openURL(tienda.url);
      }
    }
  };

  const activarUbicacion = async () => {
    setCargandoUbicacion(true);
    const resultado = await obtenerCiudadUsuario();
    if (resultado) {
      setCiudadUsuario(resultado.ciudad);
      setLocationPermiso(true);
      escucharTiendasCiudad(resultado.lat, resultado.lng, (tienda) => {
        setTiendasCiudad((prev) => {
          const existe = prev.find((t) => t.id === tienda.id);
          if (existe) return prev;
          return [...prev, tienda];
        });
      });
    } else {
      setLocationPermiso(false);
    }
    setCargandoUbicacion(false);
  };

  return (
    <LinearGradient colors={['#2c2c2c', '#1a1a1a', '#141414']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>ELI</Text>
        <Text style={styles.headerTitle}>Mercado</Text>
      </View>

      <View style={styles.pestanas}>
        <TouchableOpacity
          style={[styles.pestana, seccionActiva === 'globales' && styles.pestanaActiva]}
          onPress={() => setSeccionActiva('globales')}
          accessibilityLabel="Ver empresas globales"
          accessibilityRole="button"
        >
          <Text style={[styles.pestanaTexto, seccionActiva === 'globales' && styles.pestanaTextoActivo]}>
            Empresas globales
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pestana, seccionActiva === 'ciudad' && styles.pestanaActiva]}
          onPress={() => setSeccionActiva('ciudad')}
          accessibilityLabel="Ver tiendas de mi ciudad"
          accessibilityRole="button"
        >
          <Text style={[styles.pestanaTexto, seccionActiva === 'ciudad' && styles.pestanaTextoActivo]}>
            Mi ciudad
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pestana, seccionActiva === 'precios' && styles.pestanaActiva]}
          onPress={() => setSeccionActiva('precios')}
          accessibilityLabel="Ver precios y tarifas"
          accessibilityRole="button"
        >
          <Text style={[styles.pestanaTexto, seccionActiva === 'precios' && styles.pestanaTextoActivo]}>
            Precios
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buscador}>
        <TextInput
          style={styles.buscadorInput}
          placeholder="🔍  Buscar tiendas..."
          placeholderTextColor={Colors.eli.grayLight}
          value={buscador}
          onChangeText={setBuscador}
          accessibilityLabel="Buscar tiendas"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categorias}>
        {categorias.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.categoria, cat === categoriaActiva && styles.categoriaActiva]}
            onPress={() => setCategoriaActiva(cat)}
            accessibilityLabel={`Filtrar por ${cat}`}
            accessibilityRole="button"
          >
            <Text style={[styles.categoriaTexto, cat === categoriaActiva && styles.categoriaTextoActivo]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.avisoContainer}>
        <Text style={styles.aviso}>🔒 ELI nunca ve ni guarda tus compras. Vas directo a la tienda oficial.</Text>
      </View>

      <View style={styles.avisoMercadoBox}>
        <Text style={styles.avisoMercadoTexto}>
          El Mercado hace posible que Solidaria funcione. Cada anuncio ayuda a alguien que lo necesita.
        </Text>
      </View>

            <ScrollView style={styles.lista}>
        {seccionActiva === 'globales' ? (
          <>
            {tiendasFiltradas(tiendasGlobales).map((tienda) => (
              <View key={tienda.id} style={styles.tarjetaWrapper}>
                <TouchableOpacity
                  style={styles.tarjeta}
                  onPress={() => manejarAbrirTienda(tienda, 'global')}
                  accessibilityLabel={`Tienda ${tienda.nombre}, categoría ${tienda.categoria}. ${tienda.descripcion}. Pulsa para ir a la tienda oficial.`}
                  accessibilityRole="link"
                >
                  <View style={styles.tiendaAvatar}>
                    <Text style={styles.tiendaAvatarTexto}>{tienda.nombre[0]}</Text>
                  </View>
                  <View style={styles.info}>
                    <View style={styles.filaArriba}>
                      <Text style={styles.nombre}>
                        {tienda.nombre}
                        {tienda.verificada ? '  ✓' : ''}
                      </Text>
                      <Text style={styles.categoria2}>{tienda.categoria}</Text>
                    </View>
                    <Text style={styles.descripcion} numberOfLines={1}>
                      {tienda.descripcion}
                    </Text>
                    <Text style={styles.enlace}>Ir a la tienda →</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.etiquetaContainer}>
                  <Text style={styles.etiquetaTexto}>Empresa global · desde 99$/mes</Text>
                </View>
              </View>
            ))}
          </>
        ) : seccionActiva === 'ciudad' ? (
          <>
            {locationPermiso === false ? (
              <View style={styles.sinPermiso}>
                <Text style={styles.sinPermisoTitulo}>Ubicación desactivada</Text>
                <Text style={styles.sinPermisoTexto}>
                  La ubicación es necesaria solo para mostrar tiendas cercanas. No se guarda en ningún servidor. Ni ELI ni nadie sabe dónde estás — solo tu dispositivo lo usa.
                </Text>
                <TouchableOpacity
                  style={styles.botonActivar}
                  onPress={activarUbicacion}
                  disabled={cargandoUbicacion}
                  accessibilityLabel="Activar ubicación"
                  accessibilityRole="button"
                >
                  <Text style={styles.botonActivarTexto}>
                    {cargandoUbicacion ? 'Obteniendo ubicación...' : 'Activar ubicación'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.ciudadTitulo}>Tiendas en {ciudadUsuario}</Text>
                {tiendasFiltradas(tiendasCiudad).length === 0 ? (
                  <View style={styles.sinTiendas}>
                    <Text style={styles.sinTiendasTexto}>
                      Aún no hay tiendas en tu ciudad. ¡Anímalas a unirse a ELI!
                    </Text>
                  </View>
                ) : (
                  tiendasFiltradas(tiendasCiudad).map((tienda) => (
                    <View key={tienda.id} style={styles.tarjetaWrapper}>
                      <TouchableOpacity
                        style={styles.tarjeta}
                        onPress={() => {
                          if (tienda.url) {
                            manejarAbrirTienda(tienda, 'ciudad');
                          } else {
                            // Navegar a chat
                          }
                        }}
                        accessibilityLabel={`Tienda local ${tienda.nombre}, categoría ${tienda.categoria}. ${tienda.descripcion}.`}
                        accessibilityRole={tienda.url ? 'link' : 'button'}
                      >
                        <View style={styles.tiendaAvatar}>
                          <Text style={styles.tiendaAvatarTexto}>{tienda.nombre[0]}</Text>
                        </View>
                        <View style={styles.info}>
                          <View style={styles.filaArriba}>
                            <Text style={styles.nombre}>
                              {tienda.nombre}
                              {tienda.verificada ? '  ✓' : ''}
                            </Text>
                            <Text style={styles.categoria2}>{tienda.categoria}</Text>
                          </View>
                          <Text style={styles.descripcion} numberOfLines={1}>
                            {tienda.descripcion}
                          </Text>
                          {tienda.url ? (
                            <Text style={styles.enlace}>Ir a la tienda →</Text>
                          ) : (
                            <Text style={styles.enlace}>Contactar</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                      <View style={styles.etiquetaContainer}>
                        <Text style={styles.etiquetaTexto}>Tienda local · desde 5$/mes</Text>
                      </View>
                    </View>
                  ))
                )}
              </>
            )}
          </>
        ) : (
          <>
            <Text style={styles.precioSeccionTitulo}>Empresas globales</Text>
            <View style={styles.precioTabla}>
              {[
                { plan: 'Básico', detalle: 'Hasta 10.000 impresiones/mes', precio: '99 $/mes' },
                { plan: 'Estándar', detalle: 'Impresiones ilimitadas + métricas avanzadas', precio: '199 $/mes' },
              ].map(({ plan, detalle, precio }) => (
                <View key={plan} style={styles.precioFila}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.precioNombre}>{plan}</Text>
                    <Text style={styles.precioDetalle}>{detalle}</Text>
                  </View>
                  <Text style={styles.precioCantidad}>{precio}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.precioSeccionTitulo}>Tiendas de la ciudad</Text>
            <View style={styles.precioTabla}>
              {[
                { plan: 'Barrio', detalle: 'Hasta 5.000 impresiones/mes', precio: '5 €/mes' },
                { plan: 'Ciudad', detalle: 'Impresiones ilimitadas + métricas', precio: '15 €/mes' },
              ].map(({ plan, detalle, precio }) => (
                <View key={plan} style={styles.precioFila}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.precioNombre}>{plan}</Text>
                    <Text style={styles.precioDetalle}>{detalle}</Text>
                  </View>
                  <Text style={styles.precioCantidad}>{precio}</Text>
                </View>
              ))}
            </View>

            {/* Métricas gratuitas */}
            <View style={styles.metricasBox}>
              <Text style={styles.metricasTitulo}>Métricas gratuitas para tu negocio</Text>
              <Text style={styles.metricasSubtitulo}>
                Cada mes recibes un informe con datos agregados y anónimos de tu presencia en ELI.
                Nunca datos individuales. Nunca identificación de personas.
              </Text>
              {[
                { icono: '👁', nombre: 'Impresiones', desc: 'Cuántas veces se mostró tu tienda o canal' },
                { icono: '↗', nombre: 'Clics', desc: 'Interacciones con tu perfil o enlace' },
                { icono: '⏱', nombre: 'Retención', desc: 'Tiempo medio que los usuarios pasan en tu página' },
                { icono: '🌐', nombre: 'Conversión a web', desc: 'Usuarios que pasaron de ELI a tu sitio' },
                { icono: '🗺', nombre: 'Región', desc: 'De qué zonas geográficas vienen las visitas (agregado)' },
                { icono: '🕐', nombre: 'Franja horaria', desc: 'En qué horas del día hay más actividad' },
              ].map(({ icono, nombre, desc }) => (
                <View key={nombre} style={styles.metricasFila}>
                  <Text style={styles.metricasIcono}>{icono}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.metricasNombre}>{nombre}</Text>
                    <Text style={styles.metricasDesc}>{desc}</Text>
                  </View>
                </View>
              ))}
              <View style={styles.metricasNota}>
                <Text style={styles.metricasNotaTexto}>
                  ELI nunca vende datos ni los comparte con terceros. El informe es solo tuyo.
                </Text>
              </View>
            </View>

            {/* Calculadora de ahorro */}
            <View style={styles.calculadoraBox}>
              <Text style={styles.calculadoraTitulo}>Calculadora de ahorro</Text>
              <Text style={styles.calculadoraSubtitulo}>
                ¿Cuánto pagas actualmente en comisiones al mes?
              </Text>
              <View style={styles.calculadoraInputRow}>
                <TextInput
                  style={styles.calculadoraInput}
                  placeholder="p. ej. 80"
                  placeholderTextColor={Colors.eli.grayLight}
                  value={comisionActual}
                  onChangeText={setComisionActual}
                  keyboardType="numeric"
                />
                <Text style={styles.calculadoraUnidad}>€/mes</Text>
              </View>
              <TouchableOpacity
                style={[styles.calculadoraBoton, !comisionActual && { opacity: 0.4 }]}
                onPress={() => setCalculadoraMostrar(true)}
                disabled={!comisionActual}
                accessibilityLabel="Ver ahorro estimado"
                accessibilityRole="button"
              >
                <Text style={styles.calculadoraBotonTexto}>Ver ahorro estimado</Text>
              </TouchableOpacity>
              {calculadoraMostrar && comisionActual ? (() => {
                const actual = parseFloat(comisionActual) || 0;
                const planEli = actual > 50 ? 15 : 5;
                const ahorro = Math.max(0, actual - planEli);
                return (
                  <View style={styles.calculadoraResultado}>
                    <View style={styles.calculadoraFilaRes}>
                      <Text style={styles.calculadoraFilaLabel}>Lo que pagas ahora</Text>
                      <Text style={styles.calculadoraFilaValorMal}>{actual.toFixed(2)} €/mes</Text>
                    </View>
                    <View style={styles.calculadoraFilaRes}>
                      <Text style={styles.calculadoraFilaLabel}>Plan ELI recomendado</Text>
                      <Text style={styles.calculadoraFilaValorBien}>{planEli} €/mes fijo</Text>
                    </View>
                    <View style={[styles.calculadoraFilaRes, { borderBottomWidth: 0 }]}>
                      <Text style={[styles.calculadoraFilaLabel, { fontWeight: '700' }]}>Ahorro potencial</Text>
                      <Text style={[styles.calculadoraFilaValorBien, { fontSize: 16 }]}>{ahorro.toFixed(2)} €/mes</Text>
                    </View>
                    <Text style={styles.calculadoraNota}>
                      Con ELI pagas una cuota fija mensual. Tu coste no sube aunque vendas más.
                    </Text>
                  </View>
                );
              })() : null}
            </View>
          </>
        )}

        <View style={styles.seccionRegistro}>
          <Text style={styles.registroTitulo}>¿Tienes una tienda?</Text>
          <TouchableOpacity
            style={styles.botonRegistro}
            onPress={() => Alert.alert('Próximamente', 'El registro se gestiona desde eli-app.org')}
            accessibilityLabel="Registrar empresa global"
            accessibilityRole="button"
          >
            <Text style={styles.botonRegistroTexto}>Registrar empresa global</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.botonRegistroSecundario}
            onPress={() => Alert.alert('Próximamente', 'El registro se gestiona desde eli-app.org')}
            accessibilityLabel="Registrar mi tienda local"
            accessibilityRole="button"
          >
            <Text style={styles.botonRegistroSecundarioTexto}>Registrar mi tienda local</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
    flex: 1,
  },
  buscador: {
    margin: 12,
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.eli.border,
  },
      buscadorInput: {
    color: Colors.eli.white,
    fontSize: 14,
  },
  buscadorTexto: {
    color: Colors.eli.grayLight,
    fontSize: 14,
  },
  categorias: {
    paddingHorizontal: 12,
    marginBottom: 8,
    maxHeight: 40,
  },
  categoria: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  categoriaActiva: {
    backgroundColor: 'rgba(0,201,177,0.12)',
    borderColor: 'rgba(0,201,177,0.4)',
  },
  categoriaTexto: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '500',
  },
  categoriaTextoActivo: {
    color: '#00C9B1',
    fontWeight: '700',
  },
  avisoContainer: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(0,201,177,0.08)',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,201,177,0.3)',
  },
  aviso: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    fontStyle: 'italic',
  },
  pestanas: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.eli.border,
  },
  pestana: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pestanaActiva: {
    backgroundColor: 'rgba(0,201,177,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,201,177,0.4)',
    borderRadius: 8,
  },
  pestanaTexto: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '600',
  },
  pestanaTextoActivo: {
    color: '#00C9B1',
    fontWeight: '700',
  },
  avisoMercadoBox: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(0,201,177,0.08)',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,201,177,0.3)',
  },
  avisoMercadoTexto: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    lineHeight: 18,
  },
  tarjetaWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.eli.border,
  },
  etiquetaContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 0,
  },
  etiquetaTexto: {
    color: Colors.eli.grayLight,
    fontSize: 11,
    fontStyle: 'italic',
  },
  sinPermiso: {
    margin: 24,
    padding: 20,
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    alignItems: 'center',
  },
  sinPermisoTitulo: {
    color: Colors.eli.white,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  sinPermisoTexto: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  botonActivar: {
    backgroundColor: Colors.eli.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  botonActivarTexto: {
    color: Colors.eli.background,
    fontWeight: '700',
    fontSize: 14,
  },
  ciudadTitulo: {
    color: Colors.eli.white,
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sinTiendas: {
    margin: 24,
    padding: 20,
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    alignItems: 'center',
  },
  sinTiendasTexto: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  seccionRegistro: {
    margin: 16,
    padding: 16,
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    alignItems: 'center',
  },
  registroTitulo: {
    color: Colors.eli.white,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 14,
  },
  botonRegistro: {
    backgroundColor: 'rgba(0,201,177,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,201,177,0.35)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginBottom: 8,
    width: '100%',
    alignItems: 'center',
  },
  botonRegistroTexto: {
    color: '#00C9B1',
    fontWeight: '700',
    fontSize: 14,
  },
  botonRegistroSecundario: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginBottom: 8,
    width: '100%',
    alignItems: 'center',
  },
  botonRegistroSecundarioTexto: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '700',
    fontSize: 14,
  },
  lista: {
    flex: 1,
  },
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  tiendaAvatar: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: Colors.eli.grayDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.eli.border,
  },
  tiendaAvatarTexto: {
    color: Colors.eli.primary,
    fontWeight: 'bold',
    fontSize: 22,
  },
  info: {
    flex: 1,
  },
  filaArriba: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  nombre: {
    color: Colors.eli.white,
    fontWeight: '600',
    fontSize: 15,
  },
  categoria2: {
    color: Colors.eli.grayLight,
    fontSize: 11,
    backgroundColor: Colors.eli.grayDark,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.eli.border,
  },
  descripcion: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    marginBottom: 4,
  },
  enlace: {
    color: Colors.eli.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  precioSeccionTitulo: {
    color: Colors.eli.white,
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  precioTabla: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    overflow: 'hidden',
  },
  precioFila: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.eli.border,
  },
  precioNombre: {
    color: Colors.eli.white,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  precioDetalle: {
    color: Colors.eli.grayLight,
    fontSize: 12,
  },
  precioCantidad: {
    color: Colors.eli.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  calculadoraBox: {
    margin: 16,
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.eli.border,
  },
  calculadoraTitulo: {
    color: Colors.eli.white,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  calculadoraSubtitulo: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  calculadoraInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  calculadoraInput: {
    flex: 1,
    backgroundColor: Colors.eli.background,
    borderRadius: 8,
    padding: 10,
    color: Colors.eli.white,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.eli.border,
  },
  calculadoraUnidad: {
    color: Colors.eli.grayLight,
    fontSize: 14,
  },
  calculadoraBoton: {
    backgroundColor: Colors.eli.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  calculadoraBotonTexto: {
    color: Colors.eli.background,
    fontWeight: '700',
    fontSize: 14,
  },
  calculadoraResultado: {
    marginTop: 14,
    backgroundColor: Colors.eli.background,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.eli.primary,
  },
  calculadoraFilaRes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.eli.border,
  },
  calculadoraFilaLabel: {
    color: Colors.eli.grayLight,
    fontSize: 13,
  },
  calculadoraFilaValorMal: {
    color: '#ff6b6b',
    fontSize: 13,
    fontWeight: '600',
  },
  calculadoraFilaValorBien: {
    color: Colors.eli.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  calculadoraNota: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 10,
    lineHeight: 18,
  },
  metricasBox: {
    margin: 16,
    marginBottom: 4,
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.eli.border,
  },
  metricasTitulo: {
    color: Colors.eli.white,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  metricasSubtitulo: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  metricasFila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.eli.border,
    gap: 10,
  },
  metricasIcono: {
    fontSize: 18,
    width: 28,
    textAlign: 'center',
  },
  metricasNombre: {
    color: Colors.eli.white,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  metricasDesc: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    lineHeight: 16,
  },
  metricasNota: {
    marginTop: 12,
    backgroundColor: 'rgba(0,201,177,0.08)',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,201,177,0.3)',
  },
  metricasNotaTexto: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 18,
  },
});