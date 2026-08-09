// ══════════════════════════════════════════════════════════════════════════════
// RUTA 1 — DETECCIÓN DE CSAM (material de abuso sexual infantil conocido)
//
// ⛔ AISLAMIENTO TOTAL: Este módulo NUNCA importa de moderacionAdultos.ts ni
//    llama a ninguna API de IA generativa (Claude, Gemini, GPT, etc.) — ni
//    siquiera para contenido ambiguo. No existe una salida "ambiguo" en esta
//    ruta: cualquier señal de alerta de cualquiera de las dos barreras es
//    bloqueo inmediato, dentro de este mismo módulo.
//
// ⛔ POR QUÉ ESTÁ PROHIBIDA LA IA GENERATIVA EN ESTA RUTA:
//    Enviar material de abuso sexual infantil conocido a las APIs de Claude
//    (Anthropic ToS §4 — Prohibited Uses) o Gemini (Google Cloud AUP) está
//    terminantemente prohibido y constituye un delito en la mayoría de
//    jurisdicciones: 18 U.S.C. § 2256 (EE.UU.), Directiva 2011/93/UE,
//    Ley Orgánica 10/1995 art. 189 (España), entre otras.
//
//    El bloqueo aquí es automático, inmediato e inapelable. Nunca pasa por
//    revisión humana ni por ningún modelo de lenguaje. Solo ejecución.
//
// ⛔ FAIL-CLOSED: cualquier error (red, timeout, fallo del clasificador) se
//    trata como bloqueo. Nunca se aprueba por defecto ante un error.
//
// ⛔ Ningún humano del equipo visualiza contenido rechazado por esta ruta,
//    ni en logs ni en cola de revisión. Los logs de este módulo solo
//    registran el resultado (aprobado/bloqueado) y los primeros 8 caracteres
//    del hash del contenido — nunca el contenido en sí.
//
// ⚠️ LIMITACIÓN ARQUITECTÓNICA CONFIRMADA (hash-matching = Cloudflare CSAM
//    Scanning Tool): Cloudflare escanea el contenido que se sirve a través
//    de su caché/CDN (dominio en "nube naranja" — proxied). Actúa en el
//    momento en que el contenido SE SIRVE, no en el instante en que se
//    sube. No existe ningún endpoint público de Cloudflare para consultar
//    de forma síncrona "¿este hash coincide?" antes de aceptar una subida.
//
//    Por lo tanto, el hash-matching de Cloudflare NO es un gate previo a
//    la propagación del contenido: es una capa reactiva adicional que
//    opera sobre el servidor ciego después de que el archivo ya fue
//    aceptado y cacheado. El clasificador on-device (Barrera 1, más abajo)
//    sigue siendo la ÚNICA barrera real antes de que el contenido llegue
//    al servidor. Ver también SECURITY.md.
// ══════════════════════════════════════════════════════════════════════════════

// ─── Configuración de Cloudflare CSAM Scanning Tool (capa reactiva post-caché) ─
//
// A diferencia de un proxy de hash-matching síncrono, la Cloudflare CSAM
// Scanning Tool no se "llama" desde código: se activa a nivel de zona/dominio
// en el dashboard de Cloudflare y actúa automáticamente sobre el tráfico que
// pasa por su CDN. No hay SDK, API key ni endpoint que integrar aquí.
//
// Pasos manuales que quedan FUERA del código (no automatizables desde ELI):
//   1. DNS del dominio que sirve contenido de usuarios → registro en modo
//      "Proxied" (nube naranja) en el dashboard de Cloudflare. Si el registro
//      está en modo "DNS only" (nube gris), Cloudflare no ve el tráfico y la
//      herramienta no puede escanear nada.
//   2. Dashboard → [zona] → Caching → Configuration → activar el toggle
//      "CSAM Scanning Tool".
//   3. Configurar el email de notificación de coincidencias en esa misma
//      pantalla (el que reciba las alertas de moderación del proyecto).
//   4. Cuando Cloudflare encuentra una coincidencia, reporta directamente a
//      NCMEC (es reportante obligatorio) y notifica al email de arriba.
//      ELI no recibe ni procesa ese evento de vuelta — no existe hoy un
//      webhook/pipeline que traduzca esa notificación en una acción sobre
//      la cuenta del usuario. Ese enlace es trabajo futuro, no cubierto por
//      este archivo.
//
// Referencia: https://www.missingkids.org/gethelpnow/cybertipline (reporte obligatorio)

