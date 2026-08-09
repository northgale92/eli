import Gun from 'gun';

console.warn('ELI-DEBUG: gun.ts cargado');

const PEERS: string[] = ['http://188.241.54.45:8765/gun'];

let instancia: any = null;

// radisk/axe deshabilitados: son el motor de persistencia en disco y
// descubrimiento multicast de Gun, pensados para navegador/Node. En React
// Native no hay adaptador de almacenamiento configurado (no hay localStorage
// ni IndexedDB), y sin estas flags Gun se queda colgado de forma síncrona
// intentando inicializar ese almacenamiento en cuanto se crea la instancia
// (bloqueó el arranque justo tras el warning "No localStorage exists to
// persist data to!"). La identidad/caché local ya se gestiona aparte vía
// AsyncStorage — Gun aquí solo actúa como relay en tiempo real vía peers.
const GUN_OPTS = { localStorage: false, radisk: false, axe: false };

export function obtenerGun(): any {
  if (instancia) return instancia;
  try {
    console.warn('ELI-DEBUG: antes de Gun()');
    instancia = Gun({ peers: PEERS, ...GUN_OPTS });
    console.warn('ELI-DEBUG: Gun() completado');
  } catch {
    // Fallo al conectar peers — modo local sin red
    try {
      instancia = Gun(GUN_OPTS);
    } catch {
      instancia = Gun();
    }
  }
  return instancia;
}

export function nodoChat(): any {
  try {
    return obtenerGun().get('eli_chat_v1');
  } catch {
    return null;
  }
}

export function nodoUsuarios(): any {
  try {
    return obtenerGun().get('eli_usuarios_v1');
  } catch {
    return null;
  }
}

export function publicarClavePublica(usuarioId: string, clavePublica: string): void {
  try {
    const nodo = nodoUsuarios();
    if (!nodo) return;
    nodo.get(usuarioId).put({ clavePublica, ts: Date.now() });
  } catch {
    // Sin red — ignorar silenciosamente
  }
}

export function leerClavePublica(usuarioId: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const nodo = nodoUsuarios();
      if (!nodo) {
        resolve(null);
        return;
      }
      const timeout = setTimeout(() => resolve(null), 8000);
      nodo.get(usuarioId).once((data: any) => {
        clearTimeout(timeout);
        resolve(data?.clavePublica ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

// ─── Perfil público (nombre visible + foto) ──────────────────────────────────
//
// Mismo nodo que publicarClavePublica/leerClavePublica (eli_usuarios_v1/<id>):
// Gun fusiona campos planos de puts distintos sobre el mismo nodo sin pisarse,
// así que añadir nombreVisible/fotoPerfil aquí no interfiere con la clave
// pública ya publicada por separado (ver services/chat.ts, que llama a
// publicarClavePublica en cada envío).

export interface PerfilPublico {
  clavePublica: string | null;
  nombreVisible?: string;
  fotoPerfil?: string; // base64, ya comprimida en origen (ver services/identidad.ts)
}

export function publicarPerfil(
  usuarioId: string,
  datos: { nombreVisible: string; fotoPerfil: string | null },
): void {
  try {
    const nodo = nodoUsuarios();
    if (!nodo) return;
    // `fotoPerfil: null` borra la foto en Gun (quitarla es una acción explícita
    // del usuario, no un campo ausente que deba conservarse).
    nodo.get(usuarioId).put({ nombreVisible: datos.nombreVisible, fotoPerfil: datos.fotoPerfil, ts: Date.now() });
  } catch {
    // Sin red — ignorar silenciosamente, igual que publicarClavePublica.
  }
}

export function leerPerfil(usuarioId: string): Promise<PerfilPublico | null> {
  return new Promise((resolve) => {
    try {
      const nodo = nodoUsuarios();
      if (!nodo) {
        resolve(null);
        return;
      }
      const timeout = setTimeout(() => resolve(null), 8000);
      nodo.get(usuarioId).once((data: any) => {
        clearTimeout(timeout);
        if (!data) { resolve(null); return; }
        resolve({
          clavePublica: data.clavePublica ?? null,
          nombreVisible: data.nombreVisible || undefined,
          fotoPerfil: data.fotoPerfil || undefined,
        });
      });
    } catch {
      resolve(null);
    }
  });
}

// El canal entre A y B es siempre el mismo independientemente de quién inicia
export function idCanal(usuarioA: string, usuarioB: string): string {
  return [usuarioA, usuarioB].sort().join('__');
}

export function nodoConversacion(canal: string): any {
  try {
    const chat = nodoChat();
    if (!chat) return null;
    return chat.get(canal);
  } catch {
    return null;
  }
}

export function nodoGrupos(): any {
  try {
    return obtenerGun().get('eli_grupos_v1');
  } catch {
    return null;
  }
}

export function nodoGrupoMensajes(grupoId: string): any {
  try {
    return obtenerGun().get('eli_grupo_chat_v1').get(grupoId);
  } catch {
    return null;
  }
}

export function nodoLlamadas(): any {
  try {
    return obtenerGun().get('eli-llamadas-v1');
  } catch {
    return null;
  }
}

// Nodo raíz de Estados/Historias: eli_estados_v1/<autorId>/<estadoId>.
// Ver services/estados.ts para el modelo completo (fan-out, expiración, moderación).
export function nodoEstados(): any {
  try {
    return obtenerGun().get('eli_estados_v1');
  } catch {
    return null;
  }
}
