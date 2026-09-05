/**
 * Stable hex values for places where a color becomes data (timeline clips,
 * source stories, and non-DOM renderers). UI-only styling should prefer the
 * matching CSS material variables from globals.css.
 */
export const QUIPSLY_TIMELINE_COLORS = Object.freeze({
  audio: "#455233",
  video: "#2d5356",
  importedAudio: "#895d28",
  importedVideo: "#6e4f59",
  watchedAudio: "#86636b",
  watchedVideo: "#6e4f59",
  marker: "#6e4724",
});
