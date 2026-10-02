/* Teacher panel: printable QR code with an image in the middle. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('qr-canvas'), ctx = canvas.getContext('2d');
  var customLogo = null;
  var W = 1000;               // poster width in px
  var LOGO_RATIO = 0.22;      // logo box width relative to the QR; safe with error correction level H

  function status(text, isError) {
    var n = $('qr-status');
    n.textContent = text;
    n.classList.toggle('pn-hint--error', !!isError);
  }

  function defaultUrl() {
    if (/\.github\.io$/i.test(location.hostname)) {
      return location.origin + location.pathname.replace(/admin\.html$/i, '');
    }
    var owner = $('gh-owner').value.trim(), repo = $('gh-repo').value.trim();
    if (owner && repo) {
      return /\.github\.io$/i.test(repo) ? 'https://' + repo + '/' : 'https://' + owner.toLowerCase() + '.github.io/' + repo + '/';
    }
    return location.href.replace(/admin\.html.*$/i, '');
  }

  function luminance(hex) {
    var v = hex.replace('#', '');
    var c = [0, 2, 4].map(function (i) {
      var x = parseInt(v.substr(i, 2), 16) / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawDefaultLogo(x, y, s) {
    ctx.save();
    ctx.translate(x + s / 2, y + s / 2);
    ctx.rotate(-6 * Math.PI / 180);
    roundRect(-s / 2, -s / 2, s, s, s * 0.22);
    ctx.fillStyle = '#ff6b35';
    ctx.fill();
    ctx.lineWidth = s * 0.06;
    ctx.strokeStyle = '#22193a';
    ctx.stroke();
    ctx.fillStyle = '#22193a';
    ctx.font = '700 ' + Math.round(s * 0.46) + 'px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A+', 0, s * 0.03);
    ctx.restore();
  }

  function drawImageContain(img, x, y, s) {
    var r = Math.min(s / img.naturalWidth, s / img.naturalHeight);
    var w = img.naturalWidth * r, h = img.naturalHeight * r;
    ctx.save();
    roundRect(x, y, s, s, s * 0.14);
    ctx.clip();
    ctx.drawImage(img, x + (s - w) / 2, y + (s - h) / 2, w, h);
    ctx.restore();
  }

  function fitText(text, maxWidth, size, weight, family) {
    do {
      ctx.font = weight + ' ' + size + 'px ' + family;
      if (ctx.measureText(text).width <= maxWidth) break;
      size -= 2;
    } while (size > 16);
    return size;
  }

  function render() {
    if (typeof window.qrcode !== 'function') {
      status('Library QR gagal dimuat. Cek koneksi internet lalu muat ulang halaman.', true);
      return;
    }
    var url = $('qr-url').value.trim();
    var caption = $('qr-caption').value.trim();
    var color = $('qr-color').value || '#22193a';
    var mode = document.querySelector('input[name="qr-logo"]:checked').value;
    $('qr-upload-label').hidden = mode !== 'custom';

    if (!url) { status('Isi link halaman siswa dulu.', true); return; }

    var qr;
    try {
      qr = window.qrcode(0, 'H');
      qr.addData(url);
      qr.make();
    } catch (e) {
      status('Link terlalu panjang untuk dibuat QR.', true);
      return;
    }

    var n = qr.getModuleCount();
    var quiet = 4;
    var mod = Math.floor((W - 120) / (n + quiet * 2));
    var qrPx = mod * (n + quiet * 2);
    var top = 60, side = (W - qrPx) / 2;
    var captionH = caption ? 150 : 0;
    var H = top + qrPx + captionH + 70;

    canvas.width = W;
    canvas.height = H;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = color;
    var ox = side + quiet * mod, oy = top + quiet * mod;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(ox + c * mod, oy + r * mod, mod, mod);
      }
    }

    if (mode !== 'none' && (mode === 'default' || customLogo)) {
      var box = Math.round(n * mod * LOGO_RATIO);
      var bx = ox + (n * mod - box) / 2, by = oy + (n * mod - box) / 2;
      roundRect(bx, by, box, box, box * 0.2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      var pad = box * 0.12, inner = box - pad * 2;
      if (mode === 'default') drawDefaultLogo(bx + pad, by + pad, inner);
      else drawImageContain(customLogo, bx + pad, by + pad, inner);
    }

    var textY = top + qrPx + 10;
    if (caption) {
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      fitText(caption, W - 120, 64, '700', 'Fredoka, Nunito, sans-serif');
      ctx.fillText(caption, W / 2, textY);
      textY += 96;
    }
    ctx.fillStyle = '#5f5676';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var shortUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    fitText(shortUrl, W - 120, 30, '600', 'Nunito, sans-serif');
    ctx.fillText(shortUrl, W / 2, textY);

    if (luminance(color) > 0.35) status('Warna terlalu terang. QR bisa sulit di-scan; pilih warna yang lebih gelap.', true);
    else if (mode === 'custom' && !customLogo) status('Pilih gambar untuk bagian tengah.');
    else status('QR siap. Tes scan dengan HP sebelum dicetak.');
  }

  var timer = 0;
  function schedule() { clearTimeout(timer); timer = setTimeout(render, 120); }

  ['qr-url', 'qr-caption', 'qr-color'].forEach(function (id) { $(id).addEventListener('input', schedule); });
  document.querySelectorAll('input[name="qr-logo"]').forEach(function (r) { r.addEventListener('change', render); });

  $('qr-logo-file').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () { customLogo = img; render(); };
      img.onerror = function () { status('Gambar tidak bisa dibaca. Coba PNG atau JPG.', true); };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });

  $('qr-download').addEventListener('click', function () {
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'qr-pengumuman-nilai.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }, 'image/png');
  });

  $('qr-print').addEventListener('click', function () {
    var img = $('print-img');
    img.onload = function () { window.print(); };
    img.src = canvas.toDataURL('image/png');
  });

  $('qr-url').value = defaultUrl();
  render();
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('700 64px Fredoka'), document.fonts.load('600 30px Nunito')]).then(render, render);
  }
})();
