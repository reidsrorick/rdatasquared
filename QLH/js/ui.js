const UI = {
  // Escape HTML to prevent injection
  esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  // Toast notification
  toast(msg, type, duration) {
    duration = duration || 3000;
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .3s';
      t.style.opacity    = '0';
      setTimeout(function () { t.remove(); }, 300);
    }, duration);
  },

  // Modal helpers
  showModal(html) {
    document.getElementById('modal-backdrop').classList.remove('hidden');
    const c = document.getElementById('modal-container');
    c.classList.remove('hidden');
    c.innerHTML = html;
  },

  hideModal() {
    document.getElementById('modal-backdrop').classList.add('hidden');
    const c = document.getElementById('modal-container');
    c.classList.add('hidden');
    c.innerHTML = '';
  },

  // Apply theme to <html>
  applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // system
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  },

  // Google favicon proxy — works when online; silently fails when offline
  faviconUrl(url) {
    try {
      const host = new URL(url).hostname;
      return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=32';
    } catch (e) { return ''; }
  },

  // Category color lookup
  catColor(name, categories) {
    const c = categories.find(function (c) { return c.name === name; });
    return c ? c.color : '#94a3b8';
  },

  // Simple relative time
  ago(iso) {
    if (!iso) return '';
    const d = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (d < 60)   return 'just now';
    if (d < 3600) return Math.floor(d / 60) + 'm ago';
    if (d < 86400) return Math.floor(d / 3600) + 'h ago';
    return Math.floor(d / 86400) + 'd ago';
  },
};
