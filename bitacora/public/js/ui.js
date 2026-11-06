/* Piezas de interfaz reutilizables: modal, confirmación, avisos, tooltip y selectores. */
window.B = window.B || {};

B.ui = (() => {
  const { esc } = B.u;
  let closeCurrent = null;

  /**
   * Abre un formulario modal.
   * opts: { title, body (html), submitLabel, onSubmit(data, form) → false para no cerrar,
   *         onDelete?, deleteLabel?, onMount?(form), wide? }
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
      if (opts.onSubmit(data, form) !== false) close();
    });
    if (opts.onMount) opts.onMount(form);
    const first = form.querySelector('input:not([type=hidden]):not([type=radio]), textarea, select');
    if (first) setTimeout(() => first.focus(), 30);
    return { close, form };
  }

  /** Muestra un error bajo un campo del formulario. */
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
    while (root.children.length >= 3) root.firstElementChild.remove(); // máximo 3 avisos a la vez
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

  // --- Selectores ---
  function areaOptions(selectedId, { placeholder } = {}) {
    let html = placeholder ? `<option value="">${esc(placeholder)}</option>` : '';
    for (const g of B.store.groupedAreas()) {
      if (!g.areas.length) continue;
      html += `<optgroup label="${esc(g.category ? g.category.name : 'Sin categoría')}">`;
      for (const a of g.areas) html += `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${esc(a.name)}</option>`;
      html += '</optgroup>';
    }
    return html;
  }

  function taskOptions(areaId, selectedId, { pendingOnly = true } = {}) {
    let html = '<option value="">— Sin tarea específica —</option>';
    const tasks = B.store.state.tasks
      .filter((t) => t.areaId === areaId && (!pendingOnly || !t.done || t.id === selectedId))
      .sort(B.ui.taskSort('prioridad'));
    for (const t of tasks) html += `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${esc(t.title)}${t.done ? ' ✓' : ''}</option>`;
    return html;
  }

  function categoryOptions(selectedId, { noneLabel = 'Sin categoría' } = {}) {
    let html = noneLabel ? `<option value="">${esc(noneLabel)}</option>` : '';
    for (const c of B.store.state.categories) html += `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)}</option>`;
    return html;
  }

  /** Casillas para elegir varias categorías (name="cats"). */
  function categoryChecks(selectedIds = []) {
    const sel = new Set(selectedIds || []);
    const cats = B.store.state.categories;
    if (!cats.length) return '<p class="muted small">Aún no tienes categorías.</p>';
    return `<div class="cat-checks">${cats.map((c) => `
      <label class="cat-check"><input type="checkbox" name="cats" value="${c.id}" ${sel.has(c.id) ? 'checked' : ''}>
        ${dot(B.store.catColor(c))}<span>${esc(c.name)}</span></label>`).join('')}</div>`;
  }

  const PRIORITY_RANK = { alta: 0, media: 1, baja: 2 };
  function taskSort(by) {
    return (a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.done && b.done) return (b.completedAt || 0) - (a.completedAt || 0);
      const da = a.dueDate || '9999', db = b.dueDate || '9999';
      const pa = PRIORITY_RANK[a.priority] ?? 1, pb = PRIORITY_RANK[b.priority] ?? 1;
      if (by === 'fecha') return da.localeCompare(db) || pa - pb || a.createdAt - b.createdAt;
      return pa - pb || da.localeCompare(db) || a.createdAt - b.createdAt;
    };
  }

  /** Etiqueta "Categoría › Área › Tarea". */
  function breadcrumb(areaId, taskId, { withCategory = true } = {}) {
    const a = B.store.area(areaId), c = B.store.areaCategory(areaId), t = taskId ? B.store.task(taskId) : null;
    const parts = [];
    if (c && withCategory) parts.push(`<span class="crumb-cat">${esc(c.name)}</span>`);
    parts.push(`<span class="crumb-area">${esc(a ? a.name : '(área borrada)')}</span>`);
    if (t) parts.push(`<span class="crumb-task">${esc(t.title)}</span>`);
    return parts.join('<span class="crumb-sep">›</span>');
  }

  function dot(color) { return `<span class="dot" style="background:${color}"></span>`; }

  /** Barra de progreso. */
  function bar(pct, color = 'var(--accent)', { label = '' } = {}) {
    return `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct * 100)}" ${label ? `aria-label="${esc(label)}"` : ''}>
      <div class="progress-fill" style="width:${(Math.min(1, pct) * 100).toFixed(1)}%;background:${color}"></div></div>`;
  }

  /** Estado de la fecha límite: { cls, text } */
  function dueInfo(dueDate, done) {
    if (!dueDate) return null;
    const due = B.u.parseDayKey(dueDate);
    const today = B.u.startOfDay(Date.now());
    const days = Math.round((due - today) / 864e5);
    let text = B.u.fmtDate(due, { year: new Date(due).getFullYear() !== new Date().getFullYear() });
    let cls = 'due';
    if (!done) {
      if (days < 0) { cls += ' due-late'; text = `Vencida · ${text}`; }
      else if (days === 0) { cls += ' due-today'; text = 'Hoy'; }
      else if (days === 1) { cls += ' due-soon'; text = 'Mañana'; }
      else if (days <= 3) cls += ' due-soon';
    }
    return { cls, text };
  }

  return { modal, fieldError, confirm, toast, initTooltip, areaOptions, taskOptions, categoryOptions, categoryChecks, taskSort, breadcrumb, dot, bar, dueInfo };
})();
