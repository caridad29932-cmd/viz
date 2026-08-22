/**
 * Viz — First Local Video Editor
 * Main Application Orchestrator
 */
import './style.css';
import { Composition } from './composition.js';
import { CanvasPreview } from './canvas-preview.js';
import { MultiTimeline } from './multi-timeline.js';
import { MediaManager } from './media-manager.js';
import { PropertiesPanel } from './properties-panel.js';
import { ClipboardManager } from './clipboard.js';
import { ContextMenu } from './context-menu.js';
import { Toolbar } from './toolbar.js';
import { createDefaultStore } from './state.js';
import { loadFFmpeg, exportComposition, downloadBlob } from './ffmpeg-worker.js';
import { formatTime, showToast } from './utils.js';

// --- Global State ---
let composition = null;
let canvasPreview = null;
let multiTimeline = null;
let mediaManager = null;
let propertiesPanel = null;
let clipboardManager = null;
let contextMenu = null;
let toolbar = null;
let store = null;

let isPlaying = false;
let playAnimFrameId = null;
let lastPlayTimestamp = 0;
let playbackRate = 1;

let inPoint = 0;
let outPoint = 0;

// --- DOM References ---
const previewCanvasEl = document.getElementById('preview-canvas');
const timelineContainerEl = document.getElementById('multitimeline-container');
const propertiesContainerEl = document.getElementById('properties-panel-container');

const ctrlPlayBtn = document.getElementById('ctrl-play');
const ctrlStopBtn = document.getElementById('ctrl-stop');
const ctrlTimeEl = document.getElementById('ctrl-time');
const previewTimeEl = document.getElementById('preview-time');
const previewBadgeEl = document.getElementById('preview-badge');
const previewRatioSelectEl = document.getElementById('preview-ratio-select');
const headerStatusEl = document.getElementById('header-status');
const headerFilenameEl = document.getElementById('header-filename');

const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomLevelEl = document.getElementById('zoom-level');

const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');

const btnCopy = document.getElementById('btn-copy');
const btnPaste = document.getElementById('btn-paste');
const btnDuplicate = document.getElementById('btn-duplicate');
const btnDelete = document.getElementById('btn-delete');
const btnExport = document.getElementById('btn-export');

const progressOverlay = document.getElementById('progress-overlay');
const progressBar = document.getElementById('progress-bar');
const progressPercent = document.getElementById('progress-percent');
const progressTitle = document.getElementById('progress-title');
const progressSubtitle = document.getElementById('progress-subtitle');
const progressCancelBtn = document.getElementById('progress-cancel-btn');

const exportWidthEl = document.getElementById('export-width');
const exportHeightEl = document.getElementById('export-height');
const exportFpsEl = document.getElementById('export-fps');
const exportQualityEl = document.getElementById('export-quality');

let exportAbortController = null;
let isExporting = false;

const mediaUrlRegistry = new Map(); // clipId -> objectUrl for cleanup

