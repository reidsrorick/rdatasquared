/* ==========================================================================
   mapping-board.js — the manual substitution-cracking board. THE centrepiece
   of the site's thesis: 26! keys, and you break it here with your hands, using
   nothing but the letter statistics.

   The board lists the 26 ciphertext letters ordered most→least frequent (the
   natural order of attack). For each, you type your guess for the plaintext
   letter it stands for. A live decode view shows the message resolving as you
   go, and conflicts (two cipher letters mapped to the same plaintext) are
   flagged. A "seed from frequencies" button fills a first pass automatically —
   the machine gets you ~60% there with ZERO keyspace search, and you finish by
   reading English.

   Typing (not dragging) is the primary interaction so the board is fully
   keyboard-operable; each cell is a labelled text input.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.mappingBoard = (function () {
  "use strict";
  const F = C101.frequency;

  function mount(opts) {
    const board = opts.boardEl;
    const decodeEl = opts.decodeEl;
    const statusEl = opts.statusEl;
    let cipher = "";
    let map = {}; // cipherLetter -> guessed plaintext (uppercase)

    function render() {
      // cells sorted by ciphertext frequency, descending
      const order = F.ranked(cipher).filter(function (r) { return r.pct > 0; });
      board.innerHTML = "";
      order.forEach(function (r) {
        const cell = document.createElement("div");
        cell.className = "mapcell";
        const id = "map-" + r.letter;
        cell.innerHTML =
          '<label class="mapcell__cipher" for="' + id + '">' +
            r.letter + ' <span aria-hidden="true">·</span> ' + r.pct.toFixed(1) + '%</label>';
        const input = document.createElement("input");
        input.id = id;
        input.type = "text";
        input.maxLength = 1;
        input.setAttribute("inputmode", "latin");
        input.setAttribute("aria-label",
          "plaintext guess for ciphertext letter " + r.letter +
          " (appears " + r.pct.toFixed(1) + " percent)");
        input.value = map[r.letter] || "";
        input.addEventListener("input", function () {
          const v = input.value.toUpperCase().replace(/[^A-Z]/g, "");
          input.value = v;
          if (v) map[r.letter] = v; else delete map[r.letter];
          paint();
          // auto-advance to next cell for quick data entry
          if (v) {
            const inputs = board.querySelectorAll("input");
            for (let i = 0; i < inputs.length - 1; i++) {
              if (inputs[i] === input) { inputs[i + 1].focus(); break; }
            }
          }
        });
        cell.appendChild(input);
        board.appendChild(cell);
      });
      paint();
    }

    function paint() {
      // flag conflicts: same plaintext letter used for two cipher letters
      const used = {};
      Object.keys(map).forEach(function (c) {
        const g = map[c];
        (used[g] = used[g] || []).push(c);
      });
      const inputs = board.querySelectorAll("input");
      inputs.forEach(function (input) {
        const cipherLetter = input.id.slice(4);
        const g = map[cipherLetter];
        const cell = input.parentElement;
        cell.classList.toggle("mapcell--locked", !!g && used[g].length === 1);
        cell.style.outline = (g && used[g].length > 1) ? "2px solid var(--break)" : "";
      });
      renderDecode();
    }

    function renderDecode() {
      // render decoded text: mapped letters as "fixed", unmapped as "open"
      decodeEl.innerHTML = "";
      for (let i = 0; i < cipher.length; i++) {
        const ch = cipher[i];
        const up = ch.toUpperCase();
        const span = document.createElement("span");
        if (up >= "A" && up <= "Z") {
          const g = map[up];
          if (g) { span.className = "fixed"; span.textContent = (ch === up) ? g : g.toLowerCase(); }
          else   { span.className = "open"; span.textContent = "·"; }
        } else {
          span.textContent = ch;
        }
        decodeEl.appendChild(span);
      }
      if (statusEl) {
        const mapped = Object.keys(map).length;
        statusEl.textContent = mapped + " of 26 letters assigned. " +
          "Read the highlighted text; where it looks like English, you're right.";
      }
    }

    function setCipher(text) { cipher = text; map = {}; render(); }
    function seedFromFrequencies() {
      map = F.frequencySeedMap(cipher);
      render();
    }
    function clear() { map = {}; render(); }
    function getMap() { return Object.assign({}, map); }

    return { setCipher, seedFromFrequencies, clear, getMap };
  }

  return { mount };
})();
