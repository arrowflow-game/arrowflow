// Copies the static game source into www/, which Capacitor bundles into the
// native app. Kept separate from the repo root so GitHub Pages (which serves
// the root directly) and the Capacitor build (which needs a clean webDir
// without dev-only files like tools/, test/, ex*.mp4) can coexist untouched.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const www = path.join(root, 'www');

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });

const files = ['index.html', 'manifest.json'];
const dirs = ['css', 'js', 'icons', 'audio'];

for (const f of files) {
  fs.copyFileSync(path.join(root, f), path.join(www, f));
}
for (const d of dirs) {
  const src = path.join(root, d);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(www, d), { recursive: true });
  }
}

console.log(`Copied ${files.length} files and ${dirs.length} directories into www/`);
