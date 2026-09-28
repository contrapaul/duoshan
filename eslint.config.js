import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * The rule that matters is the architecture boundary at the bottom.
 * `src/sim/`, `src/bots/` and `src/net/` are pure: no renderer, no physics
 * engine, no DOM, no unseeded randomness. That is what lets the same code run
 * as the referee in a Durable Object, in the browser, and headless in tests.
 * See PROJECT_PLAN.md §13.4.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.wrangler/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/sim/**/*.ts', 'src/bots/**/*.ts', 'src/net/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'three', message: 'sim/bots/net never import the renderer.' },
            { name: '@dimforge/rapier3d-compat', message: 'Rapier is client-side cosmetics only.' },
          ],
          patterns: [{ group: ['**/render/**', '**/app/**'], message: 'sim/bots/net never import render/ or app/.' }],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'performance'],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use the seeded rng in sim/rng.ts.' }],
    },
  },
);
