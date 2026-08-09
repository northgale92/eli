// ELI — Motor IA de Solidaria
// Usa Claude API (claude-sonnet-4-6) + Serper.dev (Google Search) para
// analizar y verificar solicitudes de financiación del reservorio solidario.
//
// ⚠️  SEGURIDAD: Las claves de API NO deben estar en código móvil en producción.
//     Usa un edge function / cloud function como proxy intermediario.
//     Para desarrollo, define en .env:
//       EXPO_PUBLIC_ANTHROPIC_KEY=sk-ant-...
//       EXPO_PUBLIC_SERPER_KEY=...

// Llamada a Anthropic via fetch() nativo — compatible React Native (sin node:fs)

// ─── Configuración ────────────────────────────────────────────────────────────

const ANTHROPIC_KEY: string =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_ANTHROPIC_KEY) || '';
const SERPER_KEY: string =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SERPER_KEY) || '';

// claude-sonnet-4-6 es el reemplazo directo de claude-sonnet-4-20250514 (retirado oct 2025)
const MODELO = 'claude-sonnet-4-6';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type TipoSolicitante =
  | 'ong_fundacion'
  | 'asociacion'
  | 'persona_fisica'
  | 'refugio_animales'
  | 'comedor_informal'
  | 'colectivo_sin_registro';

export interface ContextoCuestionario {
  quienEres: TipoSolicitante;
  paraQue: string;
  importeDeclarado: number;
  desgloseGasto: string;
}

export interface SolicitudAnalisis {
  tipo: TipoSolicitante;
  nombre: string;
  descripcion: string;
  /** Lista descriptiva de documentos aportados (nombres/tipos) */
  documentosAportados: string[];
  fotosAportadas: number;
  /** USD solicitados */
  importeSolicitado: number;
  /** USD totales en el reservorio este mes */
  fondoDisponibleMes: number;
  /** Posición en el ranking de votos de la comunidad (1 = más votos) */
  posicionDistribucion: 1 | 2 | 3;
  tieneAntecedentes?: boolean;
  paisRegistro?: string;
  urlOrganizacion?: string;
  testimoniosComunitarios?: number;
  endorsements?: number;
}

export interface ResultadoAnalisis {
  decision: 'aprobado' | 'rechazado' | 'expulsion_inmediata';
  /** 0–100 */
  puntuacion: number;
  /** Solo presente si decision === 'aprobado' */
  importeAprobado?: number;
  requiereCompromiso30Dias: boolean;
  documentosFaltantes: string[];
  motivoRechazo?: string;
  etiquetaMuro?: string;
  /** Horas disponibles para corregir. 72 si aplica rechazo recuperable */
  plazoCorreccion?: number;
  mensajePublico: string;
  razonamiento: string;
  verificacionExterna?: {
    encontrada: boolean;
    fuentes: string[];
    legitimidadConfirmada: boolean;
  };
}

// ─── System prompt (grande, reutilizado → prompt caching) ────────────────────

