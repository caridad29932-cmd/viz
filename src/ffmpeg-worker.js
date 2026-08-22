/**
 * High-Quality Offline FFmpeg Composition Exporter
 * Renders composition frames headlessly and mixes audio tracks via Web Audio,
 * then muxes video + audio using FFmpeg WebAssembly.
 */
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg = null;
let ffmpegLoaded = false;

const CORE_FILES = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

function resolveCoreUrl(filename) {
  // Vite replaces import.meta.env.BASE_URL with the configured base path.
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return `${normalized}ffmpeg-core/${filename}`;
}

/**
 * Loads FFmpeg WASM instance, preferring self-hosted core files.
 */
export async function loadFFmpeg(onProgress) {
  if (ffmpegLoaded && ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    console.log('[ffmpeg]', message);
  });

  if (onProgress) onProgress(0);

  try {
    const coreURL = new URL(resolveCoreUrl('ffmpeg-core.js'), window.location.href).href;
    const wasmURL = await toBlobURL(resolveCoreUrl('ffmpeg-core.wasm'), 'application/wasm');

    await ffmpeg.load({
      coreURL,
      wasmURL,
    });

    ffmpegLoaded = true;
    if (onProgress) onProgress(100);
    return ffmpeg;
  } catch (err) {
    console.warn('Self-hosted FFmpeg core failed, trying CDN fallback:', err);
    try {
      const coreURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js';
      const wasmURL = await toBlobURL(
        'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm',
        'application/wasm'
      );

      await ffmpeg.load({
        coreURL,
        wasmURL,
      });
      ffmpegLoaded = true;
      if (onProgress) onProgress(100);
      return ffmpeg;
    } catch (fallbackErr) {
      ffmpeg = null;
      ffmpegLoaded = false;
      const msg = fallbackErr?.message || String(fallbackErr) || 'Unknown error';
      throw new Error(`FFmpeg load failed: ${msg}`);
    }
  }
}

export function isFFmpegLoaded() {
  return ffmpegLoaded;
}

async function cleanupFiles(fileList) {
  if (!ffmpeg) return;
  for (const name of fileList) {
    try { await ffmpeg.deleteFile(name); } catch (e) {}
  }
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function decodeAudioData(arrayBuffer) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx.decodeAudioData(arrayBuffer.slice(0)).finally(() => {
    try { ctx.close(); } catch(e) {}
  });
}

/**
 * Renders a mixed AudioBuffer for all audio/video clips in the composition.
 */
async function renderMixedAudio(composition, onProgress) {
  const sampleRate = 48000;
  const duration = composition.duration;
  const channels = 2;
  const length = Math.ceil(duration * sampleRate);

  if (length === 0) return null;

  const audioClips = composition.clips.filter(c => {
    if (c.type !== 'audio' && c.type !== 'video') return false;
    const track = composition.getTrack(c.trackId);
    if (track && (track.muted || !track.visible)) return false;
    return Boolean(c.file || c.src);
  });

  if (audioClips.length === 0) return null;

  const offlineCtx = new OfflineAudioContext(channels, length, sampleRate);

  let decodedCount = 0;
  for (let i = 0; i < audioClips.length; i++) {
    const clip = audioClips[i];
    try {
      let arrayBuffer = null;
      if (clip.file) {
        arrayBuffer = await readFileAsArrayBuffer(clip.file);
      } else if (clip.src) {
        const res = await fetch(clip.src);
        arrayBuffer = await res.arrayBuffer();
      }

      if (!arrayBuffer) continue;
      const decoded = await decodeAudioData(arrayBuffer);
      if (!decoded) continue;

      const source = offlineCtx.createBufferSource();
      source.buffer = decoded;

      const gain = offlineCtx.createGain();
      gain.gain.value = clip.volume ?? 1;

      source.connect(gain);
      gain.connect(offlineCtx.destination);

      const offset = clip.trimStart || 0;
      const start = Math.max(0, clip.startTime);
      const maxDur = Math.min(clip.duration, Math.max(0, decoded.duration - offset));
      if (maxDur > 0.01) {
        source.start(start, offset, maxDur);
      }

      decodedCount++;
      if (onProgress) onProgress(Math.round(((i + 1) / audioClips.length) * 100));
    } catch (err) {
      console.warn(`Could not decode audio for clip "${clip.name}":`, err);
    }
  }

  if (decodedCount === 0) return null;

  return await offlineCtx.startRendering();
}

/**
 * Converts an AudioBuffer to a standard 16-bit stereo PCM WAV Blob.
 */
function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataByteCount = buffer.length * blockAlign;
  const bufferByteCount = 44 + dataByteCount;

  const arrayBuffer = new ArrayBuffer(bufferByteCount);
  const view = new DataView(arrayBuffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /* RIFF identifier */
  writeString(0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + dataByteCount, true);
  /* RIFF type */
  writeString(8, 'WAVE');
  /* format chunk identifier */
  writeString(12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw PCM) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(36, 'data');
  /* data chunk length */
  view.setUint32(40, dataByteCount, true);

  // Write interleaved PCM 16-bit samples
  let offset = 44;
  const channels = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = Math.max(-1, Math.min(1, channels[c][i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function seekVideoToOffset(video, offset) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - offset) < 0.01 && video.readyState >= 2) {
      resolve();
      return;
    }
    let handled = false;
    const cleanup = () => {
      if (handled) return;
      handled = true;
      video.removeEventListener('seeked', cleanup);
      resolve();
    };
    video.addEventListener('seeked', cleanup);
    try {
      video.currentTime = offset;
    } catch (e) {
      cleanup();
      return;
    }
    setTimeout(cleanup, 250);
  });
}

