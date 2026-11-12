import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        globals: true,
        root: './',
        include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    },
});
//# sourceMappingURL=vitest.config.e2e.js.map