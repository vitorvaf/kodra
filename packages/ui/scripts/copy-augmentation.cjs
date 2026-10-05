// Ships the MUI module augmentations next to the emitted declarations
// (dist/index.d.ts references them). Runs after tsup: its declaration
// step clears .d.ts files it did not emit.
const { copyFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
copyFileSync(
  join(root, 'src/types/mui-augmentation.d.ts'),
  join(root, 'dist/mui-augmentation.d.ts'),
);