// --- Initialization ---
function initApp() {
  store = createDefaultStore();
  composition = new Composition(1920, 1080);

  // 1. Media Manager
  mediaManager = new MediaManager(composition, () => onCompositionChanged(), onMediaUrlRegistered, store);

  // 2. Clipboard Manager
  clipboardManager = new ClipboardManager(
    composition,
    () => canvasPreview ? canvasPreview.currentTime : 0,
    () => onCompositionChanged(),
    onMediaUrlRegistered
  );

  // 3. Context Menu
  contextMenu = new ContextMenu({
    composition: composition,
    getPlayheadTime: () => canvasPreview ? canvasPreview.currentTime : 0,
    onCompositionChanged: () => onCompositionChanged(),
    clipboardManager: clipboardManager,
    onMediaUrlRegistered: onMediaUrlRegistered
  });

  // 4. Canvas Preview Renderer
  canvasPreview = new CanvasPreview({
    canvas: previewCanvasEl,
    composition: composition,
    onSelectClip: (clipId) => onCompositionChanged(),
    onChangeClipTransform: (clip) => {
      propertiesPanel.render();
    },
    onContextMenu: (x, y, clipId) => {
      contextMenu.show(x, y, clipId);
    }
  });

  // 5. Multi-Track Timeline
  multiTimeline = new MultiTimeline({
    container: timelineContainerEl,
    composition: composition,
    store: store,
    onSeek: (targetTime) => {
      seekTo(targetTime);
    },
    onSelectClip: (clipId) => onCompositionChanged(),
    onChangeClipTime: (clip) => {
      propertiesPanel.render();
      canvasPreview.render();
    },
    onContextMenu: (x, y, clipId, clickTime) => {
      contextMenu.show(x, y, clipId, clickTime);
    }
  });

  // 6. Properties Panel
  propertiesPanel = new PropertiesPanel(
    propertiesContainerEl,
    composition,
    () => onCompositionChanged(),
    onMediaUrlRegistered,
    store
  );

  // 7. Toolbar
  toolbar = new Toolbar({
    onTogglePlay: togglePlay,
    onPause: pause,
    onStop: stop,
    onReversePlayback: () => setPlaybackRate(-1),
    onForwardPlayback: () => setPlaybackRate(1),
    onUndo: () => { if (composition.undo()) onCompositionChanged(); },
    onRedo: () => { if (composition.redo()) onCompositionChanged(); },
    onSplit: () => {
      const clip = composition.getSelectedClip();
      if (clip && contextMenu) contextMenu.splitClipAtTime(clip, canvasPreview.currentTime);
    },
    onDelete: () => clipboardManager.deleteSelected(),
    onExport: handleExport,
    onCopy: () => clipboardManager.copy(),
    onPaste: () => clipboardManager.paste(),
    onDuplicate: () => clipboardManager.duplicate(),
    onSetInPoint: setInPoint,
    onSetOutPoint: setOutPoint,
    onSeek: (t) => seekTo(t),
    onNudgeSeek: (delta) => seekTo((canvasPreview?.currentTime || 0) + delta),
    getDuration: () => composition.duration
  });

  bindControls();
  bindDropHandlers();
  loadFFmpegInBackground();
  onCompositionChanged();
  updateHeaderProjectName();
}

function onMediaUrlRegistered(clipId, objectUrl) {
  if (objectUrl) mediaUrlRegistry.set(clipId, objectUrl);
  else mediaUrlRegistry.delete(clipId);
}

function onCompositionChanged() {
  if (
    canvasPreview.canvas.width === 0 ||
    canvasPreview.canvas.height === 0 ||
    canvasPreview.lastCompWidth !== composition.width ||
    canvasPreview.lastCompHeight !== composition.height
  ) {
    canvasPreview.resize();
    canvasPreview.lastCompWidth = composition.width;
    canvasPreview.lastCompHeight = composition.height;
  }

  canvasPreview.markNeedsRender();
  multiTimeline.render();
  propertiesPanel.render();
  updatePreviewResolutionBadge();
  updateTimeDisplay();
  updateUndoRedoButtons();
  toolbar?.setPlaying(isPlaying);
}

function updatePreviewResolutionBadge() {
  if (previewBadgeEl) {
    previewBadgeEl.textContent = `${composition.width}×${composition.height}`;
  }
  if (previewRatioSelectEl) {
    const ratio = getAspectRatioPreset(composition.width, composition.height);
    previewRatioSelectEl.value = ratio;
  }
}

function getAspectRatioPreset(width, height) {
  const r = width / height;
  if (Math.abs(r - 16 / 9) < 0.02) return '16:9';
  if (Math.abs(r - 9 / 16) < 0.02) return '9:16';
  if (Math.abs(r - 1) < 0.02) return '1:1';
  if (Math.abs(r - 4 / 5) < 0.02) return '4:5';
  if (Math.abs(r - 4 / 3) < 0.02) return '4:3';
  if (Math.abs(r - 21 / 9) < 0.02) return '21:9';
  return 'custom';
}

