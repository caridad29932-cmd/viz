/**
 * Multi-Track Timeline Module
 * Visualizes multi-track arrangement and supports drag-to-move, edge-trimming,
 * track-to-track moves, vertical scrolling, and playhead scrubbing.
 */
import { formatTime, clamp, escapeHtml, throttle } from './utils.js';
import { findSnapOffset, quantizeTime } from './snapping.js';

const TRACK_ROW_HEIGHT = 34;
const MIN_CLIP_WIDTH_PX = 10;

export class MultiTimeline {
  constructor({ container, composition, onSeek, onSelectClip, onChangeClipTime, onContextMenu, store }) {
    this.container = container;
    this.comp = composition;
    this.onSeek = onSeek;
    this.onSelectClip = onSelectClip;
    this.onChangeClipTime = onChangeClipTime;
    this.onContextMenu = onContextMenu;
    this.store = store;

    this.zoomLevel = 1;
    this.pxPerSec = 40;
    this.currentTime = 0;

    this.isScrubbing = false;
    this.dragTarget = null;

    // Virtualization viewport
    this.viewportStart = 0;
    this.viewportEnd = 0;

    this._renderSkeleton();
    this._bindEvents();

    // Throttle expensive renders during playback/drag
    this._throttledRender = throttle(() => this.render(), 32);
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
    this._updateViewport();
    this._renderRuler();
    this._renderSidebar();
    this._renderTracks();
    this.updatePlayheadPosition();
  }

