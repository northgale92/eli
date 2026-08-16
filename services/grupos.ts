import AsyncStorage from '@react-native-async-storage/async-storage';
import { cifrarMensaje, descifrarMensaje } from './identidad';
import { nodoGrupos, nodoGrupoMensajes, leerClavePublica } from './gun';

// ══════════════════════════════════════════════════════════════════════════════
// GRUPOS — sin paridad total con la conversación 1:1.
//
// Simplificaciones deliberadas (documentadas, no bugs):
//   - Sin responder/citar, sin reacciones, sin editar en grupo.
//   - No se pueden añadir/quitar participantes tras crear el grupo.
//   - Sin roles de administrador.
//   - Cifrado: no hay clave de grupo compartida (evita un protocolo de
//     "sender keys" tipo Signal). En su lugar, cada mensaje se cifra por
//     separado para cada destinatario (NaCl box remitente→cada miembro), el
//     mismo primitivo que ya usa el chat 1:1, solo que repetido N veces. El
//     nodo del mensaje en Gun lleva un campo `para_<usuario>` por cada
//     miembro (JSON con {cifrado, nonce}); cada quien solo puede descifrar
//     el suyo con su clave privada.
//   - Tipos de mensaje: texto, audio, ubicación, imagen, vídeo y documento —
//     mismo payload JSON y misma interpretación que services/chat.ts, cifrado
//     N veces en vez de 1. Igual que en 1:1, NO pasa por moderacionCSAM.ts ni
//     moderacionAdultos.ts: sigue siendo contenido E2E, solo que con más de un
//     destinatario del mismo NaCl box por mensaje.
// ══════════════════════════════════════════════════════════════════════════════

import { LIMITE_ELIMINAR_PARA_TODOS_MS, type TipoMensaje } from './chat';

export interface Grupo {
  id: string;
  nombre: string;
  creador: string;
  participantes: string[];
  ultimoMensaje: string;
  ultimaHora: number;
  noLeidos: number;
}

export interface MensajeGrupo {
  id: string;
  texto: string;
  de: string;
  hora: number;
  mio: boolean;
  tipo?: TipoMensaje;
  reenviado?: boolean;
  eliminadoParaTodos?: boolean; // tombstoned vía Gun — ver eliminarMensajeGrupoParaTodos
  // tipo === 'audio'
  audioBase64?: string;
  duracionMs?: number;
  // tipo === 'ubicacion'
  lat?: number;
  lon?: number;
  // tipo === 'imagen' | 'video' | 'documento'
  archivoBase64?: string;
  archivoMime?: string;
  archivoNombre?: string;
  archivoTamano?: number;
  miniaturaBase64?: string;
  ancho?: number;
  alto?: number;
}

// Forma del contenido una vez descifrado (mismo esquema que PayloadMensaje en
// services/chat.ts, sin `respondeA`/`preview` porque grupo no soporta citar).
interface PayloadMensajeGrupo {
  tipo?: TipoMensaje;
  texto?: string;
  reenviado?: boolean;
  audio?: string;
  duracionMs?: number;
  lat?: number;
  lon?: number;
  archivo?: string;
  archivoMime?: string;
  archivoNombre?: string;
  archivoTamano?: number;
  miniatura?: string;
  ancho?: number;
  alto?: number;
}

const KEY_GRUPOS = 'eli_grupos';
const keyMensajesGrupo = (grupoId: string) => `eli_grupo_msgs_${grupoId}`;

// ─── Persistencia local ────────────────────────────────────────────────────────

async function guardarGruposLocal(lista: Grupo[]): Promise<void> {
  await AsyncStorage.setItem(KEY_GRUPOS, JSON.stringify(lista));
}

export async function cargarGruposLocal(): Promise<Grupo[]> {
  const raw = await AsyncStorage.getItem(KEY_GRUPOS);
  return raw ? JSON.parse(raw) : [];
}

export async function cargarGrupos(): Promise<Grupo[]> {
  const lista = await cargarGruposLocal();
  return lista.sort((a, b) => b.ultimaHora - a.ultimaHora);
}

