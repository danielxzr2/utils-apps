/* Vista "Movimientos": todos los movimientos del periodo, con filtros. */
window.A = window.A || {};
A.views = A.views || {};

A.views.movimientos = (() => {
  const { esc, money } = A.u;
  let offset = 0;
  const f = { type: '', cat: '', acc: '', q: '' };

  function matches(state, m) {
    if (f.type && m.type !== f.type) return false;
    if (f.acc && m.accountId !== f.acc && m.toAccountId !== f.acc) return false;
    if (f.cat) { const t = A.store.topCategory(m.categoryId); if (m.categoryId !== f.cat && (!t || t.id !== f.cat)) return false; }
    if (f.q) {
      const hay = `${m.note || ''} ${A.store.catLabel(m.categoryId)} ${A.store.goal(m.goalId)?.name || ''}`.toLowerCase();
      if (!hay.includes(f.q.toLowerCase())) return false;
    }
    return true;
  }

  function render(el) {
    const state = A.store.state;
    const P = A.stats.period(state, A.u.todayKey(), offset);
    const list = state.movements.filter((m) => A.stats.inP(P, m.date) && matches(state, m));
    const spent = list.filter((m) => m.type === 'gasto' && !m.goalId).reduce((a, m) => a + m.amount, 0);
    const income = list.filter((m) => m.type === 'ingreso').reduce((a, m) => a + m.amount, 0);
    const opt = (v, l, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;

    el.innerHTML = `
      <div class="report-toolbar">
        <div class="period-nav">
          <button class="icon-btn" data-action="mv-prev" aria-label="Periodo anterior">‹</button>
          <h2 class="period-label">${esc(P.label)}</h2>
          <button class="icon-btn" data-action="mv-next" aria-label="Periodo siguiente" ${offset >= 0 ? 'disabled' : ''}>›</button>
          ${offset ? '<button class="btn btn-sm btn-ghost" data-action="mv-now">Hoy</button>' : ''}
        </div>
        <button class="btn btn-primary" data-action="new-movement" data-type="gasto">+ Nuevo movimiento</button>
      </div>

      <section class="card">
        <div class="filters">
          <select data-f="type" aria-label="Tipo">${opt('', 'Todos los tipos', f.type)}${[['gasto', 'Gastos'], ['ingreso', 'Ingresos'], ['transferencia', 'Transferencias'], ['aporte', 'Aportes a metas'], ['ajuste', 'Ajustes']].map(([v, l]) => opt(v, l, f.type)).join('')}</select>
          <select data-f="cat" aria-label="Categoría"><option value="">Todas las categorías</option>
            <optgroup label="Gastos">${A.ui.categoryOptions('gasto', f.cat)}</optgroup>
            <optgroup label="Ingresos">${A.ui.categoryOptions('ingreso', f.cat)}</optgroup></select>
          <select data-f="acc" aria-label="Cuenta">${A.ui.accountOptions(f.acc, { placeholder: 'Todas las cuentas' })}</select>
          <input data-f="q" type="search" placeholder="Buscar en notas…" value="${esc(f.q)}" aria-label="Buscar">
        </div>
        <div class="filter-sum small">
          <span>${A.u.plural(list.length, 'movimiento', 'movimientos')}</span>
          ${income ? `<span>Ingresos: <b class="pos">${money(income)}</b></span>` : ''}
          ${spent ? `<span>Gastos: <b>${money(spent)}</b></span>` : ''}
          ${f.type || f.cat || f.acc || f.q ? '<button class="link" data-action="mv-clear">Quitar filtros</button>' : ''}
        </div>
      </section>

      <section class="card">${A.widgets.movementsByDay(list)}</section>`;

    el.querySelectorAll('[data-f]').forEach((inp) => {
      const ev = inp.tagName === 'INPUT' ? 'input' : 'change';
      inp.addEventListener(ev, () => {
        f[inp.dataset.f] = inp.value;
        if (ev === 'input') { clearTimeout(inp._t); inp._t = setTimeout(() => { A.app.render(); const q = document.querySelector('[data-f=q]'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); }
        else A.app.render();
      });
    });
  }

  function handle(action) {
    if (action === 'mv-prev') { offset--; return true; }
    if (action === 'mv-next') { offset = Math.min(0, offset + 1); return true; }
    if (action === 'mv-now') { offset = 0; return true; }
    if (action === 'mv-clear') { Object.assign(f, { type: '', cat: '', acc: '', q: '' }); return true; }
    return false;
  }

  /** Para abrir la vista filtrada por cuenta o categoría desde otra pantalla. */
  function filterBy(key, value) { Object.assign(f, { type: '', cat: '', acc: '', q: '' }, { [key]: value }); offset = 0; }

  return { render, handle, filterBy };
})();
