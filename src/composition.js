/**
 * Composition Data Model & State Management
 * Handles multi-track timeline data, clip lifecycle, tracks, and history stack.
 */
import { uid } from './utils.js';
import { History } from './history.js';

export class Composition {
  constructor(width = 1920, height = 1080) {
    this.width = width;
    this.height = height;

    this.tracks = [
      { id: 'v1', type: 'video', name: 'Video 1', locked: false, muted: false, visible: true },
      { id: 'v2', type: 'video', name: 'Video 2', locked: false, muted: false, visible: true },
      { id: 'img1', type: 'image', name: 'Image Overlay', locked: false, muted: false, visible: true },
      { id: 'txt1', type: 'text', name: 'Text Overlay', locked: false, muted: false, visible: true },
      { id: 'a1', type: 'audio', name: 'Audio 1', locked: false, muted: false, visible: true },
      { id: 'a2', type: 'audio', name: 'Audio 2', locked: false, muted: false, visible: true },
    ];

    this.clips = [];
    this.selectedClipId = null;
    this.history = new History(100);

    // Internal clip registry by id for O(1) lookups
    this._clipMap = new Map();

    // Push initial blank state so undo can return here
    this._pushSnapshot('new project');
  }

  get duration() {
    let maxEnd = 5;
    for (const clip of this.clips) {
      const clipEnd = clip.startTime + clip.duration;
      if (clipEnd > maxEnd) maxEnd = clipEnd;
    }
    return maxEnd;
  }

  addAudioTrack() {
    const audioTrackCount = this.tracks.filter(t => t.type === 'audio').length;
    if (audioTrackCount >= 10) {
      throw new Error('Maximum 10 audio tracks allowed');
    }
    const trackId = `a${audioTrackCount + 1}`;
    const track = {
      id: trackId,
      type: 'audio',
      name: `Audio ${audioTrackCount + 1}`,
      locked: false,
      muted: false,
      visible: true
    };
    this.tracks.push(track);
    this._pushSnapshot('add audio track');
    return track;
  }

  getTrack(trackId) {
    return this.tracks.find(t => t.id === trackId);
  }

  addClip(clipData, { skipHistory = false } = {}) {
    const requestedStart = clipData.startTime || 0;
    const duration = clipData.duration || 5;

    // Find a non-overlapping start time on the requested track
    let startTime = requestedStart;
    const sameTrackClips = this.clips
      .filter(c => c.trackId === clipData.trackId)
      .sort((a, b) => a.startTime - b.startTime);

    for (const c of sameTrackClips) {
      const cEnd = c.startTime + c.duration;
      if (startTime < cEnd && startTime + duration > c.startTime) {
        startTime = Math.round((cEnd + 0.05) * 10) / 10;
      }
    }

    const clip = {
      id: clipData.id || uid(),
      trackId: clipData.trackId,
      type: clipData.type,
      name: clipData.name || 'Untitled Clip',
      startTime,
      duration,
      trimStart: clipData.trimStart || 0,
      trimEnd: clipData.trimEnd || duration,
      x: clipData.x ?? Math.round(this.width * 0.1),
      y: clipData.y ?? Math.round(this.height * 0.1),
      width: clipData.width ?? Math.round(this.width * 0.8),
      height: clipData.height ?? Math.round(this.height * 0.8),
      opacity: clipData.opacity ?? 1,
      volume: clipData.volume ?? 1,
      file: clipData.file || null,
      src: clipData.src || null,
      element: clipData.element || null,
      text: clipData.text || 'Sample Text',
      fontSize: clipData.fontSize || 64,
      fontFamily: clipData.fontFamily || 'Inter',
      customFontUrl: clipData.customFontUrl || null,
      fontWeight: clipData.fontWeight || 'normal',
      color: clipData.color || '#ffffff',
      bgColor: clipData.bgColor || 'transparent',
      textAlign: clipData.textAlign || 'center',
      keyframes: clipData.keyframes || null,
      proxySrc: clipData.proxySrc || null,
      proxyState: clipData.proxyState || 'none'
    };

    this.clips.push(clip);
    this._clipMap.set(clip.id, clip);
    this.selectedClipId = clip.id;

    if (!skipHistory) this._pushSnapshot('add clip');
    return clip;
  }

  removeClip(clipId, { skipHistory = false } = {}) {
    const idx = this.clips.findIndex(c => c.id === clipId);
    if (idx !== -1) {
      this.clips.splice(idx, 1);
      this._clipMap.delete(clipId);
      if (this.selectedClipId === clipId) {
        this.selectedClipId = null;
      }
      if (!skipHistory) this._pushSnapshot('delete clip');
      return true;
    }
    return false;
  }

  getClip(clipId) {
    return this._clipMap.get(clipId) || null;
  }

  getSelectedClip() {
    return this.getClip(this.selectedClipId);
  }

  updateClip(clipId, changes, { skipHistory = false } = {}) {
    const clip = this.getClip(clipId);
    if (!clip) return null;

    Object.assign(clip, changes);

    if (!skipHistory) this._pushSnapshot('update clip');
    return clip;
  }

