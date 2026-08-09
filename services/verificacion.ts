import { obtenerGun } from './gun';
const SALA_VERIFICACION = 'eli-verificacion-v1';

// Simula análisis de IA — en build nativo conectará con TensorFlow Lite
function analizarDocumentoIA(uri: string): Promise<boolean> {
  return new Promise(resolve => setTimeout(() => resolve(true), 1500));
}

export async function solicitarVerificacion(usuario: string, documentoUri: string): Promise<'pendiente' | 'rechazado_ia'> {
  const aprobadoPorIA = await analizarDocumentoIA(documentoUri);
  if (!aprobadoPorIA) return 'rechazado_ia';
  const solicitud = {
    usuario,
    documentoUri,
    timestamp: Date.now(),
    votosPositivos: 0,
    votosNegativos: 0,
    estado: 'pendiente',
    verificado: false,
  };
  obtenerGun().get(SALA_VERIFICACION).get(usuario).put(solicitud);
  return 'pendiente';
}

export function escucharVerificacion(usuario: string, callback: (verificado: boolean, estado: string) => void) {
  obtenerGun().get(SALA_VERIFICACION).get(usuario).on((data: any) => {
    if (data) callback(data.verificado === true, data.estado || 'sin_solicitud');
  });
}

export function obtenerEstadoVerificacion(usuario: string): Promise<{ verificado: boolean, estado: string }> {
  return new Promise(resolve => {
    obtenerGun().get(SALA_VERIFICACION).get(usuario).once((data: any) => {
      if (data) resolve({ verificado: data.verificado === true, estado: data.estado });
      else resolve({ verificado: false, estado: 'sin_solicitud' });
    });
  });
}

export function votarVerificacion(usuarioAVotar: string, votoPositivo: boolean) {
  obtenerGun().get(SALA_VERIFICACION).get(usuarioAVotar).once((data: any) => {
    if (!data) return;
    const positivos = (data.votosPositivos || 0) + (votoPositivo ? 1 : 0);
    const negativos = (data.votosNegativos || 0) + (!votoPositivo ? 1 : 0);
    const verificado = positivos >= 10;
    const estado = verificado ? 'verificado' : 'pendiente';
    obtenerGun().get(SALA_VERIFICACION).get(usuarioAVotar).put({ votosPositivos: positivos, votosNegativos: negativos, verificado, estado });
  });
}
