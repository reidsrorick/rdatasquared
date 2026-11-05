/* ==========================================================================
   histogram.js — a live A..Z frequency histogram of the ciphertext with the
   English baseline drawn over it as a dashed red line. Watching the ciphertext
   bars refuse to flatten (substitution) — or actually flatten (Vigenère/OTP) —
   is the visual heart of the frequency-analysis lesson.
   Usage:  C101.histogram.mount(containerEl); then .update(text)
   ========================================================================== */
window.C101 = window.C101 || {};
C101.histogram = (function () {
  "use strict";
  const E = C101.english;

  function mount(container) {
    container.innerHTML =
      '<div class="histo__legend">' +
        '<span><span class="swatch swatch--cipher"></span>ciphertext</span>' +
        '<span><span class="swatch swatch--english"></span>English baseline</span>' +
      '</div>' +
      '<div class="histo" role="img" aria-label="Letter frequency histogram"></div>' +
      '<div class="histo__labels"></div>';
    const histo = container.querySelector(".histo");
    const labels = container.querySelector(".histo__labels");

    // Fixed y-scale so bars are comparable across texts. English max is E ~13%.
    const MAX = 14;
    E.LETTERS.forEach(function (L) {
      const col = document.createElement("div");
      col.className = "histo__col";
      const bar = document.createElement("div");
      bar.className = "histo__bar";
      const base = document.createElement("div");
      base.className = "histo__base";
      base.style.bottom = (E.FREQ[L] / MAX * 100) + "%";
      col.appendChild(bar);
      col.appendChild(base);
      histo.appendChild(col);
      const lab = document.createElement("div");
      lab.textContent = L;
      labels.appendChild(lab);
    });

    function update(text) {
      const p = E.percentages(text);
      const cols = histo.querySelectorAll(".histo__col");
      E.LETTERS.forEach(function (L, i) {
        const bar = cols[i].querySelector(".histo__bar");
        bar.style.height = Math.min(100, p[L] / MAX * 100) + "%";
        cols[i].setAttribute("title", L + ": " + p[L].toFixed(1) + "% (English " + E.FREQ[L] + "%)");
      });
    }
    return { update };
  }

  return { mount };
})();
