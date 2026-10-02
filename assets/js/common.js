/* Shared by index.html and admin.html: tiers, config, CSV parsing. */
(function () {
  'use strict';

  // Tier order matters: the first tier whose `above` the score beats wins.
  // A score must be strictly greater than `above` (e.g. 95 is "awesome", 95.5 is "excellent").
  var TIERS = [
    {
      id: 'excellent', label: 'Excellent', above: 95,
      messages: [
        'Sempurna! Nilaimu nyaris menyentuh langit.',
        'Level legenda! Semua kerja kerasmu terbayar lunas.',
        'Ini bukan nilai biasa. Ini mahakarya!'
      ]
    },
    {
      id: 'awesome', label: 'Awesome', above: 90,
      messages: [
        'Mantap! Kerja kerasmu kelihatan jelas.',
        'Wah, kamu sudah di atas awan. Tinggal selangkah ke puncak!',
        'Hebat sekali! Pertahankan ritme belajarmu.'
      ]
    },
    {
      id: 'great', label: 'Great', above: 80,
      messages: [
        'Keren! Sedikit lagi tembus 90.',
        'Nilai yang solid. Kamu makin jago!',
        'Great job! Satu dorongan lagi dan kamu melesat.'
      ]
    },
    {
      id: 'good', label: 'Good', above: 75,
      messages: [
        'Bagus! Kamu sudah di jalur yang benar.',
        'Good! Fondasimu sudah kuat, tinggal dibangun lebih tinggi.',
        'Langkah yang mantap. Yuk, naik satu level lagi!'
      ]
    },
    {
      id: 'keepgoing', label: 'Keep Going', above: -Infinity,
      messages: [
        'Belum puncaknya, tapi langkahmu sudah dimulai. Yuk, kejar bareng!',
        'Setiap juara pernah ada di titik ini. Semangat terus!',
        'Nilai ini bukan akhir cerita. Bab berikutnya milikmu!'
      ]
    }
  ];

  function tierFor(score) {
    for (var i = 0; i < TIERS.length; i++) {
      if (score > TIERS[i].above) return TIERS[i];
    }
    return TIERS[TIERS.length - 1];
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function emptyMedia() {
    var media = {};
    TIERS.forEach(function (t) { media[t.id] = { gif: '', sound: '' }; });
    return media;
  }

  function normalizeConfig(raw) {
    var cfg = raw && typeof raw === 'object' ? raw : {};
    var media = emptyMedia();
    if (cfg.media) {
      TIERS.forEach(function (t) {
        var m = cfg.media[t.id] || {};
        media[t.id] = { gif: m.gif || '', sound: m.sound || '' };
      });
    }
    return {
      sheetCsvUrl: cfg.sheetCsvUrl || '',
      subjectNames: Array.isArray(cfg.subjectNames) ? cfg.subjectNames : [],
      media: media,
      version: cfg.version || ''
    };
  }

  function loadConfig() {
    return fetch('config.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function () { return {}; })
      .then(normalizeConfig);
  }

  function mediaUrl(path, version) {
    if (!path) return '';
    return version ? path + '?v=' + encodeURIComponent(version) : path;
  }

  // RFC 4180-ish CSV: quoted fields, escaped quotes, CRLF.
  function parseCSV(text) {
    var rows = [], row = [], field = '', i = 0, inQuotes = false;
    text = text.replace(/^﻿/, '');
    while (i < text.length) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (f) { return f.trim() !== ''; }); });
  }

  function normNis(v) {
    return String(v == null ? '' : v).replace(/^'/, '').replace(/\s+/g, '').toLowerCase();
  }

  function sameNis(a, b) {
    a = normNis(a); b = normNis(b);
    if (!a || !b) return false;
    if (a === b) return true;
    if (/^\d+$/.test(a) && /^\d+$/.test(b)) return a.replace(/^0+/, '') === b.replace(/^0+/, '');
    return false;
  }

  function parseScore(v) {
    var s = String(v == null ? '' : v).trim().replace(',', '.');
    if (s === '' || isNaN(Number(s))) return null;
    return Number(s);
  }

  /*
   * Turn sheet rows into students. Supported layouts:
   *  1. Long with subject column:  NIS | Nama | Mapel | Nilai     (one row per subject)
   *  2. Wide:                      NIS | Nama | Matematika | IPA  (one row per student)
   *  3. Long without subject:      NIS | Nama | Nilai             (one row per subject;
   *                                names from config.subjectNames, else "Mapel 1", "Mapel 2")
   */
  function buildStudents(rows, config) {
    if (!rows.length) throw new Error('Sheet kosong.');
    var header = rows[0].map(function (h) { return h.trim(); });
    var lower = header.map(function (h) { return h.toLowerCase(); });
    var find = function (test) { for (var i = 0; i < lower.length; i++) if (test(lower[i])) return i; return -1; };

    var nisCol = find(function (h) { return /\bnis\b|nisn/.test(h); });
    var nameCol = find(function (h) { return h.indexOf('nama') === 0 || h === 'name'; });
    var subjectCol = find(function (h) { return /mapel|mata pelajaran|pelajaran|subject/.test(h); });
    if (nisCol < 0) throw new Error('Kolom "NIS" tidak ditemukan di baris pertama sheet.');
    if (nameCol < 0) throw new Error('Kolom "Nama" tidak ditemukan di baris pertama sheet.');

    var ignore = [nisCol, nameCol, subjectCol];
    var otherCols = [];
    lower.forEach(function (h, i) {
      if (ignore.indexOf(i) < 0 && h && !/kelas|class|keterangan|catatan/.test(h)) otherCols.push(i);
    });
    var scoreCol = find(function (h) { return h === 'nilai' || h === 'score'; });

    var layout;
    if (subjectCol >= 0 && scoreCol >= 0) layout = 'long-subject';
    else if (otherCols.length >= 2) layout = 'wide';
    else if (scoreCol >= 0 || otherCols.length === 1) { layout = 'long'; if (scoreCol < 0) scoreCol = otherCols[0]; }
    else throw new Error('Kolom "Nilai" tidak ditemukan di baris pertama sheet.');

    var byNis = {}, order = [];
    rows.slice(1).forEach(function (r) {
      var nis = (r[nisCol] || '').trim().replace(/^'/, '');
      if (!nis) return;
      var key = normNis(nis);
      if (!byNis[key]) { byNis[key] = { nis: nis, name: (r[nameCol] || '').trim(), subjects: [] }; order.push(key); }
      var st = byNis[key];
      if (!st.name && r[nameCol]) st.name = r[nameCol].trim();

      if (layout === 'wide') {
        otherCols.forEach(function (ci) {
          var sc = parseScore(r[ci]);
          if (sc !== null) st.subjects.push({ name: header[ci].replace(/^nilai\s+/i, ''), score: sc });
        });
      } else {
        var sc = parseScore(r[scoreCol]);
        if (sc === null) return;
        var n = st.subjects.length;
        var subj = layout === 'long-subject' ? (r[subjectCol] || '').trim() : '';
        if (!subj) subj = (config.subjectNames && config.subjectNames[n]) || ('Mapel ' + (n + 1));
        st.subjects.push({ name: subj, score: sc });
      }
    });

    return {
      layout: layout,
      students: order.map(function (k) { return byNis[k]; }).filter(function (s) { return s.subjects.length; })
    };
  }

  function findStudent(students, nis) {
    for (var i = 0; i < students.length; i++) if (sameNis(students[i].nis, nis)) return students[i];
    return null;
  }

  function loadStudents(config) {
    var url = config.sheetCsvUrl || 'sample.csv';
    var bust = url.indexOf('?') >= 0 ? '&_=' : '?_=';
    return fetch(url + bust + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('Gagal mengambil data (HTTP ' + r.status + ').'); return r.text(); })
      .then(function (text) {
        if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Link sheet bukan CSV. Pakai link "Publikasikan ke web" dengan format CSV.');
        var result = buildStudents(parseCSV(text), config);
        result.demo = !config.sheetCsvUrl;
        return result;
      });
  }

  window.PN = {
    TIERS: TIERS,
    tierFor: tierFor,
    pick: pick,
    emptyMedia: emptyMedia,
    normalizeConfig: normalizeConfig,
    loadConfig: loadConfig,
    mediaUrl: mediaUrl,
    parseCSV: parseCSV,
    buildStudents: buildStudents,
    findStudent: findStudent,
    loadStudents: loadStudents
  };
})();
