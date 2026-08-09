import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_DEVICE_HASH = 'eli_device_hash';

// Prefijo de dominio: evita colisión con hashes del mismo ID usados en otros contextos.
const DOMINIO = 'eli-device-v1:';

// Devuelve el SHA-256 del identificador nativo de plataforma, con caché en AsyncStorage.
//
// Android: ANDROID_ID — persiste entre reinstalaciones del mismo APK en el mismo dispositivo;
//          solo cambia con factory reset o en algunos casos al cambiar de cuenta Google.
// iOS:     identifierForVendor — persiste mientras quede al menos una app de este vendor
//          instalada; se restablece si se desinstalan todas las apps del vendor.
//
// LIMITACIÓN CONOCIDA: esta huella es una barrera de fricción razonable, no una garantía
// criptográfica fuerte. Un usuario con root/jailbreak o herramientas de emulación puede
// falsificar ambos identificadores. Es coherente con la arquitectura de moderación del
// proyecto: capas de disuasión progresivas, no seguridad absoluta contra adversarios
// sofisticados.
export async function obtenerDeviceHash(): Promise<string | null> {
  const cached = await AsyncStorage.getItem(KEY_DEVICE_HASH);
  if (cached) return cached;
  return _generarYCachar();
}

async function _generarYCachar(): Promise<string | null> {
  let rawId: string | null = null;

  try {
    if (Platform.OS === 'android') {
      rawId = Application.getAndroidId();
    } else if (Platform.OS === 'ios') {
      rawId = await Application.getIosIdForVendorAsync();
    }
  } catch {
    return null;
  }

  if (!rawId) return null;

  const digest = sha256(utf8ToBytes(DOMINIO + rawId));
  const hash = bytesToHex(digest);

  try {
    await AsyncStorage.setItem(KEY_DEVICE_HASH, hash);
  } catch {}

  return hash;
}

export async function leerDeviceHash(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_DEVICE_HASH);
}

// Llamar desde el flujo de borrado de cuenta (autodestruccion/destruirApp)
// para limpiar la caché local. El hash en el servidor lo gestiona el endpoint
// de ban (prompt separado).
export async function borrarDeviceHash(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_DEVICE_HASH);
  } catch {}
}
