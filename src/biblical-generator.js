/**
 * Biblical Generator — scene/project engine for the VIZ editor.
 *
 * This module manages biblical story projects and their scenes in the browser.
 * It intentionally does not claim to generate 3D artwork by itself: scenes are
 * structured production instructions that can later be connected to visual
 * generation and the editor timeline.
 */

const DEFAULT_SCENE_DURATION = 10;
const MAX_SCENES = 500;

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `scene-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanText(value, fallback = '') {
  return String(value ?? '').trim() || fallback;
}

export class BiblicalGenerator {
  constructor(options = {}) {
    this.options = options;
    this.project = null;
    this.scenes = [];
    this.listeners = new Set();

    // Restore the latest biblical project automatically on this device.
    try {
      const saved = globalThis.localStorage?.getItem('viz-biblical-project-v1');
      if (saved) this.loadProject(saved);
    } catch (error) {
      console.warn('No se pudo recuperar el proyecto bíblico guardado:', error);
    }
  }

  createProject(title = 'Historia bíblica', metadata = {}) {
    this.project = {
      id: makeId(),
      title: cleanText(title, 'Historia bíblica'),
      description: cleanText(metadata.description),
      bibleReference: cleanText(metadata.bibleReference),
      style: cleanText(metadata.style, 'Cinematográfico bíblico 3D'),
      aspectRatio: cleanText(metadata.aspectRatio, '16:9'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };
    this.scenes = [];
    this._touch();
    this._emit('project-created');
    return this.getProject();
  }

  addScene(description, duration = DEFAULT_SCENE_DURATION, options = {}) {
    const prompt = cleanText(description);
    if (!prompt) throw new Error('La descripción de la escena está vacía.');
    if (this.scenes.length >= MAX_SCENES) {
      throw new Error(`Un proyecto admite un máximo de ${MAX_SCENES} escenas.`);
    }
    if (!this.project) this.createProject(options.title || 'Historia bíblica');

    const seconds = Number(duration);
    const safeDuration = Number.isFinite(seconds)
      ? Math.min(600, Math.max(1, seconds))
      : DEFAULT_SCENE_DURATION;

    const scene = {
      id: makeId(),
      number: this.scenes.length + 1,
      title: cleanText(options.title, `Escena ${this.scenes.length + 1}`),
      description: prompt,
      duration: safeDuration,
      bibleReference: cleanText(options.bibleReference),
      visualStyle: cleanText(options.visualStyle, this.project.style),
      camera: cleanText(options.camera, 'Plano cinematográfico'),
      narration: cleanText(options.narration),
      status: 'planned',
      createdAt: new Date().toISOString()
    };

    this.scenes.push(scene);
    this._touch();
    this._emit('scene-added', scene);
    return { ...scene };
  }

  updateScene(sceneId, changes = {}) {
    const scene = this.scenes.find(item => item.id === sceneId);
    if (!scene) return null;

    if (changes.description !== undefined) {
      scene.description = cleanText(changes.description);
      if (!scene.description) throw new Error('La descripción no puede quedar vacía.');
    }
    if (changes.title !== undefined) scene.title = cleanText(changes.title, scene.title);
    if (changes.duration !== undefined) {
      const duration = Number(changes.duration);
      if (!Number.isFinite(duration) || duration < 1 || duration > 600) {
        throw new Error('La duración debe estar entre 1 y 600 segundos.');
      }
      scene.duration = duration;
    }
    for (const key of ['bibleReference', 'visualStyle', 'camera', 'narration', 'status']) {
      if (changes[key] !== undefined) scene[key] = String(changes[key]);
    }

    this._touch();
    this._emit('scene-updated', scene);
    return { ...scene };
  }

  removeScene(sceneId) {
    const index = this.scenes.findIndex(scene => scene.id === sceneId);
    if (index < 0) return false;
    const [removed] = this.scenes.splice(index, 1);
    this._renumber();
    this._touch();
    this._emit('scene-removed', removed);
    return true;
  }

  moveScene(sceneId, targetIndex) {
    const from = this.scenes.findIndex(scene => scene.id === sceneId);
    if (from < 0) return false;
    const to = Math.max(0, Math.min(this.scenes.length - 1, Math.trunc(targetIndex)));
    const [scene] = this.scenes.splice(from, 1);
    this.scenes.splice(to, 0, scene);
    this._renumber();
    this._touch();
    this._emit('scenes-reordered');
    return true;
  }

  getProject() {
    if (!this.project) return null;
    return {
      ...this.project,
      scenes: this.scenes.map(scene => ({ ...scene })),
      sceneCount: this.scenes.length,
      totalDuration: this.getTotalDuration()
    };
  }

  getTotalDuration() {
    return this.scenes.reduce((total, scene) => total + scene.duration, 0);
  }

  getScene(sceneId) {
    const scene = this.scenes.find(item => item.id === sceneId);
    return scene ? { ...scene } : null;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  toJSON() {
    return JSON.stringify(this.getProject() || {}, null, 2);
  }

  downloadProject(filename) {
    if (!this.project) throw new Error('Primero crea un proyecto bíblico.');
    const blob = new Blob([this.toJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `${this.project.title.replace(/[^a-z0-9-_]+/gi, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  loadProject(data) {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed || !Array.isArray(parsed.scenes)) {
      throw new Error('El archivo no contiene un proyecto bíblico válido.');
    }
    this.project = {
      id: parsed.id || makeId(),
      title: cleanText(parsed.title, 'Historia bíblica'),
      description: cleanText(parsed.description),
      bibleReference: cleanText(parsed.bibleReference),
      style: cleanText(parsed.style, 'Cinematográfico bíblico 3D'),
      aspectRatio: cleanText(parsed.aspectRatio, '16:9'),
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };
    this.scenes = parsed.scenes.slice(0, MAX_SCENES).map((scene, index) => ({
      id: scene.id || makeId(),
      number: index + 1,
      title: cleanText(scene.title, `Escena ${index + 1}`),
      description: cleanText(scene.description),
      duration: Math.max(1, Math.min(600, Number(scene.duration) || DEFAULT_SCENE_DURATION)),
      bibleReference: cleanText(scene.bibleReference),
      visualStyle: cleanText(scene.visualStyle, this.project.style),
      camera: cleanText(scene.camera, 'Plano cinematográfico'),
      narration: cleanText(scene.narration),
      status: scene.status || 'planned',
      createdAt: scene.createdAt || new Date().toISOString()
    })).filter(scene => scene.description);
    this._touch();
    this._emit('project-loaded');
    return this.getProject();
  }

  _renumber() {
    this.scenes.forEach((scene, index) => { scene.number = index + 1; });
  }

  _touch() {
    if (!this.project) return;
    this.project.updatedAt = new Date().toISOString();
    try {
      globalThis.localStorage?.setItem(
        'viz-biblical-project-v1',
        JSON.stringify(this.getProject())
      );
    } catch (error) {
      console.warn('No se pudo guardar el proyecto bíblico en este navegador:', error);
    }
  }

  _emit(type, scene = null) {
    const detail = { type, project: this.getProject(), scene: scene ? { ...scene } : null };
    for (const listener of this.listeners) {
      try { listener(detail); } catch (error) { console.error('BiblicalGenerator listener:', error); }
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('viz:biblical-generator', { detail }));
    }
  }
}

export default BiblicalGenerator;
