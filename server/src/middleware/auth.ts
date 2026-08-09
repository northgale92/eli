import type { Request, Response, NextFunction } from 'express';

const API_KEY   = process.env.ELI_API_KEY   ?? '';
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? '';

// Comprobar en el arranque, antes de aceptar cualquier petición.
// Mejor fallar rápido a descubrir el problema en producción bajo carga.
if (!API_KEY || !ADMIN_KEY) {
  console.error(
    '[auth] CRÍTICO: ELI_API_KEY o ADMIN_API_KEY no están configuradas.\n' +
    '       Copia .env.example a .env y rellena los valores antes de arrancar.'
  );
  process.exit(1);
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-eli-api-key'];
  if (typeof key !== 'string' || key !== API_KEY) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }
  next();
}

export function requireAdminKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-eli-admin-key'];
  if (typeof key !== 'string' || key !== ADMIN_KEY) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }
  next();
}
