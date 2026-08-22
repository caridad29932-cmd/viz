/**
 * Multi-Track Timeline Module
 * Visualizes multi-track arrangement and supports drag-to-move, edge-trimming,
 * track-to-track moves, vertical scrolling, and playhead scrubbing.
 */
import { formatTime, clamp, escapeHtml } from './utils.js';

const TRACK_ROW_HEIGHT = 34;

export class MultiTimeline {
  constructor({ container, composition, onSeek, onSelectClip, onChangeClipTime, onContextMenu }) {
    this.container = container;
    this.comp = composition;
    this.onSeek = onSeek;
    this.onSelectClip = onSelectClip;
    this.onChangeClipTime = onChangeClipTime;
    this.onContextMenu = onContextMenu;

    this.zoomLevel = 1;
    this.pxPerSec = 40;
    this.currentTime = 0;

    this.isScrubbing = false;
    this.isDraggingClip = false;
    this.isResizingClip = false;

    this.dragTarget = null;

    this._renderSkeleton();
    this._bindEvents();
  }

  _renderSkeleton() {
    this.container.innerHTML = `
      <div class="multitimeline-header-bar">
        <div class="multitimeline-track-headers-title">
          <span>TRACKS</span>
        </div>
        <div class="multitimeline-ruler-wrapper" id="mt-ruler-wrapper">
          <canvas class="multitimeline-ruler-canvas" id="mt-ruler-canvas"></canvas>
        </div>
      </div>
      <div class="multitimeline-body" id="mt-body">
        <div class="multitimeline-track-sidebar" id="mt-sidebar"></div>
        <div class="multitimeline-tracks-container" id="mt-tracks-container">
          <div class="multitimeline-playhead" id="mt-playhead">
            <div class="mt-playhead-head"></div>
            <div class="mt-playhead-line"></div>
          </div>
          <div class="multitimeline-tracks-content" id="mt-tracks-content"></div>
        </div>
      </div>
    `;

    this.body = document.getElementById('mt-body');
    this.rulerCanvas = document.getElementById('mt-ruler-canvas');
    this.rulerCtx = this.rulerCanvas.getContext('2d');
    this.rulerWrapper = document.getElementById('mt-ruler-wrapper');
    this.sidebar = document.getElementById('mt-sidebar');
    this.tracksContainer = document.getElementById('mt-tracks-container');
    this.tracksContent = document.getElementById('mt-tracks-content');
    this.playhead = document.getElementById('mt-playhead');
  }

  setCurrentTime(t) {
    this.currentTime = t;
    this.updatePlayheadPosition();
  }

  setZoom(level) {
    this.zoomLevel = clamp(level, 0.5, 8);
    this.render();
  }

  updatePlayheadPosition() {
    const pX = this.currentTime * (this.pxPerSec * this.zoomLevel);
    this.playhead.style.transform = `translateX(${pX}px)`;
  }

  render() {
    this._renderRuler();
    this._renderSidebar();
    this._renderTracks();
    this.updatePlayheadPosition();
  }

  _renderRuler() {
    const totalDuration = Math.max(this.comp.duration + 10, 30);
    const totalWidth = Math.max(totalDuration * (this.pxPerSec * this.zoomLevel), this.tracksContainer.clientWidth);

    this.rulerCanvas.width = totalWidth;
    this.rulerCanvas.height = 24;
    this.tracksContent.style.width = `${totalWidth}px`;

    const ctx = this.rulerCtx;
    ctx.clearRect(0, 0, totalWidth, 24);

    ctx.fillStyle = '#0b0b16';
    ctx.fillRect(0, 0, totalWidth, 24);

    const stepSec = this.zoomLevel < 1 ? 5 : 1;
    const pxStep = stepSec * (this.pxPerSec * this.zoomLevel);

    ctx.fillStyle = '#555570';
    ctx.font = '10px JetBrains Mono, monospace';

    for (let x = 0, sec = 0; x < totalWidth; x += pxStep, sec += stepSec) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 14);
      ctx.lineTo(x, 24);
      ctx.stroke();

