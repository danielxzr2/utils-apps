/* Vista "Inicio": cuánto puedes gastar hoy, registro rápido, cerrar el día y resumen del periodo. */
window.A = window.A || {};
A.views = A.views || {};

A.views.inicio = (() => {
  const { esc, money, moneyShort } = A.u;

  function setupSteps(state) {
    const bal = A.stats.balances(state);
    return [
      ['Pon el saldo real de tus cuentas', state.accounts.some((a) => !A.store.isDebt(a) && (bal.get(a.id) || 0) !== 0), 'cuentas'],
      ['Configura tu tarjeta de crédito (deuda y cupo)', state.accounts.some((a) => a.type === 'credito' && (Number(a.limit) > 0)), 'cuentas'],
      ['Registra tu ingreso de este periodo', state.movements.some((m) => m.type === 'ingreso'), 'new-income'],
      ['Revisa tus límites por categoría', !!state.settings.budgetReviewed, 'presupuesto'],
      ['Agrega tus gastos fijos (arriendo, servicios…)', state.recurring.length > 0, 'presupuesto'],
      ['Crea tu primera meta', state.goals.length > 0, 'metas'],
    ];
  }

  function setupCard(state) {
    if (state.settings.setupDismissed) return '';
    const steps = setupSteps(state);
    const done = steps.filter((s) => s[1]).length;
    if (done === steps.length) return '';
    return `
      <section class="card setup">
        <header class="card-head"><h3>Primeros pasos</h3><span class="muted small">${done} de ${steps.length}</span></header>
        ${A.ui.bar(done / steps.length)}
        <ul class="checklist">
          ${steps.map(([label, ok, to]) => `<li class="${ok ? 'ok' : ''}">
            <span class="check-ic">${ok ? '✓' : ''}</span>
            ${ok ? `<span>${esc(label)}</span>` : `<button class="link" data-action="${to === 'new-income' ? 'new-movement' : 'go'}" data-route="${to}" data-type="ingreso">${esc(label)}</button>`}
          </li>`).join('')}
        </ul>
        <button class="link small muted-link" data-action="dismiss-setup">Ocultar</button>
      </section>`;
  }

  function closeDayCard(state) {
    const s = A.stats.streaks(state);
    const today = A.u.todayKey(), yesterday = A.u.addDaysKey(today, -1);
    const days = A.stats.registeredDays(state);
    const todaySpent = state.movements.filter((m) => m.date === today && m.type === 'gasto').length;
    const yesterdayMissing = !days.has(yesterday) && s.best > 0;
    if (s.closedToday) {
      return `<div class="closeday done">
        <span class="closeday-ic">✅</span>
        <div><b>Día cerrado</b><div class="muted small">${todaySpent ? `${A.u.plural(todaySpent, 'gasto registrado', 'gastos registrados')} hoy.` : 'Hoy no gastaste nada. 🧘'} +${A.stats.XP.day} XP</div></div>
        <button class="link small" data-action="reopen-day">Deshacer</button>
      </div>`;
    }
    return `<div class="closeday">
      <span class="closeday-ic">🌙</span>
      <div><b>¿Ya registraste todo lo de hoy?</b>
        <div class="muted small">${todaySpent ? `Llevas ${A.u.plural(todaySpent, 'gasto', 'gastos')} hoy.` : 'Si hoy no gastaste nada, cierra el día igual para mantener la racha.'}
        ${yesterdayMissing ? ' <button class="link" data-action="close-day" data-day="' + yesterday + '">Cerrar ayer</button>' : ''}</div></div>
      <button class="btn btn-primary btn-sm" data-action="close-day" data-day="${today}">✓ Cerrar el día</button>
    </div>`;
  }

  function render(el) {
    const state = A.store.state;
    const P = A.stats.period(state);
    const sm = A.stats.summary(state, P);
    const w = A.stats.worth(state);
    const fixed = A.stats.fixedStatus(state, P).filter((f) => !f.paid);
    const goals = state.goals.filter((g) => !g.doneAt).slice(0, 3);
    const budget = sm.cats.filter((x) => x.limit != null || x.spent > 0).sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1) || b.spent - a.spent).slice(0, 5);
    const recent = state.movements.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 8);
    const cards = state.accounts.filter((a) => a.type === 'credito' && !a.archived);

    el.innerHTML = `
      <div class="home-layout">
        <div class="main-col">
          <section class="card hero-card">
            ${A.widgets.allowanceCard(state)}
            <div class="quick">
              <button class="quick-btn q-gasto" data-action="new-movement" data-type="gasto"><span>−</span>Gasto <kbd>G</kbd></button>
              <button class="quick-btn q-ingreso" data-action="new-movement" data-type="ingreso"><span>+</span>Ingreso <kbd>I</kbd></button>
              <button class="quick-btn" data-action="new-movement" data-type="transferencia"><span>⇄</span>Transferir <kbd>T</kbd></button>
              <button class="quick-btn" data-action="new-movement" data-type="aporte"><span>🎯</span>Aportar <kbd>A</kbd></button>
            </div>
            ${closeDayCard(state)}
          </section>

          <section class="tiles">
            <div class="tile"><span class="stat-label">Ingresos</span><span class="tile-value">${moneyShort(sm.income)}</span><span class="muted small">${sm.expected ? `esperado ${moneyShort(sm.expected)}` : '&nbsp;'}</span></div>
            <div class="tile"><span class="stat-label">Gastos</span><span class="tile-value">${moneyShort(sm.expenses)}</span><span class="muted small">${sm.base ? `${A.u.pct(sm.expenses / sm.base)} del ingreso` : '&nbsp;'}</span></div>
            <div class="tile"><span class="stat-label">Ahorrado (aportes)</span><span class="tile-value">${moneyShort(sm.saved)}</span><span class="muted small">meta ${moneyShort(sm.savingsTarget)}</span></div>
            <div class="tile"><span class="stat-label">Dinero libre</span><span class="tile-value">${moneyShort(w.free)}</span><span class="muted small">en cuentas, sin lo apartado</span></div>
          </section>

          <section class="card">
            <header class="card-head"><h3>Presupuesto <span class="muted small">· ${esc(P.label)}</span></h3><button class="link" data-action="go" data-route="presupuesto">Ver todo</button></header>
            ${!sm.base ? '<p class="empty-small">Registra tu ingreso o pon tu <button class="link" data-action="go" data-route="presupuesto">ingreso esperado</button> para ver cuánto puedes gastar en cada categoría.</p>'
              : budget.length ? budget.map((x) => A.widgets.budgetRow(x)).join('') : '<p class="empty-small">Sin gastos todavía en este periodo.</p>'}
          </section>

          <section class="card">
            <header class="card-head"><h3>Últimos movimientos</h3><button class="link" data-action="go" data-route="movimientos">Ver todos</button></header>
            ${A.widgets.movementList(recent, { showDate: true, empty: 'Aún no hay movimientos. Empieza con <b>G</b> para un gasto o <b>I</b> para un ingreso.' })}
          </section>
        </div>

        <aside class="side-col">
          ${setupCard(state)}
          <section class="card">${A.widgets.streakCard(state)}${A.widgets.levelCard(state)}</section>

          ${fixed.length ? `<section class="card">
            <header class="card-head"><h3>Gastos fijos pendientes</h3><span class="muted small">${moneyShort(fixed.reduce((a, f) => a + f.r.amount, 0))}</span></header>
            <ul class="fixed-list">${fixed.map((f) => `
              <li class="fixed fx-${f.status}">
                <div class="fixed-main"><div>${esc(f.r.name)}</div><div class="small ${f.status === 'vencido' ? 'late-text' : 'muted'}">${f.status === 'vencido' ? 'Vencido · ' : f.status === 'hoy' ? 'Hoy · ' : ''}${A.u.fmtDate(f.due)}</div></div>
                <span class="fixed-amt">${money(f.r.amount)}</span>
                <button class="btn btn-sm btn-ghost" data-action="pay-fixed" data-id="${f.r.id}" data-due="${f.due}">Pagar</button>
              </li>`).join('')}</ul>
          </section>` : ''}

          <section class="card">
            <header class="card-head"><h3>Metas</h3><button class="link" data-action="go" data-route="metas">Ver todas</button></header>
            ${goals.length ? goals.map((g) => miniGoal(state, g)).join('') : '<p class="empty-small">¿Algo especial que quieras comprar? <button class="link" data-action="new-goal">Crea una meta</button></p>'}
          </section>

          ${cards.map((a) => {
            const d = A.stats.debtInfo(state, a, w.balances.get(a.id));
            return `<section class="card">
              <header class="card-head"><h3>💳 ${esc(a.name)}</h3>${d.owed > 0 ? `<button class="btn btn-sm btn-ghost" data-action="pay-debt" data-id="${a.id}">Pagar</button>` : ''}</header>
              <div class="kv"><span class="muted">Deuda</span><b>${money(d.owed)}</b></div>
              ${d.limit ? `${A.ui.bar(d.usage, d.usage > 0.3 ? 'var(--warn)' : 'var(--accent)', { marker: 0.3 })}<div class="muted small" style="margin-top:4px">Usas ${A.u.pct(d.usage)} del cupo · ideal: menos del 30 %</div>` : ''}
              ${d.nextPay && d.owed > 0 ? `<div class="muted small">Próximo pago: ${A.u.fmtDate(d.nextPay)}${A.u.daysBetween(A.u.todayKey(), d.nextPay) <= 5 ? ' ⏰' : ''}</div>` : ''}
            </section>`;
          }).join('')}
        </aside>
      </div>`;
  }

  function miniGoal(state, g) {
    const p = A.stats.goalProgress(state, g);
    return `<div class="mini-goal">
      <div class="mini-goal-head"><span>${esc(g.emoji || '🎯')} ${esc(g.name)}</span><span class="muted small">${Math.floor(p.pct * 100)} %</span></div>
      ${A.ui.bar(p.pct, p.reached ? 'var(--good)' : 'var(--accent)')}
      <div class="mini-goal-foot muted small"><span>${moneyShort(p.contributed)} de ${moneyShort(p.target)}</span>
        <button class="link" data-action="contribute" data-id="${g.id}">+ Aportar</button></div>
    </div>`;
  }

  function handle(action, ds) {
    if (action === 'close-day') {
      A.store.update((s) => { if (!s.checkins.includes(ds.day)) s.checkins.push(ds.day); });
      const st = A.stats.streaks(A.store.state);
      A.ui.toast(`🌙 Día cerrado · +${A.stats.XP.day} XP · racha de ${A.u.plural(st.current, 'día', 'días')}`, 'success');
      return true;
    }
    if (action === 'reopen-day') {
      const t = A.u.todayKey();
      A.store.update((s) => { s.checkins = s.checkins.filter((k) => k !== t); });
      return true;
    }
    if (action === 'dismiss-setup') { A.store.update((s) => { s.settings.setupDismissed = true; }); return true; }
    return false;
  }

  return { render, handle };
})();
