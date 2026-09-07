# Raw mascot artwork

Drop the source art for future **art skins** in this folder, then run:

```bash
npm run skins:build            # convert everything new
npm run skins:build -- --force # also overwrite PNGs that already exist
```

Each image becomes `icons/mascots/<filename>.png` with its background made
transparent, which is the file the game loads.

The raw art itself is **not committed** (see `.gitignore`) — it is large, and
only the converted PNG is what ships. Keep the originals wherever you keep the
rest of your source files.

## JPG is fine here — and only here

The game draws a mascot **on top of** the cube face's own colour, so the file it
loads must have real transparency. JPEG has no alpha channel at all, so a JPG
dropped straight into `icons/mascots/` renders as an opaque rectangle stamped
across the cube. That is exactly what this folder and the build step exist to
prevent: JPG in, transparent PNG out.

## What the art has to look like

The conversion floods inward from the edge of the image, erasing anything that
matches the background colour and is *reachable* from the border. That one
sentence is where every requirement below comes from:

| Requirement | Why |
|---|---|
| One **flat** background colour — no gradients, soft shadows or photo backdrops | The fill allows only 32/255 of drift per channel before it stops |
| Leave a **clear margin on all four sides** | The fill starts at the border; a subject touching it blocks the fill and leaves a hard cut edge in game |
| Give the character a **bold dark outline** | The outline is the wall that stops the fill from crossing into the character's own light areas |
| Background colour must differ from the character's **outer** colours | A white background against a white-furred animal erases the animal |
| Around **1024px** wide | The six shipped mascots are 1024px; this is drawn onto a face texture at full size |
| Filename: lowercase letters, digits and `-`, e.g. `fox.jpg` | It becomes `mascotIcon: 'fox'` in `js/skins.js` and is concatenated into a URL |

`npm run skins:build` checks the result of every conversion and names the
problem in these same terms rather than writing a broken PNG quietly — a
background removal that goes wrong throws no error, it just produces a solid
rectangle or a character with holes, and neither shows up until it is on a cube.

## Turning a converted PNG into a real skin

The PNG alone does nothing. A skin is an entry in [`js/skins.js`](../js/skins.js):

```js
{ id: 'gemfox', unlock: { type: 'gems', value: 1500 },
  altUnlock2: { type: 'iap', productId: 'skin_gemfox' },
  mascotIcon: 'fox',
  name: { th: 'จิ้งจอกอัญมณี', en: 'Gem Fox' },
  colors: { face: { light: '#…', dark: '#…' }, path: { light: '#…', dark: '#…' } },
  material: 'flat', arrowShape: 'diamond', particleTheme: 'sparks' }
```

Copy the shape from `streakbunny`, `gemcat` or `royalebear`. Note that mascot
skins deliberately use `material: 'flat'` rather than a busy pattern — the
artwork is the hook, and a second visual gimmick behind it just fights with it.

Anything with an `iap` unlock also needs the matching product created and
activated in Play Console before it can be bought.

## Most skins need no art at all

Only 6 of the 37 skins use a picture. The rest are pure data — colours,
`material`, `arrowShape`, `particleTheme`, `lineStyle` — so a new colour skin is
one entry in `js/skins.js` and no files here.

---

# There are two kinds of art skin, and they are built very differently

## 1. Mascot skins — a picture, converted by the tool above
`streakbunny`, `gemcat`, `royalebear` and friends. A character drawn once and
stamped onto the cube face. This is what `npm run skins:build` is for.

## 2. Material skins — **code, not a picture**
`marble`, `glass`, `neon`, `metal`, `holo`, `badge`. These are drawn
procedurally by `drawMaterialPattern()` in [`js/scene.js`](../js/scene.js) onto
each face's own canvas, seeded off the face key so the pattern is stable across
redraws but different per face.

A cube-surface look — wood grain, ice, sandstone, a galaxy — belongs in this
second group, and **cannot be shipped as an image file.** Three reasons, all of
them things this project has already been bitten by:

- A face canvas is `unitGrid × 32px`, and `unitGrid` changes level to level.
  There is no single texture size to author against.
- Marking a face dirty repaints its whole canvas and re-uploads a GPU texture
  on the next frame. Blitting a decoded bitmap per face is strictly more work
  than the seeded canvas drawing that happens now.
- Texture memory is already the binding constraint on a 2GB phone (240–275MB
  of the app's footprint is WebView/texture memory). Per-face image textures
  would push straight into that.

So a new material is a new branch in `drawMaterialPattern()` plus a `material:`
value on the skin entry — no asset, no download, and it scales to any face size
for free.

## `reference/` — concept art, not assets

`skins-src/reference/` holds mockups used to agree on a *look* before it is
written as code. They are renders of a whole cube (some with a mocked-up HUD),
not tileable face textures, so nothing here is loaded by the game.

Current reference set (6 material concepts): **galaxy / nebula, grass, sandstone,
wood, ice crystal, brushed metal.**
