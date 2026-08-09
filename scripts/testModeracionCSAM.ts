/**
 * Test de moderarCSAM (services/moderacionCSAM.ts): 3 escenarios mock +
 * verificación de fail-closed ante error.
 *
 * moderarCSAM está gateada por EXPO_PUBLIC_MODERACION_MOCK: sin esa
 * variable bloquea siempre (fail-closed, comportamiento de producción sin
 * backend real). Para probar los 3 escenarios mock hay que activarla.
 *
 * Cómo ejecutar (sin compilar):
 *   EXPO_PUBLIC_MODERACION_MOCK=true npx tsx scripts/testModeracionCSAM.ts
 *
 *   En PowerShell:
 *   $env:EXPO_PUBLIC_MODERACION_MOCK='true'; npx tsx scripts/testModeracionCSAM.ts
 *
 * A diferencia de scripts/testModeracion.ts, este script importa la función
 * real del servicio en lugar de mirrorearla: moderacionCSAM.ts no depende de
 * módulos de React Native (expo-crypto, react-native-fast-tflite…), así que
 * es seguro ejecutarlo directamente en Node.
 */

import {
  moderarCSAM,
  resetarEscenarioMockCSAM,
  CONTENIDO_SIMULAR_ERROR_CSAM,
  type ResultadoModeracionCSAM,
} from '../services/moderacionCSAM';

interface Escenario {
  nombre: string;
  contenido: string;
  aprobadoEsperado: boolean;
  bloqueadoPorEsperado?: ResultadoModeracionCSAM['bloqueadoPor'];
}

const ESCENARIOS: Escenario[] = [
  {
    nombre: 'Escenario 0 — clasificador limpio + hash limpio',
    contenido: 'contenido-de-prueba-0',
    aprobadoEsperado: true,
  },
  {
    nombre: 'Escenario 1 — clasificador marca contenido',
    contenido: 'contenido-de-prueba-1',
    aprobadoEsperado: false,
    bloqueadoPorEsperado: 'clasificador',
  },
  {
    nombre: 'Escenario 2 — hash matching positivo',
    contenido: 'contenido-de-prueba-2',
    aprobadoEsperado: false,
    bloqueadoPorEsperado: 'hash_matching',
  },
];

async function main(): Promise<void> {
  let fallos = 0;

  console.log('\n=== testModeracionCSAM — 3 escenarios mock + fail-closed ===\n');

  resetarEscenarioMockCSAM();

  for (const spec of ESCENARIOS) {
    const resultado = await moderarCSAM(spec.contenido);

    const aprobadoOk = resultado.aprobado === spec.aprobadoEsperado;
    const motivoOk = spec.bloqueadoPorEsperado === undefined
      ? resultado.bloqueadoPor === undefined
      : resultado.bloqueadoPor === spec.bloqueadoPorEsperado;

    const ok = aprobadoOk && motivoOk;
    if (!ok) fallos++;

    const icono = ok ? '✅' : '❌';
    console.log(`${icono} ${spec.nombre}`);
    console.log(`   aprobado=${resultado.aprobado}${resultado.bloqueadoPor ? `, bloqueadoPor="${resultado.bloqueadoPor}"` : ''}`);
    if (!aprobadoOk) {
      console.error(`   FALLO: se esperaba aprobado=${spec.aprobadoEsperado}, se obtuvo ${resultado.aprobado}`);
    }
    if (!motivoOk) {
      console.error(`   FALLO: se esperaba bloqueadoPor="${spec.bloqueadoPorEsperado}", se obtuvo "${resultado.bloqueadoPor}"`);
    }
    console.log();
  }

  // ── Determinismo: repetir el ciclo completo debe dar la misma secuencia ────
  resetarEscenarioMockCSAM();
  let determinista = true;
  for (const spec of ESCENARIOS) {
    const resultado = await moderarCSAM(spec.contenido);
    if (resultado.aprobado !== spec.aprobadoEsperado || resultado.bloqueadoPor !== spec.bloqueadoPorEsperado) {
      determinista = false;
    }
  }
  console.log(determinista ? '✅ Determinismo — segunda pasada idéntica a la primera' : '❌ Determinismo — la segunda pasada difirió');
  if (!determinista) fallos++;
  console.log();

  // ── Fail-closed: un error nunca debe traducirse en aprobado ─────────────────
  resetarEscenarioMockCSAM();
  const resultadoError = await moderarCSAM(CONTENIDO_SIMULAR_ERROR_CSAM);
  const failClosedOk = resultadoError.aprobado === false && resultadoError.bloqueadoPor === 'error';
  console.log(failClosedOk ? '✅ Fail-closed — error simulado bloquea' : '❌ Fail-closed — error simulado NO bloqueó');
  console.log(`   aprobado=${resultadoError.aprobado}, bloqueadoPor="${resultadoError.bloqueadoPor}"`);
  if (!failClosedOk) {
    console.error('   FALLO CRÍTICO: un error debe bloquear siempre, nunca aprobar por defecto.');
    fallos++;
  }
  console.log();

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
