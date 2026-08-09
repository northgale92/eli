import AsyncStorage from '@react-native-async-storage/async-storage';
import { argon2id } from '@noble/hashes/argon2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import * as Contacts from 'expo-contacts';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { obtenerGun } from './gun';
import { obtenerClavePublica, obtenerUsuario } from './identidad';

console.warn('ELI-DEBUG: contactos.ts cargado');

const KEY_HASH = 'eli_contactos_mi_hash';
const KEY_ACTIVO = 'eli_contactos_activo';
const KEY_PAIS = 'eli_contactos_pais';
const NODO = 'eli-contactos-v1';

// Sal fija de dominio. Intencionalmente no aleatoria: el caso de uso es matching
// distribuido (el mismo número debe producir el mismo hash en todos los dispositivos),
// no almacenamiento de contraseñas. La sal evita reutilizar rainbow tables de otros
// contextos. La defensa real contra fuerza bruta es el coste de Argon2id
// (m=32 MiB, t=3 iteraciones), que hace el barrido de un país inviable a escala.
const PHONE_SALT = utf8ToBytes('eli-phone-match-v1');

export interface EntradaContacto {
  hash: string;
  pubKey: string;
  alias: string;
}

export interface ContactoEncontrado {
  nombre: string;
  alias: string;
  clavePublica: string;
}

// Normaliza cualquier formato de teléfono a E.164 (+34612345678).
// Devuelve null si el número es inválido o no parseable.
export function normalizarE164(numero: string, pais?: string): string | null {
  const parsed = parsePhoneNumberFromString(numero.trim(), pais as any);
  return parsed?.isValid() ? parsed.format('E.164') : null;
}

export function extraerPais(e164: string): string | undefined {
  return parsePhoneNumberFromString(e164)?.country;
}

export async function hashearTelefono(e164: string): Promise<string> {
  const digest = argon2id(utf8ToBytes(e164), PHONE_SALT, {
    t: 3,      // iteraciones (time cost)
    m: 32768,  // memoria en KiB (32 MiB)
    p: 1,      // paralelismo (JS single-threaded)
    dkLen: 32, // 256 bits de salida
  });
  return bytesToHex(digest);
}

// Lee la entrada actual para un hash en Gun. Timeout de 8 s para no bloquear.
export async function leerEntradaGun(hash: string): Promise<EntradaContacto | null> {
  return new Promise((resolve) => {
    try {
      const timeout = setTimeout(() => resolve(null), 8000);
      obtenerGun().get(NODO).get(hash).once((data: any) => {
        clearTimeout(timeout);
        const vigente = data?.pubKey && data?.expTs && data.expTs > Date.now();
        if (vigente) {
          resolve({ hash: data.hash ?? hash, pubKey: data.pubKey, alias: data.alias ?? '' });
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });
}

export async function publicarHash(hash: string, pubKey: string, alias: string): Promise<void> {
  const ts = Date.now();
  const expTs = ts + 48 * 60 * 60 * 1000;
  obtenerGun().get(NODO).get(hash).put({ hash, pubKey, alias, ts, expTs });
  await AsyncStorage.setItem(KEY_HASH, hash);
  await AsyncStorage.setItem(KEY_ACTIVO, 'true');
}

// Renueva el expTs del hash propio sin cambiar ningún dato de identidad.
// Seguro llamar en cada apertura: sale inmediatamente si el interruptor está apagado
// o si no hay hash publicado.
export async function renovarHash(): Promise<void> {
  const { activo } = await leerEstado();
  if (!activo) return;
  const hash = await leerMiHash();
  if (!hash) return;
  const [pubKey, alias] = await Promise.all([obtenerClavePublica(), obtenerUsuario()]);
  if (!pubKey || !alias) return;
  await publicarHash(hash, pubKey, alias);
}

export async function borrarHash(): Promise<void> {
  try {
    const hash = await AsyncStorage.getItem(KEY_HASH);
    if (hash) obtenerGun().get(NODO).get(hash).put(null);
    await AsyncStorage.multiRemove([KEY_HASH, KEY_ACTIVO, KEY_PAIS]);
  } catch {}
}

export async function guardarPais(pais: string): Promise<void> {
  await AsyncStorage.setItem(KEY_PAIS, pais);
}

export async function leerEstado(): Promise<{ activo: boolean; pais: string | null }> {
  const [activo, pais] = await Promise.all([
    AsyncStorage.getItem(KEY_ACTIVO),
    AsyncStorage.getItem(KEY_PAIS),
  ]);
  return { activo: activo === 'true', pais };
}

export async function leerMiHash(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_HASH);
}

// Lee la agenda, hashea cada número en local, consulta Gun y devuelve coincidencias.
// Lanza Error('permiso_denegado') si el usuario rechaza el acceso a los contactos.
export async function buscarEnAgenda(pais?: string): Promise<ContactoEncontrado[]> {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') throw new Error('permiso_denegado');

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
  });

  // Construir mapa hash → nombre (sin subir ningún número)
  const mapaHash = new Map<string, string>();
  for (const c of data) {
    if (!c.name || !c.phoneNumbers?.length) continue;
    for (const tel of c.phoneNumbers) {
      if (!tel.number) continue;
      const e164 = normalizarE164(tel.number, pais);
      if (!e164) continue;
      const h = await hashearTelefono(e164);
      if (!mapaHash.has(h)) mapaHash.set(h, c.name);
    }
  }

  // Excluir el propio hash para no mostrarse a uno mismo
  const miHash = await leerMiHash();
  if (miHash) mapaHash.delete(miHash);

  // Consultar Gun por cada hash (en paralelo, timeout individual de 5 s)
  const coincidencias: ContactoEncontrado[] = [];
  await Promise.all(
    Array.from(mapaHash.entries()).map(([h, nombre]) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 5000);
        obtenerGun().get(NODO).get(h).once((data: any) => {
          clearTimeout(t);
          const vigente = data?.pubKey && data?.alias && data?.expTs && data.expTs > Date.now();
          if (vigente) {
            coincidencias.push({ nombre, alias: data.alias, clavePublica: data.pubKey });
          }
          resolve();
        });
      }),
    ),
  );

  return coincidencias;
}