async function actualizarGrupoResumen(
  grupoId: string, ultimoMensaje: string, ultimaHora: number, incrementarNoLeidos = false,
): Promise<void> {
  const lista = await cargarGruposLocal();
  const idx = lista.findIndex(g => g.id === grupoId);
  if (idx >= 0) {
    lista[idx].ultimoMensaje = ultimoMensaje;
    lista[idx].ultimaHora = ultimaHora;
    if (incrementarNoLeidos) lista[idx].noLeidos = (lista[idx].noLeidos ?? 0) + 1;
    await guardarGruposLocal(lista);
  }
}

export async function marcarGrupoLeido(grupoId: string): Promise<void> {
  const lista = await cargarGruposLocal();
  const idx = lista.findIndex(g => g.id === grupoId);
  if (idx >= 0 && lista[idx].noLeidos !== 0) {
    lista[idx].noLeidos = 0;
    await guardarGruposLocal(lista);
  }
}

export async function borrarGrupoLocal(grupoId: string): Promise<void> {
  await AsyncStorage.removeItem(keyMensajesGrupo(grupoId));
  const lista = await cargarGruposLocal();
  await guardarGruposLocal(lista.filter(g => g.id !== grupoId));
}

async function guardarMensajesGrupoLocal(grupoId: string, mensajes: MensajeGrupo[]): Promise<void> {
  await AsyncStorage.setItem(keyMensajesGrupo(grupoId), JSON.stringify(mensajes));
}

export async function cargarMensajesGrupoLocal(grupoId: string): Promise<MensajeGrupo[]> {
  const raw = await AsyncStorage.getItem(keyMensajesGrupo(grupoId));
  const mensajes: MensajeGrupo[] = raw ? JSON.parse(raw) : [];
  // Orden por `hora` (timestamp de envío original), no por orden de llegada:
  // en un grupo, cada mensaje llega vía nodo.map().on() de Gun en el orden en
  // que el P2P/relay lo sincroniza, que no coincide con el orden de envío —
  // sobre todo con reenvíos, donde varios mensajes salen casi a la vez.
  return mensajes.sort((a, b) => a.hora - b.hora);
}

// Borra un único mensaje solo de este dispositivo — mismo alcance "local"
// que borrarGrupoLocal (que borra el grupo entero) y que borrarMensaje en
// services/chat.ts para 1:1 (mismo patrón: no notifica ni tombstona en Gun,
// solo actualiza el resumen si el mensaje borrado era el último).
export async function borrarMensajeGrupo(grupoId: string, mensajeId: string): Promise<void> {
  const mensajes = await cargarMensajesGrupoLocal(grupoId);
  const filtrados = mensajes.filter(m => m.id !== mensajeId);
  await guardarMensajesGrupoLocal(grupoId, filtrados);

  const lista = await cargarGruposLocal();
  const idx = lista.findIndex(g => g.id === grupoId);
  if (idx >= 0) {
    const ultimo = filtrados[filtrados.length - 1];
    lista[idx].ultimoMensaje = ultimo?.texto ?? '';
    if (ultimo) lista[idx].ultimaHora = ultimo.hora;
    await guardarGruposLocal(lista);
  }
}

// Reduce un mensaje de grupo a su forma "eliminado para todos" — mismo
// criterio que tombstonarMensaje en services/chat.ts: solo quedan los
// metadatos imprescindibles, nada de texto/adjuntos.
function tombstonarMensajeGrupo(m: MensajeGrupo): MensajeGrupo {
  return { id: m.id, de: m.de, hora: m.hora, mio: m.mio, tipo: 'texto', texto: '', eliminadoParaTodos: true };
}

