/**
 * Media Manager Module
 * Handles loading & adding Video, Image, Text, and Audio elements into the multi-track composition.
 */
import { validateFile, showToast } from './utils.js';

export class MediaManager {
  constructor(composition, onCompositionChanged, onMediaUrlRegistered) {
    this.comp = composition;
    this.onCompositionChanged = onCompositionChanged;
    this.onMediaUrlRegistered = onMediaUrlRegistered;

    this._bindFileInputs();
  }

  _bindFileInputs() {
    this.videoInput = this._createHiddenInput('video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov');
    this.imageInput = this._createHiddenInput('image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif');
    this.audioInput = this._createHiddenInput('audio/mp3,audio/wav,audio/aac,audio/ogg,audio/m4a,.mp3,.wav,.aac,.ogg,.m4a');

    this.videoInput.addEventListener('change', (e) => this._onVideoSelected(e));
    this.imageInput.addEventListener('change', (e) => this._onImageSelected(e));
    this.audioInput.addEventListener('change', (e) => this._onAudioSelected(e));
  }

  _createHiddenInput(accept) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    return input;
  }

  addVideo() {
    this.videoInput.click();
  }

  addImage() {
    this.imageInput.click();
  }

  addAudio() {
    this.audioInput.click();
  }

  addText(textStr = 'NEW TEXT') {
    const textTrack = this.comp.tracks.find(t => t.type === 'text');
    if (!textTrack) {
      showToast('No text track available', 'error');
      return;
    }

    const clip = this.comp.addClip({
      trackId: textTrack.id,
      type: 'text',
      name: textStr.length > 15 ? textStr.substring(0, 15) + '...' : textStr,
      text: textStr,
      startTime: 0,
      duration: 5,
      x: Math.round(this.comp.width * 0.25),
      y: Math.round(this.comp.height * 0.4),
      width: Math.round(this.comp.width * 0.5),
      height: 120,
      fontSize: 64,
      fontFamily: 'Inter',
      color: '#ffffff',
      bgColor: 'transparent',
      textAlign: 'center'
    });

    showToast(`Added Text: "${textStr}"`, 'success');
    if (this.onCompositionChanged) this.onCompositionChanged();
    return clip;
  }

  async _onVideoSelected(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const val = validateFile(file, 'video');
    if (!val.valid) {
      showToast(val.error, 'error');
      return;
    }

    const videoTrack = this.comp.tracks.find(t => t.type === 'video');
    if (!videoTrack) {
      showToast('No video track available', 'error');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = objectUrl;
    video.preload = 'auto';

    await new Promise((resolve) => {
      video.onloadedmetadata = () => resolve();
    });

    const dur = Math.round(video.duration || 10);
    const vW = video.videoWidth || 1920;
    const vH = video.videoHeight || 1080;

    let targetW = this.comp.width;
    let targetH = Math.round(targetW * (vH / vW));
    if (targetH > this.comp.height) {
      targetH = this.comp.height;
      targetW = Math.round(targetH * (vW / vH));
    }
    const posX = Math.round((this.comp.width - targetW) / 2);
    const posY = Math.round((this.comp.height - targetH) / 2);

    const clip = this.comp.addClip({
      trackId: videoTrack.id,
      type: 'video',
      name: file.name,
      file: file,
      src: objectUrl,
      element: video,
      startTime: 0,
      duration: dur,
      x: posX,
      y: posY,
      width: targetW,
      height: targetH,
      opacity: 1
    });

    if (this.onMediaUrlRegistered) this.onMediaUrlRegistered(clip.id, objectUrl);
    showToast(`Added Video: ${file.name}`, 'success');
    this.videoInput.value = '';
    if (this.onCompositionChanged) this.onCompositionChanged();
  }

  async _onImageSelected(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const val = validateFile(file, 'image');
    if (!val.valid) {
      showToast(val.error, 'error');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = objectUrl;

    await new Promise((resolve) => {
      img.onload = () => resolve();
    });

    const imgTrack = this.comp.tracks.find(t => t.type === 'image') || this.comp.tracks.find(t => t.type === 'video');

    const iW = img.naturalWidth || 800;
    const iH = img.naturalHeight || 600;

    let targetW = Math.min(iW, Math.round(this.comp.width * 0.6));
    let targetH = Math.round(targetW * (iH / iW));
    const posX = Math.round((this.comp.width - targetW) / 2);
    const posY = Math.round((this.comp.height - targetH) / 2);

    const clip = this.comp.addClip({
      trackId: imgTrack ? imgTrack.id : 'v1',
      type: 'image',
      name: file.name,
      file: file,
      src: objectUrl,
      element: img,
      startTime: 0,
      duration: 5,
      x: posX,
      y: posY,
      width: targetW,
      height: targetH,
      opacity: 1
    });

    if (this.onMediaUrlRegistered) this.onMediaUrlRegistered(clip.id, objectUrl);
    showToast(`Added Image: ${file.name}`, 'success');
    this.imageInput.value = '';
    if (this.onCompositionChanged) this.onCompositionChanged();
  }

  async _onAudioSelected(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const val = validateFile(file, 'audio');
    if (!val.valid) {
      showToast(val.error, 'error');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio(objectUrl);

    await new Promise((resolve) => {
      audio.onloadedmetadata = () => resolve();
    });

    const dur = Math.round(audio.duration || 10);

    let audioTrack = this.comp.tracks.find(t => t.type === 'audio');
    if (!audioTrack) {
      audioTrack = this.comp.addAudioTrack();
    }

    const clip = this.comp.addClip({
      trackId: audioTrack.id,
      type: 'audio',
      name: file.name,
      file: file,
      src: objectUrl,
      element: audio,
      startTime: 0,
      duration: dur,
      volume: 1
    });

    if (this.onMediaUrlRegistered) this.onMediaUrlRegistered(clip.id, objectUrl);
    showToast(`Added Audio: ${file.name}`, 'success');
    this.audioInput.value = '';
    if (this.onCompositionChanged) this.onCompositionChanged();
  }
}
