/**
 * Properties Panel Module
 * Displays and allows editing properties of the currently selected element.
 */
import { formatTime, escapeHtml, showToast } from './utils.js';
import { setKeyframe } from './keyframes.js';

const ASPECT_PRESETS = {
  '16:9': { ratio: 16 / 9, name: '16:9 Landscape', default: { width: 1920, height: 1080 } },
  '9:16': { ratio: 9 / 16, name: '9:16 Portrait', default: { width: 1080, height: 1920 } },
  '1:1': { ratio: 1, name: '1:1 Square', default: { width: 1080, height: 1080 } },
  '4:5': { ratio: 4 / 5, name: '4:5 Vertical', default: { width: 1080, height: 1350 } },
  '4:3': { ratio: 4 / 3, name: '4:3 Classic', default: { width: 1440, height: 1080 } },
  '21:9': { ratio: 21 / 9, name: '21:9 Ultrawide', default: { width: 2560, height: 1080 } },
};

function getAspectRatioPreset(width, height) {
  const ratio = width / height;
  for (const [key, cfg] of Object.entries(ASPECT_PRESETS)) {
    if (Math.abs(ratio - cfg.ratio) < 0.02) return key;
  }
  return 'custom';
}

function getPresetDimensions(presetKey, currentWidth, currentHeight) {
  const cfg = ASPECT_PRESETS[presetKey];
  if (!cfg) return { width: currentWidth, height: currentHeight };

  const currentArea = currentWidth * currentHeight;
  const targetRatio = cfg.ratio;
  const height = Math.round(Math.sqrt(currentArea / targetRatio));
  const width = Math.round(height * targetRatio);
  return { width, height };
}


export class PropertiesPanel {
  constructor(container, composition, onChange, onMediaUrlRegistered, store) {
    this.container = container;
    this.comp = composition;
    this.onChange = onChange;
    this.onMediaUrlRegistered = onMediaUrlRegistered;
    this.store = store;

    this._lastSelectedClipId = null;
    this._lastPanelMode = null;

    this.render();
  }

  render() {
    const clip = this.comp.getSelectedClip();
    const mode = clip ? 'clip' : 'canvas';

    if (mode === 'clip' && this._lastPanelMode === 'clip' && this._lastSelectedClipId === clip.id) {
      this._updateClipValues(clip);
      return;
    }

    this._lastPanelMode = mode;
    this._lastSelectedClipId = clip ? clip.id : null;

    if (!clip) {
      this.renderCanvasSettings();
      return;
    }

    this._renderClipPanel(clip);
  }

  _updateClipValues(clip) {
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (document.activeElement === el) return;
      if (el.value !== String(val)) el.value = val;
    };

    setVal('prop-start', clip.startTime);
    setVal('prop-duration', clip.duration);

    const isVisual = clip.type === 'video' || clip.type === 'image' || clip.type === 'text';
    if (isVisual) {
      setVal('prop-x', clip.x);
      setVal('prop-y', clip.y);
      setVal('prop-w', clip.width);
      setVal('prop-h', clip.height);
      setVal('prop-opacity', clip.opacity);
      const opacityVal = document.getElementById('prop-opacity-val');
      if (opacityVal) opacityVal.textContent = `${Math.round(clip.opacity * 100)}%`;
    }

