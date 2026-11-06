/* Vista "Presupuesto": base del presupuesto, límites por categoría (semáforo), gastos fijos y categorías. */
window.A = window.A || {};
A.views = A.views || {};

A.views.presupuesto = (() => {
  const { esc, money, moneyShort } = A.u;

  function allocation(state, sm) {
    const base = sm.base;
    const parts = [];
    let used = 0;
    for (const x of sm.cats) {
      const b = x.cat.budget;
      if (!b || !(b.value > 0)) continue;
      const p = b.mode === 'pct' ? b.value / 100 : base ? b.value / base : 0;
      parts.push({ name: x.cat.name, color: A.store.catColor(x.cat), p });
      used += p;
    }
    const save = (Number(state.settings.savingsPct) || 0) / 100;
    const total = used + save;
    const segs = parts.map((s) => `<span class="alloc-seg" style="flex:${s.p};background:${s.color}" data-tip="${esc(s.name)}: ${A.u.pct(s.p)}"></span>`).join('')
      + (save ? `<span class="alloc-seg alloc-save" style="flex:${save}" data-tip="Ahorro: ${A.u.pct(save)}"></span>` : '')
      + (total < 1 ? `<span class="alloc-seg alloc-free" style="flex:${1 - total}" data-tip="Sin asignar: ${A.u.pct(1 - total)}"></span>` : '');
    return `
      <div class="alloc">${segs}</div>
      <p class="small ${total > 1.0001 ? 'late-text' : 'muted'}" style="margin:8px 0 0">
        Límites: <b>${A.u.pct(used)}</b> + ahorro <b>${A.u.pct(save)}</b> = <b>${A.u.pct(total)}</b> del ingreso
        ${total > 1.0001 ? ' — ⚠️ asignaste más del 100 %; baja algún límite.' : total < 0.9999 ? ` · ${A.u.pct(1 - total)} sin asignar (colchón para imprevistos).` : ' ✓'}
      </p>`;
  }

  function render(el) {
    const state = A.store.state;
    if (!state.settings.budgetReviewed) setTimeout(() => A.store.update((s) => { s.settings.budgetReviewed = true; }), 0);
    const P = A.stats.period(state);
    const sm = A.stats.summary(state, P);
    const fx = A.stats.fixedStatus(state, P);
    const fxTotal = state.recurring.filter((r) => r.active !== false).reduce((a, r) => a + r.amount, 0);
    const inactive = state.recurring.filter((r) => r.active === false);
    const set = state.settings;
    const over = sm.cats.filter((x) => x.status === 'over').length, warn = sm.cats.filter((x) => x.status === 'warn').length;

    el.innerHTML = `
      <div class="report-toolbar"><h2>Presupuesto <span class="muted" style="font-weight:400">· ${esc(P.label)}</span></h2></div>

      <section class="card">
        <header class="card-head"><h3>Base del presupuesto</h3></header>
        <div class="base-grid">
          <label class="field"><span>Ingreso esperado al mes</span>
            <input data-set="expectedIncome" data-money inputmode="decimal" value="${set.expectedIncome ? A.ui.moneyValue(set.expectedIncome) : ''}" placeholder="Ej. 4.000.000"></label>
          <label class="field"><span>Meta de ahorro mensual</span>
            <div class="inline-inputs"><input data-set="savingsPct" type="number" min="0" max="90" value="${set.savingsPct}"> % del ingreso</div></label>
          <label class="field"><span>Día de pago (inicio del periodo)</span>
            <input data-set="payDay" type="number" min="1" max="31" value="${set.payDay}"></label>
        </div>
        <p class="hint">Como tu ingreso es variable, los porcentajes se calculan sobre <b>el mayor</b> entre el ingreso esperado y lo que realmente te ha entrado en el periodo.
          Hoy la base es <b>${money(sm.base)}</b>${sm.income > sm.expected ? ' (lo que llevas recibido)' : sm.expected ? ' (el esperado)' : ''}.</p>
        ${allocation(state, sm)}
      </section>

      <section class="card">
        <header class="card-head">
          <h3>Límites por categoría</h3>
          <div class="btn-row">
            ${over ? `<span class="st st-over">✕ ${over} pasada${over > 1 ? 's' : ''}</span>` : ''}${warn ? `<span class="st st-warn">▲ ${warn} cerca</span>` : ''}
            <button class="btn btn-sm btn-ghost" data-action="new-category" data-kind="gasto">+ Categoría</button>
          </div>
        </header>
        <div class="budget-grid">${sm.cats.map((x) => A.widgets.budgetRow(x, { editable: true, base: sm.base })).join('')}</div>
        <p class="hint" style="margin-top:12px">Semáforo: <span class="st st-ok">● menos del 75 %</span> <span class="st st-warn">▲ 75–100 %</span> <span class="st st-over">✕ más del límite</span>. Los gastos fijos también cuentan en su categoría.</p>
      </section>

      <section class="card">
        <header class="card-head"><h3>Gastos fijos</h3>
          <div class="btn-row"><span class="muted small">${moneyShort(fxTotal)} al mes${sm.base ? ` · ${A.u.pct(fxTotal / sm.base)} del ingreso` : ''}</span>
          <button class="btn btn-sm btn-ghost" data-action="new-recurring">+ Gasto fijo</button></div></header>
        ${fx.length ? `<ul class="fixed-list">${fx.map((f) => `
          <li class="fixed fx-${f.status}">
            <span class="mv-icon" style="--cc:${A.store.catColor(A.store.topCategory(f.r.categoryId))}">${A.store.catIcon(f.r.categoryId)}</span>
            <div class="fixed-main"><div>${esc(f.r.name)} <span class="muted small">· ${esc(A.store.catLabel(f.r.categoryId))}</span></div>
              <div class="small ${f.status === 'vencido' ? 'late-text' : 'muted'}">${f.paid ? `✓ Pagado el ${A.u.fmtDate(f.paid.date)}` : `${f.status === 'vencido' ? 'Vencido · ' : f.status === 'hoy' ? 'Hoy · ' : 'Vence el '}${A.u.fmtDate(f.due)}`}</div></div>
            <span class="fixed-amt">${money(f.paid ? f.paid.amount : f.r.amount)}</span>
            ${f.paid ? `<button class="btn btn-sm btn-ghost" data-action="edit-movement" data-id="${f.paid.id}">Ver pago</button>`
              : `<button class="btn btn-sm btn-primary" data-action="pay-fixed" data-id="${f.r.id}" data-due="${f.due}">Pagar</button>`}
            <button class="icon-btn" data-action="edit-recurring" data-id="${f.r.id}" aria-label="Editar gasto fijo">✎</button>
          </li>`).join('')}</ul>` : '<p class="empty-small">Agrega lo que pagas todos los meses: arriendo, servicios, celular, suscripciones, cuota de la universidad…</p>'}
        ${inactive.length ? `<p class="muted small">Inactivos: ${inactive.map((r) => `<button class="link" data-action="edit-recurring" data-id="${r.id}">${esc(r.name)}</button>`).join(', ')}</p>` : ''}
      </section>

      <section class="card">
        <header class="card-head"><h3>Categorías y subcategorías</h3></header>
        <div class="cat-admin">
          ${['gasto', 'ingreso'].map((kind) => `
            <div>
              <h4 class="cat-admin-title">${kind === 'gasto' ? 'Gastos' : 'Ingresos'} <button class="link small" data-action="new-category" data-kind="${kind}">+ Nueva</button></h4>
              ${A.store.topCategories(kind).map((c) => `
                <div class="cat-line">
                  <button class="cat-name" data-action="edit-category" data-id="${c.id}">${A.ui.dot(A.store.catColor(c))}${esc(c.icon || '')} ${esc(c.name)}</button>
                  <div class="sub-chips">
                    ${A.store.subcategories(c.id).map((s) => `<button class="sub-chip" data-action="edit-category" data-id="${s.id}">${esc(s.name)}</button>`).join('')}
                    <button class="sub-chip add" data-action="new-subcategory" data-id="${c.id}" aria-label="Nueva subcategoría de ${esc(c.name)}">+</button>
                  </div>
                </div>`).join('')}
            </div>`).join('')}
        </div>
      </section>`;

    el.querySelectorAll('[data-set]').forEach((inp) => inp.addEventListener('change', () => {
      const k = inp.dataset.set;
      let v;
      if (k === 'expectedIncome') { v = inp.value.trim() ? A.ui.readMoney(inp.value) : 0; if (Number.isNaN(v)) return A.ui.toast('Monto no válido.', 'error'); }
      else if (k === 'savingsPct') v = Math.max(0, Math.min(90, Number(inp.value) || 0));
      else v = Math.max(1, Math.min(31, Number(inp.value) || 1));
      A.store.update((s) => { s.settings[k] = v; });
    }));
  }

  return { render };
})();
