/**
 * Toolbar module — manages editor action buttons and keyboard shortcuts.
 */

const SHORTCUTS = [
  { key: 'Space', label: 'Play / Pause' },
  { key: 'J', label: 'Reverse Playback' },
  { key: 'K', label: 'Pause' },
  { key: 'L', label: 'Forward Playback' },
  { key: 'Ctrl+S', label: 'Split at playhead' },
  { key: 'Ctrl+Z', label: 'Undo' },
  { key: 'Ctrl+Shift+Z', label: 'Redo' },
  { key: 'Ctrl+Y', label: 'Redo' },
  { key: 'Del', label: 'Delete selected clip' },
  { key: 'I', label: 'Set in point' },
  { key: 'O', label: 'Set out point' },
  { key: 'Esc', label: 'Cancel operation' },
  { key: '← / →', label: 'Move playhead' },
  { key: 'Shift+← / →', label: 'Frame step' },
  { key: 'Home', label: 'Timeline start' },
  { key: 'End', label: 'Timeline end' },
  { key: 'Ctrl+C / Ctrl+V', label: 'Copy / Paste' },
  { key: 'Ctrl+D', label: 'Duplicate' },
  { key: 'Ctrl+E', label: 'Export' },
];

export class Toolbar {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.buttons = {};
    this._reversePlayback = false;
    this._forwardPlayback = false;
    this._helpPanel = null;

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

    // Help button
    const helpBtn = document.getElementById('btn-shortcuts');
    if (helpBtn) {
      helpBtn.addEventListener('click', () => this._toggleHelpPanel());
    }
  }

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (this._isEditingTarget(e)) return;

      // Escape: cancel current operation / close help panel
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this._helpPanel) {
          this._closeHelpPanel();
        } else {
          this.callbacks.onStop?.();
        }
        return;
      }

      // ? to toggle shortcuts help
      if (e.code === 'Slash' && e.shiftKey) {
        e.preventDefault();
        this._toggleHelpPanel();
        return;
      }

      // Ctrl/Cmd+Z → Undo, Ctrl/Cmd+Y / Ctrl+Shift+Z → Redo
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

      // Space: play/pause
      if (e.code === 'Space') {
        e.preventDefault();
        this._reversePlayback = false;
        this._forwardPlayback = false;
        this.callbacks.onTogglePlay?.();
        return;
      }

      // J / K / L shuttle playback
      if (e.code === 'KeyJ') {
        e.preventDefault();
        this._reversePlayback = true;
        this._forwardPlayback = false;
        this.callbacks.onReversePlayback?.();
        return;
      }
      if (e.code === 'KeyK') {
        e.preventDefault();
        this._reversePlayback = false;
        this._forwardPlayback = false;
        this.callbacks.onPause?.();
        return;
      }
      if (e.code === 'KeyL') {
        e.preventDefault();
        this._reversePlayback = false;
        this._forwardPlayback = true;
        this.callbacks.onForwardPlayback?.();
        return;
      }

      // I / O in/out points
      if (e.code === 'KeyI') {
        e.preventDefault();
        this.callbacks.onSetInPoint?.();
        return;
      }
      if (e.code === 'KeyO') {
        e.preventDefault();
        this.callbacks.onSetOutPoint?.();
        return;
      }

      // Navigation
      if (e.code === 'Home') {
        e.preventDefault();
        this.callbacks.onSeek?.(0);
        return;
      }
      if (e.code === 'End') {
        e.preventDefault();
        this.callbacks.onSeek?.(this.callbacks.getDuration?.() || 0);
        return;
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const delta = e.shiftKey ? 1 : 0.1;
        this.callbacks.onNudgeSeek?.(-delta);
        return;
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        const delta = e.shiftKey ? 1 : 0.1;
        this.callbacks.onNudgeSeek?.(delta);
        return;
      }

      // Editing shortcuts require Ctrl/Cmd
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
          case 'KeyC':
            e.preventDefault();
            this.callbacks.onCopy?.();
            return;
          case 'KeyV':
            e.preventDefault();
            this.callbacks.onPaste?.();
            return;
          case 'KeyD':
            e.preventDefault();
            this.callbacks.onDuplicate?.();
            return;
        }
      }

      // Delete/Backspace
      if (e.code === 'Delete' || e.code === 'Backspace') {
        e.preventDefault();
        this.callbacks.onDelete?.();
      }
    });
  }

  _toggleHelpPanel() {
    if (this._helpPanel) {
      this._closeHelpPanel();
    } else {
      this._openHelpPanel();
    }
  }

  _openHelpPanel() {
    const panel = document.createElement('div');
    panel.className = 'shortcuts-help-panel';
    panel.innerHTML = `
      <div class="shortcuts-help-content">
        <div class="shortcuts-help-header">
          <h3>Keyboard Shortcuts</h3>
          <button class="shortcuts-help-close" id="shortcuts-help-close" type="button">✕</button>
        </div>
        <div class="shortcuts-help-body">
          ${SHORTCUTS.map(s => `
            <div class="shortcut-row">
              <kbd class="shortcut-key">${s.key}</kbd>
              <span class="shortcut-label">${s.label}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    this._helpPanel = panel;

    panel.addEventListener('click', (e) => {
      if (e.target === panel || e.target.id === 'shortcuts-help-close') {
        this._closeHelpPanel();
      }
    });
  }

  _closeHelpPanel() {
    if (this._helpPanel) {
      this._helpPanel.remove();
      this._helpPanel = null;
    }
  }

  _updateStates() {
    // Buttons are enabled/disabled dynamically based on undo/redo & selection state
  }

  setVideoLoaded(loaded) {
    this._updateStates();
  }

  setHasInOut(hasIn, hasOut) {
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
