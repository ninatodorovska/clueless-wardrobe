/* ═══════════════════════════════════════════════════════
   CLASSIFY — guess a rail and a name from the photo itself.

   Runs MobileNetV4-small (ImageNet-1k, 3.9 MB quantized) on the
   cut-out garment. ImageNet is not a fashion dataset, but it does
   carry a usable set of apparel classes — jean, jersey, cardigan,
   miniskirt, running shoe, purse, necklace and so on — and the
   cutout hands the model a clean, centred subject.

   Only the classes in APPAREL below are trusted. Anything else the
   model shouts is ignored, so a photo it doesn't understand falls
   back to the filename rather than being filed as "toaster".

   Nothing here is final: the item panel opens straight after upload
   so the guess can be corrected in a tap.
   ═══════════════════════════════════════════════════════ */
var Classify = (function () {
  'use strict';

  /* Full precision on purpose. The int8 build of this model returns
     flat, all-negative logits — measured as noise on real garment
     photos — so the 11 MB it saves buys nothing. */
  var MODEL = 'vendor/models/mobilenetv4/model.onnx';
  var SIZE = 224;
  var MEAN = [0.485, 0.456, 0.406];
  var STD  = [0.229, 0.224, 0.225];

  /* ImageNet index -> the rail it belongs on, and a wearable name.
     Names are rewritten: "jersey, T-shirt, tee shirt" is a label, not
     something you'd call a garment in your own closet. */
  var APPAREL = {
    399: ['DRESS',     'ABAYA'],
    400: ['DRESS',     'GOWN'],
    411: ['TOP',       'APRON'],
    414: ['BAGS',      'BACKPACK'],
    445: ['TOP',       'BIKINI'],
    459: ['TOP',       'BRA'],
    465: ['TOP',       'VEST'],
    474: ['OUTERWEAR', 'CARDIGAN'],
    501: ['OUTERWEAR', 'CLOAK'],
    502: ['SHOES',     'CLOGS'],
    514: ['SHOES',     'COWBOY BOOTS'],
    568: ['OUTERWEAR', 'FUR COAT'],
    578: ['DRESS',     'GOWN'],
    /* 601 hoopskirt and 689 overskirt are deliberately absent: they
       are archaic classes the model reaches for on any flat-lay, and
       they were confidently mis-filing shirts as bottoms. */
    608: ['BOTTOM',    'JEANS'],
    610: ['TOP',       'T-SHIRT'],
    614: ['DRESS',     'KIMONO'],
    617: ['OUTERWEAR', 'LAB COAT'],
    630: ['SHOES',     'LOAFERS'],
    636: ['BAGS',      'MAIL BAG'],
    638: ['TOP',       'SWIMSUIT'],
    639: ['TOP',       'SWIMSUIT'],
    652: ['OUTERWEAR', 'UNIFORM'],
    655: ['BOTTOM',    'MINI SKIRT'],
    658: ['JEWELRY',   'MITTENS'],
    679: ['JEWELRY',   'NECKLACE'],
    697: ['TOP',       'PYJAMAS'],
    728: ['BAGS',      'TOTE'],
    735: ['OUTERWEAR', 'PONCHO'],
    748: ['BAGS',      'PURSE'],
    770: ['SHOES',     'TRAINERS'],
    774: ['SHOES',     'SANDALS'],
    775: ['BOTTOM',    'SARONG'],
    806: ['SHOES',     'SOCKS'],
    824: ['JEWELRY',   'STOLE'],
    834: ['OUTERWEAR', 'SUIT'],
    841: ['TOP',       'SWEATSHIRT'],
    842: ['BOTTOM',    'SWIM SHORTS'],
    869: ['OUTERWEAR', 'TRENCH COAT'],
    885: ['TOP',       'VELVET TOP'],
    887: ['DRESS',     'ROBE'],
    906: ['JEWELRY',   'TIE']
  };

  var session = null;
  var loading = null;
  var failed = false;

  function available() { return typeof ort !== 'undefined' && !failed; }

  function load() {
    if (session) return Promise.resolve(session);
    if (failed) return Promise.reject(new Error('classifier unavailable'));
    if (loading) return loading;
    if (typeof ort === 'undefined') {
      failed = true;
      return Promise.reject(new Error('onnxruntime not loaded'));
    }
    /* Segment sets wasmPaths/threads already; if it hasn't run yet
       these are harmless to set again. */
    ort.env.wasm.wasmPaths = new URL('vendor/ort/', location.href).href;
    ort.env.logLevel = 'error';

    loading = ort.InferenceSession
      .create(MODEL, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
      .then(function (s) { session = s; loading = null; return s; })
      .catch(function (e) { loading = null; failed = true; throw e; });
    return loading;
  }

  /* Centre the garment on a neutral square. The model expects a photo,
     not a floating cutout on transparency — compositing onto mid-grey
     with a little margin is much closer to what it was trained on. */
  function toTensor(src) {
    var c = document.createElement('canvas');
    c.width = c.height = SIZE;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#7f7f7f';
    x.fillRect(0, 0, SIZE, SIZE);

    var pad = SIZE * 0.06;
    var box = SIZE - pad * 2;
    var s = Math.min(box / src.width, box / src.height);
    var w = src.width * s, h = src.height * s;
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, (SIZE - w) / 2, (SIZE - h) / 2, w, h);

    var d = x.getImageData(0, 0, SIZE, SIZE).data;
    var n = SIZE * SIZE;
    var f = new Float32Array(n * 3);
    for (var i = 0, p = 0; i < n; i++, p += 4) {
      f[i]         = (d[p]     / 255 - MEAN[0]) / STD[0];
      f[i + n]     = (d[p + 1] / 255 - MEAN[1]) / STD[1];
      f[i + n * 2] = (d[p + 2] / 255 - MEAN[2]) / STD[2];
    }
    return new ort.Tensor('float32', f, [1, 3, SIZE, SIZE]);
  }

  function softmaxTop(logits, k) {
    var max = -Infinity, i;
    for (i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
    var sum = 0, exp = new Float64Array(logits.length);
    for (i = 0; i < logits.length; i++) { exp[i] = Math.exp(logits[i] - max); sum += exp[i]; }

    var idx = [];
    for (i = 0; i < logits.length; i++) idx.push(i);
    idx.sort(function (a, b) { return exp[b] - exp[a]; });
    return idx.slice(0, k).map(function (i2) {
      return { index: i2, p: exp[i2] / sum };
    });
  }

  /* ── guess(canvas) -> Promise<{layer, name, confidence} | null> ──
     null means "no apparel class was credible" — the caller should
     keep whatever the filename suggested. */
  function guess(cut) {
    return load().then(function (s) {
      var feeds = {};
      feeds[s.inputNames[0]] = toTensor(cut);
      return s.run(feeds);
    }).then(function (res) {
      var out = res[Object.keys(res)[0]];
      var top = softmaxTop(out.data, 5);

      /* Only trust a garment guess that the model actually leads with.
         Measured on real photos: apparel classes appearing 4th or 5th,
         or far behind the winner, were wrong more often than right —
         a shirt filed as a gown is worse than no guess at all. So the
         apparel class has to be in the top 3 AND within striking
         distance of the overall winner. Otherwise return null and let
         the filename decide. */
      var MAX_RANK = 3;
      var MIN_RATIO = 0.35;

      var best = null;
      for (var i = 0; i < Math.min(top.length, MAX_RANK); i++) {
        var hit = APPAREL[top[i].index];
        if (hit) { best = { p: top[i].p, layer: hit[0], name: hit[1] }; break; }
      }
      if (!best) return null;
      if (best.p < top[0].p * MIN_RATIO) return null;

      return { layer: best.layer, name: best.name, confidence: best.p / top[0].p };
    }).catch(function (e) {
      console.warn('classify failed', e);
      return null;
    });
  }

  return { guess: guess, load: load, available: available, APPAREL: APPAREL };
})();
