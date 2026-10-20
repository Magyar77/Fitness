// Writes private/seed/personal-seed.json from private/seed/personalSeed.ts (validated first).
// Copy that file to the phone and load it with More → Import data.
// Uses Vite's module loader, so no extra TypeScript tooling is needed.
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', configFile: false });
try {
  const { PERSONAL_SEED } = await server.ssrLoadModule('/private/seed/personalSeed.ts');
  const { validateBundle } = await server.ssrLoadModule('/src/engine/import/validateBundle.ts');
  const { PROGRAM_V2 } = await server.ssrLoadModule('/src/engine/program/programV2.ts');
  const { EXERCISES_BY_ID } = await server.ssrLoadModule('/src/engine/library/exercises.ts');

  const problems = validateBundle(PERSONAL_SEED, [PROGRAM_V2], EXERCISES_BY_ID);
  if (problems.length) {
    console.error('Seed is invalid:\n- ' + problems.join('\n- '));
    process.exitCode = 1;
  } else {
    const out = new URL('../private/seed/personal-seed.json', import.meta.url);
    writeFileSync(out, JSON.stringify(PERSONAL_SEED, null, 1));
    const s = PERSONAL_SEED;
    console.log(`wrote private/seed/personal-seed.json: ${s.sessions.length} sessions, ${s.sets.length} sets, ${s.prescriptions.length} targets, ${s.weekPlans.length} week plans, ${s.bodyWeights.length} body weights`);
  }
} finally {
  await server.close();
}
