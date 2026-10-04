/** Playback changes cadence without trimming a pose or skipping a Spine cue. */
export const CURTAIN_MOTION_RATE = 1;
export const CURTAIN_SOURCE_DURATION_MS = 3300;
export const reelCurtainTimeScale = (timeScale = 1) => timeScale * CURTAIN_MOTION_RATE;
export const reelCurtainDurationMs = (timeScale = 1) => CURTAIN_SOURCE_DURATION_MS / reelCurtainTimeScale(timeScale);
