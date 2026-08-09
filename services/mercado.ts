import * as Location from 'expo-location';
import { obtenerGun } from './gun';

const SALA_GLOBALES = 'eli-mercado-globales-v1';
const SALA_CIUDAD = 'eli-mercado-ciudad-v1';

export interface Tienda {
  id: string;
  nombre: string;
  categoria: string;
  descripcion: string;
  url: string;
  verificada: boolean;
  tipo: 'global' | 'ciudad';
  ciudad?: string;
  pais?: string;
  lat?: number;
  lng?: number;
  timestamp: number;
}

// Obtener ciudad del usuario sin guardar nada en servidores
export async function obtenerCiudadUsuario(): Promise<{ ciudad: string; lat: number; lng: number } | null> {
  try {
    const permiso = await Location.requestForegroundPermissionsAsync();
    if (permiso.status !== 'granted') return null;
    const ubicacion = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    const geocode = await Location.reverseGeocodeAsync({
      latitude: ubicacion.coords.latitude,
      longitude: ubicacion.coords.longitude,
    });
    if (geocode.length > 0) {
      return {
        ciudad: geocode[0].city || geocode[0].region || 'Tu ciudad',
        lat: ubicacion.coords.latitude,
        lng: ubicacion.coords.longitude,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Calcular distancia en km entre dos puntos
function calcularDistancia(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Escuchar tiendas globales
export function escucharTiendasGlobales(callback: (tienda: Tienda) => void) {
  obtenerGun().get(SALA_GLOBALES).map().on((data: any) => {
    if (data && data.nombre) callback(data);
  });
}

// Escuchar tiendas de ciudad filtradas por proximidad (50km)
export function escucharTiendasCiudad(
  userLat: number,
  userLng: number,
  callback: (tienda: Tienda) => void
) {
  obtenerGun().get(SALA_CIUDAD).map().on((data: any) => {
    if (data && data.nombre && data.lat && data.lng) {
      const distancia = calcularDistancia(userLat, userLng, data.lat, data.lng);
      if (distancia <= 50) callback(data);
    }
  });
}

// Registrar tienda — OpenCollective gestiona el pago, ELI nunca ve datos bancarios
export function registrarTienda(tienda: Omit<Tienda, 'id' | 'timestamp' | 'verificada'>) {
  const nueva: Tienda = {
    ...tienda,
    id: Math.random().toString(36).substr(2, 9),
    timestamp: Date.now(),
    verificada: false, // La IA + comunidad verifican después
  };
  const sala = tienda.tipo === 'global' ? SALA_GLOBALES : SALA_CIUDAD;
  obtenerGun().get(sala).get(nueva.id).put(nueva);
  return nueva.id;
}

// Registrar clic real — sin filtros, sin inflación — lo que ve la empresa es lo que es
export function registrarClic(tiendaId: string, tipo: 'global' | 'ciudad') {
  const sala = tipo === 'global' ? SALA_GLOBALES : SALA_CIUDAD;
  obtenerGun().get(sala).get(tiendaId).once((data: any) => {
    if (!data) return;
    obtenerGun().get(sala).get(tiendaId).put({ clics: (data.clics || 0) + 1 });
  });
}
