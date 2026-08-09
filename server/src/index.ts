import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { requireApiKey, requireAdminKey } from './middleware/auth';
import { registroRouter } from './routes/registro';
import { adminRouter } from './routes/admin';

const app = express();
const PORT   = Number(process.env.PORT ?? 3000);
const ORIGIN = process.env.ALLOWED_ORIGIN ?? '';

if (!ORIGIN) {
  console.warn('[server] ADVERTENCIA: ALLOWED_ORIGIN no configurado. Las peticiones CORS serán rechazadas.');
}

// Cabeceras de seguridad HTTP estándar (CSP, X-Frame-Options, etc.)
app.use(helmet());

app.use(cors({
  origin: ORIGIN,
  methods: ['POST'],
  allowedHeaders: ['Content-Type', 'X-ELI-API-KEY', 'X-ELI-ADMIN-KEY'],
}));

// Limitar el tamaño de payload para prevenir ataques de cuerpo grande
app.use(express.json({ limit: '10kb' }));

// Rate limit en el endpoint de registro: 5 intentos por IP cada 15 minutos.
// Ajustable via código si el equipo de moderación necesita más margen.
const registroLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de registro. Espera antes de volver a intentarlo.' },
});

app.use('/api/registro',    registroLimiter, requireApiKey,   registroRouter);
app.use('/api/admin',                        requireAdminKey,  adminRouter);

// Endpoint de salud — útil para monitorización y para confirmar que el servidor arrancó
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[ELI server] escuchando en puerto ${PORT}`);
});
