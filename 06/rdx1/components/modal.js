export function openModal(contentHTML, { onConfirm, onCancel, wide = false } = {}) {
  const existing = document.getElementById('rdx-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'rdx-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box${wide ? ' modal-wide' : ''}">
      ${contentHTML}
    </div>
  `;

  overlay.addEventListener('click', e => {
    if (e.target === overlay) close(onCancel);
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('modal-visible'));

  const firstInput = overlay.querySelector('input, textarea, select');
  if (firstInput) setTimeout(() => firstInput.focus(), 80);

  function close(cb) {
    overlay.classList.remove('modal-visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    if (cb) cb();
  }

  overlay.querySelector('[data-modal-confirm]')?.addEventListener('click', () => close(onConfirm));
  overlay.querySelector('[data-modal-cancel]')?.addEventListener('click', () => close(onCancel));
  overlay.querySelectorAll('[data-modal-close]').forEach(el =>
    el.addEventListener('click', () => close(onCancel))
  );

  return { close: (cb) => close(cb) };
}
