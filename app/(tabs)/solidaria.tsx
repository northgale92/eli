import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { escucharProyectos, votar, registrarONG, type TipoSolicitante, type ResultadoAnalisis, type ContextoCuestionario } from '../../services/solidaria';
import { obtenerUsuario } from '../../services/identidad';

const reservorio = {
  total: '12.847',
  esteMes: '3.241',
  proyectosApoyados: 7,
};

const proyectos = [
  {
    id: '1',
    nombre: 'Agua limpia en Malí',
    organizacion: 'WaterAid',
    descripcion: 'Construcción de pozos de agua potable para 3 aldeas sin acceso a agua limpia.',
    votos: 1823,
    porcentaje: 58,
    diasRestantes: 12,
    verificado: true,
  },
  {
    id: '2',
    nombre: 'Biblioteca digital rural',
    organizacion: 'Fundación Leer',
    descripcion: 'Acceso a libros digitales para niños en zonas rurales sin bibliotecas.',
    votos: 934,
    porcentaje: 30,
    diasRestantes: 12,
    verificado: true,
  },
  {
    id: '3',
    nombre: 'Huertos comunitarios',
    organizacion: 'GreenCities',
    descripcion: 'Creación de huertos urbanos en barrios con alta tasa de desempleo.',
    votos: 384,
    porcentaje: 12,
    diasRestantes: 12,
    verificado: true,
  },
];

const TIPOS_SOLICITANTE: { valor: TipoSolicitante; etiqueta: string }[] = [
  { valor: 'ong_fundacion', etiqueta: 'ONG o Fundación registrada' },
  { valor: 'asociacion', etiqueta: 'Asociación registrada' },
  { valor: 'persona_fisica', etiqueta: 'Persona física' },
  { valor: 'refugio_animales', etiqueta: 'Refugio de animales' },
  { valor: 'comedor_informal', etiqueta: 'Comedor o ayuda informal' },
  { valor: 'colectivo_sin_registro', etiqueta: 'Colectivo sin registro formal' },
];

const PARA_QUE_OPCIONES = [
  { valor: 'ayuda_humanitaria', etiqueta: 'Ayuda humanitaria' },
  { valor: 'atencion_medica', etiqueta: 'Atención médica o veterinaria' },
  { valor: 'alimentacion', etiqueta: 'Alimentación' },
  { valor: 'educacion', etiqueta: 'Educación' },
  { valor: 'emergencia', etiqueta: 'Emergencia' },
  { valor: 'otro', etiqueta: 'Otro' },
];

