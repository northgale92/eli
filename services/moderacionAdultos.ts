// ══════════════════════════════════════════════════════════════════════════════
// RUTA 2 — CONTENIDO ADULTO AMBIGUO (NO relacionado con CSAM)
//
// ⛔ AISLAMIENTO TOTAL: Este módulo NUNCA importa de moderacionCSAM.ts.
//
// Flujo:
//   1. Clasificador local nsfw.tflite evalúa el contenido (on-device).
//   2. Score claro (≤0.5 aprobado / >0.7 bloqueado para usuarios estándar)
//      → decisión local, sin IA. Excepción: si el usuario tiene un rol
//      especial (periodista, artista, médico), los scores altos TAMBIÉN
//      se escalan a IA en lugar de bloquearse directamente.
//   3. Score ambiguo (0.5–0.7) o rol especial con score alto
//      → Claude vía proxy ciego para decisión contextual.
//
// ── Lógica de roles ──
//   esPeriodista=true:    violencia/guerra/cuerpos → aprobado CON neblina.
//                         Nunca censura directa de periodismo.
//   rolVerificado='artista': desnudo artístico → aprobado SIN neblina.
//   rolVerificado='medico':  contenido anatómico/clínico → aprobado SIN neblina.
//   Sin rol:              desnudo no explícito → aprobado CON neblina.
//   La neblina se reserva para contenido periodístico sensible, no para
//   desnudo artístico o médico (que se aprueba directamente).
// ══════════════════════════════════════════════════════════════════════════════

import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import jpeg from 'jpeg-js';
import type { TfliteModel } from 'react-native-fast-tflite';

// ─── Interfaces públicas ──────────────────────────────────────────────────────

export interface ResultadoAdultos {
  aprobado: boolean;
  scoreLocal: number;
  esPeriodista: boolean;
  requiereNeblina: boolean;
  fallbackCPU: boolean;
  framesAnalizados?: number;
  modoSimulado: boolean;
  fallbackIA: boolean;
  razonamientoIA?: string;
}

export interface ContextoUsuario {
  esPeriodista: boolean;
  // TODO: poblar desde el sistema de roles de identidad.ts cuando esté implementado.
  // Valores conocidos: 'artista', 'medico'. null = usuario estándar.
  rolVerificado: string | null;
}

// ─── Constantes del modelo TFLite ─────────────────────────────────────────────
// Especificación completa en assets/modelos/MODELO.md

const INPUT_SIZE = 224;
const UMBRAL_BLOQUEO = 0.7;
const UMBRAL_NEBLINA = 0.5;
// Índices del tensor de salida: [drawings, hentai, neutral, porn, sexy]
const IDX_HENTAI = 1;
const IDX_PORN = 3;
const IDX_SEXY = 4;

const MIN_FRAMES = 8;
const MAX_FRAMES = 12;
// Evitar el primer y último 500ms (suelen ser frames negros de transición)
const MARGEN_MS = 500;

// ─── Configuración del proxy IA (Hetzner) ────────────────────────────────────
// NUNCA se usa para CSAM. Solo para contenido adulto ambiguo y apelaciones.

const IA_PROXY_URL: string =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_IA_PROXY_URL) || '';
const IA_PROXY_KEY: string =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_IA_PROXY_KEY) || '';
const ANTHROPIC_KEY_DEV: string =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_ANTHROPIC_KEY) || '';

const MODELO_CLAUDE = 'claude-sonnet-4-6';

// ─── Singleton del modelo TFLite ──────────────────────────────────────────────
//
// La promesa (éxito O fallo) se cachea de forma permanente: si la carga
// falla una vez, no se reintenta en llamadas posteriores dentro de la misma
// sesión. Antes, un fallo dejaba `_cargando` en null y cada nueva llamada
// (p. ej. reintentos de publicación) volvía a invocar loadTensorflowModel(),
// lo que en dispositivos donde la carga falla de forma consistente producía
// cientos de llamadas nativas por minuto sin parar — visible en logcat como
// "Loading Tensorflow Lite Model" repitiéndose miles de veces por sesión.
// Consistente con el diseño fail-closed del resto del pipeline: si el
// modelo no carga, la ruta de adultos falla cerrado en vez de reintentar
// indefinidamente.

let _cargando: Promise<TfliteModel> | null = null;

