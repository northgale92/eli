Security Policy

ELI documents its known security and privacy limitations openly instead of assuming they'll stay hidden. This file exists so anyone auditing, contributing to, or relying on ELI knows exactly where the honest weak points are — not just the parts that work well.

## Reporting a vulnerability

If you find a security issue that isn't already listed below, please **do not open a public Issue** describing an active exploit. Instead, open an Issue titled generically (e.g. "Security concern — details via contact") without technical specifics, and wait for a maintainer to reach out privately, or use GitHub's private vulnerability reporting if enabled on this repo. Once a fix is in place, the issue and the fix can be discussed publicly.

## Known limitations (by design, documented on purpose)

### 1. No CSAM hash-matching at launch
The moderation pipeline has no real-time detection against known CSAM hash databases. Providers with genuine database access require registering as a verified, identifiable service entity — incompatible with anonymous development. See the README's "Why there's no CSAM screening" for the full reasoning and the alternatives that were investigated and ruled out. **This is the single most important open item for whoever picks up legal responsibility for the project.**

### 2. Client-side moderation can be bypassed by a modified client
Because ELI is open source (AGPLv3), anyone can compile a modified client that skips the on-device moderation filter before uploading content, and still connect to the same relay. The server-side relay cannot fully distinguish an official client from an altered one. Mitigation: content-level validation should also run at the relay level (in Hetzner/Floki infrastructure), not only client-side — this is documented as a high-priority technical item, not a completed fix.

### 3. Two clients with modified builds can bypass the relay entirely
Even with server-side validation on the official relay, two people running modified clients can connect directly to each other without ever routing through infrastructure the project controls. This is a structural limitation of any open P2P network, not specific to ELI.

### 4. No way to fully prevent a banned user from returning
Account identity is a cryptographic key with no phone number or email tied to it — intentional, to protect users in high-risk situations from identity-linked bans. This means a permanently expelled key can't be traced back to a person and blocked from creating a new one. Mitigations in place: banned public keys stop syncing on the relay, key age carries weight for sensitive actions, and an invite/vouch system makes the inviter partly accountable for who they bring in. None of these make return impossible — they raise the cost of it.

### 5. Voice calls always route through a self-hosted TURN server
This is a protection, not a weakness: WebRTC calls never connect device-to-device directly, specifically to prevent either participant's real IP from being exposed to the other. If the TURN server (coturn on the project's own infrastructure) is ever down or misconfigured, calls should fail closed rather than fall back to direct P2P — this fallback behavior should be verified before any production deployment.

### 6. Phone contact matching uses local hashing, not plaintext
The opt-in contact-matching feature never uploads a phone number in plain text — only a locally computed Argon2id hash. Two known residual risks: (a) hash collisions are mitigated but not impossible at scale, and (b) data replicated across GunJS peers before a "delete" doesn't guarantee immediate removal from every peer that already synced it — mitigated with a 48h expiration and automatic renewal, not a hard guarantee of instant deletion.

### 7. Git history of the original working repository is not public
The original development repository's commit history contains the real name and email of the developer in every commit since the project began. This new public repository was started from a single clean commit specifically to avoid publishing that history. If you ever come across a fork or mirror claiming to be "the real ELI history," treat it with suspicion — it did not come from this project's maintainers.

## 8. Anonymity of the creator is operational security, not a guarantee

The project's creator (pseudonym: Prometheus) uses Tor/VPN for anonymous accounts, but acknowledges openly that account creation for some services happened without Tor/VPN in isolated instances, and that payment methods for infrastructure carry inherent traceability risk if a formal legal request were ever made to the payment provider. This isn't hidden — it's acknowledged as the weakest link in the anonymity chain.
## What's explicitly NOT a vulnerability report

- "The moderation isn't perfect" — acknowledged above, not new information.
- "Solidaria isn't deployed to mainnet yet" — a known, documented blocker (Polygon Amoy faucet requirements), not a bug. See `SOLIDARIA.md`.
- General feature requests — use a regular Issue, not a security report.

---

# Política de seguridad

ELI documenta abiertamente sus limitaciones conocidas de seguridad y privacidad, en vez de asumir que quedarán ocultas. Este archivo existe para que cualquiera que audite, contribuya o confíe en ELI sepa exactamente dónde están los puntos débiles reales — no solo las partes que funcionan bien.

## Reportar una vulnerabilidad

Si encuentras un problema de seguridad que no esté ya listado abajo, **no abras un Issue público** describiendo un exploit activo. En su lugar, abre un Issue con un título genérico (por ejemplo, "Aviso de seguridad — detalles por contacto") sin especificar detalles técnicos, y espera a que un mantenedor contacte en privado, o usa el reporte privado de vulnerabilidades de GitHub si está activado en este repositorio. Una vez aplicado el fix, el issue y la solución pueden discutirse públicamente.