    if (clip.type === 'text') {
      const textEl = document.getElementById('prop-text-content');
      if (textEl && document.activeElement !== textEl) {
        const safeText = clip.text || '';
        if (textEl.value !== safeText) textEl.value = safeText;
      }
      setVal('prop-text-size', clip.fontSize);
      const fontEl = document.getElementById('prop-text-font');
      if (fontEl && fontEl.value !== clip.fontFamily) fontEl.value = clip.fontFamily;
      setVal('prop-text-color', clip.color);
      const bgColor = clip.bgColor === 'transparent' ? '#000000' : clip.bgColor;
      setVal('prop-text-bg', bgColor);
      const bgTrans = document.getElementById('prop-text-bg-transparent');
      if (bgTrans) bgTrans.checked = clip.bgColor === 'transparent';
      const alignBtns = this.container.querySelectorAll('#prop-text-align .seg-btn');
      alignBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.align === (clip.textAlign || 'center'));
      });
      const boldEl = document.getElementById('prop-text-bold');
      if (boldEl) boldEl.checked = clip.fontWeight === 'bold';
    }

    const hasAudio = clip.type === 'video' || clip.type === 'audio';
    if (hasAudio) {
      setVal('prop-volume', clip.volume ?? 1);
      const volVal = document.getElementById('prop-volume-val');
      if (volVal) volVal.textContent = `${Math.round((clip.volume ?? 1) * 100)}%`;
    }
  }

  _renderClipPanel(clip) {
    const isVisual = clip.type === 'video' || clip.type === 'image' || clip.type === 'text';
    const isText = clip.type === 'text';
    const hasAudio = clip.type === 'video' || clip.type === 'audio';
    const hasKeyframes = clip.keyframes && Object.keys(clip.keyframes).length > 0;

    const safeType = escapeHtml(clip.type.toUpperCase());
    const safeText = escapeHtml(clip.text || '');

    this.container.innerHTML = `
      <div class="panel-header compact">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M14 9h7"/><path d="M14 15h7"/></svg>
        <span>Properties: ${safeType}</span>
      </div>
      <div class="properties-body">

        <!-- Time & Duration -->
        <div class="prop-section">
          <span class="prop-section-title">TIMING & DURATION</span>
          <div class="prop-row">
            <label>Start Time (s)</label>
            <input type="number" step="0.1" min="0" id="prop-start" value="${clip.startTime}">
          </div>
          <div class="prop-row">
            <label>Duration (s)</label>
            <input type="number" step="0.1" min="0.5" id="prop-duration" value="${clip.duration}">
          </div>
        </div>

        ${isVisual ? `
        <!-- Transform -->
        <div class="prop-section">
          <span class="prop-section-title">TRANSFORM & POSITION</span>
          <div class="prop-grid-2">
            <div class="prop-field">
              <label>X (px)</label>
              <input type="number" id="prop-x" value="${clip.x}">
            </div>
            <div class="prop-field">
              <label>Y (px)</label>
              <input type="number" id="prop-y" value="${clip.y}">
            </div>
            <div class="prop-field">
              <label>Width (px)</label>
              <input type="number" min="10" id="prop-w" value="${clip.width}">
            </div>
            <div class="prop-field">
              <label>Height (px)</label>
              <input type="number" min="10" id="prop-h" value="${clip.height}">
            </div>
          </div>
          <div class="prop-row" style="margin-top: 6px;">
            <label>Opacity</label>
            <input type="range" min="0" max="1" step="0.05" id="prop-opacity" value="${clip.opacity}">
            <span class="prop-val-display" id="prop-opacity-val">${Math.round(clip.opacity * 100)}%</span>
          </div>
        </div>
        ` : ''}

        ${isText ? `
        <!-- Text Properties -->
        <div class="prop-section">
          <span class="prop-section-title">TEXT STYLING</span>
          <div class="prop-row-col">
            <label>Text Content</label>
            <textarea id="prop-text-content" rows="4">${safeText}</textarea>
          </div>
          <div class="prop-row">
            <label>Font Size</label>
            <input type="number" min="12" max="300" id="prop-text-size" value="${clip.fontSize}">
          </div>
          <div class="prop-row">
            <label>Font Family</label>
            <select id="prop-text-font">
              <option value="Inter" ${clip.fontFamily === 'Inter' ? 'selected' : ''}>Inter</option>
              <option value="JetBrains Mono" ${clip.fontFamily === 'JetBrains Mono' ? 'selected' : ''}>JetBrains Mono</option>
              <option value="Arial" ${clip.fontFamily === 'Arial' ? 'selected' : ''}>Arial</option>
              <option value="Impact" ${clip.fontFamily === 'Impact' ? 'selected' : ''}>Impact</option>
              <option value="Georgia" ${clip.fontFamily === 'Georgia' ? 'selected' : ''}>Georgia</option>
            </select>
          </div>
          <div class="prop-row">
            <label>Custom Font</label>
            <input type="file" id="prop-text-font-file" accept=".ttf,.otf,.woff,.woff2">
          </div>
          <div class="prop-row">
            <label>Align</label>
            <div class="prop-segmented" id="prop-text-align">
              <button type="button" class="seg-btn ${clip.textAlign === 'left' ? 'active' : ''}" data-align="left">L</button>
              <button type="button" class="seg-btn ${clip.textAlign === 'center' ? 'active' : ''}" data-align="center">C</button>
              <button type="button" class="seg-btn ${clip.textAlign === 'right' ? 'active' : ''}" data-align="right">R</button>
            </div>
          </div>
          <div class="prop-row">
            <label>Bold</label>
            <input type="checkbox" id="prop-text-bold" ${clip.fontWeight === 'bold' ? 'checked' : ''}>
          </div>
          <div class="prop-row">
            <label>Text Color</label>
            <input type="color" id="prop-text-color" value="${clip.color}">
          </div>
          <div class="prop-row">
            <label>Background</label>
            <input type="color" id="prop-text-bg" value="${clip.bgColor === 'transparent' ? '#000000' : clip.bgColor}">
          </div>
          <div class="prop-row">
            <label>Transparent BG</label>
            <input type="checkbox" id="prop-text-bg-transparent" ${clip.bgColor === 'transparent' ? 'checked' : ''}>
          </div>
        ` : ''}

        ${hasAudio ? `
        <!-- Audio Volume -->
        <div class="prop-section">
          <span class="prop-section-title">AUDIO</span>
          <div class="prop-row">
            <label>Volume</label>
            <input type="range" min="0" max="2" step="0.05" id="prop-volume" value="${clip.volume ?? 1}">
            <span class="prop-val-display" id="prop-volume-val">${Math.round((clip.volume ?? 1) * 100)}%</span>
          </div>
          <div class="prop-row">
            <label>Fade In (s)</label>
            <input type="number" min="0" step="0.1" id="prop-fade-in" value="${clip.fadeIn || 0}">
          </div>
          <div class="prop-row">
            <label>Fade Out (s)</label>
            <input type="number" min="0" step="0.1" id="prop-fade-out" value="${clip.fadeOut || 0}">
          </div>
        </div>
        ` : ''}

        <!-- Keyframes -->
        <div class="prop-section">
          <span class="prop-section-title">KEYFRAMES</span>
          <div class="prop-row">
            <button class="tool-btn" id="prop-kf-position" type="button">+ Position</button>
            <button class="tool-btn" id="prop-kf-scale" type="button">+ Scale</button>
          </div>
          <div class="prop-row" style="margin-top: 4px;">
            <button class="tool-btn" id="prop-kf-rotation" type="button">+ Rotation</button>
            <button class="tool-btn" id="prop-kf-opacity" type="button">+ Opacity</button>
          </div>
          ${hasKeyframes ? `
          <div class="prop-row" style="margin-top: 6px;">
            <span class="prop-val-display">${Object.keys(clip.keyframes).length} animated properties</span>
          </div>
          ` : ''}
        </div>

        <div class="prop-actions">
          <button class="tool-btn danger wide" id="prop-delete-btn" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete Element
          </button>
        </div>

      </div>
    `;

    this._bindInputs(clip);
  }

  renderCanvasSettings() {
    const duration = this.comp.duration;
    const trackCount = this.comp.tracks.length;
    const clipCount = this.comp.clips.length;
    const ratio = getAspectRatioPreset(this.comp.width, this.comp.height);

    this.container.innerHTML = `
      <div class="panel-header compact">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
        <span>Canvas & Project Settings</span>
      </div>
      <div class="properties-body">

        <div class="prop-section">
          <span class="prop-section-title">ASPECT RATIO PRESET</span>
          <div class="prop-row">
            <select id="canvas-ratio-select" style="width: 100%;">
              <option value="16:9" ${ratio === '16:9' ? 'selected' : ''}>16:9 Landscape</option>
              <option value="9:16" ${ratio === '9:16' ? 'selected' : ''}>9:16 Portrait</option>
              <option value="1:1" ${ratio === '1:1' ? 'selected' : ''}>1:1 Square</option>
              <option value="4:5" ${ratio === '4:5' ? 'selected' : ''}>4:5 Vertical</option>
              <option value="4:3" ${ratio === '4:3' ? 'selected' : ''}>4:3 Classic</option>
              <option value="21:9" ${ratio === '21:9' ? 'selected' : ''}>21:9 Ultrawide</option>
              <option value="custom" ${ratio === 'custom' ? 'selected' : ''}>Custom</option>
            </select>
          </div>
        </div>

        <div class="prop-section">
          <span class="prop-section-title">RESOLUTION (PX)</span>
          <div class="canvas-prop-grid">
            <div class="prop-field">
              <label>Width</label>
              <input type="number" min="100" max="7680" id="canvas-width" value="${this.comp.width}">
            </div>
            <div class="prop-field">
              <label>Height</label>
              <input type="number" min="100" max="7680" id="canvas-height" value="${this.comp.height}">
            </div>
          </div>
          <div class="canvas-scale-row" style="margin-top: 6px;">
            <button class="canvas-scale-btn" data-w="3840" data-h="2160">4K</button>
            <button class="canvas-scale-btn" data-w="1920" data-h="1080">1080p</button>
            <button class="canvas-scale-btn" data-w="1280" data-h="720">720p</button>
            <button class="canvas-scale-btn" data-w="960" data-h="540">540p</button>
          </div>
          <button class="tool-btn wide" id="canvas-apply-btn" type="button" style="margin-top: 10px;">Apply Settings</button>
        </div>

        <div class="prop-section">
          <span class="prop-section-title">PROJECT SUMMARY</span>
          <div class="canvas-summary">
            <div><strong>Duration:</strong> ${formatTime(duration)}</div>
            <div><strong>Tracks:</strong> ${trackCount}</div>
            <div><strong>Clips:</strong> ${clipCount}</div>
            <div><strong>Resolution:</strong> ${this.comp.width}×${this.comp.height}</div>
          </div>
        </div>

      </div>
    `;

    this._bindCanvasInputs();
  }

  _bindCanvasInputs() {
    const widthEl = document.getElementById('canvas-width');
    const heightEl = document.getElementById('canvas-height');
    const ratioSelect = document.getElementById('canvas-ratio-select');
    const applyBtn = document.getElementById('canvas-apply-btn');

    const applyDimensions = (w, h) => {
      this.comp.setDimensions(w, h);
      if (this.onChange) this.onChange();
      this.render();
    };

    const updateFromPreset = (preset) => {
      if (preset === 'custom') return;
      const dims = getPresetDimensions(preset, this.comp.width, this.comp.height);
      if (widthEl) widthEl.value = dims.width;
      if (heightEl) heightEl.value = dims.height;
    };

    if (ratioSelect) {
      ratioSelect.addEventListener('change', () => {
        updateFromPreset(ratioSelect.value);
      });
    }

    const scaleBtns = this.container.querySelectorAll('.canvas-scale-btn');
    for (const btn of scaleBtns) {
      btn.addEventListener('click', () => {
        const w = parseInt(btn.dataset.w, 10);
        const h = parseInt(btn.dataset.h, 10);
        if (widthEl) widthEl.value = w;
        if (heightEl) heightEl.value = h;
        if (ratioSelect) {
          ratioSelect.value = getAspectRatioPreset(w, h);
        }
      });
    }

    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const w = parseInt(widthEl?.value, 10);
        const h = parseInt(heightEl?.value, 10);
        if (!isNaN(w) && !isNaN(h)) {
          applyDimensions(w, h);
        }
      });
    }
  }

  _bindInputs(clip) {
    const bindNum = (id, prop, isFloat = false) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        const val = isFloat ? parseFloat(el.value) : parseInt(el.value, 10);
        if (!isNaN(val)) {
          clip[prop] = val;
          this.comp.saveSnapshot();
          if (this.onChange) this.onChange();
        }
      });
    };

    bindNum('prop-start', 'startTime', true);
    bindNum('prop-duration', 'duration', true);
    bindNum('prop-x', 'x');
    bindNum('prop-y', 'y');
    bindNum('prop-w', 'width');
    bindNum('prop-h', 'height');

    const opacityEl = document.getElementById('prop-opacity');
    if (opacityEl) {
      opacityEl.addEventListener('input', () => {
        clip.opacity = parseFloat(opacityEl.value);
        document.getElementById('prop-opacity-val').textContent = `${Math.round(clip.opacity * 100)}%`;
        if (this.onChange) this.onChange();
      });
      opacityEl.addEventListener('change', () => this.comp.saveSnapshot());
    }

    const textContentEl = document.getElementById('prop-text-content');
    if (textContentEl) {
      textContentEl.addEventListener('input', () => {
        clip.text = textContentEl.value;
        clip.name = clip.text.length > 15 ? clip.text.substring(0, 15) + '...' : clip.text;
        if (this.onChange) this.onChange();
      });
      textContentEl.addEventListener('change', () => this.comp.saveSnapshot());
    }

    bindNum('prop-text-size', 'fontSize');

    const fontSelect = document.getElementById('prop-text-font');
    if (fontSelect) {
      fontSelect.addEventListener('change', () => {
        clip.fontFamily = fontSelect.value;
        this.comp.saveSnapshot();
        if (this.onChange) this.onChange();
      });
    }

    const fontFileEl = document.getElementById('prop-text-font-file');
    if (fontFileEl) {
      fontFileEl.addEventListener('change', () => {
        const file = fontFileEl.files[0];
        if (!file) return;
        const customName = 'custom-font-' + Date.now();
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          const face = new FontFace(customName, `url(${dataUrl})`);
          face.load().then(() => {
            document.fonts.add(face);
            clip.fontFamily = customName;
            clip.customFontUrl = dataUrl;
            this.comp.saveSnapshot();
            if (this.onChange) this.onChange();
            showToast(`Custom font loaded: ${file.name}`, 'success');
          }).catch((err) => {
            showToast('Failed to load custom font: ' + file.name, 'error');
            console.error(err);
          }).finally(() => {
            fontFileEl.value = '';
          });
        };
        reader.onerror = () => {
          showToast('Failed to read custom font: ' + file.name, 'error');
          fontFileEl.value = '';
        };
        reader.readAsDataURL(file);
      });
    }

    const alignBtns = this.container.querySelectorAll('#prop-text-align .seg-btn');
    alignBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        clip.textAlign = btn.dataset.align;
        alignBtns.forEach(b => b.classList.toggle('active', b === btn));
        this.comp.saveSnapshot();
        if (this.onChange) this.onChange();
      });
    });

    const boldEl = document.getElementById('prop-text-bold');
    if (boldEl) {
      boldEl.addEventListener('change', () => {
        clip.fontWeight = boldEl.checked ? 'bold' : 'normal';
        this.comp.saveSnapshot();
        if (this.onChange) this.onChange();
      });
    }

    const textColorEl = document.getElementById('prop-text-color');
    const textBgEl = document.getElementById('prop-text-bg');
    const textBgTransparentEl = document.getElementById('prop-text-bg-transparent');
    if (textColorEl) {
      textColorEl.addEventListener('input', () => {
        clip.color = textColorEl.value;
        if (this.onChange) this.onChange();
      });
      textColorEl.addEventListener('change', () => this.comp.saveSnapshot());
    }
    if (textBgEl && textBgTransparentEl) {
      const applyBg = () => {
        clip.bgColor = textBgTransparentEl.checked ? 'transparent' : textBgEl.value;
        if (this.onChange) this.onChange();
      };
      textBgEl.addEventListener('input', applyBg);
      textBgEl.addEventListener('change', () => { applyBg(); this.comp.saveSnapshot(); });
      textBgTransparentEl.addEventListener('change', () => { applyBg(); this.comp.saveSnapshot(); });
    }

    const volEl = document.getElementById('prop-volume');
    if (volEl) {
      volEl.addEventListener('input', () => {
        clip.volume = parseFloat(volEl.value);
        document.getElementById('prop-volume-val').textContent = `${Math.round(clip.volume * 100)}%`;
        if (this.onChange) this.onChange();
      });
      volEl.addEventListener('change', () => this.comp.saveSnapshot());
    }

    const fadeInEl = document.getElementById('prop-fade-in');
    const fadeOutEl = document.getElementById('prop-fade-out');
    if (fadeInEl) {
      fadeInEl.addEventListener('change', () => {
        clip.fadeIn = parseFloat(fadeInEl.value) || 0;
        this.comp.saveSnapshot();
        if (this.onChange) this.onChange();
      });
    }
    if (fadeOutEl) {
      fadeOutEl.addEventListener('change', () => {
        clip.fadeOut = parseFloat(fadeOutEl.value) || 0;
        this.comp.saveSnapshot();
        if (this.onChange) this.onChange();
      });
    }

    // Keyframe buttons
    const bindKeyframe = (id, property, valueFn) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', () => {
        const currentTime = this.store ? this.store.get('currentTime') || 0 : 0;
        const value = valueFn();
        clip.keyframes = setKeyframe(clip.keyframes, property, currentTime, value, 'linear');
        this.comp.saveSnapshot();
        if (this.onChange) this.onChange();
        showToast(`Keyframe added: ${property}`, 'success');
      });
    };

    bindKeyframe('prop-kf-position', 'x', () => clip.x);
    bindKeyframe('prop-kf-scale', 'scale', () => 1);
    bindKeyframe('prop-kf-rotation', 'rotation', () => 0);
    bindKeyframe('prop-kf-opacity', 'opacity', () => clip.opacity ?? 1);

    const delBtn = document.getElementById('prop-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        this.onMediaUrlRegistered?.(clip.id, null);
        this.comp.removeClip(clip.id);
        if (this.onChange) this.onChange();
      });
    }
  }
}
