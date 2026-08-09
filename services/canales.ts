import AsyncStorage from '@react-native-async-storage/async-storage';
import { obtenerGun } from './gun';
import { moderarContenido, type MotivoBloqueo } from './moderacion';

// ══════════════════════════════════════════════════════════════════════════════
// CANALES — espacio de difusión público (el creador publica, la comunidad
// sigue). A diferencia de chat/grupos/Estados, el contenido de Canales NO es
// E2E: cualquiera puede leerlo, así que viaja SIN cifrar dentro de los nodos
// Gun de este módulo (mismo criterio que el Muro, services/publicaciones.ts).
//
// ── Qué pasa por moderarContenido()/moderacionCSAM.ts y qué NO ──────────────
//   • Imagen y vídeo  → SÍ. publicarEnCanal llama a moderarContenido(uri, ...,
//     'imagen'|'video'), que ejecuta primero las dos barreras de
//     moderacionCSAM.ts (hash-matching + clasificador) y, si las supera, el
//     análisis de contenido adulto (moderacionAdultos.ts). Mientras el CSAM
//     real (barrera 2, hash-matching síncrono) no exista — ver cabecera de
//     moderacionCSAM.ts — esto bloquea el 100% de las subidas de imagen/vídeo
//     en producción (fail-closed). Es un bloqueante conocido, no un bug de
//     este módulo.
//   • Documento (PDF) → SÍ, pero por una ruta distinta: moderarContenido(uri,
//     ..., 'documento') NUNCA pasa por moderacionCSAM.ts (el hash perceptual
//     no aplica a binarios PDF) — va directo a moderacionDocumentos.ts
//     (extracción de texto + análisis con Claude). No depende del bloqueante
//     CSAM y no está afectado por él.
//   • Texto (con o sin adjunto) → NO. Una publicación de solo texto se
//     escribe directamente en Gun sin pasar por moderarContenido(): el
//     proyecto no tiene hoy ningún filtro de moderación para texto plano
//     público. La única salvaguarda es de presentación, no de contenido: los
//     enlaces se sustituyen por "[enlace no permitido]" al mostrarlos (ver
//     sanitizarEnlaces más abajo y su uso en app/canal.tsx), para no crear
//     redes de enlaces clicables entre canales.
//   • Comentarios (services/comentarios.ts) → NO. Mismo criterio que el texto
//     de una publicación: son texto plano público, sin moderación de
//     contenido más allá del mismo saneado de enlaces al mostrarlos.
//   • moderarContenidoAmbiguo (dual IA Claude+Gemini, moderacionAdultos.ts) →
//     NO conectado. Es una ruta de consenso más estricta pensada para
//     contenido de Muro/Canal en zona ambigua, pero ni este módulo ni el
//     orquestador (services/moderacion.ts) la invocan hoy: la escalada de
//     imagen/vídeo sigue siendo la de rol único (consultarIAContextual).
//     Queda como código sin conectar, documentado aquí a propósito — no es
//     el bloqueante CSAM y es un cambio distinto (afectaría también al Muro).
// ══════════════════════════════════════════════════════════════════════════════

const SALA_CANALES = 'eli-canales-v1';
const SALA_SUSCRIPCIONES = 'eli-suscripciones-canales-v1';
const CLAVE_SUSCRITOS_LOCAL = 'eli_suscritos';

export interface ResultadoPublicacion {
  publicado: boolean;
  mensajeBloqueo?: string;
}

export function crearCanal(nombre: string, descripcion: string, creador: string) {
  const id = Math.random().toString(36).slice(2, 11);
  const canal = {
    id,
    nombre,
    descripcion,
    creador,
    timestamp: Date.now(),
    suscriptores: 1,
  };
  obtenerGun().get(SALA_CANALES).get(id).put(canal);
  return id;
}

export function escucharCanales(callback: (canal: any) => void): () => void {
  const nodo = obtenerGun().get(SALA_CANALES);
  nodo.map().on((data: any) => {
    if (data && data.nombre) {
      callback(data);
    }
  });
  return () => nodo.map().off();
}

// Reemplaza cualquier URL por un marcador no clicable — única "moderación"
// que se aplica al texto público (publicaciones y comentarios). Ver nota de
// cabecera: no es un filtro de contenido, es una decisión de presentación
// para no crear redes de enlaces entre canales.
export function sanitizarEnlaces(texto: string): string {
  return texto.replace(/(https?:\/\/[^\s]+)/g, '[enlace no permitido]');
}

// ─── Adjuntos ─────────────────────────────────────────────────────────────────
//
// `uri` es el archivo local tal cual lo entrega el picker — se usa SOLO para
// el análisis de moderación (TFLite/Claude leen el archivo directamente) y
// nunca se persiste. `base64` es el contenido real que sí viaja a Gun: igual
// que en services/chat.ts, no hay CDN ni servidor de medios propio, así que
// el archivo entero vive en un campo del nodo de la publicación.
export interface AdjuntoCanal {
  tipo: 'imagen' | 'video' | 'documento';
  uri: string;
  base64: string;
  mime: string;
  nombre?: string;      // documento
  duracionMs?: number;  // video
}

