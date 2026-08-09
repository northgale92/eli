import { Router } from 'express';
import { z } from 'zod';
import db from '../db';

const router = Router();

const RegistroSchema = z.object({
  usuario:    z.string().min(1).max(50),
  pubKey:     z.string().min(1).max(128),
  // SHA-256 en hex: exactamente 64 caracteres hexadecimales en minúsculas
  deviceHash: z.string().length(64).regex(/^[0-9a-f]+$/, 'deviceHash debe ser hex lowercase'),
});

// Prepared statement: reutilizable entre peticiones; la API de better-sqlite3
// obliga a usar parámetros posicionales, eliminando por diseño la inyección SQL.
const stmtCheckBan = db.prepare(
  'SELECT 1 FROM device_bans WHERE device_hash = ?'
);

router.post('/', (req, res) => {
  const parsed = RegistroSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos de registro inválidos.', detalles: parsed.error.flatten() });
    return;
  }

  const { usuario, pubKey, deviceHash } = parsed.data;

  const isBanned = stmtCheckBan.get(deviceHash) !== undefined;
  if (isBanned) {
    // Respuesta genérica: no revelar que el motivo exacto es un ban activo.
    // Evita que el usuario sepa con certeza qué identificador fue detectado.
    res.status(403).json({ error: 'Registro no disponible en este dispositivo.' });
    return;
  }

  // Solo se loggean los primeros 8 caracteres para trazabilidad sin exponer datos sensibles.
  console.log(
    `[registro] nueva cuenta: usuario=${usuario.slice(0, 8)}… hash=${deviceHash.slice(0, 8)}…`
  );

  // TODO [servidor]: cuando se defina el esquema completo de usuarios, persistir aquí:
  //   INSERT INTO cuentas (usuario, pub_key, device_hash, fecha_registro) VALUES (?, ?, ?, ?)
  // Por ahora el directorio público de claves vive en GunDB (eli_usuarios_v1).
  // Ver services/gun.ts del cliente para el contrato de datos de GunDB.
  //
  // Nota: pubKey y deviceHash se reciben pero aún no se almacenan en este servidor.
  // Mantenerlos en la firma para no romper el contrato con el cliente cuando se implemente.
  void pubKey;

  res.status(201).json({ ok: true });
});

export const registroRouter = router;
