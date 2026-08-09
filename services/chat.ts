import AsyncStorage from '@react-native-async-storage/async-storage';
import { cifrarMensaje, descifrarMensaje } from './identidad';
import { nodoConversacion, nodoChat, idCanal, leerClavePublica, publicarClavePublica } from './gun';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type EstadoMensaje = 'enviado' | 'entregado' | 'leido';
export type TipoMensaje = 'texto' | 'audio' | 'ubicacion' | 'imagen' | 'video' | 'documento';

// Límites de tamaño para adjuntos: no hay CDN/servidor de medios, todo viaja
// como base64 dentro de un único campo de un nodo Gun a través del relay
// P2P — payloads grandes son lentos/poco fiables en ese transporte.
export const LIMITE_IMAGEN_LADO_PX = 1280;
export const LIMITE_VIDEO_DURACION_S = 30;
export const LIMITE_VIDEO_BYTES = 8 * 1024 * 1024; // 8MB
export const LIMITE_DOCUMENTO_BYTES = 5 * 1024 * 1024; // 5MB

export interface RespuestaCitada {
  id: string;
  texto: string;
  de: string;
}

// Vista previa de un enlace detectado en el texto. Se genera en el
// dispositivo del EMISOR (fetch de metadatos Open Graph) y viaja ya resuelta
// dentro del payload cifrado — así el receptor nunca hace una petición de
// red propia solo por abrir la conversación, lo que filtraría a un servidor
// externo qué enlaces lee cada usuario. Ver obtenerPreviewEnlace().
export interface EnlacePreview {
  url: string;
  titulo?: string;
  descripcion?: string;
  imagen?: string;
}

export interface Mensaje {
  id: string;
  texto: string;
  de: string;       // usuarioId del remitente
  para: string;     // usuarioId del destinatario
  hora: number;     // timestamp ms
  estado: EstadoMensaje;
  mio: boolean;
  tipo?: TipoMensaje;
  respondeA?: RespuestaCitada;
  editado?: boolean;
  reenviado?: boolean;
  // tipo === 'audio'
  audioBase64?: string;
  duracionMs?: number;
  // tipo === 'ubicacion'
  lat?: number;
  lon?: number;
  // tipo === 'imagen' | 'video' | 'documento'
  archivoBase64?: string;
  archivoMime?: string;
  archivoNombre?: string;   // documento
  archivoTamano?: number;   // bytes, tras compresión si aplica
  miniaturaBase64?: string; // video: fotograma de portada
  ancho?: number;           // imagen/video
  alto?: number;            // imagen/video
  // tipo === 'texto', si se detectó una URL
  preview?: EnlacePreview;
  // usuarioId -> emoji
  reacciones?: Record<string, string>;
}

export interface Conversacion {
  id: string;           // idCanal
  contraparte: string;  // usuarioId del otro
  ultimoMensaje: string;
  ultimaHora: number;
  noLeidos: number;
  fijado?: boolean;
}

// Forma del contenido una vez descifrado (JSON serializado dentro de cifrado/nonce).
// El campo `texto` plano (formato heredado, previo a este payload) también se
// acepta al leer, por compatibilidad con mensajes ya enviados.
interface PayloadMensaje {
  tipo?: TipoMensaje;
  texto?: string;
  respondeA?: RespuestaCitada;
  reenviado?: boolean;
  audio?: string;
  duracionMs?: number;
  lat?: number;
  lon?: number;
  // imagen | video | documento
  archivo?: string;
  archivoMime?: string;
  archivoNombre?: string;
  archivoTamano?: number;
  miniatura?: string;
  ancho?: number;
  alto?: number;
  // texto, si se detectó una URL
  preview?: EnlacePreview;
}

// ─── Claves AsyncStorage ──────────────────────────────────────────────────────

// Clave legada (formato antiguo, pre-2026-08-08): todo el historial de una
// conversación como un único blob JSON. Se mantiene solo para detectar y
// migrar conversaciones existentes — ver cargarMensajesLocal.
const keyMensajesBlobLegado = (canal: string) => `eli_msgs_${canal}`;
// Índice ligero: solo la lista ordenada de ids, nunca crece por el tamaño de
// los adjuntos — siempre debe caber cómodamente en un CursorWindow.
const keyIndiceMensajes = (canal: string) => `eli_msgs_index_${canal}`;
const keyMensaje = (canal: string, id: string) => `eli_msg_${canal}_${id}`;
const KEY_CONVS = 'eli_conversaciones';

// ─── Persistencia local ────────────────────────────────────────────────────────
//
// Cada mensaje vive en su propia clave de AsyncStorage (en vez de un único
// blob JSON con toda la conversación). Motivo: en Android, AsyncStorage lee
// vía SQLite CursorWindow, con un límite de tamaño por fila (~2MB en la
// práctica). Con adjuntos de imagen/vídeo en base64 embebidos en cada
// mensaje, un blob-por-conversación acaba superando ese límite conforme
// crece el historial — y entonces CUALQUIER lectura futura de esa
// conversación falla con SQLiteBlobTooBigException, lo que rompe no solo
// adjuntar un vídeo válido sino enviar cualquier mensaje nuevo (hace falta
// leer el historial para poder añadirle uno). Con una clave por mensaje,
// el tamaño de una conversación entera deja de importar: cada lectura solo
// depende del tamaño de ESE mensaje.

