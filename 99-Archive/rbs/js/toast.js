// Tiny flash-message bus. notify() from anywhere; <ToastHost/> renders them.

import { html, useState, useEffect } from './vendor/preact-htm.js';

const listeners = new Set();
let items = [];
let seq = 0;

export function notify(text, kind = 'success', ms = 3500) {
  const id = ++seq;
  items = [...items, { id, text, kind }];
  emit();
  if (ms) setTimeout(() => dismiss(id), ms);
  return id;
}

export function dismiss(id) {
  items = items.filter((i) => i.id !== id);
  emit();
}

function emit() {
  for (const l of listeners) l(items);
}

export function ToastHost() {
  const [list, setList] = useState(items);
  useEffect(() => {
    listeners.add(setList);
    return () => listeners.delete(setList);
  }, []);
  if (!list.length) return null;
  return html`
    <div class="flash-container" style="position:fixed;top:16px;right:16px;z-index:400;max-width:360px">
      ${list.map((t) => html`
        <div key=${t.id} class="flash flash-${t.kind}" onClick=${() => dismiss(t.id)} style="cursor:pointer">
          ${t.text}
        </div>`)}
    </div>`;
}
