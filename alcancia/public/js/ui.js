/* Piezas de interfaz reutilizables: modal, confirmación, avisos, tooltip, selectores y campos de dinero. */
window.A = window.A || {};

A.ui = (() => {
  const { esc } = A.u;
  let closeCurrent = null;

  /**
   * Abre un formulario modal.
   * opts: { title, body (html), submitLabel, onSubmit(data, form) → false para no cerrar,
   *         onDelete?, deleteLabel?, onMount?(form), wide?, extraButtons? }
   */
  function modal(opts) {
    if (closeCurrent) closeCurrent();
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop">
        <form class="modal ${opts.wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title" novalidate>
          <header class="modal-head">
            <h2 id="modal-title">${esc(opts.title)}</h2>
            <button type="button" class="icon-btn" data-close aria-label="Cerrar">✕</button>
          </header>
          <div class="modal-body">${opts.body}</div>
          <footer class="modal-foot">
            ${opts.onDelete ? `<button type="button" class="btn btn-danger-ghost" data-delete>${esc(opts.deleteLabel || 'Eliminar')}</button>` : ''}
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
            ${opts.extraButtons || ''}
            <button type="submit" class="btn btn-primary">${esc(opts.submitLabel || 'Guardar')}</button>
          </footer>
        </form>
      </div>`;
    const backdrop = root.firstElementChild;
    const form = backdrop.querySelector('form');
    const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); closeCurrent = null; };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    closeCurrent = close;
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
    form.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    const del = form.querySelector('[data-delete]');
    if (del) del.addEventListener('click', async () => { if ((await opts.onDelete()) !== false) close(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      form.querySelectorAll('.field-error').forEach((x) => x.remove());
      const data = Object.fromEntries(new FormData(form));
      data.__submitter = e.submitter ? e.submitter.value : '';
      if (opts.onSubmit(data, form) !== false) close();
    });
    initMoneyInputs(form);
    if (opts.onMount) opts.onMount(form);
    const first = form.querySelector('[autofocus]') || form.querySelector('input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea, select');
    if (first) setTimeout(() => { first.focus(); if (first.select) first.select(); }, 30);
    return { close, form };
  }

  function fieldError(form, name, msg) {
    const el = form.querySelector(`[name="${name}"]`);
    const p = document.createElement('p');
    p.className = 'field-error';
    p.textContent = msg;
    (el.closest('.field') || el.parentElement).appendChild(p);
    el.focus();
    return false;
  }

  function confirm(message, { okLabel = 'Eliminar', danger = true, title = '¿Seguro?' } = {}) {
    return new Promise((resolve) => {
      let answered = false;
      const m = modal({
        title,
        body: `<p class="confirm-text">${esc(message)}</p>`,
        submitLabel: okLabel,
        onSubmit: () => { answered = true; resolve(true); },
      });
      const btn = m.form.querySelector('[type=submit]');
      if (danger) btn.classList.replace('btn-primary', 'btn-danger');
      m.form.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { if (!answered) resolve(false); }));
      setTimeout(() => btn.focus(), 40);
    });
  }

  function toast(message, type = 'info', ms = 3800) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', 'status');
    el.textContent = message;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
  }

  // --- Tooltip global: cualquier elemento con data-tip (texto) o data-tip-html ---
  function initTooltip() {
    const tip = document.getElementById('tooltip');
    let current = null;
    const place = (e) => {
      const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
      let x = e.clientX + pad, y = e.clientY + pad;
      if (x + w > innerWidth - 8) x = e.clientX - w - pad;
      if (y + h > innerHeight - 8) y = e.clientY - h - pad;
      tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
    };
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest('[data-tip], [data-tip-html]');
      if (t === current) return;
      current = t;
      if (!t) { tip.hidden = true; return; }
      if (t.dataset.tipHtml) tip.innerHTML = t.dataset.tipHtml; else tip.textContent = t.dataset.tip;
      tip.hidden = false;
      place(e);
    });
    document.addEventListener('mousemove', (e) => { if (current) place(e); });
    document.addEventListener('scroll', () => { tip.hidden = true; current = null; }, true);
  }

  // --- Campos de dinero: <input data-money> se formatea con puntos mientras escribes; acepta 25k y 1,5m ---
  function initMoneyInputs(root) {
    root.querySelectorAll('input[data-money]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const v = inp.value;
        if (/[kKmM]/.test(v) || /,\d*$/.test(v)) return; // deja escribir 25k o 1,5m
        const pos = inp.value.length - inp.selectionStart;
        const neg = inp.dataset.money === 'signed' && v.trim().startsWith('-');
        const g = A.u.groupDigits(v);
        inp.value = (neg ? '-' : '') + g;
        const p = Math.max(0, inp.value.length - pos);
        inp.setSelectionRange(p, p);
      });
      inp.addEventListener('blur', () => {
        const neg = inp.dataset.money === 'signed' && inp.value.trim().startsWith('-');
        const n = A.u.parseMoney(inp.value.replace('-', ''));
        if (!Number.isNaN(n)) inp.value = (neg ? '-' : '') + A.u.groupDigits(String(n));
      });
    });
  }
  /** Lee un campo de dinero del formulario. Devuelve NaN si no es válido. */
  function readMoney(raw, { signed = false } = {}) {
    const s = String(raw ?? '').trim();
    const neg = signed && s.startsWith('-');
    const n = A.u.parseMoney(neg ? s.slice(1) : s);
    return neg ? -n : n;
  }
  const moneyValue = (n) => (n || n === 0 ? A.u.groupDigits(String(Math.abs(Math.round(n)))) : '');

  // --- Selectores ---
  function categoryOptions(kind, selectedId, { placeholder = null, topOnly = false } = {}) {
    let html = placeholder ? `<option value="">${esc(placeholder)}</option>` : '';
    for (const c of A.store.topCategories(kind)) {
      const subs = topOnly ? [] : A.store.subcategories(c.id);
      html += `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(`${c.icon ? c.icon + ' ' : ''}${c.name}`)}</option>`;
      for (const s of subs) html += `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>&nbsp;&nbsp;&nbsp;↳ ${esc(s.name)}</option>`;
    }
    return html;
  }

  const ACCOUNT_TYPES = {
    efectivo: { label: 'Efectivo', icon: '💵' },
    banco: { label: 'Cuenta bancaria', icon: '🏦' },
    billetera: { label: 'Billetera digital', icon: '📱' },
    credito: { label: 'Tarjeta de crédito', icon: '💳' },
    prestamo: { label: 'Préstamo / deuda', icon: '🧾' },
  };
  function accountOptions(selectedId, { filter = () => true, placeholder = null } = {}) {
    let html = placeholder ? `<option value="">${esc(placeholder)}</option>` : '';
    const accs = A.store.state.accounts.filter((a) => (!a.archived || a.id === selectedId) && filter(a));
    const groups = [['Cuentas', accs.filter((a) => !A.store.isDebt(a))], ['Deudas', accs.filter((a) => A.store.isDebt(a))]];
    for (const [label, list] of groups) {
      if (!list.length) continue;
      html += `<optgroup label="${label}">`;
      for (const a of list) html += `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${esc(`${ACCOUNT_TYPES[a.type]?.icon || ''} ${a.name}`)}</option>`;
      html += '</optgroup>';
    }
    return html;
  }
  function goalOptions(selectedId, { includeDone = false } = {}) {
    return A.store.state.goals.filter((g) => includeDone || !g.doneAt || g.id === selectedId)
      .map((g) => `<option value="${g.id}" ${g.id === selectedId ? 'selected' : ''}>${esc(`${g.emoji || '🎯'} ${g.name}`)}</option>`).join('');
  }

  function dot(color) { return `<span class="dot" style="background:${color}"></span>`; }

  function bar(pct, color = 'var(--accent)', { label = '', marker = null } = {}) {
    return `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(1, pct) * 100)}" ${label ? `aria-label="${esc(label)}"` : ''}>
      <div class="progress-fill" style="width:${(Math.max(0, Math.min(1, pct)) * 100).toFixed(1)}%;background:${color}"></div>
      ${marker != null ? `<span class="progress-marker" style="left:${(Math.min(1, marker) * 100).toFixed(1)}%"></span>` : ''}</div>`;
  }

  const STATUS = {
    ok: { cls: 'st-ok', icon: '●', text: 'Bien' },
    warn: { cls: 'st-warn', icon: '▲', text: 'Cerca del límite' },
    over: { cls: 'st-over', icon: '✕', text: 'Te pasaste' },
    none: { cls: 'st-none', icon: '○', text: 'Sin límite' },
  };
  const statusColor = (s) => (s === 'over' ? 'var(--danger)' : s === 'warn' ? 'var(--warn)' : s === 'ok' ? 'var(--good)' : 'var(--c-none)');
  function statusPill(s) { const x = STATUS[s]; return `<span class="st ${x.cls}">${x.icon} ${x.text}</span>`; }

  return {
    modal, fieldError, confirm, toast, initTooltip, initMoneyInputs, readMoney, moneyValue,
    categoryOptions, accountOptions, goalOptions, ACCOUNT_TYPES, dot, bar, statusColor, statusPill, STATUS,
  };
})();
