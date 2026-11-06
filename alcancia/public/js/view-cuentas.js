/* Vista "Cuentas y deudas": saldos, tarjeta de crédito, préstamos y patrimonio neto. */
window.A = window.A || {};
A.views = A.views || {};

A.views.cuentas = (() => {
  const { esc, money } = A.u;

  function render(el) {
    const state = A.store.state;
    const w = A.stats.worth(state);
    const P = A.stats.period(state);
    const showArchived = el.dataset.archived === '1';
    const accs = state.accounts.filter((a) => !A.store.isDebt(a) && (showArchived || !a.archived));
    const debts = state.accounts.filter((a) => A.store.isDebt(a) && (showArchived || !a.archived));
    const archivedCount = state.accounts.filter((a) => a.archived).length;
    const lastMove = (id) => state.movements.filter((m) => m.accountId === id || m.toAccountId === id).sort((a, b) => b.date.localeCompare(a.date))[0];

    el.innerHTML = `
      <div class="report-toolbar"><h2>Cuentas y deudas</h2>
        <div class="btn-row"><button class="btn btn-ghost" data-action="new-account" data-type="credito">+ Deuda</button><button class="btn btn-primary" data-action="new-account">+ Cuenta</button></div></div>

      <section class="tiles">
        <div class="tile"><span class="stat-label">Patrimonio neto</span><span class="tile-value ${w.net < 0 ? 'neg' : ''}">${money(w.net)}</span><span class="muted small">lo que tienes − lo que debes</span></div>
        <div class="tile"><span class="stat-label">Tienes</span><span class="tile-value">${money(w.assets)}</span><span class="muted small">en ${A.u.plural(accs.length, 'cuenta', 'cuentas')}</span></div>
        <div class="tile"><span class="stat-label">Debes</span><span class="tile-value">${money(w.debts)}</span><span class="muted small">tarjeta y préstamos</span></div>
        <div class="tile"><span class="stat-label">Libre</span><span class="tile-value">${money(w.free)}</span><span class="muted small">${money(w.reserved)} apartados en metas</span></div>
      </section>

      <section class="card">
        <header class="card-head"><h3>Cuentas</h3><span class="muted small">Haz clic en ✎ para cuadrar el saldo con el real</span></header>
        <div class="acc-grid">
          ${accs.map((a) => {
            const b = w.balances.get(a.id) || 0, lm = lastMove(a.id);
            return `<article class="acc ${a.archived ? 'archived' : ''}">
              <div class="acc-top"><span class="acc-ic">${A.ui.ACCOUNT_TYPES[a.type]?.icon || ''}</span><span class="acc-name">${esc(a.name)}</span>
                <button class="icon-btn sm" data-action="edit-account" data-id="${a.id}" aria-label="Editar ${esc(a.name)}">✎</button></div>
              <div class="acc-bal ${b < 0 ? 'neg' : ''}">${money(b)}</div>
              <div class="acc-foot muted small"><span>${lm ? `Último: ${A.u.relDay(lm.date)}` : 'Sin movimientos'}</span>
                <button class="link small" data-action="filter-account" data-id="${a.id}">Movimientos</button></div>
            </article>`;
          }).join('') || '<p class="empty-small">Sin cuentas.</p>'}
        </div>
      </section>

      <section class="card">
        <header class="card-head"><h3>Deudas</h3>${w.debts === 0 && debts.length ? '<span class="st st-ok">🕊️ Sin deudas</span>' : ''}</header>
        ${debts.length ? debts.map((a) => debtBlock(state, a, w.balances.get(a.id) || 0, P)).join('') : '<p class="empty-small">No tienes deudas registradas.</p>'}
        <p class="hint" style="margin-top:12px">💡 Cómo se registra la tarjeta: cuando compras con ella, es un <b>gasto</b> pagado con la tarjeta (suma a la categoría y a la deuda). Cuando la pagas, es una <b>transferencia</b> desde tu banco hacia la tarjeta (baja la deuda y no se cuenta como gasto otra vez). Los intereses y la cuota de manejo van como gasto en <i>Financieros</i>.</p>
      </section>

      ${archivedCount ? `<p class="center"><button class="link" data-action="toggle-archived">${showArchived ? 'Ocultar' : 'Mostrar'} archivadas (${archivedCount})</button></p>` : ''}`;
  }

  function debtBlock(state, a, bal, P) {
    const d = A.stats.debtInfo(state, a, bal);
    const cardSpent = state.movements.filter((m) => m.type === 'gasto' && m.accountId === a.id && A.stats.inP(P, m.date)).reduce((x, m) => x + m.amount, 0);
    const paid = state.movements.filter((m) => m.type === 'transferencia' && m.toAccountId === a.id && A.stats.inP(P, m.date)).reduce((x, m) => x + m.amount, 0);
    const today = A.u.todayKey();
    const soon = d.nextPay && A.u.daysBetween(today, d.nextPay) <= 5 && d.owed > 0;
    return `<article class="debt ${a.archived ? 'archived' : ''}">
      <div class="debt-head">
        <span class="acc-ic">${A.ui.ACCOUNT_TYPES[a.type].icon}</span>
        <div class="debt-title"><b>${esc(a.name)}</b><div class="muted small">${A.ui.ACCOUNT_TYPES[a.type].label}</div></div>
        <div class="debt-owed"><span class="muted small">Debes</span><b>${money(d.owed)}</b></div>
        <div class="btn-row">
          ${d.owed > 0 ? `<button class="btn btn-sm btn-primary" data-action="pay-debt" data-id="${a.id}">Pagar</button>` : ''}
          <button class="icon-btn" data-action="edit-account" data-id="${a.id}" aria-label="Editar ${esc(a.name)}">✎</button>
        </div>
      </div>
      ${a.type === 'credito' ? `
        ${d.limit ? `<div class="debt-bar">${A.ui.bar(d.usage, d.usage > 0.3 ? 'var(--warn)' : 'var(--accent)', { marker: 0.3 })}
          <div class="debt-bar-foot small"><span>Usas <b>${A.u.pct(d.usage)}</b> del cupo de ${money(d.limit)}</span><span class="muted">Disponible: ${money(d.available)}</span></div>
          <div class="muted small">La línea marca el 30 %: mantenerte por debajo cuida tu historial crediticio.</div></div>`
        : '<p class="small muted">Pon el cupo total de la tarjeta (✎) para ver cuánto usas.</p>'}
        <div class="debt-facts small">
          ${d.nextCut ? `<span>✂️ Corte: <b>${A.u.fmtDate(d.nextCut)}</b></span>` : ''}
          ${d.nextPay ? `<span class="${soon ? 'late-text' : ''}">📅 Pago: <b>${A.u.fmtDate(d.nextPay)}</b>${soon ? ' ⏰' : ''}</span>` : ''}
          <span>Compras este periodo: <b>${money(cardSpent)}</b></span>
          <span>Pagado este periodo: <b>${money(paid)}</b></span>
        </div>`
      : `<div class="debt-bar">${A.ui.bar(d.paidPct, 'var(--good)')}
          <div class="debt-bar-foot small"><span>Llevas pagado <b>${A.u.pct(d.paidPct)}</b>${d.original ? ` de ${money(d.original)}` : ''}</span><span class="muted">Pagado este periodo: ${money(paid)}</span></div></div>`}
    </article>`;
  }

  function handle(action, ds) {
    const el = document.getElementById('view');
    if (action === 'toggle-archived') { el.dataset.archived = el.dataset.archived === '1' ? '0' : '1'; return true; }
    if (action === 'filter-account') { A.views.movimientos.filterBy('acc', ds.id); location.hash = 'movimientos'; return false; }
    return false;
  }

  return { render, handle };
})();