  _updateViewport() {
    const scrollLeft = this.tracksContainer.scrollLeft;
    const width = this.tracksContainer.clientWidth;
    const pps = this.pxPerSec * this.zoomLevel;
    this.viewportStart = Math.max(0, scrollLeft / pps - 1);
    this.viewportEnd = (scrollLeft + width) / pps + 1;
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
    if (this._lastTrackCount === this.comp.tracks.length) return;
    this._lastTrackCount = this.comp.tracks.length;

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
    // Reuse track rows where possible
    let rowsChanged = false;
    if (this.tracksContent.childElementCount !== this.comp.tracks.length + 1) {
      rowsChanged = true;
    }

    if (rowsChanged) {
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
    }

    // Render only visible clips (virtualization)
    const pps = this.pxPerSec * this.zoomLevel;

    for (const clip of this.comp.clips) {
      let el = document.querySelector(`.mt-clip[data-clip-id="${clip.id}"]`);
      const trackIndex = this.comp.tracks.findIndex(t => t.id === clip.trackId);

      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;
      const isVisible = clipEnd >= this.viewportStart && clipStart <= this.viewportEnd;

      if (!isVisible) {
        if (el) el.remove();
        continue;
      }

      const left = clip.startTime * pps;
      const width = Math.max(clip.duration * pps, MIN_CLIP_WIDTH_PX);
      const top = trackIndex * TRACK_ROW_HEIGHT + 3;

      if (!el) {
        el = this._createClipElement(clip);
        this.tracksContent.appendChild(el);
      }

      el.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      el.style.width = `${width}px`;
      el.classList.toggle('selected', clip.id === this.comp.selectedClipId);
    }

    // Remove stale clip elements
    const validIds = new Set(this.comp.clips.map(c => c.id));
    for (const el of this.tracksContent.querySelectorAll('.mt-clip')) {
      if (!validIds.has(el.dataset.clipId)) el.remove();
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
          initialTrimStart: clip.trimStart || 0,
          initialTrimEnd: clip.trimEnd || clip.duration
        };
        this.comp.selectedClipId = clipId;
        if (this.onSelectClip) this.onSelectClip(clipId);
        this.comp.startBatch(handleType === 'left' ? 'trim clip start' : 'trim clip end');
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
        this.comp.startBatch('move clip');
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
        this.comp._pushSnapshot('toggle track');
        this.render();
      }
    });

    this.tracksContainer.addEventListener('scroll', () => {
      this._updateViewport();
      this._throttledRender();
    }, { passive: true });

    // Drag-and-drop file import onto timeline
    this.container.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.container.classList.add('drag-over');
    });

    this.container.addEventListener('dragleave', () => {
      this.container.classList.remove('drag-over');
    });

    this.container.addEventListener('drop', (e) => {
      e.preventDefault();
      this.container.classList.remove('drag-over');
      if (this._onDropFiles) this._onDropFiles(e.dataTransfer.files, e);
    });
  }

  onDropFiles(callback) {
    this._onDropFiles = callback;
  }

  _onDragClipMove(e) {
    if (!this.dragTarget) return;

    const { clipId, mode, startX, startY, initialTrackIndex, initialStart, initialDur, initialTrimStart, initialTrimEnd } = this.dragTarget;
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

      let candidateStart = Math.max(0, initialStart + deltaTime);

      // Snapping
      const snapEnabled = this.store ? this.store.get('snapEnabled') !== false : true;
      if (snapEnabled) {
        const snap = findSnapOffset(
          candidateStart,
          clip.duration,
          this.comp.clips,
          clip.id,
          this.currentTime,
          pps,
          { snapToPlayhead: true }
        );
        if (snap) candidateStart = snap.newStart;
      }

      candidateStart = quantizeTime(candidateStart);

      // Prevent overlap by auto-shifting
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
      let newDuration = Math.max(0.5, initialDur + deltaTime);

      const snapEnabled = this.store ? this.store.get('snapEnabled') !== false : true;
      if (snapEnabled) {
        const snap = findSnapOffset(
          initialStart,
          newDuration,
          this.comp.clips,
          clip.id,
          this.currentTime,
          pps,
          { snapToPlayhead: true }
        );
        if (snap && snap.edge === initialStart + newDuration) {
          newDuration = Math.max(0.5, snap.newStart - initialStart);
        }
      }

      newDuration = quantizeTime(newDuration);

      const sourceMax = clip.element?.duration || Infinity;
      const newTrimEnd = Math.min(initialTrimStart + newDuration, sourceMax);

      if (!this.comp.clipOverlaps(clip.id, clip.trackId, initialStart, newDuration)) {
        clip.duration = newDuration;
        clip.trimEnd = newTrimEnd;
      }
    } else if (mode === 'trimLeft') {
      let candidateStart = Math.max(0, initialStart + deltaTime);
      let candidateDur = initialDur - (candidateStart - initialStart);

      if (candidateDur >= 0.5) {
        const startDelta = candidateStart - initialStart;
        let newTrimStart = Math.max(0, initialTrimStart + startDelta);

        const snapEnabled = this.store ? this.store.get('snapEnabled') !== false : true;
        if (snapEnabled) {
          const snap = findSnapOffset(
            candidateStart,
            candidateDur,
            this.comp.clips,
            clip.id,
            this.currentTime,
            pps,
            { snapToPlayhead: true }
          );
          if (snap && snap.edge === candidateStart) {
            const delta = snap.newStart - candidateStart;
            candidateStart = snap.newStart;
            candidateDur -= delta;
            newTrimStart += delta;
          }
        }

        candidateStart = quantizeTime(candidateStart);
        candidateDur = quantizeTime(Math.max(0.5, candidateDur));
        newTrimStart = Math.max(0, quantizeTime(newTrimStart));

        if (!this.comp.clipOverlaps(clip.id, clip.trackId, candidateStart, candidateDur)) {
          clip.startTime = candidateStart;
          clip.duration = candidateDur;
          clip.trimStart = newTrimStart;
        }
      }
    }

    this.render();
    if (this.onChangeClipTime) this.onChangeClipTime(clip);
  }

  _onDragClipEnd() {
    this.dragTarget = null;
    this.comp.commitBatch();
  }

  onDropFiles(callback) {
    this.onDropFiles = callback;
  }
}