// ─── Bloqueo inmediato (llamado por el orquestador) ──────────────────────────
//
// Sin apelación. Sin revisión humana. Sin IA. Solo ejecución.

export async function ejecutarBloqueoCSAM(
  usuarioId: string,
  archivoId: string,
): Promise<void> {
  // TODO: Conectar con el sistema de expulsiones documentado en la bitácora:
  //   1. Marcar usuario como bloqueado permanentemente en Gun.js.
  //   2. Eliminar el archivo de todo almacenamiento local y de red.
  //   3. Registrar incidente sin guardar el contenido
  //      (solo metadatos: fecha, hash, usuarioId — nunca el archivo).
  //   4. Reporte automático a NCMEC CyberTipline
  //      (mandatorio en EE.UU. para plataformas — 18 U.S.C. § 2258A).
  console.error(
    `[CSAM] BLOQUEO INMEDIATO E INAPELABLE — usuarioId=${usuarioId} archivoId=${archivoId}`,
  );
}

// ─── Moderación local de dos barreras (mock) ─────────────────────────────────
//
// moderarCSAM ejecuta, en secuencia, las dos barreras del diseño cerrado:
//   1. Clasificador local nsfw.tflite (pre-filtro on-device, síncrono, real
//      barrera antes de aceptar la subida).
//   2. Hash matching — conceptualmente cubierto por la Cloudflare CSAM
//      Scanning Tool, pero (ver cabecera del archivo) esa herramienta actúa
//      post-caché sobre el servidor ciego, no como una llamada síncrona
//      previa a la subida. Esta barrera 2 sigue mockeada porque no existe
//      ningún backend que pueda responder "¿coincide?" en el momento cero:
//      Cloudflare no ofrece ese endpoint.
//
// La barrera 1 llega en agosto (modelo CSAM-específico). La barrera 2 no
// tiene fecha de "implementación real" porque no es implementable como gate
// síncrono — Cloudflare ya está decidido y configurado (ver sección de
// configuración más arriba) como capa reactiva adicional, no como reemplazo
// de este mock.
//
// Comportamiento gateado por EXPO_PUBLIC_MODERACION_MOCK:
//   · "true"      → los 3 escenarios deterministas de prueba (ver más abajo).
//   · cualquier otro valor (incluido producción sin configurar) → bloqueo
//     incondicional. No existe ningún backend síncrono real para la barrera
//     2, así que no hay base para aprobar nada solo con la barrera 1.
//
// Comportamiento (sin excepciones):
//   · Clasificador marca contenido        → bloqueado inmediato e inapelable.
//   · Hash matching encuentra coincidencia → bloqueado inmediato e inapelable.
//   · Cualquier error (red/timeout/fallo del clasificador) → bloqueado
//     (fail-closed: nunca se aprueba por defecto ante un error).
//   · Ambas barreras limpias               → aprobado.
//
// No hay salida "ambiguo": esta ruta jamás escala a moderacionAdultos.ts ni
// a ninguna IA generativa.

export interface ResultadoModeracionCSAM {
  aprobado: boolean;
  bloqueadoPor?: 'clasificador' | 'hash_matching' | 'error';
}

const MODERACION_MOCK: boolean =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_MODERACION_MOCK) === 'true';

/** Sentinela de prueba: fuerza la rama de error para verificar fail-closed. */
export const CONTENIDO_SIMULAR_ERROR_CSAM = '__SIMULAR_ERROR_CSAM__';

// Cicla 0-2. Escenarios:
//   0 — clasificador limpio + hash limpio   → aprobado
//   1 — clasificador marca                  → bloqueado inmediato
//   2 — hash matching positivo              → bloqueado inmediato
let _escenarioMockCSAM: 0 | 1 | 2 = 0;

/** Solo para pruebas — no llamar en producción. */
export function resetarEscenarioMockCSAM(): void {
  _escenarioMockCSAM = 0;
}