function getPresetDimensions(presetKey, currentWidth, currentHeight) {
  const presets = {
    '16:9': 16 / 9,
    '9:16': 9 / 16,
    '1:1': 1,
    '4:5': 4 / 5,
    '4:3': 4 / 3,
    '21:9': 21 / 9,
  };
  const ratio = presets[presetKey];
  if (!ratio) return { width: currentWidth, height: currentHeight };
  const area = currentWidth * currentHeight;
  const height = Math.round(Math.sqrt(area / ratio));
  const width = Math.round(height * ratio);
  return { width, height };
}

function seekTo(targetTime, playing = false) {
  const t = clamp(targetTime, 0, composition.duration);
  canvasPreview.setCurrentTime(t);
  multiTimeline.setCurrentTime(t);
  updateTimeDisplay();
  syncActiveMedia(t, playing);
}

function resizePreviewOnce() {
  if (!canvasPreview) return;
  if (
    canvasPreview.lastCompWidth !== composition.width ||
    canvasPreview.lastCompHeight !== composition.height
  ) {
    canvasPreview.resize();
    canvasPreview.lastCompWidth = composition.width;
    canvasPreview.lastCompHeight = composition.height;
  }
}

function updateTimeDisplay() {
  const current = canvasPreview.currentTime;
  const total = composition.duration;

  if (ctrlTimeEl) ctrlTimeEl.textContent = formatTime(current);
  if (previewTimeEl) previewTimeEl.textContent = `${formatTime(current)} / ${formatTime(total)}`;
}

function updateUndoRedoButtons() {
  if (btnUndo) btnUndo.disabled = !composition.canUndo();
  if (btnRedo) btnRedo.disabled = !composition.canRedo();
  toolbar?.setUndoRedo(composition.canUndo(), composition.canRedo());
}

function syncActiveMedia(time, playing) {
  const clips = composition.getClipsAtTime(time);

  for (const clip of clips) {
    if (!clip.element) continue;
    const trimStart = clip.trimStart || 0;
    const trimEnd = clip.trimEnd || (trimStart + clip.duration) || (clip.element.duration || Infinity);
    const clipEndTime = clip.startTime + clip.duration;
    const offset = time - clip.startTime + trimStart;

    if (clip.type === 'video' || clip.type === 'audio') {
      const track = composition.getTrack(clip.trackId);
      const isMuted = track ? track.muted : false;

      const reachedTrimEnd = time >= clipEndTime - 1e-9 || offset >= trimEnd - 1e-9;
      if (reachedTrimEnd) {
        if (!clip.element.paused) clip.element.pause();
        clip.element.currentTime = clamp(offset, 0, trimEnd);
        clip.element.muted = isMuted;
        continue;
      }

      const threshold = playing ? 0.5 : 0.05;
      if (Math.abs(clip.element.currentTime - offset) > threshold) {
        clip.element.currentTime = clamp(offset, 0, trimEnd);
      }

      if (playing && clip.element.paused) {
        clip.element.volume = clip.volume ?? 1;
        clip.element.muted = isMuted;
        clip.element.playbackRate = Math.abs(playbackRate);
        clip.element.play().catch(() => {});
      } else if (!playing && !clip.element.paused) {
        clip.element.pause();
      } else {
        clip.element.muted = isMuted;
      }
    }
  }

  for (const clip of composition.clips) {
    if (!clip.element || (clip.type !== 'video' && clip.type !== 'audio')) continue;
    const active = time >= clip.startTime - 1e-9 && time <= clip.startTime + clip.duration + 1e-9;
    if (!active && !clip.element.paused) {
      clip.element.pause();
    }
  }
}

function togglePlay() {
  if (isPlaying) {
    pause();
  } else {
    play();
  }
}

function setPlaybackRate(rate) {
  playbackRate = rate;
  if (!isPlaying) {
    play();
  }
}

