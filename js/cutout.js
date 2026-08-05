/* ═══════════════════════════════════════════════════════
   CUTOUT — automatic background removal, pure canvas.

   Strategy:
     1. sample the border, cluster it into up to 4 background
        colours (a bed, its shadow, a wall, a floor)
     2. flood fill inward from every border pixel, treating a
        pixel as background when it's close to ANY of those
        colours — connectivity is what stops it eating a
        garment that happens to share the wall's colour
     3. a second, tighter pass claims enclosed background
        pockets (the gap between an arm and the torso)
     4. despeckle, erode a hair, feather the alpha, auto-crop

   Runs in ~100ms on a 1400px photo. No model, no network.
   ═══════════════════════════════════════════════════════ */
var Cutout = (function () {
  'use strict';

  var MAX_EDGE = 1400;      /* photos are downscaled to this before anything */
  var PAD = 8;              /* breathing room around the auto-crop */

  /* ── 0. denoise the copy we make decisions from ────────
     Camera noise is the enemy here. When a garment sits close
     to the background in colour, a few noisy pixels form a
     connected chain the flood fill can percolate through, and
     a whole sleeve dissolves. A 3x3 average kills that without
     touching the pixels we actually output. */
  function smooth(data, w, h) {
    var out = new Uint8ClampedArray(data.length);
    var x, y, ch, i;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = (y * w + x) * 4;
        for (ch = 0; ch < 3; ch++) {
          var sum = 0, n = 0;
          for (var dy = -1; dy <= 1; dy++) {
            var yy = y + dy;
            if (yy < 0 || yy >= h) continue;
            for (var dx = -1; dx <= 1; dx++) {
              var xx = x + dx;
              if (xx < 0 || xx >= w) continue;
              sum += data[(yy * w + xx) * 4 + ch];
              n++;
            }
          }
          out[i + ch] = sum / n;
        }
        out[i + 3] = 255;
      }
    }
    return out;
  }

  /* ── 1. what colour is the background? ─────────────────
     Walk the border, then greedily pick up to K colours that
     are far enough apart to be genuinely different surfaces. */
  function sampleBackground(data, w, h, K) {
    var samples = [];
    var stepX = Math.max(1, (w / 120) | 0);
    var stepY = Math.max(1, (h / 120) | 0);
    var band = Math.max(2, Math.round(Math.min(w, h) * 0.012));
    var x, y, i;

    function push(x, y) {
      i = (y * w + x) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
    for (x = 0; x < w; x += stepX) {
      for (y = 0; y < band; y++) { push(x, y); push(x, h - 1 - y); }
    }
    for (y = 0; y < h; y += stepY) {
      for (x = 0; x < band; x++) { push(x, y); push(w - 1 - x, y); }
    }

    /* greedy far-apart seeds */
    var seeds = [];
    var MIN_SEP = 14;
    for (i = 0; i < samples.length; i++) {
      var s = samples[i], fresh = true;
      for (var j = 0; j < seeds.length; j++) {
        if (U.colorDist(s[0], s[1], s[2], seeds[j][0], seeds[j][1], seeds[j][2]) < MIN_SEP) {
          fresh = false; break;
        }
      }
      if (fresh) { seeds.push([s[0], s[1], s[2]]); if (seeds.length >= K) break; }
    }
    if (!seeds.length) seeds.push([255, 255, 255]);

    /* one Lloyd iteration to centre each seed on its cluster */
    var sums = seeds.map(function () { return [0, 0, 0, 0]; });
    for (i = 0; i < samples.length; i++) {
      var p = samples[i], best = 0, bd = Infinity;
      for (var k = 0; k < seeds.length; k++) {
        var d = U.colorDist(p[0], p[1], p[2], seeds[k][0], seeds[k][1], seeds[k][2]);
        if (d < bd) { bd = d; best = k; }
      }
      sums[best][0] += p[0]; sums[best][1] += p[1]; sums[best][2] += p[2]; sums[best][3]++;
    }
    var out = [];
    for (i = 0; i < seeds.length; i++) {
      if (sums[i][3] > 0) {
        out.push([sums[i][0] / sums[i][3], sums[i][1] / sums[i][3], sums[i][2] / sums[i][3]]);
      } else out.push(seeds[i]);
    }
    return out;
  }

  function nearestBgDist(data, idx4, bg) {
    var r = data[idx4], g = data[idx4 + 1], b = data[idx4 + 2];
    var best = Infinity;
    for (var k = 0; k < bg.length; k++) {
      var d = U.colorDist(r, g, b, bg[k][0], bg[k][1], bg[k][2]);
      if (d < best) best = d;
    }
    return best;
  }

  /* ── 2. flood fill inward from the border ─────────────── */
  function floodFromBorder(data, w, h, bg, tol, mask) {
    var n = w * h;
    var stack = new Int32Array(n);
    var top = 0;
    var x, y, p;

    function seed(p) {
      if (mask[p]) return;
      if (nearestBgDist(data, p * 4, bg) <= tol) { mask[p] = 1; stack[top++] = p; }
    }
    for (x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }

    while (top > 0) {
      p = stack[--top];
      x = p % w; y = (p / w) | 0;
      if (x > 0)     { var l = p - 1; if (!mask[l] && nearestBgDist(data, l * 4, bg) <= tol) { mask[l] = 1; stack[top++] = l; } }
      if (x < w - 1) { var r = p + 1; if (!mask[r] && nearestBgDist(data, r * 4, bg) <= tol) { mask[r] = 1; stack[top++] = r; } }
      if (y > 0)     { var u = p - w; if (!mask[u] && nearestBgDist(data, u * 4, bg) <= tol) { mask[u] = 1; stack[top++] = u; } }
      if (y < h - 1) { var d = p + w; if (!mask[d] && nearestBgDist(data, d * 4, bg) <= tol) { mask[d] = 1; stack[top++] = d; } }
    }
  }

  /* generic connected-component sweep over a predicate.
     visit(p) -> true if p belongs; onComponent(members, area) decides. */
  function components(w, h, belongs, minArea, onComponent) {
    var n = w * h;
    var seen = new Uint8Array(n);
    var stack = new Int32Array(n);
    var members = new Int32Array(n);

    for (var start = 0; start < n; start++) {
      if (seen[start] || !belongs(start)) continue;
      var top = 0, count = 0;
      stack[top++] = start; seen[start] = 1;
      while (top > 0) {
        var p = stack[--top];
        members[count++] = p;
        var x = p % w, y = (p / w) | 0;
        if (x > 0     && !seen[p - 1] && belongs(p - 1)) { seen[p - 1] = 1; stack[top++] = p - 1; }
        if (x < w - 1 && !seen[p + 1] && belongs(p + 1)) { seen[p + 1] = 1; stack[top++] = p + 1; }
        if (y > 0     && !seen[p - w] && belongs(p - w)) { seen[p - w] = 1; stack[top++] = p - w; }
        if (y < h - 1 && !seen[p + w] && belongs(p + w)) { seen[p + w] = 1; stack[top++] = p + w; }
      }
      if (count >= minArea) onComponent(members, count, true);
      else onComponent(members, count, false);
    }
  }

  /* ── 3. enclosed background pockets ───────────────────── */
  function claimPockets(data, w, h, bg, tol, mask) {
    var n = w * h;
    var tight = tol * 0.72;
    var minArea = Math.max(120, n * 0.0018);
    var belongs = function (p) {
      return !mask[p] && nearestBgDist(data, p * 4, bg) <= tight;
    };
    var claims = [];
    components(w, h, belongs, minArea, function (members, count, big) {
      if (big) claims.push(members.slice(0, count));
    });
    claims.forEach(function (arr) {
      for (var i = 0; i < arr.length; i++) mask[arr[i]] = 1;
    });
  }

  /* ── 4a. drop foreground confetti ─────────────────────── */
  function despeckleFg(w, h, mask) {
    var n = w * h;
    var minArea = Math.max(80, n * 0.0012);
    var belongs = function (p) { return mask[p] === 0; };
    var kill = [];
    components(w, h, belongs, minArea, function (members, count, big) {
      if (!big) kill.push(members.slice(0, count));
    });
    kill.forEach(function (arr) {
      for (var i = 0; i < arr.length; i++) mask[arr[i]] = 1;
    });
  }

  /* ── 4b. erode one pixel, then feather ────────────────── */
  function buildAlpha(w, h, mask, feather) {
    var n = w * h;
    var alpha = new Float32Array(n);
    var p, x, y;

    for (p = 0; p < n; p++) alpha[p] = mask[p] ? 0 : 255;

    /* shave a pixel off the silhouette so the old background
       colour doesn't survive as a halo */
    if (feather > 0) {
      var eroded = new Float32Array(alpha);
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          p = y * w + x;
          if (alpha[p] === 0) continue;
          if ((x > 0 && alpha[p - 1] === 0) || (x < w - 1 && alpha[p + 1] === 0) ||
              (y > 0 && alpha[p - w] === 0) || (y < h - 1 && alpha[p + w] === 0)) {
            eroded[p] = 0;
          }
        }
      }
      alpha = eroded;
    }

    /* separable box blur == cheap feather */
    var r = feather | 0;
    if (r > 0) {
      var tmp = new Float32Array(n);
      var win = r * 2 + 1;
      for (y = 0; y < h; y++) {
        var sum = 0, i;
        for (i = -r; i <= r; i++) sum += alpha[y * w + U.clamp(i, 0, w - 1)];
        for (x = 0; x < w; x++) {
          tmp[y * w + x] = sum / win;
          sum -= alpha[y * w + U.clamp(x - r, 0, w - 1)];
          sum += alpha[y * w + U.clamp(x + r + 1, 0, w - 1)];
        }
      }
      for (x = 0; x < w; x++) {
        var s2 = 0, j;
        for (j = -r; j <= r; j++) s2 += tmp[U.clamp(j, 0, h - 1) * w + x];
        for (y = 0; y < h; y++) {
          alpha[y * w + x] = s2 / win;
          s2 -= tmp[U.clamp(y - r, 0, h - 1) * w + x];
          s2 += tmp[U.clamp(y + r + 1, 0, h - 1) * w + x];
        }
      }
    }
    return alpha;
  }

  /* ── 5. bounding box of anything still opaque ─────────── */
  function contentBox(alpha, w, h, threshold) {
    var minX = w, minY = h, maxX = -1, maxY = -1;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (alpha[y * w + x] > threshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    return {
      x: Math.max(0, minX - PAD),
      y: Math.max(0, minY - PAD),
      w: Math.min(w, maxX + PAD + 1) - Math.max(0, minX - PAD),
      h: Math.min(h, maxY + PAD + 1) - Math.max(0, minY - PAD)
    };
  }

  /* ═══════════════════════════════════════════════════════
     PUBLIC — auto(sourceCanvas, opts)
     returns { cut, original, removed }
       cut      : canvas, background gone, cropped
       original : the same crop of the untouched photo
                  (the RESTORE brush paints from this)
       removed  : 0..1, how much of the frame was knocked out
     ═══════════════════════════════════════════════════════ */
  function auto(src, opts) {
    opts = opts || {};
    /* 24 is deliberately conservative. Leftover background is
       visible and two seconds of brush fixes it; an eaten garment
       just looks broken. Better to under-cut and let people push. */
    var tol       = opts.tolerance == null ? 24 : opts.tolerance;
    var feather   = opts.feather   == null ? 1  : opts.feather;
    var despeckle = opts.despeckle !== false;

    var w = src.width, h = src.height, n = w * h;
    var sctx = src.getContext('2d', { willReadFrequently: true });
    var img = sctx.getImageData(0, 0, w, h);
    var data = img.data;

    /* every colour comparison happens on the denoised copy;
       `data` is only ever used for the pixels we hand back */
    var dec = smooth(data, w, h);

    var bg = sampleBackground(dec, w, h, 4);
    var mask = new Uint8Array(n);

    floodFromBorder(dec, w, h, bg, tol, mask);
    claimPockets(dec, w, h, bg, tol, mask);
    if (despeckle) despeckleFg(w, h, mask);

    var removedCount = 0;
    for (var p = 0; p < n; p++) if (mask[p]) removedCount++;

    /* If we ate essentially everything, the garment was within
       tolerance of the background — a cream top on cream sheets.
       Back the tolerance off and try again before giving up; that
       usually lands on a good cut instead of a blank frame. */
    if (removedCount > n * 0.985) {
      if (tol > 10) {
        var retry = auto(src, {
          tolerance: Math.max(10, Math.round(tol * 0.65)),
          feather: feather,
          despeckle: despeckle
        });
        retry.backedOff = Math.max(10, Math.round(tol * 0.65));
        return retry;
      }
      return { cut: copyOf(src), original: copyOf(src), removed: 1, failed: true };
    }

    var alpha = buildAlpha(w, h, mask, feather);
    var box = contentBox(alpha, w, h, 8) || { x: 0, y: 0, w: w, h: h };

    /* write alpha back, then crop */
    for (var i = 0, a = 0; a < n; a++, i += 4) {
      data[i + 3] = alpha[a];
    }
    var full = document.createElement('canvas');
    full.width = w; full.height = h;
    full.getContext('2d').putImageData(img, 0, 0);

    var cut = document.createElement('canvas');
    cut.width = box.w; cut.height = box.h;
    cut.getContext('2d').drawImage(full, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);

    var orig = document.createElement('canvas');
    orig.width = box.w; orig.height = box.h;
    orig.getContext('2d').drawImage(src, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);

    return { cut: cut, original: orig, removed: removedCount / n, failed: false };
  }

  function copyOf(src) {
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }

  /* trim transparent margins — used after brushing */
  function crop(canvas) {
    var w = canvas.width, h = canvas.height;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var d = ctx.getImageData(0, 0, w, h).data;
    var alpha = new Float32Array(w * h);
    for (var p = 0, i = 3; p < w * h; p++, i += 4) alpha[p] = d[i];
    var box = contentBox(alpha, w, h, 8);
    if (!box || (box.w === w && box.h === h)) return canvas;
    var out = document.createElement('canvas');
    out.width = box.w; out.height = box.h;
    out.getContext('2d').drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    return out;
  }

  return { auto: auto, crop: crop, copyOf: copyOf, MAX_EDGE: MAX_EDGE };
})();