// "Eliminar para todos" en grupo — mismo patrón que eliminarMensajeParaTodos
// en services/chat.ts: tombstona (put null) el nodo del mensaje en Gun para
// que la eliminación llegue a cada miembro por la sincronización normal.
export async function eliminarMensajeGrupoParaTodos(
  grupoId: string,
  mensajeId: string,
  miId: string,
): Promise<{ ok: boolean; error?: string }> {
  const mensajes = await cargarMensajesGrupoLocal(grupoId);
  const idx = mensajes.findIndex(m => m.id === mensajeId);
  if (idx < 0) return { ok: false, error: 'Mensaje no encontrado.' };
  if (mensajes[idx].de !== miId) {
    return { ok: false, error: 'Solo puedes eliminar para todos tus propios mensajes.' };
  }
  if (Date.now() - mensajes[idx].hora > LIMITE_ELIMINAR_PARA_TODOS_MS) {
    return { ok: false, error: 'Ya pasó el tiempo disponible para eliminar este mensaje para todos.' };
  }

  try {
    nodoGrupoMensajes(grupoId)?.get(mensajeId).put(null);
  } catch {
    // Sin red — mismo best-effort que eliminarMensajeParaTodos en chat.ts.
  }

  mensajes[idx] = tombstonarMensajeGrupo(mensajes[idx]);
  await guardarMensajesGrupoLocal(grupoId, mensajes);

  const ultimo = mensajes[mensajes.length - 1];
  if (ultimo) {
    await actualizarGrupoResumen(
      grupoId,
      ultimo.eliminadoParaTodos ? 'Este mensaje fue eliminado' : ultimo.texto,
      ultimo.hora,
    );
  }

  return { ok: true };
}

// ─── Creación y descubrimiento ─────────────────────────────────────────────────

function extraerParticipantes(data: any): string[] {
  return Object.keys(data)
    .filter(k => k.startsWith('m_') && data[k])
    .map(k => k.slice(2));
}

export async function crearGrupo(
  nombre: string,
  creador: string,
  participantes: string[], // debe incluir al creador
): Promise<Grupo> {
  const id = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const hora = Date.now();
  const campos: Record<string, unknown> = { id, nombre, creador, hora };
  participantes.forEach(p => { campos[`m_${p}`] = true; });
  nodoGrupos().get(id).put(campos);

  const grupo: Grupo = { id, nombre, creador, participantes, ultimoMensaje: '', ultimaHora: hora, noLeidos: 0 };
  const lista = await cargarGruposLocal();
  lista.unshift(grupo);
  await guardarGruposLocal(lista);
  return grupo;
}

// Añade a la lista local un grupo del que nos acabamos de enterar por Gun
// (alguien nos incluyó como miembro), sin pisar uno que ya tuviéramos.
export async function agregarGrupoSiNuevo(grupo: Grupo): Promise<void> {
  const lista = await cargarGruposLocal();
  if (lista.find(g => g.id === grupo.id)) return;
  lista.unshift(grupo);
  await guardarGruposLocal(lista);
}

// Se suscribe a los grupos donde `miId` figura como miembro. Se usa para
// descubrir grupos creados por otra persona que nos añadió — no sustituye a
// cargarGrupos() (la lista local), es un complemento que hace fetch de los
// que aún no conocemos.
export function suscribirGruposPropios(
  miId: string,
  onGrupo: (grupo: Grupo) => void,
): () => void {
  const nodo = nodoGrupos();
  nodo.map().on((data: any) => {
    if (!data?.id || !data[`m_${miId}`]) return;
    onGrupo({
      id: data.id,
      nombre: data.nombre,
      creador: data.creador,
      participantes: extraerParticipantes(data),
      ultimoMensaje: '',
      ultimaHora: data.hora,
      noLeidos: 0,
    });
  });
  return () => nodo.map().off();
}

// ─── Mensajería ─────────────────────────────────────────────────────────────────
//
// enviarContenidoGrupo es el fan-out genérico (mismo rol que enviarAdjunto en
// services/chat.ts): cifra el mismo payload JSON por separado para cada
// miembro del grupo y guarda localmente el mensaje ya en claro. Los
// enviarXGrupo de abajo son wrappers finos que arman el payload/preview de
// cada tipo — igual patrón que enviarImagen/enviarVideo/enviarDocumento en
// chat.ts, solo que aquí un único envío escribe N sobres cifrados.

