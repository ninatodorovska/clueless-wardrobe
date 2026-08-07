/* ═══════════════════════════════════════════════════════
   UTIL — tiny helpers. Classic script, global namespace,
   so the whole thing runs straight off file:// too.
   ═══════════════════════════════════════════════════════ */
var U = (function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k === 'style') n.setAttribute('style', attrs[k]);
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function on(node, evt, fn, opts) { node.addEventListener(evt, fn, opts); return fn; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  /* deterministic PRNG so the leopard print is the same every launch */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /* ── color ───────────────────────────────────────────── */

  function rgbCss(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; }

  /* perceptually-weighted RGB distance (Thiadmer Riemersma's low-cost approx),
     normalized to roughly 0..100 so slider values read like percentages */
  var DIST_MAX = Math.sqrt(3 * 255 * 255 + 255 * 255 * 2); /* ~ upper bound */
  function colorDist(r1, g1, b1, r2, g2, b2) {
    var rm = (r1 + r2) * 0.5;
    var dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
    var d = Math.sqrt(
      (2 + rm / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - rm) / 256) * db * db
    );
    return (d / DIST_MAX) * 100;
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    var d = max - min;
    if (d > 1e-6) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = ((b - r) / d + 2);
      else                h = ((r - g) / d + 4);
      h *= 60;
    }
    return [h, s, l];
  }

  /* rough human name for a color — used for tagging and search */
  var HUES = [
    [15,  'RED'], [45,  'ORANGE'], [70,  'YELLOW'], [160, 'GREEN'],
    [200, 'TEAL'], [250, 'BLUE'], [290, 'PURPLE'], [335, 'PINK'], [360, 'RED']
  ];
  function colorName(rgb) {
    var h = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    var hue = h[0], s = h[1], l = h[2];
    if (l < 0.13) return 'BLACK';
    if (l > 0.92 && s < 0.14) return 'WHITE';
    if (s < 0.12) return l > 0.6 ? 'SILVER' : 'GREY';
    if (s < 0.30 && l < 0.52 && hue > 10 && hue < 55) return 'BROWN';
    if (hue > 18 && hue < 48 && l < 0.45) return 'BROWN';
    if (hue > 25 && hue < 55 && s < 0.55 && l > 0.7) return 'CREAM';
    for (var i = 0; i < HUES.length; i++) if (hue <= HUES[i][0]) return HUES[i][1];
    return 'RED';
  }

  /* ── images ──────────────────────────────────────────── */

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('Could not read that image.')); };
      img.src = src;
    });
  }

  function fileToImage(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { loadImage(fr.result).then(res, rej); };
      fr.onerror = function () { rej(new Error('Could not read that file.')); };
      fr.readAsDataURL(file);          /* data: URL keeps the canvas untainted on file:// */
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (res, rej) {
      if (canvas.toBlob) {
        canvas.toBlob(function (b) { b ? res(b) : rej(new Error('Encode failed.')); }, type || 'image/png', quality);
      } else {
        try {
          var parts = canvas.toDataURL(type || 'image/png', quality).split(',');
          var bin = atob(parts[1]);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          res(new Blob([arr], { type: type || 'image/png' }));
        } catch (e) { rej(e); }
      }
    });
  }

  /* Encode a finished cutout for storage. WebP keeps the alpha
     channel at roughly a sixth of PNG's size, which matters when
     a closet is a few hundred garments sitting in IndexedDB. */
  var webpOK = null;
  function supportsWebP() {
    if (webpOK === null) {
      var c = document.createElement('canvas');
      c.width = c.height = 1;
      webpOK = c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    }
    return webpOK;
  }

  function encodeCutout(canvas, maxEdge) {
    maxEdge = maxEdge || 900;
    var out = canvas;
    var longest = Math.max(canvas.width, canvas.height);
    if (longest > maxEdge) {
      var s = maxEdge / longest;
      out = document.createElement('canvas');
      out.width  = Math.max(1, Math.round(canvas.width * s));
      out.height = Math.max(1, Math.round(canvas.height * s));
      var x = out.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(canvas, 0, 0, out.width, out.height);
    }
    return supportsWebP()
      ? canvasToBlob(out, 'image/webp', 0.92)
      : canvasToBlob(out, 'image/png');
  }

  /* draw an image into a canvas, capped to `max` on the long edge */
  function fitCanvas(img, max) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var scale = Math.min(1, max / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width  = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  /* ── object URL bookkeeping (revoke so blobs don't leak) ──
     get-or-create: the same item is often on screen in two
     places at once, so re-minting the URL would break whichever
     <img> got there first. Callers invalidate with dropURL(). */
  var urls = Object.create(null);
  function blobURL(key, blob) {
    if (!urls[key]) urls[key] = URL.createObjectURL(blob);
    return urls[key];
  }
  function dropURL(key) {
    if (urls[key]) { URL.revokeObjectURL(urls[key]); delete urls[key]; }
  }

  /* ── toasts ──────────────────────────────────────────── */
  function toast(msg, bad, ms) {
    var host = $('#toaster');
    if (!host) return;
    var t = el('div', { class: 'toast' + (bad ? ' toast--bad' : ''), text: msg });
    host.appendChild(t);
    setTimeout(function () {
      t.classList.add('is-out');
      setTimeout(function () { t.remove(); }, 320);
    }, ms || 2200);
  }

  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  return {
    $: $, $$: $$, el: el, on: on, clamp: clamp, uid: uid, debounce: debounce,
    mulberry32: mulberry32, rgbCss: rgbCss, colorDist: colorDist,
    rgbToHsl: rgbToHsl, colorName: colorName,
    loadImage: loadImage, fileToImage: fileToImage, canvasToBlob: canvasToBlob,
    encodeCutout: encodeCutout, supportsWebP: supportsWebP,
    fitCanvas: fitCanvas, blobURL: blobURL, dropURL: dropURL,
    toast: toast, pick: pick
  };
})();
