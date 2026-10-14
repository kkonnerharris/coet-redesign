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
     The original's rules: on by default, remembered when off, silent until
     the first interaction, every cue answers an action, off under reduced
     motion. Uses the original site's own sound files. */
  var soundOn = store.get('coet-sound') !== 'off' && !reduce;
  var actx = null, master = null, buffers = {}, armed = false;
  function arm() {
    if (armed || reduce) return; armed = true;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    actx = new AC();
    master = actx.createBiquadFilter(); master.type = 'lowpass'; master.frequency.value = 1300; master.Q.value = .4;   // mellow: round off every bright edge
    var mg = actx.createGain(); mg.gain.value = .75; master.connect(mg).connect(actx.destination);
    ['spin', 'enter', 'frame'].forEach(function (n) {
      fetch('/coet-redesign/assets/sfx/' + n + '.wav').then(function (r) { return r.arrayBuffer(); })
        .then(function (b) { return actx.decodeAudioData(b); })
        .then(function (buf) { buffers[n] = buf; }).catch(function () {});
    });
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (e) { addEventListener(e, arm, { once: true, passive: true }); });
  function sound(name, gain) {
    if (!soundOn || !actx || !buffers[name]) return;
    if (actx.state === 'suspended') actx.resume();
    var src = actx.createBufferSource(), g = actx.createGain();
    src.buffer = buffers[name]; src.playbackRate.value = .7; g.gain.value = (gain == null ? .5 : gain) * .55;
    src.connect(g).connect(master); src.start();
  }
  $$('[data-sound-toggle]').forEach(function (b) {
    function paint() { paintSound(); }
    if (reduce) { b.disabled = true; b.title = 'Sound is off while reduced motion is on'; }
    paint();
    b.addEventListener('click', function () {
      if (soundOn && !air) { setTimeout(function () { bed(); paintSound(); sound('spin', .3); }, 60); return; }   // first press starts sound, it does not mute it
      soundOn = !soundOn; store.set('coet-sound', soundOn ? 'on' : 'off');
      sound('spin', .3); bed(); paintSound();
    });
  });

  /* scroll sound (user: "it still needs to have scroll sound"): air that follows scroll speed, and a
     quiet detent tick every stretch of page, pitched up a little when the scroll is fast.
     Water by Tap Water (user: "by tap water water sound"): a trickle and drips synthesised here, no
     file, fading in as that project plate comes into view. Both obey the toggle and reduced motion. */
  var air = null, water = null, noiseBuf = null, waterLevel = 0, vel = 0;
  function paintSound() {   // browsers stay silent until a tap, so until then the button offers to play
    $$('[data-sound-toggle]').forEach(function (o) {
      o.setAttribute('aria-pressed', String(soundOn && !!air));
      o.querySelector('span').textContent = !soundOn ? 'Sound off' : air ? 'Sound on' : 'Play sound';
    });
  }
  function noise() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
    var d = noiseBuf.getChannelData(0), last = 0;
    for (var i = 0; i < d.length; i++) { var w = Math.random() * 2 - 1; last = (last + .02 * w) / 1.02; d[i] = last * 3.5 + w * .15; }   // brown-ish
    return noiseBuf;
  }
  function loopNoise(freq, q) {
    var s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noise(); s.loop = true; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0;
    s.connect(f).connect(g).connect(master); s.start();
    return { g: g, f: f };
  }
  function bed() {   // the continuous layers exist only once audio is armed and sound is on
    if (!actx || !soundOn || air) { if (air && !soundOn) { air.g.gain.setTargetAtTime(0, actx.currentTime, .05); water.g.gain.setTargetAtTime(0, actx.currentTime, .1); } return; }
    air = loopNoise(220, .5); water = loopNoise(420, .8); air.f.type = 'lowpass'; water.f.type = 'lowpass';
  }
  var NOTES = [110, 130.81, 146.83, 164.81, 196, 220];   // A minor pentatonic, an octave down (user: "change sound to a lower tone")
  function chime(gain) {   // a soft bell: two sines, slow bloom, long tail
    if (!soundOn || !actx) return;
    var t = actx.currentTime, f = NOTES[Math.floor(Math.random() * NOTES.length)], g = actx.createGain();
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .03); g.gain.exponentialRampToValueAtTime(.0001, t + 1.6);
    [[f, 1], [f * 2, .4]].forEach(function (h) { var o = actx.createOscillator(), og = actx.createGain(); o.type = 'sine'; o.frequency.value = h[0]; og.gain.value = h[1];
      o.connect(og).connect(g); o.start(t); o.stop(t + 1.7); });
    g.connect(master);
  }
  function tickOf(rate, gain) {
    if (!soundOn || !actx || !buffers.spin) return;
    var src = actx.createBufferSource(), g = actx.createGain();
    src.buffer = buffers.spin; src.playbackRate.value = rate; g.gain.value = gain;
    src.connect(g).connect(master); src.start();
  }
  function drop(gain, lo) {   // a water drop: a sine that chirps upward as the bubble closes
    var t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(), f = lo + Math.random() * lo;
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (1.6 + Math.random() * .5), t + .07 + Math.random() * .04);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + .16);
    o.connect(g).connect(master); o.start(t); o.stop(t + .18);
  }
  if (!reduce) {
    ['click', 'keydown', 'touchend'].forEach(function (e) { addEventListener(e, function () { setTimeout(function () { bed(); paintSound(); }, 50); }, { once: true, passive: true }); });
    var lastY = scrollY, lastT = performance.now(), run = 0, waterEls = $$('[data-water]');
    addEventListener('scroll', function () {
      var now = performance.now(), dy = Math.abs(scrollY - lastY), dt = Math.max(16, now - lastT);
      lastY = scrollY; lastT = now; vel = Math.min(1, dy / dt / 4);   // ~4 px/ms is a hard fling
      run += dy;
      if (run > 420) { run = 0; chime(.022 + vel * .018); }
    }, { passive: true });
    (function airLoop() {   // air eases toward scroll speed, then settles
      requestAnimationFrame(airLoop);
      if (!air || !soundOn) return;
      air.g.gain.setTargetAtTime(vel * .05, actx.currentTime, .35);
      air.f.frequency.setTargetAtTime(180 + vel * 300, actx.currentTime, .4);
      vel *= .94;
      waterLevel = 0;
      waterEls.forEach(function (el) {   // how much of the Tap Water plate is on screen
        var r = el.getBoundingClientRect(), vis = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / Math.max(1, Math.min(r.height, innerHeight));
        waterLevel = Math.max(waterLevel, Math.min(1, vis * 1.3));
      });
      water.g.gain.setTargetAtTime(waterLevel * .055, actx.currentTime, .6);
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
  window.COETAudio = function () { return { state: actx && actx.state, on: soundOn, air: !!air, water: waterLevel }; };

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
    var move = function (d) { rail.scrollBy({ left: d * stepW(), behavior: reduce ? 'auto' : 'smooth' }); sound('spin', .3); };
    function edges() { prev.disabled = rail.scrollLeft < 4; next.disabled = rail.scrollLeft > rail.scrollWidth - rail.clientWidth - 4; }
    prev.addEventListener('click', function () { move(-1); });
    next.addEventListener('click', function () { move(1); });
    rail.addEventListener('scroll', edges, { passive: true }); addEventListener('resize', edges); edges();
    var teamVisible = false;
    new IntersectionObserver(function (es) { teamVisible = es[0].isIntersecting; }, { threshold: .35 }).observe(rail.closest('section'));
    addEventListener('keydown', function (e) {
      if (!teamVisible || menuOpen || e.altKey || e.metaKey || e.ctrlKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
    });
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
      btnNext.innerHTML = last ? 'Submit enquiry' : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
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
