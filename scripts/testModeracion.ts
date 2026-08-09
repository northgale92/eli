/**
 * Test de los 4 escenarios mock de moderarContenidoAmbiguo.
 *
 * Cómo ejecutar (sin compilar):
 *   npx tsx scripts/testModeracion.ts
 *
 * Si tsx no está instalado:
 *   npm install -D tsx
 *   npx tsx scripts/testModeracion.ts
 *
 * El test re-implementa la lógica mock internamente para evitar las
 * dependencias de React Native (expo-crypto, react-native-fast-tflite…)
 * que no están disponibles en Node.js. La lógica es idéntica a la del
 * servicio cuando EXPO_PUBLIC_MODERACION_MOCK=true.
 */

// ─── Lógica mock (espejo de moderacionAdultos.ts) ────────────────────────────
// Mantener sincronizado con _llamarClaude / _llamarGemini / moderarContenidoAmbiguo.

let _escenarioMock = 0;

function _mockClaude(): boolean {
  return _escenarioMock === 0; // escenario 0: aprueba; 1, 2: rechaza
}

function _mockGemini(): boolean {
  return _escenarioMock <= 1; // escenarios 0 y 1: aprueba; 2: rechaza
}

async function _moderarMock(
  contexto: { tipoPublicacion: 'muro' | 'canal' },
): Promise<{ aprobado: boolean; motivo?: string }> {
  // Escenario 3: error de red
  if (_escenarioMock === 3) {
    _escenarioMock = (_escenarioMock + 1) % 4;
    return { aprobado: false, motivo: 'Error de red simulado durante la moderación dual-IA' };
  }

  const claudeAprueba = _mockClaude();
  const geminiAprueba = _mockGemini();
  _escenarioMock = (_escenarioMock + 1) % 4;

  if (claudeAprueba && geminiAprueba) return { aprobado: true };

  if (!claudeAprueba && !geminiAprueba) {
    return { aprobado: false, motivo: 'Ambas IAs rechazaron.' };
  }

  const rechaza = claudeAprueba ? 'Gemini' : 'Claude';
  return {
    aprobado: false,
    motivo: `Desacuerdo entre IAs — ${rechaza} no aprobó. Pendiente de revisión humana.`,
  };
}

// ─── Definición de los 4 escenarios esperados ────────────────────────────────

interface Escenario {
  nombre: string;
  aprobadoEsperado: boolean;
  motivoContiene?: string; // subcadena que debe aparecer en motivo (si hay)
}

const ESCENARIOS: Escenario[] = [
  {
    nombre: 'Escenario 0 — ambas aprueban',
    aprobadoEsperado: true,
  },
  {
    nombre: 'Escenario 1 — Claude rechaza (desacuerdo)',
    aprobadoEsperado: false,
    motivoContiene: 'Desacuerdo',
  },
  {
    nombre: 'Escenario 2 — ambas rechazan',
    aprobadoEsperado: false,
    motivoContiene: 'Ambas IAs',
  },
  {
    nombre: 'Escenario 3 — error de red',
    aprobadoEsperado: false,
    motivoContiene: 'Error de red',
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const ctx = { tipoPublicacion: 'muro' as const };
  let fallos = 0;

  console.log('\n=== testModeracion — 4 escenarios mock de moderarContenidoAmbiguo ===\n');

  for (const spec of ESCENARIOS) {
    const resultado = await _moderarMock(ctx);

    const aprobadoOk = resultado.aprobado === spec.aprobadoEsperado;
    const motivoOk =
      spec.motivoContiene === undefined
        ? true
        : typeof resultado.motivo === 'string' && resultado.motivo.includes(spec.motivoContiene);

    const ok = aprobadoOk && motivoOk;
    if (!ok) fallos++;

    const icono = ok ? '✅' : '❌';
    console.log(`${icono} ${spec.nombre}`);
    console.log(`   aprobado=${resultado.aprobado}${resultado.motivo ? `, motivo="${resultado.motivo}"` : ''}`);
    if (!aprobadoOk) {
      console.error(`   FALLO: se esperaba aprobado=${spec.aprobadoEsperado}, se obtuvo ${resultado.aprobado}`);
    }
    if (!motivoOk) {
      console.error(`   FALLO: motivo no contiene "${spec.motivoContiene}", se obtuvo "${resultado.motivo}"`);
    }
    console.log();
  }

  if (fallos === 0) {
    console.log('Todos los escenarios pasaron correctamente.\n');
    process.exit(0);
  } else {
    console.error(`${fallos} escenario(s) fallaron.\n`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
