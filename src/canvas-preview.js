/**
 * Canvas Preview Renderer & Interactive Element Selector
 * Renders all active clips (Videos, Images, Text overlays) onto the preview canvas
 * with selectable/draggable elements and 8-point resize handles.
 */
import { clamp } from './utils.js';

export class CanvasPreview {
  constructor({ canvas, composition, onSelectClip, onChangeClipTransform, onContextMenu }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.comp = composition;
    this.onSelectClip = onSelectClip;
    this.onChangeClipTransform = onChangeClipTransform;
    this.onContextMenu = onContextMenu;

    this.currentTime = 0;

    this.isDragging = false;
    this.dragMode = null;
    this.dragStartPos = { x: 0, y: 0 };
    this.initialClipRect = { x: 0, y: 0, width: 0, height: 0 };

    this._setupCanvas();
    this._bindEvents();

    this._resizeObserver = new ResizeObserver(() => this._setupCanvas());
    this._resizeObserver.observe(this.canvas.parentElement);
  }

  _setupCanvas() {
    const parent = this.canvas.parentElement;
    const pRect = parent.getBoundingClientRect();

    // Fit the canvas to the wrapper while preserving the composition aspect ratio.
    // Use the full available space minus a small padding.
    const padding = 16;
    let availableW = Math.max(1, pRect.width - padding * 2);
    let availableH = Math.max(1, pRect.height - padding * 2);

    const compRatio = (this.comp.width || 1920) / (this.comp.height || 1080);
    let w = availableW;
    let h = w / compRatio;

    if (h > availableH) {
      h = availableH;
      w = h * compRatio;
    }

    // Floor for crisp CSS size, but keep internal resolution exact.
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));

    this.displayWidth = w;
    this.displayHeight = h;
    this.scale = this.displayWidth / (this.comp.width || 1920);

    // Keep the CSS box exactly at the calculated display size so the canvas is not
    // stretched by responsive rules. Internal resolution matches the CSS box for a
    // pixel-perfect preview; we scale the rendering context so composition units map
    // to display pixels.
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.setAttribute('data-aspect-ratio', `${w}/${h}`);

    this.render();
  }

  resize() {
    this._setupCanvas();
  }

  setCurrentTime(t) {
    this.currentTime = t;
    this.render();
  }

  setIsPlaying(playing) {
    this.isPlaying = playing;
  }

  /**
   * Offline clean render (for high quality export without selection outlines/handles)
   */
  renderOffline(ctx, time, width = 1920, height = 1080) {
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#06060c';
    ctx.fillRect(0, 0, width, height);

    const activeClips = this.comp.getClipsAtTime(time);

    activeClips.sort((a, b) => {
      const idxA = this.comp.tracks.findIndex(t => t.id === a.trackId);
      const idxB = this.comp.tracks.findIndex(t => t.id === b.trackId);
      return idxA - idxB;
    });

    for (const clip of activeClips) {
      ctx.save();
      ctx.globalAlpha = clip.opacity;

      if (clip.type === 'video') {
        this._renderVideoClipAtTime(ctx, clip, time);
      } else if (clip.type === 'image') {
        this._renderImageClip(ctx, clip);
      } else if (clip.type === 'text') {
        this._renderTextClip(ctx, clip);
      }

      ctx.restore();
    }
  }

  _renderVideoClipAtTime(ctx, clip, time) {
    if (!clip.element) return;
    const video = clip.element;
    const clipOffset = time - clip.startTime + clip.trimStart;

    if (Math.abs(video.currentTime - clipOffset) > 0.04) {
      video.currentTime = clipOffset;
    }

    try {
      ctx.drawImage(video, clip.x, clip.y, clip.width, clip.height);
    } catch (e) {}
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#06060c';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.scale(this.scale, this.scale);

    const activeClips = this.comp.getClipsAtTime(this.currentTime);

    activeClips.sort((a, b) => {
      const idxA = this.comp.tracks.findIndex(t => t.id === a.trackId);
      const idxB = this.comp.tracks.findIndex(t => t.id === b.trackId);
      return idxA - idxB;
    });

    for (const clip of activeClips) {
      ctx.save();
      ctx.globalAlpha = clip.opacity;

      if (clip.type === 'video') {
        this._renderVideoClip(ctx, clip);
      } else if (clip.type === 'image') {
        this._renderImageClip(ctx, clip);
      } else if (clip.type === 'text') {
        this._renderTextClip(ctx, clip);
      }

      ctx.restore();
    }

    const selectedClip = this.comp.getSelectedClip();
    if (selectedClip && activeClips.some(c => c.id === selectedClip.id)) {
      this._renderSelectionOverlay(ctx, selectedClip);
    }

    ctx.restore();
  }

  _renderVideoClip(ctx, clip) {
    if (!clip.element) return;
    const video = clip.element;

    const clipOffset = this.currentTime - clip.startTime + clip.trimStart;

    // Keep the video element in sync with the composition playhead.
    // A small threshold prevents redundant currentTime assignments while
    // keeping frame-accurate boundaries when scrubbing or looping.
    if (Math.abs(video.currentTime - clipOffset) > 0.05) {
      video.currentTime = clipOffset;
    }

    try {
      ctx.drawImage(video, clip.x, clip.y, clip.width, clip.height);
    } catch (e) {}
  }

  _renderImageClip(ctx, clip) {
    if (!clip.element) return;
    try {
      ctx.drawImage(clip.element, clip.x, clip.y, clip.width, clip.height);
    } catch (e) {}
  }

  _renderTextClip(ctx, clip) {
    if (!clip.text) return;

    ctx.font = `${clip.fontSize}px ${clip.fontFamily || 'Inter'}, sans-serif`;
    ctx.textAlign = clip.textAlign || 'center';
    ctx.textBaseline = 'middle';

    const lines = clip.text.split('\n');
    const lineHeight = clip.fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;
    const startY = clip.y + clip.height / 2 - totalHeight / 2 + lineHeight / 2;

    if (clip.bgColor && clip.bgColor !== 'transparent') {
      let maxWidth = 0;
      for (const line of lines) {
        const m = ctx.measureText(line);
        if (m.width > maxWidth) maxWidth = m.width;
      }
      const padding = 12;
      const bgX = clip.x + clip.width / 2 - maxWidth / 2 - padding;
      const bgY = clip.y + clip.height / 2 - totalHeight / 2 - padding;
      ctx.fillStyle = clip.bgColor;
      ctx.fillRect(bgX, bgY, maxWidth + padding * 2, totalHeight + padding * 2);
    }

    ctx.fillStyle = clip.color || '#ffffff';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const x = clip.textAlign === 'left' ? clip.x + 10 :
                clip.textAlign === 'right' ? clip.x + clip.width - 10 :
                clip.x + clip.width / 2;
      const y = startY + i * lineHeight;
      ctx.fillText(line, x, y);
    }
  }

  _renderSelectionOverlay(ctx, clip) {
    const x = clip.x;
    const y = clip.y;
    const w = clip.width;
    const h = clip.height;
    const handleSize = 10;
    const halfH = handleSize / 2;

    ctx.save();

    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    ctx.fillStyle = '#22d3ee';
    const handles = this._getHandlePositions(clip);
    for (const key in handles) {
      const p = handles[key];
      ctx.fillRect(p.x - halfH, p.y - halfH, handleSize, handleSize);
      ctx.strokeStyle = '#0b0b16';
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - halfH, p.y - halfH, handleSize, handleSize);
    }

    ctx.restore();
  }

  _getHandlePositions(clip) {
    const x = clip.x;
    const y = clip.y;
    const w = clip.width;
    const h = clip.height;
    const mx = x + w / 2;
    const my = y + h / 2;

    return {
      nw: { x: x, y: y },
      n:  { x: mx, y: y },
      ne: { x: x + w, y: y },
      e:  { x: x + w, y: my },
      se: { x: x + w, y: y + h },
      s:  { x: mx, y: y + h },
      sw: { x: x, y: y + h },
      w:  { x: x, y: my }
    };
  }

  _bindEvents() {
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    window.addEventListener('mousemove', (e) => this._onMouseMove(e));
    window.addEventListener('mouseup', () => this._onMouseUp());

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const selectedClip = this.comp.getSelectedClip();
      if (this.onContextMenu) {
        this.onContextMenu(e.clientX, e.clientY, selectedClip ? selectedClip.id : null);
      }
    });
  }

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    return {
      x: (clientX / rect.width) * this.comp.width,
      y: (clientY / rect.height) * this.comp.height
    };
  }

  _onMouseDown(e) {
    const pos = this._getCanvasPos(e);
    const selectedClip = this.comp.getSelectedClip();
    const activeClips = this.comp.getClipsAtTime(this.currentTime);

    if (selectedClip && activeClips.some(c => c.id === selectedClip.id)) {
      const handles = this._getHandlePositions(selectedClip);
      const hitDistance = 14 / this.scale;

      for (const key in handles) {
        const hp = handles[key];
        if (Math.hypot(pos.x - hp.x, pos.y - hp.y) <= hitDistance) {
          this.isDragging = true;
          this.dragMode = key;
          this.dragStartPos = pos;
          this.initialClipRect = {
            x: selectedClip.x,
            y: selectedClip.y,
            width: selectedClip.width,
            height: selectedClip.height
          };
          return;
        }
      }
    }

    const sortedClips = [...activeClips].sort((a, b) => {
      const idxA = this.comp.tracks.findIndex(t => t.id === a.trackId);
      const idxB = this.comp.tracks.findIndex(t => t.id === b.trackId);
      return idxB - idxA;
    });

    const hitClip = sortedClips.find(clip => {
      return (
        pos.x >= clip.x &&
        pos.x <= clip.x + clip.width &&
        pos.y >= clip.y &&
        pos.y <= clip.y + clip.height
      );
    });

    if (hitClip) {
      this.comp.selectedClipId = hitClip.id;
      if (this.onSelectClip) this.onSelectClip(hitClip.id);

      this.isDragging = true;
      this.dragMode = 'move';
      this.dragStartPos = pos;
      this.initialClipRect = {
        x: hitClip.x,
        y: hitClip.y,
        width: hitClip.width,
        height: hitClip.height
      };
      this.render();
    } else {
      this.comp.selectedClipId = null;
      if (this.onSelectClip) this.onSelectClip(null);
      this.render();
    }
  }

  _onMouseMove(e) {
    if (!this.isDragging) return;

    const pos = this._getCanvasPos(e);
    const clip = this.comp.getSelectedClip();
    if (!clip) return;

    const dx = pos.x - this.dragStartPos.x;
    const dy = pos.y - this.dragStartPos.y;
    const init = this.initialClipRect;

    let newX = init.x;
    let newY = init.y;
    let newW = init.width;
    let newH = init.height;

    if (this.dragMode === 'move') {
      newX = Math.round(init.x + dx);
      newY = Math.round(init.y + dy);
    } else {
      if (this.dragMode.includes('e')) newW = Math.max(20, init.width + dx);
      if (this.dragMode.includes('s')) newH = Math.max(20, init.height + dy);
      if (this.dragMode.includes('w')) {
        const wCandidate = init.width - dx;
        if (wCandidate >= 20) {
          newW = wCandidate;
          newX = init.x + dx;
        }
      }
      if (this.dragMode.includes('n')) {
        const hCandidate = init.height - dy;
        if (hCandidate >= 20) {
          newH = hCandidate;
          newY = init.y + dy;
        }
      }
    }

    clip.x = Math.round(newX);
    clip.y = Math.round(newY);
    clip.width = Math.round(newW);
    clip.height = Math.round(newH);

    this.render();

    if (this.onChangeClipTransform) {
      this.onChangeClipTransform(clip);
    }
  }

  _onMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.dragMode = null;
      this.comp.saveSnapshot();
    }
  }
}
