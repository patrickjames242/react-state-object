import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: ['react', 'mobx'],
  esbuildOptions(options) {
    options.supported = {
      ...options.supported,
      // Ensure standard decorators syntax (e.g. `@observable accessor`)
      // is accepted in TS source compiled through tsup/esbuild.
      decorators: true,
    };
  },
});
