/* ═══════════════════════════════════════════════════════
   PATTERNS — the wallpaper behind the clothes.

   These are real print scans in assets/wallpapers/, resized
   to 800px on the long edge and saved as JPEG (~1 MB for the
   whole set).

   `tile` is the background-size width in px; the height is
   left auto so the print keeps its aspect ratio. Prints that
   don't repeat cleanly are marked `cover` and shown once,
   stretched to fill, rather than tiled — a visible seam every
   300px is worse than no repeat at all.
   ═══════════════════════════════════════════════════════ */
var Patterns = (function () {
  'use strict';

  var DIR = 'assets/wallpapers/';

  var LIST = [
    { id: 'leopard',        label: 'LEOPARD',        file: 'leopard.jpg',        tile: 300 },
    { id: 'yellow-plaid',   label: 'AS IF! YELLOW',  file: 'yellow-plaid.jpg',   tile: 240 },
    { id: 'hot-plaid',      label: 'HOT PINK CHECK', file: 'hot-plaid.jpg',      tile: 260 },
    { id: 'pink-argyle',    label: 'PINK ARGYLE',    file: 'pink-argyle.jpg',    tile: 280 },
    { id: 'prep-plaid',     label: 'PREP PLAID',     file: 'prep-plaid.jpg',     tile: 280 },
    { id: 'pink-zebra',     label: 'PINK ZEBRA',     file: 'pink-zebra.jpg',     tile: 320 },
    { id: 'silver-zebra',   label: 'SILVER ZEBRA',   file: 'silver-zebra.jpg',   tile: 320 },
    { id: 'polka',          label: 'POLKA DOT',      file: 'polka.jpg',          tile: 230 },
    { id: 'halftone',       label: 'HALFTONE',       file: 'halftone.jpg',       tile: 220 },
    { id: 'pastel-leopard', label: 'PASTEL LEOPARD', file: 'pastel-leopard.jpg', mode: 'cover' }
  ];

  function byId(id) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
    return null;
  }

  function indexOf(id) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return i;
    return 0;
  }

  /* Absolute url for a print. It has to be absolute: the value ends up
     in a custom property that app.css consumes, and a relative url()
     there resolves against the stylesheet (css/) rather than the page.
     Resolving against location.href also keeps it correct when the app
     is served from a subpath, like GitHub Pages. */
  function get(id) {
    var def = byId(id) || LIST[0];
    return new URL(DIR + def.file, location.href).href;
  }

  /* how a print should be laid out, as CSS values */
  function layout(id) {
    var def = byId(id) || LIST[0];
    return def.mode === 'cover'
      ? { size: 'cover', repeat: 'no-repeat' }
      : { size: def.tile + 'px auto', repeat: 'repeat' };
  }

  function apply(id) {
    var def = byId(id) || LIST[0];
    var lay = layout(def.id);
    var root = document.documentElement.style;
    root.setProperty('--paper-url', 'url(' + get(def.id) + ')');
    root.setProperty('--paper-size', lay.size);
    root.setProperty('--paper-repeat', lay.repeat);
    return get(def.id);
  }

  /* warm the browser cache so flipping through the picker
     doesn't flash white on each one */
  function preload() {
    LIST.forEach(function (p) {
      var img = new Image();
      img.src = get(p.id);
    });
  }

  return {
    list: LIST,
    get: get,
    byId: byId,
    indexOf: indexOf,
    layout: layout,
    apply: apply,
    preload: preload
  };
})();