export default function Solidaria() {
  const [proyectos, setProyectos] = useState<any[]>([]);
  const [miUsuario, setMiUsuario] = useState('');
  const [mostrarFormONG, setMostrarFormONG] = useState(false);
  const [nombreONG, setNombreONG] = useState('');
  const [descripcionONG, setDescripcionONG] = useState('');
  const [fotosONG, setFotosONG] = useState<string[]>([]);
  const [tipoONG, setTipoONG] = useState<TipoSolicitante>('ong_fundacion');
  const [importeSolicitado, setImporteSolicitado] = useState('');
  const [estadoRegistro, setEstadoRegistro] = useState<'pendiente_comunidad' | 'rechazado_ia' | 'expulsion' | ''>('');
  const [resultadoIA, setResultadoIA] = useState<ResultadoAnalisis | null>(null);
  const [cargando, setCargando] = useState(false);

  // Cuestionario inicial (3 pasos)
  const [cuestionarioPaso, setCuestionarioPaso] = useState<1 | 2 | 3 | 4>(1);
  const [cQuienEres, setCQuienEres] = useState<TipoSolicitante | ''>('');
  const [cParaQue, setCParaQue] = useState('');
  const [cImporte, setCImporte] = useState('');
  const [cDesglose, setCDesglose] = useState('');

  useEffect(() => {
    const cargar = async () => {
      const usuario = await obtenerUsuario();
      setMiUsuario(usuario || '');
    };
    cargar();

    escucharProyectos((proyecto) => {
      setProyectos(prev => {
        const existe = prev.findIndex(p => p.id === proyecto.id);
        if (existe >= 0) {
          const nueva = [...prev];
          nueva[existe] = { ...nueva[existe], votos: proyecto.votos };
          return nueva;
        }
        return [proyecto, ...prev];
      });
    });
  }, []);

  const seleccionarFotoONG = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permiso.status !== 'granted') return;
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!resultado.canceled) {
      setFotosONG(prev => [...prev, resultado.assets[0].uri]);
    }
  };

  const resetCuestionario = () => {
    setCuestionarioPaso(1);
    setCQuienEres('');
    setCParaQue('');
    setCImporte('');
    setCDesglose('');
  };

  const completarCuestionario = () => {
    setTipoONG(cQuienEres as TipoSolicitante);
    setImporteSolicitado(cImporte);
    setCuestionarioPaso(4);
  };

  const enviarRegistroONG = async () => {
    setCargando(true);
    setResultadoIA(null);
    const cuestionario: ContextoCuestionario | undefined = cQuienEres
      ? {
          quienEres: cQuienEres as TipoSolicitante,
          paraQue: cParaQue,
          importeDeclarado: parseFloat(cImporte) || 0,
          desgloseGasto: cDesglose,
        }
      : undefined;
    const res = await registrarONG(
      nombreONG, descripcionONG, fotosONG, [], miUsuario,
      tipoONG,
      parseFloat(importeSolicitado) || 0,
      5000,
      cuestionario,
    );
    setEstadoRegistro(res.estado);
    setResultadoIA(res.resultadoIA);
    setCargando(false);
    if (res.estado === 'pendiente_comunidad') {
      setMostrarFormONG(false);
      resetCuestionario();
      setNombreONG('');
      setDescripcionONG('');
      setFotosONG([]);
      setImporteSolicitado('');
    }
  };
  return (
    <LinearGradient colors={['#2c2c2c', '#1a1a1a', '#141414']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>ELI</Text>
        <Text style={styles.headerTitle}>Solidaria</Text>
      </View>

      <ScrollView style={styles.scroll}>

        {/* Reservorio */}
        <View style={styles.reservorio}>
          <Text style={styles.reservorioLabel}>Reservorio solidario</Text>
          <Text style={styles.reservorioTotal}>${reservorio.total}</Text>
          <Text style={styles.reservorioSub}>
            ${reservorio.esteMes} recaudados este mes · {reservorio.proyectosApoyados} proyectos apoyados
          </Text>
          <View style={styles.reservorioNota}>
            <Text style={styles.reservorioNotaTexto}>
              Nadie puede tocar este dinero. La comunidad decide qué proyectos se apoyan.
            </Text>
          </View>

          {/* Regla del 60% */}
          <View style={styles.regla60Box}>
            <Text style={styles.regla60Titulo}>Regla de distribución</Text>
            {(() => {
              const fondoMes = parseFloat(reservorio.esteMes.replace('.', ''));
              const distribuible = fondoMes * 0.6;
              const reserva = fondoMes * 0.4;
              return (
                <>
                  <View style={styles.regla60Fila}>
                    <Text style={styles.regla60Label}>Fondo disponible este mes</Text>
                    <Text style={styles.regla60Valor}>${reservorio.esteMes}</Text>
                  </View>
                  <View style={styles.regla60Fila}>
                    <Text style={styles.regla60Label}>Máximo distribuible (60%)</Text>
                    <Text style={[styles.regla60Valor, { color: Colors.eli.primary }]}>${distribuible.toLocaleString('es-ES', { minimumFractionDigits: 0 })}</Text>
                  </View>
                  <View style={[styles.regla60Fila, { borderBottomWidth: 0 }]}>
                    <Text style={styles.regla60Label}>Reserva (40%)</Text>
                    <Text style={styles.regla60Valor}>${reserva.toLocaleString('es-ES', { minimumFractionDigits: 0 })}</Text>
                  </View>
                  <Text style={styles.regla60Nota}>
                    Ninguna solicitud puede recibir más del 50% del fondo mensual (posición 1 en votos).
                  </Text>
                </>
              );
            })()}</View>
          <TouchableOpacity
            style={styles.botonDonar}
            accessibilityLabel="Hacer una donación voluntaria al reservorio solidario"
            accessibilityRole="button"
          >
            <Text style={styles.botonDonarTexto}>Quiero donar</Text>
          </TouchableOpacity>
        </View>

        {/* Votación */}
        <View style={styles.seccionHeader}>
          <Text style={styles.seccionTitulo}>Vota este mes</Text>
          <Text style={styles.seccionSub}>12 días restantes · 1 voto por persona</Text>
        </View>

        {proyectos.length === 0 ? (
          <Text style={styles.sinProyectos}>No hay proyectos activos este mes.</Text>
        ) : (
          proyectos.map((proyecto) => (
            <View key={proyecto.id} style={styles.tarjeta}>
              <View style={styles.tarjetaHeader}>
                <View style={styles.tarjetaInfo}>
                  <Text style={styles.proyectoNombre}>{proyecto.nombre}</Text>
                  <Text style={styles.proyectoOrg}>
                    {proyecto.organizacion} {proyecto.verificado ? '✓' : ''}
                  </Text>
                </View>
                <Text style={styles.porcentaje}>{proyecto.porcentaje || 0}%</Text>
              </View>

            <Text style={styles.proyectoDesc}>{proyecto.descripcion}</Text>

              <View style={styles.barraFondo}>
                <View style={[styles.barraRelleno, { width: `${proyecto.porcentaje || 0}%` }]} />
              </View>

              <View style={styles.tarjetaFooter}>
                <Text style={styles.votos}>{proyecto.votos || 0} votos</Text>
                <TouchableOpacity
                  style={styles.botonVotar}
                  accessibilityLabel={`Votar por ${proyecto.nombre}`}
                  accessibilityRole="button"
                  onPress={() => votar(proyecto.id, miUsuario)}
                >
                  <Text style={styles.botonVotarTexto}>Votar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoTitulo}>¿Cómo funciona?</Text>
          <Text style={styles.infoTexto}>
            Cada mes la comunidad vota por proyectos validados por la IA. Los proyectos con más votos reciben el apoyo del reservorio automáticamente. Siempre habrá proyectos de distintas partes del mundo para que la solidaridad no tenga fronteras. Nadie de ELI toca un solo euro.
          </Text>
        </View>

        <View style={styles.historialHeader}>
          <Text style={styles.seccionTitulo}>Proyectos anteriores</Text>
        </View>

        <View style={styles.historialItem}>
          <Text style={styles.historialNombre}>Escuelas en Nepal · Abril 2026</Text>
          <Text style={styles.historialImporte}>$2.840 donados</Text>
        </View>
        <View style={styles.historialItem}>
          <Text style={styles.historialNombre}>Refugio animal · Marzo 2026</Text>
          <Text style={styles.historialImporte}>$1.920 donados</Text>
        </View>

        {/* Registro ONG */}
        <View style={styles.ongSection}>
          {!mostrarFormONG ? (
            <>
              <Text style={styles.ongTitulo}>¿Tienes una ONG o asociación?</Text>
              <TouchableOpacity
                style={styles.botonRegistrarONG}
                accessibilityLabel="Registrar mi organización"
                accessibilityRole="button"
                onPress={() => { resetCuestionario(); setMostrarFormONG(true); }}
              >
                <Text style={styles.botonRegistrarONGTexto}>Registrar mi organización</Text>
              </TouchableOpacity>
            </>
          ) : cuestionarioPaso < 4 ? (
            /* ── Cuestionario inicial ── */
            <View style={styles.formONG}>
              {/* Indicador de paso */}
              <View style={styles.cuestionarioPasos}>
                {[1, 2, 3].map(n => (
                  <View
                    key={n}
                    style={[styles.cuestionarioPunto, cuestionarioPaso >= n && styles.cuestionarioPuntoActivo]}
                  />
                ))}
              </View>
              <Text style={styles.cuestionarioPasoLabel}>Paso {cuestionarioPaso} de 3</Text>

              {cuestionarioPaso === 1 && (
                <>
                  <Text style={styles.ongTitulo}>¿Quién eres?</Text>
                  <View style={styles.tipoGrid}>
                    {TIPOS_SOLICITANTE.map(({ valor, etiqueta }) => (
                      <TouchableOpacity
                        key={valor}
                        style={[styles.tipoBoton, cQuienEres === valor && styles.tipoBotonActivo]}
                        accessibilityLabel={etiqueta}
                        accessibilityRole="button"
                        onPress={() => setCQuienEres(valor)}
                      >
                        <Text style={[styles.tipoBotonTexto, cQuienEres === valor && styles.tipoBotonTextoActivo]}>
                          {etiqueta}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={[styles.botonEnviarSolicitud, !cQuienEres && styles.botonDesactivado]}
                    accessibilityLabel="Siguiente paso"
                    accessibilityRole="button"
                    onPress={() => cQuienEres && setCuestionarioPaso(2)}
                  >
                    <Text style={styles.botonEnviarSolicitudTexto}>Siguiente</Text>
                  </TouchableOpacity>
                </>
              )}

              {cuestionarioPaso === 2 && (
                <>
                  <Text style={styles.ongTitulo}>¿Para qué es el proyecto?</Text>
                  <View style={styles.tipoGrid}>
                    {PARA_QUE_OPCIONES.map(({ valor, etiqueta }) => (
                      <TouchableOpacity
                        key={valor}
                        style={[styles.tipoBoton, cParaQue === valor && styles.tipoBotonActivo]}
                        accessibilityLabel={etiqueta}
                        accessibilityRole="button"
                        onPress={() => setCParaQue(valor)}
                      >
                        <Text style={[styles.tipoBotonTexto, cParaQue === valor && styles.tipoBotonTextoActivo]}>
                          {etiqueta}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.formBotones}>
                    <TouchableOpacity
                      style={[styles.botonEnviarSolicitud, !cParaQue && styles.botonDesactivado]}
                      accessibilityLabel="Siguiente paso"
                      accessibilityRole="button"
                      onPress={() => cParaQue && setCuestionarioPaso(3)}
                    >
                      <Text style={styles.botonEnviarSolicitudTexto}>Siguiente</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.botonCancelar}
                      accessibilityRole="button"
                      onPress={() => setCuestionarioPaso(1)}
                    >
                      <Text style={styles.botonCancelarTexto}>Atrás</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {cuestionarioPaso === 3 && (
                <>
                  <Text style={styles.ongTitulo}>¿Cuánto necesitas?</Text>
                  <TextInput
                    style={styles.inputONG}
                    placeholder="Importe aproximado (USD)"
                    placeholderTextColor={Colors.eli.grayLight}
                    value={cImporte}
                    onChangeText={setCImporte}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={[styles.inputONG, styles.inputMultiline]}
                    placeholder="Desglose del gasto (p. ej. 500 € material, 300 € transporte…)"
                    placeholderTextColor={Colors.eli.grayLight}
                    value={cDesglose}
                    onChangeText={setCDesglose}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                  <View style={styles.formBotones}>
                    <TouchableOpacity
                      style={[styles.botonEnviarSolicitud, !cImporte && styles.botonDesactivado]}
                      accessibilityLabel="Continuar al formulario"
                      accessibilityRole="button"
                      onPress={() => cImporte && completarCuestionario()}
                    >
                      <Text style={styles.botonEnviarSolicitudTexto}>Continuar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.botonCancelar}
                      accessibilityRole="button"
                      onPress={() => setCuestionarioPaso(2)}
                    >
                      <Text style={styles.botonCancelarTexto}>Atrás</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Cancelar cuestionario */}
              <TouchableOpacity
                style={[styles.botonCancelar, { marginTop: 4 }]}
                accessibilityLabel="Cancelar registro"
                accessibilityRole="button"
                onPress={() => { setMostrarFormONG(false); resetCuestionario(); }}
              >
                <Text style={styles.botonCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Formulario principal ── */
            <View style={styles.formONG}>
              <Text style={styles.ongTitulo}>Registrar organización</Text>

              {/* Resultado IA */}
              {estadoRegistro === 'pendiente_comunidad' && (
                <View style={styles.iaAprobado}>
                  <Text style={styles.iaAprobadoTitulo}>✓ Solicitud aprobada por la IA</Text>
                  <Text style={styles.iaAprobadoSub}>La comunidad la revisará en breve.</Text>
                  {resultadoIA && (
                    <Text style={styles.iaPuntuacion}>Puntuación: {resultadoIA.puntuacion}/100</Text>
                  )}
                </View>
              )}

              {(estadoRegistro === 'rechazado_ia' || estadoRegistro === 'expulsion') && resultadoIA && (
                <View style={styles.iaRechazado}>
                  <Text style={styles.iaRechazadoTitulo}>
                    {estadoRegistro === 'expulsion' ? '⛔ Expulsión inmediata' : '✗ Solicitud rechazada'}
                  </Text>
                  {resultadoIA.motivoRechazo ? (
                    <Text style={styles.iaRechazadoMotivo}>{resultadoIA.motivoRechazo}</Text>
                  ) : null}
                  {resultadoIA.documentosFaltantes.length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={styles.iaFaltanLabel}>Documentos faltantes:</Text>
                      {resultadoIA.documentosFaltantes.map((doc, i) => (
                        <Text key={i} style={styles.iaFaltanItem}>• {doc}</Text>
                      ))}
                    </View>
                  )}
                  {resultadoIA.plazoCorreccion && (
                    <Text style={styles.iaPlazo}>Plazo para corregir: {resultadoIA.plazoCorreccion}h</Text>
                  )}
                  <Text style={styles.iaMensajePublico}>{resultadoIA.mensajePublico}</Text>
                </View>
              )}

              {cargando ? (
                <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                  <ActivityIndicator color={Colors.eli.primary} size="large" />
                  <Text style={styles.cargandoTexto}>La IA de Solidaria analiza tu solicitud…</Text>
                </View>
              ) : (
                <>
                  {/* Tipo de solicitante */}
                  <Text style={styles.inputLabel}>Tipo de solicitante</Text>
                  <View style={styles.tipoGrid}>
                    {TIPOS_SOLICITANTE.map(({ valor, etiqueta }) => (
                      <TouchableOpacity
                        key={valor}
                        style={[styles.tipoBoton, tipoONG === valor && styles.tipoBotonActivo]}
                        accessibilityLabel={`Tipo: ${etiqueta}`}
                        accessibilityRole="button"
                        onPress={() => setTipoONG(valor)}
                      >
                        <Text style={[styles.tipoBotonTexto, tipoONG === valor && styles.tipoBotonTextoActivo]}>
                          {etiqueta}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TextInput
                    style={styles.inputONG}
                    placeholder="Nombre de la organización o proyecto"
                    placeholderTextColor={Colors.eli.grayLight}
                    value={nombreONG}
                    onChangeText={setNombreONG}
                    autoCapitalize="words"
                  />
                  <TextInput
                    style={[styles.inputONG, styles.inputMultiline]}
                    placeholder="Descripción detallada del proyecto"
                    placeholderTextColor={Colors.eli.grayLight}
                    value={descripcionONG}
                    onChangeText={setDescripcionONG}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                  <TextInput
                    style={styles.inputONG}
                    placeholder="Importe solicitado (USD)"
                    placeholderTextColor={Colors.eli.grayLight}
                    value={importeSolicitado}
                    onChangeText={setImporteSolicitado}
                    keyboardType="numeric"
                  />
                  <TouchableOpacity
                    style={styles.botonFoto}
                    accessibilityLabel="Añadir foto"
                    accessibilityRole="button"
                    onPress={seleccionarFotoONG}
                  >
                    <Text style={styles.botonFotoTexto}>Añadir foto ({fotosONG.length})</Text>
                  </TouchableOpacity>
                  <View style={styles.formBotones}>
                    <TouchableOpacity
                      style={styles.botonEnviarSolicitud}
                      accessibilityLabel="Enviar solicitud para análisis IA"
                      accessibilityRole="button"
                      onPress={enviarRegistroONG}
                    >
                      <Text style={styles.botonEnviarSolicitudTexto}>Analizar y enviar solicitud</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.botonCancelar}
                      accessibilityLabel="Cancelar"
                      accessibilityRole="button"
                      onPress={() => {
                        setMostrarFormONG(false);
                        resetCuestionario();
                        setNombreONG('');
                        setDescripcionONG('');
                        setFotosONG([]);
                        setImporteSolicitado('');
                        setEstadoRegistro('');
                        setResultadoIA(null);
                      }}
                    >
                      <Text style={styles.botonCancelarTexto}>Cancelar</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        <View style={{ height: 80 }} />
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
  },
  scroll: {
    flex: 1,
  },
  reservorio: {
    margin: 16,
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.eli.primary,
  },
  reservorioLabel: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  reservorioTotal: {
    color: Colors.eli.primary,
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  reservorioSub: {
    color: '#B8C5D6',
    fontSize: 13,
    marginBottom: 12,
  },
  reservorioNota: {
    backgroundColor: 'rgba(0,201,177,0.08)',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,201,177,0.3)',
  },
  reservorioNotaTexto: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    fontStyle: 'italic',
  },
  seccionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 8,
  },
  seccionTitulo: {
    color: Colors.eli.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  seccionSub: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    marginTop: 2,
  },
  tarjeta: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.eli.border,
  },
  tarjetaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tarjetaInfo: {
    flex: 1,
    marginRight: 12,
  },
  proyectoNombre: {
    color: Colors.eli.white,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  proyectoOrg: {
    color: Colors.eli.primary,
    fontSize: 13,
  },
  porcentaje: {
    color: Colors.eli.primary,
    fontSize: 22,
    fontWeight: 'bold',
  },
  proyectoDesc: {
    color: '#B8C5D6',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  barraFondo: {
    height: 6,
    backgroundColor: Colors.eli.border,
    borderRadius: 3,
    marginBottom: 12,
    overflow: 'hidden',
  },
  barraRelleno: {
    height: 6,
    backgroundColor: Colors.eli.primary,
    borderRadius: 3,
  },
  tarjetaFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  votos: {
    color: '#B8C5D6',
    fontSize: 13,
  },
  botonVotar: {
    backgroundColor: Colors.eli.primary,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  botonVotarTexto: {
    color: Colors.eli.background,
    fontSize: 14,
    fontWeight: 'bold',
  },
  botonDonar: {
    marginTop: 12,
    backgroundColor: Colors.eli.primary,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  botonDonarTexto: {
    color: Colors.eli.background,
    fontSize: 14,
    fontWeight: 'bold',
  },
  infoBox: {
    margin: 16,
    backgroundColor: 'rgba(0,201,177,0.08)',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,201,177,0.3)',
  },
  infoTitulo: {
    color: Colors.eli.white,
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  infoTexto: {
    color: Colors.eli.grayLight,
    fontSize: 13,
    lineHeight: 20,
  },
  historialHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  historialItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.eli.border,
  },
  historialNombre: {
    color: '#B8C5D6',
    fontSize: 14,
  },
  historialImporte: {
    color: Colors.eli.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  sinProyectos: {
    color: Colors.eli.grayLight,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 30,
  },
  ongSection: {
    margin: 16,
    backgroundColor: Colors.eli.grayDark,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.eli.border,
  },
  ongTitulo: {
    color: Colors.eli.white,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  botonRegistrarONG: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.eli.primary,
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  botonRegistrarONGTexto: {
    color: Colors.eli.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  formONG: {
    gap: 12,
  },
  inputONG: {
    backgroundColor: Colors.eli.background,
    borderRadius: 10,
    padding: 12,
    color: Colors.eli.white,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.eli.border,
  },
  inputMultiline: {
    height: 80,
    textAlignVertical: 'top',
  },
  botonFoto: {
    backgroundColor: Colors.eli.background,
    borderWidth: 1,
    borderColor: Colors.eli.primary,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  botonFotoTexto: {
    color: Colors.eli.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  formBotones: {
    gap: 10,
    marginTop: 4,
  },
  botonEnviarSolicitud: {
    backgroundColor: Colors.eli.primary,
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  botonEnviarSolicitudTexto: {
    color: Colors.eli.background,
    fontSize: 14,
    fontWeight: 'bold',
  },
  botonCancelar: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.eli.border,
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  botonCancelarTexto: {
    color: Colors.eli.grayLight,
    fontSize: 14,
    fontWeight: '600',
  },
  estadoRegistroTexto: {
    color: Colors.eli.primary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 8,
  },
  cargandoTexto: {
    color: Colors.eli.grayLight,
    fontSize: 14,
    marginTop: 10,
  },
  inputLabel: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  tipoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tipoBoton: {
    borderWidth: 1,
    borderColor: Colors.eli.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Colors.eli.background,
  },
  tipoBotonActivo: {
    borderColor: Colors.eli.primary,
    backgroundColor: '#0D2B2B',
  },
  tipoBotonTexto: {
    color: Colors.eli.grayLight,
    fontSize: 12,
  },
  tipoBotonTextoActivo: {
    color: Colors.eli.primary,
    fontWeight: '600',
  },
  iaAprobado: {
    backgroundColor: 'rgba(0,201,177,0.08)',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,201,177,0.3)',
    marginBottom: 12,
  },
  iaAprobadoTitulo: {
    color: Colors.eli.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  iaAprobadoSub: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    marginTop: 2,
  },
  iaPuntuacion: {
    color: Colors.eli.primary,
    fontSize: 12,
    marginTop: 4,
  },
  iaRechazado: {
    backgroundColor: '#2B0D0D',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ff6b6b',
    marginBottom: 12,
  },
  iaRechazadoTitulo: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: '700',
  },
  iaRechazadoMotivo: {
    color: '#ffaaaa',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
  iaFaltanLabel: {
    color: '#ff6b6b',
    fontSize: 12,
    fontWeight: '600',
  },
  iaFaltanItem: {
    color: '#ffaaaa',
    fontSize: 12,
    marginTop: 2,
  },
  iaPlazo: {
    color: '#ff6b6b',
    fontSize: 11,
    marginTop: 6,
    fontStyle: 'italic',
  },
  iaMensajePublico: {
    color: Colors.eli.grayLight,
    fontSize: 11,
    marginTop: 8,
    fontStyle: 'italic',
  },
  cuestionarioPasos: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cuestionarioPunto: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.eli.border,
  },
  cuestionarioPuntoActivo: {
    backgroundColor: Colors.eli.primary,
  },
  cuestionarioPasoLabel: {
    color: Colors.eli.grayLight,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  botonDesactivado: {
    opacity: 0.4,
  },
  regla60Box: {
    marginTop: 12,
    backgroundColor: Colors.eli.background,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.eli.border,
    width: '100%',
  },
  regla60Titulo: {
    color: Colors.eli.grayLight,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  regla60Fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.eli.border,
  },
  regla60Label: {
    color: Colors.eli.grayLight,
    fontSize: 12,
  },
  regla60Valor: {
    color: Colors.eli.white,
    fontSize: 12,
    fontWeight: '600',
  },
  regla60Nota: {
    color: Colors.eli.grayLight,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 16,
  },
});