async function enviarContenidoGrupo(
  payload: PayloadMensajeGrupo,
  previewTexto: string,
  camposMensaje: Partial<MensajeGrupo>,
  miId: string,
  miClavePrivada: string,
  grupoId: string,
  participantes: string[],
): Promise<{ ok: boolean }> {
  const id = `${miId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const hora = Date.now();
  const contenido = JSON.stringify(payload);

  const campos: Record<string, unknown> = { id, de: miId, hora };
  for (const p of participantes) {
    if (p === miId) continue;
    const pub = await leerClavePublica(p);
    if (!pub) continue; // ese miembro aún no es localizable en la red; se pierde ese envío para él
    const { cifrado, nonce } = cifrarMensaje(contenido, pub, miClavePrivada);
    campos[`para_${p}`] = JSON.stringify({ cifrado, nonce });
  }
  nodoGrupoMensajes(grupoId).get(id).put(campos);

  const mensaje: MensajeGrupo = { id, texto: previewTexto, de: miId, hora, mio: true, ...camposMensaje };
  const mensajes = await cargarMensajesGrupoLocal(grupoId);
  mensajes.push(mensaje);
  await guardarMensajesGrupoLocal(grupoId, mensajes);
  await actualizarGrupoResumen(grupoId, previewTexto, hora);

  return { ok: true };
}

export async function enviarMensajeGrupo(
  texto: string,
  miId: string,
  miClavePrivada: string,
  grupoId: string,
  participantes: string[],
  reenviado?: boolean,
): Promise<{ ok: boolean }> {
  return enviarContenidoGrupo(
    { tipo: 'texto', texto, reenviado }, texto, { tipo: 'texto', reenviado },
    miId, miClavePrivada, grupoId, participantes,
  );
}

export async function enviarMensajeAudioGrupo(
  audioBase64: string,
  duracionMs: number,
  miId: string,
  miClavePrivada: string,
  grupoId: string,
  participantes: string[],
  reenviado?: boolean,
): Promise<{ ok: boolean }> {
  return enviarContenidoGrupo(
    { tipo: 'audio', audio: audioBase64, duracionMs, reenviado }, '🎤 Mensaje de voz',
    { tipo: 'audio', audioBase64, duracionMs, reenviado },
    miId, miClavePrivada, grupoId, participantes,
  );
}

export async function enviarUbicacionGrupo(
  lat: number,
  lon: number,
  miId: string,
  miClavePrivada: string,
  grupoId: string,
  participantes: string[],
  reenviado?: boolean,
): Promise<{ ok: boolean }> {
  return enviarContenidoGrupo(
    { tipo: 'ubicacion', lat, lon, reenviado }, '📍 Ubicación compartida',
    { tipo: 'ubicacion', lat, lon, reenviado },
    miId, miClavePrivada, grupoId, participantes,
  );
}

export async function enviarImagenGrupo(
  base64: string,
  mime: string,
  ancho: number,
  alto: number,
  tamanoBytes: number,
  miId: string,
  miClavePrivada: string,
  grupoId: string,
  participantes: string[],
  reenviado?: boolean,
): Promise<{ ok: boolean }> {
  return enviarContenidoGrupo(
    { tipo: 'imagen', archivo: base64, archivoMime: mime, ancho, alto, archivoTamano: tamanoBytes, reenviado },
    '📷 Foto',
    { tipo: 'imagen', archivoBase64: base64, archivoMime: mime, ancho, alto, archivoTamano: tamanoBytes, reenviado },
    miId, miClavePrivada, grupoId, participantes,
  );
}

export async function enviarVideoGrupo(
  base64: string,
  miniaturaBase64: string | undefined,
  mime: string,
  duracionMs: number,
  ancho: number,
  alto: number,
  tamanoBytes: number,
  miId: string,
  miClavePrivada: string,
  grupoId: string,
  participantes: string[],
  reenviado?: boolean,
): Promise<{ ok: boolean }> {
  return enviarContenidoGrupo(
    {
      tipo: 'video', archivo: base64, archivoMime: mime, miniatura: miniaturaBase64,
      duracionMs, ancho, alto, archivoTamano: tamanoBytes, reenviado,
    },
    '🎥 Vídeo',
    {
      tipo: 'video', archivoBase64: base64, archivoMime: mime, miniaturaBase64,
      duracionMs, ancho, alto, archivoTamano: tamanoBytes, reenviado,
    },
    miId, miClavePrivada, grupoId, participantes,
  );
}

export async function enviarDocumentoGrupo(
  base64: string,
  nombre: string,
  mime: string,
  tamanoBytes: number,
  miId: string,
  miClavePrivada: string,
  grupoId: string,
  participantes: string[],
  reenviado?: boolean,
): Promise<{ ok: boolean }> {
  return enviarContenidoGrupo(
    { tipo: 'documento', archivo: base64, archivoMime: mime, archivoNombre: nombre, archivoTamano: tamanoBytes, reenviado },
    `📄 ${nombre}`,
    { tipo: 'documento', archivoBase64: base64, archivoMime: mime, archivoNombre: nombre, archivoTamano: tamanoBytes, reenviado },
    miId, miClavePrivada, grupoId, participantes,
  );
}

// Interpreta el JSON del payload, con el mismo fallback a "formato heredado"
// (texto plano sin envolver) que interpretarPayload en services/chat.ts —
// necesario porque mensajes de grupo enviados antes de este cambio guardaron
// el texto plano directamente, sin envolver en PayloadMensajeGrupo.
function interpretarPayloadGrupo(payloadRaw: string): Partial<MensajeGrupo> & { texto: string } {
  try {
    const payload: PayloadMensajeGrupo = JSON.parse(payloadRaw);
    if (payload.tipo === 'audio') {
      return { texto: '🎤 Mensaje de voz', tipo: 'audio', audioBase64: payload.audio, duracionMs: payload.duracionMs, reenviado: payload.reenviado };
    }
    if (payload.tipo === 'ubicacion') {
      return { texto: '📍 Ubicación compartida', tipo: 'ubicacion', lat: payload.lat, lon: payload.lon, reenviado: payload.reenviado };
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
    return { texto: payload.texto ?? '', tipo: 'texto', reenviado: payload.reenviado };
  } catch {
    return { texto: payloadRaw, tipo: 'texto' };
  }
}

// Aplica un tombstone recibido en un mensaje de grupo (nodo puesto a null vía
// eliminarMensajeGrupoParaTodos) — mismo criterio que procesarTombstoneMensaje
// en services/chat.ts: reemplaza el mensaje conocido localmente por su
// versión "eliminado" en vez de dejarlo desaparecer sin rastro. Idempotente.
async function procesarTombstoneMensajeGrupo(
  grupoId: string,
  mensajeId: string,
  onMensaje: (msg: MensajeGrupo) => void,
): Promise<void> {
  if (!mensajeId) return;
  const mensajes = await cargarMensajesGrupoLocal(grupoId);
  const idx = mensajes.findIndex(m => m.id === mensajeId);
  if (idx < 0 || mensajes[idx].eliminadoParaTodos) return;

  const tombstoneado = tombstonarMensajeGrupo(mensajes[idx]);
  mensajes[idx] = tombstoneado;
  await guardarMensajesGrupoLocal(grupoId, mensajes);

  const ultimo = mensajes[mensajes.length - 1];
  if (ultimo) {
    await actualizarGrupoResumen(
      grupoId,
      ultimo.eliminadoParaTodos ? 'Este mensaje fue eliminado' : ultimo.texto,
      ultimo.hora,
    );
  }

  onMensaje(tombstoneado);
}

export function suscribirMensajesGrupo(
  grupoId: string,
  miId: string,
  miClavePrivada: string,
  onMensaje: (msg: MensajeGrupo) => void,
): () => void {
  const nodo = nodoGrupoMensajes(grupoId);

  nodo.map().on(async (data: any, idNodo: string) => {
    if (!data) {
      await procesarTombstoneMensajeGrupo(grupoId, idNodo, onMensaje);
      return;
    }
    if (!data.id || data.de === miId) return;
    const sobre = data[`para_${miId}`];
    if (!sobre) return;

    const mensajes = await cargarMensajesGrupoLocal(grupoId);
    if (mensajes.find(m => m.id === data.id)) return;

    const pubRem = await leerClavePublica(data.de);
    if (!pubRem) return;

    let envelope: { cifrado: string; nonce: string };
    try {
      envelope = JSON.parse(sobre);
    } catch {
      return;
    }

    const payloadRaw = descifrarMensaje(envelope.cifrado, envelope.nonce, pubRem, miClavePrivada);
    if (!payloadRaw) return;

    const interpretado = interpretarPayloadGrupo(payloadRaw);
    const msg: MensajeGrupo = { id: data.id, de: data.de, hora: data.hora, mio: false, ...interpretado };
    mensajes.push(msg);
    await guardarMensajesGrupoLocal(grupoId, mensajes);
    await actualizarGrupoResumen(grupoId, interpretado.texto, data.hora, true);

    onMensaje(msg);
  });

  return () => nodo.map().off();
}
