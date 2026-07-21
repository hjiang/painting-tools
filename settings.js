// settings.js
// Typed, error-safe wrappers around localStorage for the tool UI modules.
//
// Every tool persists a few control values (slider positions, checkbox
// states) so they survive reloads. Each read must tolerate three failure
// modes without disrupting the UI: the key is absent (first run), the
// stored text is unparseable (corrupted/older format), or localStorage is
// unavailable (private browsing, quota, disabled). In all three cases the
// caller's fallback is returned.

var Settings = {
  getString: function (key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw !== null) return raw;
    } catch (e) { /* storage unavailable */ }
    return fallback;
  },

  getNumber: function (key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw !== null) {
        var v = parseFloat(raw);
        if (!isNaN(v)) return v;
      }
    } catch (e) { /* storage unavailable */ }
    return fallback;
  },

  getInt: function (key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw !== null) {
        var v = parseInt(raw, 10);
        if (!isNaN(v)) return v;
      }
    } catch (e) { /* storage unavailable */ }
    return fallback;
  },

  getBool: function (key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw !== null) return raw === 'true';
    } catch (e) { /* storage unavailable */ }
    return fallback;
  },

  set: function (key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (e) { /* storage unavailable — keep in memory only */ }
  }
};

// ── Exports ───────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Settings: Settings };
}