// Hash corto (FNV-1a de 32 bits → 8 caracteres hex) solo para logging.
// Nunca es el pHash real ni se envía a ningún sitio; identifica el contenido
// en los logs sin exponerlo.
function _hashCorto(contenido: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < contenido.length; i++) {
    hash ^= contenido.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ── Barrera 1: clasificador local (mock) ──────────────────────────────────────
//
// TODO (BLOQUEANTE ANTES DE LANZAMIENTO PÚBLICO):
//   El modelo nsfw.tflite (GantMan) clasifica contenido adulto genérico y NO
//   está entrenado para CSAM. Para esta barrera se necesita un modelo
//   CSAM-específico (p. ej. Thorn Safer Detection o equivalente aprobado por
//   NCMEC), integrado vía react-native-fast-tflite, reemplazando este mock.

async function _clasificadorLocalMock(escenario: 0 | 1 | 2): Promise<boolean> {
  // true = contenido marcado como sospechoso; false = limpio.
  return escenario === 1;
}

// ── Barrera 2: hash matching (mock) ───────────────────────────────────────────
//
// La implementación real de hash-matching YA ESTÁ DECIDIDA: Cloudflare CSAM
// Scanning Tool (no es un proveedor pendiente de decidir). Lo que queda
// pendiente no es "quién", sino que Cloudflare no expone una llamada
// síncrona invocable desde aquí — actúa post-caché sobre el servidor ciego
// (ver cabecera del archivo y la sección de configuración más arriba).
//
// Por eso esta función se queda como mock indefinidamente: no hay contrato
// HTTP real que implementar en su lugar. Si en el futuro se añade un
// pipeline que reciba las notificaciones de coincidencia de Cloudflare
// (email/webhook) y las traduzca en una acción sobre la cuenta del usuario,
// ese pipeline vive fuera de este archivo — moderarCSAM seguirá sin poder
// bloquear una subida en base a él, porque para cuando Cloudflare detecta
// la coincidencia el archivo ya se sirvió al menos una vez.

async function _hashMatchingMock(escenario: 0 | 1 | 2): Promise<boolean> {
  // true = coincidencia con hash conocido; false = sin coincidencia.
  return escenario === 2;
}

/**
 * Ejecuta las dos barreras de la ruta CSAM en secuencia y devuelve un
 * resultado determinista. Nunca lanza: cualquier error interno se captura y
 * se traduce en bloqueo (fail-closed).
 *
 * Solo registra en log el resultado (aprobado/bloqueado) y los primeros 8
 * caracteres del hash del contenido — nunca el contenido en sí.
 */
export async function moderarCSAM(contenido: string): Promise<ResultadoModeracionCSAM> {
  const hashPrefix = _hashCorto(contenido);

  if (!MODERACION_MOCK) {
    // TODO (BLOQUEANTE ANTES DE LANZAMIENTO PÚBLICO — agosto):
    //   Reemplazar el mock de la barrera 1 por la inferencia real con el
    //   modelo CSAM-específico (ver TODO en _clasificadorLocalMock).
    //   La barrera 2 (hash matching) NO tiene un reemplazo síncrono
    //   pendiente: Cloudflare CSAM Scanning Tool ya está configurado (ver
    //   cabecera del archivo) pero opera post-caché, no como gate previo a
    //   la subida. Hasta que exista el modelo CSAM-específico, sin
    //   EXPO_PUBLIC_MODERACION_MOCK=true no hay ningún backend síncrono
    //   real: se bloquea siempre.
    console.error(`[CSAM] bloqueado motivo=sin_implementar hash=${hashPrefix} (fail-closed)`);
    return { aprobado: false, bloqueadoPor: 'error' };
  }

  try {
    if (contenido === CONTENIDO_SIMULAR_ERROR_CSAM) {
      throw new Error('Fallo simulado (red/timeout/clasificador) — prueba de fail-closed');
    }

    const escenario = _escenarioMockCSAM;
    _escenarioMockCSAM = ((escenario + 1) % 3) as 0 | 1 | 2;

    // Barrera 1
    const marcadoPorClasificador = await _clasificadorLocalMock(escenario);
    if (marcadoPorClasificador) {
      console.error(`[CSAM] bloqueado motivo=clasificador hash=${hashPrefix}`);
      return { aprobado: false, bloqueadoPor: 'clasificador' };
    }

    // Barrera 2
    const coincideHash = await _hashMatchingMock(escenario);
    if (coincideHash) {
      console.error(`[CSAM] bloqueado motivo=hash_matching hash=${hashPrefix}`);
      return { aprobado: false, bloqueadoPor: 'hash_matching' };
    }

    console.log(`[CSAM] aprobado hash=${hashPrefix}`);
    return { aprobado: true };
  } catch {
    console.error(`[CSAM] bloqueado motivo=error hash=${hashPrefix} (fail-closed)`);
    return { aprobado: false, bloqueadoPor: 'error' };
  }
}
