/* ==========================================================================
   cribdrag-ui.js — the interactive front-end for the two-time-pad attack.
   Given XORED = P1 ⊕ P2 (the key already cancelled), the analyst drags a crib
   word along it. Each candidate offset is scored by how English the revealed
   window looks. Clicking an offset "commits" the crib to message A there and
   shows the corresponding slice of message B it exposes.
   ========================================================================== */
window.C101 = window.C101 || {};
C101.cribdragUI = (function () {
  "use strict";
  const B = C101.bytes;
  const CD = C101.cribdrag;

  function mount(opts) {
    const root = opts.rootEl;
    let xored = opts.xored;

    root.innerHTML =
      '<div class="controls">' +
        '<div class="field" style="flex:2 1 14rem"><label for="crib">Crib — a word you expect in one message</label>' +
          '<input id="crib" type="text" value=" the " autocomplete="off"></div>' +
        '<button id="dragbtn" type="button">Drag it across</button>' +
      '</div>' +
      '<p class="note">Rows are sorted by how much readable text the crib exposes. A high-scoring row means the crib ' +
        'probably sits under message&nbsp;A there — and the revealed text is message&nbsp;B. Click a row to commit it.</p>' +
      '<div class="grid-surface"><div id="cribrows"></div></div>' +
      '<div class="panel" id="commit" hidden><div class="panel__label"><span>Committed guess</span></div>' +
        '<div id="commit-body" class="mono"></div></div>';

    const cribEl = root.querySelector("#crib");
    const rowsEl = root.querySelector("#cribrows");
    const commit = root.querySelector("#commit");
    const commitBody = root.querySelector("#commit-body");

    function drag() {
      const crib = cribEl.value;
      if (!crib) { rowsEl.innerHTML = '<p class="note">Type a crib.</p>'; return; }
      const results = CD.dragCrib(xored, crib).slice(0, 12);
      rowsEl.innerHTML = "";
      results.forEach(function (r) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "cribrow";
        row.style.width = "100%";
        row.style.textAlign = "left";
        row.style.background = "transparent";
        row.style.border = "0";
        row.style.boxShadow = "none";
        row.style.cursor = "pointer";
        const cls = r.score > 0.85 ? "hit" : r.score > 0.5 ? "readable" : "noise";
        row.innerHTML =
          '<span class="cribrow__pos">@' + r.offset + " · " + Math.round(r.score * 100) + "%</span>" +
          '<span class="cribtext"><span class="' + cls + '">' + escapeHtml(r.revealed) + "</span></span>";
        row.addEventListener("click", function () { commitCrib(r.offset, crib); });
        rowsEl.appendChild(row);
      });
    }

    function commitCrib(offset, crib) {
      const other = CD.revealOther(xored, offset, crib);
      let otherStr = "";
      for (let i = 0; i < other.length; i++) otherStr += B.printable(other[i]);
      commit.hidden = false;
      commitBody.innerHTML =
        'At offset <b>' + offset + '</b>:<br>' +
        'message&nbsp;A  =  &ldquo;<span style="background:var(--mark-wash)">' + escapeHtml(crib) + '</span>&rdquo;<br>' +
        'message&nbsp;B  =  &ldquo;<span style="background:var(--mark-wash)">' + escapeHtml(otherStr) + '</span>&rdquo;<br>' +
        '<span class="note">Both messages revealed at once, with no key. Extend the crib and slide again to grow the plaintext.</span>';
    }

    function escapeHtml(s) {
      return s.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; });
    }

    root.querySelector("#dragbtn").addEventListener("click", drag);
    cribEl.addEventListener("keydown", function (e) { if (e.key === "Enter") drag(); });

    function setXored(x) { xored = x; commit.hidden = true; drag(); }
    drag();
    return { setXored };
  }

  return { mount };
})();
