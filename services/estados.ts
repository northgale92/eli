import AsyncStorage from '@react-native-async-storage/async-storage';
import { cifrarMensaje, descifrarMensaje } from './identidad';
import { nodoEstados, leerClavePublica, putConfirmado } from './gun';
import { cargarConversaciones } from './chat';

// ══════════════════════════════════════════════════════════════════════════════
// ESTADOS/HISTORIAS — paridad con el "Estado" de WhatsApp.
//
// ── ¿A quién le llega un estado? ("contactos") ──────────────────────────────
// ELI no tiene una lista de contactos persistida independiente del historial
// de chat (services/contactos.ts solo hace matching efímero de agenda contra
// Gun; no guarda una lista de "mis contactos"). El único conjunto de personas
// que este proyecto ya conoce de forma persistente es el de conversaciones
// 1:1 existentes (services/chat.ts → cargarConversaciones().contraparte). Por
// eso "contacto" para Estados se define aquí como: cualquier persona con la
// que ya tienes una conversación 1:1. Es una limitación deliberada y
// documentada, no un descuido — igual de razonable que "estados visibles para
// tus chats existentes" en un WhatsApp que aún no tuviera agenda de teléfono.
//
// ── Cifrado y fan-out ────────────────────────────────────────────────────────
// Mismo primitivo NaCl box que 1:1 y grupos (services/chat.ts, services/grupos.ts):
// el contenido se cifra por separado para cada contacto con
// cifrarMensaje(payloadJSON, pubDestinatario, miPriv), y el nodo del estado en
// Gun lleva un campo `para_<contacto>` por cada uno. Cada quien solo puede
// descifrar el suyo.
//
// ⚠️ COSTE DE PAYLOAD (limitación documentada, igual que LIMITE_* en chat.ts):
// un estado con foto/vídeo cifrado se escribe N veces (una por contacto), no
// una sola vez como el Muro. Con audiencias grandes esto es notablemente más
// pesado sobre el relay P2P que un mensaje 1:1. Por eso el límite de vídeo
// aquí es más estricto que en chat 1:1 (ver LIMITE_ESTADO_VIDEO_*).
//
// ── Expiración a 24h ─────────────────────────────────────────────────────────
// ELI no tiene servidor central que borre nada por sí solo. La expiración es:
//   1. Filtrado en cliente: nadie muestra ni descifra un estado cuyo
//      `creadoEn` tenga más de 24h, aunque el nodo siga físicamente presente
//      en el relay (ver esVigente()).
//   2. Limpieza en el dispositivo del autor: limpiarEstadosPropiosExpirados()
//      tombstona (`put(null)`) los propios nodos vencidos la próxima vez que
//      el autor abre la app — mismo patrón que
//      eliminarContenidoCanalesDeUsuario en services/canales.ts. Es un
//      best-effort de higiene de almacenamiento, NO un límite de seguridad:
//      si el autor no vuelve a abrir la app, el nodo puede seguir en el relay
//      indefinidamente, pero (1) ya garantiza que nadie lo ve ni lo descifra
//      pasadas 24h. No existe hoy un proceso de fondo (el runtime de RN no
//      ejecuta código con la app cerrada) — limpiar en background quedaría
//      para una futura tarea con notificaciones push, no cubierto aquí.
//
// ── Moderación CSAM/adultos: NO se aplica — Estados es mensajería privada ────
// Estados se trata como una extensión de la mensajería privada (chat 1:1 y
// grupos), NO como Muro/Canales. Mismo criterio de privacidad E2E que el
// resto del chat: el contenido se cifra por separado para cada contacto y
// solo esos contactos pueden descifrarlo — nunca pasa por un servidor en
// claro. Por eso, exactamente igual que enviarImagen/enviarVideo/
// enviarDocumento en services/chat.ts y enviarImagenGrupo/enviarVideoGrupo en
// services/grupos.ts, este módulo NUNCA llama a moderarContenido() ni a
// moderacionCSAM.ts/moderacionAdultos.ts. No hay fail-closed aquí porque no
// hay ninguna barrera que "cerrar": la moderación CSAM/adultos sigue
// aplicando únicamente a Muro y Canales (contenido público, sin cifrado
// E2E), sin cambios respecto a lo ya documentado en esos módulos.
// ══════════════════════════════════════════════════════════════════════════════