async function leerIndiceMensajes(canal: string): Promise<string[] | null> {
  const raw = await AsyncStorage.getItem(keyIndiceMensajes(canal));
  return raw ? JSON.parse(raw) : null;
}

async function sobrescribirIndiceMensajes(canal: string, ids: string[]): Promise<void> {
  await AsyncStorage.setItem(keyIndiceMensajes(canal), JSON.stringify(ids));
}

// Guarda/actualiza los mensajes dados FUSIONÁNDOLOS con el índice — nunca
// quita un id solo porque no esté en `mensajes`. Deliberado: enviar un
// mensaje, marcarLeidos y recibir un mensaje pueden ejecutarse casi a la
// vez sobre la misma conversación, cada uno con su propia copia de
// `cargarMensajesLocal()` ya desactualizada frente a lo que el otro acaba
// de escribir. Si esta función reemplazara el índice entero según el array
// de CADA llamador, la más lenta de las dos pisaría (borraría) los cambios
// de la otra — p. ej. un mensaje recién enviado desaparecía si marcarLeidos
// terminaba de escribir después, con su copia sin ese mensaje todavía. Con
// fusión aditiva, cada llamada solo puede AÑADIR ids, nunca quitar los que
// otra llamada concurrente ya añadió. El borrado real usa
// eliminarMensajesLocal, explícito.
async function guardarMensajesLocal(canal: string, mensajes: Mensaje[]): Promise<void> {
  if (mensajes.length === 0) return;
  // Escritura (a diferencia de la lectura) no pasa por CursorWindow, así que
  // reescribir cada mensaje aquí es seguro aunque alguno sea grande.
  await AsyncStorage.multiSet(mensajes.map(m => [keyMensaje(canal, m.id), JSON.stringify(m)]));

  const idsPrevios = (await leerIndiceMensajes(canal)) ?? [];
  const idsPreviosSet = new Set(idsPrevios);
  const idsNuevos = mensajes.map(m => m.id).filter(id => !idsPreviosSet.has(id));
  if (idsNuevos.length > 0) {
    await sobrescribirIndiceMensajes(canal, [...idsPrevios, ...idsNuevos]);
  }
}

// Borrado explícito (a diferencia de guardarMensajesLocal, que nunca quita
// ids). Usado solo por borrarMensaje y borrarMensajesLocal.
async function eliminarMensajesLocal(canal: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await AsyncStorage.multiRemove(ids.map(id => keyMensaje(canal, id)));
  const idsPrevios = (await leerIndiceMensajes(canal)) ?? [];
  const idsAEliminarSet = new Set(ids);
  await sobrescribirIndiceMensajes(canal, idsPrevios.filter(id => !idsAEliminarSet.has(id)));
}

// Migra el formato antiguo (blob único) a claves por mensaje la primera vez
// que se carga una conversación tras la actualización. Si el blob antiguo
// ya es demasiado grande para leerse (el propio bug que motivó este
// cambio), ese historial se pierde pero la conversación vuelve a funcionar
// en vez de quedar bloqueada para siempre.
async function migrarMensajesLegado(canal: string): Promise<Mensaje[]> {
  let mensajes: Mensaje[] = [];
  try {
    const raw = await AsyncStorage.getItem(keyMensajesBlobLegado(canal));
    if (raw) mensajes = JSON.parse(raw);
  } catch {
    mensajes = [];
  }
  await AsyncStorage.removeItem(keyMensajesBlobLegado(canal));
  if (mensajes.length > 0) {
    await AsyncStorage.multiSet(mensajes.map(m => [keyMensaje(canal, m.id), JSON.stringify(m)]));
  }
  await sobrescribirIndiceMensajes(canal, mensajes.map(m => m.id));
  return mensajes;
}

// Deduplica por id al leer: una corrupción ya corregida en la recepción de
// mensajes (services/chat.ts suscribirMensajes, antes de la comprobación de
// idx existente) dejó historiales locales con el mismo mensaje repetido
// varias veces. Se limpia aquí, de forma transparente y una sola vez por
// conversación, en vez de requerir borrar y recrear la conversación.
export async function cargarMensajesLocal(canal: string): Promise<Mensaje[]> {
  let ids = await leerIndiceMensajes(canal);
  if (ids === null) ids = (await migrarMensajesLegado(canal)).map(m => m.id);

  // Leídos uno a uno (no con multiGet) a propósito: AsyncStorage coalesce
  // lecturas concurrentes en una sola consulta SQL por lotes, y un único
  // mensaje demasiado grande bastaría para reventar el CursorWindow de todo
  // el lote. Leyendo en serie, un mensaje corrupto/gigante se salta sin
  // afectar al resto de la conversación.
  const mensajes: Mensaje[] = [];
  for (const id of ids) {
    try {
      const raw = await AsyncStorage.getItem(keyMensaje(canal, id));
      if (raw) mensajes.push(JSON.parse(raw));
    } catch {
      // Mensaje individual ilegible (p. ej. adjunto que excede el límite de
      // lectura de AsyncStorage) — se omite, no bloquea el resto.
    }
  }

  const vistos = new Set<string>();
  const sinDuplicados = mensajes.filter((m) => {
    if (vistos.has(m.id)) return false;
    vistos.add(m.id);
    return true;
  });
  if (sinDuplicados.length !== mensajes.length) {
    // Reemplazo explícito del índice (no el upsert aditivo de
    // guardarMensajesLocal): aquí sí queremos quitar los ids duplicados.
    await sobrescribirIndiceMensajes(canal, sinDuplicados.map(m => m.id));
  }
  return sinDuplicados;
}

