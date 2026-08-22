/**
 * Utility functions for the Viz video editor.
 */

/**
 * Formats seconds into HH:MM:SS.ms display string.
 */
export function formatTime(seconds, showMs = true) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);

  const parts = [];
  if (h > 0) parts.push(String(h).padStart(2, '0'));
  parts.push(String(m).padStart(2, '0'));
  parts.push(String(s).padStart(2, '0'));

  let result = parts.join(':');
  if (showMs) result += '.' + String(ms).padStart(2, '0');
  return result;
}

/**
 * Clamps a value between min and max.
 */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Generates a unique ID string.
 */
export function uid() {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Supported MIME types and extensions.
 */
export const SUPPORTED_TYPES = {
  video: {
    'video/mp4': ['.mp4'],
    'video/webm': ['.webm'],
    'video/quicktime': ['.mov'],
  },
  image: {
    'image/png': ['.png'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/webp': ['.webp'],
    'image/gif': ['.gif'],
  },
  audio: {
    'audio/mpeg': ['.mp3'],
    'audio/wav': ['.wav'],
    'audio/aac': ['.aac'],
    'audio/ogg': ['.ogg'],
    'audio/mp4': ['.m4a'],
  }
};

/**
 * Maximum file size in bytes (2 GB).
 */
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

/**
 * Validates a media file for supported type and size.
 */
export function validateFile(file, type = 'video') {
  const map = SUPPORTED_TYPES[type];
  if (!map) {
    return { valid: false, error: `Unknown media type "${type}"` };
  }

  const validMime = Object.keys(map).includes(file.type);
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  const validExt = Object.values(map).flat().includes(ext);

  if (!validMime && !validExt) {
    const allowed = Object.values(map).flat().join(', ');
    return {
      valid: false,
      error: `Unsupported format "${ext}". Please use ${allowed} files.`,
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      error: `File too large (${sizeMB} MB). Maximum size is 2 GB.`,
    };
  }

  return { valid: true };
}

/**
 * Escapes HTML characters in a string to prevent XSS attacks.
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Creates and shows a toast notification.
 */
export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = {
    error: '⚠️',
    success: '✅',
    warning: '⚡',
    info: 'ℹ️',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${escapeHtml(String(message))}</span>
    <button class="toast-close" aria-label="Dismiss">✕</button>
  `;

  container.appendChild(toast);

  const dismiss = () => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  };

  toast.querySelector('.toast-close').addEventListener('click', dismiss);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}

/**
 * Throttles a function call.
 */
export function throttle(fn, delay) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn.apply(this, args);
    }
  };
}
