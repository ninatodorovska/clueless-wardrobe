# Cher's Wardrobe

A closet app in the spirit of the outfit program Cher Horowitz uses in *Clueless* (1995) —
leopard wallpaper, chunky beveled chrome, a `DRESS ME` button, and a verdict lamp that tells
you when it's a major clash.

Upload photos of your clothes, the background gets removed automatically, and you flip
through each rail — top, bottom, shoes, whatever you turn on — to build a look.

**[Try it →](https://ninatodorovska.github.io/clueless-wardrobe/)**

---

## Running it locally

Double-click **`START.bat`**.

That's it. It starts a tiny local web server using PowerShell's built-in `HttpListener`
(nothing to install — no Node, no Python) and opens your browser. Leave the black console
window open while you use the app; press `Ctrl+C` in it when you're done.

> **Why not just double-click `index.html`?**
> You can, and it mostly works — but browsers refuse persistent storage and block the
> cutout model on pages opened straight off disk. Via `START.bat` you get a real
> `http://localhost` origin, which means your closet is remembered between sessions and
> the smart cutout works. Opened directly, the app falls back to the BASIC cutout and
> forgets everything when you close the tab.

If port 8777 is busy it tries 8778–8781 automatically. To force one:

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 9001
```

---

## Using it

| | |
|---|---|
| **BROWSE** | Add clothes. Drag photos in, or hit UPLOAD. |
| **◀ ▶** | Flip through a rail. You can also swipe/drag the garment, or use arrow keys. |
| **DRESS ME** | Builds a whole outfit for you, scored so the colours actually work. |
| **🔒** | Lock a rail so DRESS ME keeps that piece and shuffles the rest. |
| **The tray bar** | Turns extra rails on and off — outerwear, bags, jewelry, scarves, dresses. Shoes is on by default; switch it off here if you don't want it. |
| **FALL FASHIONS** | Click the title plate to filter the whole closet by season. |
| **SAVE LOOK / LOOKBOOK** | Keep outfits and flip back through them later. |

Keyboard: `D` dress me · `S` save look · `B` browse · `L` lookbook · `Esc` close a window.

### Getting good cutouts

Photograph each piece flat — on a bed, the floor, a wall. It doesn't need a clean
background, but a garment that's nearly the same colour as what it's lying on is the one
case nothing can solve automatically. The **MAGIC WAND** window that opens after upload has:

- **SMART / BASIC** — SMART is the neural cutout and is what you want. BASIC is a colour
  flood fill, only useful on genuinely plain backgrounds.
- **CUTOFF** — lower keeps more of the garment, higher trims tighter.
- **ERASE / RESTORE brush** — for anything the model got wrong (hangers, a stray hand).
- **USE ORIGINAL** — gives up on the cutout entirely and stores the photo exactly as shot.
  The escape hatch when a cutout is mangling a piece; the app works fine without it.

---

## How the cutout works

Uploads never leave your machine. Background removal runs **[u2netp][u2net]** — the small
U²-Net — locally in your browser through [onnxruntime-web][ort], compiled to WebAssembly.
Runtime and model are vendored into `vendor/` (~16 MB total), so it works with no internet
connection at all.

About 300 ms to load, then ~0.5–1.5 s per photo.

**Why this model.** RMBG-1.4 was tried first and measured side by side on real garment
photos. Quality came out equivalent, but u2netp was **6–15× faster** (0.5 s vs 3.4–8.8 s),
**10× smaller** (4.6 MB vs 44 MB), kept slightly *more* of each garment, and is Apache-2.0
rather than non-commercial. Full precision RMBG (176 MB) was also tested and proved
indistinguishable from its quantized build, so the extra size bought nothing.

If you want to try RMBG anyway, drop `model_quantized.onnx` from
[huggingface.co/briaai/RMBG-1.4][rmbg] into `vendor/models/rmbg-1.4/` — `js/segment.js`
picks it up automatically. Note it is **CC BY-NC 4.0, non-commercial only**; u2netp is
Apache-2.0, so as shipped this app has no such restriction.

**Threading.** onnxruntime only runs multi-threaded on a cross-origin-isolated page.
`serve.ps1` sends the COOP/COEP headers directly; on GitHub Pages, where you can't set
headers, `coi-serviceworker.js` adds them via a service worker. If either fails the app
still works, just single-threaded.

---

## Layout

```
index.html          markup + the modal windows
START.bat           ← double-click this
serve.ps1           the zero-install local server
coi-serviceworker.js  adds COOP/COEP on GitHub Pages (no-ops locally)
css/
  base.css          palette, type, CRT overlay
  chrome.css        the beveled widget vocabulary (buttons, plates, windows)
  app.css           screen shell, rails, browse, lookbook
js/
  util.js           helpers, colour maths, blob/canvas plumbing
  texture.js        generates the leopard wallpaper procedurally at boot
  db.js             IndexedDB, with an in-memory fallback
  segment.js        u2netp neural cutout  ← the real engine
  cutout.js         colour flood-fill cutout (BASIC fallback)
  match.js          colour extraction + outfit scoring + the verdict lines
  store.js          items, looks, rails, selection, filters
  screens.js        rendering and the magic-wand editor
  app.js            boot, routing, wiring
vendor/             onnxruntime-web + the u2netp model (~16 MB)
```

Everything is plain HTML/CSS/JS with no build step and no dependencies to install — classic
`<script>` tags, no modules, so it degrades gracefully even off `file://`.

Your clothes live in IndexedDB in your browser, under whatever origin you opened the app on.
Cutouts are stored as WebP (about a sixth the size of PNG, alpha intact); the original photo
is kept as a JPEG so **RE-CUT** can run the whole thing again later.

[u2net]: https://github.com/xuebinqin/U-2-Net
[rmbg]: https://huggingface.co/briaai/RMBG-1.4
[ort]: https://onnxruntime.ai/docs/tutorials/web/