## Limitaciones conocidas (por diseño, documentadas a propósito)

### 1. Sin hash-matching CSAM en el lanzamiento
El pipeline de moderación no tiene detección en tiempo real contra bases de datos de hashes CSAM conocidos. Los proveedores con acceso real a esas bases exigen registrarse como entidad de servicio verificada e identificable — incompatible con un desarrollo anónimo. Ver "Por qué no hay verificación de contenido CSAM" en el README para el razonamiento completo y las alternativas investigadas y descartadas. **Este es, con diferencia, el punto abierto más importante para quien asuma la responsabilidad legal del proyecto.**

### 2. La moderación del lado del cliente puede evitarse con un cliente modificado
Al ser ELI de código abierto (AGPLv3), cualquiera puede compilar un cliente modificado que se salte el filtro de moderación on-device antes de subir contenido, y seguir conectándose al mismo relay. El relay del lado del servidor no puede distinguir del todo un cliente oficial de uno alterado. Mitigación: la validación de contenido también debería aplicarse a nivel del relay (en la infraestructura de Hetzner/Floki), no solo del lado del cliente — esto está documentado como prioridad técnica alta, no como un fix ya completado.

### 3. Dos clientes con builds modificados pueden evitar el relay por completo
Incluso con validación del lado del servidor en el relay oficial, dos personas con clientes modificados pueden conectarse directamente entre sí sin pasar nunca por infraestructura que el proyecto controla. Es una limitación estructural de cualquier red P2P abierta, no específica de ELI.

### 4. No hay forma de impedir del todo que un usuario expulsado vuelva
La identidad de la cuenta es una clave criptográfica sin teléfono ni email asociado — intencionadamente, para proteger a usuarios en situaciones de alto riesgo de baneos ligados a su identidad. Esto significa que una clave expulsada de forma permanente no puede rastrearse hasta una persona ni bloquearse de crear una nueva. Mitigaciones ya implementadas: las claves públicas baneadas dejan de sincronizar en el relay, la antigüedad de la clave pesa en acciones sensibles, y un sistema de invitación/aval hace que quien invita sea parcialmente responsable de a quién trae. Ninguna de estas hace el retorno imposible — suben el coste de hacerlo.

### 5. Las llamadas de voz siempre pasan por un servidor TURN propio
Esto es una protección, no una debilidad: las llamadas WebRTC nunca se conectan directamente entre dispositivos, precisamente para evitar que la IP real de cualquiera de los dos participantes quede expuesta al otro. Si el servidor TURN (coturn en la infraestructura propia del proyecto) llega a estar caído o mal configurado, las llamadas deberían fallar en cerrado en vez de recurrir a P2P directo como respaldo — este comportamiento de respaldo debería verificarse antes de cualquier despliegue de producción.

### 6. El emparejamiento de contactos usa hash local, no texto plano
La función opcional de emparejamiento por agenda nunca sube un número de teléfono en texto plano — solo un hash Argon2id calculado localmente. Dos riesgos residuales conocidos: (a) las colisiones de hash están mitigadas pero no son imposibles a gran escala, y (b) los datos replicados entre peers de GunJS antes de un "borrado" no garantizan eliminación inmediata en todos los peers que ya lo sincronizaron — mitigado con expiración de 48h y renovación automática, no una garantía absoluta de borrado instantáneo.

### 7. El historial de git del repositorio de trabajo original no es público
El historial de commits del repositorio de desarrollo original contiene el nombre y correo reales del desarrollador en cada commit desde el inicio del proyecto. Este repositorio público nuevo se inició desde un único commit limpio precisamente para evitar publicar ese historial. Si alguna vez te encuentras con un fork o espejo que afirme ser "el verdadero historial de ELI", trátalo con sospecha — no proviene de los mantenedores de este proyecto.

## 8. El anonimato del creador es seguridad operativa, no una garantía

El creador del proyecto (seudónimo: Prometheus) usa Tor/VPN para las cuentas anónimas, pero reconoce abiertamente que la creación de cuentas para algunos servicios ocurrió sin Tor/VPN en instancias aisladas, y que los métodos de pago de la infraestructura conllevan un riesgo de trazabilidad inherente si alguna vez se hiciera una solicitud legal formal al proveedor de pago. Esto no está oculto — se reconoce como el eslabón más débil de la cadena de anonimato.
## Qué NO es un reporte de vulnerabilidad

- "La moderación no es perfecta" — ya reconocido arriba, no es información nueva.
- "Solidaria todavía no está desplegada en mainnet" — un bloqueo conocido y documentado (requisitos del faucet de Polygon Amoy), no un bug. Ver `SOLIDARIA.md`.
- Peticiones de funciones en general — usa un Issue normal, no un reporte de seguridad.

