/* ============================================================
   XFit — сканер штрихкодів і QR-кодів камерою телефона.
   Chrome/Android: вбудований BarcodeDetector. Safari/iPhone та інші:
   бібліотека ZXing (js/vendor), завантажується лише при першому скануванні.
   Використання: const stop = await XFitScanner.start(video, ['ean_13'], (code) => …);
   ============================================================ */
(function (root) {
  const ZXING_SRC = 'js/vendor/zxing-library-0.21.3.min.js';
  const ZX_FORMATS = { ean_13: 'EAN_13', qr_code: 'QR_CODE', code_128: 'CODE_128' };
  let zxingLoad = null;

  function loadZXing() {
    if (root.ZXing) return Promise.resolve();
    if (!zxingLoad) {
      zxingLoad = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = ZXING_SRC;
        s.onload = resolve;
        s.onerror = () => { zxingLoad = null; reject(new Error('scanner_load')); };
        document.head.appendChild(s);
      });
    }
    return zxingLoad;
  }

  async function nativeSupports(formats) {
    if (!('BarcodeDetector' in root)) return false;
    try {
      const supported = await root.BarcodeDetector.getSupportedFormats();
      return formats.every((f) => supported.includes(f));
    } catch (e) {
      return false;
    }
  }

  // Повертає функцію зупинки камери. onCode може викликатися кілька разів — зупиняє той, хто викликав.
  async function start(video, formats, onCode) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no_camera');
    video.setAttribute('playsinline', '');
    video.muted = true;
    const native = await nativeSupports(formats);
    if (!native) await loadZXing();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
    });
    video.srcObject = stream;
    try { await video.play(); } catch (e) { /* вже відтворюється */ }

    // Розпізнавання одного кадру: вбудований детектор або ZXing (TRY_HARDER читає й повернутий штрихкод)
    let detect;
    if (native) {
      const detector = new root.BarcodeDetector({ formats });
      detect = async () => {
        const codes = await detector.detect(video);
        return codes.length ? codes[0].rawValue : null;
      };
    } else {
      const Z = root.ZXing;
      const hints = new Map();
      hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, formats.map((f) => Z.BarcodeFormat[ZX_FORMATS[f]]));
      hints.set(Z.DecodeHintType.TRY_HARDER, true);
      const reader = new Z.MultiFormatReader();
      reader.setHints(hints);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      detect = async () => {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return null;
        // зменшуємо великий кадр — швидше, а для штрихкоду вистачає
        const k = Math.min(1, 960 / Math.max(w, h));
        canvas.width = Math.round(w * k);
        canvas.height = Math.round(h * k);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
          return reader.decode(bitmap, hints).getText();
        } catch (e) {
          return null; // у кадрі немає коду
        } finally {
          reader.reset();
        }
      };
    }

    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try {
        const code = await detect();
        if (code && alive) onCode(code);
      } catch (e) { /* кадр не розпізнано */ }
      if (alive) setTimeout(tick, 150);
    };
    tick();
    return () => {
      alive = false;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }

  // Зрозуміле повідомлення про помилку камери
  function errorText(err) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'Немає дозволу на камеру. Дозволь доступ у налаштуваннях браузера або введи цифри вручну.';
    if (name === 'NotFoundError' || (err && err.message === 'no_camera')) return 'Камеру не знайдено. Введи цифри під штрихкодом вручну.';
    if (err && err.message === 'scanner_load') return 'Не вдалося завантажити сканер. Перевір інтернет або введи цифри вручну.';
    return 'Не вдалося запустити камеру. Введи цифри під штрихкодом вручну.';
  }

  root.XFitScanner = { start, errorText };
})(window);
