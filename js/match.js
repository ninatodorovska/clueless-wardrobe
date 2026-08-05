/* ═══════════════════════════════════════════════════════
   MATCH — colour extraction, outfit scoring, and the
   verdict lamp. "It does not go with that jacket."
   ═══════════════════════════════════════════════════════ */
var Match = (function () {
  'use strict';

  /* ── dominant colours of a cut-out (transparent pixels ignored) ── */
  function dominant(canvas, want) {
    want = want || 3;
    var w = canvas.width, h = canvas.height;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var d = ctx.getImageData(0, 0, w, h).data;

    var buckets = Object.create(null);
    var step = Math.max(1, Math.round(Math.sqrt(w * h) / 160)) * 4;

    for (var i = 0; i < d.length; i += 4 * step) {
      if (d[i + 3] < 200) continue;
      var r = d[i], g = d[i + 1], b = d[i + 2];
      var key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      var e = buckets[key];
      if (e) { e[0] += r; e[1] += g; e[2] += b; e[3]++; }
      else buckets[key] = [r, g, b, 1];
    }

    var list = [];
    for (var k in buckets) {
      var v = buckets[k];
      list.push([v[0] / v[3], v[1] / v[3], v[2] / v[3], v[3]]);
    }
    if (!list.length) return [[170, 170, 170]];
    list.sort(function (a, b) { return b[3] - a[3]; });

    /* keep the top few, but force them to be visibly different */
    var out = [];
    for (var j = 0; j < list.length && out.length < want; j++) {
      var c = list[j], fresh = true;
      for (var m = 0; m < out.length; m++) {
        if (U.colorDist(c[0], c[1], c[2], out[m][0], out[m][1], out[m][2]) < 12) { fresh = false; break; }
      }
      if (fresh) out.push([Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]);
    }
    return out.length ? out : [[170, 170, 170]];
  }

  /* ── neutrals go with everything, that's the whole point ── */
  var NEUTRAL = { BLACK: 1, WHITE: 1, GREY: 1, SILVER: 1, CREAM: 1, BROWN: 1 };

  function isNeutral(rgb) {
    var hsl = U.rgbToHsl(rgb[0], rgb[1], rgb[2]);
    if (hsl[1] < 0.18) return true;                        /* desaturated */
    if (hsl[2] < 0.14 || hsl[2] > 0.90) return true;       /* near black / near white */
    return !!NEUTRAL[U.colorName(rgb)];
  }

  function hueOf(rgb) { return U.rgbToHsl(rgb[0], rgb[1], rgb[2])[0]; }

  function hueGap(a, b) {
    var d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  /* ── score a set of items 0..100 ─────────────────────── */
  function score(items) {
    var worn = items.filter(Boolean);
    if (worn.length < 2) return { value: null, label: 'READY', mood: '' };

    /* one representative colour per garment */
    var colors = worn.map(function (it) {
      return (it.colors && it.colors[0]) || [170, 170, 170];
    });

    var chromatic = [];
    var neutrals = 0;
    colors.forEach(function (c) {
      if (isNeutral(c)) neutrals++;
      else chromatic.push(c);
    });

    /* all neutrals — safe, chic, slightly boring */
    if (!chromatic.length) {
      return verdict(82, 'ALL NEUTRALS. VERY CLASSIC.');
    }
    /* one colour against neutrals — the Cher formula */
    if (chromatic.length === 1) {
      return verdict(92, U.colorName(chromatic[0]) + ' + NEUTRALS. PERFECT.');
    }

    var pts = 0, pairs = 0;
    for (var i = 0; i < chromatic.length; i++) {
      for (var j = i + 1; j < chromatic.length; j++) {
        var gap = hueGap(hueOf(chromatic[i]), hueOf(chromatic[j]));
        pairs++;
        if (gap < 32)       pts += 92;   /* analogous / same family */
        else if (gap < 60)  pts += 68;   /* neighbourly */
        else if (gap < 105) pts += 40;   /* awkward middle distance */
        else if (gap < 150) pts += 52;   /* triadic-ish, bold */
        else                pts += 80;   /* complementary, deliberate */
      }
    }
    var base = pts / pairs;

    /* too many competing colours reads as costume */
    if (chromatic.length >= 4) base -= 22;
    else if (chromatic.length === 3) base -= 8;
    /* a neutral anchor rescues almost anything */
    if (neutrals >= 1) base += 8;
    if (neutrals >= 2) base += 4;

    base = U.clamp(Math.round(base), 0, 100);
    return verdict(base, null, chromatic);
  }

  var GOOD = [
    'TOTALLY MATCHES.',
    'THAT IS A FULL-ON TEN.',
    'OUTFIT: CERTIFIED.',
    'YOU LOOK CLASSIC.'
  ];
  var OKAY = [
    "IT'S CUTE. NOT CLASSIC, BUT CUTE.",
    'SOLID. YOU COULD PUSH IT FURTHER.',
    'THIS WORKS. BARELY, BUT IT WORKS.'
  ];
  var MEH = [
    "THAT'S A LOT OF LOOK.",
    'RISKY. BUT YOU ARE BRAVE.',
    'HMM. TRY SWAPPING THE TOP.'
  ];
  var BAD = [
    'UGH, AS IF!',
    'MAJOR CLASH.',
    'ABSOLUTELY NOT. RE-ROLL.'
  ];

  function verdict(value, forced, chromatic) {
    var label, mood;
    if (value >= 78)      { mood = 'is-good'; label = forced || U.pick(GOOD); }
    else if (value >= 58) { mood = 'is-good'; label = forced || U.pick(OKAY); }
    else if (value >= 40) { mood = 'is-meh';  label = forced || U.pick(MEH); }
    else                  { mood = 'is-bad';  label = forced || U.pick(BAD); }

    if (!forced && chromatic && chromatic.length === 2 && value < 58) {
      label = U.colorName(chromatic[0]) + ' + ' + U.colorName(chromatic[1]) + '? ' + label;
    }
    return { value: value, label: label, mood: mood };
  }

  /* ── DRESS ME: sample combinations, keep the best ─────
     pools: { LAYER: [item, ...] }
     fixed: { LAYER: item }  slots the user locked
     ───────────────────────────────────────────────────── */
  function bestOutfit(pools, fixed, tries) {
    tries = tries || 90;
    var layers = Object.keys(pools);
    var best = null, bestScore = -1;

    for (var t = 0; t < tries; t++) {
      var pickSet = {};
      var chosen = [];
      for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        if (fixed && fixed[L]) { pickSet[L] = fixed[L]; chosen.push(fixed[L]); continue; }
        var pool = pools[L];
        if (!pool || !pool.length) { pickSet[L] = null; continue; }
        var it = pool[(Math.random() * pool.length) | 0];
        pickSet[L] = it;
        chosen.push(it);
      }
      if (chosen.length < 2) return pickSet;      /* nothing to optimise */
      var s = score(chosen);
      var v = s.value == null ? 50 : s.value;
      /* a little randomness so it doesn't hand you the same look forever */
      v += Math.random() * 6;
      if (v > bestScore) { bestScore = v; best = pickSet; }
      if (bestScore > 94) break;
    }
    return best || {};
  }

  return {
    dominant: dominant,
    score: score,
    isNeutral: isNeutral,
    bestOutfit: bestOutfit
  };
})();
