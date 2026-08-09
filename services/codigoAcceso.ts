// ══════════════════════════════════════════════════════════════════════════════
// "CÓDIGO DE ACCESO ALTERNATIVO" — nombre visible en Ajustes y en la pantalla
// de bloqueo. En realidad es un PIN de coacción: si el código introducido en
// la pantalla de bloqueo coincide con el configurado aquí, dispara en
// silencio absoluto el mismo borrado de services/destruirApp.ts. Cualquier
// otra combinación de 4 dígitos no hace nada — ni desbloquea la app ni deja
// ningún indicio. La huella (o el PIN de respaldo del propio sistema
// operativo) sigue siendo la única forma real de entrar; este módulo nunca
// concede acceso, solo puede borrar en silencio o no hacer nada.
//
// Completamente independiente del PIN de respaldo nativo de
// expo-local-authentication ("Use PIN" del sistema operativo cuando falla la
// biometría, ver app/_layout.tsx): la app nunca ve ni almacena ese PIN, así
// que no hay nada de lo que derivar el de aquí ni con lo que pueda coincidir.
//
// Guardado en SecureStore (mismo mecanismo que la preferencia de
// autodestrucción en destruirApp.ts) como hash con sal aleatoria — nunca en
// texto plano — para que una fuga accidental (p.ej. un log de depuración
// futuro) no exponga el código real. Los nombres de clave son
// deliberadamente neutros y no deben delatar la función si alguien
// inspecciona el almacén del dispositivo.
// ══════════════════════════════════════════════════════════════════════════════

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { obtenerUsuario } from './identidad';
import { ejecutarAutodestruccion, obtenerPreferenciaBorrarPublicaciones } from './destruirApp';

const CLAVE_ACTIVO = 'eli_accalt_on';
const CLAVE_HASH = 'eli_accalt_h';
const CLAVE_SAL = 'eli_accalt_s';

// Retraso mínimo aplicado siempre, coincida o no el código — sin esto, un
// intento que dispara el borrado (con trabajo real de por medio) tardaría
// perceptiblemente más que uno que no hace nada, y esa diferencia de tiempo
// sería en sí misma una pista.
const RETRASO_MS = 400;

async function generarSal(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashCodigo(codigo: string, sal: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${sal}:${codigo}`);
}

// Comparación en tiempo constante: === y String.includes cortocircuitan en el
// primer carácter distinto, lo que filtraría por temporización cuántos
// caracteres iniciales acertó un intento.
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function estaActivado(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(CLAVE_ACTIVO)) === 'true';
  } catch {
    return false;
  }
}

export async function activar(codigo: string): Promise<void> {
  const sal = await generarSal();
  const hash = await hashCodigo(codigo, sal);
  await SecureStore.setItemAsync(CLAVE_SAL, sal);
  await SecureStore.setItemAsync(CLAVE_HASH, hash);
  await SecureStore.setItemAsync(CLAVE_ACTIVO, 'true');
}

export async function desactivar(): Promise<void> {
  await SecureStore.setItemAsync(CLAVE_ACTIVO, 'false');
  await SecureStore.deleteItemAsync(CLAVE_HASH).catch(() => {});
  await SecureStore.deleteItemAsync(CLAVE_SAL).catch(() => {});
}

// Se llama con cada intento de 4 dígitos desde la pantalla de bloqueo.
// SIEMPRE resuelve en ~RETRASO_MS, sin lanzar y sin devolver ninguna
// información sobre si acertó — el llamador no debe (ni puede) distinguir
// los casos, ni mostrar nada distinto según el resultado.
export async function intentarCodigo(codigoIngresado: string): Promise<void> {
  const inicio = Date.now();

  const coincide = await (async () => {
    try {
      const [sal, hashGuardado] = await Promise.all([
        SecureStore.getItemAsync(CLAVE_SAL),
        SecureStore.getItemAsync(CLAVE_HASH),
      ]);
      if (!sal || !hashGuardado) return false;
      const hashIntento = await hashCodigo(codigoIngresado, sal);
      return iguales(hashIntento, hashGuardado);
    } catch {
      return false;
    }
  })();

  if (coincide) {
    // Fire-and-forget deliberado: el borrado real no debe alargar el tiempo
    // de respuesta visible de este intento (ver RETRASO_MS), y su resultado
    // nunca debe propagarse a la UI de ninguna forma.
    (async () => {
      try {
        const usuario = await obtenerUsuario();
        const borrarPublicaciones = await obtenerPreferenciaBorrarPublicaciones();
        await ejecutarAutodestruccion(usuario ?? '', borrarPublicaciones);
      } catch {}
    })();
  }

  const transcurrido = Date.now() - inicio;
  if (transcurrido < RETRASO_MS) {
    await new Promise((r) => setTimeout(r, RETRASO_MS - transcurrido));
  }
}
