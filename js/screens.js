/* ═══════════════════════════════════════════════════════
   SCREENS — everything that draws, plus the modals.
   ═══════════════════════════════════════════════════════ */
var Screens = (function () {
  'use strict';

  var $ = U.$, $$ = U.$$, el = U.el;

  function imgURL(item) {
    return U.blobURL('cut:' + item.id, item.cutBlob);
  }

  /* ═══════════════════════════════════════════════════════
     WARDROBE
     ═══════════════════════════════════════════════════════ */

  /* A rail is deliberately plain: a label, the garment floating on
     the wallpaper with nothing framing it, and one arrow either
     side. No box, no bevel, nothing competing with the clothes. */
  function buildSlot(layerId) {
    var def = Store.layer(layerId);
    /* One caption line carries the rail name, the piece and the
       position. The controls hide inside the stage until hover, so
       at rest a rail is just the garment and one line of text. */
    var node = el('div', { class: 'slot', 'data-layer': layerId }, [
      el('div', { class: 'slot__row' }, [
        arrowBtn(layerId, -1, '&#8249;'),
        el('div', { class: 'slot__stage', tabindex: '0' }, [
          el('div', { class: 'slot__tools' }, [
            el('button', {
              class: 'slot__lock', title: 'Lock so DRESS ME keeps this piece', html: '&#128274;',
              onclick: function (e) { e.stopPropagation(); Store.toggleLock(layerId); }
            }),
            def.core ? null : el('button', {
              class: 'slot__off', title: 'Put this rail away', html: '&times;',
              onclick: function (e) { e.stopPropagation(); Store.toggleLayer(layerId); }
            })
          ])
        ]),
        arrowBtn(layerId, 1, '&#8250;')
      ]),
      el('div', { class: 'slot__caption' })
    ]);

    wireSwipe(node.querySelector('.slot__stage'), layerId);
    return node;
  }

  function arrowBtn(layerId, delta, glyph) {
    return el('button', {
      class: 'arrow',
      html: glyph,
      'data-step': delta,
      title: delta > 0 ? 'Next' : 'Previous',
      'aria-label': delta > 0 ? 'Next' : 'Previous',
      onclick: function () { Store.step(layerId, delta); }
    });
  }

  /* ── the rails menu, replacing the old tray bar ── */
  function renderRails() {
    /* season lives here too: both answer "what am I styling with" */
    var seasons = $('#seasonChips');
    if (seasons) {
      seasons.innerHTML = '';
      ['ALL'].concat(Store.SEASONS).forEach(function (s) {
        seasons.appendChild(el('button', {
          class: 'chip' + (Store.state.season === s ? ' is-on' : ''),
          text: s === 'ALL' ? 'any' : s.toLowerCase(),
          onclick: function () { Store.setSeason(s); renderRails(); }
        }));
      });
    }

    var host = $('#railsList');
    if (!host) return;
    host.innerHTML = '';
    Store.LAYERS.forEach(function (L) {
      var on = Store.state.active.indexOf(L.id) >= 0;
      var n = Store.pool(L.id).length;
      host.appendChild(el('button', {
        class: 'railrow' + (on ? ' is-on' : '') + (L.core ? ' is-locked' : ''),
        title: L.core ? 'Always shown' : (on ? 'Hide this rail' : 'Show this rail'),
        onclick: function () {
          if (L.core) return;
          Store.toggleLayer(L.id);
          renderRails();
        }
      }, [
        el('span', { class: 'railrow__tick', html: '&#10003;' }),
        el('span', { text: L.label.toLowerCase() }),
        el('span', { class: 'railrow__n', text: n ? String(n) : '—' })
      ]));
    });
  }

  /* drag / swipe a rail sideways */
  function wireSwipe(frame, layerId) {
    var startX = 0, dragging = false, moved = 0;

    frame.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.slot__lock')) return;
      dragging = true; moved = 0; startX = e.clientX;
      frame.classList.add('is-swiping');
      frame.setPointerCapture(e.pointerId);
    });

    frame.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      moved = e.clientX - startX;
      var img = frame.querySelector('img');
      if (img) {
        img.style.transform = 'translateX(' + (moved * 0.45) + 'px) rotate(' + (moved * 0.012) + 'deg)';
        img.style.opacity = String(Math.max(0.35, 1 - Math.abs(moved) / 260));
      }
    });

    function end(e) {
      if (!dragging) return;
      dragging = false;
      frame.classList.remove('is-swiping');
      var img = frame.querySelector('img');
      if (img) { img.style.transform = ''; img.style.opacity = ''; }
      if (Math.abs(moved) > 42) Store.step(layerId, moved < 0 ? 1 : -1);
      if (e && e.pointerId != null && frame.hasPointerCapture(e.pointerId)) {
        frame.releasePointerCapture(e.pointerId);
      }
    }
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);
    frame.addEventListener('pointerleave', end);

    frame.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { Store.step(layerId, 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft')  { Store.step(layerId, -1); e.preventDefault(); }
    });
  }

  function refreshSlot(layerId, direction) {
    var node = $('.slot[data-layer="' + layerId + '"]');
    /* the rail might live in the side strip instead */
    if (!node) { refreshSideTile(layerId); return; }

    var pool = Store.pool(layerId);
    var item = Store.current(layerId);
    var idx = Store.indexOf(layerId);
    var def = Store.layer(layerId);
    var stage = node.querySelector('.slot__stage');
    var tools = node.querySelector('.slot__tools');

    /* lock lamp */
    var lock = node.querySelector('.slot__lock');
    lock.classList.toggle('is-on', !!Store.state.locks[layerId]);
    lock.hidden = !item;

    /* wipe the stage but keep the tools node */
    $$('img, .slot__empty', stage).forEach(function (n) { n.remove(); });

    var caption = node.querySelector('.slot__caption');
    caption.innerHTML = '';

    var label = def.label.toLowerCase();

    if (item) {
      stage.insertBefore(el('img', { src: imgURL(item), alt: item.name }), tools);
      caption.appendChild(el('span', { class: 'cap__rail', text: label }));
      caption.appendChild(el('span', {
        class: 'cap__name',
        text: item.name.toLowerCase() + (pool.length > 1 ? '  ' + (idx + 1) + '/' + pool.length : '')
      }));
      if (direction) {
        node.style.setProperty('--flip-from', (direction > 0 ? 22 : -22) + 'px');
        node.classList.remove('is-flip');
        void node.offsetWidth;
        node.classList.add('is-flip');
      }
    } else {
      stage.insertBefore(el('div', {
        class: 'slot__empty',
        text: pool.length ? label + ' — tap ›' : label + ' — nothing yet'
      }), tools);
      caption.appendChild(el('span', { class: 'cap__rail', text: label }));
    }

    /* arrows off when the rail is empty */
    $$('.arrow', node).forEach(function (b) { b.disabled = !pool.length; });
  }

  /* ── accessory tile for the side strip ── */
  function buildSideTile(layerId) {
    var def = Store.layer(layerId);
    var node = el('div', { class: 'sidetile', 'data-layer': layerId }, [
      el('div', { class: 'sidetile__stage', tabindex: '0' }, [
        el('button', {
          class: 'sidetile__nav sidetile__nav--prev', html: '&#8249;',
          title: 'Previous', 'aria-label': 'Previous ' + def.label.toLowerCase(),
          onclick: function (e) { e.stopPropagation(); Store.step(layerId, -1); }
        }),
        el('button', {
          class: 'sidetile__nav sidetile__nav--next', html: '&#8250;',
          title: 'Next', 'aria-label': 'Next ' + def.label.toLowerCase(),
          onclick: function (e) { e.stopPropagation(); Store.step(layerId, 1); }
        }),
        el('button', {
          class: 'sidetile__off', html: '&times;',
          title: 'Put this rail away',
          onclick: function (e) { e.stopPropagation(); Store.toggleLayer(layerId); }
        })
      ]),
      el('div', { class: 'sidetile__label', text: def.label.toLowerCase() })
    ]);
    wireSwipe(node.querySelector('.sidetile__stage'), layerId);
    return node;
  }

  function refreshSideTile(layerId) {
    var node = $('.sidetile[data-layer="' + layerId + '"]');
    if (!node) return;
    var pool = Store.pool(layerId);
    var item = Store.current(layerId);
    var stage = node.querySelector('.sidetile__stage');

    $$('img, .sidetile__empty', stage).forEach(function (n) { n.remove(); });

    if (item) {
      stage.insertBefore(el('img', { src: imgURL(item), alt: item.name, title: item.name }),
        stage.firstChild);
      node.setAttribute('title', item.name);
    } else {
      stage.insertBefore(el('div', {
        class: 'sidetile__empty', html: pool.length ? '&#43;' : '&ndash;'
      }), stage.firstChild);
      node.removeAttribute('title');
    }
    $$('.sidetile__nav', node).forEach(function (b) { b.disabled = !pool.length; });
    node.classList.toggle('is-empty', !item);
  }

  function renderWardrobe() {
    var stack = $('#slotStack');
    var rail = $('#sideRail');
    var main = Store.mainLayers();
    var side = Store.sideLayers();

    var have = $$('.slot', stack).map(function (n) { return n.getAttribute('data-layer'); });
    if (main.join('|') !== have.join('|')) {
      stack.innerHTML = '';
      main.forEach(function (L) { stack.appendChild(buildSlot(L)); });
    }

    var haveSide = $$('.sidetile', rail).map(function (n) { return n.getAttribute('data-layer'); });
    if (side.join('|') !== haveSide.join('|')) {
      rail.innerHTML = '';
      side.forEach(function (L) { rail.appendChild(buildSideTile(L)); });
    }
    rail.hidden = !side.length;
    $('#pane-wardrobe').classList.toggle('has-side', side.length > 0);

    main.forEach(function (L) { refreshSlot(L); });
    side.forEach(function (L) { refreshSideTile(L); });
  }

  /* ═══════════════════════════════════════════════════════
     BROWSE
     ═══════════════════════════════════════════════════════ */

  function renderBrowse() {
    var grid = $('#browseGrid');
    var q = ($('#searchBox').value || '').trim().toUpperCase();
    var fl = $('#filterLayer').value;
    var fs = $('#filterSeason').value;

    var list = Store.state.items.filter(function (it) {
      if (fl !== 'ALL' && it.layer !== fl) return false;
      if (fs !== 'ALL' && (it.season || []).indexOf(fs) < 0) return false;
      if (q) {
        var hay = (it.name + ' ' + it.layer + ' ' + (it.season || []).join(' ') + ' ' +
                   (it.occasion || []).join(' ') + ' ' + (it.colorNames || []).join(' ')).toUpperCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });

    grid.innerHTML = '';
    list.forEach(function (it) { grid.appendChild(itemCard(it)); });

    $('#browseCount').textContent = list.length + (list.length === 1 ? ' ITEM' : ' ITEMS');
    $('#browseEmpty').hidden = list.length > 0;
    if (!list.length && Store.state.items.length) {
      $('#browseEmpty').querySelector('.emptystate__big').textContent = 'NOTHING MATCHES THAT';
    } else if (!Store.state.items.length) {
      $('#browseEmpty').querySelector('.emptystate__big').textContent = 'YOUR CLOSET IS EMPTY';
    }
  }

  /* select a piece from the browse grid without leaving it, so you
     can build a whole look in one pass through the closet */
  function wearFromBrowse(id) {
    var it = Store.wearItem(id);
    if (!it) return;
    var card = $('.card[data-id="' + id + '"]');
    if (card) {
      card.classList.remove('is-worn');
      void card.offsetWidth;
      card.classList.add('is-worn');
    }
    U.toast('ON THE ' + (Store.layer(it.layer) || {}).label + ' RAIL');
  }

  function itemCard(it) {
    var swatches = (it.colors || []).slice(0, 3).map(function (c) {
      return el('span', { class: 'swatch', style: 'background:' + U.rgbCss(c) });
    });
    return el('div', {
      class: 'card' + (Store.current(it.layer) === it ? ' is-on' : ''),
      'data-id': it.id,
      title: 'Edit ' + it.name,
      onclick: function () { openItem(it.id); }
    }, [
      el('div', { class: 'card__thumb' }, [
        el('img', { src: imgURL(it), alt: it.name, loading: 'lazy' }),
        el('span', { class: 'card__badge', text: Store.layer(it.layer) ? Store.layer(it.layer).label : it.layer }),
        /* straight onto the rail, without opening anything */
        el('button', {
          class: 'card__wear',
          title: 'Put this on',
          html: '&#43;',
          onclick: function (e) { e.stopPropagation(); wearFromBrowse(it.id); }
        })
      ]),
      el('div', { class: 'card__body' }, [
        el('div', { class: 'card__name', text: it.name }),
        el('div', { class: 'card__meta' }, swatches.concat([
          el('span', { class: 'card__season', text: (it.season || []).join(' ') || 'ANY' })
        ]))
      ])
    ]);
  }

  /* ═══════════════════════════════════════════════════════
     LOOKBOOK
     ═══════════════════════════════════════════════════════ */

  function renderLookbook() {
    var grid = $('#lookGrid');
    grid.innerHTML = '';
    Store.state.outfits.forEach(function (o) { grid.appendChild(lookCard(o)); });
    $('#lookCount').textContent = Store.state.outfits.length +
      (Store.state.outfits.length === 1 ? ' LOOK' : ' LOOKS');
    $('#lookEmpty').hidden = Store.state.outfits.length > 0;
  }

  function lookCard(o) {
    var pieces = Object.keys(o.slots)
      .map(function (L) { return Store.getItem(o.slots[L]); })
      .filter(Boolean);

    return el('div', {
      class: 'card card--look',
      title: 'Wear this look',
      onclick: function () {
        Store.wearOutfit(o);
        App.go('wardrobe');
        U.toast('WEARING ' + o.name);
      }
    }, [
      el('div', { class: 'card__thumb' }, [
        el('div', { class: 'look__stack' }, pieces.slice(0, 3).map(function (it) {
          return el('img', { src: imgURL(it), alt: it.name, loading: 'lazy' });
        })),
        el('span', { class: 'card__badge', text: o.season === 'ALL' ? 'ANY' : o.season })
      ]),
      el('div', { class: 'card__body' }, [
        el('div', { class: 'card__name', text: o.name }),
        el('div', { class: 'card__meta' }, [
          el('span', { class: 'card__season', text: pieces.length + ' PIECES' }),
          el('button', {
            class: 'chip', text: 'DELETE',
            onclick: function (e) {
              e.stopPropagation();
              confirmBox('DELETE LOOK', 'Toss "' + o.name + '"? The clothes stay in your closet.')
                .then(function (yes) { if (yes) Store.deleteOutfit(o.id); });
            }
          })
        ])
      ])
    ]);
  }

  /* ═══════════════════════════════════════════════════════
     MODAL PLUMBING
     ═══════════════════════════════════════════════════════ */

  function showWindow(id) {
    $('#modalWrap').hidden = false;
    $$('#modalWrap > .window').forEach(function (w) { w.hidden = w.id !== id; });
  }
  function closeWindows() {
    $('#modalWrap').hidden = true;
    $$('#modalWrap > .window').forEach(function (w) { w.hidden = true; });
  }
  function showOnly(id) { showWindow(id); }
  function anyWindowOpen() { return !$('#modalWrap').hidden; }

  var confirmResolve = null;
  function confirmBox(title, msg) {
    $('#confirmTitle').textContent = title;
    $('#confirmMsg').textContent = msg;
    showWindow('confirmWin');
    return new Promise(function (res) { confirmResolve = res; });
  }
  function settleConfirm(v) {
    closeWindows();
    if (confirmResolve) { confirmResolve(v); confirmResolve = null; }
  }

  /* ═══════════════════════════════════════════════════════
     CUTOUT EDITOR
     ═══════════════════════════════════════════════════════ */

  var CE = {
    src: null,        /* full downscaled photo                       */
    work: null,       /* offscreen canvas holding the live cutout    */
    orig: null,       /* same crop, untouched — RESTORE paints this  */
    history: [],
    mode: 'erase',
    itemId: null,     /* set when re-cutting an existing piece       */
    pending: null,    /* { name, layer } for a fresh upload          */
    srcBlob: null,    /* the downscaled photo, kept so RE-CUT works  */
    engine: 'ai',     /* 'ai' = RMBG-1.4, 'classic' = colour flood   */
    onDone: null
  };

  function ceCanvas() { return $('#cutoutCanvas'); }

  function usingOriginal() { return $('#useOriginal').checked; }

  /* opting out of the cutout makes every cutting control meaningless,
     so grey them out and say plainly what the button will do */
  function syncOriginalMode() {
    var off = usingOriginal();
    $('#engineMode').style.opacity = off ? '.4' : '';
    $('#rerunCut').disabled = off;
    $('#cutoff').disabled = off;
    $$('#engineMode .seg').forEach(function (s) { s.disabled = off; });
    $$('#brushMode .seg').forEach(function (s) { s.disabled = off; });
    $('#brushSize').disabled = off;
    $('#undoBrush').disabled = off;
    $('#cutoutSave').textContent = off ? 'KEEP PHOTO AS-IS' : 'KEEP IT';
    cePaint();
  }

  function cePaint() {
    var c = ceCanvas();
    /* USE ORIGINAL shows the whole untouched frame, not the crop the
       cutout chose — if the cutout went wrong, its crop is wrong too */
    var src = usingOriginal() ? CE.src : CE.work;
    if (!src) return;                   /* nothing cut yet */
    if (c.width !== src.width || c.height !== src.height) {
      c.width = src.width; c.height = src.height;
      var bc = $('#brushCursor');
      bc.width = src.width; bc.height = src.height;
    }
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0);
  }

  function ceBusy(on, msg) {
    $('#cutoutBusy').hidden = !on;
    if (msg) $('#cutoutBusy').querySelector('span').textContent = msg;
  }

  function setEngine(engine) {
    CE.engine = engine;
    $$('#engineMode .seg').forEach(function (s) {
      s.classList.toggle('is-on', s.getAttribute('data-engine') === engine);
    });
    $('#aiOpts').hidden = engine !== 'ai';
    $('#classicOpts').hidden = engine !== 'classic';
  }

  /* the colour-flood fallback, used when the model isn't there */
  function runClassic() {
    var r = Cutout.auto(CE.src, {
      tolerance: +$('#tolerance').value,
      feather:   +$('#feather').value,
      despeckle: $('#despeckle').checked
    });
    if (r.failed) {
      U.toast('THIS PHOTO HAS NO CLEAN BACKGROUND — USE THE BRUSH', true, 3600);
    } else if (r.backedOff) {
      $('#tolerance').value = r.backedOff;
      $('#tolVal').textContent = r.backedOff;
      U.toast('EASED TOLERANCE TO ' + r.backedOff, false, 3000);
    } else if (r.removed < 0.06) {
      U.toast('BARELY CUT ANYTHING — NUDGE TOLERANCE UP', true, 3000);
    }
    return r;
  }

  /* Look at the cut-out and file it. The filename wins when it says
     something ("denim jacket.jpg"), because that's the person telling
     us directly; the model only fills the gap left by IMG_2043.jpg. */
  function autoFile(cut) {
    if (!CE.pending || CE.pending.namedByHand) return;
    if (!cut || typeof Classify === 'undefined') return;

    Classify.guess(cut).then(function (g) {
      if (!g || !CE.pending) return;
      if (!CE.pending.layerFromName) CE.pending.layer = g.layer;
      if (!CE.pending.nameFromFile)  CE.pending.name = g.name;
      var label = (Store.layer(CE.pending.layer) || {}).label || CE.pending.layer;
      U.toast('looks like ' + CE.pending.name.toLowerCase() +
              ' — filed under ' + label.toLowerCase());
    });
  }

  function ceRun() {
    ceBusy(true, 'WORKING…');

    var go;
    if (CE.engine === 'ai') {
      go = Segment.cut(CE.src, { cutoff: +$('#cutoff').value }, function (m) { ceBusy(true, m); })
        .catch(function (err) {
          console.warn('smart cutout unavailable:', err);
          U.toast('SMART CUTOUT UNAVAILABLE — USING BASIC', true, 3600);
          setEngine('classic');
          return runClassic();
        });
    } else {
      /* let the busy flag paint before we block the thread on pixels */
      go = new Promise(function (res) { setTimeout(res, 16); }).then(runClassic);
    }

    return go.then(function (r) {
      CE.work = r.cut;
      CE.orig = r.original;
      CE.history = [];
      cePaint();
      ceBusy(false);
      autoFile(r.cut);
      if (r.engine === 'ai' && r.failed) {
        U.toast('COULD NOT FIND A GARMENT — TRY A LOWER CUTOFF', true, 3600);
      }
      return r;
    }).catch(function (err) {
      ceBusy(false);
      U.toast(err.message || 'CUTOUT FAILED', true, 3600);
    });
  }

  function openCutout(opts) {
    CE.src = opts.src;
    CE.itemId = opts.itemId || null;
    CE.pending = opts.pending || null;
    CE.srcBlob = opts.srcBlob || null;
    CE.onDone = opts.onDone || null;
    CE.mode = 'erase';
    /* prefer the model; fall back the moment we know it isn't there */
    setEngine(Segment.hasFailed() ? 'classic' : 'ai');
    $('#cutoutName').textContent = opts.title || 'ITEM';
    $$('#brushMode .seg').forEach(function (s) {
      s.classList.toggle('is-on', s.getAttribute('data-mode') === 'erase');
    });
    $('#useOriginal').checked = false;
    syncOriginalMode();
    showWindow('cutoutWin');
    return ceRun();
  }

  /* map a pointer event onto work-canvas pixels */
  function cePoint(e) {
    var c = ceCanvas();
    var r = c.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * c.width,
      y: (e.clientY - r.top) / r.height * c.height
    };
  }

  function cePush() {
    if (!CE.work) return;
    var ctx = CE.work.getContext('2d', { willReadFrequently: true });
    CE.history.push(ctx.getImageData(0, 0, CE.work.width, CE.work.height));
    if (CE.history.length > 12) CE.history.shift();
  }

  function ceStroke(a, b) {
    var ctx = CE.work.getContext('2d');
    var size = +$('#brushSize').value;
    /* scale the brush so it feels the same on a big photo as a small one */
    var c = ceCanvas();
    var r = c.getBoundingClientRect();
    var radius = size * (r.width ? c.width / r.width : 1) / 2;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = radius * 2;

    if (CE.mode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else {
      /* RESTORE: stamp the stroke into a scratch canvas, keep only
         the original photo inside it, then lay that back on top */
      var mask = document.createElement('canvas');
      mask.width = CE.work.width; mask.height = CE.work.height;
      var mctx = mask.getContext('2d');
      mctx.lineCap = 'round'; mctx.lineJoin = 'round';
      mctx.lineWidth = radius * 2;
      mctx.strokeStyle = '#000';
      mctx.beginPath();
      mctx.moveTo(a.x, a.y);
      mctx.lineTo(b.x, b.y);
      mctx.stroke();
      mctx.globalCompositeOperation = 'source-in';
      mctx.drawImage(CE.orig, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(mask, 0, 0);
    }
    ctx.restore();
    cePaint();
  }

  function ceCursor(e) {
    var bc = $('#brushCursor');
    var ctx = bc.getContext('2d');
    ctx.clearRect(0, 0, bc.width, bc.height);
    if (!e) return;
    var p = cePoint(e);
    var c = ceCanvas();
    var r = c.getBoundingClientRect();
    var radius = (+$('#brushSize').value) * (r.width ? c.width / r.width : 1) / 2;
    ctx.strokeStyle = CE.mode === 'erase' ? '#ff2d95' : '#8fe3c8';
    ctx.lineWidth = Math.max(1.5, c.width / 400);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  function wireCutout() {
    var c = ceCanvas();
    var drawing = false, last = null;

    c.addEventListener('pointerdown', function (e) {
      if (usingOriginal()) return;
      drawing = true;
      cePush();
      last = cePoint(e);
      ceStroke(last, last);
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', function (e) {
      ceCursor(e);
      if (!drawing) return;
      var p = cePoint(e);
      ceStroke(last, p);
      last = p;
    });
    ['pointerup', 'pointercancel'].forEach(function (evt) {
      c.addEventListener(evt, function () { drawing = false; last = null; });
    });
    c.addEventListener('pointerleave', function () { drawing = false; ceCursor(null); });

    $('#tolerance').addEventListener('input', function () { $('#tolVal').textContent = this.value; });
    $('#feather').addEventListener('input',   function () { $('#featherVal').textContent = this.value; });
    $('#cutoff').addEventListener('input',    function () { $('#cutoffVal').textContent = this.value; });
    $('#brushSize').addEventListener('input', function () { $('#brushVal').textContent = this.value; });
    $('#rerunCut').addEventListener('click', ceRun);
    $$('#engineMode .seg').forEach(function (s) {
      s.addEventListener('click', function () {
        setEngine(s.getAttribute('data-engine'));
        ceRun();
      });
    });
    $('#useOriginal').addEventListener('change', syncOriginalMode);
    $('#undoBrush').addEventListener('click', function () {
      var snap = CE.history.pop();
      if (!snap) { U.toast('NOTHING TO UNDO'); return; }
      CE.work.getContext('2d').putImageData(snap, 0, 0);
      cePaint();
    });
    $$('#brushMode .seg').forEach(function (s) {
      s.addEventListener('click', function () {
        CE.mode = s.getAttribute('data-mode');
        $$('#brushMode .seg').forEach(function (o) { o.classList.toggle('is-on', o === s); });
      });
    });
    $('#cutoutSave').addEventListener('click', commitCutout);
  }

  /* When the whole photo is kept, its dominant colour would otherwise
     be the bedsheet. Sample the middle instead — the garment is
     almost always what's in the centre of the frame. */
  function centreCrop(canvas, frac) {
    var w = Math.round(canvas.width * frac);
    var h = Math.round(canvas.height * frac);
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(
      canvas,
      Math.round((canvas.width - w) / 2), Math.round((canvas.height - h) / 2), w, h,
      0, 0, w, h
    );
    return c;
  }

  function commitCutout() {
    var keepWhole = usingOriginal();
    if (!keepWhole && !CE.work) return;
    if (keepWhole && !CE.src) return;
    ceBusy(true);

    var trimmed = keepWhole ? CE.src : Cutout.crop(CE.work);
    var colors = Match.dominant(keepWhole ? centreCrop(trimmed, 0.6) : trimmed, 3);

    U.encodeCutout(trimmed).then(function (blob) {
      var patch = {
        cutBlob: blob,
        colors: colors,
        colorNames: colors.map(U.colorName),
        w: trimmed.width,
        h: trimmed.height
      };
      if (CE.itemId) {
        return Store.updateItem(CE.itemId, patch).then(function (it) { return it; });
      }
      var rec = {
        name: CE.pending.name,
        layer: CE.pending.layer,
        season: CE.pending.season || [],
        occasion: [],
        cutBlob: blob,
        origBlob: CE.srcBlob,          /* keeps RE-CUT possible later */
        colors: colors,
        colorNames: colors.map(U.colorName),
        w: trimmed.width,
        h: trimmed.height
      };
      return Store.addItem(rec);
    }).then(function (item) {
      ceBusy(false);
      closeWindows();
      var done = CE.onDone;
      CE.src = CE.work = CE.orig = CE.srcBlob = null;
      CE.history = [];
      if (done) done(item);
    }).catch(function (err) {
      ceBusy(false);
      U.toast(err.message || 'COULD NOT SAVE THAT', true);
    });
  }

  /* ═══════════════════════════════════════════════════════
     ITEM WINDOW
     ═══════════════════════════════════════════════════════ */

  var openItemId = null;

  function openItem(id) {
    var it = Store.getItem(id);
    if (!it) return;
    openItemId = id;

    $('#itemPreview').src = imgURL(it);
    $('#itemName').value = it.name;

    var sel = $('#itemLayer');
    sel.innerHTML = '';
    Store.LAYERS.forEach(function (L) {
      sel.appendChild(el('option', { value: L.id, text: L.label, selected: L.id === it.layer }));
    });

    fillChips($('#itemSeasons'), Store.SEASONS, it.season || []);
    fillChips($('#itemOccasions'), Store.OCCASIONS, it.occasion || []);

    var sw = $('#itemSwatches');
    sw.innerHTML = '';
    (it.colors || []).forEach(function (c) {
      sw.appendChild(el('span', {
        class: 'swatch', style: 'background:' + U.rgbCss(c), title: U.colorName(c)
      }));
    });

    showWindow('itemWin');
  }

  function fillChips(host, options, selected) {
    host.innerHTML = '';
    options.forEach(function (o) {
      var on = selected.indexOf(o) >= 0;
      var chip = el('button', {
        class: 'chip' + (on ? ' is-on' : ''),
        text: o,
        'data-value': o,
        onclick: function () { chip.classList.toggle('is-on'); }
      });
      host.appendChild(chip);
    });
  }

  function readChips(host) {
    return $$('.chip.is-on', host).map(function (c) { return c.getAttribute('data-value'); });
  }

  function wireItem() {
    $('#itemWear').addEventListener('click', function () {
      if (!openItemId) return;
      var it = Store.wearItem(openItemId);
      if (!it) return;
      closeWindows();
      App.go('wardrobe');
      U.toast('WEARING ' + it.name);
    });

    $('#itemSave').addEventListener('click', function () {
      if (!openItemId) return;
      Store.updateItem(openItemId, {
        name: ($('#itemName').value || '').trim().toUpperCase() || 'UNTITLED',
        layer: $('#itemLayer').value,
        season: readChips($('#itemSeasons')),
        occasion: readChips($('#itemOccasions'))
      }).then(function () {
        closeWindows();
        U.toast('SAVED');
      });
    });

    $('#itemDelete').addEventListener('click', function () {
      var it = Store.getItem(openItemId);
      if (!it) return;
      confirmBox('DELETE ITEM', 'Throw out "' + it.name + '"? Any look wearing it goes too.')
        .then(function (yes) {
          if (!yes) return;
          Store.deleteItem(openItemId).then(function () {
            openItemId = null;
            U.toast('GONE');
          });
        });
    });

    $('#itemRecut').addEventListener('click', function () {
      var it = Store.getItem(openItemId);
      if (!it) return;
      if (!it.origBlob) {
        U.toast('NO ORIGINAL PHOTO KEPT FOR THIS ONE', true, 3000);
        return;
      }
      U.loadImage(U.blobURL('orig:' + it.id, it.origBlob)).then(function (img) {
        openCutout({
          src: U.fitCanvas(img, Cutout.MAX_EDGE),
          itemId: it.id,
          title: it.name,
          onDone: function () { U.toast('RE-CUT'); }
        });
      });
    });
  }

  /* ═══════════════════════════════════════════════════════
     UPLOAD PIPELINE
     ═══════════════════════════════════════════════════════ */

  var LAYER_HINTS = [
    [/\b(jacket|coat|blazer|cardi|cardigan|parka|puffer|trench)\b/i, 'OUTERWEAR'],
    [/\b(dress|gown|frock)\b/i, 'DRESS'],
    [/\b(shoes?|boots?|heels?|sneakers?|trainers?|loafers?|sandals?|pumps?|flats?|mules?|clogs?|wedges?|mary\s*janes?)\b/i, 'SHOES'],
    [/\b(bag|purse|clutch|tote|backpack|handbag)\b/i, 'BAGS'],
    [/\b(necklace|earring|earrings|bracelet|ring|choker|jewel|jewelry|jewellery)\b/i, 'JEWELRY'],
    [/\b(scarf|scarves|shawl|bandana|belt|hat|beret|headband)\b/i, 'JEWELRY'],
    [/\b(skirt|pant|pants|jean|jeans|trouser|trousers|short|shorts|legging|leggings)\b/i, 'BOTTOM'],
    [/\b(top|shirt|tee|t-shirt|blouse|sweater|knit|tank|cami|crop|hoodie)\b/i, 'TOP']
  ];

  function guessLayer(filename) {
    /* underscores and dashes are word characters, so "grey_knit_sweater"
       never matches \bknit\b — flatten them to spaces first */
    var name = (filename || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_\-.]+/g, ' ');
    for (var i = 0; i < LAYER_HINTS.length; i++) {
      if (LAYER_HINTS[i][0].test(name)) return LAYER_HINTS[i][1];
    }
    return null;
  }

  function niceName(filename) {
    return (filename || 'item')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_\-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
      .slice(0, 40) || 'UNTITLED';
  }

  var queue = [];
  var queueTotal = 0;

  function ingest(fileList) {
    var files = Array.prototype.slice.call(fileList).filter(function (f) {
      return /^image\//.test(f.type);
    });
    if (!files.length) { U.toast('THOSE WEREN’T IMAGES', true); return; }
    queue = files;
    queueTotal = files.length;
    nextInQueue();
  }

  function nextInQueue() {
    if (!queue.length) return;
    var file = queue.shift();
    var pos = queueTotal - queue.length;
    var single = queueTotal === 1;

    var src, srcBlob;
    U.fileToImage(file).then(function (img) {
      src = U.fitCanvas(img, Cutout.MAX_EDGE);
      /* stash the flattened photo as JPEG — small, and it's all
         RE-CUT needs to run the whole thing again later */
      return U.canvasToBlob(src, 'image/jpeg', 0.82);
    }).then(function (blob) {
      srcBlob = blob;
      var guessed = guessLayer(file.name);
      /* a camera filename (IMG_2043, PXL_2024…) carries nothing, so
         don't let it block the model's guess at the name */
      /* trailing digit groups repeat: PXL_20240612_101500 -> "PXL 20240612 101500" */
      var generic = /^(img|image|photo|pic|pxl|dsc|dscn|scr|screenshot|untitled|whatsapp)([\s_-]*\d+)*$/i;
      var pretty = niceName(file.name);
      var fromFile = !generic.test(pretty);

      return openCutout({
        src: src,
        srcBlob: srcBlob,
        title: (single ? '' : pos + ' OF ' + queueTotal + ' — ') + pretty,
        pending: {
          name: pretty,
          /* when nothing tells us otherwise, TOP is the safest rail */
          layer: guessed || 'TOP',
          layerFromName: !!guessed,
          nameFromFile: fromFile,
          season: Store.state.season === 'ALL' ? [] : [Store.state.season]
        },
        onDone: function (item) {
          if (single) {
            openItem(item.id);
            U.toast('ADDED — CHECK THE RAIL AND TAGS');
          } else {
            U.toast('ADDED ' + item.name);
            setTimeout(nextInQueue, 220);
          }
        }
      });
    }).catch(function (err) {
      U.toast(err.message || 'COULD NOT OPEN THAT PHOTO', true);
      setTimeout(nextInQueue, 200);
    });
  }

  function cancelQueue() { queue = []; queueTotal = 0; }

  return {
    renderWardrobe: renderWardrobe,
    refreshSlot: refreshSlot,
    renderRails: renderRails,
    renderBrowse: renderBrowse,
    renderLookbook: renderLookbook,
    openItem: openItem,
    openCutout: openCutout,
    wireCutout: wireCutout,
    wireItem: wireItem,
    ingest: ingest,
    guessLayer: guessLayer,
    niceName: niceName,
    cancelQueue: cancelQueue,
    showWindow: showWindow,
    closeWindows: closeWindows,
    anyWindowOpen: anyWindowOpen,
    confirmBox: confirmBox,
    settleConfirm: settleConfirm
  };
})();
