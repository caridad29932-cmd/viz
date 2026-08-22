import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.resolve(__dirname, '../node_modules/@ffmpeg/core/dist/esm');
const destDir = path.resolve(__dirname, '../public/ffmpeg-core');

const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

for (const file of files) {
  const src = path.join(srcDir, file);
  const dest = path.join(destDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} to public/ffmpeg-core/`);
  } else {
    console.warn(`Missing ${file} in ${srcDir}`);
    process.exitCode = 1;
  }
}