// Combina con lo ya guardado en vez de reemplazarlo entero, para no perder
// campos (p. ej. `fijado`) que esta llamada no conoce.
async function actualizarConversacion(conv: Conversacion): Promise<void> {
  const raw = await AsyncStorage.getItem(KEY_CONVS);
  const lista: Conversacion[] = raw ? JSON.parse(raw) : [];
  const idx = lista.findIndex(c => c.id === conv.id);
  if (idx >= 0) lista[idx] = { ...lista[idx], ...conv };
  else lista.unshift(conv);
  await AsyncStorage.setItem(KEY_CONVS, JSON.stringify(lista));
}

export async function cargarConversaciones(): Promise<Conversacion[]> {
  const raw = await AsyncStorage.getItem(KEY_CONVS);
  if (!raw) return [];
  const lista: Conversacion[] = JSON.parse(raw);
  return lista.sort((a, b) => {
    if (!!a.fijado !== !!b.fijado) return a.fijado ? -1 : 1;
    return b.ultimaHora - a.ultimaHora;
  });
}

// Alterna el estado de fijado de una conversación en la lista de chats.
export async function alternarFijado(canal: string): Promise<void> {
  const raw = await AsyncStorage.getItem(KEY_CONVS);
  if (!raw) return;
  const lista: Conversacion[] = JSON.parse(raw);
  const idx = lista.findIndex(c => c.id === canal);
  if (idx >= 0) {
    lista[idx].fijado = !lista[idx].fijado;
    await AsyncStorage.setItem(KEY_CONVS, JSON.stringify(lista));
  }
}

async function borrarMensajesLocal(canal: string): Promise<void> {
  const ids = (await leerIndiceMensajes(canal)) ?? [];
  if (ids.length > 0) await AsyncStorage.multiRemove(ids.map(id => keyMensaje(canal, id)));
  await AsyncStorage.removeItem(keyIndiceMensajes(canal));
  await AsyncStorage.removeItem(keyMensajesBlobLegado(canal));
}

export async function borrarConversacion(
  canal: string,
  contraparteId: string,
  miId: string,
): Promise<void> {
  await borrarMensajesLocal(canal);
  const raw = await AsyncStorage.getItem(KEY_CONVS);
  const lista: Conversacion[] = raw ? JSON.parse(raw) : [];
  await AsyncStorage.setItem(
    KEY_CONVS,
    JSON.stringify(lista.filter(c => c.id !== canal)),
  );
}

// Borra un único mensaje solo de este dispositivo (no notifica ni tombstona
// en Gun — mismo alcance "local" que borrarConversacion). Si el mensaje
// borrado era el último de la conversación, actualiza el resumen mostrado
// en la lista de chats con el nuevo último mensaje.
export async function borrarMensaje(canal: string, mensajeId: string): Promise<void> {
  const mensajes = await cargarMensajesLocal(canal);
  const filtrados = mensajes.filter(m => m.id !== mensajeId);
  await eliminarMensajesLocal(canal, [mensajeId]);

  const raw = await AsyncStorage.getItem(KEY_CONVS);
  if (!raw) return;
  const lista: Conversacion[] = JSON.parse(raw);
  const idx = lista.findIndex(c => c.id === canal);
  if (idx >= 0) {
    const ultimo = filtrados[filtrados.length - 1];
    lista[idx].ultimoMensaje = ultimo?.texto ?? '';
    if (ultimo) lista[idx].ultimaHora = ultimo.hora;
    await AsyncStorage.setItem(KEY_CONVS, JSON.stringify(lista));
  }
}

// ─── Vista previa de enlaces ────────────────────────────────────────────────────
//
// Solo el EMISOR hace la petición de red (si el texto contiene una URL); el
// resultado ya resuelto viaja dentro del payload cifrado, como un campo más.
// El receptor nunca hace un fetch propio al leer el mensaje — si lo hiciera,
// cada contacto filtraría a servidores externos qué enlaces lee, algo que no
// encaja con un chat E2E P2P sin servidor central. Con timeout corto: si la
// petición falla o tarda, se envía el mensaje sin preview, nunca se bloquea.

