import { obtenerUsuario } from './identidad';
import { obtenerGun } from './gun';

const SALA_REPORTES = 'eli-reportes-v1';

export type MotivoReporte =
  | 'pornografia'
  | 'drogas'
  | 'armas'
  | 'menores'
  | 'violencia'
  | 'spam'
  | 'desinformacion'
  | 'otro';

export const MOTIVOS: { id: MotivoReporte; label: string }[] = [
  { id: 'pornografia', label: 'Contenido sexual explícito' },
  { id: 'drogas', label: 'Venta o promoción de drogas' },
  { id: 'armas', label: 'Venta o promoción de armas' },
  { id: 'menores', label: 'Daño a menores' },
  { id: 'violencia', label: 'Violencia o amenazas' },
  { id: 'spam', label: 'Spam o publicidad no deseada' },
  { id: 'desinformacion', label: 'Desinformación' },
  { id: 'otro', label: 'Otro motivo' },
];

export async function enviarReporte(
  contenidoId: string,
  tipo: 'publicacion' | 'comentario' | 'canal' | 'usuario',
  motivo: MotivoReporte,
  descripcion: string = ''
) {
  const reportador = await obtenerUsuario();
  const reporte = {
    id: Math.random().toString(36).substr(2, 9),
    contenidoId,
    tipo,
    motivo,
    descripcion,
    reportador: reportador || 'anonimo',
    timestamp: Date.now(),
    estado: 'pendiente',
  };
  obtenerGun().get(SALA_REPORTES).get(reporte.id).put(reporte);
  return reporte.id;
}
