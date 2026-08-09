import { obtenerGun } from './gun';

// ══════════════════════════════════════════════════════════════════════════════
// COMENTARIOS — contenido público (Muro y Canales), sin cifrado E2E: cualquiera
// que vea la publicación puede ver sus comentarios, igual que el resto de
// contenido de esos dos espacios.
//
// NUNCA pasa por moderarContenido()/moderacionCSAM.ts: son solo texto, y el
// proyecto no tiene hoy ningún filtro de moderación de contenido para texto
// plano público (ver la nota de cabecera de services/canales.ts — una
// publicación de solo texto tampoco pasa por moderación). Al mostrarlos se
// aplica el mismo saneado de enlaces que ya usa Canal (sanitizarEnlaces en
// services/canales.ts), por coherencia — no es un filtro nuevo.
// ══════════════════════════════════════════════════════════════════════════════

const SALA_COMENTARIOS = 'eli-comentarios-v1';

export interface Comentario {
  id: string;
  usuario: string;
  texto: string;
  timestamp: number;
}

// `contexto` distingue de qué espacio cuelga pubId ('muro' o `canal_<id>`).
// pubId ya es casi único por sí solo (9 caracteres base36 aleatorios), pero
// combinarlo con el contexto elimina cualquier ambigüedad entre una
// publicación de Muro y una de Canal que coincidieran de id.
function nodoComentarios(contexto: string, pubId: string) {
  return obtenerGun().get(SALA_COMENTARIOS).get(`${contexto}_${pubId}`);
}

export function publicarComentario(contexto: string, pubId: string, usuario: string, texto: string): void {
  const id = `${usuario}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  nodoComentarios(contexto, pubId).get(id).put({ id, usuario, texto, timestamp: Date.now() });
}

export function escucharComentarios(
  contexto: string,
  pubId: string,
  callback: (comentario: Comentario) => void,
): () => void {
  const nodo = nodoComentarios(contexto, pubId);
  nodo.map().on((data: any) => {
    if (data && data.id && data.texto) callback(data);
  });
  return () => nodo.map().off();
}

export function eliminarComentario(contexto: string, pubId: string, comentarioId: string): void {
  nodoComentarios(contexto, pubId).get(comentarioId).put(null);
}