export const DURACION_ESTADO_MS = 24 * 60 * 60 * 1000;

// Más estrictos que sus equivalentes de chat.ts (LIMITE_IMAGEN_LADO_PX=1280,
// LIMITE_VIDEO_BYTES=8MB, LIMITE_VIDEO_DURACION_S=30) porque aquí el mismo
// archivo se escribe una vez POR CONTACTO, no una sola vez.
export const LIMITE_ESTADO_IMAGEN_LADO_PX = 1080;
export const LIMITE_ESTADO_VIDEO_BYTES = 5 * 1024 * 1024;
export const LIMITE_ESTADO_VIDEO_DURACION_S = 15;

export type TipoEstado = 'texto' | 'imagen' | 'video';

export interface Estado {
  id: string;
  autor: string;
  creadoEn: number;
  tipo: TipoEstado;
  texto?: string;          // tipo 'texto': el contenido; imagen/video: texto superpuesto opcional
  colorFondo?: string;     // solo tipo 'texto'
  archivoBase64?: string;  // tipo imagen/video
  archivoMime?: string;
  duracionMs?: number;     // tipo video
  vistoPor?: string[];     // solo relevante/poblado para estados propios
}

interface PayloadEstado {
  tipo: TipoEstado;
  texto?: string;
  colorFondo?: string;
  archivo?: string;
  archivoMime?: string;
  duracionMs?: number;
}

const KEY_PROPIOS = 'eli_estados_propios';
const keyRecibidos = (autor: string) => `eli_estados_recibidos_${autor}`;

export function esVigente(creadoEn: number): boolean {
  return Date.now() - creadoEn < DURACION_ESTADO_MS;
}

// ─── Contactos (ver nota de cabecera) ────────────────────────────────────────

export async function obtenerContactosParaEstados(): Promise<string[]> {
  const conversaciones = await cargarConversaciones();
  return conversaciones.map(c => c.contraparte);
}

// ─── Persistencia local ───────────────────────────────────────────────────────

async function cargarEstadosPropiosRaw(): Promise<Estado[]> {
  const raw = await AsyncStorage.getItem(KEY_PROPIOS);
  return raw ? JSON.parse(raw) : [];
}

async function guardarEstadosPropiosLocal(estados: Estado[]): Promise<void> {
  await AsyncStorage.setItem(KEY_PROPIOS, JSON.stringify(estados));
}

// Estados propios vigentes (para pintar el círculo propio en la fila de arriba).
export async function cargarEstadosPropios(): Promise<Estado[]> {
  const todos = await cargarEstadosPropiosRaw();
  return todos.filter(e => esVigente(e.creadoEn));
}

async function cargarEstadosRecibidosLocal(autor: string): Promise<Estado[]> {
  const raw = await AsyncStorage.getItem(keyRecibidos(autor));
  const todos: Estado[] = raw ? JSON.parse(raw) : [];
  return todos.filter(e => esVigente(e.creadoEn));
}

async function guardarEstadoRecibidoLocal(estado: Estado): Promise<void> {
  const lista = await cargarEstadosRecibidosLocal(estado.autor);
  if (lista.find(e => e.id === estado.id)) return;
  lista.push(estado);
  await AsyncStorage.setItem(keyRecibidos(estado.autor), JSON.stringify(lista));
}

// Estados recibidos de un conjunto de contactos, ya filtrados por vigencia —
// usado para pintar la fila de círculos en la pestaña Chat.
export async function cargarEstadosRecibidos(contactos: string[]): Promise<Estado[]> {
  const listas = await Promise.all(contactos.map(cargarEstadosRecibidosLocal));
  return listas.flat().sort((a, b) => b.creadoEn - a.creadoEn);
}

// Tombstona en Gun (put null) los estados propios ya vencidos y limpia la
// copia local. Best-effort de higiene, no un límite de seguridad — ver nota
// de cabecera sobre expiración. Seguro de llamar en cada apertura de la app.
export async function limpiarEstadosPropiosExpirados(miId: string): Promise<void> {
  const todos = await cargarEstadosPropiosRaw();
  const vigentes = todos.filter(e => esVigente(e.creadoEn));
  const expirados = todos.filter(e => !esVigente(e.creadoEn));
  if (expirados.length === 0) return;
  expirados.forEach(e => {
    try { nodoEstados()?.get(miId).get(e.id).put(null); } catch { /* sin red — se reintentará la próxima vez */ }
  });
  await guardarEstadosPropiosLocal(vigentes);
}

