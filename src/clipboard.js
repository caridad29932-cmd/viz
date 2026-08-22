/**
 * Clipboard & Object Selection Utility
 * Supports copy (Ctrl+C), paste (Ctrl+V), duplicate (Ctrl+D), and delete (Del) for composition elements.
 */
import { showToast, uid } from './utils.js';

export class ClipboardManager {
  constructor(composition, getCurrentTime, onCompositionChanged, onMediaUrlRegistered) {
    this.comp = composition;
    this.getCurrentTime = getCurrentTime;
    this.onCompositionChanged = onCompositionChanged;
    this.onMediaUrlRegistered = onMediaUrlRegistered;

    this.clipboardData = null;

    this._bindHotkeys();
  }

  copy() {
    const selected = this.comp.getSelectedClip();
    if (!selected) {
      showToast('No element selected to copy', 'warning');
      return false;
    }

    const copyData = { ...selected };
    delete copyData.element;
    this.clipboardData = copyData;

    showToast(`Copied "${selected.name || selected.type}"`, 'info');
    return true;
  }

  paste() {
    if (!this.clipboardData) {
      showToast('Clipboard is empty', 'warning');
      return false;
    }

    const pasteTime = this.getCurrentTime ? this.getCurrentTime() : this.clipboardData.startTime + 1;
    const newClipData = {
      ...this.clipboardData,
      id: uid(),
      startTime: pasteTime,
      x: this.clipboardData.x ? this.clipboardData.x + 30 : 50,
      y: this.clipboardData.y ? this.clipboardData.y + 30 : 50,
    };

    const createdElement = this._recreateElement(newClipData);
    if (createdElement && newClipData.src) {
      this.onMediaUrlRegistered?.(newClipData.id, newClipData.src);
    }

    this.comp.startBatch('paste clip');
    const createdClip = this.comp.addClip(newClipData, { skipHistory: true });
    this.comp.commitBatch();

    showToast(`Pasted "${createdClip.name}"`, 'success');

    if (this.onCompositionChanged) this.onCompositionChanged();
    return true;
  }

  duplicate() {
    if (this.copy()) {
      return this.paste();
    }
    return false;
  }

  deleteSelected() {
    const selected = this.comp.getSelectedClip();
    if (!selected) return false;

    this._revokeClipUrl(selected.id);
    this.comp.removeClip(selected.id);
    showToast('Deleted element', 'success');

    if (this.onCompositionChanged) this.onCompositionChanged();
    return true;
  }

  _recreateElement(clipData) {
    if (clipData.type === 'video' && clipData.src) {
      const video = document.createElement('video');
      video.src = clipData.src;
      video.preload = 'auto';
      clipData.element = video;
      return video;
    } else if (clipData.type === 'image' && clipData.src) {
      const img = new Image();
      img.src = clipData.src;
      clipData.element = img;
      return img;
    } else if (clipData.type === 'audio' && clipData.src) {
      const audio = new Audio(clipData.src);
      clipData.element = audio;
      return audio;
    }
    return null;
  }

  _revokeClipUrl(clipId) {
    this.onMediaUrlRegistered?.(clipId, null);
  }

  _bindHotkeys() {
    window.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.target.isContentEditable) return;
      if (e.target.closest && e.target.closest('[contenteditable]')) return;
      if (e.target.closest && e.target.closest('[data-ignore-hotkeys]')) return;

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
        e.preventDefault();
        this.copy();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
        e.preventDefault();
        this.paste();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
        e.preventDefault();
        this.duplicate();
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        this.deleteSelected();
      }
    });
  }
}
