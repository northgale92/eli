// ══════════════════════════════════════════════════════════════════════════════
// ORQUESTADOR DE MODERACIÓN
//
// Punto de entrada único para todos los callers externos.
// Coordina las tres rutas de moderación:
//
//   Ruta 1 → moderacionCSAM.ts       (hash matching — solo imagen/vídeo)
//   Ruta 2 → moderacionAdultos.ts    (TFLite + IA contextual — solo imagen/vídeo)
//   Ruta 3 → moderacionDocumentos.ts (extracción PDF + Claude — solo documento)
//
// Dependencia en un solo sentido:
//   moderacion.ts  →  moderacionCSAM.ts
//   moderacion.ts  →  moderacionAdultos.ts
//   moderacion.ts  →  moderacionDocumentos.ts
//
// Los módulos de ruta NUNCA se importan entre sí ni importan este orquestador.
//
// ⛔ ORDEN ESTRICTO (imagen/vídeo): La verificación CSAM siempre ocurre ANTES
//    que el análisis de contenido adulto. Si cualquiera de las dos barreras
//    CSAM falla (bloqueadoPor='error'), se bloquea cautelarmente: el usuario
//    puede reintentar. NUNCA se pasa contenido sin verificar CSAM al análisis
//    de adultos.
//
// ⛔ CSAM HASH MATCHING no aplica a PDFs: el hash perceptual está diseñado
//    para imágenes/vídeo; los binarios PDF no son comparables. El análisis de
//    texto con Claude es la verificación completa para la ruta documento.
// ══════════════════════════════════════════════════════════════════════════════

import { moderarCSAM, ejecutarBloqueoCSAM } from './moderacionCSAM';
import {
  analizarImagen as _analizarImagen,
  analizarFramesVideo as _analizarFramesVideo,
  apelarBloqueo as _apelarBloqueo,
  precalentarModelo as _precalentarModelo,
  type ResultadoAdultos,
  type ContextoUsuario,
} from './moderacionAdultos';
import { analizarDocumento as _analizarDocumento, type ResultadoDocumento } from './moderacionDocumentos';

console.warn('ELI-DEBUG: moderacion.ts cargado');

// Re-exportar tipos y precalentamiento para que los callers no necesiten
// importar directamente de los módulos internos.
export type { ResultadoAdultos, ContextoUsuario, ResultadoDocumento };
export { _precalentarModelo as precalentarModelo };

// ─── Tipos del orquestador ────────────────────────────────────────────────────

export type TipoContenido = 'imagen' | 'video' | 'documento';

export type MotivoBloqueo =
  | 'csam_confirmado'                // hash matching confirma coincidencia → bloqueo permanente, cuenta suspendida, reporte NCMEC
  | 'csam_clasificador_local'        // barrera 1 (heurística local) marca contenido → bloqueo cautelar de esta subida, sin ban permanente
  | 'csam_verificacion_fallida'      // error en cualquiera de las dos barreras → bloqueo cautelar (fail-closed), reintentar más tarde
  | 'contenido_adulto'               // clasificador local o IA → apelable
  | 'contenido_peligroso_documento'; // Claude detectó instrucciones operativas peligrosas

export interface ResultadoOrquestador {
  aprobado: boolean;
  motivoBloqueo?: MotivoBloqueo;
  adultos?: ResultadoAdultos;     // presente cuando la verificación CSAM fue superada (imagen/vídeo)
  documento?: ResultadoDocumento; // presente cuando el análisis de documento completó
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function moderarContenido(
  uri: string,
  usuarioId: string,
  tipo: TipoContenido,
  duracionMs?: number,
  contexto: ContextoUsuario = { esPeriodista: false, rolVerificado: null },
): Promise<ResultadoOrquestador> {

  // ── Documentos: ruta independiente (sin verificación CSAM) ───────────────
  // El hash perceptual CSAM está diseñado para imágenes/vídeos, no para
  // binarios PDF. El análisis de texto con Claude es la verificación completa.
  if (tipo === 'documento') {
    const documento = await _analizarDocumento(uri, usuarioId, contexto);
    if (!documento.aprobado) {
      return { aprobado: false, motivoBloqueo: 'contenido_peligroso_documento', documento };
    }
    return { aprobado: true, documento };
  }

  // ── Imágenes y vídeos: verificación CSAM primero (dos barreras) ───────────
  const csam = await moderarCSAM(uri);

  if (!csam.aprobado) {
    if (csam.bloqueadoPor === 'hash_matching') {
      // Coincidencia confirmada contra BD de hashes conocidos → bloqueo
      // permanente e inapelable (ban + reporte NCMEC).
      await ejecutarBloqueoCSAM(usuarioId, uri);
      return { aprobado: false, motivoBloqueo: 'csam_confirmado' };
    }
    if (csam.bloqueadoPor === 'clasificador') {
      // Heurística local, no es un match confirmado → se bloquea esta
      // subida, pero NO se activa el ban permanente ni el reporte NCMEC.
      return { aprobado: false, motivoBloqueo: 'csam_clasificador_local' };
    }
    // bloqueadoPor === 'error' → fail-closed: no pasar a análisis adultos
    return { aprobado: false, motivoBloqueo: 'csam_verificacion_fallida' };
  }

  // ── Análisis de contenido adulto ──────────────────────────────────────────
  // Solo se llega aquí cuando CSAM fue verificado y el resultado fue negativo.
  const adultos = tipo === 'imagen'
    ? await _analizarImagen(uri, usuarioId, contexto)
    : await _analizarFramesVideo(uri, duracionMs ?? 60000, usuarioId, contexto);

  if (!adultos.aprobado) {
    return { aprobado: false, motivoBloqueo: 'contenido_adulto', adultos };
  }

  return { aprobado: true, adultos };
}

// ─── Apelación ────────────────────────────────────────────────────────────────
// Solo aplicable a bloqueos por 'contenido_adulto'. Los bloqueos CSAM y de
// documentos peligrosos no son apelables vía esta ruta.

export async function apelarBloqueo(
  uri: string,
  usuarioId: string,
  motivo: string,
  contexto?: ContextoUsuario,
): Promise<ResultadoAdultos> {
  return _apelarBloqueo(uri, usuarioId, motivo, contexto);
}
