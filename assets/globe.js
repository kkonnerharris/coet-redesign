/* COET — the team globe (owner: Claude).
   The original site has a globe behind the team (team__globe): their coastlines, their two studios, Milan and
   Scottsdale, joined by a trunk arc, and arcs from each studio to the cities they work with. This redraws that
   exact data for the dark page: coastlines in faint starlight, arcs in the two gels with light travelling along
   them, a pulsing studio marker with its coordinates, and the globe turning between the two studios.
   A plain 2D canvas, no three.js. It only animates on screen, and it is still under reduced motion. */
(function () {
  'use strict';
  var host = document.querySelector('[data-globe]'); if (!host) return;
  var cv = host.querySelector('canvas'), ctx = cv.getContext('2d');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nameEl = host.querySelector('[data-studio-name]'), latEl = host.querySelector('[data-studio-lat]'),
      lngEl = host.querySelector('[data-studio-lng]'), label = host.querySelector('.team__studio');

  // the original's data, verbatim
  var STUDIOS = { Milan: { lat: 45.46, lng: 9.19 }, Scottsdale: { lat: 33.4942, lng: -111.9261 } };
  var ROUTES = [{ from: 'Milan', to: [['London', 51.5074, -.1278], ['Paris', 48.8566, 2.3522], ['Berlin', 52.52, 13.405],
                                      ['Stockholm', 59.3293, 18.0686], ['Dubai', 25.2048, 55.2708], ['Tokyo', 35.6762, 139.6503]] },
                { from: 'Scottsdale', to: [['Los Angeles', 34.0522, -118.2437], ['Seattle', 47.6062, -122.3321], ['Chicago', 41.8781, -87.6298],
                                           ['Toronto', 43.6532, -79.3832], ['New York', 40.7128, -74.006], ['Mexico City', 19.4326, -99.1332]] }];
  var ARCS = [{ a: STUDIOS.Milan, b: STUDIOS.Scottsdale, trunk: true }];
  ROUTES.forEach(function (r) { r.to.forEach(function (c) { ARCS.push({ a: STUDIOS[r.from], b: { lat: c[1], lng: c[2] }, from: r.from }); }); });
  ARCS.forEach(function (arc, i) { arc.seed = (i * 0.618) % 1; });
  var ORDER = ['Scottsdale', 'Milan'];

  var D = Math.PI / 180, coast = null, w = 0, h = 0, R = 0, cx = 0, cy = 0, dpr = 1;
  var view = { lng: STUDIOS.Scottsdale.lng, lat: STUDIOS.Scottsdale.lat * .6 }, from = null, to = null, swapAt = 0, active = 'Scottsdale';
  function vec(lat, lng) { lat *= D; lng *= D; return [Math.cos(lat) * Math.sin(lng), Math.sin(lat), Math.cos(lat) * Math.cos(lng)]; }
  function rot(v) {   // into view space: yaw to the view longitude, then pitch to its latitude
    var a = -view.lng * D, b = view.lat * D;
    var x = v[0] * Math.cos(a) + v[2] * Math.sin(a), z = -v[0] * Math.sin(a) + v[2] * Math.cos(a);
    return [x, v[1] * Math.cos(b) - z * Math.sin(b), v[1] * Math.sin(b) + z * Math.cos(b)];
  }
  function slerp(p, q, t) {
    var d = Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]))) || 1e-6, s = Math.sin(d);
    var k1 = Math.sin((1 - t) * d) / s, k2 = Math.sin(t * d) / s;
    return [p[0] * k1 + q[0] * k2, p[1] * k1 + q[1] * k2, p[2] * k1 + q[2] * k2];
  }
  function size() {
    var r = host.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 1.75);
    w = r.width; h = r.height; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); R = Math.min(w, h) * .42; cx = w / 2; cy = h / 2;
  }
  function project(v, lift) { var p = rot(v), m = 1 + (lift || 0); return { x: cx + p[0] * R * m, y: cy - p[1] * R * m, z: p[2], r2: p[0] * p[0] + p[1] * p[1] }; }

  function draw(now) {
    ctx.clearRect(0, 0, w, h);
    // the sphere: a dark lens over the stars, a faint rim, the two gels catching its edge
    var g = ctx.createRadialGradient(cx - R * .3, cy - R * .35, R * .1, cx, cy, R);
    g.addColorStop(0, 'rgba(24,24,40,.55)'); g.addColorStop(1, 'rgba(4,4,10,.78)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    var rim = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    rim.addColorStop(0, 'rgba(255,61,154,.55)'); rim.addColorStop(.5, 'rgba(255,255,255,.08)'); rim.addColorStop(1, 'rgba(45,226,255,.55)');
    ctx.strokeStyle = rim; ctx.lineWidth = 1.2; ctx.stroke();
    // graticule, very faint
    ctx.strokeStyle = 'rgba(255,255,255,.045)'; ctx.lineWidth = .8;
    for (var lng = -180; lng < 180; lng += 20) line(function (t) { return vec(-90 + 180 * t, lng); }, 48);
    for (var lat = -60; lat <= 60; lat += 20) line(function (t) { return vec(lat, -180 + 360 * t); }, 96);
    // COET's coastlines
    if (coast) {
      ctx.strokeStyle = 'rgba(220,226,255,.62)'; ctx.lineWidth = 1; ctx.beginPath();
      for (var i = 0; i < coast.length; i++) {
        var pts = coast[i], pen = false;
        for (var j = 0; j < pts.length; j++) {
          var p = project(vec(pts[j][1], pts[j][0]));
          if (p.z > 0) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false;
        }
      }
      ctx.stroke();
    }
    // the arcs: drawn in, then light travels along them
    var t = now / 1000;
    ARCS.forEach(function (arc) {
      var A = vec(arc.a.lat, arc.a.lng), B = vec(arc.b.lat, arc.b.lng);
      var dist = Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
      var lift = Math.min(.42, .08 + dist * .2), N = 48, mine = arc.trunk || arc.from === active;
      var grow = reduce ? 1 : Math.min(1, Math.max(0, (t - swapAt / 1000 - arc.seed * .6) / 1.4));
      var pts = [];
      for (var k = 0; k <= N * grow; k++) { var u = k / N; pts.push(project(slerp(A, B, u), lift * Math.sin(Math.PI * u))); }
      if (pts.length < 2) return;
      var grad = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[pts.length - 1].x, pts[pts.length - 1].y);
      grad.addColorStop(0, 'rgba(255,61,154,' + (mine ? .9 : .32) + ')'); grad.addColorStop(1, 'rgba(45,226,255,' + (mine ? .9 : .32) + ')');
      ctx.strokeStyle = grad; ctx.lineWidth = arc.trunk ? 1.6 : 1.1; ctx.beginPath();
      var pen = false;
      pts.forEach(function (p) { var vis = p.z > 0 || p.r2 > 1; if (vis) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false; });
      ctx.stroke();
      if (!reduce && grow >= 1 && mine) {   // a bead of light along the arc
        var u = (t * .22 + arc.seed) % 1, b = project(slerp(A, B, u), lift * Math.sin(Math.PI * u));
        if (b.z > 0 || b.r2 > 1) { ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.shadowColor = 'rgba(45,226,255,.9)'; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(b.x, b.y, 1.8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
      }
      var end = project(B);   // the city
      if (end.z > 0) { ctx.fillStyle = 'rgba(45,226,255,' + (mine ? .9 : .4) + ')'; ctx.beginPath(); ctx.arc(end.x, end.y, 2, 0, Math.PI * 2); ctx.fill(); }
    });
    // the studios
    Object.keys(STUDIOS).forEach(function (n) {
      var s = STUDIOS[n], p = project(vec(s.lat, s.lng)); if (p.z <= 0) return;
      var on = n === active, pulse = reduce ? 0 : (t * .8) % 1;
      if (on) { ctx.strokeStyle = 'rgba(255,61,154,' + (1 - pulse) * .8 + ')'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, 4 + pulse * 18, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = on ? '#ff3d9a' : 'rgba(255,61,154,.6)'; ctx.shadowColor = '#ff3d9a'; ctx.shadowBlur = on ? 14 : 6;
      ctx.beginPath(); ctx.arc(p.x, p.y, on ? 4 : 3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      if (on && label) { label.style.transform = 'translate(' + Math.round(p.x - 14) + 'px,' + Math.round(p.y - 12) + 'px) translateX(-100%)'; }
    });
  }
  function line(fn, n) {
    ctx.beginPath(); var pen = false;
    for (var i = 0; i <= n; i++) { var p = project(fn(i / n)); if (p.z > 0) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false; }
    ctx.stroke();
  }
  function setStudio(n) {
    active = n; var s = STUDIOS[n];
    nameEl.textContent = n.toUpperCase();
    latEl.textContent = Math.abs(s.lat).toFixed(4) + '°' + (s.lat >= 0 ? 'N' : 'S');
    lngEl.textContent = Math.abs(s.lng).toFixed(4) + '°' + (s.lng >= 0 ? 'E' : 'W');
  }
  function ease(k) { return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }

  var visible = false, last = 0, turn = null;
  function frame(now) {
    if (!visible) return;
    requestAnimationFrame(frame);
    if (now - last < 30) return; last = now;
    if (!swapAt) swapAt = now;
    if (turn) {   // a slow turn from one studio to the other
      var k = Math.min(1, (now - turn.t0) / 2600), e = ease(k), dl = ((turn.to.lng - turn.from.lng + 540) % 360) - 180;
      view.lng = turn.from.lng + dl * e; view.lat = turn.from.lat + (turn.to.lat - turn.from.lat) * e;
      if (k >= 1) { turn = null; swapAt = now; }
    } else {
      view.lng += .012;   // a breath of drift
      if (now - swapAt > 9000) {
        var next = ORDER[(ORDER.indexOf(active) + 1) % ORDER.length];
        turn = { t0: now, from: { lng: view.lng, lat: view.lat }, to: { lng: STUDIOS[next].lng, lat: STUDIOS[next].lat * .6 } };
        setStudio(next);
      }
    }
    draw(now);
  }
  fetch('/coet-redesign/assets/globe/coast.json').then(function (r) { return r.json(); }).then(function (d) { coast = d; if (reduce || !visible) draw(0); }).catch(function () {});
  size(); setStudio('Scottsdale'); draw(0);
  addEventListener('resize', function () { size(); draw(performance.now()); });
  if (!reduce) new IntersectionObserver(function (es) {
    var was = visible; visible = es[0].isIntersecting;
    if (visible && !was) requestAnimationFrame(frame);
  }, { rootMargin: '100px 0px' }).observe(host);
})();