function obtenerModelo(): Promise<TfliteModel> {
  if (_cargando === null) {
    // Import dinámico: react-native-fast-tflite crea sus HybridObjects nativos
    // (Nitro Modules) de forma síncrona en cuanto se importa el paquete. Si eso
    // ocurre a nivel de módulo (import estático), se ejecuta durante el arranque
    // de la app —antes de que el runtime de Nitro esté instalado— y cuelga el
    // arranque en frío. Diferirlo aquí asegura que solo se cargue la primera vez
    // que se necesita moderar contenido real.
    _cargando = import('react-native-fast-tflite').then(({ loadTensorflowModel }) =>
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loadTensorflowModel(require('../assets/modelos/nsfw.tflite') as number, []),
    );
  }
  return _cargando;
}

export function precalentarModelo(): void {
  obtenerModelo().catch(() => {
    // El error se propagará en el primer análisis real.
  });
}

// ─── Pipeline TFLite (privado) ────────────────────────────────────────────────

function generarTimestamps(duracionMs: number): number[] {
  const margen = Math.min(MARGEN_MS, duracionMs * 0.05);
  const rango = Math.max(0, duracionMs - margen * 2);

  // 13 valores: buf[0] → cantidad de frames, buf[1..12] → semillas de timestamps.
  const buf = new Uint32Array(13);
  Crypto.getRandomValues(buf);

  const count = (buf[0] % (MAX_FRAMES - MIN_FRAMES + 1)) + MIN_FRAMES;
  return Array.from(
    { length: count },
    (_, i) => margen + (buf[i + 1] / 0xFFFFFFFF) * rango,
  ).sort((a, b) => a - b);
}

function construirTensor(pixelesRGBA: Uint8Array): ArrayBuffer {
  // RGBA → RGB float32 en [0.0, 1.0] — el canal alfa se descarta.
  const tensor = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);
  let dst = 0;
  for (let src = 0; src < pixelesRGBA.length; src += 4) {
    tensor[dst++] = pixelesRGBA[src]     / 255;
    tensor[dst++] = pixelesRGBA[src + 1] / 255;
    tensor[dst++] = pixelesRGBA[src + 2] / 255;
  }
  return tensor.buffer;
}

function base64AUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function scoreFrame(modelo: TfliteModel, frameUri: string): Promise<number | null> {
  let resizedUri: string | null = null;
  try {
    const resized = await ImageManipulator.manipulateAsync(
      frameUri,
      [{ resize: { width: INPUT_SIZE, height: INPUT_SIZE } }],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 1 },
    );
    resizedUri = resized.uri;

    const b64 = await FileSystem.readAsStringAsync(resizedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const { data } = jpeg.decode(base64AUint8Array(b64), { useTArray: true });

    const [outputBuf] = await modelo.run([construirTensor(data)]);
    const scores = new Float32Array(outputBuf);
    return scores[IDX_HENTAI] + scores[IDX_PORN] + scores[IDX_SEXY];
  } catch {
    return null;
  } finally {
    if (resizedUri !== null) {
      try {
        await FileSystem.deleteAsync(resizedUri, { idempotent: true });
      } catch {
        // limpieza best-effort — no debe tumbar el resultado del análisis
      }
    }
  }
}

// ─── Escalado a IA: cuándo consultar Claude ──────────────────────────────────
//
// Usuarios estándar: escalar solo la zona ambigua (0.5–0.7).
//   Score >0.7 → bloqueo local directo.
// Usuarios con rol especial (periodista, artista, médico):
//   Escalar siempre que el score supere UMBRAL_NEBLINA, independientemente de
//   si supera UMBRAL_BLOQUEO. "Nunca censura directa" para roles especiales.

function debeEscalarAIA(score: number, contexto: ContextoUsuario): boolean {
  if (score <= UMBRAL_NEBLINA) return false; // claramente seguro
  if (score > UMBRAL_BLOQUEO) {
    // Para usuarios estándar, bloquear directamente sin consultar IA.
    // Para roles especiales, siempre escalar (no existe bloqueo local directo).
    return contexto.esPeriodista || contexto.rolVerificado !== null;
  }
  return true; // zona ambigua (0.5–0.7): siempre escalar
}

// ─── Fallback IA: consulta contextual a Claude ────────────────────────────────

