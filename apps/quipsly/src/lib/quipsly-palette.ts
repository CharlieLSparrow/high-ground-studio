/**
 * Stable hex values for places where a color becomes data (timeline clips,
 * source stories, and non-DOM renderers). UI-only styling should prefer the
 * matching CSS material variables from globals.css.
 */
export const QUIPSLY_TIMELINE_COLORS = Object.freeze({
  audio: "#3a572d",
  video: "#1e544f",
  importedAudio: "#805b22",
  importedVideo: "#6b536b",
  watchedAudio: "#593b52",
  watchedVideo: "#285762",
  marker: "#68481f",
});
