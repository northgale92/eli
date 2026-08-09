// ══════════════════════════════════════════════════════════════════════════════
// AUTODESTRUCCIÓN DE CUENTA
// (Ajustes → banner rojo "Autodestrucción de cuenta", primera posición de la
// pantalla — acción TOTALMENTE separada de "Cerrar sesión", que es un logout
// simple y reversible y vive solo en app/ajustes.tsx sin tocar este módulo)
//
// Acción directa desde Ajustes con confirmación nativa destructiva (el
// Alert.alert vive en app/ajustes.tsx, no aquí — este módulo es lógica pura,
// sin UI). Un toggle separado y explícito, persistido en SecureStore (ver
// obtenerPreferenciaBorrarPublicaciones/guardarPreferenciaBorrarPublicaciones
// más abajo), decide si además se borran las publicaciones públicas del
// usuario en Muro/Canales. Desactivado por defecto.
//
// Tres bloques deliberadamente independientes — el fallo de uno no debe
// impedir que los demás se completen:
//   1. Publicaciones públicas (Muro/Canales) — SOLO si el toggle está activo.
//   2. Borrado de BD local (identidad, device hash, contactos, AsyncStorage,
//      preferencia del toggle) — SIEMPRE.
//   3. Cuenta en el servidor — TODO ABIERTO, ver intentarEliminarCuentaEnServidor.
// ══════════════════════════════════════════════════════════════════════════════

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { borrarIdentidad } from './identidad';
import { borrarDeviceHash } from './dispositivoHash';
import { borrarHash as borrarHashContactos } from './contactos';
import { eliminarPublicacionesDeUsuario } from './publicaciones';
import { eliminarContenidoCanalesDeUsuario } from './canales';
import { desactivar as desactivarCodigoAcceso } from './codigoAcceso';

export interface ResultadoAutodestruccion {
  exito: boolean;
  // Presente solo cuando se pidió borrar también las publicaciones públicas.
  publicacionesEliminadas?: number;
  errores: string[];
}

// ─── Preferencia del toggle "borrar también mis publicaciones públicas" ──────
//
// En SecureStore, no en AsyncStorage: vive junto al resto de la superficie
// de autodestrucción de cuenta como una decisión de seguridad explícita del
// usuario, no como una preferencia cosmética de UI. Desactivado por defecto
// — ausencia de valor guardado se interpreta como false.

const CLAVE_BORRAR_PUBLICACIONES = 'eli_autodestruccion_borrar_publicaciones';

export async function obtenerPreferenciaBorrarPublicaciones(): Promise<boolean> {
  try {
    const valor = await SecureStore.getItemAsync(CLAVE_BORRAR_PUBLICACIONES);
    return valor === 'true';
  } catch {
    return false;
  }
}

export async function guardarPreferenciaBorrarPublicaciones(valor: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(CLAVE_BORRAR_PUBLICACIONES, valor ? 'true' : 'false');
  } catch {}
}

// ─── Bloque 1: publicaciones públicas (Muro/Canales) — gateado por el toggle ──

async function borrarPublicacionesPublicas(usuario: string): Promise<number> {
  const [muro, canales] = await Promise.all([
    eliminarPublicacionesDeUsuario(usuario),
    eliminarContenidoCanalesDeUsuario(usuario),
  ]);
  return muro + canales;
}