interface DecisionIA {
  aprobado: boolean;
  requiereNeblina: boolean; // Claude decide si aplica neblina según el rol
  razonamiento: string;
}

// System prompt grande → prompt caching en llamadas repetidas
const SYSTEM_PROMPT_ADULTOS = `Eres el moderador de contenido visual de ELI, una red social P2P de periodismo independiente.

Evalúas imágenes que han quedado en zona ambigua tras el clasificador local (score 0.5–0.7) o que pertenecen a usuarios con roles verificados que requieren revisión contextual.

━━━ CRITERIOS POR ROL — aplica en este orden ━━━

1. SIEMPRE BLOQUEADO (sin excepción de rol):
   • Cualquier contenido que insinúe menores en contexto sexual. Responde inmediatamente, sin análisis extenso.
   • Contenido sexual explícito entre adultos.

2. ROLES VERIFICADOS (si el contenido no cae en el punto 1):
   • rolVerificado='artista': desnudo artístico (no sexual/explícito) → aprobado SIN neblina. Es la finalidad del rol.
   • rolVerificado='medico': contenido anatómico o clínico → aprobado SIN neblina. Es la finalidad del rol.
   • esPeriodista=true: violencia, guerra, catástrofes, cuerpos, escenas de conflicto armado → aprobado CON neblina. NUNCA censurar periodismo legítimo.

3. SIN ROL ESPECIAL:
   • Desnudo artístico o académico leve → aprobado CON neblina.
   • Contenido erótico sugerente (no explícito) → aprobado CON neblina.
   • Contenido sexual explícito → bloqueado.

REGLA DE NEBLINA:
  requiereNeblina=true → contenido periodístico sensible o desnudo leve sin rol verificado.
  requiereNeblina=false → contenido aprobado para artistas/médicos verificados, o contenido neutro.

Responde SIEMPRE con JSON válido, sin texto adicional:
{
  "aprobado": true|false,
  "requiereNeblina": true|false,
  "razonamiento": "<explicación breve, máx 200 caracteres>"
}`;

async function consultarIAContextual(
  imagenBase64: string,
  scoreLocal: number,
  contexto: ContextoUsuario,
  motivoApelacion?: string,
): Promise<DecisionIA> {
  const rolDescripcion = contexto.rolVerificado
    ? `verificado como "${contexto.rolVerificado}"`
    : contexto.esPeriodista
    ? 'periodista verificado'
    : 'usuario estándar (sin rol especial)';

  const lineas = [
    `Score del clasificador local: ${scoreLocal.toFixed(3)}.`,
    `Rol del usuario: ${rolDescripcion}.`,
    motivoApelacion
      ? `Motivo de apelación del usuario: ${motivoApelacion}`
      : 'Análisis de zona ambigua o revisión por rol especial.',
    'Evalúa la imagen adjunta y devuelve tu decisión en JSON incluyendo "requiereNeblina".',
  ];

  const cuerpo = JSON.stringify({
    model: MODELO_CLAUDE,
    max_tokens: 256,
    system: [{ type: 'text', text: SYSTEM_PROMPT_ADULTOS, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imagenBase64 } },
          { type: 'text', text: lineas.join('\n') },
        ],
      },
    ],
  });

  const usarProxy = Boolean(IA_PROXY_URL && IA_PROXY_KEY);
  const url = usarProxy
    ? `${IA_PROXY_URL}/v1/messages`
    : 'https://api.anthropic.com/v1/messages';
  const headers: Record<string, string> = usarProxy
    ? { Authorization: `Bearer ${IA_PROXY_KEY}`, 'Content-Type': 'application/json' }
    : { 'x-api-key': ANTHROPIC_KEY_DEV, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };

  if (!usarProxy && !ANTHROPIC_KEY_DEV) {
    return { aprobado: false, requiereNeblina: false, razonamiento: 'IA no configurada — bloqueado cautelarmente.' };
  }

  try {
    const response = await fetch(url, { method: 'POST', headers, body: cuerpo });
    if (!response.ok) {
      return { aprobado: false, requiereNeblina: false, razonamiento: 'Error de API — bloqueado cautelarmente.' };
    }

    const data = await response.json() as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === 'text' ? data.content[0].text : '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return { aprobado: false, requiereNeblina: false, razonamiento: 'Respuesta IA no parseable — bloqueado cautelarmente.' };
    }

    const parsed = JSON.parse(match[0]) as { aprobado: boolean; requiereNeblina: boolean; razonamiento: string };
    return {
      aprobado: parsed.aprobado === true,
      requiereNeblina: parsed.requiereNeblina === true,
      razonamiento: typeof parsed.razonamiento === 'string' ? parsed.razonamiento.slice(0, 200) : '',
    };
  } catch {
    return { aprobado: false, requiereNeblina: false, razonamiento: 'Error de red — bloqueado cautelarmente.' };
  }
}

