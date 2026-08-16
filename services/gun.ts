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

// Usa `.on()` en vez de `.once()`, y solo resuelve cuando ve una clave
// pública real (no en el primer disparo, sea cual sea su contenido). Motivo:
// `.once()` puede resolver con el grafo local de Gun todavía vacío para ese
// nodo si la conexión al relay aún no está lista — típicamente justo tras
// abrir la app — devolviendo null aunque el peer sí tenga clave publicada.
// Como esta función se usa para cifrar el envío a CADA destinatario
// (enviarContenidoGrupo, publicarPayload/Estados, enviarAdjunto en chat.ts),
// un null prematuro no es un error visible: el remitente simplemente omite
// el `para_<destinatario>` de ese envío y el contenido nunca llega para él,
// sin ningún aviso — sospecha fundada de por qué un Estado con foto (payload
// más pesado, más tiempo hasta que el emisor complete el fan-out) puede
// perderse para un contacto mientras un Estado de texto, publicado con la
// conexión ya caliente, sí llega. Con `.on()`, si la clave real llega más
// tarde (peer recién conectado), el callback se dispara de nuevo con el
// dato correcto en vez de quedarse resuelto en null para siempre.
export function leerClavePublica(usuarioId: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const nodo = nodoUsuarios();
      if (!nodo) {
        resolve(null);
        return;
      }
      let resuelto = false;
      const ref = nodo.get(usuarioId);
      const timeout = setTimeout(() => {
        if (resuelto) return;
        resuelto = true;
        ref.off();
        resolve(null);
      }, 8000);
      ref.on((data: any) => {
        if (resuelto || !data?.clavePublica) return;
        resuelto = true;
        clearTimeout(timeout);
        ref.off();
        resolve(data.clavePublica);
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

// Igual que leerPerfil, pero con suscripción en vivo (`.on()`) en vez de una
// única lectura (`.once()`). Motivo: justo al arrancar la app, `.once()`
// puede resolver antes de que la conexión al relay esté lista — con el grafo
// local de Gun todavía vacío para ese nodo — y entonces devuelve null/datos
// desactualizados para siempre, porque leerPerfil no vuelve a consultarse
// una vez resuelta esa promesa (ver el "caché" de perfilesContactos en
// app/(tabs)/chat.tsx). Con `.on()`, en cambio, si la respuesta real llega
// más tarde (cuando el peer se conecta), el callback se vuelve a disparar
// con el dato correcto y la UI se autocorrige sin necesitar reiniciar la app.
export function suscribirPerfil(
  usuarioId: string,
  onPerfil: (perfil: PerfilPublico) => void,
): () => void {
  const nodo = nodoUsuarios();
  if (!nodo) return () => {};
  const ref = nodo.get(usuarioId);
  ref.on((data: any) => {
    if (!data) return;
    onPerfil({
      clavePublica: data.clavePublica ?? null,
      nombreVisible: data.nombreVisible || undefined,
      fotoPerfil: data.fotoPerfil || undefined,
    });
  });
  return () => ref.off();
}

// ─── Escritura confirmada (ack + reintento) ──────────────────────────────────
//
// gun.put() es "fire-and-forget" por defecto: no hay ninguna garantía de que
// el dato llegara siquiera a intentarse enviar al peer, y mucho menos de que
// el peer lo aceptara. En node_modules/gun/gun.js, el camino de salida traga
// los errores en silencio en dos puntos: json(msg, res) -> res(err, raw){
// if(err){ return } // TODO: Handle!! } y send(raw, peer){ try{
// wire.send(raw) }catch(e){ peer.queue.push(raw) } } — si falla la
// serialización o el wire.send() (p. ej. el WebSocket se cae a mitad de un
// payload grande), el mensaje se pierde sin que ninguna función que llamó a
// `.put()` se entere. Esto es especialmente peligroso para payloads pesados
// (adjuntos de chat, Estados con foto/vídeo) donde una desconexión a mitad
// de envío es mucho más probable que con un mensaje de texto pequeño.
//
// putConfirmado usa el callback de ack nativo de Gun (`ref.put(datos, cb)`)
// para saber si la escritura se confirmó, con un timeout propio (Gun no
// garantiza que el ack llegue si el wire se cae) y varios reintentos con
// backoff antes de darse por vencido.
export interface OpcionesEscrituraConfirmada {
  intentos?: number;   // total de intentos, incluido el primero (por defecto 3)
  timeoutMs?: number;  // por intento, esperando el ack (por defecto 6000)
  backoffMs?: number;  // espera antes de reintentar, ×intento (por defecto 500)
}

export function putConfirmado(
  ref: any,
  datos: unknown,
  opciones: OpcionesEscrituraConfirmada = {},
): Promise<{ ok: boolean; error?: string }> {
  const intentosTotal = opciones.intentos ?? 3;
  const timeoutMs = opciones.timeoutMs ?? 6000;
  const backoffMs = opciones.backoffMs ?? 500;

  return new Promise((resolve) => {
    let intento = 0;

    function intentar() {
      intento++;
      let resuelto = false;
      let temporizador: ReturnType<typeof setTimeout>;

      const terminarIntento = (resultado: { ok: boolean; error?: string }) => {
        if (resuelto) return;
        resuelto = true;
        clearTimeout(temporizador);
        if (resultado.ok || intento >= intentosTotal) {
          resolve(resultado);
          return;
        }
        setTimeout(intentar, backoffMs * intento);
      };

      temporizador = setTimeout(() => {
        terminarIntento({ ok: false, error: 'timeout esperando confirmación de Gun' });
      }, timeoutMs);

      try {
        ref.put(datos, (ack: any) => {
          if (ack && ack.err) {
            terminarIntento({ ok: false, error: String(ack.err) });
          } else {
            terminarIntento({ ok: true });
          }
        });
      } catch (err) {
        terminarIntento({ ok: false, error: err instanceof Error ? err.message : 'excepción al escribir en Gun' });
      }
    }

    intentar();
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