      if (sec % (stepSec * 2) === 0) {
        ctx.fillText(formatTime(sec, false), x + 4, 12);
      }
    }
  }

  _renderSidebar() {
    this.sidebar.innerHTML = '';
    this.sidebar.style.height = `${this.comp.tracks.length * TRACK_ROW_HEIGHT}px`;

    for (const track of this.comp.tracks) {
      const row = document.createElement('div');
      row.className = `mt-sidebar-row mt-track-type-${track.type}`;

      const icon = track.type === 'video' ? '🎬' :
                   track.type === 'image' ? '🖼️' :
                   track.type === 'text'  ? '📝' : '🔊';

      row.innerHTML = `
        <span class="mt-sidebar-icon">${icon}</span>
        <span class="mt-sidebar-name">${escapeHtml(track.name)}</span>
        <div class="mt-sidebar-actions">
          <button class="mt-track-btn ${!track.visible ? 'active-off' : ''}" data-action="toggle-visible" data-track="${track.id}" title="Toggle Visibility">👁️</button>
          <button class="mt-track-btn ${track.muted ? 'active-off' : ''}" data-action="toggle-mute" data-track="${track.id}" title="Toggle Mute">🔇</button>
        </div>
      `;

      this.sidebar.appendChild(row);
    }
  }

  _renderTracks() {
    this.tracksContent.innerHTML = '';
    this.tracksContent.style.height = `${this.comp.tracks.length * TRACK_ROW_HEIGHT}px`;

    for (let i = 0; i < this.comp.tracks.length; i++) {
      const track = this.comp.tracks[i];
      const row = document.createElement('div');
      row.className = 'mt-track-row';
      row.dataset.trackId = track.id;
      row.style.top = `${i * TRACK_ROW_HEIGHT}px`;
      row.style.height = `${TRACK_ROW_HEIGHT}px`;
      this.tracksContent.appendChild(row);
    }

    for (const clip of this.comp.clips) {
      const trackIndex = this.comp.tracks.findIndex(t => t.id === clip.trackId);
      if (trackIndex === -1) continue;

      const clipEl = this._createClipElement(clip);
      clipEl.style.left = `${clip.startTime * (this.pxPerSec * this.zoomLevel)}px`;
      clipEl.style.width = `${Math.max(clip.duration * (this.pxPerSec * this.zoomLevel), 10)}px`;
      clipEl.style.top = `${trackIndex * TRACK_ROW_HEIGHT + 3}px`;
      clipEl.style.height = `${TRACK_ROW_HEIGHT - 6}px`;
      if (clip.id === this.comp.selectedClipId) {
        clipEl.classList.add('selected');
      }
      this.tracksContent.appendChild(clipEl);
    }
  }

  _createClipElement(clip) {
    const el = document.createElement('div');
    el.className = `mt-clip mt-clip-${clip.type}`;
    el.dataset.clipId = clip.id;

    el.innerHTML = `
      <div class="mt-clip-handle mt-clip-handle-l" data-handle="left"></div>
      <div class="mt-clip-content">
        <span class="mt-clip-title">${escapeHtml(clip.name || clip.type)}</span>
      </div>
      <div class="mt-clip-handle mt-clip-handle-r" data-handle="right"></div>
    `;

    return el;
  }

  _getTrackIndexAtY(clientY) {
    const bodyRect = this.body.getBoundingClientRect();
    const mouseY = clientY - bodyRect.top + this.body.scrollTop;
    const index = Math.floor(mouseY / TRACK_ROW_HEIGHT);
    return clamp(index, 0, this.comp.tracks.length - 1);
  }

  _canPlaceOnTrack(clipType, trackType) {
    if (clipType === 'text') return trackType === 'text';
    if (clipType === 'audio') return trackType === 'audio';
    if (clipType === 'image') return trackType === 'image' || trackType === 'video';
    if (clipType === 'video') return trackType === 'video' || trackType === 'image';
    return false;
  }

  _bindEvents() {
    const handleRulerSeek = (e) => {
      const rect = this.rulerWrapper.getBoundingClientRect();
      const scrollLeft = this.tracksContainer.scrollLeft;
      const mouseX = e.clientX - rect.left + scrollLeft;
      const pps = this.pxPerSec * this.zoomLevel;
      const targetTime = clamp(mouseX / pps, 0, this.comp.duration + 60);

      this.setCurrentTime(targetTime);
      if (this.onSeek) this.onSeek(targetTime);
    };

    this.rulerWrapper.addEventListener('mousedown', (e) => {
      this.isScrubbing = true;
      handleRulerSeek(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isScrubbing) {
        handleRulerSeek(e);
      } else if (this.dragTarget) {
        this._onDragClipMove(e);
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isScrubbing) this.isScrubbing = false;
      if (this.dragTarget) this._onDragClipEnd();
    });

    this.tracksContent.addEventListener('mousedown', (e) => {
      const handleEl = e.target.closest('.mt-clip-handle');
      const clipEl = e.target.closest('.mt-clip');

      if (handleEl && clipEl) {
        const clipId = clipEl.dataset.clipId;
        const handleType = handleEl.dataset.handle;
        const clip = this.comp.getClip(clipId);
        if (!clip) return;

        this.dragTarget = {
          clipId,
          mode: handleType === 'left' ? 'trimLeft' : 'trimRight',
          startX: e.clientX,
          startY: e.clientY,
          initialTrackIndex: this.comp.tracks.findIndex(t => t.id === clip.trackId),
          initialStart: clip.startTime,
          initialDur: clip.duration,
          initialTrimStart: clip.trimStart || 0
        };
        this.comp.selectedClipId = clipId;
        if (this.onSelectClip) this.onSelectClip(clipId);
        this.render();
        e.stopPropagation();
      } else if (clipEl) {
        const clipId = clipEl.dataset.clipId;
        const clip = this.comp.getClip(clipId);
        if (!clip) return;

        this.dragTarget = {
          clipId,
          mode: 'move',
          startX: e.clientX,
          startY: e.clientY,
          initialTrackIndex: this.comp.tracks.findIndex(t => t.id === clip.trackId),
          initialStart: clip.startTime,
          initialDur: clip.duration,
          initialTrimStart: clip.trimStart || 0
        };
        this.comp.selectedClipId = clipId;
        if (this.onSelectClip) this.onSelectClip(clipId);
        this.render();
        e.stopPropagation();
      }
    });

    this.container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const clipEl = e.target.closest('.mt-clip');
      const clipId = clipEl ? clipEl.dataset.clipId : null;

      const rect = this.tracksContainer.getBoundingClientRect();
      const mouseX = e.clientX - rect.left + this.tracksContainer.scrollLeft;
      const pps = this.pxPerSec * this.zoomLevel;
      const clickTime = Math.max(0, mouseX / pps);

      if (this.onContextMenu) {
        this.onContextMenu(e.clientX, e.clientY, clipId, clickTime);
      }
    });

    this.sidebar.addEventListener('click', (e) => {
      const btn = e.target.closest('.mt-track-btn');
      if (!btn) return;

      const trackId = btn.dataset.track;
      const action = btn.dataset.action;
      const track = this.comp.getTrack(trackId);

      if (track) {
        if (action === 'toggle-visible') track.visible = !track.visible;
        if (action === 'toggle-mute') track.muted = !track.muted;
        this.comp.saveSnapshot();
        this.render();
      }
    });
  }

  _onDragClipMove(e) {
    if (!this.dragTarget) return;

    const { clipId, mode, startX, startY, initialTrackIndex, initialStart, initialDur, initialTrimStart } = this.dragTarget;
    const clip = this.comp.getClip(clipId);
    if (!clip) return;

    const pps = this.pxPerSec * this.zoomLevel;
    const deltaX = e.clientX - startX;
    const deltaTime = deltaX / pps;

    if (mode === 'move') {
      const targetIndex = this._getTrackIndexAtY(e.clientY);
      let targetTrackId = clip.trackId;
      if (targetIndex !== initialTrackIndex) {
        const targetTrack = this.comp.tracks[targetIndex];
        if (targetTrack && this._canPlaceOnTrack(clip.type, targetTrack.type)) {
          targetTrackId = targetTrack.id;
        }
      }

      // Try to keep the requested start time; if it overlaps, snap to the nearest
      // free gap on the target track so clips stay flush and draggable.
      let candidateStart = Math.max(0, Math.round((initialStart + deltaTime) * 10) / 10);
      const sameTrackClips = this.comp.clips
        .filter(c => c.trackId === targetTrackId && c.id !== clip.id)
        .sort((a, b) => a.startTime - b.startTime);

      for (const c of sameTrackClips) {
        const cEnd = c.startTime + c.duration;
        if (candidateStart < cEnd && candidateStart + clip.duration > c.startTime) {
          candidateStart = Math.round((cEnd + 0.05) * 10) / 10;
        }
      }

      clip.startTime = candidateStart;
      clip.trackId = targetTrackId;
    } else if (mode === 'trimRight') {
      const newDuration = Math.max(0.5, Math.round((initialDur + deltaTime) * 10) / 10);
      if (!this.comp.clipOverlaps(clip.id, clip.trackId, clip.startTime, newDuration)) {
        clip.duration = newDuration;
        clip.trimEnd = Math.round(((initialTrimStart || 0) + newDuration) * 10) / 10;
      }
    } else if (mode === 'trimLeft') {
      const candidateStart = Math.max(0, initialStart + deltaTime);
      const candidateDur = initialDur - (candidateStart - initialStart);
      if (candidateDur >= 0.5) {
        const startDelta = candidateStart - initialStart;
        const newStart = Math.round(candidateStart * 10) / 10;
        const newDur = Math.round(candidateDur * 10) / 10;
        if (!this.comp.clipOverlaps(clip.id, clip.trackId, newStart, newDur)) {
          clip.startTime = newStart;
          clip.duration = newDur;
          clip.trimStart = Math.max(0, Math.round(((initialTrimStart || 0) + startDelta) * 10) / 10);
        }
      }
    }

    this.render();
    if (this.onChangeClipTime) this.onChangeClipTime(clip);
  }

  _onDragClipEnd() {
    this.dragTarget = null;
    this.comp.saveSnapshot();
  }
}
