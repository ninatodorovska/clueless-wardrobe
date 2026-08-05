/* ═══════════════════════════════════════════════════════
   SEGMENT — real background removal, running locally.

   Two models are supported. Whichever is installed under
   vendor/models/ gets used, u2netp first:

     u2netp   4.6 MB, 320px  — U^2-Net "small". Apache-2.0.
                               Fast enough to feel instant, and
                               small enough to host on GitHub
                               Pages (100 MB per-file cap).
     rmbg-1.4 44 MB, 1024px  — sharper edges on fiddly subjects,
                               but CC BY-NC (non-commercial) and
                               far too slow without cross-origin
                               isolation.

   Nothing is uploaded anywhere; inference is in your browser.
   The colour-flood cutout in cutout.js is the fallback for when
   no model is present at all (e.g. opened via file://).
   ═══════════════════════════════════════════════════════ */
var Segment = (function () {
  'use strict';

  /* Tried in order. ImageNet mean/std for u2netp; RMBG wants
     plain (x-0.5), i.e. mean .5 / std 1. */
  var MODELS = [
    {
      key: 'u2netp',
      url: 'vendor/models/u2netp/u2netp.onnx',
      size: 320,
      mean: [0.485, 0.456, 0.406],
      std:  [0.229, 0.224, 0.225],
      label: 'U2NETP'
    },
    {
      /* optional upgrade — not shipped. Drop
         model_quantized.onnx from huggingface.co/briaai/RMBG-1.4
         into vendor/models/rmbg-1.4/ and it gets picked up.
         Measured no better than u2netp on garment photos, ~10x
         slower, and CC BY-NC rather than Apache-2.0. */
      key: 'rmbg',
      url: 'vendor/models/rmbg-1.4/model_quantized.onnx',
      size: 1024,
      mean: [0.5, 0.5, 0.5],
      std:  [1.0, 1.0, 1.0],
      label: 'RMBG-1.4'
    }
  ];

  var WASM_DIR = 'vendor/ort/';
  var PAD = 8;

  var session = null;
  var loading = null;
  var failed = false;
  var active = null;          /* the MODELS entry in use */
  var preferred = null;       /* override by key */

  function runtimePresent() { return typeof ort !== 'undefined'; }

  function candidates() {
    if (!preferred) return MODELS;
    var hit = MODELS.filter(function (m) { return m.key === preferred; });
    return hit.concat(MODELS.filter(function (m) { return m.key !== preferred; }));
  }

  /* first model actually installed under vendor/ */
  function findModel() {
    if (active) return Promise.resolve(active);
    var list = candidates(), i = 0;
    function next() {
      if (i >= list.length) return Promise.resolve(null);
      var m = list[i++];
      return fetch(m.url, { method: 'HEAD' })
        .then(function (r) { return r.ok ? (active = m) : next(); })
        .catch(next);
    }
    return next();
  }

  function probe() {
    if (!runtimePresent()) return Promise.resolve(false);
    return findModel().then(function (m) { return !!m; });
  }

  function load(onStatus) {
    if (session) return Promise.resolve(session);
    if (failed) return Promise.reject(new Error('model unavailable'));
    if (loading) return loading;

    if (!runtimePresent()) {
      failed = true;
      return Promise.reject(new Error('onnxruntime not loaded'));
    }

    /* absolute URL — ORT dynamically imports its loader .mjs from
       here, and a bare relative path is not a valid module specifier */
    ort.env.wasm.wasmPaths = new URL(WASM_DIR, location.href).href;
    ort.env.wasm.simd = true;
    /* threads need SharedArrayBuffer, which needs COOP/COEP */
    ort.env.wasm.numThreads = (self.crossOriginIsolated)
      ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1))
      : 1;
    ort.env.logLevel = 'error';

    if (onStatus) onStatus('WAKING UP THE CUTTER…');

    loading = findModel().then(function (m) {
      if (!m) throw new Error('no cutout model installed in vendor/');
      return ort.InferenceSession.create(m.url, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      });
    }).then(function (s) {
      session = s;
      loading = null;
      return s;
    }).catch(function (e) {
      loading = null;
      failed = true;
      throw e;
    });

    return loading;
  }

  /* ── preprocess: square resize, /255, (x-mean)/std, NCHW ── */
  function toTensor(src, m) {
    var S = m.size;
    var c = document.createElement('canvas');
    c.width = c.height = S;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, S, S);
    var d = x.getImageData(0, 0, S, S).data;

    var n = S * S;
    var f = new Float32Array(n * 3);
    for (var i = 0, p = 0; i < n; i++, p += 4) {
      f[i]         = (d[p]     / 255 - m.mean[0]) / m.std[0];
      f[i + n]     = (d[p + 1] / 255 - m.mean[1]) / m.std[1];
      f[i + n * 2] = (d[p + 2] / 255 - m.mean[2]) / m.std[2];
    }
    return new ort.Tensor('float32', f, [1, 3, S, S]);
  }

  /* ── postprocess: min-max normalise to a greyscale canvas ── */
  function maskCanvas(v, S) {
    var n = S * S, mi = Infinity, ma = -Infinity, i;
    for (i = 0; i < n; i++) {
      if (v[i] < mi) mi = v[i];
      if (v[i] > ma) ma = v[i];
    }
    var span = (ma - mi) || 1;

    var c = document.createElement('canvas');
    c.width = c.height = S;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(S, S);
    var d = img.data;
    for (i = 0; i < n; i++) {
      var a = ((v[i] - mi) / span) * 255;
      var p = i * 4;
      d[p] = d[p + 1] = d[p + 2] = a;
      d[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /* soft cutoff so the matte can be tightened or loosened */
  function applyCutoff(a, cutoff) {
    var lo = cutoff - 18, hi = cutoff + 18;
    if (a <= lo) return 0;
    if (a >= hi) return 255;
    var t = (a - lo) / (hi - lo);
    return 255 * (t * t * (3 - 2 * t));      /* smoothstep */
  }

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
     cut(srcCanvas, opts) -> Promise<{cut, original, removed}>
       opts.cutoff  0..100, default 50 — how tight the matte is
     ═══════════════════════════════════════════════════════ */
  function cut(src, opts, onStatus) {
    opts = opts || {};
    var cutoff = opts.cutoff == null ? 50 : opts.cutoff;

    return load(onStatus).then(function (s) {
      if (onStatus) onStatus('LOOKING AT THE GARMENT…');
      var m = active;
      var feeds = {};
      feeds[s.inputNames[0]] = toTensor(src, m);

      return s.run(feeds).then(function (res) {
        /* U^2-Net emits d0..d6; the first output is the fused one */
        var out = res[s.outputNames[0]];
        var mc = maskCanvas(out.data, m.size);

        var w = src.width, h = src.height;

        /* scale the square matte back onto the photo */
        var full = document.createElement('canvas');
        full.width = w; full.height = h;
        var fx = full.getContext('2d', { willReadFrequently: true });
        fx.imageSmoothingQuality = 'high';
        fx.drawImage(mc, 0, 0, w, h);
        var md = fx.getImageData(0, 0, w, h).data;

        /* composite: source RGB + model alpha */
        var sctx = src.getContext('2d', { willReadFrequently: true });
        var simg = sctx.getImageData(0, 0, w, h);
        var sd = simg.data;

        var n = w * h;
        var alpha = new Float32Array(n);
        var kept = 0;
        for (var i = 0, p = 0; i < n; i++, p += 4) {
          var a = applyCutoff(md[p], cutoff);
          alpha[i] = a;
          sd[p + 3] = a;
          if (a > 8) kept++;
        }

        var box = contentBox(alpha, w, h, 8) || { x: 0, y: 0, w: w, h: h };

        var comped = document.createElement('canvas');
        comped.width = w; comped.height = h;
        comped.getContext('2d').putImageData(simg, 0, 0);

        var cutC = document.createElement('canvas');
        cutC.width = box.w; cutC.height = box.h;
        cutC.getContext('2d').drawImage(comped, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);

        var origC = document.createElement('canvas');
        origC.width = box.w; origC.height = box.h;
        origC.getContext('2d').drawImage(src, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);

        return {
          cut: cutC,
          original: origC,
          removed: 1 - (kept / n),
          engine: 'ai',
          model: m.key,
          failed: kept < n * 0.002
        };
      });
    });
  }

  /* swap models at runtime (drops the loaded session) */
  function usePreferred(key) {
    if (preferred === key && active && active.key === key) return;
    preferred = key;
    active = null;
    failed = false;
    if (session && session.release) { try { session.release(); } catch (e) {} }
    session = null;
    loading = null;
  }

  return {
    cut: cut,
    load: load,
    probe: probe,
    usePreferred: usePreferred,
    runtimePresent: runtimePresent,
    isReady: function () { return !!session; },
    hasFailed: function () { return failed; },
    modelInUse: function () { return active ? active.label : null; },
    models: MODELS
  };
})();
