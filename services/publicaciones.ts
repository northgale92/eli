import { obtenerGun } from './gun';

const SALA = 'eli-muro-v1';

export function publicar(
  texto: string,
  usuario: string,
  imagen: string | null = null,
  video: string | null = null,
  documento: string | null = null,
  requiereNeblina = false,
  esPeriodista = false,
) {
  const pub = {
    id: Math.random().toString(36).slice(2, 11),
    usuario,
    texto,
    imagen,
    video,
    documento,
    requiereNeblina,
    esPeriodista,
    timestamp: Date.now(),
    likes: 0,
  };
  obtenerGun().get(SALA).get(pub.id).put(pub);
}

export function escucharPublicaciones(callback: (pub: any) => void) {
  obtenerGun().get(SALA).map().on((data: any) => {
    if (data && data.texto) {
      callback(data);
    }
  });
}

export function darLike(id: string, likesActuales: number) {
  obtenerGun().get(SALA).get(id).put({ likes: likesActuales + 1 });
}

export function eliminarPublicacion(id: string) {
  obtenerGun().get(SALA).get(id).put(null);
}

// Barrido único (no un listener persistente como escucharPublicaciones) de
// todas las publicaciones del Muro que pertenecen a `usuario`, usadas desde
// el flujo de autodestrucción de cuenta (services/destruirApp.ts) cuando el
// usuario activa el toggle de "borrar también mis publicaciones públicas".
//
// Gun no tiene una señal de "ya terminé de enumerar", así que se usa una
// ventana de recolección igual que el patrón de leerClavePublica en
// services/gun.ts (timeout en vez de callback de finalización).
export function eliminarPublicacionesDeUsuario(usuario: string, ventanaMs = 3000): Promise<number> {
  return new Promise((resolve) => {
    const ids: string[] = [];
    obtenerGun().get(SALA).map().once((data: any, id: string) => {
      if (data && data.usuario === usuario) ids.push(id);
    });
    setTimeout(() => {
      ids.forEach((id) => eliminarPublicacion(id));
      resolve(ids.length);
    }, ventanaMs);
  });
}
