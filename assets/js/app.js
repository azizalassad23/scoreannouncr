/* Student page: look up NIS, reveal each subject with GIF + sound + confetti. */
(function () {
  'use strict';

  var PN = window.PN;
  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var el = {
    demo: $('demo-banner'),
    form: $('lookup-form'), input: $('nis-input'), lookupBtn: $('lookup-btn'), hint: $('lookup-hint'),
    lookup: $('screen-lookup'), reveal: $('screen-reveal'), summary: $('screen-summary'),
    greetName: $('greet-name'), greetSub: $('greet-sub'), steps: $('steps'),
    flip: $('flip'), front: $('card-front'), back: $('card-back'),
    frontSubject: $('front-subject'), backSubject: $('back-subject'),
    orb: $('score-orb'), num: $('score-num'), badge: $('tier-badge'), msg: $('tier-msg'),
    media: $('media'), mediaImg: $('media-img'),
    nextBtn: $('next-btn'), summaryBtn: $('summary-btn'), doneBtn: $('done-btn'), doneReplayBtn: $('done-replay-btn'),
    summaryName: $('summary-name'), summaryMeta: $('summary-meta'), summaryList: $('summary-list'),
    replayBtn: $('replay-btn'), againBtn: $('again-btn'),
    sound: $('sound-toggle'), confetti: $('confetti')
  };

  var announcer = document.createElement('p');
  announcer.className = 'sr-only';
  announcer.setAttribute('aria-live', 'polite');
  document.body.appendChild(announcer);

  var state = { config: null, students: [], student: null, results: [], step: 0, busy: false, audio: {}, playing: null, format: null, readyHint: '' };

  /* ---------- Sound on/off ---------- */
  var muted = false;
  try { muted = localStorage.getItem('pn-muted') === '1'; } catch (e) {}
  function renderMute() {
    el.sound.setAttribute('aria-pressed', String(!muted));
    el.sound.setAttribute('aria-label', muted ? 'Suara: mati' : 'Suara: nyala');
  }
  el.sound.addEventListener('click', function () {
    muted = !muted;
    try { localStorage.setItem('pn-muted', muted ? '1' : '0'); } catch (e) {}
    if (muted) stopSound();
    renderMute();
  });
  renderMute();

  /* ---------- Audio: uploaded files, synth fallback ---------- */
  var ctx = null;
  function audioCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, type, gain) {
    var c = audioCtx(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain(), t = c.currentTime + start;
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.18, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }

  var JINGLES = {
    excellent: [[523, 0], [659, .12], [784, .24], [1047, .36], [784, .52], [1047, .64], [1319, .76, .9]],
    awesome: [[659, 0], [784, .12], [988, .24], [1319, .4, .7]],
    great: [[523, 0], [659, .14], [784, .28, .6]],
    good: [[392, 0], [523, .16, .55]],
    keepgoing: [[523, 0, .35], [587, .3, .35], [659, .6, .7]]
  };

  function playJingle(tierId) {
    (JINGLES[tierId] || []).forEach(function (n) { tone(n[0], n[1], n[2] || .25, tierId === 'keepgoing' ? 'sine' : 'triangle'); });
  }

  function playDrumroll(ms) {
    var steps = 14, t = 0;
    for (var i = 0; i < steps; i++) {
      tone(140 + i * 6, t, .06, 'square', .05);
      t += (ms / 1000) / steps * (1.3 - i / steps * .6);
    }
  }

  // Called inside the click gesture so mobile browsers allow playback later.
  function primeAudio(tierIds) {
    audioCtx();
    tierIds.forEach(function (id) {
      var src = state.config.media[id].sound;
      if (!src || state.audio[id]) return;
      var a = new Audio(PN.mediaUrl(src, state.config.version));
      a.preload = 'auto';
      a.muted = true;
      var p = a.play();
      if (p && p.then) p.then(function () { a.pause(); a.currentTime = 0; a.muted = false; }).catch(function () { a.muted = false; });
      else a.muted = false;
      state.audio[id] = a;
    });
  }

  function stopSound() {
    if (state.playing) { state.playing.pause(); state.playing.currentTime = 0; state.playing = null; }
  }

  function playTierSound(tierId) {
    if (muted) return;
    stopSound();
    var a = state.audio[tierId];
    if (a) {
      a.muted = false; a.currentTime = 0;
      var p = a.play();
      state.playing = a;
      if (p && p.catch) p.catch(function () { playJingle(tierId); });
    } else {
      playJingle(tierId);
    }
  }

  /* ---------- Confetti ---------- */
  var confetti = (function () {
    var canvas = el.confetti, c2d = canvas.getContext('2d'), parts = [], raf = 0;
    function size() {
      var dpr = window.devicePixelRatio || 1;
      canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
      c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    addEventListener('resize', size); size();
    function colors() {
      var cs = getComputedStyle(document.documentElement);
      return ['--sun', '--berry', '--mint', '--sky', '--lilac', '--brand'].map(function (v) { return cs.getPropertyValue(v).trim(); });
    }
    var PLAN = { excellent: [220, 2], awesome: [160, 1], great: [110, 1], good: [70, 1], keepgoing: [45, 1] };
    function burst(tierId) {
      if (reduceMotion) return;
      var plan = PLAN[tierId] || PLAN.good, pal = colors(), gentle = tierId === 'keepgoing';
      for (var b = 0; b < plan[1]; b++) {
        setTimeout(function () {
          for (var i = 0; i < plan[0]; i++) {
            var fromLeft = Math.random() < .5;
            parts.push({
              x: gentle ? Math.random() * innerWidth : (fromLeft ? -10 : innerWidth + 10),
              y: gentle ? -20 - Math.random() * innerHeight * .4 : innerHeight * (.55 + Math.random() * .2),
              vx: gentle ? (Math.random() - .5) * 1.2 : (fromLeft ? 1 : -1) * (4 + Math.random() * 9),
              vy: gentle ? 1 + Math.random() * 1.5 : -(9 + Math.random() * 10),
              r: 5 + Math.random() * 7, rot: Math.random() * 6, vr: (Math.random() - .5) * .3,
              shape: gentle ? 0 : Math.floor(Math.random() * 3),
              color: pal[Math.floor(Math.random() * pal.length)], life: 0
            });
          }
          if (!raf) raf = requestAnimationFrame(tick);
        }, b * 450);
      }
    }
    function tick() {
      c2d.clearRect(0, 0, innerWidth, innerHeight);
      parts = parts.filter(function (p) { return p.y < innerHeight + 40 && p.life < 600; });
      parts.forEach(function (p) {
        p.life++; p.vy += .25; p.vx *= .985; if (p.vy > 4.5) p.vy = 4.5;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        c2d.save(); c2d.translate(p.x, p.y); c2d.rotate(p.rot); c2d.fillStyle = p.color;
        if (p.shape === 0) { c2d.beginPath(); c2d.arc(0, 0, p.r * .6, 0, 7); c2d.fill(); }
        else if (p.shape === 1) c2d.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        else { c2d.beginPath(); c2d.moveTo(0, -p.r * .6); c2d.lineTo(p.r * .6, p.r * .5); c2d.lineTo(-p.r * .6, p.r * .5); c2d.fill(); }
        c2d.restore();
      });
      raf = parts.length ? requestAnimationFrame(tick) : 0;
      if (!raf) c2d.clearRect(0, 0, innerWidth, innerHeight);
    }
    return { burst: burst };
  })();

  /* ---------- Helpers ---------- */
  function show(screen) {
    [el.lookup, el.reveal, el.summary].forEach(function (s) { s.hidden = s !== screen; });
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function firstName(name) {
    var w = (name || '').trim().split(/\s+/)[0] || 'Kamu';
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }

  function fmt(n) {
    return String(Math.round(n * 100) / 100).replace('.', ',');
  }

  function setHint(text, isError) {
    el.hint.textContent = text;
    el.hint.classList.toggle('pn-hint--error', !!isError);
  }

  /* ---------- Load ---------- */
  PN.loadConfig().then(function (cfg) {
    state.config = cfg;
    return PN.loadStudents(cfg);
  }).then(function (res) {
    state.students = res.students;
    state.format = PN.nisFormat(res.students);
    el.demo.hidden = !res.demo;
    el.lookupBtn.disabled = false;
    el.lookupBtn.textContent = 'Lihat Nilai';
    applyNisFormat();
    setHint(state.readyHint);
  }).catch(function (err) {
    el.lookupBtn.disabled = false;
    el.lookupBtn.textContent = 'Coba muat ulang';
    el.lookupBtn.dataset.reload = '1';
    setHint((err && err.message) || 'Data nilai gagal dimuat.', true);
  });

  // Example number in the real format that belongs to no student, e.g. "20261234".
  function exampleNis(f) {
    var fill = '1234567890123456789';
    for (var shift = 0; shift < 10; shift++) {
      var body = '';
      for (var i = f.prefix.length; i < f.length; i++) body += fill[(i - f.prefix.length + shift) % 10];
      var ex = f.prefix + body;
      if (!PN.findStudent(state.students, ex)) return ex;
    }
    return f.prefix + new Array(f.length - f.prefix.length + 1).join('x');
  }

  function applyNisFormat() {
    var f = state.format;
    if (!f) {
      el.input.placeholder = 'Ketik NIS kamu';
      state.readyHint = 'Ketik NIS kamu persis seperti di kartu pelajar.';
      return;
    }
    el.input.placeholder = 'contoh: ' + exampleNis(f);
    el.input.maxLength = f.length + 4;
    state.readyHint = 'NIS kamu terdiri dari ' + f.length + (f.digits ? ' angka' : ' karakter') + ', persis seperti di kartu pelajar.';
  }

  function checkFormat(nis) {
    var f = state.format;
    if (!f) return '';
    if (f.digits && !/^\d+$/.test(nis)) return 'NIS hanya berisi angka, tanpa huruf atau tanda baca.';
    if (nis.length < f.length) return 'NIS harus ' + f.length + ' angka. Yang kamu ketik baru ' + nis.length + ' angka.';
    if (nis.length > f.length) return 'NIS harus ' + f.length + ' angka. Yang kamu ketik ' + nis.length + ' angka, kelebihan ' + (nis.length - f.length) + '.';
    return '';
  }

  /* ---------- Lookup ---------- */
  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (el.lookupBtn.dataset.reload) { location.reload(); return; }
    var nis = el.input.value.replace(/\s+/g, '');
    el.form.classList.remove('is-error');
    if (!nis) { fail('Ketik NIS kamu dulu, ya.'); return; }
    // Format hints only when the NIS is not found, so an unusual but real NIS still works.
    var st = PN.findStudent(state.students, nis);
    if (!st) { fail(checkFormat(nis) || 'NIS ' + nis + ' belum ketemu. Cek lagi angkanya, ya.'); return; }

    state.student = st;
    state.results = st.subjects.map(function (s) {
      var t = PN.tierFor(s.score);
      return { subject: s.name, score: s.score, tier: t, message: PN.pick(t.messages) };
    });
    primeAudio(state.results.map(function (r) { return r.tier.id; }));
    startReveal();
  });

  function fail(text) {
    setHint(text, true);
    void el.form.offsetWidth;
    el.form.classList.add('is-error');
    el.input.focus();
  }

  /* ---------- Reveal ---------- */
  function startReveal() {
    var n = state.results.length;
    el.greetName.textContent = firstName(state.student.name) + '!';
    el.greetSub.textContent = n > 1 ? 'Ada ' + n + ' nilai yang menunggu dibuka. Siap?' : 'Nilai ' + state.results[0].subject + ' kamu sudah menunggu. Siap?';
    el.steps.hidden = n < 2;
    el.steps.innerHTML = '';
    state.results.forEach(function (r) {
      var li = document.createElement('li');
      li.textContent = r.subject;
      el.steps.appendChild(li);
    });
    show(el.reveal);
    renderStep(0);
  }

  function renderStep(i) {
    state.step = i;
    state.busy = false;
    stopSound();
    var r = state.results[i];
    Array.prototype.forEach.call(el.steps.children, function (li, k) {
      li.classList.toggle('is-current', k === i);
      li.classList.toggle('is-done', k < i);
      if (k < i) li.setAttribute('data-tier', state.results[k].tier.id); else li.removeAttribute('data-tier');
    });
    el.flip.classList.remove('is-flipped', 'is-rumbling');
    el.flip.removeAttribute('data-tier');
    el.front.inert = false;
    el.back.inert = true;
    el.frontSubject.textContent = r.subject;
    el.backSubject.textContent = r.subject;
    el.num.textContent = '0';
    var len = fmt(r.score).length;
    el.orb.classList.toggle('is-long', len === 3 || len === 4);
    el.orb.classList.toggle('is-xlong', len >= 5);
    el.badge.classList.remove('is-in');
    el.badge.textContent = r.tier.label;
    el.msg.textContent = '';
    el.media.hidden = true;
    el.mediaImg.removeAttribute('src');
    el.nextBtn.hidden = true;
    el.summaryBtn.hidden = true;
    el.doneBtn.hidden = true;
    el.doneReplayBtn.hidden = true;
    el.front.focus({ preventScroll: true });
  }

  el.front.addEventListener('click', function () {
    if (state.busy) return;
    state.busy = true;
    audioCtx();
    var r = state.results[state.step];
    var media = state.config.media[r.tier.id];

    if (media.gif) el.mediaImg.src = PN.mediaUrl(media.gif, state.config.version); // start loading during the drumroll
    var rumble = reduceMotion ? 0 : 1000;
    if (rumble) {
      el.flip.classList.add('is-rumbling');
      if (!muted) playDrumroll(rumble);
    }
    setTimeout(function () {
      el.flip.classList.remove('is-rumbling');
      el.flip.setAttribute('data-tier', r.tier.id);
      el.flip.classList.add('is-flipped');
      el.front.inert = true;
      el.back.inert = false;
      setTimeout(function () { countUp(r); }, reduceMotion ? 0 : 450);
    }, rumble);
  });

  function countUp(r) {
    var dur = reduceMotion ? 0 : 1100, t0 = performance.now();
    function frame(now) {
      var p = dur ? Math.min(1, (now - t0) / dur) : 1;
      var eased = 1 - Math.pow(1 - p, 3);
      var v = r.score * eased;
      el.num.textContent = p < 1 ? String(Math.round(v)) : fmt(r.score);
      if (p < 1) requestAnimationFrame(frame); else celebrate(r);
    }
    requestAnimationFrame(frame);
  }

  function celebrate(r) {
    el.badge.classList.add('is-in');
    el.msg.textContent = r.message;
    if (el.mediaImg.getAttribute('src')) {
      el.mediaImg.alt = 'Animasi perayaan ' + r.tier.label;
      el.media.hidden = false;
    }
    playTierSound(r.tier.id);
    confetti.burst(r.tier.id);
    announcer.textContent = r.subject + ': ' + fmt(r.score) + ', ' + r.tier.label + '. ' + r.message;

    var last = state.step === state.results.length - 1;
    var single = state.results.length === 1;
    el.nextBtn.hidden = last;
    el.summaryBtn.hidden = !last || single;
    el.doneBtn.hidden = !single;
    el.doneReplayBtn.hidden = !single;
    state.busy = false;
  }

  el.nextBtn.addEventListener('click', function () {
    renderStep(state.step + 1);
    el.flip.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  });

  el.summaryBtn.addEventListener('click', function () {
    stopSound();
    el.summaryName.textContent = state.student.name || firstName('');
    el.summaryMeta.textContent = 'NIS ' + state.student.nis + ' · ' + state.results.length + ' mapel';
    el.summaryList.innerHTML = '';
    state.results.forEach(function (r) {
      var li = document.createElement('li');
      li.className = 'summary__item';
      li.setAttribute('data-tier', r.tier.id);
      var score = document.createElement('span');
      score.className = 'summary__score';
      score.textContent = fmt(r.score);
      if (score.textContent.length >= 4) score.classList.add('is-long');
      var info = document.createElement('div');
      var subj = document.createElement('p');
      subj.className = 'summary__subject';
      subj.textContent = r.subject;
      var badge = document.createElement('span');
      badge.className = 'pn-badge';
      badge.textContent = r.tier.label;
      info.appendChild(subj); info.appendChild(badge);
      li.appendChild(score); li.appendChild(info);
      el.summaryList.appendChild(li);
    });
    show(el.summary);
  });

  el.replayBtn.addEventListener('click', function () {
    show(el.reveal);
    renderStep(0);
  });

  el.doneReplayBtn.addEventListener('click', function () { renderStep(0); });
  el.doneBtn.addEventListener('click', function () { el.againBtn.click(); });

  el.againBtn.addEventListener('click', function () {
    stopSound();
    state.student = null;
    state.results = [];
    el.input.value = '';
    el.form.classList.remove('is-error');
    setHint(state.readyHint);
    show(el.lookup);
    el.input.focus({ preventScroll: true });
  });
})();