  getClipsAtTime(time, endOverlap = 0) {
    const EPS = 1e-9;
    return this.clips.filter(c => {
      const track = this.getTrack(c.trackId);
      if (track && !track.visible) return false;
      const endTime = c.startTime + c.duration;
      return time + EPS >= c.startTime && time <= endTime + endOverlap + EPS;
    });
  }

  /**
   * Check whether placing a clip on a track at the given time range would overlap
   * any existing clip on that track. Pass the clip's own id to exclude itself.
   */
  clipOverlaps(clipId, trackId, startTime, duration) {
    const EPS = 1e-6;
    const endTime = startTime + duration;
    return this.clips.some(c => {
      if (c.id === clipId) return false;
      if (c.trackId !== trackId) return false;
      const cEnd = c.startTime + c.duration;
      return startTime + EPS < cEnd && endTime > c.startTime + EPS;
    });
  }

  setDimensions(width, height) {
    this.width = Math.max(100, Math.min(7680, Math.round(width)));
    this.height = Math.max(100, Math.min(7680, Math.round(height)));
    this._pushSnapshot('set dimensions');
  }

  // --- History ---
  _pushSnapshot(name) {
    const snapshot = {
      width: this.width,
      height: this.height,
      tracks: JSON.parse(JSON.stringify(this.tracks)),
      clips: this.clips.map(c => {
        const copy = { ...c };
        delete copy.element;
        return copy;
      }),
      selectedClipId: this.selectedClipId
    };

    const command = {
      name,
      do: () => {},
      undo: () => this._applySnapshot(snapshot),
      redo: () => this._applySnapshot(snapshot)
    };

    this.history.push(command);
  }

  canUndo() {
    return this.history.canUndo();
  }

  canRedo() {
    return this.history.canRedo();
  }

  undo() {
    return this.history.undo();
  }

  redo() {
    return this.history.redo();
  }

  _applySnapshot(snapshot) {
    if (snapshot.width) this.width = snapshot.width;
    if (snapshot.height) this.height = snapshot.height;
    this.tracks = JSON.parse(JSON.stringify(snapshot.tracks));

    const elementMap = new Map();
    for (const c of this.clips) {
      if (c.element) elementMap.set(c.id, c.element);
    }

    this.clips = snapshot.clips.map(c => {
      const clip = { ...c };
      if (elementMap.has(clip.id)) {
        clip.element = elementMap.get(clip.id);
      }
      this._clipMap.set(clip.id, clip);
      return clip;
    });

    // Clean up stale map entries
    const validIds = new Set(this.clips.map(c => c.id));
    for (const id of this._clipMap.keys()) {
      if (!validIds.has(id)) this._clipMap.delete(id);
    }

    this.selectedClipId = snapshot.selectedClipId;
  }

  // --- Project serialization ---
  clear() {
    this.clips = [];
    this._clipMap.clear();
    this.selectedClipId = null;
    this.history.clear();
    this.tracks = [
      { id: 'v1', type: 'video', name: 'Video 1', locked: false, muted: false, visible: true },
      { id: 'v2', type: 'video', name: 'Video 2', locked: false, muted: false, visible: true },
      { id: 'img1', type: 'image', name: 'Image Overlay', locked: false, muted: false, visible: true },
      { id: 'txt1', type: 'text', name: 'Text Overlay', locked: false, muted: false, visible: true },
      { id: 'a1', type: 'audio', name: 'Audio 1', locked: false, muted: false, visible: true },
      { id: 'a2', type: 'audio', name: 'Audio 2', locked: false, muted: false, visible: true },
    ];
    this._pushSnapshot('new project');
  }

  toJSON() {
    return {
      name: 'Viz Project',
      version: 2,
      width: this.width,
      height: this.height,
      tracks: JSON.parse(JSON.stringify(this.tracks)),
      clips: this.clips.map(c => {
        const copy = { ...c };
        delete copy.element;
        delete copy.file;
        return copy;
      }),
      selectedClipId: this.selectedClipId
    };
  }

  async fromJSON(data, resolveSrcUrl) {
    this.width = data.width || 1920;
    this.height = data.height || 1080;
    this.tracks = data.tracks ? JSON.parse(JSON.stringify(data.tracks)) : this.tracks;
    this.selectedClipId = data.selectedClipId || null;
    this.clips = [];
    this._clipMap.clear();

    for (const c of data.clips || []) {
      const clip = { ...c };
      delete clip.element;
      delete clip.file;

      if (clip.src && resolveSrcUrl) {
        clip.src = await resolveSrcUrl(clip.src, clip.type);
      }

      if (clip.src) {
        if (clip.type === 'video') {
          const video = document.createElement('video');
          video.src = clip.src;
          video.preload = 'auto';
          clip.element = video;
        } else if (clip.type === 'image') {
          const img = new Image();
          img.src = clip.src;
          clip.element = img;
        } else if (clip.type === 'audio') {
          const audio = new Audio(clip.src);
          clip.element = audio;
        }
      }

      this.clips.push(clip);
      this._clipMap.set(clip.id, clip);
    }

    this.history.clear();
    this._pushSnapshot('load project');
  }

  startBatch(name) {
    this.history.startBatch(name);
  }

  commitBatch() {
    this.history.commitBatch();
  }

  cancelBatch() {
    this.history.cancelBatch();
  }
}
