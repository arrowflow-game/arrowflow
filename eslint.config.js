// Deliberately narrow: this is a ReferenceError tripwire, not a style linter.
//
// This codebase has now shipped three separate crashes caused by referencing an
// identifier that does not exist - a leftover variable name in the Store screen,
// a sibling of it that froze the fail modal, and `stars` in game.js's onWin(),
// which broke finishing ANY level in ANY mode for a full release. All three were
// invisible to `node --check` (the syntax is perfectly valid), survived a manual
// audit, and only surfaced by someone playing the game and noticing nothing
// happened. Two of the three threw from inside a setTimeout or an event handler,
// where the exception never reaches the code that was waiting on it.
//
// So: no-undef and no-unused-vars only. Everything else stays off on purpose -
// a lint run that reports style opinions gets ignored, and an ignored lint run
// catches nothing.
//
// There are no modules here: every js/*.js file is an IIFE assigned to a global
// (const Game = (() => {...})()), and they reference each other through those
// globals, so each file's own top-level consts have to be declared as globals
// for the others to pass no-undef.
const projectGlobals = [
  'Storage', 'I18N', 'Analytics', 'Ads', 'Iap', 'Rating', 'AppUpdate',
  'Leaderboard', 'CloudSave', 'Notifications', 'Share', 'RemoteConfig',
  'Sound', 'Haptics', 'LEVELS', 'DAILY_LEVELS', 'Remix', 'Polycube',
  'Skins', 'Scene3D', 'Game', 'UI', 'Tutorial', 'THREE',
  // Declared by the two ignored data files above (they define both the data
  // array and its accessor), so they have to be listed by hand here.
  'getLevel', 'getDailyLevel'
];

module.exports = [
  {
    // Generated level data, not hand-written code - js/levels.js alone is 33MB of
    // literals (tools/generate_level.py writes it) and parsing it exhausts ESLint's
    // heap. Nothing here can reference an undefined variable: they are pure data.
    ignores: ['js/levels.js', 'js/daily-levels.js']
  },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...Object.fromEntries(projectGlobals.map(g => [g, 'writable'])),
        // Browser + Capacitor surface these files legitimately use.
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        location: 'readonly', localStorage: 'readonly', console: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        fetch: 'readonly', alert: 'readonly', confirm: 'readonly',
        Audio: 'readonly', Image: 'readonly', Event: 'readonly',
        AudioContext: 'readonly', webkitAudioContext: 'readonly',
        URLSearchParams: 'readonly', performance: 'readonly',
        getComputedStyle: 'readonly',
        firebase: 'readonly', Capacitor: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      // Catches the other half of the same mistake: a variable that was renamed
      // at its declaration but nowhere else leaves the old name unused here and
      // undefined there.
      // Each file's own module const looks unused to ESLint (nothing in the same
      // file reads it - the OTHER files do, through the global). Exempt exactly
      // those names so the genuine signal (a variable renamed at its declaration
      // and left dangling at its use, which is how `stars` happened) isn't buried
      // under two dozen false positives nobody reads.
      'no-unused-vars': ['warn', {
        args: 'none',
        varsIgnorePattern: `^(_|${projectGlobals.join('|')})$`
      }]
    }
  },
  {
    files: ['functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly', module: 'writable', exports: 'writable',
        process: 'readonly', console: 'readonly', fetch: 'readonly',
        __dirname: 'readonly'
      }
    },
    rules: { 'no-undef': 'error', 'no-unused-vars': 'warn' }
  }
];