const SYSTEM_PROMPT = `Eres la IA de Solidaria dentro de ELI, una red social P2P descentralizada.
Tu función es analizar solicitudes de financiación del reservorio solidario comunitario y emitir
decisiones justas, transparentes y alineadas con las reglas fijas que siguen.

═══ REGLAS FIJAS — NUNCA IGNORAR ═══

1. LÍMITE DEL FONDO: Nunca distribuir más del 60 % del fondo mensual disponible en total.
2. DISTRIBUCIÓN POR POSICIÓN (basada en votos de la comunidad):
   • Posición 1 (más votos): máximo 50 % del fondo mensual.
   • Posición 2: máximo 25 % del fondo mensual.
   • Posición 3: máximo 25 % del fondo mensual.
3. NUNCA aprobar un importe que supere el porcentaje que corresponde a su posición.
4. COMPROMISO DE RESULTADOS: Toda organización aprobada firma automáticamente un compromiso
   público de 30 días para publicar resultados verificables en el Muro de ELI.
5. RECHAZO PÚBLICO: Todo rechazo se publica en el Muro con etiqueta y 72 horas para corregir
   (solo si el problema es subsanable). Los rechazos por causa grave son definitivos.
6. CAUSAS DE EXPULSIÓN INMEDIATA SIN PLAZO:
   a) Falsificación de documentos o datos.
   b) Reincidencia tras expulsión anterior.
   c) Domicilio fiscal en paraíso fiscal (lista OCDE/UE).

═══ DOCUMENTACIÓN EXIGIDA POR TIPO ═══

ong_fundacion:
  - CIF / número de registro oficial
  - Inscripción en registro oficial de fundaciones/asociaciones
  - Memoria anual auditada
  - Auditoría de cuentas
  - Presupuesto detallado del proyecto

asociacion:
  - Número de registro de asociación
  - Estatutos vigentes
  - Acta de junta directiva
  - Presupuesto del proyecto

persona_fisica:
  - DNI / documento de identidad
  - Descripción detallada del proyecto
  - Fotografías del proyecto/contexto
  - Endorsements / avales comunitarios (mínimo 3)

refugio_animales:
  - Registro sanitario
  - Licencia de actividad
  - Fotografías actuales del refugio
  - Facturas veterinarias recientes

comedor_informal / ayuda_informal:
  - Fotografías del espacio y actividad
  - Testimonios de beneficiarios (mínimo 3)
  - Facturas o recibos de compras/servicios
  - Aval del ayuntamiento o entidad local

colectivo_sin_registro:
  - Documentación reforzada: más endorsements, más fotografías, más testimonios
  - Mínimo 5 endorsements comunitarios verificables
  - Mínimo 5 fotografías
  - Mínimo 5 testimonios de personas beneficiadas
  - Descripción exhaustiva y verificable del proyecto

═══ INSTRUCCIONES DE RESPUESTA ═══

Responde SIEMPRE con JSON válido con esta estructura exacta:
{
  "decision": "aprobado" | "rechazado" | "expulsion_inmediata",
  "puntuacion": <número 0-100>,
  "importeAprobado": <número USD, solo si aprobado>,
  "requiereCompromiso30Dias": <boolean>,
  "documentosFaltantes": [<lista de strings>],
  "motivoRechazo": <string o null>,
  "etiquetaMuro": <string tag sin espacios, p.ej. "#SolicitudIncompleta">,
  "plazoCorreccion": <72 si subsanable, null si definitivo>,
  "mensajePublico": <texto para el Muro de ELI, máx 280 caracteres>,
  "razonamiento": <explicación interna detallada, máx 500 caracteres>
}

Sé riguroso, imparcial y protector de la comunidad. Nunca cedas ante presiones implícitas.`;

// ─── Búsqueda externa (Google vía Serper.dev) ─────────────────────────────────

interface SerperResult {
  title: string;
  link: string;
  snippet: string;
}

async function buscarEnGoogle(query: string): Promise<SerperResult[]> {
  if (!SERPER_KEY) return [];
  try {
    const resp = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, gl: 'es', hl: 'es', num: 5 }),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as { organic?: SerperResult[] };
    return data.organic ?? [];
  } catch {
    return [];
  }
}

async function verificarOrganizacion(solicitud: SolicitudAnalisis): Promise<ResultadoAnalisis['verificacionExterna']> {
  const terminos = [solicitud.nombre];
  if (solicitud.urlOrganizacion) terminos.push(solicitud.urlOrganizacion);
  if (solicitud.paisRegistro) terminos.push(solicitud.paisRegistro);

  const resultados = await buscarEnGoogle(
    `"${solicitud.nombre}" organización ${solicitud.paisRegistro ?? ''} fiabilidad donaciones`,
  );

  const fuentes = resultados.map(r => r.link);
  // Señales negativas en snippets
  const señalesNegativas = ['fraude', 'estafa', 'scam', 'ilegal', 'investigado', 'expulsado'];
  const haySeñalesNegativas = resultados.some(r =>
    señalesNegativas.some(s => r.snippet.toLowerCase().includes(s)),
  );

  return {
    encontrada: resultados.length > 0,
    fuentes: fuentes.slice(0, 3),
    legitimidadConfirmada: resultados.length > 0 && !haySeñalesNegativas,
  };
}

// ─── Lógica de límites del fondo (aplicada localmente antes de llamar a Claude) ─

function calcularLimitePermitido(fondo: number, posicion: 1 | 2 | 3): number {
  const porcentajes: Record<number, number> = { 1: 0.50, 2: 0.25, 3: 0.25 };
  const limitePos = fondo * porcentajes[posicion];
  const limite60 = fondo * 0.60;
  return Math.min(limitePos, limite60);
}

