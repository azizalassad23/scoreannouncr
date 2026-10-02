/* Teacher panel: edit config.json and upload tier media to the GitHub repo via the Contents API. */
(function () {
  'use strict';

  var PN = window.PN;
  var $ = function (id) { return document.getElementById(id); };
  var MAX_BYTES = 20 * 1024 * 1024;
  var EXT = { gif: ['gif', 'webp', 'png', 'jpg', 'jpeg'], sound: ['mp3', 'wav', 'ogg', 'm4a'] };
  var STORE_KEY = 'pn-admin';

  var gh = { owner: '', repo: '', branch: 'main', token: '', connected: false };
  var config = PN.normalizeConfig({});
  var pending = {};           // pending[tierId][kind] = File | 'clear'
  var slots = {};             // slots[tierId][kind] = { root, img|audio, state }

  /* ---------- Storage ---------- */
  function readStore() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { return {}; } }
  function writeStore(obj) { try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (e) {} }

  /* ---------- Status helpers ---------- */
  function status(id, text, kind) {
    var n = $(id);
    n.textContent = text;
    n.classList.toggle('pn-hint--error', kind === 'error');
    n.classList.toggle('is-ok', kind === 'ok');
  }
  function log(text, isErr) {
    var li = document.createElement('li');
    li.textContent = text;
    if (isErr) li.className = 'is-err';
    $('save-log').appendChild(li);
  }

  /* ---------- GitHub API ---------- */
  function api(method, path, body) {
    return fetch('https://api.github.com' + path, {
      method: method,
      headers: {
        'Authorization': 'Bearer ' + gh.token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) {
          var err = new Error((data && data.message) || ('HTTP ' + r.status));
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }
  function repoPath(p) {
    return '/repos/' + encodeURIComponent(gh.owner) + '/' + encodeURIComponent(gh.repo) + '/contents/' +
      p.split('/').map(encodeURIComponent).join('/');
  }
  function getFile(p) {
    return api('GET', repoPath(p) + '?ref=' + encodeURIComponent(gh.branch))
      .catch(function (e) { if (e.status === 404) return null; throw e; });
  }
  function putFile(p, base64, message) {
    return getFile(p).then(function (existing) {
      var body = { message: message, content: base64, branch: gh.branch };
      if (existing && existing.sha) body.sha = existing.sha;
      return api('PUT', repoPath(p), body);
    });
  }

  function bytesToBase64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function textToBase64(text) { return bytesToBase64(new TextEncoder().encode(text)); }
  function base64ToText(b64) {
    var bin = atob(b64.replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1] || ''); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- Connection ---------- */
  function guessRepo() {
    var host = location.hostname;
    if (!/\.github\.io$/i.test(host)) return null;
    var owner = host.split('.')[0];
    var seg = location.pathname.split('/').filter(Boolean)[0];
    var repo = seg && !/\.html?$/i.test(seg) ? seg : owner + '.github.io';
    return { owner: owner, repo: repo };
  }

  function readGhInputs() {
    gh.owner = $('gh-owner').value.trim();
    gh.repo = $('gh-repo').value.trim();
    gh.branch = $('gh-branch').value.trim() || 'main';
    gh.token = $('gh-token').value.trim();
  }

  function connect() {
    readGhInputs();
    if (!gh.owner || !gh.repo || !gh.token) { status('gh-status', 'Isi pemilik, nama repo, dan token.', 'error'); return; }
    status('gh-status', 'Menghubungkan…');
    $('gh-connect').disabled = true;
    api('GET', '/repos/' + encodeURIComponent(gh.owner) + '/' + encodeURIComponent(gh.repo))
      .then(function (repo) {
        if (repo.permissions && repo.permissions.push === false) throw new Error('Token tidak punya izin menulis ke repo ini.');
        var store = { owner: gh.owner, repo: gh.repo, branch: gh.branch };
        if ($('gh-remember').checked) store.token = gh.token;
        writeStore(store);
        return getFile('config.json');
      })
      .then(function (file) {
        if (file && file.content) {
          try { config = PN.normalizeConfig(JSON.parse(base64ToText(file.content))); }
          catch (e) { throw new Error('config.json di repo bukan JSON yang valid.'); }
        }
        gh.connected = true;
        fillForm();
        status('gh-status', 'Terhubung ke ' + gh.owner + '/' + gh.repo + ' (' + gh.branch + ').', 'ok');
        refreshSave();
      })
      .catch(function (e) {
        gh.connected = false;
        var msg = e.status === 401 ? 'Token ditolak GitHub. Cek lagi tokennya.' :
          e.status === 404 ? 'Repo tidak ditemukan, atau token tidak punya akses ke repo ini.' : e.message;
        status('gh-status', msg, 'error');
        refreshSave();
      })
      .then(function () { $('gh-connect').disabled = false; });
  }

  $('gh-connect').addEventListener('click', connect);
  $('gh-forget').addEventListener('click', function () {
    var store = readStore(); delete store.token; writeStore(store);
    $('gh-token').value = ''; $('gh-remember').checked = false;
    gh.token = ''; gh.connected = false;
    status('gh-status', 'Token dihapus dari browser ini.');
    refreshSave();
  });

  /* ---------- Sheet ---------- */
  function subjectNamesInput() {
    return $('subject-names').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  var LAYOUT_NAMES = {
    'long-subject': 'satu baris per mapel (ada kolom Mapel)',
    'wide': 'satu baris per siswa (mapel sebagai kolom)',
    'long': 'satu baris per mapel (tanpa kolom Mapel)'
  };

  $('sheet-test').addEventListener('click', function () {
    var url = $('sheet-url').value.trim();
    status('sheet-status', 'Membaca…');
    PN.loadStudents({ sheetCsvUrl: url, subjectNames: subjectNamesInput() })
      .then(function (res) {
        var s = res.students;
        if (!s.length) { status('sheet-status', 'Sheet terbaca, tapi tidak ada baris siswa dengan nilai.', 'error'); return; }
        var ex = s[0];
        var counts = {};
        s.forEach(function (st) { counts[st.subjects.length] = (counts[st.subjects.length] || 0) + 1; });
        var countText = Object.keys(counts).map(function (k) { return counts[k] + ' siswa × ' + k + ' mapel'; }).join(', ');
        status('sheet-status',
          (res.demo ? '[Demo] ' : '') + 'Terbaca ' + s.length + ' siswa (' + countText + '). Format: ' + LAYOUT_NAMES[res.layout] +
          '. Contoh: ' + ex.name + ' (' + ex.nis + ') ' + ex.subjects.map(function (x) { return x.name + ' ' + x.score; }).join(', ') + '.', 'ok');
      })
      .catch(function (e) {
        var msg = e && e.message === 'Failed to fetch' ? 'Link tidak bisa dibuka. Pastikan sheet sudah dipublikasikan ke web sebagai CSV.' : (e && e.message);
        status('sheet-status', msg || 'Gagal membaca sheet.', 'error');
      });
  });

  /* ---------- Tier media ---------- */
  function rangeText(i) {
    var t = PN.TIERS[i];
    if (i === PN.TIERS.length - 1) return PN.TIERS[i - 1].above + ' ke bawah';
    if (i === 0) return 'di atas ' + t.above;
    return 'di atas ' + t.above + ' s/d ' + PN.TIERS[i - 1].above;
  }

  function buildTiers() {
    var tpl = $('tier-tpl'), wrap = $('tiers');
    PN.TIERS.forEach(function (t, i) {
      var node = tpl.content.firstElementChild.cloneNode(true);
      node.setAttribute('data-tier', t.id);
      node.querySelector('.tier__badge').textContent = t.label;
      node.querySelector('.tier__range').textContent = rangeText(i);
      var slotEls = node.querySelectorAll('.slot');
      slots[t.id] = {
        gif: { root: slotEls[0], media: slotEls[0].querySelector('img'), state: slotEls[0].querySelector('.slot__state') },
        sound: { root: slotEls[1], media: slotEls[1].querySelector('audio'), state: slotEls[1].querySelector('.slot__state') }
      };
      slots[t.id].gif.media.alt = 'GIF tier ' + t.label;
      node.querySelectorAll('input[type=file]').forEach(function (inp) {
        inp.addEventListener('change', function () { onPick(t.id, inp.getAttribute('data-kind'), inp); });
      });
      node.querySelectorAll('[data-clear]').forEach(function (btn) {
        btn.addEventListener('click', function () { setPending(t.id, btn.getAttribute('data-clear'), 'clear'); });
      });
      wrap.appendChild(node);
    });
  }

  function onPick(tierId, kind, input) {
    var file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (EXT[kind].indexOf(ext) < 0) { alert('Format .' + ext + ' tidak didukung. Pakai: ' + EXT[kind].join(', ')); return; }
    if (file.size > MAX_BYTES) { alert('File terlalu besar (' + (file.size / 1048576).toFixed(1) + ' MB). Maksimal 20 MB.'); return; }
    setPending(tierId, kind, file);
  }

  function setPending(tierId, kind, value) {
    pending[tierId] = pending[tierId] || {};
    var current = config.media[tierId][kind];
    if (value === 'clear' && !current) delete pending[tierId][kind];
    else pending[tierId][kind] = value;
    renderSlot(tierId, kind);
    refreshSave();
  }

  function renderSlot(tierId, kind) {
    var s = slots[tierId][kind];
    var p = pending[tierId] && pending[tierId][kind];
    var src = '', note = '';
    if (s.objectUrl) { URL.revokeObjectURL(s.objectUrl); s.objectUrl = null; }
    if (p instanceof File) {
      s.objectUrl = URL.createObjectURL(p);
      src = s.objectUrl;
      note = 'Baru: ' + p.name + ' (belum disimpan)';
    } else if (p === 'clear') {
      note = 'Akan dikosongkan (belum disimpan)';
    } else if (config.media[tierId][kind]) {
      src = PN.mediaUrl(config.media[tierId][kind], config.version);
      note = config.media[tierId][kind];
    }
    if (src) s.media.src = src; else s.media.removeAttribute('src');
    if (kind === 'sound') s.media.load();
    s.root.classList.toggle('has-file', !!src);
    s.root.classList.toggle('is-pending', !!p);
    s.state.textContent = note;
  }

  function fillForm(resetPending) {
    $('sheet-url').value = config.sheetCsvUrl;
    $('subject-names').value = config.subjectNames.join(', ');
    if (resetPending) pending = {};
    PN.TIERS.forEach(function (t) { renderSlot(t.id, 'gif'); renderSlot(t.id, 'sound'); });
  }

  function hasPendingMedia() {
    return Object.keys(pending).some(function (k) { return Object.keys(pending[k]).length; });
  }

  function refreshSave() {
    $('save-btn').disabled = !gh.connected;
    if (!gh.connected) status('save-status', 'Hubungkan GitHub dulu untuk menyimpan.');
    else if (hasPendingMedia()) status('save-status', 'Ada perubahan yang belum disimpan.');
    else status('save-status', 'Siap menyimpan.');
  }

  /* ---------- Save ---------- */
  $('save-btn').addEventListener('click', function () {
    if (!gh.connected) return;
    var btn = $('save-btn');
    btn.disabled = true;
    $('save-log').innerHTML = '';
    status('save-status', 'Menyimpan… jangan tutup halaman ini.');

    var next = JSON.parse(JSON.stringify(config));
    next.sheetCsvUrl = $('sheet-url').value.trim();
    next.subjectNames = subjectNamesInput();

    var jobs = [];
    PN.TIERS.forEach(function (t) {
      ['gif', 'sound'].forEach(function (kind) {
        var p = pending[t.id] && pending[t.id][kind];
        if (p === 'clear') next.media[t.id][kind] = '';
        else if (p instanceof File) jobs.push({ tier: t, kind: kind, file: p });
      });
    });

    var chain = Promise.resolve();
    jobs.forEach(function (job) {
      chain = chain.then(function () {
        var ext = job.file.name.split('.').pop().toLowerCase();
        var path = 'media/' + job.tier.id + (job.kind === 'sound' ? '-sound' : '') + '.' + ext;
        log('Mengunggah ' + (job.kind === 'gif' ? 'GIF' : 'suara') + ' ' + job.tier.label + '…');
        return fileToBase64(job.file)
          .then(function (b64) { return putFile(path, b64, 'Update ' + job.kind + ' for tier ' + job.tier.id); })
          .then(function () { next.media[job.tier.id][job.kind] = path; log('OK: ' + path); });
      });
    });

    chain.then(function () {
      next.version = String(Date.now());
      log('Menyimpan config.json…');
      return putFile('config.json', textToBase64(JSON.stringify(next, null, 2) + '\n'), 'Update announcement config');
    }).then(function () {
      config = PN.normalizeConfig(next);
      fillForm(true);
      log('Selesai.');
      status('save-status', 'Tersimpan. Halaman siswa ter-update dalam ±1 menit (setelah GitHub Pages selesai build).', 'ok');
    }).catch(function (e) {
      log('Gagal: ' + e.message, true);
      status('save-status', 'Sebagian gagal disimpan. File yang sudah OK tetap tersimpan. Coba lagi.', 'error');
    }).then(function () { btn.disabled = !gh.connected; });
  });

  window.addEventListener('beforeunload', function (e) {
    if (hasPendingMedia()) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- Init ---------- */
  buildTiers();
  var store = readStore(), guess = guessRepo();
  $('gh-owner').value = store.owner || (guess && guess.owner) || '';
  $('gh-repo').value = store.repo || (guess && guess.repo) || '';
  $('gh-branch').value = store.branch || 'main';
  if (store.token) { $('gh-token').value = store.token; $('gh-remember').checked = true; }

  PN.loadConfig().then(function (cfg) {
    config = cfg;
    fillForm();
    refreshSave();
    if (store.token) connect();
  });
})();
