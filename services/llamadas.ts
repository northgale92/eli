import { Audio } from 'expo-av';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';
import { obtenerGun } from './gun';

console.warn('ELI-DEBUG: llamadas.ts cargado');

// TODO: añadir servidor TURN propio antes de producción
// (iceTransportPolicy: 'relay' para forzar uso exclusivo de TURN y ocultar IPs reales)
const CONFIGURACION_ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

let pc: any = null;
let streamLocal: any = null;
let sesionActual: { miPubKey: string; destinatarioPubKey: string; sesionId: string } | null = null;
let cancelarSuscripcionSesion: (() => void) | null = null;

function idSesion(a: string, b: string): string {
  return [a, b].sort().join('--');
}

function esperarIceCompleto(conn: any): Promise<string> {
  return new Promise((resolve) => {
    if (conn.iceGatheringState === 'complete') {
      resolve(conn.localDescription?.sdp ?? '');
      return;
    }
    conn.onicegatheringstatechange = () => {
      if (conn.iceGatheringState === 'complete') {
        resolve(conn.localDescription?.sdp ?? '');
      }
    };
    // Fallback: si el gathering tarda >5s mandamos el SDP que tengamos
    setTimeout(() => resolve(conn.localDescription?.sdp ?? ''), 5000);
  });
}

async function pedirPermisoMicrofono(): Promise<void> {
  const { granted } = await Audio.requestPermissionsAsync();
  if (!granted) throw new Error('Permiso de micrófono denegado');
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });
}

export async function iniciarLlamada(
  miPubKey: string,
  destinatarioPubKey: string,
  onActiva: () => void,
  onColgarRemoto: () => void,
): Promise<void> {
  await pedirPermisoMicrofono();

  pc = new RTCPeerConnection(CONFIGURACION_ICE);
  streamLocal = await mediaDevices.getUserMedia({ audio: true, video: false });
  (streamLocal.getTracks() as any[]).forEach((t: any) => pc.addTrack(t, streamLocal));

  const oferta = await pc.createOffer({});
  await pc.setLocalDescription(oferta);
  const sdp = await esperarIceCompleto(pc);

  const sesId = idSesion(miPubKey, destinatarioPubKey);
  sesionActual = { miPubKey, destinatarioPubKey, sesionId: sesId };

  const gun = obtenerGun();

  gun.get('eli-llamadas-v1').get('sesion').get(sesId).put({
    de: miPubKey,
    para: destinatarioPubKey,
    oferta: sdp,
    estado: 'llamando',
    ts: Date.now(),
  });

  gun.get('eli-llamadas-v1').get('entrante').get(destinatarioPubKey).put({
    de: miPubKey,
    sesionId: sesId,
    ts: Date.now(),
  });

  const nodoSesion = gun.get('eli-llamadas-v1').get('sesion').get(sesId);
  nodoSesion.on((data: any) => {
    if (!data) return;
    if (data.respuesta && pc?.signalingState === 'have-local-offer') {
      pc.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp: data.respuesta }),
      )
        .then(() => onActiva())
        .catch(() => {});
    }
    if (data.estado === 'colgada' && data.colgadoPor !== miPubKey) {
      onColgarRemoto();
    }
  });
  cancelarSuscripcionSesion = () => nodoSesion.off();
}

export function escucharLlamadasEntrantes(
  miPubKey: string,
  callback: (llamada: { de: string; sesionId: string }) => void,
): () => void {
  const gun = obtenerGun();
  const nodo = gun.get('eli-llamadas-v1').get('entrante').get(miPubKey);
  nodo.on((data: any) => {
    if (!data?.de || !data?.sesionId) return;
    if (Date.now() - (data.ts ?? 0) > 60_000) return;
    callback({ de: data.de, sesionId: data.sesionId });
  });
  return () => nodo.off();
}

export async function responderLlamada(
  miPubKey: string,
  de: string,
  sesionId: string,
  onColgarRemoto: () => void,
): Promise<void> {
  await pedirPermisoMicrofono();

  const gun = obtenerGun();
  const sdpOferta = await new Promise<string | null>((resolve) => {
    const t = setTimeout(() => resolve(null), 10_000);
    gun.get('eli-llamadas-v1').get('sesion').get(sesionId).once((data: any) => {
      clearTimeout(t);
      resolve(data?.oferta ?? null);
    });
  });
  if (!sdpOferta) throw new Error('No se recibió la oferta SDP');

  pc = new RTCPeerConnection(CONFIGURACION_ICE);
  streamLocal = await mediaDevices.getUserMedia({ audio: true, video: false });
  (streamLocal.getTracks() as any[]).forEach((t: any) => pc.addTrack(t, streamLocal));

  await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: sdpOferta }));
  const respuesta = await pc.createAnswer();
  await pc.setLocalDescription(respuesta);
  const sdp = await esperarIceCompleto(pc);

  sesionActual = { miPubKey, destinatarioPubKey: de, sesionId };

  gun.get('eli-llamadas-v1').get('sesion').get(sesionId).put({
    respuesta: sdp,
    estado: 'activa',
  });

  // Limpiar la notificación de llamada entrante
  gun.get('eli-llamadas-v1').get('entrante').get(miPubKey).put({
    de: null,
    sesionId: null,
    ts: 0,
  });

  const nodoSesion = gun.get('eli-llamadas-v1').get('sesion').get(sesionId);
  nodoSesion.on((data: any) => {
    if (!data) return;
    if (data.estado === 'colgada' && data.colgadoPor !== miPubKey) {
      onColgarRemoto();
    }
  });
  cancelarSuscripcionSesion = () => nodoSesion.off();
}

export async function colgar(): Promise<void> {
  cancelarSuscripcionSesion?.();
  cancelarSuscripcionSesion = null;

  if (sesionActual) {
    try {
      obtenerGun()
        .get('eli-llamadas-v1')
        .get('sesion')
        .get(sesionActual.sesionId)
        .put({ estado: 'colgada', colgadoPor: sesionActual.miPubKey });
    } catch {}
  }

  if (streamLocal) {
    (streamLocal.getTracks() as any[]).forEach((t: any) => t.stop());
  }
  pc?.close();
  pc = null;
  streamLocal = null;
  sesionActual = null;
}

export function silenciar(activo: boolean): void {
  if (!streamLocal) return;
  (streamLocal.getAudioTracks() as any[]).forEach((t: any) => {
    t.enabled = !activo;
  });
}

export function sesionEnCurso(): boolean {
  return pc !== null;
}
