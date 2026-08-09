export function iniciarWaku() {
  return Promise.resolve(true);
}

export function enviarMensaje(texto: string, destinatario: string) {
  console.log('Mensaje P2P (simulado):', texto, '->', destinatario);
}

export function recibirMensajes(callback: (msg: any) => void) {
  console.log('Escuchando mensajes P2P (simulado)');
}

export function desconectarWaku() {
  console.log('Waku desconectado (simulado)');
}