const REGEX_URL = /https?:\/\/[^\s]+/i;
const TIMEOUT_PREVIEW_MS = 2500;

function extraerPrimeraURL(texto: string): string | null {
  const match = texto.match(REGEX_URL);
  return match ? match[0] : null;
}

function extraerMetaTag(html: string, propiedad: string): string | undefined {
  // El orden de atributos de <meta property="og:x" content="..."> no está
  // garantizado, así que se prueban ambos órdenes.
  const patrones = [
    new RegExp(`<meta[^>]+property=["']${propiedad}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${propiedad}["']`, 'i'),
  ];
  for (const patron of patrones) {
    const m = html.match(patron);
    if (m) return m[1];
  }
  return undefined;
}

async function obtenerPreviewEnlace(url: string): Promise<EnlacePreview | null> {
  try {
    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), TIMEOUT_PREVIEW_MS);
    const respuesta = await fetch(url, { signal: controlador.signal });
    clearTimeout(timeout);
    if (!respuesta.ok) return null;
    const html = await respuesta.text();
    const titulo = extraerMetaTag(html, 'og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
    const descripcion = extraerMetaTag(html, 'og:description');
    const imagen = extraerMetaTag(html, 'og:image');
    if (!titulo && !descripcion && !imagen) return null;
    return { url, titulo: titulo?.trim(), descripcion: descripcion?.trim(), imagen };
  } catch {
    return null; // sin red, timeout, HTML inesperado, CORS… nunca rompe el envío
  }
}

// ─── Envío ────────────────────────────────────────────────────────────────────

