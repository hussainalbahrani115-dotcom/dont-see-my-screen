// Tiny DOM helpers. All user/server text goes through text nodes, never
// innerHTML, so chat and names cannot inject markup.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// Trusted, static SVG markup authored in this codebase only.
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

export function mount(parent, ...children) {
  parent.replaceChildren();
  append(parent, children);
  return parent;
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtTime(at) {
  return new Date(at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
}

export function toast(text, kind = '') {
  const box = document.getElementById('toasts');
  const el = h('div', { class: `toast ${kind}`, role: 'status' }, text);
  box.append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 4200 : 3200);
}

// In-game replacement for window.confirm (styled, non-blocking).
export function ask(text, okLabel = 'تأكيد') {
  return new Promise((resolve) => {
    const done = (v) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e) => e.key === 'Escape' && done(false);
    const ok = h('button', { class: 'btn primary', type: 'button', onclick: () => done(true) }, okLabel);
    const overlay = h(
      'div',
      { class: 'overlay', style: { zIndex: 95 }, onclick: (e) => e.target === overlay && done(false) },
      h(
        'div',
        { class: 'modal', role: 'alertdialog', 'aria-modal': 'true', style: { width: 'min(440px, 100%)' } },
        text.split('\n').map((line) => h('p', {}, line)),
        h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'flex-end' } }, h('button', { class: 'btn ghost', type: 'button', onclick: () => done(false) }, 'إلغاء'), ok),
      ),
    );
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    ok.focus();
  });
}

export function fxLayer(node, ms = 2600) {
  const layer = document.getElementById('fx-layer');
  layer.append(node);
  setTimeout(() => node.remove(), ms);
}

export function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const BRAND_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 32c7-11 15-16 24-16s17 5 24 16c-7 11-15 16-24 16S15 43 8 32z" fill="none" stroke="#f5a524" stroke-width="3.5"/><circle cx="32" cy="32" r="7.5" fill="#f5a524"/><path d="M12 52L52 12" stroke="#07090d" stroke-width="8"/><path d="M12 52L52 12" stroke="#ff5a52" stroke-width="3.5" stroke-linecap="round"/></svg>`;

export function brand() {
  return h('div', { class: 'brand' }, svg(BRAND_SVG), h('span', { class: 'name' }, 'لا تشوف شاشتي'));
}
