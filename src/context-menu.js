/**
 * Context Menu Module
 * Displays a custom dark glassmorphism right-click menu on the timeline and canvas preview.
 * Includes: Split Here, Extract/Split Audio, Copy, Paste, Duplicate, Delete.
 */
import { showToast, uid } from './utils.js';

export class ContextMenu {
  constructor({ composition, getPlayheadTime, onCompositionChanged, clipboardManager, onMediaUrlRegistered }) {
    this.comp = composition;
    this.getPlayheadTime = getPlayheadTime;
    this.onCompositionChanged = onCompositionChanged;
    this.clipboard = clipboardManager;
    this.onMediaUrlRegistered = onMediaUrlRegistered;

    this.targetClipId = null;
    this.clickTime = 0;

    this._createDOM();
    this._bindEvents();
  }

  _createDOM() {
    this.menuEl = document.createElement('div');
    this.menuEl.className = 'custom-context-menu hidden';
    this.menuEl.innerHTML = `
      <div class="menu-item" data-action="split-here">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="8 6 4 6 4 18 8 18"/><polyline points="16 6 20 6 20 18 16 18"/></svg>
        <span>Split Here</span>
        <kbd>S</kbd>
      </div>
      <div class="menu-item" data-action="split-audio" id="ctx-split-audio">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <span>Split / Separate Audio</span>
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item" data-action="copy">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copy</span>
        <kbd>Ctrl+C</kbd>
      </div>
      <div class="menu-item" data-action="paste">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
        <span>Paste</span>
        <kbd>Ctrl+V</kbd>
      </div>
      <div class="menu-item" data-action="duplicate">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        <span>Duplicate</span>
        <kbd>Ctrl+D</kbd>
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item danger" data-action="delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        <span>Cut / Delete</span>
        <kbd>Del</kbd>
      </div>
    `;

    document.body.appendChild(this.menuEl);
  }

  show(x, y, clipId = null, clickTime = null) {
    this.targetClipId = clipId || this.comp.selectedClipId;
    this.clickTime = clickTime !== null ? clickTime : this.getPlayheadTime();

    if (this.targetClipId) {
      this.comp.selectedClipId = this.targetClipId;
    }

    const targetClip = this.comp.getClip(this.targetClipId);
    const splitAudioBtn = document.getElementById('ctx-split-audio');

    if (splitAudioBtn) {
      if (targetClip && targetClip.type === 'video') {
        splitAudioBtn.style.display = 'flex';
      } else {
        splitAudioBtn.style.display = 'none';
      }
    }

    const menuWidth = 200;
    const menuHeight = 220;
    const posX = Math.min(x, window.innerWidth - menuWidth - 10);
    const posY = Math.min(y, window.innerHeight - menuHeight - 10);

    this.menuEl.style.left = `${posX}px`;
    this.menuEl.style.top = `${posY}px`;
    this.menuEl.classList.remove('hidden');
  }

  hide() {
    this.menuEl.classList.add('hidden');
  }

  _bindEvents() {
    window.addEventListener('click', () => this.hide());
    window.addEventListener('scroll', () => this.hide());

    this.menuEl.addEventListener('click', (e) => {
      const item = e.target.closest('.menu-item');
      if (!item) return;

      const action = item.dataset.action;
      this.hide();
      this._executeAction(action);
    });
  }

  _executeAction(action) {
    const clip = this.comp.getClip(this.targetClipId);

    if (action === 'split-here') {
      this.splitClipAtTime(clip, this.clickTime);
    } else if (action === 'split-audio') {
      this.splitAudioFromVideo(clip);
    } else if (action === 'copy') {
      if (this.clipboard) this.clipboard.copy();
    } else if (action === 'paste') {
      if (this.clipboard) this.clipboard.paste();
    } else if (action === 'duplicate') {
      if (this.clipboard) this.clipboard.duplicate();
    } else if (action === 'delete') {
      if (clip) {
        this.onMediaUrlRegistered?.(clip.id, null);
        this.comp.removeClip(clip.id);
        showToast('Clip deleted', 'success');
        if (this.onCompositionChanged) this.onCompositionChanged();
      }
    }
  }

  splitClipAtTime(clip, splitTime) {
    if (!clip) {
      showToast('No clip selected to split', 'warning');
      return;
    }

    if (splitTime <= clip.startTime + 0.05 || splitTime >= clip.startTime + clip.duration - 0.05) {
      showToast('Position cursor inside clip to split', 'warning');
      return;
    }

    const firstDur = splitTime - clip.startTime;
    const secondDur = clip.duration - firstDur;

    const baseTrimStart = clip.trimStart || 0;
    const baseTrimEnd = clip.trimEnd || (baseTrimStart + clip.duration);

    const clip1Data = {
      ...clip,
      id: uid(),
      duration: Math.round(firstDur * 100) / 100,
      trimStart: baseTrimStart,
      trimEnd: Math.round((baseTrimStart + firstDur) * 100) / 100,
      element: this._createMediaElement(clip),
    };

    const clip2Data = {
      ...clip,
      id: uid(),
      startTime: Math.round(splitTime * 100) / 100,
      duration: Math.round(secondDur * 100) / 100,
      trimStart: Math.round((baseTrimStart + firstDur) * 100) / 100,
      trimEnd: baseTrimEnd,
      element: this._createMediaElement(clip),
    };

    this.comp.startBatch('split clip');
    this.comp.removeClip(clip.id, { skipHistory: true });
    const c1 = this.comp.addClip(clip1Data, { skipHistory: true });
    const c2 = this.comp.addClip(clip2Data, { skipHistory: true });
    this.comp.commitBatch();

    if (clip.src) {
      this.onMediaUrlRegistered?.(c1.id, clip.src);
      this.onMediaUrlRegistered?.(c2.id, clip.src);
    }

    this.comp.selectedClipId = c2.id;
    showToast(`Split clip into 2 parts`, 'success');

    if (this.onCompositionChanged) this.onCompositionChanged();
  }

  _createMediaElement(clip) {
    if (!clip.src) return null;
    if (clip.type === 'video') {
      const v = document.createElement('video');
      v.src = clip.src;
      v.preload = 'auto';
      return v;
    } else if (clip.type === 'image') {
      const img = new Image();
      img.src = clip.src;
      return img;
    } else if (clip.type === 'audio') {
      const a = new Audio(clip.src);
      return a;
    }
    return null;
  }

  splitAudioFromVideo(clip) {
    if (!clip || clip.type !== 'video') {
      showToast('Select a video clip to separate audio', 'warning');
      return;
    }

    let audioTrack = this.comp.tracks.find(t => t.type === 'audio');
    if (!audioTrack) {
      audioTrack = this.comp.addAudioTrack();
    }

    const audioElement = new Audio(clip.src);

    const audioClipData = {
      trackId: audioTrack.id,
      type: 'audio',
      name: `${clip.name} (Audio)`,
      src: clip.src,
      file: clip.file,
      element: audioElement,
      startTime: clip.startTime,
      duration: clip.duration,
      trimStart: clip.trimStart,
      trimEnd: clip.trimEnd,
      volume: 1
    };

    this.comp.startBatch('extract audio');
    const newAudioClip = this.comp.addClip(audioClipData, { skipHistory: true });
    this.comp.updateClip(clip.id, { volume: 0 }, { skipHistory: true });
    this.comp.commitBatch();

    if (clip.src) this.onMediaUrlRegistered?.(newAudioClip.id, clip.src);

    showToast(`Extracted audio to ${audioTrack.name}`, 'success');

    if (this.onCompositionChanged) this.onCompositionChanged();
  }
}