// ─── Helpers (privados) ───────────────────────────────────────────────────────

function resultadoLocal(scoreLocal: number, framesAnalizados: number): ResultadoAdultos {
  return {
    aprobado: scoreLocal <= UMBRAL_BLOQUEO,
    scoreLocal,
    esPeriodista: false,
    requiereNeblina: scoreLocal > UMBRAL_NEBLINA && scoreLocal <= UMBRAL_BLOQUEO,
    fallbackCPU: true,
    framesAnalizados,
    modoSimulado: false,
    fallbackIA: false,
  };
}

async function leerBase64(uri: string): Promise<string | null> {
  try {
    return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  } catch {
    return null;
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────

export async function analizarImagen(
  uri: string,
  _usuarioId: string,
  contexto: ContextoUsuario = { esPeriodista: false, rolVerificado: null },
): Promise<ResultadoAdultos> {
  const modelo = await obtenerModelo();
  const score = await scoreFrame(modelo, uri);
  if (score === null) throw new Error('moderacion-adultos: análisis de imagen fallido');

  const local = resultadoLocal(score, 1);

  if (!debeEscalarAIA(score, contexto)) return local;

  const b64 = await leerBase64(uri);
  if (b64 === null) return local;

  const ia = await consultarIAContextual(b64, score, contexto);
  return {
    ...local,
    aprobado: ia.aprobado,
    esPeriodista: contexto.esPeriodista,
    requiereNeblina: ia.aprobado && ia.requiereNeblina,
    fallbackIA: true,
    razonamientoIA: ia.razonamiento,
  };
}

export async function analizarFramesVideo(
  uri: string,
  duracionMs: number,
  _usuarioId: string,
  contexto: ContextoUsuario = { esPeriodista: false, rolVerificado: null },
): Promise<ResultadoAdultos> {
  const modelo = await obtenerModelo();
  const timestamps = generarTimestamps(duracionMs);

  // Mapa timestamp → score para poder recuperar el frame del score máximo
  const scorePorMs = new Map<number, number>();
  for (const ms of timestamps) {
    let thumbUri: string | null = null;
    try {
      const thumb = await VideoThumbnails.getThumbnailAsync(uri, { time: ms, quality: 1 });
      thumbUri = thumb.uri;
      const s = await scoreFrame(modelo, thumbUri);
      if (s !== null) scorePorMs.set(ms, s);
    } catch {
      // timestamp no disponible — se omite sin abortar el análisis
    } finally {
      if (thumbUri !== null) {
        try {
          await FileSystem.deleteAsync(thumbUri, { idempotent: true });
        } catch {
          // limpieza best-effort — no debe tumbar el análisis del vídeo
        }
      }
    }
  }

  if (scorePorMs.size === 0) {
    throw new Error('moderacion-adultos: no se pudo analizar ningún frame del vídeo');
  }

  const scores = [...scorePorMs.values()];
  // Criterio conservador: el frame más restrictivo determina el resultado.
  const scoreMax = Math.max(...scores);
  const local = resultadoLocal(scoreMax, scores.length);

  if (!debeEscalarAIA(scoreMax, contexto)) return local;

  // Recuperar el frame de mayor score para enviarlo a Claude
  let msAmbiguo = timestamps[0];
  for (const [ms, s] of scorePorMs) {
    if (s === scoreMax) { msAmbiguo = ms; break; }
  }

  let imagenBase64: string | null = null;
  let tmpThumb: string | null = null;
  try {
    const thumb = await VideoThumbnails.getThumbnailAsync(uri, { time: msAmbiguo, quality: 1 });
    tmpThumb = thumb.uri;
    imagenBase64 = await leerBase64(tmpThumb);
  } catch {
    // si falla la extracción del frame, decidimos con el resultado local
  } finally {
    if (tmpThumb !== null) {
      try {
        await FileSystem.deleteAsync(tmpThumb, { idempotent: true });
      } catch {
        // limpieza best-effort — no debe tumbar el resultado local
      }
    }
  }

  if (imagenBase64 === null) return local;

  const ia = await consultarIAContextual(imagenBase64, scoreMax, contexto);
  return {
    ...local,
    aprobado: ia.aprobado,
    esPeriodista: contexto.esPeriodista,
    requiereNeblina: ia.aprobado && ia.requiereNeblina,
    fallbackIA: true,
    razonamientoIA: ia.razonamiento,
  };
}

// ─── Moderación dual-IA para contenido ambiguo (Claude + Gemini) ──────────────
// Llamar SOLO cuando el clasificador local ya marcó la imagen como "ambigua".
// Aprobado únicamente si AMBAS IAs coinciden. Desacuerdo o error → bloqueado.

const GEMINI_KEY_DEV: string =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GEMINI_KEY) || '';
const MODERACION_MOCK: boolean =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_MODERACION_MOCK) === 'true';
const MODELO_GEMINI = 'gemini-2.0-flash';

