/* ============================================================
   DRAGDROP — HTML5 drag-and-drop reordering for the favorites grid.

   Key design: use e.currentTarget (always the card) rather than
   tracking _overEl for the drop target. dragleave uses relatedTarget
   to ignore moves between a card and its own children, which would
   otherwise clear the drop target prematurely and break the drop.
   ============================================================ */
window.DragDrop = (() => {

  let _draggingEl = null;
  let _container  = null;
  let _onReorder  = null;

  /* ---- Event handlers ------------------------------------- */

  function onDragStart(e) {
    _draggingEl = e.currentTarget;
    _draggingEl.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', _draggingEl.dataset.id);
  }

  function onDragEnd() {
    if (_draggingEl) _draggingEl.classList.remove('is-dragging');
    _draggingEl = null;
    // Clear any lingering drag-over highlights
    _container?.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const card = e.currentTarget;
    if (card === _draggingEl) return;
    // Highlight this card as the drop target
    _container?.querySelectorAll('.drag-over').forEach(el => {
      if (el !== card) el.classList.remove('drag-over');
    });
    card.classList.add('drag-over');
  }

  function onDragLeave(e) {
    // relatedTarget is where the cursor is going. If it's still inside
    // this card (a child element), ignore the event — it's a false leave.
    if (e.currentTarget.contains(e.relatedTarget)) return;
    e.currentTarget.classList.remove('drag-over');
  }

  function onDrop(e) {
    e.preventDefault();
    // Use currentTarget — reliable even if cursor is over a child element
    const targetCard = e.currentTarget;
    targetCard.classList.remove('drag-over');

    if (!_draggingEl || _draggingEl === targetCard || !_container) return;

    // Reorder in DOM for instant visual feedback
    const cards    = [..._container.querySelectorAll('[data-id]')];
    const fromIdx  = cards.indexOf(_draggingEl);
    const toIdx    = cards.indexOf(targetCard);
    if (fromIdx === -1 || toIdx === -1) return;

    if (fromIdx < toIdx) {
      targetCard.after(_draggingEl);
    } else {
      targetCard.before(_draggingEl);
    }

    // Collect the new order and persist it
    const newOrder = [..._container.querySelectorAll('[data-id]')].map(el => el.dataset.id);
    if (_onReorder) _onReorder(newOrder);
  }

  /* ---- Per-card setup ------------------------------------- */

  function attachCard(el) {
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart',  onDragStart);
    el.addEventListener('dragend',    onDragEnd);
    el.addEventListener('dragover',   onDragOver);
    el.addEventListener('dragleave',  onDragLeave);
    el.addEventListener('drop',       onDrop);
  }

  function detachCard(el) {
    el.removeAttribute('draggable');
    el.removeEventListener('dragstart',  onDragStart);
    el.removeEventListener('dragend',    onDragEnd);
    el.removeEventListener('dragover',   onDragOver);
    el.removeEventListener('dragleave',  onDragLeave);
    el.removeEventListener('drop',       onDrop);
  }

  /* ---- Public API ----------------------------------------- */

  return {
    init(container, onReorder) {
      _container = container;
      _onReorder = onReorder;
      container.querySelectorAll('[data-id]').forEach(attachCard);
    },

    destroy(container) {
      if (container) {
        container.querySelectorAll('[data-id]').forEach(detachCard);
      }
      _draggingEl = null;
      _container  = null;
      _onReorder  = null;
    },
  };
})();
