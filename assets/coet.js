/* COET — blueprint. Page behaviour shared by every route.
   Scroll devices come from scrollcraft.js; everything bespoke lives here. */
(function () {
  'use strict';

  var doc = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fineMQ = matchMedia('(hover: hover) and (pointer: fine)');
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp01 = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  // one seeded random, so generative art is the same on every visit
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

  /* ------------------------------------------------------------ pointer -- */
  var ptr = { x: innerWidth / 2, y: innerHeight / 2, nx: 0, ny: 0, active: false };
  addEventListener('pointermove', function (e) {
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.active = true;
    ptr.nx = e.clientX / innerWidth - .5; ptr.ny = e.clientY / innerHeight - .5;
  }, { passive: true });

  /* ------------------------------------------------------------- theme -- */
  var stars = null;
  function syncTheme() {
    var light = doc.getAttribute('data-theme') === 'light';
    doc.classList.toggle('light', light);
    $$('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(light));
      b.querySelector('span').textContent = light ? 'Dark theme' : 'Light theme';
    });
    swapPreview();
    if (stars) stars.recolor();
  }
  $$('[data-theme-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var next = doc.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      doc.setAttribute('data-theme', next); store.set('coet-theme', next); syncTheme(); sound('spin', .25);
    });
  });

  /* ------------------------------------------------------------- sound --
     History: a synth instrument panel (10-13), then deep space (10-14), then noise-only "spacey" (10-14).
     User 2026-10-14: "it should sound like an Apple commercial, or like you're scrolling through an Apple page".
     So it is clean and quiet now, all synthesised here, nothing pitched you would hum:
       - silence at rest, apart from the faintest room air;
       - a soft, smooth rush of air that follows your scroll speed, and a gentle swoosh as each section arrives;
       - the reel's reveals land with a swoosh and a deep, soft bloom underneath, like a product film;
       - the interface answers with crisp tactile ticks (a phone's haptic click) and a soft pop to confirm;
       - water by Tap Water, kept.
     A short, clean room (1.4 s) instead of the long space reverb, and a gentle limiter so nothing ever spikes.
     The original's rules still hold: on by default, remembered when off, silent until the first tap,
     off under reduced motion. */
  var soundOn = store.get('coet-sound') !== 'off' && !reduce;
  var actx = null, master = null, space = null, armed = false;
  function arm() {
    if (armed || reduce) return; armed = true;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    actx = new AC();
    master = actx.createBiquadFilter(); master.type = 'lowpass'; master.frequency.value = 9000; master.Q.value = .3;
    var lim = actx.createDynamicsCompressor(); lim.threshold.value = -18; lim.knee.value = 12; lim.ratio.value = 6; lim.attack.value = .003; lim.release.value = .25;
    var mg = actx.createGain(); mg.gain.value = .9; master.connect(lim).connect(mg).connect(actx.destination);
    // the room: a short, airy, slightly bright reverb made from decaying stereo noise
    space = actx.createGain(); space.gain.value = 1;
    var len = Math.round(actx.sampleRate * 1.4), ir = actx.createBuffer(2, len, actx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = ir.getChannelData(c), lp = 0;
      for (var i = 0; i < len; i++) { var k = i / len; lp += (Math.random() * 2 - 1 - lp) * (.85 - .6 * k); d[i] = lp * Math.pow(1 - k, 3.2); }
    }
    var verb = actx.createConvolver(), vg = actx.createGain(); verb.buffer = ir; vg.gain.value = .9;
    space.connect(verb).connect(vg).connect(master);
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (e) { addEventListener(e, arm, { once: true, passive: true }); });
  function out(node, send) {   // dry to the master, a share into the room
    node.connect(master);
    if (send) { var s = actx.createGain(); s.gain.value = send; node.connect(s); s.connect(space); }
  }
  function swoosh(t, len, f0, f1, gain, send, pan0, pan1) {   // smooth air: soft noise through a wide band that glides, eased in and out
    var s = actx.createBufferSource(), bp = actx.createBiquadFilter(), g = actx.createGain(), node = g;
    s.buffer = noise(); bp.type = 'bandpass'; bp.Q.value = .7;
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + len * .45); g.gain.linearRampToValueAtTime(0, t + len);
    s.connect(bp).connect(g);
    if (pan0 != null && actx.createStereoPanner) { var p = actx.createStereoPanner(); p.pan.setValueAtTime(pan0, t); p.pan.linearRampToValueAtTime(pan1, t + len); g.connect(p); node = p; }
    out(node, send); s.start(t, Math.random()); s.stop(t + len + .05);
  }
  function tick(t, gain, f) {   // a haptic click: a few milliseconds of bright noise and a tiny body
    var s = actx.createBufferSource(), hp = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = white(); hp.type = 'bandpass'; hp.frequency.value = f || 3800; hp.Q.value = 1.2;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + .018);
    s.connect(hp).connect(g); out(g, .08); s.start(t, Math.random()); s.stop(t + .03);
    var o = actx.createOscillator(), og = actx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(90, t + .03);
    og.gain.setValueAtTime(gain * .6, t); og.gain.exponentialRampToValueAtTime(.0001, t + .04);
    o.connect(og); out(og, 0); o.start(t); o.stop(t + .05);
  }
  function bloom(t, gain, len) {   // the deep, soft swell under a reveal: a sub that rises in, felt more than heard
    var o = actx.createOscillator(), g = actx.createGain(), lp = actx.createBiquadFilter();
    o.type = 'sine'; o.frequency.setValueAtTime(42, t); o.frequency.exponentialRampToValueAtTime(58, t + len * .5);
    lp.type = 'lowpass'; lp.frequency.value = 140;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + len * .35); g.gain.exponentialRampToValueAtTime(.0001, t + len);
    o.connect(lp).connect(g); out(g, .15); o.start(t); o.stop(t + len + .05);
  }
  // interface cues keep their old names, so every caller still works
  var CUES = {
    spin: function (t, k) { tick(t, .05 * k); },                                                             // a step or toggle: one tactile tick
    enter: function (t, k) { tick(t, .045 * k, 2600); swoosh(t, .35, 900, 2600, .03 * k, .25); },            // a confirm: a tick and a little lift of air
    frame: function (t, k) { swoosh(t, .7, 500, 2400, .045 * k, .3, -.3, .3); bloom(t, .035 * k, 1.1); }     // a panel opens: air and a soft bloom
  };
  function sound(name, gain) {
    if (!soundOn || !actx || !CUES[name]) return;
    if (actx.state === 'suspended') actx.resume();
    CUES[name](actx.currentTime, Math.min(1.5, (gain == null ? .5 : gain) / .3));
  }
  $$('[data-sound-toggle]').forEach(function (b) {
    if (reduce) { b.disabled = true; b.title = 'Sound is off while reduced motion is on'; }
    paintSound();
    b.addEventListener('click', function () {
      if (soundOn && !drone) { setTimeout(function () { bed(); paintSound(); sound('enter', .3); }, 60); return; }   // first press starts sound, it does not mute it
      soundOn = !soundOn; store.set('coet-sound', soundOn ? 'on' : 'off');
      if (soundOn) sound('enter', .3);
      bed(); paintSound();
    });
  });

  var drone = null, water = null, flight = null, noiseBuf = null, whiteBuf = null, waterLevel = 0, vel = 0, BED = .006;
  function paintSound() {   // browsers stay silent until a tap, so until then the button offers to play
    $$('[data-sound-toggle]').forEach(function (o) {
      o.setAttribute('aria-pressed', String(soundOn && !!drone));
      o.querySelector('span').textContent = !soundOn ? 'Sound off' : drone ? 'Sound on' : 'Play sound';
    });
  }
  function noise() {   // soft, dark noise for air
    if (noiseBuf) return noiseBuf;
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
    var d = noiseBuf.getChannelData(0), last = 0;
    for (var i = 0; i < d.length; i++) { var w = Math.random() * 2 - 1; last = (last + .02 * w) / 1.02; d[i] = last * 3.5 + w * .15; }   // brown-ish
    return noiseBuf;
  }
  function white() {   // bright noise, only for the ticks
    if (whiteBuf) return whiteBuf;
    whiteBuf = actx.createBuffer(1, actx.sampleRate * .5, actx.sampleRate);
    var d = whiteBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return whiteBuf;
  }
  function loopBand(f, q, into) {   // a looped noise band, for the continuous layers
    var src = actx.createBufferSource(), fl = actx.createBiquadFilter(), g = actx.createGain();
    src.buffer = noise(); src.loop = true; fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0;
    src.connect(fl).connect(g); out(g, into); src.start(0, Math.random() * 2);
    return { g: g, f: fl };
  }
  function bed() {   // the continuous layers exist only once audio is armed and sound is on
    if (!actx) return;
    if (drone) {
      drone.g.gain.setTargetAtTime(soundOn ? BED : 0, actx.currentTime, .3);
      if (!soundOn) { water.g.gain.setTargetAtTime(0, actx.currentTime, .1); flight.g.gain.setTargetAtTime(0, actx.currentTime, .1); }
      return;
    }
    if (!soundOn) return;
    drone = loopBand(700, .5, .2);   // room air: barely there, so the page never feels dead
    drone.g.gain.setTargetAtTime(BED, actx.currentTime, 2);
    flight = loopBand(600, .6, .35);   // the scroll: a smooth rush that rises and brightens with speed
    // the water: a dark trickle, silent until Tap Water is on screen
    var ws = actx.createBufferSource(), wf = actx.createBiquadFilter(), wg = actx.createGain();
    ws.buffer = noise(); ws.loop = true; wf.type = 'lowpass'; wf.frequency.value = 420; wf.Q.value = .8; wg.gain.value = 0;
    ws.connect(wf).connect(wg); out(wg, .2); ws.start();
    water = { g: wg, f: wf };
  }
  var sweepCount = 0, lastArrive = 0;
  function sweep() {   // each reveal in the reel: a swoosh across the stereo field and a soft bloom underneath
    if (!soundOn || !actx) return;
    sweepCount++;
    var t = actx.currentTime;
    swoosh(t, 1.3, 350, 3200, .035, .35, -.6, .6);
    bloom(t + .15, .045, 1.6);
  }
  function arrive() {   // a section slides into view: a gentle swoosh, never more than one a second
    if (!soundOn || !actx || !drone) return;
    var now = performance.now(); if (now - lastArrive < 1000) return; lastArrive = now;
    swoosh(actx.currentTime, .8, 400, 1800, .022, .3);
  }
  function drop(gain, lo) {   // a water drop: a sine that chirps upward as the bubble closes
    var t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(), f = lo + Math.random() * lo;
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (1.6 + Math.random() * .5), t + .07 + Math.random() * .04);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + .16);
    o.connect(g); out(g, .3); o.start(t); o.stop(t + .18);
  }
  if (!reduce) {
    ['click', 'keydown', 'touchend'].forEach(function (e) { addEventListener(e, function () { setTimeout(function () { bed(); paintSound(); }, 50); }, { once: true, passive: true }); });
    var lastY = scrollY, lastT = performance.now(), waterEls = $$('[data-water]');
    var reel = document.querySelector('.hero-reel video'), SEG = 2.7, lastSeg = -1;   // compose_studio.sh: 3.4 s shots, 0.7 s dissolves
    addEventListener('scroll', function () {
      var now = performance.now(), dy = Math.abs(scrollY - lastY), dt = Math.max(16, now - lastT);
      lastY = scrollY; lastT = now; vel = Math.min(1, dy / dt / 4);   // ~4 px/ms is a hard fling
    }, { passive: true });
    if ('IntersectionObserver' in window) {   // each section announces itself once as it scrolls in
      var seen = new WeakSet();
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && !seen.has(e.target)) { seen.add(e.target); arrive(); } });
      }, { threshold: .25 });
      $$('main > section, main > .section').forEach(function (s) { io.observe(s); });
    }
    (function loop() {
      requestAnimationFrame(loop);
      if (!drone || !soundOn) return;
      var t = actx.currentTime, v = vel * vel;   // squared, so a gentle scroll is a whisper and a fling is a rush
      flight.g.gain.setTargetAtTime(v * .07, t, .15);
      flight.f.frequency.setTargetAtTime(500 + v * 2200, t, .2);
      vel *= .92;
      waterLevel = 0;
      waterEls.forEach(function (el) {   // how much of the Tap Water plate is on screen
        var r = el.getBoundingClientRect(), vis = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / Math.max(1, Math.min(r.height, innerHeight));
        waterLevel = Math.max(waterLevel, Math.min(1, vis * 1.3));
      });
      water.g.gain.setTargetAtTime(waterLevel * .05, t, .6);
      if (reel && !reel.paused && reel.getBoundingClientRect().bottom > innerHeight * .5) {   // each reveal in the reel gets its sweep
        var seg = Math.floor((reel.currentTime + .15) / SEG);
        if (seg !== lastSeg) { if (lastSeg !== -1) sweep(); lastSeg = seg; }
      } else lastSeg = -1;
    })();
    (function bubble() {   // bubbling in the trickle, and now and then a single clear drip
      setTimeout(bubble, 220 + Math.random() * 700);
      if (!actx || !soundOn || waterLevel < .05 || document.hidden) return;
      drop(.016 * waterLevel, 460);
      if (Math.random() < .07) drop(.06 * waterLevel, 220);
    })();
    document.addEventListener('visibilitychange', function () { if (actx) (document.hidden ? actx.suspend() : actx.resume()); });
    ['click', 'touchend'].forEach(function (e) { addEventListener(e, function () { if (actx && actx.state === 'suspended' && !document.hidden) actx.resume(); }, { passive: true }); });
  }
  window.COETAudio = function () { return { state: actx && actx.state, on: soundOn, air: !!drone, water: waterLevel, sweeps: sweepCount }; };

  /* ------------------------------------------------------ the world --
     The blueprint machine behind every page lives in blueprint.js. Here it
     only hears about theme changes and the final call to action. */
  window.COETSound = sound;
  stars = {
    recolor: function () { if (window.COETWorld) window.COETWorld.recolor(); },
    warpTo: function (el) { if (window.COETWorld) window.COETWorld.warp(!!el); }
  };

  /* ------------------------------------------------- drawing-sheet chrome --
     The title block names the view the camera is on; the ruler runs with
     the scroll. Both are the drawing's furniture, not content. */
  var VIEWS = {
    hero: ['01', 'General arrangement'], 'svc-branding': ['02', 'Exploded · nameplate'], 'svc-web': ['02', 'Exploded · display'],
    'svc-rendering': ['02', 'Rendered shell'], 'svc-interfaces': ['02', 'Exploded · controls'], 'svc-implementation': ['02', 'Exploded · logic board'],
    reel: ['03', 'Front elevation'], voice: ['04', 'Rear view'], team: ['05', 'Plan view'], work: ['06', 'Side elevation'],
    faq: ['07', 'Detail'], close: ['08', 'As built'], page: ['00', 'Drawing'], form: ['09', 'Specification']
  };
  var tb = $('[data-titleblock]');
  if (tb) {
    var tbN = $('[data-tb-n]', tb), tbV = $('[data-tb-view]', tb), tbLast = '';
    (function tick() {
      var st = window.COETWorld ? window.COETWorld.station() : '';
      if (st && st !== tbLast && VIEWS[st]) { tbLast = st; tbN.textContent = VIEWS[st][0]; tbV.textContent = VIEWS[st][1]; }
      setTimeout(tick, 250);
    })();
    var foot = $('.foot');
    if (foot) new IntersectionObserver(function (es) { tb.classList.toggle('is-away', es[0].isIntersecting); }).observe(foot);
  }
  addEventListener('scroll', function () { doc.style.setProperty('--sy', scrollY.toFixed(0)); }, { passive: true });

  /* ------------------------------------------------------------ cursor -- */
  if (false) {
    doc.classList.add('has-cursor');
    var cur = document.createElement('div'); cur.className = 'cursor'; cur.setAttribute('aria-hidden', 'true');
    cur.innerHTML = '<span class="cursor__ring"></span><span class="cursor__dot"></span><span class="cursor__xy"></span>';
    document.body.appendChild(cur);
    var ring = cur.firstChild, dot = cur.children[1], xy = cur.lastChild, rx = ptr.x, ry = ptr.y, lastXY = '';
    (function follow() {
      rx += (ptr.x - rx) * .18; ry += (ptr.y - ry) * .18;
      dot.style.transform = 'translate3d(' + ptr.x + 'px,' + ptr.y + 'px,0)';
      ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)';
      xy.style.transform = 'translate3d(' + (ptr.x + 16) + 'px,' + (ptr.y + 14) + 'px,0)';
      var t = 'X' + String(Math.round(ptr.x)).padStart(4, '0') + ' Y' + String(Math.round(ptr.y + scrollY)).padStart(5, '0');
      if (t !== lastXY) { xy.textContent = t; lastXY = t; }
      requestAnimationFrame(follow);
    })();
    var HOT = 'a, button, summary, label, [role="slider"], [data-cursor], input, textarea, .sheet';
    document.addEventListener('pointerover', function (e) { cur.classList.toggle('is-hot', !!e.target.closest(HOT)); });
    document.addEventListener('pointerdown', function () { cur.classList.add('is-down'); });
    document.addEventListener('pointerup', function () { cur.classList.remove('is-down'); });
    document.addEventListener('pointerleave', function () { cur.style.opacity = 0; });
    document.addEventListener('pointerenter', function () { cur.style.opacity = 1; });
  }

  /* --------------------------------------------------------------- nav -- */
  var nav = $('[data-nav]'), lastY = scrollY, menuOpen = false;
  function onScrollNav() {
    var y = scrollY, max = Math.max(document.body.scrollHeight - innerHeight, 1);
    if (nav) {
      nav.classList.toggle('is-scrolled', y > 8);
      nav.classList.toggle('is-hidden', !menuOpen && y > 640 && y > lastY + 2);
      if (y < lastY - 2) nav.classList.remove('is-hidden');
      nav.style.setProperty('--read', clamp01(y / max).toFixed(4));
    }
    lastY = y;
  }
  addEventListener('scroll', onScrollNav, { passive: true }); onScrollNav();

  /* -------------------------------------------------------------- menu -- */
  var menu = $('[data-menu]'), opener = $('[data-menu-open]'), preview = $('[data-menu-preview]'), lastFocus = null, previewSrc = null;
  function swapPreview(a) {
    if (!preview) return;
    a = a || $('.menu__list a[aria-current="page"]') || $('.menu__list a');
    var src = a.getAttribute(doc.getAttribute('data-theme') === 'light' ? 'data-preview-light' : 'data-preview-dark');
    if (src === previewSrc) return; previewSrc = src;
    preview.classList.add('is-swapping');
    setTimeout(function () { preview.src = src; preview.onload = function () { preview.classList.remove('is-swapping'); }; }, reduce ? 0 : 120);
  }
  function focusables() { return $$('a[href], button:not([disabled])', menu).filter(function (el) { return el.offsetParent !== null; }); }
  function openMenu() {
    lastFocus = document.activeElement; menu.hidden = false; menuOpen = true; swapPreview();
    requestAnimationFrame(function () { menu.classList.add('is-open'); });
    opener.setAttribute('aria-expanded', 'true'); doc.style.overflow = 'hidden';
    var first = $('.menu__list a', menu); if (first) first.focus({ preventScroll: true });
    sound('frame', .35);
  }
  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false; menu.classList.remove('is-open'); opener.setAttribute('aria-expanded', 'false'); doc.style.overflow = '';
    setTimeout(function () { if (!menuOpen) menu.hidden = true; }, reduce ? 0 : 340);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
  if (menu && opener) {
    opener.addEventListener('click', openMenu);
    $$('[data-menu-close]').forEach(function (b) { b.addEventListener('click', closeMenu); });
    menu.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
      if (e.key !== 'Tab') return;
      var f = focusables(), first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    $$('.menu__list a', menu).forEach(function (a) {
      a.addEventListener('pointerenter', function () { swapPreview(a); });
      a.addEventListener('focus', function () { swapPreview(a); });
    });
  }

  /* ---------------------------------------------------- scroll engine -- */
  var hero = $('[data-hero]');
  if (hero && reduce) hero.setAttribute('data-sc-span', '1');
  if (window.ScrollCraft) window.ScrollCraft.mount(document.body);
  syncTheme();

  /* --------------------------------------------------------- hero film --
     A real playing video. Plays only while it is on screen; under reduced
     motion it never plays and the poster frame holds. */
  var film = $('[data-hero-film]');
  if (film) {
    if (reduce) { film.removeAttribute('autoplay'); film.pause(); film.preload = 'none'; }
    else {
      var tryPlay = function () { var pr = film.play(); if (pr && pr.catch) pr.catch(function () {}); };
      new IntersectionObserver(function (es) { if (es[0].isIntersecting) tryPlay(); else film.pause(); }).observe(film);
      document.addEventListener('visibilitychange', function () { if (document.hidden) film.pause(); else tryPlay(); });
    }
  }

  /* -------------------------------------------------------------- hero --
     Depth from the pointer: the film leans one way, the headline the other. */
  if (hero && fineMQ.matches && !reduce) {
    var hx = 0, hy = 0;
    (function lean() {
      hx += (ptr.nx * 22 - hx) * .06; hy += (ptr.ny * 14 - hy) * .06;
      hero.style.setProperty('--px', hx.toFixed(2) + 'px'); hero.style.setProperty('--py', hy.toFixed(2) + 'px');
      requestAnimationFrame(lean);
    })();
  }

  /* --------------------------------------------------------- the story --
     The whole opening is one sticky stage. Every Higgsfield leg is mounted at
     once; scroll is a single playhead along them, measured in viewport-heights.
     Smoothness comes from four rules (from the 10k-websites scrub pipeline):
       - the playhead is lerped, frame-rate independent, in a rAF loop that rests;
       - each video seek is gated, so seeks never pile up;
       - a join is one-sided: the incoming leg fades up over the outgoing one,
         which holds at full strength underneath, so a seam never dips;
       - every leg keeps the same slow forward push, so the camera never stops.
     Reduced motion: no clip is fetched, the stills dissolve at the same places. */
  var story = $('[data-story]');
  if (story) {
    var stage = $('.story__stage', story), legEls = $$('[data-leg]', story), beatEls = $$('[data-beat]', story);
    var black = $('.story__black', story), legWrap = $('.story__legs', story), wordsEl = $('[data-words]', story), words = wordsEl ? $$('.w', wordsEl) : [];
    var storyOpen = null, SEAM = .36, legs = [], total = 0, tail = 0, vh = innerHeight, top = 0;
    legEls.forEach(function (el) {
      var w = parseFloat(el.getAttribute('data-w')) || 1.5, v = $('video', el);
      legs.push({ el: el, w: w, c: total, v: v, state: 'idle', busy: false, want: -1, shown: -1 });
      total += w;
    });
    var beats = beatEls.map(function (el) {
      var r = el.getAttribute('data-beat').split(/\s+/).map(parseFloat);
      return { el: el, a: r[0], b: r[1], o: -1 };
    });
    tail = 1.5;
    var sm = function (x, a, b) { x = clamp01((x - a) / (b - a)); return x * x * (3 - 2 * x); };
    var layoutStory = function () {
      vh = innerHeight;
      story.style.height = Math.round((total + tail + 1) * vh) + 'px';
      top = story.getBoundingClientRect().top + scrollY;
    };
    var smallScreen = matchMedia('(max-width: 860px), (pointer: coarse)').matches;
    var load = function (L) {
      if (!L.v || reduce || L.state !== 'idle') return;
      L.state = 'loading';
      var url = L.v.getAttribute(smallScreen ? 'data-src-m' : 'data-src');
      fetch(url).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) {
        L.v.src = URL.createObjectURL(b);
        L.v.addEventListener('loadeddata', function () { L.state = 'ready'; L.el.classList.add('has-clip'); L.shown = -1; kick(); }, { once: true });
        L.v.addEventListener('seeked', function () { L.busy = false; if (L.want >= 0 && Math.abs(L.want - L.v.currentTime) > .02) seek(L, L.want); });
        L.v.addEventListener('error', function () { L.busy = false; });
        L.v.load();
      }).catch(function () { L.state = 'failed'; });
    };
    var seek = function (L, t) {
      L.want = t;
      if (L.busy || L.state !== 'ready') return;
      if (Math.abs(L.v.currentTime - t) < 1 / 60) return;
      L.busy = true; L.v.currentTime = t;
    };
    var pos = 0, shown = -1, last = 0, raf = 0;
    var target = function () { return clamp01((scrollY - top) / Math.max((total + tail) * vh, 1)) * (total + tail); };
    var paint = function (t) {
      // legs: one-sided joins, a slow push that never stops
      legs.forEach(function (L, i) {
        var near = t > L.c - 1.6 && t < L.c + L.w + 1.6;
        if (near) load(L);
        var op = i === 0 ? 1 : sm(t, L.c - SEAM / 2, L.c + SEAM / 2);
        var next = legs[i + 1], covered = next && t > next.c + SEAM / 2;
        var vis = op > 0.001 && !covered;
        if (L.vis !== vis) { L.el.style.visibility = vis ? 'visible' : 'hidden'; L.vis = vis; }
        if (!vis) return;
        var local = clamp01((t - L.c) / L.w);
        if (L.op !== op) { L.el.style.opacity = op.toFixed(3); L.op = op; }
        if (!reduce) L.el.style.transform = 'scale(' + (1.01 + local * .05).toFixed(4) + ')';
        if (L.state === 'ready' && L.v.duration) seek(L, local * (L.v.duration - .05));
      });
      // the last leg goes to black, and the statement lights word by word
      var end = sm(t, total - .25, total + .2);
      legWrap.style.opacity = (1 - end).toFixed(3);   // the films fall away and the real sky behind the page remains
      var open = end > .02; if (open !== storyOpen) { storyOpen = open; doc.setAttribute('data-story-open', String(open)); }
      beats.forEach(function (B) {
        var r = .3, o = B.a < 0 ? 1 - sm(t, B.b - r, B.b) : sm(t, B.a, B.a + r) * (1 - sm(t, B.b - r, B.b));
        if (Math.abs(o - B.o) < .002) return;
        B.o = o;
        B.el.style.opacity = o.toFixed(3);
        B.el.style.visibility = o > .002 ? 'visible' : 'hidden';
        B.el.style.pointerEvents = o > .5 ? 'auto' : 'none';
        if (!reduce) B.el.style.transform = 'translate3d(0,' + ((1 - (t - B.a) / Math.max(B.b - B.a, .1) * 2) * 1.6).toFixed(2) + 'vh,0)';
      });
      story.setAttribute('data-sc-verify-state', t.toFixed(2));   // the harness cannot see a sticky stage's playhead
      if (words.length) {
        var n = Math.round(sm(t, total + .25, total + tail - .2) * words.length);
        words.forEach(function (w, i) { var on = i < n; if (w._on !== on) { w.classList.toggle('on', on); w._on = on; } });
      }
    };
    var frame = function (now) {
      raf = 0;
      var dt = Math.min(64, now - (last || now)); last = now;
      var goal = target();
      if (reduce) pos = goal;
      else pos += (goal - pos) * (1 - Math.pow(1 - .12, dt / 16.67));   // frame-rate independent lerp
      if (Math.abs(goal - pos) < .0005) pos = goal;
      if (pos !== shown) { paint(pos); shown = pos; }
      if (pos !== goal) raf = requestAnimationFrame(frame); else last = 0;
    };
    var kick = function () { if (!raf) raf = requestAnimationFrame(frame); };
    layoutStory(); pos = target(); paint(pos);
    addEventListener('scroll', kick, { passive: true });
    addEventListener('resize', function () { layoutStory(); shown = -1; kick(); });
    addEventListener('load', function () { layoutStory(); shown = -1; kick(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layoutStory(); kick(); });
  }

  /* ------------------------------------------------------- components --
     Small pieces in the manner of the Magic UI / Aceternity catalogues,
     written as plain JS: text that writes itself, number tickers, a reel
     that only plays on screen, and a spotlight that follows the pointer. */
  // text generate: each word of a headline arrives in turn, out of a soft blur
  $$('[data-words-in]').forEach(function (el) {
    var walk = function (node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var s = document.createElement('span'); s.className = 'gw'; s.textContent = part; frag.appendChild(s);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
    $$('.gw', el).forEach(function (w, i) { w.style.transitionDelay = (i * 70) + 'ms'; });
    if (reduce) { el.classList.add('is-in'); return; }
    new IntersectionObserver(function (es, o) { if (es[0].isIntersecting) { el.classList.add('is-in'); o.disconnect(); } }, { threshold: .6 }).observe(el);
  });
  // number ticker: counts up once, on entry
  $$('[data-count]').forEach(function (el) {
    var to = +el.getAttribute('data-count');
    if (reduce) { el.textContent = to; return; }
    new IntersectionObserver(function (es, o) {
      if (!es[0].isIntersecting) return; o.disconnect();
      var t0 = performance.now();
      (function step(now) { var k = Math.min(1, (now - t0) / 1400), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(step); })(t0);
    }, { threshold: .8 }).observe(el);
  });
  // showreel: fetched when near, playing only while on screen, never under reduced motion
  $$('[data-reel]').forEach(function (v) {
    var phone = matchMedia('(max-width: 859px)').matches;
    if (phone && v.getAttribute('data-src-m')) {   // phones get the portrait cut
      v.setAttribute('data-src', v.getAttribute('data-src-m'));
      if (v.getAttribute('data-poster-m')) v.poster = v.getAttribute('data-poster-m');
    }
    // the cut-out reel (VP9 with alpha) keeps the stars behind the hardware; Safari can't show WebM alpha, so it keeps the opaque cut
    var safari = /^((?!chrome|chromium|crios|fxios|android|edg).)*safari/i.test(navigator.userAgent);
    var alphaSrc = v.getAttribute(phone ? 'data-src-m-a' : 'data-src-a');
    if (reduce) return;   // reduced motion keeps the still poster
    if (alphaSrc && !safari && v.canPlayType('video/webm; codecs="vp9"')) {
      v.setAttribute('data-src', alphaSrc); v.removeAttribute('poster'); v.classList.add('is-cutout');
    }
    new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) {
        if (!v.getAttribute('src')) v.src = v.getAttribute('data-src');
        var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
      } else v.pause();
    }, { rootMargin: '200px 0px' }).observe(v);
  });
  // spotlight: a soft light under the pointer on project plates
  $$('[data-spot]').forEach(function (el) {
    el.addEventListener('pointermove', function (e) { var r = el.getBoundingClientRect(); el.style.setProperty('--mx', (e.clientX - r.left) + 'px'); el.style.setProperty('--my', (e.clientY - r.top) + 'px'); });
  });

  /* --------------------------------------------- the drawings: tiles --
     COET's original scenes animate on --draw; a tile plays when it is in
     the middle of the screen, and on hover. */
  var tilesX = $$('.tile-x');
  if (tilesX.length) {
    var tio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { e.target.classList.toggle('is-on', e.isIntersecting); });
    }, { rootMargin: '-30% 0px -30% 0px' });
    tilesX.forEach(function (t) {
      tio.observe(t);
      t.addEventListener('pointermove', function (e) { var r = t.getBoundingClientRect(); t.style.setProperty('--mx', (e.clientX - r.left) + 'px'); t.style.setProperty('--my', (e.clientY - r.top) + 'px'); });
    });
  }

  /* -------------------------------------------- services: the assembly --
     A pinned run of five drafting sheets, one per service, each carrying
     COET's original drawing. Scroll picks the sheet. The world turns the
     machine to the part that service touches and runs a leader from that
     part to the sheet, so the page and the machine are one drawing. */
  var asm = $('[data-assembly]');
  if (asm) {
    var sheets = $$('.sheet', asm), tabs = $$('[data-step-to]', asm), curStep = -1;
    var stepAt = function () {
      var r = asm.getBoundingClientRect(), run = Math.max(asm.offsetHeight - innerHeight, 1), p = clamp01(-r.top / run);
      return { k: Math.min(sheets.length - 1, Math.floor(p * sheets.length)), on: r.top < innerHeight * .5 && r.bottom > innerHeight * .5 };
    };
    var paintSteps = function () {
      var st = stepAt();
      if (st.k !== curStep) {
        sheets.forEach(function (el, i) { el.classList.toggle('is-lit', i === st.k); el.classList.toggle('is-past', i < st.k); });
        tabs.forEach(function (t, i) { if (i === st.k) t.setAttribute('aria-current', 'step'); else t.removeAttribute('aria-current'); });
        var row = tabs[st.k].closest('ol'), tr = tabs[st.k].getBoundingClientRect(), rr = row.getBoundingClientRect();
        if (row.scrollWidth > row.clientWidth + 2 && (tr.left < rr.left || tr.right > rr.right)) row.scrollLeft += tr.left - rr.left - 8;
        asm.style.setProperty('--step', st.k);
        if (curStep !== -1) sound('spin', .14);
        curStep = st.k;
      }
      if (window.COETWorld) window.COETWorld.setCallout(st.on ? $('.sheet__card', sheets[curStep]) : null);
    };
    addEventListener('scroll', paintSteps, { passive: true }); addEventListener('resize', paintSteps); paintSteps();
    var goTo = function (i) {
      var run = Math.max(asm.offsetHeight - innerHeight, 1), top = asm.getBoundingClientRect().top + scrollY;
      scrollTo({ top: top + run * (i + .5) / sheets.length, behavior: reduce ? 'auto' : 'smooth' });
    };
    tabs.forEach(function (t, i) { t.addEventListener('click', function (e) { e.preventDefault(); goTo(i); }); });
    sheets.forEach(function (el, i) { el.addEventListener('focus', function () { if (curStep !== i) goTo(i); }); });
    // the sheet under the pointer leans toward it
    if (fineMQ.matches && !reduce) sheets.forEach(function (el) {
      var card = $('.sheet__card', el);
      el.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--tx', ((e.clientX - r.left) / r.width - .5).toFixed(3));
        card.style.setProperty('--ty', ((e.clientY - r.top) / r.height - .5).toFixed(3));
      });
      el.addEventListener('pointerleave', function () { card.style.setProperty('--tx', 0); card.style.setProperty('--ty', 0); });
    });
  }

  /* --------------------------------------------------- living plates --
     Abstract, pointer-reactive art standing in for each project's image
     until the real plates exist. Abstract on purpose: it shows nothing that
     could be mistaken for the client's actual work. */
  function bpInk() { return getComputedStyle(doc).getPropertyValue('--world-ink').trim() || '226,232,242'; }
  function art(el) {
    var cv = document.createElement('canvas'); el.prepend(cv);
    var ctx = cv.getContext('2d'), kind = el.getAttribute('data-art'), w, h, dpr, visible = false, local = { x: -1, y: -1, on: false };
    var ripples = [], lastRipple = 0, seed = rng(kind.length * 97 + 7), cells = [];
    function size() {
      dpr = Math.min(devicePixelRatio || 1, 2); w = el.clientWidth; h = el.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (kind === 'ledger') {
        cells = []; var s = rng(11), cols = Math.max(12, Math.round(w / 34)), rows = Math.max(6, Math.round(h / 34));
        for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) cells.push({ i: i, j: j, cols: cols, rows: rows, v: s(), lit: 0 });
      }
    }
    el.addEventListener('pointermove', function (e) { var r = el.getBoundingClientRect(); local.x = e.clientX - r.left; local.y = e.clientY - r.top; local.on = true; });
    el.addEventListener('pointerleave', function () { local.on = false; });
    function frame(now) {
      ctx.clearRect(0, 0, w, h);
      var px = local.on ? local.x : w * (.5 + .3 * Math.sin(now * .0004)), py = local.on ? local.y : h * (.5 + .25 * Math.cos(now * .0005));
      if (kind === 'grid') {           // schematic lines that bend toward the pointer
        var step = 36;
        ctx.lineWidth = 1;
        for (var gx = 0; gx <= w; gx += step) {
          ctx.beginPath();
          for (var gy = 0; gy <= h; gy += 8) {
            var dx = gx - px, dy = gy - py, d = Math.sqrt(dx * dx + dy * dy), pull = Math.max(0, 1 - d / 220);
            var x = gx - dx * pull * .35; if (gy === 0) ctx.moveTo(x, gy); else ctx.lineTo(x, gy);
          }
          ctx.strokeStyle = 'rgba(' + bpInk() + ',.16)'; ctx.stroke();
        }
        for (var ly = 0; ly <= h; ly += step) {
          ctx.beginPath();
          for (var lx = 0; lx <= w; lx += 8) {
            var ddx = lx - px, ddy = ly - py, dd = Math.sqrt(ddx * ddx + ddy * ddy), pl = Math.max(0, 1 - dd / 220);
            var yy = ly - ddy * pl * .35; if (lx === 0) ctx.moveTo(lx, yy); else ctx.lineTo(lx, yy);
          }
          ctx.strokeStyle = 'rgba(' + bpInk() + ',.16)'; ctx.stroke();
        }
        var g = ctx.createRadialGradient(px, py, 0, px, py, 160);
        g.addColorStop(0, 'rgba(255,255,255,.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      } else if (kind === 'ripple') {  // water: rings spread from wherever you point
        if (now - lastRipple > (local.on ? 380 : 1100)) { ripples.push({ x: px, y: py, t: now }); lastRipple = now; }
        ripples = ripples.filter(function (r) { return now - r.t < 3600; });
        ripples.forEach(function (r) {
          var age = (now - r.t) / 3600, rad = age * Math.max(w, h) * .7;
          ctx.strokeStyle = 'rgba(' + bpInk() + ',' + (.55 * (1 - age)) + ')'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * .55, 0, 0, 6.283); ctx.stroke();
        });
        ctx.fillStyle = 'rgba(245,158,11,.9)'; ctx.beginPath(); ctx.arc(px, py, 3, 0, 6.283); ctx.fill();
      } else {                         // registry: a ledger of records lighting along your path
        var cw = w / cells[0].cols, ch = h / cells[0].rows;
        cells.forEach(function (c) {
          var cx = c.i * cw + cw / 2, cy = c.j * ch + ch / 2, d = Math.hypot(cx - px, cy - py);
          c.lit = Math.max(c.lit * .96, d < 70 ? 1 : 0);
          var base = .05 + c.v * .08;
          ctx.fillStyle = c.lit > .05 ? 'rgba(255,255,255,' + (base + c.lit * .45) + ')' : 'rgba(' + bpInk() + ',' + base + ')';
          ctx.fillRect(c.i * cw + 3, c.j * ch + 3, cw - 6, ch - 6);
        });
      }
      if (visible && !reduce) requestAnimationFrame(frame);
    }
    size(); addEventListener('resize', function () { size(); if (reduce) frame(0); });
    if (reduce) { frame(0); return; }
    new IntersectionObserver(function (es) {
      var was = visible; visible = es[0].isIntersecting;
      if (visible && !was) requestAnimationFrame(frame);
    }).observe(el);
  }
  $$('[data-art]').forEach(art);

  /* ------------------------------------------- team: constellation marks --
     Each empty portrait plate carries a small, fixed constellation, so the
     row reads as people-to-come rather than grey boxes. */
  $$('.person .plate').forEach(function (p, k) {
    var cv = document.createElement('canvas'); p.prepend(cv);
    var ctx = cv.getContext('2d'), r = rng(31 + k * 17), w = p.clientWidth, h = p.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var pts = []; for (var i = 0; i < 6 + Math.floor(r() * 4); i++) pts.push([w * (.2 + r() * .6), h * (.15 + r() * .5)]);
    ctx.strokeStyle = 'rgba(' + bpInk() + ',.4)'; ctx.lineWidth = 1; ctx.beginPath();
    pts.forEach(function (q, i) { if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.stroke();
    pts.forEach(function (q, i) { ctx.fillStyle = i === 0 ? 'rgba(245,158,11,.95)' : 'rgba(' + bpInk() + ',.85)'; ctx.beginPath(); ctx.arc(q[0], q[1], i === 0 ? 2.6 : 1.6, 0, 6.283); ctx.fill(); });
  });

  /* --------------------------------------------- close: warp to launch -- */
  $$('[data-warp]').forEach(function (b) {
    b.addEventListener('pointerenter', function () { stars.warpTo(b); });
    b.addEventListener('focus', function () { stars.warpTo(b); });
    b.addEventListener('pointerleave', function () { stars.warpTo(null); });
    b.addEventListener('blur', function () { stars.warpTo(null); });
  });

  /* -------------------------------------------------------------- team -- */
  var rail = $('[data-rail]');
  if (rail) {
    var prev = $('[data-rail-prev]'), next = $('[data-rail-next]');
    var stepW = function () { var c = rail.children[0]; return c ? c.getBoundingClientRect().width + parseFloat(getComputedStyle(rail).columnGap || 16) : 300; };
    var move = function (d) {
      rail.scrollBy({ left: d * stepW(), behavior: reduce ? 'auto' : 'smooth' }); sound('spin', .3);
      dispatchEvent(new CustomEvent('coet:spin', { detail: d }));   // the arrows spin the team globe too (globe.js)
    };
    function edges() { prev.disabled = rail.scrollLeft < 4; next.disabled = rail.scrollLeft > rail.scrollWidth - rail.clientWidth - 4; }
    prev.addEventListener('click', function () { move(-1); });
    next.addEventListener('click', function () { move(1); });
    [[prev, 'ArrowLeft'], [next, 'ArrowRight']].forEach(function (b) {   // holding an on-screen arrow keeps the globe turning
      var steer = function (down) { dispatchEvent(new CustomEvent('coet:steer', { detail: { key: b[1], down: down } })); };
      b[0].addEventListener('pointerdown', function () { steer(true); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (t) { b[0].addEventListener(t, function () { steer(false); }); });
    });
    rail.addEventListener('scroll', edges, { passive: true }); addEventListener('resize', edges); edges();
    var teamVisible = false;
    new IntersectionObserver(function (es) { teamVisible = es[0].isIntersecting; }, { threshold: .35 }).observe(rail.closest('section'));
    addEventListener('keydown', function (e) {
      if (!teamVisible || menuOpen || e.altKey || e.metaKey || e.ctrlKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      if (!/^Arrow/.test(e.key)) return;
      // user: "make the globe controllable by the arrows": all four arrows steer it while held (globe.js);
      // up/down only take the key while the globe can still tilt, after that the page scrolls as usual
      dispatchEvent(new CustomEvent('coet:steer', { detail: { key: e.key, down: true, event: e } }));
      if (e.repeat) { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') e.preventDefault(); return; }   // holding turns the globe, not the rail
      if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
    });
    addEventListener('keyup', function (e) { if (/^Arrow/.test(e.key)) dispatchEvent(new CustomEvent('coet:steer', { detail: { key: e.key, down: false } })); });
    addEventListener('blur', function () { dispatchEvent(new CustomEvent('coet:steer', { detail: { key: 'all', down: false } })); });
  }

  /* ------------------------------------------------------ product page --
     User 2026-10-14: the Apple product page layout. The product bar takes over from the main nav once the
     hero has scrolled away and marks the section you are in; the highlights gallery has dots and arrows. */
  var pnav = $('[data-pnav]');
  if (pnav) {
    var hero = $('.hero-reel--product'), links = $$('.pnav__links a', pnav);
    var targets = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
    var paintPnav = function () {
      document.body.classList.toggle('pnav-on', !!hero && hero.getBoundingClientRect().bottom < 70);
      var cur = -1;
      targets.forEach(function (t, i) { if (t && t.getBoundingClientRect().top < innerHeight * .4) cur = i; });
      links.forEach(function (a, i) { if (i === cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    };
    addEventListener('scroll', paintPnav, { passive: true }); paintPnav();
  }
  var phl = $('[data-phl]');
  if (phl) {
    var cards = $$('.phl__card', phl), dots = $$('[data-phl-dot]'), at = 0;
    var go = function (i) {
      i = Math.max(0, Math.min(cards.length - 1, i));
      phl.scrollTo({ left: cards[i].offsetLeft - cards[0].offsetLeft, behavior: reduce ? 'auto' : 'smooth' }); sound('spin', .25);
    };
    var paintDots = function () {
      var x = phl.scrollLeft, best = 0;
      cards.forEach(function (c, i) { if (Math.abs(c.offsetLeft - cards[0].offsetLeft - x) < Math.abs(cards[best].offsetLeft - cards[0].offsetLeft - x)) best = i; });
      at = best; dots.forEach(function (d, i) { d.setAttribute('aria-selected', String(i === at)); });
      var prev = $('[data-phl-prev]'), next = $('[data-phl-next]');
      if (prev) prev.disabled = at === 0; if (next) next.disabled = at === cards.length - 1;
    };
    dots.forEach(function (d, i) { d.addEventListener('click', function () { go(i); }); });
    var pb = $('[data-phl-prev]'), nb = $('[data-phl-next]');
    if (pb) pb.addEventListener('click', function () { go(at - 1); });
    if (nb) nb.addEventListener('click', function () { go(at + 1); });
    phl.addEventListener('scroll', paintDots, { passive: true }); paintDots();
  }

  /* --------------------------------------------------------------- FAQ -- */
  $$('.faq details').forEach(function (d) { d.addEventListener('toggle', function () { sound('spin', .2); }); });

  /* -------------------------------------------------------- work filter -- */
  var grid = $('[data-work-grid]');
  if (grid) {
    var cards = $$('.card', grid), status = $('[data-filter-status]'), empty = $('[data-empty]');
    $$('[data-filter]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = b.getAttribute('data-filter'), n = 0;
        $$('[data-filter]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        cards.forEach(function (c) { var show = f === 'All' || c.getAttribute('data-tags').split(' ').indexOf(f) > -1; c.hidden = !show; if (show) n++; });
        empty.hidden = n > 0;
        status.textContent = n + (n === 1 ? ' case study' : ' case studies') + (f === 'All' ? '' : ' in ' + f);
        sound('spin', .3);
      });
    });
  }

  /* -------------------------------------------------------- the enquiry --
     Same questions, order, choices, branch and validation as the original
     form. No server here, so the last step hands off to the live form
     instead of pretending to send. Draft persists under the original's key. */
  var form = $('[data-brief]');
  if (form) {
    var steps = $$('[data-q]', form), idx = 0;
    var btnNext = $('[data-next]', form), btnBack = $('[data-back]', form), err = $('[data-error]', form);
    var bar = $('.brief__progress', form), handoff = $('[data-handoff]', form), navRow = $('[data-nav-row]', form);
    var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, DRAFT = 'coet-enquiry-draft';
    var applies = function (s) {
      var k = s.getAttribute('data-when'); if (!k) return true;
      var c = form.querySelector('[name="' + k + '"]:checked'); return !!c && c.value === s.getAttribute('data-when-value');
    };
    var live = function () { return steps.filter(applies); };
    function answers() {
      var out = {};
      $$('input, textarea', form).forEach(function (el) {
        if (!el.name || el.type === 'file') return;
        if (el.type === 'checkbox') { (out[el.name] = out[el.name] || []); if (el.checked) out[el.name].push(el.value); }
        else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; else if (!(el.name in out)) out[el.name] = ''; }
        else out[el.name] = el.value;
      });
      return out;
    }
    function save() { store.set(DRAFT, JSON.stringify({ index: idx, answers: answers() })); }
    function restore() {
      var d; try { d = JSON.parse(store.get(DRAFT) || 'null'); } catch (e) { d = null; }
      if (!d || !d.answers) return;
      Object.keys(d.answers).forEach(function (k) {
        var v = d.answers[k];
        $$('[name="' + k + '"]', form).forEach(function (el) {
          if (el.type === 'checkbox') el.checked = Array.isArray(v) && v.indexOf(el.value) > -1;
          else if (el.type === 'radio') el.checked = el.value === v;
          else if (typeof v === 'string') el.value = v;
        });
      });
      if (Number.isInteger(d.index)) idx = Math.max(0, Math.min(d.index, live().length - 1));
    }
    function validate(s) {
      var msg = '';
      $$('input[type=text], input[type=email], input[type=url], textarea', s).forEach(function (el) {
        if (msg || el.hidden) return;
        var v = el.value.trim();
        if (el.required && !v) msg = 'Please fill this in.';
        else if (el.type === 'email' && v && !EMAIL.test(v)) msg = 'That email doesn’t look right.';
        else if (el.dataset.min && v.length < +el.dataset.min) msg = 'A sentence or two, please.';
      });
      $$('.choices[data-required="1"]', s).forEach(function (g) { if (!msg && !g.querySelector('input:checked')) msg = 'Pick an option to continue.'; });
      var other = s.querySelector('.q__other:not([hidden])');
      if (!msg && other && !other.value.trim()) msg = 'Tell us where you found us.';
      return msg;
    }
    function counters() {
      $$('textarea[data-min]', form).forEach(function (t) {
        var c = t.parentNode.querySelector('[data-counter]'), n = t.value.trim().length, m = +t.dataset.min;
        c.textContent = n < m ? 'A sentence or two, please. ' + n + '/' + m : '';
      });
    }
    function render(focus) {
      var L = live(); idx = Math.min(idx, L.length - 1);
      steps.forEach(function (s) { s.hidden = s !== L[idx]; });
      btnBack.hidden = idx === 0;
      var last = idx === L.length - 1;
      btnNext.setAttribute('aria-label', last ? 'Submit enquiry' : 'Next step');
      btnNext.innerHTML = last ? 'Submit enquiry' : 'Continue <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
      bar.style.setProperty('--fill', ((idx + 1) / L.length).toFixed(3));
      bar.setAttribute('aria-valuenow', String(idx + 1)); bar.setAttribute('aria-valuemax', String(L.length));
      err.textContent = '';
      if (focus) { var f = L[idx].querySelector('input:not([type=hidden]):not([hidden]), textarea'); if (f) f.focus({ preventScroll: true }); }
      counters();
    }
    function next() {
      var L = live(), msg = validate(L[idx]);
      if (msg) { err.textContent = msg; return; }
      if (idx < L.length - 1) { idx++; save(); render(true); sound('enter', .35); return; }
      save();
      L[idx].hidden = true; navRow.hidden = true; bar.style.setProperty('--fill', 1);
      var name = (form.querySelector('[name=name]').value || '').trim();
      $('[data-handoff-title]', form).textContent = name ? 'Thanks, ' + name + '.' : 'Thanks.';
      handoff.hidden = false; handoff.focus(); sound('frame', .35);
    }
    btnNext.addEventListener('click', next);
    btnBack.addEventListener('click', function () { if (idx > 0) { idx--; save(); render(true); } });
    $('[data-review]', form).addEventListener('click', function () { handoff.hidden = true; navRow.hidden = false; idx = 0; render(true); });
    form.addEventListener('submit', function (e) { e.preventDefault(); next(); });
    form.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'file') { e.preventDefault(); next(); } });
    form.addEventListener('input', function () { counters(); save(); err.textContent = ''; });
    form.addEventListener('change', function (e) {
      var o = form.querySelector('.q__other');
      if (o && e.target.name === o.dataset.otherFor) { o.hidden = e.target.value !== o.dataset.otherValue; if (!o.hidden) o.focus(); }
      if (e.target.matches('[data-files]')) {
        var files = Array.prototype.slice.call(e.target.files), list = $('[data-file-list]', form);
        var kept = files.slice(0, 3).filter(function (f) { return f.size <= 10485760; });
        list.textContent = kept.length ? kept.map(function (f) { return f.name; }).join(', ') : 'Up to 3 files, 10 MB each.';
        if (kept.length < files.length) err.textContent = 'Up to 3 files, 10 MB each. Some were left out.';
      }
      save();
    });
    restore(); render(false);
  }
})();

/* the voice agent: a compact pill on phones, so it never sits on top of section titles or the closing CTA */
document.addEventListener('DOMContentLoaded', function () {
  var va = document.querySelector('elevenlabs-convai');
  if (va && matchMedia('(max-width: 859px)').matches) va.setAttribute('variant', 'compact');
});