// Cicla 0-3. Escenarios:
//   0 — Claude ✓ + Gemini ✓ → aprobado
//   1 — Claude ✗ + Gemini ✓ → desacuerdo → bloqueado
//   2 — Claude ✗ + Gemini ✗ → ambas rechazan → bloqueado
//   3 — error de red simulado → bloqueado
let _escenarioMock = 0;

/** Solo para pruebas — no llamar en producción. */
export function resetarEscenarioMock(): void {
  _escenarioMock = 0;
}

interface _VeredictDual {
  aprobado: boolean;
  motivo?: string;
}

async function _llamarClaude(
  imagenBase64: string,
  tipoPublicacion: 'muro' | 'canal',
): Promise<_VeredictDual> {
  if (MODERACION_MOCK) {
    return { aprobado: _escenarioMock === 0 }; // solo escenario 0 aprueba
  }

  const usarProxy = Boolean(IA_PROXY_URL && IA_PROXY_KEY);
  const apiKey = usarProxy ? IA_PROXY_KEY : ANTHROPIC_KEY_DEV;
  if (!apiKey) return { aprobado: false, motivo: 'Claude no configurado — clave ausente.' };

  const url = usarProxy
    ? `${IA_PROXY_URL}/v1/messages`
    : 'https://api.anthropic.com/v1/messages';
  const headers: Record<string, string> = usarProxy
    ? { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    : { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };

  const body = JSON.stringify({
    model: MODELO_CLAUDE,
    max_tokens: 128,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imagenBase64 } },
        {
          type: 'text',
          text: `Eres moderador de contenido de ELI, red social de periodismo P2P.\nImagen de publicación en ${tipoPublicacion === 'canal' ? 'un canal' : 'el muro'}. El clasificador local la marcó como ambigua (score 0.5–0.7).\n¿La apruebas para publicación? Responde SOLO con JSON: {"aprobado": true|false, "motivo": "<máx 100 chars>"}`,
        },
      ],
    }],
  });

  try {
    const res = await fetch(url, { method: 'POST', headers, body });
    if (!res.ok) return { aprobado: false, motivo: `Error HTTP Claude ${res.status}` };
    const data = await res.json() as { content: Array<{ type: string; text: string }> };
    const text = data.content?.[0]?.type === 'text' ? data.content[0].text : '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { aprobado: false, motivo: 'Respuesta Claude no parseable' };
    const parsed = JSON.parse(match[0]) as { aprobado: boolean; motivo?: string };
    return { aprobado: parsed.aprobado === true, motivo: parsed.motivo };
  } catch {
    return { aprobado: false, motivo: 'Error de red (Claude)' };
  }
}

