/**
 * Properties Panel Module
 * Displays and allows editing properties of the currently selected element.
 */
import { formatTime, escapeHtml } from './utils.js';

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

  // Keep the current area roughly consistent when switching ratios so users
  // don't get jarring jumps between tiny and huge resolutions.
  const currentArea = currentWidth * currentHeight;
  const targetRatio = cfg.ratio;
  const height = Math.round(Math.sqrt(currentArea / targetRatio));
  const width = Math.round(height * targetRatio);
  return { width, height };
}


export class PropertiesPanel {
  constructor(container, composition, onChange, onMediaUrlRegistered) {
    this.container = container;
    this.comp = composition;
    this.onChange = onChange;
    this.onMediaUrlRegistered = onMediaUrlRegistered;

    this.render();
  }

  render() {
    const clip = this.comp.getSelectedClip();

    if (!clip) {
      this.renderCanvasSettings();
      return;
    }

    const isVisual = clip.type === 'video' || clip.type === 'image' || clip.type === 'text';
    const isText = clip.type === 'text';
    const hasAudio = clip.type === 'video' || clip.type === 'audio';

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
            <input type="text" id="prop-text-content" value="${safeText}">
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
        </div>
        ` : ''}

        <div class="prop-actions">
          <button class="tool-btn danger wide" id="prop-delete-btn">
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

    const textColorEl = document.getElementById('prop-text-color');
    if (textColorEl) {
      textColorEl.addEventListener('input', () => {
        clip.color = textColorEl.value;
        if (this.onChange) this.onChange();
      });
      textColorEl.addEventListener('change', () => this.comp.saveSnapshot());
    }

    const textBgEl = document.getElementById('prop-text-bg');
    const textBgTransparentEl = document.getElementById('prop-text-bg-transparent');
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
