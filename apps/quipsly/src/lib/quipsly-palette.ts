/**
 * Stable hex values for places where a color becomes data (timeline clips,
 * source stories, and non-DOM renderers). UI-only styling should prefer the
 * matching CSS material variables from globals.css.
 */
export const QUIPSLY_TIMELINE_COLORS = Object.freeze({
  audio: "#495338",
  video: "#354e45",
  importedAudio: "#786139",
  importedVideo: "#604c44",
  watchedAudio: "#765f54",
  watchedVideo: "#604c44",
  marker: "#614d32",
});