// ─── Publicación ──────────────────────────────────────────────────────────────

// Igual que enviarAdjunto en services/chat.ts: se espera confirmación real
// de la escritura (putConfirmado) en vez de un `.put()` fire-and-forget.
// Un estado con foto/vídeo es, si acaso, un payload TODAVÍA más pesado que
// un adjunto de chat 1:1 (lleva un sobre cifrado por cada contacto en el
// mismo nodo — ver nota de cabecera del archivo), así que corre el mismo
// riesgo de perderse en silencio si el wire se cae a mitad de envío.
async function publicarPayload(
  payload: PayloadEstado,
  camposEstado: Partial<Estado>,
  miId: string,
  miClavePrivada: string,
  contactos: string[],
): Promise<{ ok: boolean; error?: string }> {
  const id = `${miId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const creadoEn = Date.now();
  const contenido = JSON.stringify(payload);

  const campos: Record<string, unknown> = { id, autor: miId, creadoEn, tipo: payload.tipo };
  for (const contacto of contactos) {
    const pub = await leerClavePublica(contacto);
    if (!pub) continue; // ese contacto aún no es localizable en la red; se pierde el estado para él
    const { cifrado, nonce } = cifrarMensaje(contenido, pub, miClavePrivada);
    campos[`para_${contacto}`] = JSON.stringify({ cifrado, nonce });
  }

  const confirmacion = await putConfirmado(nodoEstados().get(miId).get(id), campos);
  if (!confirmacion.ok) {
    return { ok: false, error: confirmacion.error };
  }

  const estado: Estado = { id, autor: miId, creadoEn, tipo: payload.tipo, vistoPor: [], ...camposEstado };
  const propios = await cargarEstadosPropiosRaw();
  propios.push(estado);
  await guardarEstadosPropiosLocal(propios);

  return { ok: true };
}

export async function publicarEstadoTexto(
  texto: string,
  colorFondo: string,
  miId: string,
  miClavePrivada: string,
  contactos: string[],
): Promise<{ ok: boolean; error?: string }> {
  return publicarPayload(
    { tipo: 'texto', texto, colorFondo },
    { texto, colorFondo },
    miId, miClavePrivada, contactos,
  );
}

// Mismo pipeline que enviarImagen/enviarVideo en services/chat.ts: el archivo
// (ya comprimido/redimensionado por la UI) viaja cifrado, sin pasar por
// moderarContenido() — ver nota de cabecera.
export async function publicarEstadoImagen(
  base64: string,
  mime: string,
  textoSuperpuesto: string | undefined,
  miId: string,
  miClavePrivada: string,
  contactos: string[],
): Promise<{ ok: boolean; error?: string }> {
  return publicarPayload(
    { tipo: 'imagen', archivo: base64, archivoMime: mime, texto: textoSuperpuesto },
    { archivoBase64: base64, archivoMime: mime, texto: textoSuperpuesto },
    miId, miClavePrivada, contactos,
  );
}

export async function publicarEstadoVideo(
  base64: string,
  mime: string,
  duracionMs: number,
  textoSuperpuesto: string | undefined,
  miId: string,
  miClavePrivada: string,
  contactos: string[],
): Promise<{ ok: boolean; error?: string }> {
  return publicarPayload(
    { tipo: 'video', archivo: base64, archivoMime: mime, duracionMs, texto: textoSuperpuesto },
    { archivoBase64: base64, archivoMime: mime, duracionMs, texto: textoSuperpuesto },
    miId, miClavePrivada, contactos,
  );
}

// ─── Recepción ────────────────────────────────────────────────────────────────

function interpretarPayloadEstado(payloadRaw: string): Partial<Estado> | null {
  try {
    const payload: PayloadEstado = JSON.parse(payloadRaw);
    if (payload.tipo === 'imagen') {
      return { tipo: 'imagen', archivoBase64: payload.archivo, archivoMime: payload.archivoMime, texto: payload.texto };
    }
    if (payload.tipo === 'video') {
      return {
        tipo: 'video', archivoBase64: payload.archivo, archivoMime: payload.archivoMime,
        duracionMs: payload.duracionMs, texto: payload.texto,
      };
    }
    return { tipo: 'texto', texto: payload.texto, colorFondo: payload.colorFondo };
  } catch {
    return null;
  }
}

// Se suscribe a los estados de UN contacto. Ver suscribirEstadosDeContactos
// para el caso habitual (todos los contactos a la vez).
export function suscribirEstadosDeContacto(
  autorId: string,
  miId: string,
  miClavePrivada: string,
  onEstado: (estado: Estado) => void,
): () => void {
  const nodo = nodoEstados().get(autorId);

  nodo.map().on(async (data: any) => {
    if (!data?.id || !data.creadoEn || data.autor === miId) return;
    if (!esVigente(data.creadoEn)) return; // filtrado en cliente — ver nota de cabecera

    const yaConocidos = await cargarEstadosRecibidosLocal(autorId);
    if (yaConocidos.find(e => e.id === data.id)) return;

    const sobre = data[`para_${miId}`];
    if (!sobre) return;

    const pubAutor = await leerClavePublica(autorId);
    if (!pubAutor) return;

    let envelope: { cifrado: string; nonce: string };
    try {
      envelope = JSON.parse(sobre);
    } catch {
      return;
    }

    const payloadRaw = descifrarMensaje(envelope.cifrado, envelope.nonce, pubAutor, miClavePrivada);
    if (!payloadRaw) return;

    const interpretado = interpretarPayloadEstado(payloadRaw);
    if (!interpretado) return;

    const estado: Estado = { id: data.id, autor: autorId, creadoEn: data.creadoEn, tipo: interpretado.tipo!, ...interpretado };
    await guardarEstadoRecibidoLocal(estado);
    onEstado(estado);
  });

  return () => nodo.map().off();
}

export function suscribirEstadosDeContactos(
  contactos: string[],
  miId: string,
  miClavePrivada: string,
  onEstado: (estado: Estado) => void,
): () => void {
  const cancelaciones = contactos.map(c => suscribirEstadosDeContacto(c, miId, miClavePrivada, onEstado));
  return () => cancelaciones.forEach(cancelar => cancelar());
}

// ─── "Visto por" (solo el autor lo consulta) ─────────────────────────────────
//
// Mismo patrón que reaccionarMensaje/suscribirReacciones en services/chat.ts:
// cada espectador escribe su propio campo `visto_<usuario>` en el nodo del
// estado — campos planos con clave dinámica se fusionan en Gun sin pisarse.

export function marcarEstadoVisto(autorId: string, estadoId: string, miId: string): void {
  if (autorId === miId) return; // no hace falta marcar como visto tu propio estado
  nodoEstados().get(autorId).get(estadoId).put({ [`visto_${miId}`]: Date.now() });
}

// ─── "Visto localmente" (para el anillo de color en la fila de la pestaña Chat) ─
//
// Independiente de marcarEstadoVisto/suscribirVistoPor (que es el ack que ve
// el AUTOR). Esto es puramente local: qué estados ya abrí yo, para pintar el
// anillo de "hay algo nuevo" — no se publica en Gun ni lo ve nadie más.

const KEY_VISTOS_LOCAL = 'eli_estados_vistos_local';

export async function marcarVistoLocalmente(estadoId: string): Promise<void> {
  const raw = await AsyncStorage.getItem(KEY_VISTOS_LOCAL);
  const vistos: string[] = raw ? JSON.parse(raw) : [];
  if (!vistos.includes(estadoId)) {
    vistos.push(estadoId);
    await AsyncStorage.setItem(KEY_VISTOS_LOCAL, JSON.stringify(vistos));
  }
}

export async function cargarVistosLocalmente(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(KEY_VISTOS_LOCAL);
  const vistos: string[] = raw ? JSON.parse(raw) : [];
  return new Set(vistos);
}

export function suscribirVistoPor(
  autorId: string,
  estadoId: string,
  onVisto: (usuario: string) => void,
): () => void {
  const nodo = nodoEstados().get(autorId).get(estadoId);
  nodo.on((data: any) => {
    if (!data) return;
    Object.keys(data).forEach(key => {
      if (key.startsWith('visto_') && data[key]) onVisto(key.slice('visto_'.length));
    });
  });
  return () => nodo.off();
}
