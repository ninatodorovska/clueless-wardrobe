/* ═══════════════════════════════════════════════════════
   DB — IndexedDB with a graceful in-memory fallback.
   Opening a page straight off disk (file://) makes some
   browsers refuse persistent storage; the app still runs,
   it just forgets everything when you close the tab.
   ═══════════════════════════════════════════════════════ */
var DB = (function () {
  'use strict';

  var NAME = 'chers-wardrobe';
  var VERSION = 1;
  var STORES = ['items', 'outfits', 'meta'];

  var db = null;
  var persistent = false;
  var mem = { items: {}, outfits: {}, meta: {} };

  function open() {
    return new Promise(function (res) {
      var req;
      try {
        req = indexedDB.open(NAME, VERSION);
      } catch (e) {
        persistent = false;
        return res(false);
      }
      if (!req) { persistent = false; return res(false); }

      req.onupgradeneeded = function (ev) {
        var d = ev.target.result;
        STORES.forEach(function (s) {
          if (!d.objectStoreNames.contains(s)) {
            d.createObjectStore(s, { keyPath: s === 'meta' ? 'k' : 'id' });
          }
        });
      };
      req.onsuccess = function () {
        db = req.result;
        persistent = true;
        db.onversionchange = function () { db.close(); db = null; persistent = false; };
        res(true);
      };
      req.onerror = function () { persistent = false; res(false); };
      req.onblocked = function () { persistent = false; res(false); };

      /* some browsers just never fire either handler on file:// */
      setTimeout(function () { if (!db) { persistent = false; res(false); } }, 2500);
    });
  }

  function tx(store, mode) {
    return db.transaction(store, mode).objectStore(store);
  }

  function wrap(request) {
    return new Promise(function (res, rej) {
      request.onsuccess = function () { res(request.result); };
      request.onerror = function () { rej(request.error); };
    });
  }

  function put(store, value) {
    if (!persistent) {
      mem[store][value.id || value.k] = value;
      return Promise.resolve(value);
    }
    return wrap(tx(store, 'readwrite').put(value)).then(function () { return value; });
  }

  function get(store, key) {
    if (!persistent) return Promise.resolve(mem[store][key] || null);
    return wrap(tx(store, 'readonly').get(key));
  }

  function all(store) {
    if (!persistent) {
      return Promise.resolve(Object.keys(mem[store]).map(function (k) { return mem[store][k]; }));
    }
    var s = tx(store, 'readonly');
    if (s.getAll) return wrap(s.getAll());
    return new Promise(function (res, rej) {
      var out = [];
      var cur = s.openCursor();
      cur.onsuccess = function (e) {
        var c = e.target.result;
        if (c) { out.push(c.value); c.continue(); } else res(out);
      };
      cur.onerror = function () { rej(cur.error); };
    });
  }

  function del(store, key) {
    if (!persistent) { delete mem[store][key]; return Promise.resolve(); }
    return wrap(tx(store, 'readwrite').delete(key));
  }

  function clear(store) {
    if (!persistent) { mem[store] = {}; return Promise.resolve(); }
    return wrap(tx(store, 'readwrite').clear());
  }

  /* small key/value helpers on the meta store */
  function setMeta(k, v) { return put('meta', { k: k, v: v }); }
  function getMeta(k, dflt) {
    return get('meta', k).then(function (r) { return r ? r.v : dflt; });
  }

  return {
    open: open,
    put: put, get: get, all: all, del: del, clear: clear,
    setMeta: setMeta, getMeta: getMeta,
    isPersistent: function () { return persistent; }
  };
})();
