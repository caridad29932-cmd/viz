/**
 * Timeline snapping utilities.
 * Provides intelligent snapping to clip edges, playhead, timeline start, and markers.
 */

const SNAP_THRESHOLD_PX = 12;

export function findSnapOffset(
  targetTime,
  targetDuration,
  clips,
  excludeClipId,
  currentTime,
  zoomPxPerSec,
  options = {}
) {
  const thresholdSec = SNAP_THRESHOLD_PX / zoomPxPerSec;
  const candidates = [];

  // Timeline start
  candidates.push({ time: 0, label: 'start' });

  // Current playhead
  if (options.snapToPlayhead !== false) {
    candidates.push({ time: currentTime, label: 'playhead' });
  }

  // Clip edges
  for (const clip of clips) {
    if (clip.id === excludeClipId) continue;
    const end = clip.startTime + clip.duration;
    candidates.push({ time: clip.startTime, label: 'clip-start', clipId: clip.id });
    candidates.push({ time: end, label: 'clip-end', clipId: clip.id });
  }

  // Markers
  if (options.markers) {
    for (const marker of options.markers) {
      candidates.push({ time: marker.time, label: 'marker', markerId: marker.id });
    }
  }

  let bestDelta = Infinity;
  let bestSnap = null;

  const testEdges = [targetTime, targetTime + targetDuration];

  for (const edge of testEdges) {
    for (const cand of candidates) {
      const delta = cand.time - edge;
      if (Math.abs(delta) <= thresholdSec && Math.abs(delta) < Math.abs(bestDelta)) {
        bestDelta = delta;
        bestSnap = { ...cand, edge };
      }
    }
  }

  if (!bestSnap) return null;

  // Apply delta to the edge that matched
  const newStart = bestSnap.edge === targetTime
    ? targetTime + bestDelta
    : targetTime + bestDelta;

  return {
    delta: bestDelta,
    newStart: Math.max(0, newStart),
    target: bestSnap
  };
}

export function quantizeTime(time, fps = 30) {
  return Math.round(time * fps) / fps;
}