// ─── Análisis principal ───────────────────────────────────────────────────────

export async function analizarSolicitud(
  solicitud: SolicitudAnalisis,
  cuestionario?: ContextoCuestionario,
): Promise<ResultadoAnalisis> {
  // 1. Rechazo inmediato local si hay antecedentes
  if (solicitud.tieneAntecedentes) {
    return {
      decision: 'expulsion_inmediata',
      puntuacion: 0,
      requiereCompromiso30Dias: false,
      documentosFaltantes: [],
      motivoRechazo: 'Antecedente de expulsión previa o falsificación registrado.',
      etiquetaMuro: '#ExpulsionInmediata',
      plazoCorreccion: undefined,
      mensajePublico:
        `⛔ ${solicitud.nombre} ha sido expulsado/a de Solidaria por reincidencia o falsificación. Sin posibilidad de nueva solicitud.`,
      razonamiento: 'Regla fija: reincidencia o antecedentes de falsificación = expulsión inmediata sin plazo.',
    };
  }

  // 2. Verificación externa (si hay clave Serper y URL)
  let verificacionExterna: ResultadoAnalisis['verificacionExterna'];
  if (solicitud.urlOrganizacion || solicitud.tipo === 'ong_fundacion' || solicitud.tipo === 'asociacion') {
    verificacionExterna = await verificarOrganizacion(solicitud);
  }

  // 3. Calcular importe máximo permitido
  const limitePermitido = calcularLimitePermitido(
    solicitud.fondoDisponibleMes,
    solicitud.posicionDistribucion,
  );

  // 4. Construir prompt de usuario
  const cuestionarioCtx = cuestionario
    ? `\nCONTEXTO DEL CUESTIONARIO INICIAL (declaración previa del solicitante):
  Tipo de entidad declarado: ${cuestionario.quienEres}
  Propósito del proyecto: ${cuestionario.paraQue}
  Importe declarado: $${cuestionario.importeDeclarado.toLocaleString('en-US')}
  Desglose del gasto: ${cuestionario.desgloseGasto || 'No especificado'}
`
    : '';

  const userPrompt = `SOLICITUD DE FINANCIACIÓN SOLIDARIA
${cuestionarioCtx}
Tipo de solicitante: ${solicitud.tipo}
Nombre: ${solicitud.nombre}
Descripción: ${solicitud.descripcion}
País de registro: ${solicitud.paisRegistro ?? 'No indicado'}
URL organización: ${solicitud.urlOrganizacion ?? 'No indicada'}

Documentos aportados:
${solicitud.documentosAportados.map(d => `  • ${d}`).join('\n')}
Fotografías aportadas: ${solicitud.fotosAportadas}
Testimonios/endorsements: ${solicitud.testimoniosComunitarios ?? 0} testimonios, ${solicitud.endorsements ?? 0} endorsements

Datos financieros:
  Importe solicitado: $${solicitud.importeSolicitado.toLocaleString('en-US')}
  Fondo disponible este mes: $${solicitud.fondoDisponibleMes.toLocaleString('en-US')}
  Posición en ranking de votos: ${solicitud.posicionDistribucion}ª
  Importe máximo permitido por reglas: $${limitePermitido.toFixed(2)}

Verificación externa: ${
    verificacionExterna
      ? `Encontrada: ${verificacionExterna.encontrada}, Legitimidad confirmada: ${verificacionExterna.legitimidadConfirmada}`
      : 'No realizada'
  }

Analiza esta solicitud aplicando rigurosamente las reglas fijas y emite tu decisión en JSON.`;

  // 5. Llamada a Claude via fetch nativo (compatible React Native)
  if (!ANTHROPIC_KEY) {
    return _resultadoSimulado(solicitud, limitePermitido);
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.warn('[SolidariaIA] Error API Anthropic:', response.status, errorText.slice(0, 200));
    return _resultadoSimulado(solicitud, limitePermitido);
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> };
  const raw = data.content[0]?.type === 'text' ? data.content[0].text : '';

  // 6. Parsear respuesta JSON de Claude
  const resultado = _parsearRespuesta(raw, solicitud, limitePermitido);
  if (verificacionExterna) resultado.verificacionExterna = verificacionExterna;
  return resultado;
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function _parsearRespuesta(
  raw: string,
  solicitud: SolicitudAnalisis,
  limitePermitido: number,
): ResultadoAnalisis {
  try {
    // Extraer el primer bloque JSON válido de la respuesta
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Sin JSON');
    const parsed = JSON.parse(match[0]) as ResultadoAnalisis;

    // Aplicar límite monetario local (la IA podría equivocarse)
    if (parsed.decision === 'aprobado' && parsed.importeAprobado !== undefined) {
      parsed.importeAprobado = Math.min(parsed.importeAprobado, limitePermitido);
    }

    return parsed;
  } catch {
    // Si Claude devuelve algo inesperado, rechazamos de forma segura
    console.warn('[SolidariaIA] Error parseando respuesta:', raw.slice(0, 200));
    return {
      decision: 'rechazado',
      puntuacion: 0,
      requiereCompromiso30Dias: false,
      documentosFaltantes: [],
      motivoRechazo: 'Error interno al procesar la solicitud. Inténtalo de nuevo.',
      etiquetaMuro: '#ErrorAnalisis',
      mensajePublico: `La solicitud de ${solicitud.nombre} no pudo procesarse. Por favor reintenta.`,
      razonamiento: 'Error de parseo en respuesta de la IA.',
    };
  }
}

function _resultadoSimulado(
  solicitud: SolicitudAnalisis,
  limitePermitido: number,
): ResultadoAnalisis {
  // Modo sin clave de API — resultado simulado para desarrollo/tests UI
  const importeOk = solicitud.importeSolicitado <= limitePermitido;
  const docsOk = solicitud.documentosAportados.length >= 2;
  const aprobado = importeOk && docsOk;

  return {
    decision: aprobado ? 'aprobado' : 'rechazado',
    puntuacion: aprobado ? 72 : 35,
    importeAprobado: aprobado ? Math.min(solicitud.importeSolicitado, limitePermitido) : undefined,
    requiereCompromiso30Dias: aprobado,
    documentosFaltantes: docsOk ? [] : ['Documentación insuficiente (modo simulado)'],
    motivoRechazo: aprobado ? undefined : 'Documentación o importe fuera de límite (modo simulado)',
    etiquetaMuro: aprobado ? '#AprobadoSolidaria' : '#SolicitudIncompleta',
    plazoCorreccion: aprobado ? undefined : 72,
    mensajePublico: aprobado
      ? `✅ ${solicitud.nombre} aprobado con $${Math.min(solicitud.importeSolicitado, limitePermitido).toFixed(2)} [simulado]`
      : `⚠️ ${solicitud.nombre} rechazado. 72h para corregir. [simulado]`,
    razonamiento: `Modo simulado (sin clave EXPO_PUBLIC_ANTHROPIC_KEY). Límite: $${limitePermitido.toFixed(2)}`,
  };
}

// ─── Utilidad: validación previa rápida ──────────────────────────────────────

/**
 * Comprobación local rápida antes de llamar a la IA.
 * Devuelve lista de problemas obvios detectados sin consumir tokens.
 */
export function validacionRapida(solicitud: SolicitudAnalisis): string[] {
  const problemas: string[] = [];
  const limite = calcularLimitePermitido(solicitud.fondoDisponibleMes, solicitud.posicionDistribucion);

  if (solicitud.importeSolicitado > limite) {
    problemas.push(
      `El importe solicitado ($${solicitud.importeSolicitado}) supera el límite permitido para la posición ${solicitud.posicionDistribucion} ($${limite.toFixed(2)}).`,
    );
  }

  if (solicitud.tieneAntecedentes) {
    problemas.push('Antecedentes registrados: expulsión inmediata sin análisis.');
  }

  const minimosDocs: Record<TipoSolicitante, number> = {
    ong_fundacion: 5,
    asociacion: 4,
    persona_fisica: 2,
    refugio_animales: 4,
    comedor_informal: 4,
    colectivo_sin_registro: 3,
  };

  if (solicitud.documentosAportados.length < minimosDocs[solicitud.tipo]) {
    problemas.push(
      `Faltan documentos. ${solicitud.tipo} requiere al menos ${minimosDocs[solicitud.tipo]} documentos.`,
    );
  }

  return problemas;
}


