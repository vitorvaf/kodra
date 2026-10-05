import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  // The bundled declarations drop the template's `declare module` MUI
  // augmentations; the build script copies them next to index.d.ts and
  // this banner references them, so consumers see the extra variants
  // (Chip "light", palette shades, customShadows).
  dts: { banner: '/// <reference path="./mui-augmentation.d.ts" />' },
  sourcemap: true,
  clean: true,
});
