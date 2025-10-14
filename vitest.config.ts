import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e', 'src/test/e2e/**', '.astro'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/e2e/',
        'src/test/setup.ts',
        '**/*.config.*',
        '**/*.d.ts',
        'dist/',
        'e2e/',
      ],
    },
  },
});