function mensajeBloqueoVisual(motivo?: MotivoBloqueo): string {
  switch (motivo) {
    case 'csam_confirmado':
      return '⛔ Contenido bloqueado permanentemente. Tu cuenta ha sido suspendida.';
    case 'csam_clasificador_local':
      return '⛔ El sistema de seguridad ha bloqueado esta publicación.';
    case 'csam_verificacion_fallida':
      // Mensaje explícito para que quien prueba la app entienda que es una
      // limitación conocida (no hay barrera de hash-matching CSAM síncrona
      // todavía — ver services/moderacionCSAM.ts) y no un fallo genérico.
      return '⚠️ Moderación de contenido visual no disponible temporalmente. Es una limitación conocida de esta versión: por ahora no se pueden publicar imágenes ni vídeos en Canales.';
    case 'contenido_adulto':
      return '⚠️ Contenido no permitido en ELI. Elige otro archivo.';
    default:
      return '⚠️ Contenido no permitido en ELI. Elige otro archivo.';
  }
}

// La moderación ocurre aquí, internamente.
// El caller solo pasa el adjunto (URI + base64 ya leídos/comprimidos por la
// UI) — nunca un flag de aprobación precomputado. Esto garantiza que ningún
// punto de entrada pueda saltarse el pipeline.
export async function publicarEnCanal(
  canalId: string,
  texto: string,
  usuario: string,
  adjunto: AdjuntoCanal | null = null,
): Promise<ResultadoPublicacion> {
  if (adjunto?.tipo === 'imagen' || adjunto?.tipo === 'video') {
    const mod = await moderarContenido(adjunto.uri, usuario, adjunto.tipo, adjunto.duracionMs);

    if (!mod.aprobado) {
      return { publicado: false, mensajeBloqueo: mensajeBloqueoVisual(mod.motivoBloqueo) };
    }

    const requiereNeblina = mod.adultos?.requiereNeblina ?? false;
    const esPeriodista = mod.adultos?.esPeriodista ?? false;
    _escribirEnGun(canalId, texto, usuario, adjunto, requiereNeblina, esPeriodista);
    return { publicado: true };
  }

  if (adjunto?.tipo === 'documento') {
    const mod = await moderarContenido(adjunto.uri, usuario, 'documento');

    if (!mod.aprobado) {
      return {
        publicado: false,
        mensajeBloqueo: '⚠️ El documento contiene instrucciones que incumplen las normas de ELI.',
      };
    }

    _escribirEnGun(canalId, texto, usuario, adjunto, false, false);
    return { publicado: true };
  }

  // Publicación de texto sin adjunto: sin moderación de contenido (ver nota de cabecera)
  _escribirEnGun(canalId, texto, usuario, null, false, false);
  return { publicado: true };
}

function _escribirEnGun(
  canalId: string,
  texto: string,
  usuario: string,
  adjunto: AdjuntoCanal | null,
  requiereNeblina: boolean,
  esPeriodista: boolean,
) {
  const pub = {
    id: Math.random().toString(36).slice(2, 11),
    canalId,
    usuario,
    texto,
    imagen: adjunto?.tipo === 'imagen' ? adjunto.base64 : null,
    imagenMime: adjunto?.tipo === 'imagen' ? adjunto.mime : null,
    video: adjunto?.tipo === 'video' ? adjunto.base64 : null,
    videoMime: adjunto?.tipo === 'video' ? adjunto.mime : null,
    videoDuracionMs: adjunto?.tipo === 'video' ? adjunto.duracionMs ?? null : null,
    documento: adjunto?.tipo === 'documento' ? adjunto.base64 : null,
    documentoMime: adjunto?.tipo === 'documento' ? adjunto.mime : null,
    documentoNombre: adjunto?.tipo === 'documento' ? adjunto.nombre ?? null : null,
    requiereNeblina,
    esPeriodista,
    timestamp: Date.now(),
    likes: 0,
  };
  obtenerGun().get(`eli-canal-${canalId}`).get(pub.id).put(pub);
}

export function escucharPublicacionesCanal(canalId: string, callback: (pub: any) => void): () => void {
  const nodo = obtenerGun().get(`eli-canal-${canalId}`);
  nodo.map().on((data: any) => {
    if (data && data.texto !== undefined) {
      callback(data);
    }
  });
  return () => nodo.map().off();
}

