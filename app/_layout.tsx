import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, AppState, AppStateStatus, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SplashScreen from 'expo-splash-screen';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { obtenerIdentidad, identidadExiste } from '../services/identidad';
import { publicarClavePublica } from '../services/gun';
import { renovarHash } from '../services/contactos';
import { precalentarModelo } from '../services/moderacion';
import { escucharLlamadasEntrantes, sesionEnCurso } from '../services/llamadas';
import { estaActivado as codigoAccesoActivado, intentarCodigo as intentarCodigoAcceso } from '../services/codigoAcceso';

// Instrumentación de diagnóstico del arranque/biometría/splash — sirvió para
// cazar dos bugs ya resueltos (colgado de splash en arranque, y el bucle de
// re-autenticación biométrica en remounts de RootLayout). Se deja apagada
// por defecto para no ensuciar logcat; reactivar con este flag si hace
// falta volver a diagnosticar algo en esta zona.
const DEBUG_ARRANQUE = false;
function debugLog(...args: unknown[]) {
  if (DEBUG_ARRANQUE) console.warn(...args);
}

// Bloquea la UI nativa antes de que Expo Router restaure ninguna ruta.
// hideAsync() solo se llama cuando la auth biométrica está completamente resuelta.
debugLog('ELI-DEBUG: antes de preventAutoHideAsync()');
SplashScreen.preventAutoHideAsync();
debugLog('ELI-DEBUG: después de preventAutoHideAsync()');

export const unstable_settings = {
  anchor: 'terminos',
};

const BG = '#1A1A1A';

// A nivel de módulo (NO useState/useRef) — deben sobrevivir a un remount
// completo de RootLayout. Confirmado por logcat en Xiaomi físico: llamar a
// router.replace() dentro de irTrasAutenticacionExitosa() remonta
// RootLayout entero en esta versión de expo-router (mismo problema ya
// documentado más abajo para la rama de onboarding). Sin estos flags, cada
// remount reinicia useState/useRef a cero, el useEffect de arranque ([]
// deps) se relanza desde cero, y vuelve a exigir biometría — bucle
// infinito de prompts de huella tras cada autenticación exitosa.
let autenticacionResueltaEnEsteArranque = false;
let autenticacionEnCurso = false;

// Panel verde de diagnóstico [ELI-DEBUG] en pantalla (ver más abajo). Activar
// solo puntualmente para depurar arranque/splash — tapa UI real (p.ej. el
// acceso a Ajustes desde Muro) cuando queda encendido.
const MOSTRAR_DEBUG_OVERLAY = false;

function PantallaBloqueo({ onReintentar }: { onReintentar: () => void }) {
  // "Código de acceso alternativo" — ver services/codigoAcceso.ts. Solo se
  // muestra el campo si el usuario lo activó explícitamente en Ajustes (caso
  // por defecto: no aparece nada aquí, la pantalla es idéntica a como era
  // antes). Ni el acierto ni el fallo cambian nada visible en esta pantalla
  // — intentarCodigoAcceso() nunca informa cuál de los dos ocurrió.
  const [codigoAltActivo, setCodigoAltActivo] = useState(false);
  const [codigo, setCodigo] = useState('');

  useEffect(() => {
    codigoAccesoActivado().then(setCodigoAltActivo);
  }, []);

  const onCambiarCodigo = (texto: string) => {
    const limpio = texto.replace(/[^0-9]/g, '').slice(0, 4);
    setCodigo(limpio);
    if (limpio.length === 4) {
      intentarCodigoAcceso(limpio).finally(() => setCodigo(''));
    }
  };

  return (
    <View style={overlayStyles.container}>
      <Text style={overlayStyles.icono}>🔒</Text>
      <Text style={overlayStyles.titulo}>ELI bloqueado</Text>
      <Text style={overlayStyles.descripcion}>
        Autentícate con tu huella dactilar o reconocimiento facial para acceder.
      </Text>
      <TouchableOpacity style={overlayStyles.boton} onPress={onReintentar} activeOpacity={0.8}>
        <Text style={overlayStyles.botonTexto}>Intentar de nuevo</Text>
      </TouchableOpacity>
      {codigoAltActivo && (
        <View style={overlayStyles.codigoAltBox}>
          <Text style={overlayStyles.codigoAltLabel}>Código de acceso</Text>
          <TextInput
            style={overlayStyles.codigoAltInput}
            value={codigo}
            onChangeText={onCambiarCodigo}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            placeholder="····"
            placeholderTextColor="#555555"
          />
        </View>
      )}
    </View>
  );
}

const overlayStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    zIndex: 9999,
    elevation: 9999,
  },
  icono: {
    fontSize: 64,
    marginBottom: 24,
  },
  titulo: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  descripcion: {
    color: '#888888',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  boton: {
    backgroundColor: '#00C9B1',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
  },
  botonTexto: {
    color: '#1A1A1A',
    fontSize: 17,
    fontWeight: 'bold',
  },
  codigoAltBox: {
    marginTop: 28,
    alignItems: 'center',
  },
  codigoAltLabel: {
    color: '#666666',
    fontSize: 12,
    marginBottom: 8,
  },
  codigoAltInput: {
    width: 100,
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    paddingVertical: 8,
    textAlign: 'center',
    color: '#CCCCCC',
    fontSize: 18,
    letterSpacing: 8,
  },
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // 'splash': splash nativa activa, renderizar null — el usuario no ve ninguna pantalla
  // 'bloqueado': splash oculta, mostrar overlay de bloqueo encima del Stack
  // 'listo': app completamente accesible
  const [estado, setEstado] = useState<'splash' | 'bloqueado' | 'listo'>('splash');
  // DIAGNÓSTICO TEMPORAL — se muestra en pantalla porque console.log no está
  // llegando a logcat en este build. Quitar junto con el resto de [ELI-DEBUG].
  const [debugInfo, setDebugInfo] = useState('');
  const biometriaActivada = useRef(false);
  const inicializado = useRef(false);
  const splashOculta = useRef(false);
  const idPubKeyRef = useRef<string | null>(null);

  const ocultarSplash = async () => {
    if (splashOculta.current) return;
    splashOculta.current = true;
    try {
      await SplashScreen.hideAsync();
    } catch (e) {
      // Antes se tragaba el error en silencio; si hideAsync() falla
      // nativamente, la splash nunca se retira aunque el resto de la app
      // siga su curso.
      const msg = `hideAsync ERROR: ${String(e)}`;
      debugLog('[ELI-DEBUG]', msg);
      setDebugInfo(prev => (prev ? `${prev}\n${msg}` : msg));
    }
  };

  const autenticar = async (): Promise<'ok' | 'noop' | 'fallo'> => {
    // Guarda contra remounts solapados: si ya hay un authenticateAsync()
    // pendiente (confirmado por logcat: dos mounts de RootLayout casi
    // simultáneos tras un remount), no lanzar un segundo prompt nativo
    // encima del primero.
    if (autenticacionEnCurso) return 'fallo';
    autenticacionEnCurso = true;
    try {
      debugLog('ELI-DEBUG: antes de hasHardwareAsync');
      const compatible = await LocalAuthentication.hasHardwareAsync();
      debugLog('ELI-DEBUG: después de hasHardwareAsync');
      if (!compatible) return 'noop';
      debugLog('ELI-DEBUG: antes de isEnrolledAsync');
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      debugLog('ELI-DEBUG: después de isEnrolledAsync');
      if (!enrolled) return 'noop';
      debugLog('ELI-DEBUG: antes de authenticateAsync');
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquear ELI',
        fallbackLabel: 'Usar código de acceso',
        cancelLabel: 'Cancelar',
        disableDeviceFallback: false,
      });
      debugLog('ELI-DEBUG: después de authenticateAsync');
      return result.success ? 'ok' : 'fallo';
    } catch {
      return 'fallo';
    } finally {
      autenticacionEnCurso = false;
    }
  };

  // Único punto que decide a dónde ir tras una autenticación biométrica
  // exitosa — usado por el arranque en frío, la reanudación desde segundo
  // plano (pedirHuella) y "Intentar de nuevo" en la pantalla de bloqueo. Los
  // tres flujos deben tomar la MISMA decisión, en vez de asumir cada uno por
  // su cuenta que huella-correcta implica cuenta-válida.
  //
  // La huella solo autentica el desbloqueo físico del dispositivo — nunca
  // implica por sí sola que exista una cuenta real detrás. Sin esta
  // comprobación explícita, un borrado ocurrido mientras la app seguía en
  // memoria (autodestrucción normal desde Ajustes, o en silencio vía el
  // código de acceso alternativo, ver services/codigoAcceso.ts) dejaba al
  // dispositivo entrando directo a /dashboard con una identidad inexistente,
  // porque router.replace('/dashboard') aquí no volvía a comprobar nada.
  const irTrasAutenticacionExitosa = async () => {
    // Debe fijarse ANTES del router.replace() de más abajo: ese replace es
    // justo lo que remonta RootLayout, y el useEffect de arranque del mount
    // nuevo lee este flag para no repetir la biometría.
    autenticacionResueltaEnEsteArranque = true;
    await ocultarSplash();
    await AsyncStorage.removeItem('eli-app-bloqueada');
    const [hayIdentidad, onboardingDone] = await Promise.all([
      identidadExiste(),
      AsyncStorage.getItem('eli-onboarding-completo'),
    ]);
    setEstado('listo');
    if (hayIdentidad && onboardingDone === 'true') {
      router.replace('/dashboard');
    } else {
      router.replace('/terminos');
    }
  };

  const pedirHuella = async () => {
    await ocultarSplash(); // garantiza que la splash se oculta antes de mostrar el overlay
    setEstado('bloqueado');
    const bio = await autenticar();
    if (bio === 'ok' || bio === 'noop') {
      await irTrasAutenticacionExitosa();
    }
    // 'fallo' → se queda en 'bloqueado', el usuario ve el botón "Intentar de nuevo"
  };

  useEffect(() => {
    debugLog('ELI-DEBUG: useEffect#1 arrancado');
    let cancelado = false;

    const ejecutar = async () => {
      await new Promise(r => setTimeout(r, 0)); // cede un tick antes de empezar
      debugLog('ELI-DEBUG: tras setTimeout inicial');

      // Volcado completo de AsyncStorage al arrancar, acumulado en `lineas`
      // y volcado a pantalla vía setDebugInfo — solo visible si
      // MOSTRAR_DEBUG_OVERLAY está activo; el console.warn respeta DEBUG_ARRANQUE.
      const lineas: string[] = [];
      const log = (msg: string) => {
        lineas.push(msg);
        debugLog('[ELI-DEBUG]', msg);
        setDebugInfo(lineas.join('\n'));
      };

      try {
        // Protegido con timeout propio: este volcado es solo diagnóstico y no
        // debe poder colgar el arranque si AsyncStorage tarda (a diferencia
        // de la lectura real de identidad/onboarding de más abajo, que sí
        // está cubierta por el race de 5s).
        debugLog('ELI-DEBUG: antes de AsyncStorage dump');
        const dump = await Promise.race([
          (async () => {
            const todasLasClaves = await AsyncStorage.getAllKeys();
            return AsyncStorage.multiGet(todasLasClaves);
          })(),
          new Promise<null>((r) => setTimeout(() => r(null), 2000)),
        ]);
        if (dump === null) {
          log('AsyncStorage dump: timeout 2s (omitido, no bloquea el arranque)');
        } else {
          log(`AsyncStorage completo: ${JSON.stringify(dump)}`);
        }
      } catch (e) {
        log(`fallo al volcar AsyncStorage: ${String(e)}`);
      }
      debugLog('ELI-DEBUG: después de AsyncStorage dump');

      const timeout = new Promise<null>((r) => setTimeout(() => r(null), 5000));

      debugLog('ELI-DEBUG: antes de Promise.race');
      const resultado = await Promise.race([
        Promise.all([
          obtenerIdentidad(),
          AsyncStorage.getItem('eli-onboarding-completo').catch(() => null),
        ]),
        timeout,
      ]);

      log(`resultado race (null = timeout 5s): ${JSON.stringify(resultado)}`);

      if (cancelado) return;

      if (resultado === null) {
        // Timeout de lectura (AsyncStorage/identidad no respondió a tiempo) —
        // NUNCA forzar '/dashboard' aquí: eso saltaría onboarding/biometría
        // para cualquier usuario cuya lectura tarde, dejándolo con una
        // identidad inexistente. Fail-safe: quedarse en el anchor ('terminos')
        // y dejar que el usuario pase por el flujo normal.
        await ocultarSplash();
        setEstado('listo');
        return;
      }

      const [id, onboardingDone] = resultado;

      log(`id (obtenerIdentidad): ${JSON.stringify(id)}`);
      log(`onboardingDone (raw): ${JSON.stringify(onboardingDone)} — typeof: ${typeof onboardingDone}`);

      if (id) {
        idPubKeyRef.current = id.usuario;
        // Diferido a un macrotask: obtenerGun() crea la instancia de Gun de
        // forma síncrona en el primer uso, y una inicialización lenta/colgada
        // ahí no debe poder bloquear la transición splash -> navegación.
        setTimeout(() => publicarClavePublica(id.usuario, id.clavePublica), 0);
        renovarHash().catch(() => {}); // fire-and-forget, no bloquea el arranque
      }

      if (onboardingDone !== 'true') {
        // No navegar aquí: app/index.tsx ya redirige a /terminos (es la ruta
        // ancla real que resuelve expo-router en frío). Llamar a router.replace
        // aquí también, sobre una app que ya está en camino a /terminos,
        // desencadena un remount completo de RootLayout (esta versión de
        // expo-router no memoiza el rootComponent entre navegaciones), que
        // relanza este efecto y vuelve a llamar a replace: bucle infinito.
        log('RAMA: onboardingDone !== "true" -> mostrando anchor/onboarding');
        await ocultarSplash();
        setEstado('listo');
        return;
      }

      if (autenticacionResueltaEnEsteArranque) {
        // Este mount es un remount provocado por el router.replace() de
        // irTrasAutenticacionExitosa() tras una autenticación ya exitosa en
        // un mount anterior de este mismo arranque — no volver a pedir
        // huella (ver flags a nivel de módulo más arriba).
        log('RAMA: autenticacionResueltaEnEsteArranque -> remount tras auth, sin repetir biometría');
        await ocultarSplash();
        setEstado('listo');
        return;
      }

      log('RAMA: onboardingDone === "true" -> exigiendo biometría Nivel 1');

      // Nivel 1: la app SIEMPRE exige biometría al entrar (cold start), una vez
      // completado el onboarding — no depende de la preferencia opt-in
      // 'eli-biometria-activada'. autenticar() resuelve 'noop' cuando el
      // dispositivo no tiene hardware o huellas/rostro registrados, dejando
      // pasar igualmente en ese caso.
      biometriaActivada.current = true;
      const bio = await autenticar();
      if (cancelado) return;
      if (bio === 'ok' || bio === 'noop') {
        await irTrasAutenticacionExitosa();
      } else {
        await ocultarSplash();
        setEstado('bloqueado');
      }
    };

    ejecutar()
      .catch(async (e) => {
        // Mismo fail-safe que el timeout de arriba: un error inesperado no
        // debe saltarse onboarding/biometría. Quedarse en el anchor.
        console.warn('[ELI-LAYOUT] error crítico en ejecutar:', String(e));
        await ocultarSplash();
        setEstado('listo');
      })
      .finally(() => { inicializado.current = true; });
    // Diferido para no bloquear el event loop durante el arranque
    setTimeout(() => precalentarModelo(), 3000);

    return () => { cancelado = true; };
  }, []);

  // En MIUI/Android el proceso no muere al pulsar atrás: el layout no se remontan.
  // Detectamos el regreso a primer plano y leemos el flag para forzar la auth.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      debugLog('[ELI-DEBUG] AppState change:', nextState, 'inicializado:', inicializado.current);
      if (nextState === 'active' && inicializado.current) {
        AsyncStorage.getItem('eli-app-bloqueada').then((val) => {
          debugLog('[ELI-DEBUG] AppState resume — eli-app-bloqueada:', JSON.stringify(val));
          if (val === 'true') {
            pedirHuella();
          } else {
            renovarHash().catch(() => {}); // fire-and-forget al volver a primer plano
          }
        });
      }
    });
    return () => subscription.remove();
  }, []);

  // Escuchar llamadas entrantes mientras la app está activa y hay identidad cargada
  useEffect(() => {
    if (estado !== 'listo' || !idPubKeyRef.current) return;
    const miPubKey = idPubKeyRef.current;
    const cancelar = escucharLlamadasEntrantes(miPubKey, ({ de, sesionId }) => {
      if (sesionEnCurso()) return;
      router.push(
        `/llamada?tipo=entrante&de=${encodeURIComponent(de)}&sesionId=${encodeURIComponent(sesionId)}&miPubKey=${encodeURIComponent(miPubKey)}`,
      );
    });
    return cancelar;
  }, [estado]);

  // Mientras la splash nativa está activa, no montar ninguna vista de React
  if (estado === 'splash') return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: BG } }}>
        <Stack.Screen name="terminos"          options={{ headerShown: false, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="onboarding"        options={{ headerShown: false, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="identidad"         options={{ headerShown: false, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="ajustes"           options={{ headerShown: false, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="conversacion"      options={{ headerShown: false, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="llamada"           options={{ headerShown: false, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="contactos"         options={{ headerShown: false, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="nueva-publicacion" options={{ headerShown: false, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="comentarios"       options={{ headerShown: false, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen
          name="dashboard"
          options={{
            headerShown: false,
            contentStyle: { backgroundColor: BG },
            gestureEnabled: false,
            headerBackVisible: false,
          }}
        />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, contentStyle: { backgroundColor: BG } }} />
        <Stack.Screen name="modal"  options={{ presentation: 'modal', title: 'Modal', contentStyle: { backgroundColor: BG } }} />
      </Stack>
      <StatusBar style="dark" />
      {estado === 'bloqueado' && (
        <PantallaBloqueo
          onReintentar={async () => {
            const bio = await autenticar();
            if (bio === 'ok' || bio === 'noop') {
              await irTrasAutenticacionExitosa();
            }
          }}
        />
      )}
      {/* DIAGNÓSTICO TEMPORAL — quitar junto con el resto de [ELI-DEBUG] */}
      {MOSTRAR_DEBUG_OVERLAY && debugInfo !== '' && (
        <View style={debugStyles.container} pointerEvents="box-none">
          <ScrollView style={debugStyles.scroll}>
            <Text selectable style={debugStyles.texto}>{debugInfo}</Text>
          </ScrollView>
        </View>
      )}
    </ThemeProvider>
  );
}

const debugStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 40,
    left: 8,
    right: 8,
    maxHeight: '55%',
    backgroundColor: 'rgba(0,0,0,0.88)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00C9B1',
    zIndex: 99999,
    elevation: 99999,
  },
  scroll: {
    padding: 10,
  },
  texto: {
    color: '#00FF88',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});

