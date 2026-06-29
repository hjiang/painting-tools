// tests/settings.test.js
// Run with: node tests/settings.test.js
//
// Tests the Settings helper — typed, error-safe wrappers around
// localStorage used by the tool UI modules to persist control values.

// ---- tiny test runner (zero deps) ----
var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg); }
}

function assertEq(actual, expected, msg) {
  if (actual === expected) { passed++; }
  else { failed++; console.error('  FAIL: ' + msg + ' — expected ' + expected + ', got ' + actual); }
}

// ---- in-memory localStorage stub ----
function makeStorage() {
  var store = {};
  return {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    _store: store
  };
}

globalThis.localStorage = makeStorage();

var Settings = require('../settings.js').Settings;

// ---- getNumber ----
assertEq(Settings.getNumber('missing', 1.0), 1.0, 'getNumber missing → fallback');
localStorage.setItem('n', '1.5');
assertEq(Settings.getNumber('n', 9), 1.5, 'getNumber parses float');
localStorage.setItem('bad', 'abc');
assertEq(Settings.getNumber('bad', 7), 7, 'getNumber non-numeric → fallback');
localStorage.setItem('zero', '0');
assertEq(Settings.getNumber('zero', 5), 0, 'getNumber "0" → 0, not fallback');

// ---- getInt ----
assertEq(Settings.getInt('missing', 100), 100, 'getInt missing → fallback');
localStorage.setItem('i', '100');
assertEq(Settings.getInt('i', 9), 100, 'getInt parses int');
localStorage.setItem('f', '12.9');
assertEq(Settings.getInt('f', 0), 12, 'getInt truncates like parseInt');
localStorage.setItem('bi', 'xyz');
assertEq(Settings.getInt('bi', 3), 3, 'getInt non-numeric → fallback');

// ---- getBool ----
assertEq(Settings.getBool('missing', true), true, 'getBool missing → fallback (true)');
assertEq(Settings.getBool('missing', false), false, 'getBool missing → fallback (false)');
localStorage.setItem('t', 'true');
assertEq(Settings.getBool('t', false), true, 'getBool "true" → true');
localStorage.setItem('fl', 'false');
assertEq(Settings.getBool('fl', true), false, 'getBool "false" → false');
localStorage.setItem('junk', 'banana');
assertEq(Settings.getBool('junk', true), false, 'getBool non-"true" → false');

// ---- set roundtrips + String coercion ----
Settings.set('rt', 42);
assertEq(localStorage._store['rt'], '42', 'set coerces to String');
assertEq(Settings.getInt('rt', 0), 42, 'set→getInt roundtrip');
Settings.set('rb', true);
assertEq(Settings.getBool('rb', false), true, 'set→getBool roundtrip');

// ---- error safety: throwing storage must not propagate ----
var thrower = {
  getItem: function () { throw new Error('blocked'); },
  setItem: function () { throw new Error('blocked'); }
};
globalThis.localStorage = thrower;
assertEq(Settings.getNumber('x', 4), 4, 'getNumber swallows getItem throw → fallback');
assertEq(Settings.getInt('x', 5), 5, 'getInt swallows getItem throw → fallback');
assertEq(Settings.getBool('x', true), true, 'getBool swallows getItem throw → fallback');
var threw = false;
try { Settings.set('x', 1); } catch (e) { threw = true; }
assert(!threw, 'set swallows setItem throw (no exception)');

// ---- report ----
console.log('\nsettings.test.js: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
