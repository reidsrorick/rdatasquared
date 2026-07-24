/* ==========================================================================
   bitflip.js — CTR malleability, made physical. In counter mode the cipher is
   C = P ⊕ keystream, exactly like a one-time pad whose pad comes from AES. So
   flipping ciphertext bit i flips plaintext bit i on decryption — and NOTHING
   ELSE. The attacker never learns the key, never learns the keystream, yet
   edits the message at will.

   We encrypt a known-format message with REAL AES-CTR (Web Crypto). Because we
   know both P and C we can display the keystream = C ⊕ P and let the user
   toggle ciphertext bits; the "receiver's" decryption C' ⊕ keystream updates
   live. This is the whole malleability lesson in your hands.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.bitflip = (function () {
  "use strict";
  const B = C101.bytes;

  async function mount(opts) {
    const root = opts.rootEl;
    const plaintext = opts.plaintext || "role=guest;admin=0";
    const targetByte = opts.targetByte;   // index the hint flips
    const targetBit = (opts.targetBit == null) ? 7 : opts.targetBit; // LSB by default

    if (!C101.aes.available) { root.innerHTML = '<p class="output">Web Crypto unavailable here — cannot run AES-CTR.</p>'; return; }

    const P = B.strToBytes(plaintext);
    const key = await C101.aes.randomKeyBytes(128);
    const { counter, ciphertext } = await C101.aes.ctrEncrypt(key, P);
    const C = ciphertext.slice(0, P.length);
    const keystream = B.xorBytes(C, P); // = the AES keystream over these bytes
    const tampered = C.slice();          // attacker's working copy

    root.innerHTML =
      '<p class="note">Sender encrypted <span class="mono">&ldquo;' + escapeHtml(plaintext) + '&rdquo;</span> with real ' +
        'AES-CTR. You are the attacker on the wire: you have the ciphertext bits below and <b>not</b> the key. ' +
        'Click any bit to flip it.</p>' +
      '<div class="controls">' +
        (targetByte != null ? '<button id="bf-target" type="button">Flip the exact bit that turns admin=0 into admin=1</button>' : '') +
        '<button id="bf-reset" type="button" class="secondary">Reset ciphertext</button>' +
      '</div>' +
      '<div class="grid-surface" style="overflow-x:auto"><div id="bf-grid" style="display:flex;gap:6px;min-width:min-content"></div></div>' +
      '<div class="panel"><div class="panel__label"><span>What the receiver decrypts (ciphertext ⊕ keystream)</span></div>' +
        '<div class="output output--big" id="bf-dec" aria-live="polite"></div></div>';

    const grid = root.querySelector("#bf-grid");
    const decEl = root.querySelector("#bf-dec");

    function renderGrid() {
      grid.innerHTML = "";
      for (let byteIdx = 0; byteIdx < tampered.length; byteIdx++) {
        const col = document.createElement("div");
        col.style.textAlign = "center";
        col.style.fontFamily = "var(--font-mono)";
        const decChar = tampered[byteIdx] ^ keystream[byteIdx];
        const orig = P[byteIdx];
        const changed = decChar !== orig;
        const head = document.createElement("div");
        head.textContent = B.printable(decChar);
        head.style.fontSize = "var(--step-1)";
        head.style.color = changed ? "var(--break)" : "var(--ink)";
        head.style.background = changed ? "var(--break-wash)" : "transparent";
        col.appendChild(head);
        const bitsStr = B.byteToBits(tampered[byteIdx]);
        for (let bit = 0; bit < 8; bit++) {
          const cell = document.createElement("button");
          cell.type = "button";
          cell.className = "bit";
          cell.textContent = bitsStr[bit];
          const flippedFromOrig = ((tampered[byteIdx] ^ C[byteIdx]) >> (7 - bit)) & 1;
          if (flippedFromOrig) cell.classList.add("bit--flipped");
          cell.setAttribute("aria-label",
            "ciphertext byte " + byteIdx + " bit " + bit + ", currently " + bitsStr[bit] + ". Activate to flip.");
          cell.addEventListener("click", function () {
            tampered[byteIdx] ^= (1 << (7 - bit));
            renderGrid(); renderDec();
          });
          col.appendChild(cell);
        }
        grid.appendChild(col);
      }
    }

    function renderDec() {
      let s = "";
      for (let i = 0; i < tampered.length; i++) s += B.printable(tampered[i] ^ keystream[i]);
      decEl.textContent = s;
    }

    function escapeHtml(s) { return s.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

    const targetBtn = root.querySelector("#bf-target");
    if (targetBtn) targetBtn.addEventListener("click", function () {
      tampered[targetByte] ^= (1 << (7 - targetBit));
      renderGrid(); renderDec();
    });
    root.querySelector("#bf-reset").addEventListener("click", function () {
      tampered.set(C); renderGrid(); renderDec();
    });

    renderGrid(); renderDec();
  }

  return { mount };
})();
