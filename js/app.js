/* ═══════════════════════════════════════════════════════
   APP — boot, routing, and all the wiring.
   ═══════════════════════════════════════════════════════ */
var App = (function () {
  'use strict';

  var $ = U.$, $$ = U.$$, el = U.el;
  var route = 'wardrobe';

  /* ── routing ─────────────────────────────────────────── */
  function go(name) {
    route = name;
    ['wardrobe', 'browse', 'lookbook'].forEach(function (r) {
      $('#pane-' + r).hidden = (r !== name);
    });
    if (name === 'browse') Screens.renderBrowse();
    if (name === 'lookbook') Screens.renderLookbook();
    if (name === 'wardrobe') Screens.renderWardrobe();
    $('.traybar').hidden = (name !== 'wardrobe');
  }

  /* ── title bar ───────────────────────────────────────── */
  function tickClock() {
    var d = new Date();
    var hh = d.getHours(), mm = d.getMinutes();
    var ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12; if (hh === 0) hh = 12;
    $('#clock').textContent = hh + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ampm;
  }

  function paintSeasonPlate() {
    var s = Store.state.season;
    $('#seasonPlate').textContent = (s === 'ALL' ? 'ALL' : s) + ' FASHIONS';
  }

  /* ── DRESS ME ────────────────────────────────────────── */
  function dressMe() {
    var layers = Store.visibleLayers();
    var stocked = layers.filter(function (L) { return Store.pool(L).length > 0; });
    if (!stocked.length) {
      U.toast('NOTHING IN THE CLOSET YET — HIT BROWSE', true, 3000);
      return;
    }

    var pools = {};
    var fixed = {};
    layers.forEach(function (L) {
      pools[L] = Store.pool(L);
      if (Store.state.locks[L]) {
        var c = Store.current(L);
        if (c) fixed[L] = c;
      }
    });

    var best = Match.bestOutfit(pools, fixed);
    Object.keys(best).forEach(function (L) {
      if (best[L]) Store.select(L, best[L].id);
    });
    Screens.renderWardrobe();

    var v = Match.score(Store.wornItems());
    U.toast(v.value == null ? 'THERE YOU GO' : v.label);
  }

  /* ── SAVE LOOK ───────────────────────────────────────── */
  function saveLook() {
    var worn = Store.wornItems();
    if (!worn.length) { U.toast('PUT SOMETHING ON FIRST', true); return; }
    var name = worn.slice(0, 2).map(function (i) { return i.name; }).join(' + ');
    if (worn.length > 2) name += ' +' + (worn.length - 2);
    Store.saveOutfit(name.slice(0, 60)).then(function (o) {
      U.toast('SAVED "' + o.name + '"');
    }).catch(function (e) {
      U.toast(e.message || 'COULD NOT SAVE', true);
    });
  }

  /* ── browse filters ──────────────────────────────────── */
  function buildFilters() {
    var fl = $('#filterLayer');
    fl.innerHTML = '';
    fl.appendChild(el('option', { value: 'ALL', text: 'ALL RAILS' }));
    Store.LAYERS.forEach(function (L) {
      fl.appendChild(el('option', { value: L.id, text: L.label }));
    });

    var fs = $('#filterSeason');
    fs.innerHTML = '';
    fs.appendChild(el('option', { value: 'ALL', text: 'ANY SEASON' }));
    Store.SEASONS.forEach(function (s) {
      fs.appendChild(el('option', { value: s, text: s }));
    });
  }

  /* ── drag & drop ─────────────────────────────────────── */
  function wireDropzone() {
    var dz = $('#dropzone');
    var depth = 0;

    ['dragenter', 'dragover'].forEach(function (evt) {
      dz.addEventListener(evt, function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (evt === 'dragenter') depth++;
        dz.classList.add('is-over');
      });
    });
    dz.addEventListener('dragleave', function () {
      depth = Math.max(0, depth - 1);
      if (!depth) dz.classList.remove('is-over');
    });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      depth = 0;
      dz.classList.remove('is-over');
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        Screens.ingest(e.dataTransfer.files);
      }
    });

    /* dropping anywhere else shouldn't navigate the page away */
    ['dragover', 'drop'].forEach(function (evt) {
      window.addEventListener(evt, function (e) {
        if (!e.target.closest || !e.target.closest('#dropzone')) e.preventDefault();
      });
    });
  }

  /* ── wiring ──────────────────────────────────────────── */
  function wire() {
    $$('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () { go(b.getAttribute('data-nav')); });
    });

    $('#seasonPlate').addEventListener('click', function () {
      Store.cycleSeason();
      U.toast(Store.state.season === 'ALL' ? 'SHOWING EVERYTHING' : Store.state.season + ' ONLY');
    });

    $('#crtToggle').addEventListener('click', function () {
      var off = document.body.classList.toggle('no-crt');
      DB.setMeta('noCrt', off);
    });

    $('#dressMe').addEventListener('click', dressMe);
    $('#saveLook').addEventListener('click', saveLook);
    $('#clearLook').addEventListener('click', function () {
      Store.clearSelection();
      U.toast('RAILS CLEARED');
    });

    $('#trayMore').addEventListener('click', function () {
      $('#trayItems').scrollBy({ left: 160, behavior: 'smooth' });
    });

    /* upload */
    $('#uploadBtn').addEventListener('click', function () { $('#fileInput').click(); });
    $('#fileInput').addEventListener('change', function () {
      if (this.files && this.files.length) Screens.ingest(this.files);
      this.value = '';
    });

    /* browse filters */
    $('#filterLayer').addEventListener('change', Screens.renderBrowse);
    $('#filterSeason').addEventListener('change', Screens.renderBrowse);
    $('#searchBox').addEventListener('input', U.debounce(Screens.renderBrowse, 140));

    /* modals */
    $$('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () {
        Screens.cancelQueue();
        Screens.closeWindows();
      });
    });
    $('#confirmYes').addEventListener('click', function () { Screens.settleConfirm(true); });
    $('#confirmNo').addEventListener('click', function () { Screens.settleConfirm(false); });

    Screens.wireCutout();
    Screens.wireItem();
    wireDropzone();

    /* keyboard */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && Screens.anyWindowOpen()) {
        Screens.cancelQueue();
        Screens.settleConfirm(false);
        Screens.closeWindows();
        return;
      }
      if (Screens.anyWindowOpen()) return;
      if (e.target.matches('input, select, textarea')) return;

      if (route === 'wardrobe') {
        if (e.key === 'd' || e.key === 'D') { dressMe(); e.preventDefault(); }
        if (e.key === 's' || e.key === 'S') { saveLook(); e.preventDefault(); }
      }
      if (e.key === 'b' || e.key === 'B') go(route === 'browse' ? 'wardrobe' : 'browse');
      if (e.key === 'l' || e.key === 'L') go(route === 'lookbook' ? 'wardrobe' : 'lookbook');
    });
  }

  /* ── store subscriptions ─────────────────────────────── */
  function subscribe() {
    Store.on('change', function () {
      paintSeasonPlate();
      if (route === 'wardrobe') Screens.renderWardrobe();
      if (route === 'browse') Screens.renderBrowse();
      if (route === 'lookbook') Screens.renderLookbook();
      Screens.renderTray();
    });

    Store.on('select', function (p) {
      Screens.refreshSlot(p.layer, p.delta);
      Screens.renderVerdict();
    });
  }

  /* ── boot ────────────────────────────────────────────── */
  function boot() {
    Texture.apply();
    buildFilters();
    wire();
    subscribe();
    tickClock();
    setInterval(tickClock, 10000);

    Store.init().then(function () {
      return DB.getMeta('noCrt', false);
    }).then(function (off) {
      if (off) document.body.classList.add('no-crt');
      go('wardrobe');

      if (!DB.isPersistent()) {
        U.toast('HEADS UP: STORAGE IS OFF — RUN START.BAT TO KEEP YOUR CLOSET', true, 6000);
      } else if (!Store.state.items.length) {
        setTimeout(function () {
          U.toast('WELCOME. HIT BROWSE TO ADD YOUR FIRST PIECE.', false, 4200);
        }, 700);
      }
    }).catch(function (err) {
      console.error(err);
      U.toast('SOMETHING WENT WRONG STARTING UP', true, 5000);
      go('wardrobe');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return { go: go, dressMe: dressMe };
})();