async function _llamarGemini(
  imagenBase64: string,
  tipoPublicacion: 'muro' | 'canal',
): Promise<_VeredictDual> {
  if (MODERACION_MOCK) {
    return { aprobado: _escenarioMock <= 1 }; // escenarios 0 y 1 aprueban
  }

  if (!GEMINI_KEY_DEV) return { aprobado: false, motivo: 'Gemini no configurado — clave ausente.' };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent?key=${GEMINI_KEY_DEV}`;
  const body = JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: 'image/jpeg', data: imagenBase64 } },
        {
          text: `Eres moderador de contenido de ELI, red social de periodismo P2P.\nImagen de publicación en ${tipoPublicacion === 'canal' ? 'un canal' : 'el muro'}. El clasificador local la marcó como ambigua.\n¿La apruebas para publicación? Responde SOLO con JSON: {"aprobado": true|false, "motivo": "<máx 100 chars>"}`,
        },
      ],
    }],
    generationConfig: { maxOutputTokens: 128, responseMimeType: 'application/json' },
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) return { aprobado: false, motivo: `Error HTTP Gemini ${res.status}` };
    const data = await res.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { aprobado: false, motivo: 'Respuesta Gemini no parseable' };
    const parsed = JSON.parse(match[0]) as { aprobado: boolean; motivo?: string };
    return { aprobado: parsed.aprobado === true, motivo: parsed.motivo };
  } catch {
    return { aprobado: false, motivo: 'Error de red (Gemini)' };
  }
}

/**
 * Consulta Claude Y Gemini en paralelo y aprueba solo si AMBAS coinciden.
 * Llamar únicamente cuando el clasificador local ya marcó la imagen como "ambigua".
 *
 * Variables de entorno requeridas (sin EXPO_PUBLIC_ si usas proxy):
 *   EXPO_PUBLIC_GEMINI_KEY      — clave Google AI Studio
 *   EXPO_PUBLIC_ANTHROPIC_KEY   — clave Anthropic (dev) o usar proxy
 *   EXPO_PUBLIC_MODERACION_MOCK — "true" para modo simulado (4 escenarios cíclicos)
 */
export async function moderarContenidoAmbiguo(
  imagenBase64: string,
  contexto: { tipoPublicacion: 'muro' | 'canal' },
): Promise<{ aprobado: boolean; motivo?: string }> {
  // Escenario 3 (mock): simular error de red antes de cualquier llamada
  if (MODERACION_MOCK && _escenarioMock === 3) {
    _escenarioMock = (_escenarioMock + 1) % 4;
    return { aprobado: false, motivo: 'Error de red simulado durante la moderación dual-IA' };
  }

  const [resClaude, resGemini] = await Promise.all([
    _llamarClaude(imagenBase64, contexto.tipoPublicacion),
    _llamarGemini(imagenBase64, contexto.tipoPublicacion),
  ]);

  if (MODERACION_MOCK) {
    _escenarioMock = (_escenarioMock + 1) % 4;
  }

  if (resClaude.aprobado && resGemini.aprobado) {
    return { aprobado: true };
  }

  if (!resClaude.aprobado && !resGemini.aprobado) {
    const detalle = [resClaude.motivo, resGemini.motivo].filter(Boolean).join(' | ');
    return {
      aprobado: false,
      motivo: `Ambas IAs rechazaron.${detalle ? ` ${detalle}` : ''}`,
    };
  }

  const rechaza = resClaude.aprobado ? 'Gemini' : 'Claude';
  const motivoRechaza = resClaude.aprobado ? resGemini.motivo : resClaude.motivo;
  return {
    aprobado: false,
    motivo: `Desacuerdo entre IAs — ${rechaza} no aprobó${motivoRechaza ? `: ${motivoRechaza}` : ''}. Pendiente de revisión humana.`,
  };
}

// La apelación siempre pasa por Claude, independientemente del score original.
export async function apelarBloqueo(
  uri: string,
  _usuarioId: string,
  motivo: string,
  contexto: ContextoUsuario = { esPeriodista: false, rolVerificado: null },
): Promise<ResultadoAdultos> {
  const b64 = await leerBase64(uri);
  if (b64 === null) {
    return {
      aprobado: false,
      scoreLocal: 0,
      esPeriodista: contexto.esPeriodista,
      requiereNeblina: false,
      fallbackCPU: false,
      modoSimulado: false,
      fallbackIA: true,
      razonamientoIA: 'No se pudo leer el archivo para la apelación.',
    };
  }

  const ia = await consultarIAContextual(b64, 0, contexto, motivo);
  return {
    aprobado: ia.aprobado,
    scoreLocal: 0,
    esPeriodista: contexto.esPeriodista,
    requiereNeblina: ia.aprobado && ia.requiereNeblina,
    fallbackCPU: false,
    modoSimulado: false,
    fallbackIA: true,
    razonamientoIA: ia.razonamiento,
  };
}
