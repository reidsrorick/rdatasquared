/* ==========================================================================
   ecb-canvas.js — the ECB penguin, live. Take an image, reduce it to one
   grayscale byte per pixel, and encrypt those bytes three ways with the SAME
   real AES key (via Web Crypto): ECB, CBC, CTR. Re-interpret each ciphertext
   as pixels.

   ECB encrypts every 16-byte block independently, so identical plaintext
   blocks -> identical ciphertext blocks. A flat region of the picture is a run
   of identical bytes, so it stays a flat (garbled) region: the SHAPE SURVIVES.
   Correct cipher, correct key, catastrophic result. CBC and CTR chain/■counter
   the blocks, so the same flat region turns to noise — that is the contrast.

   The image is drawn at a width that is a multiple of 16 so each pixel row is
   block-aligned, which keeps the ECB effect crisp.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.ecbCanvas = (function () {
  "use strict";
  const SIZE = 144; // 144 grayscale bytes per row = 9 AES blocks, perfectly aligned

  function drawPenguin(ctx) {
    // hard, flat fills = large runs of identical bytes = a clean ECB result
    ctx.fillStyle = "#c9c9c9"; ctx.fillRect(0, 0, SIZE, SIZE);           // background
    ctx.fillStyle = "#1a1a1a";                                          // body
    ctx.beginPath(); ctx.ellipse(72, 78, 42, 56, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(72, 34, 26, 28, 0, 0, Math.PI * 2); ctx.fill(); // head
    ctx.fillStyle = "#f2f2f2";                                          // belly
    ctx.beginPath(); ctx.ellipse(72, 84, 26, 42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f2f2f2";                                          // eyes (whites)
    ctx.beginPath(); ctx.ellipse(62, 30, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(82, 30, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1a1a1a";                                          // pupils
    ctx.beginPath(); ctx.arc(63, 32, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(81, 32, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e8a13a";                                          // beak
    ctx.beginPath(); ctx.moveTo(72, 36); ctx.lineTo(64, 44); ctx.lineTo(80, 44); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(58, 128); ctx.lineTo(74, 128); ctx.lineTo(66, 138); ctx.closePath(); ctx.fill(); // feet
    ctx.beginPath(); ctx.moveTo(70, 128); ctx.lineTo(86, 128); ctx.lineTo(78, 138); ctx.closePath(); ctx.fill();
  }

  /** RGBA imageData -> one grayscale byte per pixel (length SIZE*SIZE). */
  function toGray(imageData) {
    const d = imageData.data;
    const out = new Uint8Array(imageData.width * imageData.height);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      // luma; also snap toward flat values so regions stay identical
      out[p] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
    }
    return out;
  }

  /** grayscale bytes -> ImageData for a canvas. */
  function toImageData(ctx, gray) {
    const img = ctx.createImageData(SIZE, SIZE);
    for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = gray[p];
      img.data[i + 3] = 255;
    }
    return img;
  }

  function mount(root) {
    root.innerHTML =
      '<div class="controls">' +
        '<button id="ecb-penguin" type="button">Use the penguin</button>' +
        '<label class="btn secondary" for="ecb-file" style="cursor:pointer">Upload an image…' +
          '<input id="ecb-file" type="file" accept="image/*" class="visually-hidden"></label>' +
        '<button id="ecb-run" type="button">Encrypt all three</button>' +
      '</div>' +
      '<div class="canvas-row">' +
        '<figure class="canvas-cell"><canvas id="c-src" width="' + SIZE + '" height="' + SIZE + '"></canvas><figcaption>plaintext image</figcaption></figure>' +
        '<figure class="canvas-cell canvas-cell--break"><canvas id="c-ecb" width="' + SIZE + '" height="' + SIZE + '"></canvas><figcaption>AES-ECB — shape survives</figcaption></figure>' +
        '<figure class="canvas-cell"><canvas id="c-cbc" width="' + SIZE + '" height="' + SIZE + '"></canvas><figcaption>AES-CBC — noise</figcaption></figure>' +
        '<figure class="canvas-cell"><canvas id="c-ctr" width="' + SIZE + '" height="' + SIZE + '"></canvas><figcaption>AES-CTR — noise</figcaption></figure>' +
      '</div>' +
      '<p class="output" id="ecb-status" role="status" aria-live="polite"></p>';

    const srcCtx = root.querySelector("#c-src").getContext("2d");
    const ecbCtx = root.querySelector("#c-ecb").getContext("2d");
    const cbcCtx = root.querySelector("#c-cbc").getContext("2d");
    const ctrCtx = root.querySelector("#c-ctr").getContext("2d");
    const status = root.querySelector("#ecb-status");
    let gray = null;

    function loadPenguin() {
      drawPenguin(srcCtx);
      gray = toGray(srcCtx.getImageData(0, 0, SIZE, SIZE));
      status.textContent = "Penguin loaded. Press “Encrypt all three”.";
    }

    function loadFile(file) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        srcCtx.fillStyle = "#c9c9c9"; srcCtx.fillRect(0, 0, SIZE, SIZE);
        // contain-fit into the square
        const s = Math.min(SIZE / img.width, SIZE / img.height);
        const w = img.width * s, h = img.height * s;
        srcCtx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
        gray = toGray(srcCtx.getImageData(0, 0, SIZE, SIZE));
        URL.revokeObjectURL(url);
        status.textContent = "Image loaded. Press “Encrypt all three”.";
      };
      img.src = url;
    }

    async function run() {
      if (!gray) { loadPenguin(); }
      if (!C101.aes.available) { status.textContent = "Web Crypto unavailable here — cannot run AES."; return; }
      status.textContent = "Encrypting with one real AES-128 key, three modes…";
      const key = await C101.aes.randomKeyBytes(128);

      const ecb = await C101.aes.ecbEncrypt(key, gray);
      const cbc = (await C101.aes.cbcEncrypt(key, gray)).ciphertext;
      const ctr = (await C101.aes.ctrEncrypt(key, gray)).ciphertext;

      ecbCtx.putImageData(toImageData(ecbCtx, ecb.subarray(0, SIZE * SIZE)), 0, 0);
      cbcCtx.putImageData(toImageData(cbcCtx, cbc.subarray(0, SIZE * SIZE)), 0, 0);
      ctrCtx.putImageData(toImageData(ctrCtx, ctr.subarray(0, SIZE * SIZE)), 0, 0);
      status.textContent =
        "Same key, same AES. ECB leaked the picture because identical blocks encrypt identically. " +
        "CBC and CTR did not. This is why ECB must never be used for real data.";
    }

    root.querySelector("#ecb-penguin").addEventListener("click", loadPenguin);
    root.querySelector("#ecb-file").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
    });
    root.querySelector("#ecb-run").addEventListener("click", run);

    loadPenguin();
    // auto-run once so the effect is visible on arrival
    run();
  }

  return { mount, SIZE };
})();
