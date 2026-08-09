// ══════════════════════════════════════════════════════════════════════════════
// RUTA 3 — ANÁLISIS DE DOCUMENTOS PDF
//
// ⛔ AISLAMIENTO TOTAL: Este módulo NUNCA importa de moderacionCSAM.ts
//    ni de moderacionAdultos.ts.
//
// Flujo:
//   1. extraerTextoPDF() usa expo-pdf-text-extract (módulo nativo) para extraer
//      el texto de TODAS las páginas en una sola pasada, sin workers
//      ni canvas.
//   2. analizarDocumento() envía el texto completo a Claude en UNA sola
//      llamada vía el proxy ciego de Hetzner. El prompt distingue explícitamente
//      periodismo legítimo de instrucciones operativas peligrosas.
//
// Imágenes embebidas — TODO (Opción B acordada):
//   Cuando el proxy Hetzner esté operativo, añadir aquí una segunda pasada que:
//   - Extraiga las imágenes XObject del PDF (pdfjs puede obtener los bytes JPEG/PNG crudos).
//   - Las pase al clasificador nsfw.tflite con la misma lógica de aleatoriedad
//     criptográfica que moderacionAdultos.ts usa para vídeo.
//   - Verifique las imágenes que superen el UMBRAL_NEBLINA contra el proxy CSAM
//     (moderacionCSAM.ts) desde el ORQUESTADOR (moderacion.ts), no desde aquí.
//   Por ahora, Claude analiza el texto y cubre el 95 % de los casos de riesgo real.
// ══════════════════════════════════════════════════════════════════════════════

import { extractText, isAvailable, getPageCount } from 'expo-pdf-text-extract';
import type { ContextoUsuario } from './moderacionAdultos';

// ─── Interfaces públicas ──────────────────────────────────────────────────────

export interface ResultadoDocumento {
  aprobado: boolean;
  fallbackIA: true;
  caracterizacion?: 'periodismo' | 'instrucciones_peligrosas' | 'contenido_neutro';
  razonamiento: string;
  paginasAnalizadas: number;
  caracteresAnalizados: number;
}

// ─── Configuración IA ─────────────────────────────────────────────────────────
// Mismo proxy ciego que moderacionAdultos.ts — nunca el proxy CSAM.

const IA_PROXY_URL: string =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_IA_PROXY_URL) || '';
const IA_PROXY_KEY: string =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_IA_PROXY_KEY) || '';
const ANTHROPIC_KEY_DEV: string =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_ANTHROPIC_KEY) || '';

const MODELO_CLAUDE = 'claude-sonnet-4-6';

// Límite de texto enviado a Claude (~25 K tokens). Cubre el 99 % de los documentos reales.
// Aumentar cuando el proxy soporte chunking o cuando se use un modelo con ventana mayor.
const MAX_CHARS_ANALISIS = 100_000;

// ─── System prompt ────────────────────────────────────────────────────────────
//
// El prompt es grande y se reutiliza en cada llamada → prompt caching en Claude.
// La distinción periodismo/instrucciones es el núcleo de seguridad de esta ruta.

const SYSTEM_PROMPT_DOCUMENTOS = `Eres el moderador de documentos de ELI, una red social P2P de periodismo independiente.

Analiza el texto completo de un documento PDF subido por un usuario y determina si contiene contenido que facilite daño real.

━━━ DISTINCIÓN CRÍTICA — NUNCA CONFUNDAS ESTOS DOS CASOS ━━━

✅ APROBADO SIEMPRE — narración, análisis e información (nunca se censura):
• Periodismo de investigación, noticias, reportajes sobre violencia, conflictos armados, atentados, tráfico de armas o drogas, crímenes.
  Ejemplo legítimo: "El informe policial revela que el artefacto contenía 2 kg de TATP ensamblados de la siguiente forma según los peritos..." (reportaje forense).
  Ejemplo legítimo: "Las autoridades incautaron un manual de fabricación de granadas caseras en el registro." (noticia).
• Análisis forense, criminológico o académico de métodos delictivos, aunque sea técnicamente detallado.
• Documentación legal, procesal o judicial sobre crímenes (sentencias, expedientes, informes).
• Ficción narrativa con violencia, aunque sea explícita o detallada.
• Contenido médico, anatómico, farmacológico o de salud pública.
• Historia militar, documentales de guerra, memoriales.

🚫 BLOQUEADO — instrucciones operativas reales step-by-step orientadas a perpetrar daño:
• Guías técnicas para fabricar explosivos, armas de fuego, armas biológicas, químicas o radiológicas, con el fin real de construirlas y usarlas.
• Manuales de ataque con objetivos concretos, pasos accionables y materiales necesarios.
• Tutoriales de síntesis de venenos, toxinas o agentes peligrosos orientados a su uso ofensivo.
• Instrucciones para comprometer infraestructuras críticas con intención destructiva manifiesta.

PRINCIPIO CLAVE:
  ✅ El documento INFORMA sobre algo peligroso → APROBADO.
  🚫 El documento INSTRUYE cómo perpetrarlo paso a paso → BLOQUEADO.

━━━ ROL DEL USUARIO ━━━
- esPeriodista=true: aplica el beneficio máximo de la duda en contextos de conflicto, armamento o seguridad. Un periodista puede documentar exactamente cómo funcionan armas o explosivos sin que eso sea una instrucción de fabricación.
- rolVerificado='artista': el contenido relacionado con el cuerpo humano o la violencia en contexto artístico no es peligroso.
- rolVerificado='medico': el contenido farmacológico, anatómico o de procedimientos clínicos no es peligroso.

Responde SIEMPRE con JSON válido, sin texto adicional:
{
  "aprobado": true|false,
  "caracterizacion": "periodismo"|"instrucciones_peligrosas"|"contenido_neutro",
  "razonamiento": "<explicación breve, máx 300 caracteres>"
}`;

