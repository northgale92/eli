Contributing to ELI

Thanks for considering contributing. ELI has no company, no investors, and no owner after launch — its quality depends entirely on people like you reviewing, testing, and improving it.

## Before you start

- Read the [README](./README.md) for the project's architecture and philosophy.
- Check open [Issues](../../issues) to avoid duplicating work already in progress.
- For anything security-sensitive (a real vulnerability, not a feature request), see [`SECURITY.md`](./SECURITY.md) first — don't open a public issue for an active exploit.

## Getting the project running locally

- Stack: React Native + Expo, GunJS (P2P sync), NaCl box/Curve25519 (encryption), WebRTC (voice calls)
- Requirements: Node.js, Expo CLI, Android Studio or a physical Android device
- `npm install` → `npx expo run:android` to build locally
- The server side (GunJS peer + coturn) is self-hostable; see [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md) for spinning up your own test instance

## Code standards

- TypeScript throughout; `tsc --noEmit` must pass clean before opening a PR
- Match the existing file structure: `services/` for logic, `app/` for screens (Expo Router)
- Private chat code must never call out to any AI moderation service, under any circumstance — this is a hard architectural rule, not a style preference
- New dependencies: prefer well-maintained, actively updated packages; if you add something with a small maintainer base or recent release history, note that trade-off in the PR description

## Pull request flow

1. Fork the repo, branch from `main`.
2. Keep PRs focused — one fix or feature per PR is easier to review than a bundle of unrelated changes.
3. Describe what changed and why, not just what. If it touches moderation, encryption, Solidaria's smart contract, or anonymity-related code, explain the reasoning explicitly.
4. Tests where it makes sense — especially for anything touching the Solidaria contract (see the 45/45 Hardhat test suite as the bar to match) or the moderation pipeline.
5. Be patient — this project has no dedicated maintainer team yet. Review times will vary, especially after the creator steps away 30 days post-launch (see the README's "About the creator").

## Areas that especially need help right now

- Completing smart contract deployment tests on the Polygon Amoy testnet (see `SOLIDARIA.md` for the exact blocker)
- A real CSAM-detection integration, for whoever has the legal standing to register with a verified provider (see the README's "Why there's no CSAM screening")
- General security auditing — a fresh set of eyes on the encryption, moderation, and anonymity-related code is always valuable

## Code of conduct

Be direct about problems in the code, be kind about the person who wrote it. Assume good faith. Disagreements about architecture are welcome and expected — personal attacks aren't.

---

# Cómo contribuir a ELI

Gracias por plantearte contribuir. ELI no tiene empresa, ni inversores, ni dueño tras el lanzamiento — su calidad depende por completo de que gente como tú lo revise, lo pruebe y lo mejore.

## Antes de empezar

- Lee el [README](./README.md) para entender la arquitectura y la filosofía del proyecto.
- Revisa los [Issues](../../issues) abiertos para no duplicar trabajo ya en marcha.
- Para cualquier cosa relacionada con seguridad (una vulnerabilidad real, no una petición de función), consulta primero [`SECURITY.md`](./SECURITY.md) — no abras un issue público para un exploit activo.

## Poner el proyecto en marcha en local

- Stack: React Native + Expo, GunJS (sincronización P2P), NaCl box/Curve25519 (cifrado), WebRTC (llamadas de voz)
- Requisitos: Node.js, Expo CLI, Android Studio o un dispositivo Android físico
- `npm install` → `npx expo run:android` para compilar en local
- La parte de servidor (peer de GunJS + coturn) es autoalojable; ver [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md) para levantar tu propia instancia de pruebas

## Estándares de código

- TypeScript en todo el proyecto; `tsc --noEmit` debe pasar limpio antes de abrir un PR
- Respeta la estructura existente: `services/` para lógica, `app/` para pantallas (Expo Router)
- El código del chat privado nunca debe llamar a ningún servicio de moderación con IA, bajo ninguna circunstancia — es una regla de arquitectura firme, no una preferencia de estilo
- Nuevas dependencias: prioriza paquetes bien mantenidos y con actualizaciones activas; si añades algo con poco mantenimiento o historial reciente, indícalo como riesgo asumido en la descripción del PR

## Flujo de pull requests

1. Haz un fork del repo, crea una rama desde `main`.
2. Mantén los PRs enfocados — un fix o una función por PR es mucho más fácil de revisar que un conjunto de cambios sin relación.
3. Describe qué cambia y por qué, no solo qué. Si toca moderación, cifrado, el smart contract de Solidaria o código relacionado con el anonimato, explica el razonamiento explícitamente.
4. Añade tests cuando tenga sentido — especialmente en cualquier cosa que toque el contrato de Solidaria (usa como referencia la suite de 45/45 tests en Hardhat) o el pipeline de moderación.
5. Ten paciencia — este proyecto todavía no tiene un equipo de mantenedores dedicado. Los tiempos de revisión variarán, sobre todo después de que el creador se desvincule 30 días tras el lanzamiento (ver "Sobre el creador" en el README).

## Áreas que necesitan ayuda especialmente ahora mismo

- Completar los tests de despliegue del smart contract en la testnet Polygon Amoy (ver `SOLIDARIA.md` para el bloqueo exacto)
- Una integración real de detección CSAM, para quien tenga la capacidad legal de registrarse ante un proveedor verificado (ver "Por qué no hay verificación de contenido CSAM" en el README)
- Auditoría de seguridad en general — una mirada nueva sobre el cifrado, la moderación y el código relacionado con el anonimato siempre suma valor

## Código de conducta

Sé directo con los problemas del código, sé amable con quien lo escribió. Asume buena fe. Los desacuerdos sobre arquitectura son bienvenidos y esperables — los ataques personales no.
