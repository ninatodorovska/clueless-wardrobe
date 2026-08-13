/* ═══════════════════════════════════════════════════════
   STORE — wardrobe state: items, looks, selection, filters.
   ═══════════════════════════════════════════════════════ */
var Store = (function () {
  'use strict';

  /* ── the rails in Cher's closet ───────────────────────
     `core` rails are always on screen; the rest are toggled from
     the settings panel.

     `side: true` keeps a rail out of the main column and puts it in
     the strip down the right instead. Stacking every rail in one
     lineup shrinks the outfit until you can't read it — the pieces
     that make the silhouette get the height, accessories get a tile. */
  var LAYERS = [
    { id: 'OUTERWEAR', label: 'OUTERWEAR', core: false, side: true },
    { id: 'TOP',       label: 'TOP',       core: true  },
    { id: 'DRESS',     label: 'DRESSES',   core: false, solo: true },
    { id: 'BOTTOM',    label: 'BOTTOM',    core: true  },
    { id: 'SHOES',     label: 'SHOES',     core: false },
    { id: 'BAGS',      label: 'BAGS',      core: false, side: true },
    { id: 'JEWELRY',   label: 'JEWELRY',   core: false, side: true }
  ];
  var LAYER_IDS = LAYERS.map(function (l) { return l.id; });

  var SEASONS = ['SPRING', 'SUMMER', 'FALL', 'WINTER'];
  var OCCASIONS = ['SCHOOL', 'PARTY', 'DATE', 'LOUNGE', 'FORMAL', 'GYM'];

  var state = {
    items: [],
    outfits: [],
    active: ['TOP', 'BOTTOM'],     /* which slots are on screen */
    season: 'ALL',                 /* the FALL FASHIONS plate  */
    selection: {},                 /* LAYER -> itemId          */
    locks: {}                      /* LAYER -> true            */
  };

  /* ── dead-simple event bus ───────────────────────────── */
  var handlers = {};
  function on(evt, fn) { (handlers[evt] || (handlers[evt] = [])).push(fn); }
  function emit(evt, payload) {
    (handlers[evt] || []).forEach(function (fn) { fn(payload); });
  }

  /* ── boot ────────────────────────────────────────────── */

  /* top, bottom, shoes is the outfit you actually get dressed in,
     so all three rails are on out of the box. Everything else stays
     behind the tray bar. */
  var DEFAULT_ACTIVE = ['TOP', 'BOTTOM', 'SHOES'];

  /* Bumped whenever DEFAULT_ACTIVE gains a rail, so closets saved
     before the change pick it up once — without overriding it again
     if the rail is later switched off on purpose.
       1: TOP + BOTTOM
       2: SHOES added */
  var LAYOUT_VERSION = 2;

  /* Rails that no longer exist, and where their pieces should land.
     Without this, an item keeps a dead layer: it vanishes from every
     rail, and the item panel silently re-files it on the next save. */
  var RETIRED = { SCARVES: 'JEWELRY' };

  function migrateLayers() {
    var moved = state.items.filter(function (it) {
      return LAYER_IDS.indexOf(it.layer) < 0;
    });
    if (!moved.length) return Promise.resolve(0);
    return Promise.all(moved.map(function (it) {
      it.layer = RETIRED[it.layer] || 'TOP';
      return DB.put('items', it);
    })).then(function () { return moved.length; });
  }

  function init() {
    return DB.open().then(function () {
      return Promise.all([
        DB.all('items'),
        DB.all('outfits'),
        DB.getMeta('active', DEFAULT_ACTIVE.slice()),
        DB.getMeta('season', 'ALL'),
        DB.getMeta('layoutV', 1)
      ]);
    }).then(function (r) {
      state.items = (r[0] || []).sort(function (a, b) { return b.createdAt - a.createdAt; });
      state.outfits = (r[1] || []).sort(function (a, b) { return b.createdAt - a.createdAt; });
      state.active = sanitizeActive(r[2]);
      state.season = r[3] || 'ALL';

      var seen = r[4] || 1;
      if (seen < LAYOUT_VERSION) {
        DEFAULT_ACTIVE.forEach(function (id) {
          if (state.active.indexOf(id) < 0) state.active.push(id);
        });
        DB.setMeta('active', state.active);
        DB.setMeta('layoutV', LAYOUT_VERSION);
      }

      return migrateLayers();
    }).then(function () {
      emit('ready');
      emit('change');
    });
  }

  function sanitizeActive(list) {
    if (!Array.isArray(list) || !list.length) return DEFAULT_ACTIVE.slice();
    var clean = list.filter(function (id) { return LAYER_IDS.indexOf(id) >= 0; });
    return clean.length ? clean : DEFAULT_ACTIVE.slice();
  }

  function layer(id) {
    for (var i = 0; i < LAYERS.length; i++) if (LAYERS[i].id === id) return LAYERS[i];
    return null;
  }

  /* the slots currently visible, in closet order.
     Turning on DRESSES retires TOP and BOTTOM for the session. */
  function visibleLayers() {
    var act = state.active.slice();
    if (act.indexOf('DRESS') >= 0) {
      act = act.filter(function (id) { return id !== 'TOP' && id !== 'BOTTOM'; });
    }
    return LAYERS.filter(function (l) { return act.indexOf(l.id) >= 0; }).map(function (l) { return l.id; });
  }

  /* the silhouette — gets the main column */
  function mainLayers() {
    return visibleLayers().filter(function (id) { return !layer(id).side; });
  }
  /* accessories — get the strip down the side */
  function sideLayers() {
    return visibleLayers().filter(function (id) { return !!layer(id).side; });
  }

  function toggleLayer(id) {
    var i = state.active.indexOf(id);
    if (i >= 0) state.active.splice(i, 1);
    else state.active.push(id);
    if (!state.active.length) state.active = ['TOP'];
    DB.setMeta('active', state.active);
    emit('change');
  }

  function setSeason(s) {
    state.season = s;
    DB.setMeta('season', s);
    emit('change');
  }
  function cycleSeason() {
    var order = ['ALL'].concat(SEASONS);
    var i = order.indexOf(state.season);
    setSeason(order[(i + 1) % order.length]);
  }

  /* ── item pools ──────────────────────────────────────── */
  function inSeason(item) {
    if (state.season === 'ALL') return true;
    if (!item.season || !item.season.length) return true;   /* untagged fits everything */
    return item.season.indexOf(state.season) >= 0;
  }

  function pool(layerId) {
    return state.items.filter(function (it) {
      return it.layer === layerId && inSeason(it);
    });
  }

  function pools() {
    var out = {};
    visibleLayers().forEach(function (L) { out[L] = pool(L); });
    return out;
  }

  /* ── selection ───────────────────────────────────────── */
  function current(layerId) {
    var p = pool(layerId);
    if (!p.length) return null;
    var id = state.selection[layerId];
    for (var i = 0; i < p.length; i++) if (p[i].id === id) return p[i];
    return null;
  }

  function indexOf(layerId) {
    var p = pool(layerId);
    var id = state.selection[layerId];
    for (var i = 0; i < p.length; i++) if (p[i].id === id) return i;
    return -1;
  }

  function step(layerId, delta) {
    var p = pool(layerId);
    if (!p.length) return null;
    var i = indexOf(layerId);
    var next = i < 0
      ? (delta > 0 ? 0 : p.length - 1)
      : ((i + delta) % p.length + p.length) % p.length;
    state.selection[layerId] = p[next].id;
    emit('select', { layer: layerId, delta: delta });
    return p[next];
  }

  function select(layerId, itemId) {
    state.selection[layerId] = itemId;
    emit('select', { layer: layerId, delta: 0 });
  }

  function clearSelection() {
    Object.keys(state.selection).forEach(function (k) {
      if (!state.locks[k]) delete state.selection[k];
    });
    emit('change');
  }

  function toggleLock(layerId) {
    if (state.locks[layerId]) delete state.locks[layerId];
    else state.locks[layerId] = true;
    emit('change');
  }

  function wornItems() {
    return visibleLayers().map(current).filter(Boolean);
  }

  /* ── CRUD: items ─────────────────────────────────────── */
  function addItem(rec) {
    rec.id = rec.id || U.uid();
    rec.createdAt = rec.createdAt || Date.now();
    return DB.put('items', rec).then(function () {
      state.items.unshift(rec);
      emit('items');
      emit('change');
      return rec;
    });
  }

  function updateItem(id, patch) {
    var it = getItem(id);
    if (!it) return Promise.resolve(null);
    for (var k in patch) it[k] = patch[k];
    return DB.put('items', it).then(function () {
      U.dropURL('cut:' + id);
      emit('items');
      emit('change');
      return it;
    });
  }

  function deleteItem(id) {
    return DB.del('items', id).then(function () {
      state.items = state.items.filter(function (it) { return it.id !== id; });
      Object.keys(state.selection).forEach(function (L) {
        if (state.selection[L] === id) delete state.selection[L];
      });
      U.dropURL('cut:' + id);
      /* drop any saved look that leaned on this piece */
      var orphaned = state.outfits.filter(function (o) {
        return Object.keys(o.slots).some(function (L) { return o.slots[L] === id; });
      });
      return Promise.all(orphaned.map(function (o) { return deleteOutfit(o.id); }));
    }).then(function () {
      emit('items');
      emit('change');
    });
  }

  function getItem(id) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i];
    return null;
  }

  /* ── CRUD: looks ─────────────────────────────────────── */
  function saveOutfit(name) {
    var slots = {};
    var count = 0;
    visibleLayers().forEach(function (L) {
      var it = current(L);
      if (it) { slots[L] = it.id; count++; }
    });
    if (!count) return Promise.reject(new Error('Nothing on the rail yet.'));
    var rec = {
      id: U.uid(),
      name: name || ('LOOK #' + (state.outfits.length + 1)),
      slots: slots,
      season: state.season,
      createdAt: Date.now()
    };
    return DB.put('outfits', rec).then(function () {
      state.outfits.unshift(rec);
      emit('outfits');
      emit('change');
      return rec;
    });
  }

  function deleteOutfit(id) {
    return DB.del('outfits', id).then(function () {
      state.outfits = state.outfits.filter(function (o) { return o.id !== id; });
      emit('outfits');
      emit('change');
    });
  }

  /* put one piece on: open its rail if it's hidden, then select it */
  function wearItem(id) {
    var it = getItem(id);
    if (!it) return null;
    if (state.active.indexOf(it.layer) < 0) {
      state.active.push(it.layer);
      DB.setMeta('active', state.active);
    }
    /* a dress replaces top and bottom, so retire them the same way
       the tray toggle does rather than leaving a contradictory rail */
    state.selection[it.layer] = it.id;
    emit('change');
    return it;
  }

  function wearOutfit(o) {
    var need = [];
    Object.keys(o.slots).forEach(function (L) {
      if (state.active.indexOf(L) < 0) need.push(L);
      state.selection[L] = o.slots[L];
    });
    if (need.length) {
      state.active = state.active.concat(need);
      DB.setMeta('active', state.active);
    }
    emit('change');
  }

  return {
    LAYERS: LAYERS, SEASONS: SEASONS, OCCASIONS: OCCASIONS,
    state: state,
    on: on, emit: emit,
    init: init,
    layer: layer, visibleLayers: visibleLayers,
    mainLayers: mainLayers, sideLayers: sideLayers, toggleLayer: toggleLayer,
    setSeason: setSeason, cycleSeason: cycleSeason,
    pool: pool, pools: pools,
    current: current, indexOf: indexOf, step: step, select: select,
    clearSelection: clearSelection, toggleLock: toggleLock, wornItems: wornItems,
    addItem: addItem, updateItem: updateItem, deleteItem: deleteItem, getItem: getItem,
    saveOutfit: saveOutfit, deleteOutfit: deleteOutfit,
    wearOutfit: wearOutfit, wearItem: wearItem
  };
})();