/**
 * High quality offline frame export with audio mixing and FFmpeg MP4 encoding.
 */
export async function exportComposition(composition, canvasPreview, onProgress) {
  const duration = composition.duration;
  if (duration <= 0) {
    throw new Error('Composition is empty');
  }

  // 1. Ensure FFmpeg is loaded
  if (!ffmpegLoaded || !ffmpeg) {
    if (onProgress) onProgress(2);
    await loadFFmpeg();
  }

  const inputFiles = [];
  let offscreenCanvas = null;

  try {
    if (onProgress) onProgress(5);

    // 2. Render mixed audio
    let audioBuffer = null;
    try {
      audioBuffer = await renderMixedAudio(composition, (pct) => {
        if (onProgress) onProgress(5 + Math.round(pct * 0.15));
      });
    } catch (audioErr) {
      console.warn('Audio mixing failed, continuing with video only:', audioErr);
    }

    const hasAudio = Boolean(audioBuffer && audioBuffer.length > 0 && audioBuffer.duration > 0.05);

    if (onProgress) onProgress(20);

    // 3. Setup offscreen canvas
    offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = composition.width || 1920;
    offscreenCanvas.height = composition.height || 1080;
    const offCtx = offscreenCanvas.getContext('2d');

    const fps = 30;
    const totalFrames = Math.ceil(duration * fps);
    const frameDuration = 1 / fps;
    const videoClips = composition.clips.filter(c => c.type === 'video' && c.element);

    // 4. Render and write each frame to FFmpeg MEMFS
    for (let f = 0; f < totalFrames; f++) {
      const time = f * frameDuration;

      const seekPromises = [];
      for (const vClip of videoClips) {
        if (time >= vClip.startTime && time <= vClip.startTime + vClip.duration) {
          const offset = time - vClip.startTime + vClip.trimStart;
          seekPromises.push(seekVideoToOffset(vClip.element, offset));
        }
      }
      if (seekPromises.length > 0) {
        await Promise.all(seekPromises);
      }

      canvasPreview.renderOffline(offCtx, time, offscreenCanvas.width, offscreenCanvas.height);

      const frameBlob = await new Promise((resolve) => {
        offscreenCanvas.toBlob(resolve, 'image/jpeg', 0.92);
      });

      if (!frameBlob) {
        throw new Error(`Failed to capture canvas frame ${f}`);
      }

      const frameName = `frame_${String(f).padStart(5, '0')}.jpg`;
      const frameBuffer = await fetchFile(frameBlob);
      await ffmpeg.writeFile(frameName, frameBuffer);
      inputFiles.push(frameName);

      const progressPct = 20 + Math.round((f / totalFrames) * 60);
      if (onProgress) onProgress(progressPct);
    }

    if (onProgress) onProgress(82);

    // 5. Write audio if present
    if (hasAudio) {
      const wavBlob = audioBufferToWav(audioBuffer);
      const wavData = await fetchFile(wavBlob);
      await ffmpeg.writeFile('audio.wav', wavData);
      inputFiles.push('audio.wav');
    }

    // 6. Encode H.264 + AAC MP4 with FFmpeg
    const logMessages = [];
    const logCb = ({ message }) => {
      logMessages.push(message);
      console.log('[ffmpeg]', message);
    };
    ffmpeg.on('log', logCb);

    const args = [
      '-framerate', '30',
      '-start_number', '0',
      '-i', 'frame_%05d.jpg',
    ];

    if (hasAudio) {
      args.push('-i', 'audio.wav');
    }

    args.push(
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p'
    );

    if (hasAudio) {
      args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
    } else {
      args.push('-an');
    }

    args.push('export.mp4');

    const ret = await ffmpeg.exec(args);
    ffmpeg.off('log', logCb);
    inputFiles.push('export.mp4');

    if (ret !== 0) {
      const errDetail = logMessages.slice(-15).join('\n');
      throw new Error(`FFmpeg encoding failed (exit code ${ret}):\n${errDetail}`);
    }

    if (onProgress) onProgress(95);

    const mp4Data = await ffmpeg.readFile('export.mp4');

    if (!mp4Data || mp4Data.length === 0) {
      throw new Error('FFmpeg failed to produce output MP4');
    }

    if (onProgress) onProgress(100);
    return { blob: new Blob([mp4Data.buffer], { type: 'video/mp4' }), ext: 'mp4' };
  } finally {
    await cleanupFiles(inputFiles);
    if (offscreenCanvas) {
      offscreenCanvas.width = 0;
      offscreenCanvas.height = 0;
      offscreenCanvas = null;
    }
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}