function play() {
  if (isPlaying) return;
  isPlaying = true;
  if (canvasPreview) canvasPreview.setIsPlaying(true);
  lastPlayTimestamp = performance.now();

  syncActiveMedia(canvasPreview.currentTime, true);

  const playIcon = document.getElementById('ctrl-play-icon');
  if (playIcon) {
    playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>';
  }
  toolbar?.setPlaying(true);

  const loop = (now) => {
    if (!isPlaying) return;
    const dt = ((now - lastPlayTimestamp) / 1000) * playbackRate;
    lastPlayTimestamp = now;

    let nextTime = canvasPreview.currentTime + dt;
    const totalDur = composition.duration;

    // Loop between in/out points if they are set
    if (outPoint > inPoint) {
      if (nextTime > outPoint) nextTime = inPoint;
      if (nextTime < inPoint && dt < 0) nextTime = outPoint;
    }

    if (nextTime >= totalDur) {
      nextTime = totalDur;
      pause();
    } else if (nextTime < 0) {
      nextTime = 0;
      pause();
    }

    canvasPreview.setCurrentTime(nextTime);
    multiTimeline.setCurrentTime(nextTime);
    updateTimeDisplay();
    syncActiveMedia(nextTime, true);

    playAnimFrameId = requestAnimationFrame(loop);
  };

  playAnimFrameId = requestAnimationFrame(loop);
}

function pause() {
  if (!isPlaying) return;
  isPlaying = false;
  playbackRate = 1;
  if (canvasPreview) canvasPreview.setIsPlaying(false);
  if (playAnimFrameId) cancelAnimationFrame(playAnimFrameId);

  syncActiveMedia(canvasPreview.currentTime, false);

  const playIcon = document.getElementById('ctrl-play-icon');
  if (playIcon) {
    playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
  }
  toolbar?.setPlaying(false);
}

function stop() {
  pause();
  seekTo(inPoint || 0);
}

function setInPoint() {
  inPoint = canvasPreview.currentTime;
  showToast(`In point set: ${formatTime(inPoint)}`, 'info');
}

function setOutPoint() {
  outPoint = canvasPreview.currentTime;
  showToast(`Out point set: ${formatTime(outPoint)}`, 'info');
}

// --- Event Controls Binding ---
function bindControls() {
  if (ctrlPlayBtn) ctrlPlayBtn.addEventListener('click', togglePlay);
  if (ctrlStopBtn) ctrlStopBtn.addEventListener('click', stop);

  document.getElementById('add-video-btn')?.addEventListener('click', () => mediaManager.addVideo());
  document.getElementById('add-image-btn')?.addEventListener('click', () => mediaManager.addImage());
  document.getElementById('add-text-btn')?.addEventListener('click', () => {
    const textVal = prompt('Enter text for overlay:', 'Title Overlay');
    if (textVal) mediaManager.addText(textVal);
  });
  document.getElementById('add-audio-btn')?.addEventListener('click', () => mediaManager.addAudio());

  const btnNewProject = document.getElementById('btn-new-project');
  const btnSaveProject = document.getElementById('btn-save-project');
  const btnLoadProject = document.getElementById('btn-load-project');
  const loadProjectInput = document.getElementById('load-project-input');

  if (btnNewProject) btnNewProject.addEventListener('click', () => window.newProject?.());
  if (btnSaveProject) btnSaveProject.addEventListener('click', () => window.saveProject?.());
  if (btnLoadProject && loadProjectInput) {
    btnLoadProject.addEventListener('click', () => loadProjectInput.click());
    loadProjectInput.addEventListener('change', () => {
      if (loadProjectInput.files && loadProjectInput.files[0]) {
        window.loadProject?.(loadProjectInput.files[0]);
      }
      loadProjectInput.value = '';
    });
  }

  if (btnCopy) btnCopy.addEventListener('click', () => clipboardManager.copy());
  if (btnPaste) btnPaste.addEventListener('click', () => clipboardManager.paste());
  if (btnDuplicate) btnDuplicate.addEventListener('click', () => clipboardManager.duplicate());
  if (btnDelete) btnDelete.addEventListener('click', () => clipboardManager.deleteSelected());

  if (btnUndo) btnUndo.addEventListener('click', () => { if (composition.undo()) onCompositionChanged(); });
  if (btnRedo) btnRedo.addEventListener('click', () => { if (composition.redo()) onCompositionChanged(); });

  if (zoomInBtn) zoomInBtn.addEventListener('click', () => {
    multiTimeline.setZoom(multiTimeline.zoomLevel + 0.5);
    if (zoomLevelEl) zoomLevelEl.textContent = `${Math.round(multiTimeline.zoomLevel * 100)}%`;
  });
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => {
    multiTimeline.setZoom(multiTimeline.zoomLevel - 0.5);
    if (zoomLevelEl) zoomLevelEl.textContent = `${Math.round(multiTimeline.zoomLevel * 100)}%`;
  });


  if (previewRatioSelectEl) {
    previewRatioSelectEl.addEventListener('change', () => {
      const preset = previewRatioSelectEl.value;
      if (preset === 'custom') return;
      const dims = getPresetDimensions(preset, composition.width, composition.height);
      composition.setDimensions(dims.width, dims.height);
      onCompositionChanged();
    });
  }

  initSidebarResizer();
}

