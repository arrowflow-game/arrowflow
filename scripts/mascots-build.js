// Batch-converts the raw mascot artwork in skins-src/ into the transparent
// PNGs the game actually loads (icons/mascots/<name>.png, referenced by a
// skin's `mascotIcon` field in js/skins.js).
//
// WHY THIS EXISTS AS A BATCH TOOL
// scripts/mascot-bg-remove.js does the actual background removal and is the
// interesting half; this is the boring half that runs it over a folder and,
// more importantly, JUDGES THE RESULT. A background removal that goes wrong
// does not throw - it silently produces a PNG that is either a solid
// rectangle (nothing erased) or a character with holes chewed through it
// (too much erased), and either one only becomes obvious once it is drawn on
// a cube face in game. Each output is therefore checked here and the failure
// is named in the terminal, in the same terms as the art requirements.
//
// Usage:  npm run skins:build            (converts every image in skins-src/)
//         npm run skins:build -- --force (overwrites existing PNGs)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { run } = require('./mascot-bg-remove.js');

const SRC = path.join(__dirname, '..', 'skins-src');
const OUT = path.join(__dirname, '..', 'icons', 'mascots');
const force = process.argv.includes('--force');

// A name becomes `mascotIcon: '<name>'` in js/skins.js and is concatenated
// straight into a URL by scene.js, so keep it to characters that need no
// escaping and read the same on a case-sensitive filesystem (CI is Linux).
const NAME_RE = /^[a-z][a-z0-9-]{1,23}$/;

// Thresholds are about telling the two failure modes apart, not precision.
// The six shipped mascots erase between 30% and 70% of their canvas.
const TOO_LITTLE = 0.12;  // background essentially untouched
const TOO_MUCH   = 0.92;  // the character itself got eaten

function pct(n) { return (n * 100).toFixed(1) + '%'; }

// Did the subject run into the edge of the canvas? The flood fill starts from
// the border, so a subject touching it both blocks the fill and leaves an
// obvious hard edge in game. Sampled rather than exhaustive - a subject that
// touches the border touches many pixels of it.
async function borderCoverage(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let opaque = 0, seen = 0;
  const at = (x, y) => data[(y * width + x) * channels + 3];
  for (let x = 0; x < width; x += 2) { seen += 2; if (at(x, 0) > 8) opaque++; if (at(x, height - 1) > 8) opaque++; }
  for (let y = 0; y < height; y += 2) { seen += 2; if (at(0, y) > 8) opaque++; if (at(width - 1, y) > 8) opaque++; }
  return opaque / seen;
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`No skins-src/ folder. Create it and drop the artwork in - see skins-src/README.md`);
    process.exit(1);
  }
  const files = fs.readdirSync(SRC).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
  if (!files.length) {
    console.log('skins-src/ has no images yet - nothing to do.');
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });

  let ok = 0, failed = 0, skipped = 0;
  for (const file of files.sort()) {
    const name = path.basename(file, path.extname(file)).toLowerCase();
    const dest = path.join(OUT, name + '.png');
    const problems = [];

    if (!NAME_RE.test(name)) {
      console.log(`!! ${file}\n     name "${name}" cannot be used - lowercase letters, digits and '-' only, starting with a letter, 2-24 chars.`);
      failed++; continue;
    }
    if (fs.existsSync(dest) && !force) {
      console.log(`-- ${file} -> icons/mascots/${name}.png already exists (pass --force to overwrite)`);
      skipped++; continue;
    }

    let stats;
    try {
      stats = await run(path.join(SRC, file), dest, [], true);
    } catch (e) {
      console.log(`!! ${file}\n     conversion failed: ${e.message}`);
      failed++; continue;
    }

    const erasedFrac = stats.erased / stats.total;
    if (erasedFrac < TOO_LITTLE) {
      problems.push(`only ${pct(erasedFrac)} of the image was erased - the background is probably not one flat colour (gradients, soft shadows and photo backdrops all defeat the fill), or the subject touches the edge`);
    } else if (erasedFrac > TOO_MUCH) {
      problems.push(`${pct(erasedFrac)} of the image was erased - the background colour is too close to the subject's own, or the subject has no dark outline to stop the fill`);
    }
    if (stats.bgColors.length > 4) {
      problems.push(`${stats.bgColors.length} distinct background colours found along the border - use one flat colour`);
    }
    if (stats.width < 512) {
      problems.push(`only ${stats.width}px wide - the shipped mascots are 1024px, and this is drawn onto a cube face at full size`);
    }
    const edge = await borderCoverage(dest);
    if (edge > 0.02) {
      problems.push(`${pct(edge)} of the output's border is still opaque - the subject runs into the edge of the canvas; leave a clear margin all the way around`);
    }

    if (problems.length) {
      console.log(`!! ${file} -> icons/mascots/${name}.png  (written, but check it)`);
      problems.forEach(p => console.log(`     - ${p}`));
      failed++;
    } else {
      console.log(`OK ${file} -> icons/mascots/${name}.png  ${stats.width}x${stats.height}, erased ${pct(erasedFrac)}`);
      ok++;
    }
  }

  console.log(`\n${ok} ok, ${failed} to check, ${skipped} skipped.`);
  if (ok) {
    console.log(`\nNext: add a skin entry in js/skins.js with mascotIcon: '<name>' - see the`);
    console.log(`streakbunny/gemcat/royalebear entries for the shape, and skins-src/README.md`);
    console.log(`for what else an art skin needs (unlock rule, Thai + English name, IAP product).`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
