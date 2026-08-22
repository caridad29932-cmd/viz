/**
 * Toolbar module — manages editor action buttons and keyboard shortcuts.
 */

export class Toolbar {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.buttons = {};
    this._videoLoaded = false;
    this._hasInOut = false;

    this._bindButtons();
    this._bindKeyboard();
    this._updateStates();
  }

  _isEditingTarget(e) {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (e.target.isContentEditable) return true;
    if (e.target.closest && e.target.closest('[contenteditable]')) return true;
    if (e.target.closest && e.target.closest('[data-ignore-hotkeys]')) return true;
    return false;
  }

  _bindButtons() {
    const btnMap = {
      'btn-split': 'onSplit',
      'btn-delete': 'onDelete',
      'btn-export': 'onExport',
      'btn-undo': 'onUndo',
      'btn-redo': 'onRedo',
    };

    Object.entries(btnMap).forEach(([id, cb]) => {
      const btn = document.getElementById(id);
      if (btn) {
        this.buttons[id] = btn;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!btn.disabled && this.callbacks[cb]) {
            this.callbacks[cb]();
          }
        });
      }
    });
  }

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (this._isEditingTarget(e)) return;

      // Ctrl+Z = Undo, Ctrl+Y / Ctrl+Shift+Z = Redo
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        this.callbacks.onUndo?.();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
        e.preventDefault();
        this.callbacks.onRedo?.();
        return;
      }

      // Space: play/pause (does not conflict with typing)
      if (e.code === 'Space') {
        e.preventDefault();
        this.callbacks.onTogglePlay?.();
        return;
      }

      // All editing shortcuts require Ctrl/Cmd so they never fire while typing
      if (e.ctrlKey || e.metaKey) {
        switch (e.code) {
          case 'KeyS':
            e.preventDefault();
            this.callbacks.onSplit?.();
            return;
          case 'KeyE':
            e.preventDefault();
            this.callbacks.onExport?.();
            return;
        }
      }

      // Delete/Backspace still work without Ctrl (they don't conflict with letters)
      if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        this.callbacks.onDelete?.();
      }
    });
  }

  _updateStates() {
    // Buttons are enabled/disabled dynamically based on undo/redo & selection state
  }

  setVideoLoaded(loaded) {
    this._videoLoaded = loaded;
    this._updateStates();
  }

  setHasInOut(hasIn, hasOut) {
    this._hasInOut = hasIn || hasOut;
    this._updateStates();
  }

  setPlaying(isPlaying) {
    const playIcon = document.getElementById('ctrl-play-icon');
    if (playIcon) {
      playIcon.innerHTML = isPlaying
        ? '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>'
        : '<polygon points="5 3 19 12 5 21 5 3"/>';
    }
    const overlay = document.getElementById('video-overlay');
    if (overlay) {
      overlay.classList.toggle('playing', isPlaying);
    }
  }

  setUndoRedo(canUndo, canRedo) {
    if (this.buttons['btn-undo']) this.buttons['btn-undo'].disabled = !canUndo;
    if (this.buttons['btn-redo']) this.buttons['btn-redo'].disabled = !canRedo;
  }
}
