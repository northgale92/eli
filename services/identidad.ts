import AsyncStorage from '@react-native-async-storage/async-storage';
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { obtenerDeviceHash } from './dispositivoHash';

console.warn('ELI-DEBUG: identidad.ts cargado');

const KEY_USUARIO = 'eli_usuario';
const KEY_PUB = 'eli_pub_key';
const KEY_PRIV = 'eli_priv_key';
const KEY_NOMBRE_VISIBLE = 'eli_nombre_visible';
const KEY_FOTO_PERFIL = 'eli_foto_perfil';

export interface Identidad {
  usuario: string;
  clavePublica: string;  // base64
  clavePrivada: string;  // base64, nunca sale del dispositivo
}

// ─── Perfil (nombre visible + foto) ─────────────────────────────────────────
//
// `usuario` es el handle fijo: se usa como id de canal (idCanal), como
// identificador de miembro de grupo y como clave de búsqueda en Gun — cambiarlo
// rompería conversaciones y grupos existentes. Por eso el "nombre visible" que
// pide esta pantalla (paridad con el nombre de perfil de WhatsApp) se modela
// como un campo SEPARADO, igual que en WhatsApp el número de teléfono no
// cambia pero el nombre sí. Ver services/gun.ts publicarPerfil/leerPerfil para
// la propagación a los contactos.

export async function obtenerNombreVisible(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_NOMBRE_VISIBLE);
}

export async function obtenerFotoPerfil(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_FOTO_PERFIL);
}

export async function guardarPerfilLocal(nombreVisible: string, fotoPerfilBase64: string | null): Promise<void> {
  if (fotoPerfilBase64 === null) {
    await AsyncStorage.multiSet([[KEY_NOMBRE_VISIBLE, nombreVisible]]);
    await AsyncStorage.removeItem(KEY_FOTO_PERFIL);
  } else {
    await AsyncStorage.multiSet([
      [KEY_NOMBRE_VISIBLE, nombreVisible],
      [KEY_FOTO_PERFIL, fotoPerfilBase64],
    ]);
  }
}

function claveTemporalBase64(): string {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  return encodeBase64(bytes);
}

export async function crearIdentidad(usuario: string): Promise<Identidad> {
  let clavePublica: string;
  let clavePrivada: string;

  try {
    const par = nacl.box.keyPair();
    clavePublica = encodeBase64(par.publicKey);
    clavePrivada = encodeBase64(par.secretKey);
  } catch (err) {
    console.warn('[Identidad] nacl.box.keyPair() falló, usando clave temporal:', err);
    clavePublica = claveTemporalBase64();
    clavePrivada = claveTemporalBase64();
  }

  try {
    await AsyncStorage.multiSet([
      [KEY_USUARIO, usuario],
      [KEY_PUB, clavePublica],
      [KEY_PRIV, clavePrivada],
    ]);
  } catch (err) {
    console.warn('[Identidad] AsyncStorage.multiSet falló, identidad solo en memoria:', err);
  }

  // Generar y cachear el hash de dispositivo en el momento de creación de cuenta.
  // El valor queda disponible vía leerDeviceHash() para cuando se implemente el
  // endpoint de registro.
  // TODO [servidor]: al integrar el endpoint, enviar aquí:
  //   POST /api/registro { usuario, pubKey: clavePublica, deviceHash }
  //   donde deviceHash = await leerDeviceHash()
  await obtenerDeviceHash().catch(() => {});

  return { usuario, clavePublica, clavePrivada };
}

export async function obtenerIdentidad(): Promise<Identidad | null> {
  try {
    const [[, usuario], [, pub], [, priv]] = await AsyncStorage.multiGet([
      KEY_USUARIO, KEY_PUB, KEY_PRIV,
    ]);
    if (!usuario || !pub || !priv) return null;

    try {
      const pubDerivada = encodeBase64(nacl.box.keyPair.fromSecretKey(decodeBase64(priv)).publicKey);
      if (pubDerivada !== pub) {
        // Identidades creadas antes del fix del polyfill de PRNG (ver import-order
        // en index.js) quedaron con un par de claves falso: dos valores
        // Math.random() independientes en vez de un keypair NaCl real. Se
        // regeneran de forma transparente aquí para no requerir reinstalación.
        await borrarIdentidad();
        return await crearIdentidad(usuario);
      }
    } catch {
      // Si falla la derivación, seguimos con la identidad tal cual está;
      // el fallo real (si lo hay) se manifestará al cifrar/descifrar.
    }

    return { usuario, clavePublica: pub, clavePrivada: priv };
  } catch (err) {
    console.warn('[Identidad] obtenerIdentidad falló:', err);
    return null;
  }
}

export async function obtenerUsuario(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_USUARIO);
}

export async function obtenerClavePublica(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_PUB);
}

export async function obtenerClavePrivada(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_PRIV);
}

export async function identidadExiste(): Promise<boolean> {
  const usuario = await AsyncStorage.getItem(KEY_USUARIO);
  return usuario !== null;
}

// Mismo patrón que contactos.borrarHash() y dispositivoHash.borrarDeviceHash():
// limpia únicamente lo que gestiona este módulo (usuario + par de claves NaCl).
// Llamado desde el flujo de cierre de sesión / autodestrucción de cuenta
// (services/destruirApp.ts).
export async function borrarIdentidad(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([KEY_USUARIO, KEY_PUB, KEY_PRIV]);
  } catch {}
}

// Cifra un mensaje para el destinatario usando NaCl box (ECDH + XSalsa20-Poly1305)
export function cifrarMensaje(
  texto: string,
  clavePublicaDestinatario: string,
  clavePrivadaPropia: string,
): { cifrado: string; nonce: string } {
  const encoder = new TextEncoder();
  const mensaje = encoder.encode(texto);
  const pubDest = decodeBase64(clavePublicaDestinatario);
  const privPropia = decodeBase64(clavePrivadaPropia);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const cifrado = nacl.box(mensaje, nonce, pubDest, privPropia);
  return {
    cifrado: encodeBase64(cifrado),
    nonce: encodeBase64(nonce),
  };
}

// Descifra un mensaje recibido
export function descifrarMensaje(
  cifradoB64: string,
  nonceB64: string,
  clavePublicaRemitente: string,
  clavePrivadaPropia: string,
): string | null {
  try {
    const decoder = new TextDecoder();
    const cifrado = decodeBase64(cifradoB64);
    const nonce = decodeBase64(nonceB64);
    const pubRem = decodeBase64(clavePublicaRemitente);
    const privPropia = decodeBase64(clavePrivadaPropia);
    const claro = nacl.box.open(cifrado, nonce, pubRem, privPropia);
    if (!claro) return null;
    return decoder.decode(claro);
  } catch {
    return null;
  }
}
