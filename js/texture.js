/* ═══════════════════════════════════════════════════════
   TEXTURE — procedural seamless leopard tile.
   Cher's wall is leopard. This draws it once at boot and
   hands back a data: URL for the CSS background.
   ═══════════════════════════════════════════════════════ */
var Texture = (function () {
  'use strict';

  /* Finer and paler than a real leopard hide on purpose — this is
     wallpaper behind the clothes, and it has to lose the fight
     with them. Big dark rosettes made the garments unreadable. */
  var SIZE = 240;

  /* an irregular closed blob around (cx,cy) */
  function blob(ctx, cx, cy, rx, ry, rot, wobble, rnd) {
    var pts = 11, i;
    ctx.beginPath();
    for (i = 0; i <= pts; i++) {
      var a = (i / pts) * Math.PI * 2;
      var k = 1 + (rnd() - 0.5) * wobble;
      var x = Math.cos(a) * rx * k;
      var y = Math.sin(a) * ry * k;
      var xr = x * Math.cos(rot) - y * Math.sin(rot);
      var yr = x * Math.sin(rot) + y * Math.cos(rot);
      if (i === 0) ctx.moveTo(cx + xr, cy + yr);
      else ctx.lineTo(cx + xr, cy + yr);
    }
    ctx.closePath();
    ctx.fill();
  }

  /* draw the same shape nine times so the tile wraps seamlessly */
  function wrapped(ctx, fn) {
    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        ctx.save();
        ctx.translate(dx * SIZE, dy * SIZE);
        fn(ctx);
        ctx.restore();
      }
    }
  }

  function build() {
    var c = document.createElement('canvas');
    c.width = c.height = SIZE;
    var ctx = c.getContext('2d');
    var rnd = U.mulberry32(24071995);   /* Clueless release date, obviously */

    /* ── base ── */
    var g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    g.addColorStop(0, '#f4ddc0');
    g.addColorStop(0.5, '#ecd0ac');
    g.addColorStop(1, '#e3c199');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);

    /* soft tan mottling under the rosettes */
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#d8ab7c';
    for (var m = 0; m < 34; m++) {
      var mx = rnd() * SIZE, my = rnd() * SIZE, mr = 10 + rnd() * 22;
      wrapped(ctx, (function (mx, my, mr, seed) {
        var r = U.mulberry32(seed);
        return function (x) { blob(x, mx, my, mr, mr * 0.8, r() * 6.28, 0.5, r); };
      })(mx, my, mr, (rnd() * 1e9) | 0));
    }
    ctx.globalAlpha = 1;

    /* ── rosettes ── */
    ctx.globalAlpha = 0.62;
    var count = 30;
    for (var i = 0; i < count; i++) {
      var cx = rnd() * SIZE;
      var cy = rnd() * SIZE;
      var r  = 9 + rnd() * 7;
      var rot = rnd() * Math.PI * 2;
      var seed = (rnd() * 1e9) | 0;

      /* the mid-brown centre */
      wrapped(ctx, (function (cx, cy, r, rot, seed) {
        var rr = U.mulberry32(seed);
        return function (x) {
          x.fillStyle = '#c68f5c';
          blob(x, cx, cy, r * 0.62, r * 0.5, rot, 0.42, rr);
        };
      })(cx, cy, r, rot, seed));

      /* the broken dark ring: 3–5 arcs with gaps */
      var arcs = 3 + ((rnd() * 3) | 0);
      var start = rnd() * Math.PI * 2;
      for (var a = 0; a < arcs; a++) {
        var ang = start + (a / arcs) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
        var dist = r * (0.86 + rnd() * 0.22);
        var bx = cx + Math.cos(ang) * dist;
        var by = cy + Math.sin(ang) * dist * 0.82;
        var brx = r * (0.34 + rnd() * 0.2);
        var bry = r * (0.2 + rnd() * 0.14);
        wrapped(ctx, (function (bx, by, brx, bry, ang, seed) {
          var rr = U.mulberry32(seed);
          return function (x) {
            x.fillStyle = '#7a4a24';
            blob(x, bx, by, brx, bry, ang + 1.57, 0.55, rr);
          };
        })(bx, by, brx, bry, ang, (rnd() * 1e9) | 0));
      }
    }

    /* ── scattered solid specks ── */
    ctx.globalAlpha = 0.5;
    for (var s = 0; s < 22; s++) {
      var sx = rnd() * SIZE, sy = rnd() * SIZE, sr = 1.6 + rnd() * 3;
      wrapped(ctx, (function (sx, sy, sr, seed) {
        var rr = U.mulberry32(seed);
        return function (x) {
          x.fillStyle = '#6b4020';
          blob(x, sx, sy, sr, sr * 0.75, rr() * 6.28, 0.6, rr);
        };
      })(sx, sy, sr, (rnd() * 1e9) | 0));
    }
    ctx.globalAlpha = 1;

    /* ── grain, so it reads as a 90s scanned texture ── */
    var img = ctx.getImageData(0, 0, SIZE, SIZE);
    var d = img.data;
    for (var p = 0; p < d.length; p += 4) {
      var n = (rnd() - 0.5) * 11;
      d[p]     = U.clamp(d[p] + n, 0, 255);
      d[p + 1] = U.clamp(d[p + 1] + n, 0, 255);
      d[p + 2] = U.clamp(d[p + 2] + n, 0, 255);
    }
    ctx.putImageData(img, 0, 0);

    return c.toDataURL('image/png');
  }

  var cached = null;
  function apply() {
    try {
      if (!cached) cached = build();
      document.documentElement.style.setProperty('--leopard-tile', 'url(' + cached + ')');
    } catch (e) {
      /* if canvas is unavailable we just live with the flat tan background */
      console.warn('leopard tile failed', e);
    }
  }

  return { apply: apply };
})();
