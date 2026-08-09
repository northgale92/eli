import { Router } from 'express';
import { z } from 'zod';
import db from '../db';

const router = Router();

const BanSchema = z.object({
  deviceHash: z.string().length(64).regex(/^[0-9a-f]+$/, 'deviceHash debe ser hex lowercase'),
  motivo:     z.string().min(1).max(500),
  baneadoPor: z.string().min(1).max(100),
});

// INSERT OR IGNORE: si el hash ya está baneado no lanza error; se detecta vía info.changes.
const stmtBanear = db.prepare(
  'INSERT OR IGNORE INTO device_bans (device_hash, fecha_ban, motivo, baneado_por) VALUES (?, ?, ?, ?)'
);

router.post('/banear-dispositivo', (req, res) => {
  const parsed = BanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload inválido.', detalles: parsed.error.flatten() });
    return;
  }

  const { deviceHash, motivo, baneadoPor } = parsed.data;
  const fechaBan = new Date().toISOString();

  const info = stmtBanear.run(deviceHash, fechaBan, motivo, baneadoPor);
  const yaEstabaBaneado = info.changes === 0;

  console.log(
    `[admin] ban: hash=${deviceHash.slice(0, 8)}… por=${baneadoPor} ya_estaba=${yaEstabaBaneado}`
  );

  res.status(200).json({
    ok: true,
    mensaje: yaEstabaBaneado
      ? 'El dispositivo ya estaba baneado.'
      : 'Dispositivo baneado correctamente.',
  });
});

export const adminRouter = router;
