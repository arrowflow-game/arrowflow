// One-off tool: strips the flat background from Gemini-generated mascot icon
// JPGs, producing transparent PNGs usable in game.js face textures. The
// source files are inconsistent - some have a plain white background, some
// have a Photoshop-style dark-gray checkerboard (Gemini's own "this is
// transparent" preview convention, baked into real pixels once exported as
// JPG since JPG has no alpha at all) - so instead of hardcoding one expected
// background color, this samples the actual border pixels of each image and
// clusters them into a handful of reference colors, then flood-fills outward
// from the border matching any of those colors.
//
// Naive "delete every matching-color pixel anywhere in the image" would also
// eat the character's own same-colored regions (e.g. a white-faced panda, or
// gray fur near a gray checker tone). Instead this is a border-flood-fill:
// only pixels REACHABLE from the image edge via a connected path of
// background-like pixels get erased. A fully-enclosed patch of the same
// color deep inside the character's black outline is never touched, because
// the flood fill can't cross the dark outline to reach it.
//
// Usage: node scripts/mascot-bg-remove.js <input.jpg> <output.png>
const sharp = require('sharp');
const path = require('path');

// Both bumped up from an initial pass that left stray unerased speckles near
// the edges - JPEG compression of a checkerboard pattern introduces enough
// per-pixel color drift (block artifacts) to break flood-fill connectivity
// at the original tighter tolerances.
const COLOR_TOLERANCE = 32; // per-channel distance to count as "matches a reference bg color"
const CLUSTER_TOLERANCE = 32; // grouping distance when clustering border samples themselves

function clusterBorderColors(data, width, height, channels) {
  const samples = [];
  const sample = (x, y) => { const i = (y * width + x) * channels; samples.push([data[i], data[i + 1], data[i + 2]]); };
  for (let x = 0; x < width; x += 4) { sample(x, 0); sample(x, height - 1); }
  for (let y = 0; y < height; y += 4) { sample(0, y); sample(width - 1, y); }

  const clusters = []; // { color: [r,g,b], count }
  for (const s of samples) {
    let found = clusters.find(c => Math.abs(c.color[0] - s[0]) < CLUSTER_TOLERANCE && Math.abs(c.color[1] - s[1]) < CLUSTER_TOLERANCE && Math.abs(c.color[2] - s[2]) < CLUSTER_TOLERANCE);
    if (found) found.count++;
    else clusters.push({ color: s, count: 1 });
  }
  // Keep clusters that make up a meaningful share of the border (ignores a
  // few stray anti-aliased character-edge pixels that happen to touch the
  // very edge of the canvas).
  return clusters.filter(c => c.count >= samples.length * 0.03).map(c => c.color);
}

async function run(inputPath, outputPath, extraSeeds = []) {
  const img = sharp(inputPath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const bgColors = clusterBorderColors(data, width, height, channels);
  // Some source images have a second, disconnected background layer (a white
  // "sticker card" rounded-rect sitting inside the checkerboard, not
  // touching the image edge) that the border flood-fill can't reach on its
  // own. Extra seed points (x,y pairs) let the caller point at one of those
  // regions directly - the pixel's own color there is added to bgColors and
  // used as an additional flood-fill origin.
  for (const [sx, sy] of extraSeeds) {
    const i = (sy * width + sx) * channels;
    bgColors.push([data[i], data[i + 1], data[i + 2]]);
  }
  const isBgLike = (i) => bgColors.some(c =>
    Math.abs(data[i] - c[0]) < COLOR_TOLERANCE &&
    Math.abs(data[i + 1] - c[1]) < COLOR_TOLERANCE &&
    Math.abs(data[i + 2] - c[2]) < COLOR_TOLERANCE
  );

  const visited = new Uint8Array(width * height);
  const stack = [];
  let erased = 0;

  const pushIfBg = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    const i = p * channels;
    if (!isBgLike(i)) return;
    visited[p] = 1;
    stack.push(p);
  };

  for (let x = 0; x < width; x++) { pushIfBg(x, 0); pushIfBg(x, height - 1); }
  for (let y = 0; y < height; y++) { pushIfBg(0, y); pushIfBg(width - 1, y); }
  for (const [sx, sy] of extraSeeds) pushIfBg(sx, sy);

  while (stack.length) {
    const p = stack.pop();
    const x = p % width, y = (p / width) | 0;
    const i = p * channels;
    data[i + 3] = 0; // transparent
    erased++;
    pushIfBg(x + 1, y); pushIfBg(x - 1, y); pushIfBg(x, y + 1); pushIfBg(x, y - 1);
  }

  // No post-blur feather: blurring un-premultiplied RGBA would bleed the
  // opaque background color across the new alpha edge (a visible halo around
  // the character), so this stays a hard cutoff. The character's own bold
  // outline hides normal JPEG-compression jaggies at that edge fine.
  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(outputPath);

  console.log(`${path.basename(inputPath)} -> ${path.basename(outputPath)} (bg colors: ${bgColors.map(c => `[${c}]`).join(' ')}, erased ${erased} of ${width * height} px)`);
}

const [, , inputPath, outputPath, ...seedArgs] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/mascot-bg-remove.js <input.jpg> <output.png> [x,y ...]');
  process.exit(1);
}
const extraSeeds = seedArgs.map(s => s.split(',').map(Number));
run(inputPath, outputPath, extraSeeds).catch(e => { console.error(e); process.exit(1); });