// ─── Bloque 2: borrado de BD local ────────────────────────────────────────────
//
// Reutiliza los "borrarX" que ya existen por servicio (mismo patrón que
// contactos.borrarHash() y dispositivoHash.borrarDeviceHash()) en vez de
// duplicar su lógica aquí: cada uno limpia también su propio efecto en Gun
// (p. ej. borrarHashContactos tombstona el hash de contactos en la red, no
// solo AsyncStorage). El AsyncStorage.clear() cubre todo lo demás que vive
// solo en local y no tiene un "borrarX" propio: historial de chat
// (eli_conversaciones, eli_msgs_*), suscripciones a canales (eli_suscritos)
// y los flags de onboarding/biometría/bloqueo de app. Por último se borra
// también la preferencia del toggle en SecureStore (CLAVE_BORRAR_PUBLICACIONES)
// — una autodestrucción de cuenta no debe dejar ni ese resto.
//
// No hay MMKV/SQLite en el cliente. Gun.js se monta con `localStorage: false`
// (services/gun.ts), así que no mantiene su propio disco local que limpiar
// aparte de lo que ya cubren los tombstones (put(null)) de los bloques 1 y de
// borrarHashContactos.
async function borrarDatosLocales(): Promise<void> {
  await Promise.all([
    borrarIdentidad(),
    borrarDeviceHash(),
    borrarHashContactos(),
  ]);
  // AsyncStorage.clear() ya se encarga de 'eli-onboarding-completo',
  // 'eli-app-bloqueada' y cualquier otra bandera/caché ahí guardada — no hace
  // falta listarlas una a una. Lo que SÍ hace falta borrar aparte es todo lo
  // que vive en SecureStore, porque AsyncStorage.clear() no lo toca:
  await AsyncStorage.clear();
  await SecureStore.deleteItemAsync(CLAVE_BORRAR_PUBLICACIONES).catch(() => {});
  // El código de acceso alternativo (services/codigoAcceso.ts) es el propio
  // disparador de este borrado cuando se ejecuta por esa vía — debe
  // desactivarse también a sí mismo. Si sobreviviera, el dispositivo no
  // quedaría en el mismo estado que una instalación limpia, y un PIN que ya
  // pudo estar comprometido (es la razón de que se haya llegado hasta aquí)
  // seguiría siendo válido para la cuenta que se cree después.
  await desactivarCodigoAcceso().catch(() => {});
}

// ─── Bloque 3: cuenta en el servidor ──────────────────────────────────────────
//
// TODO ABIERTO — no se pudo cerrar en esta sesión:
//   No existe ningún endpoint de eliminación de cuenta en el backend. Las
//   únicas rutas de server/ son:
//     POST /api/registro            (server/src/routes/registro.ts)
//     POST /api/admin/banear-dispositivo (server/src/routes/admin.ts,
//                                          requiere X-ELI-ADMIN-KEY — no es
//                                          apto para invocarse desde el
//                                          cliente, es solo para moderación)
//   Además, registro.ts todavía no persiste cuentas de verdad: el
//   directorio de claves públicas vive en GunDB (nodo 'eli_usuarios_v1',
//   ver services/gun.ts), así que "eliminar la cuenta en el servidor" no
//   tiene hoy una contraparte real que borrar — el servidor es ciego y no
//   guarda nada vinculado al usuario más allá del hash de dispositivo en
//   caso de ban.
//   Cuando exista un DELETE /api/cuenta (o equivalente) en el backend, esta
//   función es el punto de conexión.
async function intentarEliminarCuentaEnServidor(_usuario: string): Promise<void> {
  // Sin implementar — ver TODO arriba. Nunca lanza ni bloquea el resto del flujo.
}

// ─── Orquestador ──────────────────────────────────────────────────────────────

export async function ejecutarAutodestruccion(
  usuario: string,
  borrarPublicacionesTambien: boolean,
): Promise<ResultadoAutodestruccion> {
  const errores: string[] = [];
  let publicacionesEliminadas: number | undefined;

  if (borrarPublicacionesTambien) {
    try {
      publicacionesEliminadas = await borrarPublicacionesPublicas(usuario);
    } catch (err) {
      errores.push(`publicaciones: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    await borrarDatosLocales();
  } catch (err) {
    errores.push(`datos_locales: ${err instanceof Error ? err.message : String(err)}`);
  }

  await intentarEliminarCuentaEnServidor(usuario).catch(() => {});

  return { exito: errores.length === 0, publicacionesEliminadas, errores };
}
