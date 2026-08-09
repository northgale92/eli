import { Platform, PermissionsAndroid } from 'react-native';
import {
  startAdvertise,
  stopAdvertise,
  startDiscovery,
  stopDiscovery,
  requestConnection,
  acceptConnection,
  disconnect,
  sendText,
  onPeerFound,
  onPeerLost,
  onInvitationReceived,
  onConnected,
  onDisconnected,
  onTextReceived,
  isPlayServicesAvailable,
  Strategy,
  type Unsubscribe,
} from 'expo-nearby-connections';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PeerCercano {
  peerId: string;
  usuarioEli: string;
  conectado: boolean;
}

export interface MensajeOffline {
  de: string;
  texto: string;
  ts: number;
  offline: true;
}

export type OnPeersChange = (peers: PeerCercano[]) => void;
export type OnMensajeOffline = (msg: MensajeOffline) => void;

// ─── Estado singleton ─────────────────────────────────────────────────────────

const PREFIJO = 'eli:';

const peersVisibles = new Map<string, PeerCercano>();
let activo = false;
const canceladores: Unsubscribe[] = [];
const suscriptoresPeers = new Set<OnPeersChange>();
const suscriptoresMensajes = new Set<OnMensajeOffline>();

function notificarPeers() {
  const lista = Array.from(peersVisibles.values());
  suscriptoresPeers.forEach(fn => fn(lista));
}

// ─── Permisos Android ─────────────────────────────────────────────────────────

export async function pedirPermisosOffline(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const permisos: string[] = [
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  ];

  // NEARBY_WIFI_DEVICES solo existe desde Android 13 (API 33)
  if ((Platform.Version as number) >= 33) {
    permisos.push('android.permission.NEARBY_WIFI_DEVICES');
  }

  const resultados = await PermissionsAndroid.requestMultiple(
    permisos as Parameters<typeof PermissionsAndroid.requestMultiple>[0],
  );
  return Object.values(resultados).every(
    r => r === PermissionsAndroid.RESULTS.GRANTED,
  );
}

// ─── Arranque ─────────────────────────────────────────────────────────────────

export async function iniciarOffline(
  nombreUsuario: string,
  onPeers?: OnPeersChange,
  onMensaje?: OnMensajeOffline,
): Promise<boolean> {
  if (activo) return true;

  if (Platform.OS !== 'android') {
    console.warn('[Offline] Solo Android disponible en esta versión.');
    return false;
  }

  const disponible = await isPlayServicesAvailable();
  if (!disponible) {
    console.warn('[Offline] Google Play Services no disponible.');
    return false;
  }

  if (onPeers) suscriptoresPeers.add(onPeers);
  if (onMensaje) suscriptoresMensajes.add(onMensaje);

  const nombreEmitido = `${PREFIJO}${nombreUsuario}`;

  // ── Descubrimiento ────────────────────────────────────────────────────────
  canceladores.push(
    onPeerFound(({ peerId, name }) => {
      if (!name.startsWith(PREFIJO)) return;
      const usuarioEli = name.slice(PREFIJO.length);
      peersVisibles.set(peerId, { peerId, usuarioEli, conectado: false });
      notificarPeers();
    }),
  );

  canceladores.push(
    onPeerLost(({ peerId }) => {
      peersVisibles.delete(peerId);
      notificarPeers();
    }),
  );

  // ── Conexión (lado advertiser: auto-acepta invitaciones de otros ELI) ─────
  canceladores.push(
    onInvitationReceived(({ peerId }) => {
      acceptConnection(peerId).catch(err =>
        console.warn('[Offline] Error al aceptar conexión:', err),
      );
    }),
  );

  // ── Conexión establecida (ambos lados) ────────────────────────────────────
  canceladores.push(
    onConnected(({ peerId, name }) => {
      const usuarioEli = name.startsWith(PREFIJO)
        ? name.slice(PREFIJO.length)
        : name;
      peersVisibles.set(peerId, { peerId, usuarioEli, conectado: true });
      notificarPeers();
    }),
  );

  canceladores.push(
    onDisconnected(({ peerId }) => {
      const peer = peersVisibles.get(peerId);
      if (peer) {
        peersVisibles.set(peerId, { ...peer, conectado: false });
        notificarPeers();
      }
    }),
  );

  // ── Mensajes entrantes ────────────────────────────────────────────────────
  canceladores.push(
    onTextReceived(({ peerId: _peerId, text }) => {
      try {
        const msg = JSON.parse(text) as MensajeOffline;
        if (msg.offline && msg.texto && msg.de) {
          suscriptoresMensajes.forEach(fn => fn(msg));
        }
      } catch {
        // payload no es JSON de ELI — ignorar
      }
    }),
  );

  // ── Arrancar advertise + discovery simultáneamente con P2P_CLUSTER ────────
  // P2P_CLUSTER permite que múltiples usuarios ELI cercanos se vean entre sí
  try {
    await Promise.all([
      startAdvertise(nombreEmitido, Strategy.P2P_CLUSTER),
      startDiscovery(nombreEmitido, Strategy.P2P_CLUSTER),
    ]);
    activo = true;
    console.log('[Offline] Nearby Connections activo como:', nombreEmitido);
    return true;
  } catch (err) {
    console.error('[Offline] Error al arrancar Nearby Connections:', err);
    limpiarCanceladores();
    return false;
  }
}

// ─── Detener ──────────────────────────────────────────────────────────────────

export async function detenerOffline(): Promise<void> {
  if (!activo) return;
  activo = false;
  peersVisibles.clear();
  limpiarCanceladores();
  await Promise.allSettled([stopAdvertise(), stopDiscovery()]);
  notificarPeers();
}

// ─── API de conexión ──────────────────────────────────────────────────────────

export async function conectarPeer(peerId: string): Promise<void> {
  await requestConnection(peerId);
}

export async function desconectarPeer(peerId?: string): Promise<void> {
  await disconnect(peerId);
}

// ─── Mensajería offline ───────────────────────────────────────────────────────

export async function enviarMensajeOffline(
  peerId: string,
  texto: string,
  nombreUsuario: string,
): Promise<boolean> {
  try {
    const msg: MensajeOffline = {
      de: nombreUsuario,
      texto,
      ts: Date.now(),
      offline: true,
    };
    await sendText(peerId, JSON.stringify(msg));
    return true;
  } catch (err) {
    console.error('[Offline] Error al enviar mensaje:', err);
    return false;
  }
}

// ─── Suscripciones ────────────────────────────────────────────────────────────

export function suscribirPeers(fn: OnPeersChange): () => void {
  suscriptoresPeers.add(fn);
  return () => suscriptoresPeers.delete(fn);
}

export function suscribirMensajesOffline(fn: OnMensajeOffline): () => void {
  suscriptoresMensajes.add(fn);
  return () => suscriptoresMensajes.delete(fn);
}

// ─── Consultas de estado ──────────────────────────────────────────────────────

export function obtenerPeers(): PeerCercano[] {
  return Array.from(peersVisibles.values());
}

export function estaActivo(): boolean {
  return activo;
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function limpiarCanceladores() {
  canceladores.forEach(cancel => cancel());
  canceladores.length = 0;
  suscriptoresPeers.clear();
  suscriptoresMensajes.clear();
}
