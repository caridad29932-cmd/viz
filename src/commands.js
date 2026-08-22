/**
 * Reusable command factory for composition mutations.
 * Used by the centralized history system.
 */

export function createAddClipCommand(composition, clipData) {
  let clipId = null;
  return {
    name: 'add clip',
    do() {
      const clip = composition.addClip(clipData, { skipHistory: true });
      clipId = clip.id;
      return clip;
    },
    undo() {
      if (clipId) composition.removeClip(clipId, { skipHistory: true });
    },
    redo() {
      const clip = composition.addClip(clipData, { skipHistory: true });
      clipId = clip.id;
      return clip;
    }
  };
}

export function createRemoveClipCommand(composition, clipId) {
  let removedClip = null;
  let wasSelected = false;
  return {
    name: 'delete clip',
    do() {
      wasSelected = composition.selectedClipId === clipId;
      removedClip = composition.getClip(clipId);
      composition.removeClip(clipId, { skipHistory: true });
    },
    undo() {
      if (removedClip) {
        composition.addClip(removedClip, { skipHistory: true });
        if (wasSelected) composition.selectedClipId = clipId;
      }
    },
    redo() {
      composition.removeClip(clipId, { skipHistory: true });
    }
  };
}

export function createMoveClipCommand(composition, clipId, newTrackId, newStartTime) {
  let oldTrackId = null;
  let oldStartTime = 0;
  return {
    name: 'move clip',
    do() {
      const clip = composition.getClip(clipId);
      if (!clip) return;
      oldTrackId = clip.trackId;
      oldStartTime = clip.startTime;
      clip.trackId = newTrackId;
      clip.startTime = newStartTime;
    },
    undo() {
      const clip = composition.getClip(clipId);
      if (!clip || oldTrackId === null) return;
      clip.trackId = oldTrackId;
      clip.startTime = oldStartTime;
    },
    redo() {
      const clip = composition.getClip(clipId);
      if (!clip) return;
      clip.trackId = newTrackId;
      clip.startTime = newStartTime;
    }
  };
}

export function createTrimClipCommand(composition, clipId, newStart, newDuration, newTrimStart, newTrimEnd) {
  let oldStart, oldDuration, oldTrimStart, oldTrimEnd;
  return {
    name: 'trim clip',
    do() {
      const clip = composition.getClip(clipId);
      if (!clip) return;
      oldStart = clip.startTime;
      oldDuration = clip.duration;
      oldTrimStart = clip.trimStart;
      oldTrimEnd = clip.trimEnd;
      clip.startTime = newStart;
      clip.duration = newDuration;
      clip.trimStart = newTrimStart;
      clip.trimEnd = newTrimEnd;
    },
    undo() {
      const clip = composition.getClip(clipId);
      if (!clip || oldStart === undefined) return;
      clip.startTime = oldStart;
      clip.duration = oldDuration;
      clip.trimStart = oldTrimStart;
      clip.trimEnd = oldTrimEnd;
    },
    redo() {
      const clip = composition.getClip(clipId);
      if (!clip) return;
      clip.startTime = newStart;
      clip.duration = newDuration;
      clip.trimStart = newTrimStart;
      clip.trimEnd = newTrimEnd;
    }
  };
}

export function createUpdateClipCommand(composition, clipId, changes) {
  let oldValues = {};
  return {
    name: 'update clip properties',
    do() {
      const clip = composition.getClip(clipId);
      if (!clip) return;
      oldValues = {};
      for (const key of Object.keys(changes)) {
        oldValues[key] = clip[key];
        clip[key] = changes[key];
      }
    },
    undo() {
      const clip = composition.getClip(clipId);
      if (!clip) return;
      for (const [key, value] of Object.entries(oldValues)) {
        clip[key] = value;
      }
    },
    redo() {
      const clip = composition.getClip(clipId);
      if (!clip) return;
      for (const key of Object.keys(changes)) {
        clip[key] = changes[key];
      }
    }
  };
}

export function createSetDimensionsCommand(composition, width, height) {
  let oldWidth, oldHeight;
  return {
    name: 'set dimensions',
    do() {
      oldWidth = composition.width;
      oldHeight = composition.height;
      composition.width = width;
      composition.height = height;
    },
    undo() {
      composition.width = oldWidth;
      composition.height = oldHeight;
    },
    redo() {
      composition.width = width;
      composition.height = height;
    }
  };
}
