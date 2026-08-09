import { analizarSolicitud, type TipoSolicitante, type ResultadoAnalisis, type ContextoCuestionario } from './solidaria-ia';
import { obtenerGun } from './gun';

const SALA_PROYECTOS = 'eli-solidaria-proyectos-v1';
const SALA_ONGS = 'eli-solidaria-ongs-v1';
const SALA_VOTOS = 'eli-solidaria-votos-v1';

export type { TipoSolicitante, ResultadoAnalisis, ContextoCuestionario };

// ── REGISTRO DE ONGs ──
export async function registrarONG(
  nombre: string,
  descripcion: string,
  fotos: string[],
  documentos: string[],
  usuario: string,
  tipo: TipoSolicitante = 'ong_fundacion',
  importeSolicitado: number = 0,
  fondoDisponibleMes: number = 5000,
  cuestionario?: ContextoCuestionario,
): Promise<{ estado: 'pendiente_comunidad' | 'rechazado_ia' | 'expulsion'; resultadoIA: ResultadoAnalisis }> {
  const resultadoIA = await analizarSolicitud({
    tipo,
    nombre,
    descripcion,
    documentosAportados: documentos.length > 0 ? documentos : fotos.map((_, i) => `Foto ${i + 1}`),
    fotosAportadas: fotos.length,
    importeSolicitado: importeSolicitado || 0,
    fondoDisponibleMes,
    posicionDistribucion: 3,
  }, cuestionario);

  if (resultadoIA.decision === 'expulsion_inmediata') {
    return { estado: 'expulsion', resultadoIA };
  }
  if (resultadoIA.decision === 'rechazado') {
    return { estado: 'rechazado_ia', resultadoIA };
  }

  const ong = {
    id: Math.random().toString(36).substr(2, 9),
    nombre,
    descripcion,
    fotos: fotos[0] || null,
    documentos: documentos[0] || null,
    usuario,
    timestamp: Date.now(),
    estado: 'pendiente_comunidad',
    aprobadaIA: true,
    aprobadaComunidad: false,
    votosComunidad: 0,
  };

  obtenerGun().get(SALA_ONGS).get(ong.id).put(ong);
  return { estado: 'pendiente_comunidad' as const, resultadoIA };
}

export function escucharONGsPendientes(callback: (ong: any) => void) {
  obtenerGun().get(SALA_ONGS).map().on((data: any) => {
    if (data && data.estado === 'pendiente_comunidad') callback(data);
  });
}

export function votarONG(ongId: string, usuarioVotante: string) {
  obtenerGun().get(SALA_ONGS).get(ongId).once((data: any) => {
    if (!data) return;
    const votos = (data.votosComunidad || 0) + 1;
    const aprobada = votos >= 5;
    obtenerGun().get(SALA_ONGS).get(ongId).put({
      votosComunidad: votos,
      aprobadaComunidad: aprobada,
      estado: aprobada ? 'verificada' : 'pendiente_comunidad',
    });
  });
}

// ── PROYECTOS SOLIDARIOS ──
export function escucharProyectos(callback: (proyecto: any) => void) {
  obtenerGun().get(SALA_PROYECTOS).map().on((data: any) => {
    if (data && data.nombre) callback(data);
  });
}

export function votar(proyectoId: string, usuarioVotante: string) {
  const votoKey = `${proyectoId}_${usuarioVotante}`;
  obtenerGun().get(SALA_VOTOS).get(votoKey).once((yaVoto: any) => {
    if (yaVoto) return;
    obtenerGun().get(SALA_VOTOS).get(votoKey).put({ votado: true, timestamp: Date.now() });
    obtenerGun().get(SALA_PROYECTOS).get(proyectoId).once((data: any) => {
      if (!data) return;
      obtenerGun().get(SALA_PROYECTOS).get(proyectoId).put({ votos: (data.votos || 0) + 1 });
    });
  });
}

export function publicarProyecto(proyecto: {
  nombre: string;
  organizacion: string;
  descripcion: string;
  ongId: string;
}) {
  const p = {
    id: Math.random().toString(36).substr(2, 9),
    ...proyecto,
    votos: 0,
    timestamp: Date.now(),
    estado: 'activo',
    verificado: true,
  };
  obtenerGun().get(SALA_PROYECTOS).get(p.id).put(p);
}
