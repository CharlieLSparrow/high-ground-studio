/**
 * Stable hex values for places where a color becomes data (timeline clips,
 * source stories, and non-DOM renderers). UI-only styling should prefer the
 * matching CSS material variables from globals.css.
 */
export const QUIPSLY_TIMELINE_COLORS = Object.freeze({
  audio: "#495734",
  video: "#354b3b",
  importedAudio: "#7a6132",
  importedVideo: "#704b52",
  watchedAudio: "#5b3d43",
  watchedVideo: "#354c48",
  marker: "#604c2b",
});
