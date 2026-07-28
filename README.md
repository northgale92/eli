[README (1).md](https://github.com/user-attachments/files/30470350/README.1.md)
# ELI — Essential Life Intelligence



*A private, P2P, decentralized messaging and social app — for anyone leaving WhatsApp without giving anything up.*

---

## 🇬🇧 English

### Why ELI exists

ELI was born out of sheer exhaustion with having to hand over personal data just to open an account. A phone number for a chat app. An email for a social network. An ID document for almost anything. Every new account asks for a little more of you, and over time that stops feeling like a reasonable exchange and starts feeling like a condition: hand over your data, or stay out.

ELI starts from a simple idea — you can have a full messaging and social app, with every convenience people expect today, without asking for any of that. No phone, no email, no ID. Your account is a cryptographic key you generate yourself, on your own device, that no one else controls.

### What ELI is

ELI covers everything a mainstream messaging app offers — chat, groups, voice calls, message status, voice notes, location sharing, a public feed, channels, a local marketplace — but with no central server, no data collection, and private chat encrypted end to end. No one, not even the team running the infrastructure, can read your conversations.

There is no company behind ELI. No investors, no shareholders, no advertising model. The project is funded by Marketplace fees and voluntary donations, and that money never goes to a private pocket.

### Technical architecture

- **Messaging**: E2E encryption with NaCl box (Curve25519), P2P sync via GunJS
- **Voice calls**: WebRTC always routed through a self-hosted TURN server — never direct P2P, to protect the user's IP
- **Identity**: no email or phone number. The account is a cryptographic key generated and stored on the device itself; the private key never leaves it
- **Moderation**: public content (Wall, Channels) goes through an on-device filter before upload, plus an extra layer for ambiguous content. Private chat is never scanned — it's encrypted territory, full stop
- **Marketplace**: a showcase for local shops and verified businesses; ELI never intermediates payments between buyer and seller

### What the Marketplace tab is (and isn't)

Marketplace isn't an in-app buy-and-sell platform — ELI doesn't process orders, doesn't take a cut of sales, and doesn't intermediate any payment between buyer and seller. It's literally an ads tab: a listing of verified shops and businesses that pay a fee to appear, which users can then contact directly through chat.

It exists deliberately outside the Wall, because the Wall doesn't allow any business advertising, under any circumstances — it's a space for people only. Marketplace is the app's only channel for commercial visibility, and it's necessary: Marketplace fees are the main source of income for the Solidaria fund. Without Marketplace, Solidaria wouldn't have the money to finance the projects it distributes each period. Solidaria's money is always publicly visible — its origin and its destination — so anyone can verify that Marketplace fees actually end up there.



### Download and installation

ELI is distributed as an APK downloadable directly from [eli-app.org](https://eli-app.org) — no Google Play Store required. Play Store publication will come later; until then, the project website is always the official installation path.

### Why there's no video calling in this launch

ELI includes encrypted P2P voice calls from the first launch, but not video. That's not a technical limitation of the design — the signaling architecture already supports extending to video over the same WebRTC base — it's a scope decision: getting messaging, voice, and real moderation right by the launch date was prioritized over delaying everything to include one more feature. It's the most visible piece left for whoever continues the project.

### Running the project locally

- Stack: React Native + Expo, GunJS (P2P sync), NaCl box/Curve25519 (encryption), WebRTC (voice calls)
- Requirements: Node.js, Expo CLI, Android Studio or a physical device for testing
- `npm install` → `npx expo run:android` to build locally
- The server (GunJS peer + TURN) is self-hostable; instructions for spinning up your own test infrastructure are in [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md)

Full contribution guide, code standards, and pull request flow in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

### Sustaining the project — donations

Separate from the Solidaria fund (which finances causes outside the community), there's a separate **donations** tab meant to cover the real cost of keeping ELI running: server and moderation APIs. These are voluntary $1–5 donations, handled with full transparency, and it's worth not confusing them with Solidaria — one sustains the project's own infrastructure, the other funds external causes.

### Known limitations and security

ELI documents its known risks and limitations openly, rather than assuming they'll stay hidden. Beyond the absence of CSAM screening (see below), any other security or privacy limitation identified during development is tracked in [`SECURITY.md`](./SECURITY.md), meant as a starting point for any future community audit.

### The Solidaria tab

Solidaria exists because an app that moves money from community to community can't rely on the promise that someone will "manage it well." It has to be impossible for anyone to manage it badly — or redirect it, hold it back, or unilaterally decide who gets helped.

That's why no person administers Solidaria: it's **run entirely by a public smart contract on the Polygon blockchain**. That contract is auditable by anyone, at any time — anyone can review the code and confirm it does exactly what it says, without having to trust anyone's word. It distributes the fund by fixed rules (critical need + community vote + reserve), releases money in two tranches conditioned on verification, and never lets a single person — not an administrator, not ELI's own creator — move that money by hand. The full rules for distribution, deadlines and transparency are documented in [`SOLIDARIA.md`](./SOLIDARIA.md).

The contract passes **45 out of 45 tests** locally in Hardhat, covering every distribution rule, deadline, and lockout described in `SOLIDARIA.md`. What wasn't completed at this stage was deployment to the public Polygon Amoy testnet: the faucets that hand out test funds require prior wallet age and activity before granting any balance — a requirement meant to stop bots from draining the faucet, but one that also blocks a wallet freshly created for testing, even when buying real ETH as an alternative. Testnet/mainnet deployment is left as an open task for the community, with the exact reason for the block explained in `INFRASTRUCTURE.md` — not a problem with the contract itself, since the 45 tests already prove the logic works. **Anyone with smart contract knowledge and Polygon deployment experience is explicitly invited to complete this testing on Amoy** — alongside auditing the contract itself, it's the most direct technical contribution the community can make to Solidaria right now.

For now, donating to Solidaria requires a Polygon wallet. The card/PayPal payment gateway, described in `SOLIDARIA.md`, needs to be linked to a real bank account belonging to a legal entity, and that account doesn't exist yet — it depends on the community setting up the foundation (see "Governance and future"). Until then, the only real donation path is crypto, sent directly to the contract's wallet.

### Why there's no CSAM screening

This project does not, at initial launch, include a detection system that checks content against known CSAM hash databases. This isn't an oversight — it's a real limitation, documented here on purpose.

Serious providers of this technology (the ones giving access to real hash databases, not just the matching algorithm) require whoever requests access to register and verify as an **identifiable service entity** — a real natural or legal person, with legal responsibility taken on. That's a reasonable requirement: it's exactly the kind of control that keeps such sensitive tools out of the wrong hands. But it's also structurally incompatible with a project developed and maintained anonymously.

ELI cannot solve this alone while development stays anonymous. It's documented here as a known limitation, along with the alternatives that were investigated and ruled out, so the community and any future legal entity (see "Governance and future") can pick it up with the legal standing this initial development doesn't have.

### About the creator

ELI was created under the pseudonym **Prometheus**, who steps away from the project 30 days after launch. From that point on, ELI has no owner — it has a community. The project was designed from the start to survive without depending on a single person.

### Governance and future

Since the creator disappears 30 days after launch, someone has to be able to handle what a smart contract can't: relationships with real-world providers, bank accounts, and billing for the Marketplace's verified shops and businesses. No individual should have to carry that responsibility on behalf of a project that no longer has an owner.

That's why the community is urged to set up, after launch, a **non-profit foundation** (proposed: an NPO/MTÜ in Estonia, fully manageable online via e-residency) to become the legal party responsible for **Marketplace accounts** — billing for verified shops and businesses, and the project's technical infrastructure (server, domain, APIs). This foundation manages the Marketplace's economic activity; **it never manages Solidaria's money**, which stays exclusively under the smart contract's control, outside the reach of any entity, including this foundation.

Anyone with legal, accounting, or non-profit governance experience is welcome to propose and lead this setup through a GitHub Issue.

### Brand and license

ELI's code is free software (**AGPLv3**): anyone can copy it, modify it, audit it, and distribute it. That license covers the code — it does not cover the name or the logo.

**The name "ELI" and its logo may not be used in forks or derivative versions.** Anyone building on this code to launch their own version must:

1. Use their **own name and logo**, distinct from "ELI" and from anything that could be confused with it.
2. If they choose to keep the **Solidaria** tab (removing it is not required), they must keep it operating under its distribution, deadline, and transparency rules as described in `SOLIDARIA.md` — it cannot be called "Solidaria" while working differently, and the fund cannot be redirected to a third party.
3. **Not present itself as the official continuation of ELI.** No fork automatically inherits the original project's legitimacy just by reusing its code.

Full brand license details are in [`BRAND.md`](./BRAND.md).

### Contributing

The code is yours. Review it, find the bugs, harden the security, and make this network fly higher. Contribution guide in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## 🇪🇸 Español

### Por qué nació ELI

ELI nace del agotamiento de tener que ceder datos personales para poder abrir cualquier cuenta. Un número de teléfono para un chat. Un email para una red social. Un documento de identidad para casi cualquier cosa. Cada nueva cuenta pide un poco más de ti, y con el tiempo eso deja de sentirse como un intercambio razonable y empieza a sentirse como una condición impuesta: o entregas tus datos, o te quedas fuera.

ELI parte de una idea simple — se puede tener una app de mensajería y red social completa, con todas las comodidades que la gente espera hoy, sin pedir nada de eso. Sin teléfono, sin email, sin documento. Tu cuenta es una clave criptográfica que generas tú mismo, en tu propio dispositivo, y que nadie más controla.

### Qué es ELI

ELI cubre todo lo que ofrece una app de mensajería convencional — chat, grupos, llamadas de voz, estados de mensaje, notas de voz, ubicación, muro público, canales, mercado local — pero sin servidor central, sin recolección de datos, y con el chat privado cifrado de extremo a extremo. Nadie, ni siquiera el equipo que mantiene la infraestructura, puede leer tus conversaciones.

Ninguna empresa está detrás de ELI. No hay inversores, no hay accionistas, no hay modelo publicitario. El proyecto se sostiene con las cuotas del Mercado y donaciones voluntarias, y ese dinero no va a ningún bolsillo privado.

### Arquitectura técnica

- **Mensajería**: cifrado E2E con NaCl box (Curve25519), sincronización P2P vía GunJS
- **Llamadas de voz**: WebRTC enrutado siempre a través de un servidor TURN propio — nunca P2P directo, para proteger la IP del usuario
- **Identidad**: sin email ni teléfono. La cuenta es una clave criptográfica generada y guardada en el propio dispositivo; la clave privada nunca sale de él
- **Moderación**: el contenido público (Muro, Canales) pasa por un filtro on-device antes de subirse, más una capa adicional para contenido ambiguo. El chat privado nunca se analiza — es territorio cifrado, punto
- **Mercado**: escaparate de tiendas locales y empresas verificadas; ELI nunca intermedia pagos entre comprador y vendedor

### Qué es (y qué no es) la pestaña Mercado

Mercado no es un marketplace de compraventa dentro de la app — ELI no procesa pedidos, no cobra comisión por venta y no intermedia ningún pago entre comprador y vendedor. Es, literalmente, una pestaña de anuncios: un listado de tiendas y empresas verificadas que pagan una cuota por aparecer, con la que el usuario puede contactar directamente por chat.

Existe deliberadamente fuera del Muro porque en el Muro no se permite ningún anuncio de empresa, bajo ninguna circunstancia — es un espacio solo para personas. Mercado es la única vía de visibilidad comercial en toda la app, y es necesaria: las cuotas de Mercado son la principal fuente de ingresos del fondo Solidaria. Sin Mercado, Solidaria no tendría con qué financiar los proyectos que reparte cada periodo. El dinero de Solidaria es siempre visible públicamente para cualquiera — su origen y su destino —, así que cualquiera puede comprobar que las cuotas de Mercado terminan realmente ahí.



### Descarga e instalación

ELI se distribuye como APK descargable directamente desde [eli-app.org](https://eli-app.org) — no requiere Google Play Store. La publicación en Play Store llegará más adelante; hasta entonces, la vía oficial de instalación es siempre la web del proyecto.

### Por qué no hay videollamada en este lanzamiento

ELI incluye llamadas de voz P2P cifradas desde el primer lanzamiento, pero no videollamada. No es una limitación técnica del diseño — la arquitectura de señalización ya soporta ampliarse a vídeo sobre la misma base de WebRTC — sino una decisión de alcance: se priorizó cerrar bien la mensajería, la voz y la moderación real antes de la fecha de lanzamiento, en lugar de retrasarlo todo para incluir una función más. Queda como la pieza más visible pendiente para quien continúe el proyecto.

### Cómo ejecutar el proyecto localmente

- Stack: React Native + Expo, GunJS (sincronización P2P), NaCl box/Curve25519 (cifrado), WebRTC (llamadas de voz)
- Requisitos: Node.js, Expo CLI, Android Studio o un dispositivo físico para pruebas
- `npm install` → `npx expo run:android` para compilar en local
- El servidor (peer de GunJS + TURN) es autoalojable; instrucciones para levantar tu propia infraestructura de pruebas en [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md)

Guía completa de contribución, estándares de código y flujo de pull requests en [`CONTRIBUTING.md`](./CONTRIBUTING.md).

### Sostenimiento del proyecto — donaciones

Aparte del fondo de Solidaria (que financia proyectos externos a la comunidad), existe una pestaña de **donaciones** separada, pensada para cubrir los costes reales de mantener ELI funcionando: servidor y APIs de moderación. Son donaciones voluntarias de 1 a 5$, gestionadas con total transparencia, y es importante no confundirlas con Solidaria — una sostiene la infraestructura del propio proyecto, la otra financia causas externas.

### Limitaciones conocidas y seguridad

ELI documenta abiertamente sus riesgos y limitaciones conocidas, en lugar de asumir que quedarán ocultos. Además de la ausencia de verificación CSAM (ver más abajo), cualquier otra limitación de seguridad o privacidad identificada durante el desarrollo está recogida en [`SECURITY.md`](./SECURITY.md), pensado como punto de partida para cualquier auditoría futura de la comunidad.

### La pestaña Solidaria



Solidaria existe porque una app que mueve dinero de comunidad a comunidad no puede depender de la promesa de que alguien "lo gestionará bien". Tiene que ser imposible que alguien lo gestione mal — o que lo desvíe, lo retenga, o decida unilateralmente a quién ayuda.

Por eso Solidaria no la administra ninguna persona: **está gestionada íntegramente por un smart contract público en la blockchain de Polygon**. Ese contrato es auditable por cualquiera, en cualquier momento — cualquiera puede revisar el código y comprobar que hace exactamente lo que dice hacer, sin tener que confiar en la palabra de nadie. Reparte el fondo según reglas fijas (necesidad crítica + voto comunitario + reserva), libera el dinero en dos tramos condicionados a verificación, y nunca permite que una sola persona — ni un administrador, ni el propio creador de ELI — mueva ese dinero manualmente. Las reglas completas de reparto, plazos y transparencia están documentadas en [`SOLIDARIA.md`](./SOLIDARIA.md).

El contrato pasa **45 de 45 tests** en local con Hardhat, cubriendo cada regla de reparto, plazo y bloqueo descrita en `SOLIDARIA.md`. Lo que no se llegó a completar en esta fase fue el despliegue en la testnet pública Polygon Amoy: los faucets que reparten fondos de prueba exigen antigüedad y actividad previa de la wallet antes de conceder saldo, un requisito pensado para frenar bots que agotan el faucet, pero que también bloquea a una wallet nueva creada expresamente para las pruebas, incluso comprando ETH real como alternativa. El despliegue en testnet/mainnet queda documentado como tarea abierta para la comunidad, con el motivo exacto del bloqueo explicado en `INFRASTRUCTURE.md`, no como un problema del propio contrato — los 45 tests ya demuestran que la lógica funciona. **Se pide expresamente a cualquiera con conocimientos de contratos inteligentes y despliegue en Polygon que se anime a completar estas pruebas en Amoy** — es, junto con la propia auditoría del contrato, la contribución técnica más directa que la comunidad puede hacer a Solidaria ahora mismo.

Por ahora, donar a Solidaria requiere una wallet de Polygon. La pasarela de pago con tarjeta o PayPal, descrita en `SOLIDARIA.md`, necesita estar vinculada a una cuenta bancaria real de una entidad legal, y esa cuenta todavía no existe — depende de que la comunidad constituya la fundación (ver "Gobernanza y futuro"). Hasta entonces, la única vía de donación real es en cripto, directamente a la wallet del contrato.

### Por qué no hay verificación de contenido CSAM

Este proyecto no incluye, en su lanzamiento inicial, un sistema de detección de material de abuso sexual infantil (CSAM) contra bases de datos de hashes conocidos. No es una omisión por descuido — es una limitación real que se documenta aquí con toda intención.

Los proveedores serios de esta tecnología (los que dan acceso a bases de datos de hashes reales, no solo al algoritmo de comparación) exigen que quien los solicita se registre y se verifique como una **entidad de servicio identificable** — una persona física o jurídica real, con responsabilidad legal asumida. Es una exigencia razonable: es exactamente el tipo de control que evita que herramientas tan sensibles caigan en manos equivocadas. Pero es, también, estructuralmente incompatible con un proyecto desarrollado y mantenido de forma anónima.

ELI no puede resolver esto en solitario mientras el desarrollo se mantenga anónimo. Queda documentado como limitación conocida del proyecto, con las alternativas investigadas y descartadas, para que la comunidad y cualquier entidad legal futura (ver "Gobernanza y futuro") pueda retomarlo con la capacidad legal que este desarrollo inicial no tiene.

### Sobre el creador

ELI fue creado bajo el seudónimo **Prometheus**, quien se desvincula del proyecto 30 días después del lanzamiento. A partir de ese momento, ELI no tiene propietario — tiene una comunidad. La intención desde el diseño fue que el proyecto pudiera sobrevivir sin depender de una sola persona.

### Gobernanza y futuro

Como el creador desaparece a los 30 días del lanzamiento, alguien tiene que poder gestionar lo que un smart contract no puede: relaciones con proveedores reales, cuentas bancarias, y cobros a las tiendas y empresas verificadas del Mercado. Ningún individuo debería asumir esa responsabilidad en nombre de un proyecto que ya no tiene dueño.

Por eso se insta a la comunidad a constituir, tras el lanzamiento, una **fundación sin ánimo de lucro** (propuesta: una NPO/MTÜ en Estonia, con gestión 100% online mediante e-residency) que se convierta en la responsable legal de las **cuentas de Mercado** — cobros de las tiendas y empresas verificadas, y la infraestructura técnica del proyecto (servidor, dominio, APIs). Esta fundación gestiona la actividad económica del Mercado; **nunca gestiona el dinero de Solidaria**, que permanece siempre bajo el control exclusivo del smart contract, fuera del alcance de cualquier entidad, incluida esta fundación.

Cualquier persona con conocimientos legales, contables o de gobernanza sin ánimo de lucro es bienvenida a proponer y liderar esta constitución a través de un Issue en GitHub.

### Marca y licencia

El código de ELI es software libre (**AGPLv3**): cualquiera puede copiarlo, modificarlo, auditarlo y distribuirlo. Esa licencia cubre el código — no cubre el nombre ni el logo.

**El nombre "ELI" y su logo no pueden usarse en forks ni versiones derivadas.** Cualquiera que parta de este código para lanzar su propia versión debe:

1. Usar un **nombre y un logo propios**, distintos de "ELI" y de cualquier variación que pueda confundirse con él.
2. Si decide conservar la pestaña **Solidaria** (no es obligatorio quitarla), debe mantenerla funcionando con sus reglas de reparto, plazos y transparencia tal como están descritas en `SOLIDARIA.md` — no puede llamarse "Solidaria" y funcionar de otra forma, ni redirigir el fondo a un tercero.
3. **No presentarse como la continuación oficial de ELI.** Ningún fork hereda automáticamente la legitimidad del proyecto original por usar el mismo código.

Los detalles completos de esta licencia de marca están en [`BRAND.md`](./BRAND.md).

### Contribuir

El código es vuestro. Revisadlo, encontrad los errores, blindad la seguridad y haced que esta red vuele más alto. Guía de contribución en [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

*ELI — Vamos a cambiar el mundo. / We are going to change the world.*