function initSidebarResizer() {
  const resizer = document.getElementById('sidebar-resizer');
  const sidebar = document.querySelector('.editor-sidebar');
  if (!resizer || !sidebar) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('pointerdown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    resizer.setPointerCapture(e.pointerId);
    resizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  resizer.addEventListener('pointermove', (e) => {
    if (!isResizing) return;
    const delta = e.clientX - startX;
    const newWidth = Math.max(220, Math.min(window.innerWidth * 0.4, startWidth - delta));
    sidebar.style.width = `${newWidth}px`;
    document.documentElement.style.setProperty('--sidebar-w', `${newWidth}px`);
  });

  const endResize = (e) => {
    if (!isResizing) return;
    isResizing = false;
    try { resizer.releasePointerCapture(e?.pointerId); } catch (_) {}
    resizer.classList.remove('resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  resizer.addEventListener('pointerup', endResize);
  resizer.addEventListener('pointercancel', endResize);
}

function bindDropHandlers() {
  const handleFiles = async (files, e) => {
    if (!files || files.length === 0) return;

    const rect = timelineContainerEl.getBoundingClientRect();
    const dropX = e.clientX - rect.left + timelineContainerEl.scrollLeft;
    const pps = multiTimeline.pxPerSec * multiTimeline.zoomLevel;
    const dropTime = Math.max(0, dropX / pps);
    const dropY = e.clientY - rect.top + timelineContainerEl.scrollTop;
    const trackIndex = Math.floor(dropY / 34);

    for (const file of files) {
      await mediaManager.importFile(file, { startTime: dropTime, trackIndex });
    }

    onCompositionChanged();
  };

  multiTimeline.onDropFiles(handleFiles);
  canvasPreview.onDropFiles(handleFiles);
}

// --- Export Handling ---
async function handleExport() {
  if (composition.clips.length === 0) {
    showToast('Add at least one element before exporting', 'warning');
    return;
  }

  if (isExporting) {
    showToast('Export already in progress', 'info');
    return;
  }

  isExporting = true;
  if (btnExport) btnExport.disabled = true;

  exportAbortController = new AbortController();
  const signal = exportAbortController.signal;

  pause();
  showProgress('Exporting Composition', 'Rendering video and mixing audio in browser...', 0);

  if (progressCancelBtn) {
    progressCancelBtn.textContent = 'Cancel Export';
    progressCancelBtn.disabled = false;
    progressCancelBtn.onclick = () => {
      if (exportAbortController) exportAbortController.abort();
      exportAbortController = null;
      hideProgress();
      showToast('Export cancelled', 'info');
    };
  }

  try {
    const width = parseInt(exportWidthEl?.value, 10) || composition.width;
    const height = parseInt(exportHeightEl?.value, 10) || composition.height;
    const fps = parseInt(exportFpsEl?.value, 10) || 30;
    const quality = exportQualityEl?.value || 'high';

    const { blob, ext } = await exportComposition(composition, canvasPreview, (progressPct, stage) => {
      if (signal.aborted) return;
      if (stage) progressSubtitle.textContent = stage;
      updateProgress(progressPct);
    }, signal, { width, height, fps, quality });

    if (signal.aborted) {
      hideProgress();
      return;
    }

    hideProgress();

    if (!blob || blob.size === 0) {
      showToast('Export failed: Rendered blob is empty', 'error', 6000);
      return;
    }

    const filename = `Viz_Export_${Date.now()}.${ext || 'mp4'}`;
    downloadBlob(blob, filename);
    showToast(`Export Complete! Downloading ${filename}`, 'success', 5000);
  } catch (err) {
    hideProgress();
    console.error('Export error:', err);
    if (err?.name === 'AbortError' || signal?.aborted) {
      showToast('Export cancelled', 'info');
      return;
    }
    const msg = err?.message || (typeof err === 'string' ? err : 'Export processing failed');
    showToast(`Export failed: ${msg}`, 'error', 6000);
  } finally {
    exportAbortController = null;
    isExporting = false;
    if (btnExport) btnExport.disabled = false;
    if (progressCancelBtn) progressCancelBtn.disabled = true;
  }
}

function showProgress(title, subtitle, initialPct = 0) {
  if (progressTitle) progressTitle.textContent = title;
  if (progressSubtitle) progressSubtitle.textContent = subtitle;
  updateProgress(initialPct);
  if (progressOverlay) progressOverlay.classList.add('visible');
}

function updateProgress(pct) {
  if (progressBar) progressBar.style.width = `${pct}%`;
  if (progressPercent) progressPercent.textContent = `${pct}%`;
}

function hideProgress() {
  if (progressOverlay) progressOverlay.classList.remove('visible');
}

async function loadFFmpegInBackground() {
  if (headerStatusEl) headerStatusEl.textContent = 'Loading Engine...';
  try {
    await loadFFmpeg();
    if (headerStatusEl) headerStatusEl.textContent = 'FFmpeg Ready';
  } catch (e) {
    console.warn('FFmpeg load failed:', e);
    if (headerStatusEl) headerStatusEl.textContent = 'Canvas Engine Only';
    showToast('Offline encoder unavailable. Exports may fall back to WebM.', 'warning', 6000);
  }
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// --- New Project / Cleanup ---
window.newProject = function newProject() {
  for (const [clipId, url] of mediaUrlRegistry.entries()) {
    URL.revokeObjectURL(url);
  }
  mediaUrlRegistry.clear();
  composition.clear();
  inPoint = 0;
  outPoint = 0;
  onCompositionChanged();
  updateHeaderProjectName('Multi-Track Project');
  showToast('New project created', 'info');
};

window.saveProject = function saveProject() {
  const data = composition.toJSON();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `Viz_Project_${Date.now()}.json`);
};

window.loadProject = async function loadProject(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    for (const [clipId, url] of mediaUrlRegistry.entries()) {
      URL.revokeObjectURL(url);
    }
    mediaUrlRegistry.clear();

    await composition.fromJSON(data, async (srcUrl, type) => {
      if (srcUrl && srcUrl.startsWith('blob:')) {
        return null;
      }
      return srcUrl;
    });

    for (const clip of composition.clips) {
      if (clip.src && !clip.src.startsWith('blob:')) {
        onMediaUrlRegistered(clip.id, clip.src);
      }
    }

    onCompositionChanged();
    updateHeaderProjectName(data.name || file.name.replace(/\.json$/i, ''));
    showToast('Project loaded', 'success');
  } catch (err) {
    showToast(`Project load failed: ${err.message}`, 'error', 6000);
    console.error(err);
  }
};

// Start app
document.addEventListener('DOMContentLoaded', initApp);
