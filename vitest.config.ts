import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          restoreMocks: true,
          // Los benchmarks viven en una variante `unit (bench)` que Vitest crea
          // automáticamente al ejecutar `npm run bench`; no entran en `npm test`.
          benchmark: { include: ['tests/bench/**/*.bench.ts'] },
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.{ts,tsx}'],
          environment: 'node',
          testTimeout: 15_000,
          restoreMocks: true,
          benchmark: { include: [] },
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 30_000,
          restoreMocks: true,
          benchmark: { include: [] },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.d.ts',
        'src/cli.tsx',
        'src/ui/**',
        'src/commands/continue.ts',
        'src/commands/doctor.ts',
        'src/commands/favorite.ts',
        'src/commands/history.ts',
        'src/commands/mark.ts',
        'src/commands/self-update.ts',
        'src/core/playback/**',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});