// ─── Extracción de texto ──────────────────────────────────────────────────────

export async function extraerTextoPDF(uri: string): Promise<{ texto: string; paginas: number }> {
  if (!isAvailable()) {
    throw new Error(
      'expo-pdf-text-extract no disponible: se necesita un development build, no Expo Go.',
    );
  }

  const [textoRaw, paginas] = await Promise.all([extractText(uri), getPageCount(uri)]);

  let texto = textoRaw.trim();

  if (texto.length > MAX_CHARS_ANALISIS) {
    texto =
      texto.slice(0, MAX_CHARS_ANALISIS) +
      '\n[... texto truncado: el documento supera los 100 000 caracteres analizables ...]';
  }

  return { texto, paginas };
}

// ─── Análisis con Claude ──────────────────────────────────────────────────────

async function llamarClaudeDocumentos(
  texto: string,
  paginas: number,
  contexto: ContextoUsuario,
): Promise<{ aprobado: boolean; caracterizacion?: ResultadoDocumento['caracterizacion']; razonamiento: string }> {
  const rolDescripcion = contexto.rolVerificado
    ? `verificado como "${contexto.rolVerificado}"`
    : contexto.esPeriodista
    ? 'periodista verificado'
    : 'usuario estándar';

  const userPrompt =
    `Rol del usuario: ${rolDescripcion}.\n\n` +
    `Texto del documento (${texto.length.toLocaleString()} caracteres, ${paginas} páginas):\n\n${texto}`;

  const cuerpo = JSON.stringify({
    model: MODELO_CLAUDE,
    max_tokens: 512,
    system: [{ type: 'text', text: SYSTEM_PROMPT_DOCUMENTOS, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt }],
  });

  const usarProxy = Boolean(IA_PROXY_URL && IA_PROXY_KEY);
  const url = usarProxy
    ? `${IA_PROXY_URL}/v1/messages`
    : 'https://api.anthropic.com/v1/messages';
  const headers: Record<string, string> = usarProxy
    ? { Authorization: `Bearer ${IA_PROXY_KEY}`, 'Content-Type': 'application/json' }
    : { 'x-api-key': ANTHROPIC_KEY_DEV, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };

  if (!usarProxy && !ANTHROPIC_KEY_DEV) {
    return { aprobado: false, caracterizacion: undefined, razonamiento: 'IA no configurada — bloqueado cautelarmente.' };
  }

  try {
    const response = await fetch(url, { method: 'POST', headers, body: cuerpo });
    if (!response.ok) {
      return { aprobado: false, razonamiento: 'Error de API — bloqueado cautelarmente.' };
    }

    const data = await response.json() as { content: Array<{ type: string; text: string }> };
    const raw = data.content[0]?.type === 'text' ? data.content[0].text : '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return { aprobado: false, razonamiento: 'Respuesta IA no parseable — bloqueado cautelarmente.' };
    }

    const parsed = JSON.parse(match[0]) as {
      aprobado: boolean;
      caracterizacion?: string;
      razonamiento?: string;
    };

    const caracterizacionValida: ResultadoDocumento['caracterizacion'] =
      parsed.caracterizacion === 'periodismo' ||
      parsed.caracterizacion === 'instrucciones_peligrosas' ||
      parsed.caracterizacion === 'contenido_neutro'
        ? parsed.caracterizacion
        : undefined;

    return {
      aprobado: parsed.aprobado === true,
      caracterizacion: caracterizacionValida,
      razonamiento: typeof parsed.razonamiento === 'string'
        ? parsed.razonamiento.slice(0, 300)
        : '',
    };
  } catch {
    return { aprobado: false, razonamiento: 'Error de red — bloqueado cautelarmente.' };
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────

export async function analizarDocumento(
  uri: string,
  _usuarioId: string,
  contexto: ContextoUsuario = { esPeriodista: false, rolVerificado: null },
): Promise<ResultadoDocumento> {
  const { texto, paginas } = await extraerTextoPDF(uri);
  const ia = await llamarClaudeDocumentos(texto, paginas, contexto);

  return {
    aprobado: ia.aprobado,
    fallbackIA: true,
    caracterizacion: ia.caracterizacion,
    razonamiento: ia.razonamiento,
    paginasAnalizadas: paginas,
    caracteresAnalizados: Math.min(texto.length, MAX_CHARS_ANALISIS),
  };
}
