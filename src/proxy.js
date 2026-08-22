/**
 * Proxy media generation for smooth editing of high-resolution footage.
 * Generates lower-resolution versions asynchronously using ffmpeg.wasm or canvas.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const proxyCache = new Map();

export function getProxyStatus(src) {
  return proxyCache.get(src) || { state: 'none' };
}

export async function generateProxy(file, src, targetHeight = 540, onProgress) {
  if (!file) return null;
  if (proxyCache.has(src)) return proxyCache.get(src).url;

  proxyCache.set(src, { state: 'generating', url: null });

  try {
    const proxyUrl = await generateProxyWithFFmpeg(file, targetHeight, onProgress);
    proxyCache.set(src, { state: 'ready', url: proxyUrl });
    return proxyUrl;
  } catch (e) {
    console.warn('Proxy generation failed, falling back to original:', e);
    proxyCache.set(src, { state: 'failed', url: src });
    return src;
  }
}

async function generateProxyWithFFmpeg(file, targetHeight, onProgress) {
  const ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ message }) => console.log('[proxy]', message));

  try {
    const coreURL = new URL('/viz/ffmpeg-core/ffmpeg-core.js', window.location.href).href;
    const wasmURL = await toBlobURL('/viz/ffmpeg-core/ffmpeg-core.wasm', 'application/wasm');
    await ffmpeg.load({ coreURL, wasmURL });
  } catch (e) {
    // Try CDN fallback
    const coreURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js';
    const wasmURL = await toBlobURL(
      'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm',
      'application/wasm'
    );
    await ffmpeg.load({ coreURL, wasmURL });
  }

  const inputName = `input_${Date.now()}`;
  const outputName = `proxy_${Date.now()}.mp4`;

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  const args = [
    '-i', inputName,
    '-vf', `scale=-2:${targetHeight}`,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-an',
    '-movflags', '+faststart',
    outputName
  ];

  const ret = await ffmpeg.exec(args);
  if (ret !== 0) throw new Error('FFmpeg proxy generation failed');

  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data.buffer], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);

  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return url;
}

export function revokeProxy(src) {
  const entry = proxyCache.get(src);
  if (entry?.url && entry.url !== src) {
    URL.revokeObjectURL(entry.url);
  }
  proxyCache.delete(src);
}