export async function enviarMensaje(
  texto: string,
  miId: string,
  miClavePublica: string,
  miClavePrivada: string,
  destinatarioId: string,
  respondeA?: RespuestaCitada,
  reenviado?: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const pubDest = await leerClavePublica(destinatarioId);
  if (!pubDest) {
    return { ok: false, error: 'No se encontró la clave pública del destinatario.' };
  }

  const url = extraerPrimeraURL(texto);
  const preview = url ? await obtenerPreviewEnlace(url) ?? undefined : undefined;

  const payload: PayloadMensaje = { tipo: 'texto', texto, respondeA, reenviado, preview };
  const { cifrado, nonce } = cifrarMensaje(JSON.stringify(payload), pubDest, miClavePrivada);
  const id = `${miId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const hora = Date.now();
  const canal = idCanal(miId, destinatarioId);

  // Publicar en Gun (el contenido viaja cifrado, nunca en claro)
  const nodo = nodoConversacion(canal);
  nodo.get(id).put({
    id,
    cifrado,
    nonce,
    de: miId,
    para: destinatarioId,
    hora,
    estado: 'enviado' as EstadoMensaje,
  });

  // Guardar localmente ya descifrado (el remitente sí sabe el texto)
  const mensaje: Mensaje = {
    id, texto, de: miId, para: destinatarioId, hora,
    estado: 'enviado', mio: true, tipo: 'texto', respondeA, reenviado, preview,
  };
  const mensajes = await cargarMensajesLocal(canal);
  mensajes.push(mensaje);
  await guardarMensajesLocal(canal, mensajes);

  await actualizarConversacion({
    id: canal,
    contraparte: destinatarioId,
    ultimoMensaje: texto,
    ultimaHora: hora,
    noLeidos: 0,
  });

  // Aseguramos que nuestra clave pública esté disponible para la contraparte
  publicarClavePublica(miId, miClavePublica);

  return { ok: true };
}

// Reemplaza el texto de un mensaje ya enviado (propio) por uno nuevo,
// re-cifrando y actualizando el mismo nodo de Gun (mismo id, nuevo
// cifrado/nonce + marca `editado`). El destinatario lo recibe a través de
// la misma suscripción de mensajes, que distingue "nuevo" de "edición" por
// si el id ya existía localmente.
export async function editarMensaje(
  canal: string,
  mensajeId: string,
  miClavePrivada: string,
  destinatarioId: string,
  nuevoTexto: string,
): Promise<{ ok: boolean; error?: string }> {
  const mensajes = await cargarMensajesLocal(canal);
  const idx = mensajes.findIndex(m => m.id === mensajeId);
  if (idx < 0) return { ok: false, error: 'Mensaje no encontrado.' };

  const pubDest = await leerClavePublica(destinatarioId);
  if (!pubDest) return { ok: false, error: 'No se encontró la clave pública del destinatario.' };

  const payload: PayloadMensaje = {
    tipo: 'texto', texto: nuevoTexto, respondeA: mensajes[idx].respondeA,
  };
  const { cifrado, nonce } = cifrarMensaje(JSON.stringify(payload), pubDest, miClavePrivada);

  nodoConversacion(canal).get(mensajeId).put({ cifrado, nonce, editado: true });

  mensajes[idx] = { ...mensajes[idx], texto: nuevoTexto, editado: true };
  await guardarMensajesLocal(canal, mensajes);

  const raw = await AsyncStorage.getItem(KEY_CONVS);
  if (raw) {
    const lista: Conversacion[] = JSON.parse(raw);
    const cidx = lista.findIndex(c => c.id === canal);
    // Solo tocamos el preview de la lista si el mensaje editado era el último
    if (cidx >= 0 && lista[cidx].ultimaHora === mensajes[idx].hora) {
      lista[cidx].ultimoMensaje = nuevoTexto;
      await AsyncStorage.setItem(KEY_CONVS, JSON.stringify(lista));
    }
  }

  return { ok: true };
}

// Envía una nota de voz: el audio (ya grabado) viaja en base64 dentro del
// mismo sobre cifrado que un mensaje de texto normal — no hay CDN ni blob
// storage separado en esta app, todo pasa por el mismo canal Gun cifrado.
export async function enviarMensajeAudio(
  audioBase64: string,
  duracionMs: number,
  miId: string,
  miClavePublica: string,
  miClavePrivada: string,
  destinatarioId: string,
  reenviado?: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const pubDest = await leerClavePublica(destinatarioId);
  if (!pubDest) return { ok: false, error: 'No se encontró la clave pública del destinatario.' };

  const payload: PayloadMensaje = { tipo: 'audio', audio: audioBase64, duracionMs, reenviado };
  const { cifrado, nonce } = cifrarMensaje(JSON.stringify(payload), pubDest, miClavePrivada);
  const id = `${miId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const hora = Date.now();
  const canal = idCanal(miId, destinatarioId);

  nodoConversacion(canal).get(id).put({
    id, cifrado, nonce, de: miId, para: destinatarioId, hora, estado: 'enviado' as EstadoMensaje,
  });

  const mensaje: Mensaje = {
    id, texto: '🎤 Mensaje de voz', de: miId, para: destinatarioId, hora,
    estado: 'enviado', mio: true, tipo: 'audio', audioBase64, duracionMs, reenviado,
  };
  const mensajes = await cargarMensajesLocal(canal);
  mensajes.push(mensaje);
  await guardarMensajesLocal(canal, mensajes);

  await actualizarConversacion({
    id: canal, contraparte: destinatarioId, ultimoMensaje: '🎤 Mensaje de voz', ultimaHora: hora, noLeidos: 0,
  });
  publicarClavePublica(miId, miClavePublica);

  return { ok: true };
}

// Comparte una ubicación puntual (no en vivo/tracking, un único punto).
export async function enviarUbicacion(
  lat: number,
  lon: number,
  miId: string,
  miClavePublica: string,
  miClavePrivada: string,
  destinatarioId: string,
  reenviado?: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const pubDest = await leerClavePublica(destinatarioId);
  if (!pubDest) return { ok: false, error: 'No se encontró la clave pública del destinatario.' };

  const payload: PayloadMensaje = { tipo: 'ubicacion', lat, lon, reenviado };
  const { cifrado, nonce } = cifrarMensaje(JSON.stringify(payload), pubDest, miClavePrivada);
  const id = `${miId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const hora = Date.now();
  const canal = idCanal(miId, destinatarioId);

  nodoConversacion(canal).get(id).put({
    id, cifrado, nonce, de: miId, para: destinatarioId, hora, estado: 'enviado' as EstadoMensaje,
  });

  const mensaje: Mensaje = {
    id, texto: '📍 Ubicación compartida', de: miId, para: destinatarioId, hora,
    estado: 'enviado', mio: true, tipo: 'ubicacion', lat, lon, reenviado,
  };
  const mensajes = await cargarMensajesLocal(canal);
  mensajes.push(mensaje);
  await guardarMensajesLocal(canal, mensajes);

  await actualizarConversacion({
    id: canal, contraparte: destinatarioId, ultimoMensaje: '📍 Ubicación compartida', ultimaHora: hora, noLeidos: 0,
  });
  publicarClavePublica(miId, miClavePublica);

  return { ok: true };
}

// ─── Adjuntos (imagen / vídeo / documento) ─────────────────────────────────────
//
// Mismo pipeline que enviarMensaje/enviarMensajeAudio/enviarUbicacion arriba:
// el archivo (ya comprimido/redimensionado por la UI antes de llamar aquí)
// viaja en base64 dentro del mismo sobre cifrado NaCl box, por el mismo canal
// Gun P2P — no hay CDN ni servidor de medios propio. Deliberadamente NO pasa
// por moderacionCSAM.ts ni moderacionAdultos.ts: esos módulos solo se aplican
// al contenido público de Muro/Canales (ver app/nueva-publicacion.tsx); el
// chat 1:1 es E2E y nadie más que los dos participantes puede ver el archivo,
// así que no hay nada que un escáner del lado del servidor podría inspeccionar.
async function enviarAdjunto(
  payload: PayloadMensaje,
  previewTexto: string,
  camposMensaje: Partial<Mensaje>,
  miId: string,
  miClavePublica: string,
  miClavePrivada: string,
  destinatarioId: string,
): Promise<{ ok: boolean; error?: string }> {
  const pubDest = await leerClavePublica(destinatarioId);
  if (!pubDest) return { ok: false, error: 'No se encontró la clave pública del destinatario.' };

  const { cifrado, nonce } = cifrarMensaje(JSON.stringify(payload), pubDest, miClavePrivada);
  const id = `${miId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const hora = Date.now();
  const canal = idCanal(miId, destinatarioId);

  nodoConversacion(canal).get(id).put({
    id, cifrado, nonce, de: miId, para: destinatarioId, hora, estado: 'enviado' as EstadoMensaje,
  });

  const mensaje: Mensaje = {
    id, texto: previewTexto, de: miId, para: destinatarioId, hora,
    estado: 'enviado', mio: true, ...camposMensaje,
  };
  const mensajes = await cargarMensajesLocal(canal);
  mensajes.push(mensaje);
  await guardarMensajesLocal(canal, mensajes);

  await actualizarConversacion({
    id: canal, contraparte: destinatarioId, ultimoMensaje: previewTexto, ultimaHora: hora, noLeidos: 0,
  });
  publicarClavePublica(miId, miClavePublica);

  return { ok: true };
}

export async function enviarImagen(
  base64: string,
  mime: string,
  ancho: number,
  alto: number,
  tamanoBytes: number,
  miId: string,
  miClavePublica: string,
  miClavePrivada: string,
  destinatarioId: string,
  reenviado?: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const payload: PayloadMensaje = {
    tipo: 'imagen', archivo: base64, archivoMime: mime, ancho, alto, archivoTamano: tamanoBytes, reenviado,
  };
  return enviarAdjunto(
    payload, '📷 Foto',
    { tipo: 'imagen', archivoBase64: base64, archivoMime: mime, ancho, alto, archivoTamano: tamanoBytes, reenviado },
    miId, miClavePublica, miClavePrivada, destinatarioId,
  );
}

export async function enviarVideo(
  base64: string,
  miniaturaBase64: string | undefined,
  mime: string,
  duracionMs: number,
  ancho: number,
  alto: number,
  tamanoBytes: number,
  miId: string,
  miClavePublica: string,
  miClavePrivada: string,
  destinatarioId: string,
  reenviado?: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const payload: PayloadMensaje = {
    tipo: 'video', archivo: base64, archivoMime: mime, miniatura: miniaturaBase64,
    duracionMs, ancho, alto, archivoTamano: tamanoBytes, reenviado,
  };
  return enviarAdjunto(
    payload, '🎥 Vídeo',
    {
      tipo: 'video', archivoBase64: base64, archivoMime: mime, miniaturaBase64,
      duracionMs, ancho, alto, archivoTamano: tamanoBytes, reenviado,
    },
    miId, miClavePublica, miClavePrivada, destinatarioId,
  );
}

export async function enviarDocumento(
  base64: string,
  nombre: string,
  mime: string,
  tamanoBytes: number,
  miId: string,
  miClavePublica: string,
  miClavePrivada: string,
  destinatarioId: string,
  reenviado?: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const payload: PayloadMensaje = {
    tipo: 'documento', archivo: base64, archivoMime: mime, archivoNombre: nombre, archivoTamano: tamanoBytes, reenviado,
  };
  return enviarAdjunto(
    payload, `📄 ${nombre}`,
    {
      tipo: 'documento', archivoBase64: base64, archivoMime: mime, archivoNombre: nombre,
      archivoTamano: tamanoBytes, reenviado,
    },
    miId, miClavePublica, miClavePrivada, destinatarioId,
  );
}

// ─── Recepción ────────────────────────────────────────────────────────────────

function interpretarPayload(payloadRaw: string): {
  texto: string; tipo: TipoMensaje; respondeA?: RespuestaCitada; reenviado?: boolean;
  audioBase64?: string; duracionMs?: number; lat?: number; lon?: number;
  archivoBase64?: string; archivoMime?: string; archivoNombre?: string;
  archivoTamano?: number; miniaturaBase64?: string; ancho?: number; alto?: number;
  preview?: EnlacePreview;
} {
  try {
    const payload: PayloadMensaje = JSON.parse(payloadRaw);
    if (payload.tipo === 'audio') {
      return {
        texto: '🎤 Mensaje de voz', tipo: 'audio', audioBase64: payload.audio, duracionMs: payload.duracionMs,
        reenviado: payload.reenviado,
      };
    }
    if (payload.tipo === 'ubicacion') {
      return {
        texto: '📍 Ubicación compartida', tipo: 'ubicacion', lat: payload.lat, lon: payload.lon,
        reenviado: payload.reenviado,
      };
    }
    if (payload.tipo === 'imagen') {
      return {
        texto: '📷 Foto', tipo: 'imagen', archivoBase64: payload.archivo, archivoMime: payload.archivoMime,
        ancho: payload.ancho, alto: payload.alto, archivoTamano: payload.archivoTamano, reenviado: payload.reenviado,
      };
    }
    if (payload.tipo === 'video') {
      return {
        texto: '🎥 Vídeo', tipo: 'video', archivoBase64: payload.archivo, archivoMime: payload.archivoMime,
        miniaturaBase64: payload.miniatura, duracionMs: payload.duracionMs,
        ancho: payload.ancho, alto: payload.alto, archivoTamano: payload.archivoTamano, reenviado: payload.reenviado,
      };
    }
    if (payload.tipo === 'documento') {
      return {
        texto: `📄 ${payload.archivoNombre ?? 'Documento'}`, tipo: 'documento', archivoBase64: payload.archivo,
        archivoMime: payload.archivoMime, archivoNombre: payload.archivoNombre, archivoTamano: payload.archivoTamano,
        reenviado: payload.reenviado,
      };
    }
    return {
      texto: payload.texto ?? '', tipo: 'texto', respondeA: payload.respondeA,
      reenviado: payload.reenviado, preview: payload.preview,
    };
  } catch {
    // Formato heredado: el payload era el texto plano, sin envolver en JSON.
    return { texto: payloadRaw, tipo: 'texto' };
  }
}

// Procesamiento compartido de un mensaje entrante (nuevo o editado): descifra,
// persiste localmente e indexa la conversación. Usado tanto por
// suscribirMensajes (suscripción a UN canal concreto, mientras esa pantalla de
// conversación está abierta) como por suscribirConversacionesEntrantes (escaneo
// global para descubrir canales que aún no conocíamos localmente) — ver esa
// función más abajo para el motivo de por qué hace falta esta segunda vía.
async function procesarMensajeRecibido(
  canal: string,
  data: any,
  miId: string,
  miClavePrivada: string,
  onMensaje: (msg: Mensaje) => void,
): Promise<void> {
  if (!data || !data.id || data.para !== miId) return;

  const pubRem = await leerClavePublica(data.de);
  if (!pubRem) return;

  const payloadRaw = descifrarMensaje(data.cifrado, data.nonce, pubRem, miClavePrivada);
  if (!payloadRaw) return;

  const {
    texto, tipo, respondeA, reenviado, audioBase64, duracionMs, lat, lon,
    archivoBase64, archivoMime, archivoNombre, archivoTamano, miniaturaBase64, ancho, alto, preview,
  } = interpretarPayload(payloadRaw);
  const editado = !!data.editado;

  const mensajes = await cargarMensajesLocal(canal);
  const idx = mensajes.findIndex(m => m.id === data.id);

  if (idx >= 0) {
    // Ya lo conocíamos: solo puede ser una edición (mismo id). Si no cambió
    // nada relevante, no reprocesamos (evita "flicker" en cada re-suscripción).
    if (mensajes[idx].texto === texto && !!mensajes[idx].editado === editado) return;
    const actualizado: Mensaje = { ...mensajes[idx], texto, editado, respondeA };
    mensajes[idx] = actualizado;
    await guardarMensajesLocal(canal, mensajes);
    onMensaje(actualizado);
    return;
  }

  const msg: Mensaje = {
    id: data.id, texto, de: data.de, para: data.para, hora: data.hora,
    estado: 'entregado', mio: false, tipo, respondeA, editado, reenviado,
    audioBase64, duracionMs, lat, lon,
    archivoBase64, archivoMime, archivoNombre, archivoTamano, miniaturaBase64, ancho, alto, preview,
  };

  mensajes.push(msg);
  await guardarMensajesLocal(canal, mensajes);

  await actualizarConversacion({
    id: canal,
    contraparte: data.de,
    ultimoMensaje: texto,
    ultimaHora: data.hora,
    noLeidos: 1, // se sumará al leer
  });

  // Marcar como entregado en Gun para que el remitente lo vea
  nodoConversacion(canal).get(data.id).get('estado').put('entregado');

  onMensaje(msg);
}

// Suscribe a mensajes nuevos (y ediciones) en un canal, y los descifra.
// Devuelve una función para cancelar la suscripción.
export function suscribirMensajes(
  canal: string,
  miId: string,
  miClavePrivada: string,
  onMensaje: (msg: Mensaje) => void,
): () => void {
  const nodo = nodoConversacion(canal);
  nodo.map().on((data: any) => {
    procesarMensajeRecibido(canal, data, miId, miClavePrivada, onMensaje).catch(() => {});
  });
  return () => nodo.map().off();
}

// Descubre conversaciones 1:1 entrantes que aún no conocíamos localmente.
//
// A diferencia de un grupo —donde el id es fijo y suscribirGruposPropios en
// services/grupos.ts puede escanear "¿figuro en la lista de miembros?"— el id
// de un canal 1:1 (idCanal) es el par de usuarios ordenado: no hay forma de
// derivarlo sin conocer ya a la contraparte. suscribirMensajes(canal, ...)
// solo se activa dentro de conversacion.tsx, que exige ya conocer el
// `destinatario`. Resultado: si alguien nos escribe por primera vez y nunca
// abrimos manualmente su conversación (p.ej. buscándolo en "Nueva
// conversación"), no hay NINGUNA suscripción escuchando ese canal — el emisor
// sí publica el mensaje en Gun, pero nuestro dispositivo nunca lo indexa ni lo
// añade a la lista de Chat, aunque el mensaje siga ahí esperando en el relay.
//
// La solución, igual que con los grupos, es un escaneo del nodo raíz completo
// (`eli_chat_v1`, todos los canales de todos los pares) filtrando por
// `data.para === miId`. El contenido sigue viajando cifrado E2E; este escaneo
// solo ve metadatos (`de`/`para`/`hora`), mismo modelo de amenaza que
// suscribirGruposPropios ya asume para grupos.
export function suscribirConversacionesEntrantes(
  miId: string,
  miClavePrivada: string,
  onMensaje: (msg: Mensaje) => void,
): () => void {
  const chat = nodoChat();
  if (!chat) return () => {};
  chat.map().map().on((data: any) => {
    if (!data?.id || !data?.de || data.para !== miId) return;
    procesarMensajeRecibido(idCanal(data.de, data.para), data, miId, miClavePrivada, onMensaje).catch(() => {});
  });
  return () => chat.map().map().off();
}

// ─── Estados ──────────────────────────────────────────────────────────────────

// Llama a esto cuando el usuario abre una conversación
export async function marcarLeidos(canal: string, miId: string): Promise<void> {
  const mensajes = await cargarMensajesLocal(canal);
  let cambio = false;
  const actualizados = mensajes.map(m => {
    if (!m.mio && m.estado !== 'leido') {
      nodoConversacion(canal).get(m.id).get('estado').put('leido');
      cambio = true;
      return { ...m, estado: 'leido' as EstadoMensaje };
    }
    return m;
  });
  if (cambio) await guardarMensajesLocal(canal, actualizados);

  // Resetear contador de no leídos
  const raw = await AsyncStorage.getItem(KEY_CONVS);
  if (!raw) return;
  const lista: Conversacion[] = JSON.parse(raw);
  const idx = lista.findIndex(c => c.id === canal);
  if (idx >= 0) {
    lista[idx].noLeidos = 0;
    await AsyncStorage.setItem(KEY_CONVS, JSON.stringify(lista));
  }
}

// Suscribe a cambios de estado de mensajes propios (enviado → entregado → leido)
export function suscribirEstados(
  canal: string,
  onEstado: (id: string, estado: EstadoMensaje) => void,
): () => void {
  const nodo = nodoConversacion(canal);
  nodo.map().on((data: any) => {
    if (data?.id && data?.estado) {
      onEstado(data.id, data.estado as EstadoMensaje);
    }
  });
  return () => nodo.map().off();
}

// ─── Reacciones ───────────────────────────────────────────────────────────────
//
// Cada usuario escribe su propia reacción en un campo `reaccion_<usuario>`
// dentro del mismo nodo del mensaje (no un objeto anidado: Gun no fusiona
// bien objetos dentro de objetos, pero campos planos con clave dinámica sí
// se combinan sin pisarse entre los dos participantes). `emoji: null` borra
// la reacción de ese usuario.

export function reaccionarMensaje(
  canal: string,
  mensajeId: string,
  miId: string,
  emoji: string | null,
): void {
  nodoConversacion(canal).get(mensajeId).put({ [`reaccion_${miId}`]: emoji });
}

export function suscribirReacciones(
  canal: string,
  onReaccion: (mensajeId: string, usuario: string, emoji: string | null) => void,
): () => void {
  const nodo = nodoConversacion(canal);
  nodo.map().on((data: any) => {
    if (!data?.id) return;
    Object.keys(data).forEach(key => {
      if (key.startsWith('reaccion_')) {
        onReaccion(data.id, key.slice('reaccion_'.length), data[key] ?? null);
      }
    });
  });
  return () => nodo.map().off();
}

// ─── "Escribiendo…" ───────────────────────────────────────────────────────────
//
// Presencia simple basada en timestamp: quien escribe publica su hora actual
// (con throttle desde la UI); quien mira expira el indicador localmente si no
// ha visto una marca reciente, porque Gun no avisa por sí solo del paso del
// tiempo — no hay un evento explícito de "dejó de escribir".

const TYPING_TTL_MS = 4000;

export function notificarEscribiendo(canal: string, miId: string): void {
  nodoConversacion(canal).get('escribiendo').get(miId).put(Date.now());
}

export function suscribirEscribiendo(
  canal: string,
  miId: string,
  onCambio: (activo: boolean) => void,
): () => void {
  const nodo = nodoConversacion(canal).get('escribiendo');
  let ultimaMarca = 0;

  nodo.map().on((ts: number, key: string) => {
    if (key === miId || !ts) return;
    ultimaMarca = ts;
    onCambio(Date.now() - ts < TYPING_TTL_MS);
  });

  const intervalo = setInterval(() => {
    if (ultimaMarca && Date.now() - ultimaMarca >= TYPING_TTL_MS) {
      ultimaMarca = 0;
      onCambio(false);
    }
  }, 1000);

  return () => {
    nodo.map().off();
    clearInterval(intervalo);
  };
}