// ─── Suscripciones ────────────────────────────────────────────────────────────
//
// Persistidas en Gun (nodo por usuario, un campo booleano por canal — mismo
// patrón que la membresía de grupo `m_<usuario>` en services/grupos.ts), no
// solo en AsyncStorage. Esto es lo que hace que sobrevivan a reinstalar la
// app: al volver a crear la identidad con el mismo @usuario, se vuelve a leer
// el mismo nodo de Gun. Es también, de facto, la sincronización "entre
// dispositivos del mismo usuario": ELI no tiene un concepto de multi-dispositivo
// con la MISMA identidad (cada dispositivo genera su propio par de claves NaCl
// al crear la cuenta — ver services/identidad.ts), así que el @usuario es el
// único identificador estable compartible entre instalaciones/dispositivos, y
// es exactamente la clave que usa este nodo.
//
// AsyncStorage se mantiene como caché local para pintar la UI al instante sin
// esperar a la red (mismo patrón que cargarConversaciones/cargarGruposLocal en
// el resto del proyecto); Gun es la fuente de verdad.

function extraerCanalesSuscritos(data: any): string[] {
  if (!data) return [];
  return Object.keys(data).filter(k => k !== '_' && data[k] === true);
}

async function guardarSuscritosLocal(lista: string[]): Promise<void> {
  await AsyncStorage.setItem(CLAVE_SUSCRITOS_LOCAL, JSON.stringify(lista));
}

export async function obtenerSuscritosLocal(): Promise<string[]> {
  try {
    const datos = await AsyncStorage.getItem(CLAVE_SUSCRITOS_LOCAL);
    return datos ? JSON.parse(datos) : [];
  } catch {
    return [];
  }
}

export async function suscribirse(canalId: string, usuario: string): Promise<void> {
  obtenerGun().get(SALA_SUSCRIPCIONES).get(usuario).put({ [canalId]: true });
  const local = await obtenerSuscritosLocal();
  if (!local.includes(canalId)) {
    local.push(canalId);
    await guardarSuscritosLocal(local);
  }
}

export async function desuscribirse(canalId: string, usuario: string): Promise<void> {
  obtenerGun().get(SALA_SUSCRIPCIONES).get(usuario).put({ [canalId]: false });
  const local = await obtenerSuscritosLocal();
  await guardarSuscritosLocal(local.filter(id => id !== canalId));
}

// Lee el estado real desde Gun (fuente de verdad) y refresca la copia local.
// Si Gun no responde a tiempo (sin red), se devuelve la copia local como
// fallback — mismo patrón de timeout que leerClavePublica en services/gun.ts.
export async function obtenerSuscritos(usuario: string): Promise<string[]> {
  const remoto = await new Promise<string[] | null>((resolve) => {
    const timeout = setTimeout(() => resolve(null), 8000);
    obtenerGun().get(SALA_SUSCRIPCIONES).get(usuario).once((data: any) => {
      clearTimeout(timeout);
      resolve(extraerCanalesSuscritos(data));
    });
  });
  if (remoto === null) return obtenerSuscritosLocal();
  await guardarSuscritosLocal(remoto);
  return remoto;
}

export async function estaSuscrito(canalId: string, usuario: string): Promise<boolean> {
  const suscritos = await obtenerSuscritos(usuario);
  return suscritos.includes(canalId);
}

// Barrido único de todo el contenido público del usuario en Canales: sus
// publicaciones dentro de cada canal (las haya creado él o no) y los canales
// que él mismo creó (tombstone del nodo del canal, `put(null)`, igual que
// eliminarPublicacion en services/publicaciones.ts). Usado desde el flujo de
// autodestrucción de cuenta (services/destruirApp.ts) cuando el usuario
// activa el toggle de "borrar también mis publicaciones públicas".
//
// A diferencia del Muro, aquí las publicaciones viven en un nodo por canal
// (`eli-canal-${canalId}`), así que primero hay que enumerar los canales y
// después barrer cada uno — por eso son dos ventanas de recolección en
// cascada en vez de una sola.
export function eliminarContenidoCanalesDeUsuario(usuario: string, ventanaMs = 3000): Promise<number> {
  return new Promise((resolve) => {
    const canales: { id: string; creador: string }[] = [];
    obtenerGun().get(SALA_CANALES).map().once((data: any, id: string) => {
      if (data && data.nombre) canales.push({ id, creador: data.creador });
    });

    setTimeout(async () => {
      const conteos = await Promise.all(
        canales.map((canal) => _barrerPublicacionesCanal(canal.id, usuario, ventanaMs)),
      );

      canales
        .filter((canal) => canal.creador === usuario)
        .forEach((canal) => obtenerGun().get(SALA_CANALES).get(canal.id).put(null));

      resolve(conteos.reduce((total, n) => total + n, 0));
    }, ventanaMs);
  });
}

function _barrerPublicacionesCanal(canalId: string, usuario: string, ventanaMs: number): Promise<number> {
  return new Promise((resolve) => {
    const ids: string[] = [];
    obtenerGun().get(`eli-canal-${canalId}`).map().once((data: any, id: string) => {
      if (data && data.usuario === usuario) ids.push(id);
    });
    setTimeout(() => {
      ids.forEach((id) => obtenerGun().get(`eli-canal-${canalId}`).get(id).put(null));
      resolve(ids.length);
    }, ventanaMs);
  });
}
