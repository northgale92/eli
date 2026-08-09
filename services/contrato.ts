// ELI — Conexión con el Smart Contract de Solidaria
// Red: Polygon (Amoy para pruebas, Polygon mainnet para producción)
// ELI nunca guarda datos bancarios — OpenCollective gestiona las transferencias reales

// ABI mínimo del contrato Solidaria
export const SOLIDARIA_ABI = [
  "function votar(uint256 _indiceProyecto) external",
  "function verReservorio() external view returns (uint256)",
  "function umbralAlcanzado() external view returns (bool)",
  "function verProyectosMes() external view returns (tuple(string id, string nombre, string organizacion, uint256 votos, bool activo, bool financiado, uint256 porcentaje, uint256 timestamp, bool facturasSubidas)[])",
  "function verTotalHistorico() external view returns (uint256)",
  "function subirFacturas(string memory _proyectoId, string memory _evidenciaUri) external",
  "event DistribucionRealizada(uint256 mes, uint256 totalUSDC)",
  "event FondosEnviadosAOpenCollective(string proyectoId, uint256 cantidadUSDC)",
  "event OrganizacionExpulsada(string id, string motivo)",
  "event FacturasSubidas(string proyectoId, string evidenciaUri)",
  "event AnuncioMuroDesbloqueado(string proyectoId, string organizacion)",
  "event ReservorioInsuficiente(uint256 mes, uint256 saldoActual, uint256 umbral)"
];

// Direcciones — se actualizan cuando se despliega el contrato
// AMOY (pruebas) — gratuito, dinero falso
// MAINNET (producción) — dinero real, solo cuando todo esté auditado
export const CONTRATOS = {
  amoy: {
    solidaria: '', // Se rellena después de desplegar en Polygon Amoy
    usdc: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', // USDC en Amoy
    red: 'Polygon Amoy (pruebas)',
    chainId: 80002,
  },
  mainnet: {
    solidaria: '', // Se rellena después de auditoría y aprobación comunitaria
    usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC en Polygon
    red: 'Polygon',
    chainId: 137,
  }
};

// Entorno activo — cambiar a 'mainnet' solo cuando esté auditado
export const ENTORNO: 'amoy' | 'mainnet' = 'amoy';

// Convierte USDC (6 decimales) a dólares legibles
export function usdcADolares(cantidad: bigint): string {
  const dolares = Number(cantidad) / 1_000_000;
  return dolares.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// Convierte dólares a USDC (6 decimales)
export function dolaresAUsdc(dolares: number): bigint {
  return BigInt(Math.round(dolares * 1_000_000));
}

// Estado del reservorio — para mostrar en la pestaña Solidaria
export interface EstadoReservorio {
  saldoUSDC: bigint;
  saldoDolares: string;
  umbralAlcanzado: boolean;
  totalHistoricoDolares: string;
  redActiva: string;
}

// Proyecto del contrato
export interface ProyectoContrato {
  id: string;
  nombre: string;
  organizacion: string;
  votos: bigint;
  activo: boolean;
  financiado: boolean;
  porcentaje: bigint;
  timestamp: bigint;
  facturasSubidas: boolean;
}

// Placeholder — conectará con ethers.js en build nativo
// En web/Expo Go muestra datos simulados para desarrollo
export async function obtenerEstadoReservorio(): Promise<EstadoReservorio> {
  // TODO: conectar con ethers.js cuando esté en build nativo
  // const provider = new ethers.JsonRpcProvider('https://rpc-amoy.polygon.technology');
  // const contrato = new ethers.Contract(CONTRATOS[ENTORNO].solidaria, SOLIDARIA_ABI, provider);
  // const saldo = await contrato.verReservorio();
  return {
    saldoUSDC: BigInt(0),
    saldoDolares: '$0.00',
    umbralAlcanzado: false,
    totalHistoricoDolares: '$0.00',
    redActiva: CONTRATOS[ENTORNO].red,
  };
}

export async function obtenerProyectosContrato(): Promise<ProyectoContrato[]> {
  // TODO: conectar con ethers.js en build nativo
  return [];
}

export async function votarEnContrato(indiceProyecto: number): Promise<boolean> {
  // TODO: conectar con ethers.js + wallet del usuario en build nativo
  console.log(`Voto registrado para proyecto ${indiceProyecto} — pendiente build nativo`);
  return true;
}

export async function subirFacturasContrato(proyectoId: string, evidenciaUri: string): Promise<boolean> {
  // TODO: conectar con ethers.js en build nativo
  console.log(`Facturas subidas para ${proyectoId} — pendiente build nativo`);
  return true;
}
