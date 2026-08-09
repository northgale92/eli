# ELI — Servidor Backend

Servidor Node.js/Express que gestiona el registro de cuentas y el sistema anti-ban-evasión de la app ELI. Es el único componente de backend actual; el resto de la comunicación entre usuarios ocurre directamente vía GunDB (P2P).

## ¿Qué hace este servidor?

| Endpoint | Descripción |
|---|---|
| `POST /api/registro` | Recibe los datos de una cuenta nueva. Rechaza el registro si el dispositivo está baneado. |
| `POST /api/admin/banear-dispositivo` | Añade un hash de dispositivo a la lista de bans. |
| `GET /health` | Comprueba que el servidor está en pie (útil para monitorización). |

El servidor **no** reemplaza a GunDB — el directorio público de claves y los datos de la app siguen en la red P2P. Este servidor solo hace lo que GunDB no puede: comprobar una lista centralizada de bans antes de permitir un nuevo registro.

## Requisitos previos

- **Node.js 20 o superior** — verificar con `node --version`
- **npm 9 o superior** — verificar con `npm --version`
- Sin requisitos adicionales: `better-sqlite3` descarga binarios precompilados automáticamente

## Instalación

```bash
cd server
npm install
```

## Variables de entorno

Copia `.env.example` a `.env` y rellena los valores:

```bash
cp .env.example .env
```

| Variable | Obligatoria | Descripción |
|---|---|---|
| `ELI_API_KEY` | Sí | API key que la app móvil envía en el header `X-ELI-API-KEY` |
| `ADMIN_API_KEY` | Sí | API key del panel de administración, en el header `X-ELI-ADMIN-KEY`. Debe ser diferente de `ELI_API_KEY`. |
| `ALLOWED_ORIGIN` | Sí (en prod) | Origen CORS permitido, p.ej. `https://eli-app.org` |
| `PORT` | No | Puerto TCP (por defecto: `3000`) |
| `DB_PATH` | No | Ruta al archivo SQLite (por defecto: `./data/eli.db`) |

Para generar una API key segura:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Desarrollo local

```bash
cd server
npm run dev
```

El servidor usa `ts-node` para ejecutar TypeScript directamente, sin compilar.

Verificar que funciona:
```bash
curl http://localhost:3000/health
# Respuesta esperada: {"ok":true}
```

## Para producción

### 1. Compilar

```bash
cd server
npm run build
npm start
```

O con un gestor de procesos como PM2:
```bash
npm install -g pm2
pm2 start dist/index.js --name eli-server
pm2 save
pm2 startup   # para que arranque automáticamente con el SO
```

### 2. HTTPS mediante reverse proxy (OBLIGATORIO)

**El servidor Express nunca debe exponerse directamente a internet en el puerto 3000.** Siempre debe estar detrás de un reverse proxy que gestione TLS.

Opción recomendada: **nginx + certbot (Let's Encrypt)**

Instalar en el servidor (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
```

Configuración de nginx en `/etc/nginx/sites-available/eli-server`:
```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/eli-server /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obtener certificado TLS gratuito con Let's Encrypt
sudo certbot --nginx -d tu-dominio.com
```

Certbot modifica automáticamente la config de nginx para redirigir HTTP → HTTPS y renovar el certificado cada 90 días.

### 3. Firewall

Solo exponer los puertos 80 y 443. El puerto 3000 debe ser inaccesible desde fuera del servidor:
```bash
sudo ufw allow 80
sudo ufw allow 443
sudo ufw deny 3000
sudo ufw enable
```

## Estructura del proyecto

```
server/
├── .env.example        — plantilla de variables de entorno (sí en git)
├── .gitignore          — excluye .env, dist/, data/*.db
├── package.json
├── tsconfig.json
├── README.md           — este archivo
├── data/               — base de datos SQLite (excluida de git)
│   └── .gitkeep
└── src/
    ├── index.ts        — arranque Express, middlewares globales
    ├── db.ts           — conexión SQLite, WAL, migración inicial
    ├── middleware/
    │   └── auth.ts     — guards X-ELI-API-KEY y X-ELI-ADMIN-KEY
    └── routes/
        ├── registro.ts — POST /api/registro
        └── admin.ts    — POST /api/admin/banear-dispositivo
```

## Próximos pasos pendientes (no implementados)

- **Tabla de cuentas**: cuando se defina el esquema completo de usuarios, añadir `INSERT INTO cuentas` en `routes/registro.ts` donde está el `TODO [servidor]`.
- **Proxy CSAM**: endpoint `/csam/v1/check-hash` para comparar hashes de imágenes contra bases de datos de CSAM (WebPurify, Thorn Safer, NCMEC PhotoDNA). Ver `services/moderacionCSAM.ts` del cliente.
- **Proxy IA adultos**: intermediario entre la app y los modelos de IA de moderación. Ver `services/moderacionAdultos.ts` del cliente.
- **Servidor TURN** (coturn): para llamadas WebRTC cuando STUN no es suficiente (NAT simétrico). Ver `services/llamadas.ts` del cliente.
- **Peer GunDB propio**: sustituir el peer público `gun-us.herokuapp.com` por uno propio para mayor control y disponibilidad.
