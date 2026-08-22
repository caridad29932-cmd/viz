/**
 * Centralized project/timeline/playback/export state management.
 * Keeps state domains separated and provides observable subscriptions.
 */

export class StateStore {
  constructor(initial = {}) {
    this.state = { ...initial };
    this.listeners = new Map();
    this._batch = false;
    this._pendingKeys = new Set();
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    if (this.state[key] === value) return;
    this.state[key] = value;
    this._pendingKeys.add(key);
    if (!this._batch) this._flush();
  }

  setMany(entries) {
    let changed = false;
    for (const [key, value] of Object.entries(entries)) {
      if (this.state[key] !== value) {
        this.state[key] = value;
        this._pendingKeys.add(key);
        changed = true;
      }
    }
    if (changed && !this._batch) this._flush();
  }

  subscribe(key, callback) {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(callback);
    return () => this.listeners.get(key).delete(callback);
  }

  batch(fn) {
    this._batch = true;
    try {
      fn();
    } finally {
      this._batch = false;
      this._flush();
    }
  }

  _flush() {
    if (this._pendingKeys.size === 0) return;
    const keys = Array.from(this._pendingKeys);
    this._pendingKeys.clear();
    for (const key of keys) {
      const callbacks = this.listeners.get(key);
      if (!callbacks) continue;
      const value = this.state[key];
      for (const cb of callbacks) {
        try { cb(value, key); } catch (e) { console.error(e); }
      }
    }
  }
}

export const createDefaultStore = () => new StateStore({
  isPlaying: false,
  currentTime: 0,
  zoomLevel: 1,
  selectedClipId: null,
  isExporting: false,
  exportProgress: 0,
  exportStage: '',
  showShortcuts: false,
  snapEnabled: true,
  proxyEnabled: true,
});
