/**
 * Audio waveform generation and caching.
 * Uses Web Audio API to decode audio and compute peak/RMS samples.
 */

const waveformCache = new Map();

export async function getWaveform(src, options = {}) {
  const cacheKey = `${src}:${options.samples || 200}:${options.channel || 0}`;
  if (waveformCache.has(cacheKey)) {
    return waveformCache.get(cacheKey);
  }

  try {
    const data = await generateWaveform(src, options);
    waveformCache.set(cacheKey, data);
    return data;
  } catch (e) {
    console.warn('Waveform generation failed:', e);
    return null;
  }
}

export function clearWaveformCache(src) {
  if (!src) {
    waveformCache.clear();
    return;
  }
  for (const key of waveformCache.keys()) {
    if (key.startsWith(src + ':')) waveformCache.delete(key);
  }
}

async function generateWaveform(src, { samples = 200, channel = 0 } = {}) {
  const arrayBuffer = await fetchAudioAsArrayBuffer(src);
  if (!arrayBuffer) return null;

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  await ctx.close();

  const ch = audioBuffer.getChannelData(Math.min(channel, audioBuffer.numberOfChannels - 1));
  const step = Math.floor(ch.length / samples);
  const peaks = [];

  for (let i = 0; i < samples; i++) {
    let min = 0;
    let max = 0;
    let sumSquares = 0;
    let count = 0;
    const start = i * step;
    const end = Math.min(start + step, ch.length);
    for (let j = start; j < end; j++) {
      const s = ch[j];
      if (s < min) min = s;
      if (s > max) max = s;
      sumSquares += s * s;
      count++;
    }
    peaks.push({
      min,
      max,
      rms: count > 0 ? Math.sqrt(sumSquares / count) : 0
    });
  }

  return {
    duration: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
    samples,
    peaks
  };
}

async function fetchAudioAsArrayBuffer(src) {
  if (src instanceof File || src instanceof Blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(src);
    });
  }
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`);
  return res.arrayBuffer();
}

export function drawWaveform(ctx, waveform, x, y, width, height, options = {}) {
  if (!waveform || !waveform.peaks.length) return;

  const { peaks } = waveform;
  const step = width / peaks.length;
  const center = y + height / 2;

  ctx.fillStyle = options.color || 'rgba(139, 92, 246, 0.7)';
  for (let i = 0; i < peaks.length; i++) {
    const peak = peaks[i];
    const h = Math.max(1, peak.rms * height);
    const px = x + i * step;
    const py = center - h / 2;
    ctx.fillRect(px, py, Math.max(1, step - 0.5), h);
  }
}
