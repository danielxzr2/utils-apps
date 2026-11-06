/* Bloques compartidos entre vistas: nivel, racha, "hoy puedes gastar", filas de movimientos, metas y presupuesto. */
window.A = window.A || {};

A.widgets = (() => {
  const { esc, money, moneyShort } = A.u;

  function levelCard(state) {
    const lv = A.stats.level(state);
    return `
      <div class="level">
        <div class="level-badge" aria-hidden="true">${lv.level}</div>
        <div class="level-info">
          <div class="level-title">Nivel ${lv.level} · ${A.stats.levelTitle(lv.level)}</div>
          ${A.ui.bar(lv.pct, 'var(--accent)', { label: 'Progreso al siguiente nivel' })}
          <div class="muted small">${lv.into} / ${lv.needed} XP para el nivel ${lv.level + 1}</div>
        </div>
      </div>`;
  }

  function streakCard(state) {
    const s = A.stats.streaks(state);
    const msg = s.todayOk ? '¡Hoy ya está registrado!' : s.current ? 'Registra o cierra el día de hoy para no perderla.' : 'Registra tus gastos de hoy para empezar una racha.';
    return `
      <div class="streak ${s.current ? 'on' : ''}">
        <div class="streak-flame" aria-hidden="true">🔥</div>
        <div>
          <div class="streak-num">${A.u.plural(s.current, 'día', 'días')} de racha</div>
          <div class="muted small">${msg} Mejor: ${s.best}.</div>
        </div>
      </div>`;
  }

  /** La cifra principal: cuánto puedes gastar hoy. */
  function allowanceCard(state) {
    const al = A.stats.allowance(state);
    if (!al.hasIncome) {
      return `
        <div class="hero hero-empty">
          <div class="hero-label">Hoy puedes gastar</div>
          <div class="hero-value muted">$ —</div>
          <p class="small muted">Registra tu ingreso de este periodo o pon tu <button class="link" data-action="go" data-route="presupuesto">ingreso esperado</button> para calcularlo.</p>
          <button class="btn btn-primary" data-action="new-movement" data-type="ingreso">+ Registrar ingreso</button>
        </div>`;
    }
    const over = al.left < 0;
    const neg = al.daily <= 0;
    const cls = neg || over ? 'hero-over' : al.left < al.daily * 0.25 ? 'hero-warn' : '';
    const breakdown = `<div class="tip-title">Cómo se calcula</div>
      <div class="tip-row"><span>Ingreso base del periodo</span><b>${money(al.base)}</b></div>
      <div class="tip-row"><span>− Gastos fijos</span><b>${money(al.fixedTotal)}</b></div>
      <div class="tip-row"><span>− Ahorro planeado</span><b>${money(al.savingPlan)}</b></div>
      <div class="tip-row"><span>− Gastado antes de hoy</span><b>${money(al.variableBefore)}</b></div>
      <div class="tip-total"><span>÷ ${A.u.plural(al.daysLeft, 'día que queda', 'días que quedan')}</span><b>${money(al.daily)}/día</b></div>`;
    return `
      <div class="hero ${cls}">
        <div class="hero-label">Hoy puedes gastar <span class="info-i" data-tip-html="${esc(breakdown)}" tabindex="0" aria-label="Cómo se calcula">i</span></div>
        <div class="hero-value">${neg ? money(0) : money(Math.max(0, al.left))}</div>
        <div class="hero-sub">
          ${neg ? '⚠️ Ya gastaste lo disponible para gastos variables en este periodo.'
            : over ? `Te pasaste ${money(-al.left)} hoy; mañana el cupo diario se ajusta.`
            : al.spentToday ? `Llevas ${money(al.spentToday)} de ${money(al.daily)} hoy.` : `Tu cupo diario es ${money(al.daily)}.`}
        </div>
        <div class="hero-meta muted small">
          Quedan ${A.u.plural(al.daysLeft, 'día', 'días')} del periodo · variables: ${moneyShort(al.variableSpent)} de ${moneyShort(Math.max(0, al.variableMonth))}
        </div>
      </div>`;
  }

  function movementIcon(mv) {
    if (mv.type === 'gasto' || mv.type === 'ingreso') return A.store.catIcon(mv.categoryId);
    return { transferencia: '⇄', aporte: '🎯', ajuste: '⚖︎' }[mv.type] || '•';
  }
  function movementTitle(mv) {
    const acc = (id) => A.store.account(id)?.name || '(cuenta borrada)';
    if (mv.type === 'gasto' || mv.type === 'ingreso') return esc(A.store.catLabel(mv.categoryId));
    if (mv.type === 'transferencia') return `${esc(acc(mv.accountId))} → ${esc(acc(mv.toAccountId))}`;
    if (mv.type === 'aporte') { const g = A.store.goal(mv.goalId); return `${mv.amount < 0 ? 'Retiro de' : 'Aporte a'} ${esc(g ? g.name : '(meta borrada)')}`; }
    return `Ajuste de saldo · ${esc(acc(mv.accountId))}`;
  }
  function movementRow(mv, { showDate = false } = {}) {
    const top = mv.type === 'gasto' || mv.type === 'ingreso' ? A.store.topCategory(mv.categoryId) : null;
    const sign = mv.type === 'gasto' ? -1 : mv.type === 'ingreso' ? 1 : 0;
    const amt = mv.type === 'aporte' || mv.type === 'ajuste' ? money(mv.amount, { sign: true }) : sign < 0 ? `−${money(mv.amount)}` : sign > 0 ? `+${money(mv.amount)}` : money(mv.amount);
    const acc = mv.type === 'gasto' || mv.type === 'ingreso' ? A.store.account(mv.accountId) : null;
    const tags = [];
    if (mv.recurringId) tags.push('<span class="tag">fijo</span>');
    if (mv.goalId && mv.type === 'gasto') tags.push('<span class="tag tag-goal">pagado con meta</span>');
    if (acc && A.store.isDebt(acc)) tags.push('<span class="tag">💳 crédito</span>');
    return `
      <li class="mv mv-${mv.type}">
        <span class="mv-icon" style="--cc:${top ? A.store.catColor(top) : 'var(--c-none)'}" aria-hidden="true">${movementIcon(mv)}</span>
        <div class="mv-main">
          <div class="mv-what">${movementTitle(mv)} ${tags.join(' ')}</div>
          <div class="mv-sub muted">${showDate ? `${A.u.relDay(mv.date)} · ` : ''}${acc ? esc(acc.name) : ''}${mv.note ? `${acc ? ' · ' : ''}${esc(mv.note)}` : ''}</div>
        </div>
        <div class="mv-amount ${sign > 0 ? 'pos' : ''}">${amt}</div>
        <button class="icon-btn" data-action="edit-movement" data-id="${mv.id}" aria-label="Editar movimiento">✎</button>
      </li>`;
  }

  function movementList(list, opts = {}) {
    if (!list.length) return `<p class="empty-small">${opts.empty || 'Sin movimientos.'}</p>`;
    return `<ul class="mv-list">${list.map((m) => movementRow(m, opts)).join('')}</ul>`;
  }

  /** Movimientos agrupados por día, con el total gastado del día. */
  function movementsByDay(list) {
    if (!list.length) return '<p class="empty-small">Sin movimientos en este periodo.</p>';
    const days = new Map();
    for (const m of list) { if (!days.has(m.date)) days.set(m.date, []); days.get(m.date).push(m); }
    return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, ms]) => {
      const spent = ms.filter((m) => m.type === 'gasto' && !m.goalId).reduce((a, m) => a + m.amount, 0);
      return `<section class="day-group">
        <header class="day-head"><span>${A.u.relDay(day)}</span><span class="muted small">${spent ? `Gastado: ${money(spent)}` : ''}</span></header>
        <ul class="mv-list">${ms.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map((m) => movementRow(m)).join('')}</ul>
      </section>`;
    }).join('');
  }

  function goalCard(state, g, { compact = false } = {}) {
    const p = A.stats.goalProgress(state, g);
    const milestones = [0.25, 0.5, 0.75].map((m) => `<span class="ms ${p.pct >= m ? 'on' : ''}" style="left:${m * 100}%"></span>`).join('');
    let pace = '';
    if (g.doneAt) pace = `🏅 Cumplida el ${A.u.fmtDate(A.u.dayKey(g.doneAt), { year: true })}`;
    else if (p.reached) pace = '🎉 ¡Llegaste al objetivo!';
    else {
      const bits = [];
      if (p.needPerMonth) bits.push(`Necesitas ${money(p.needPerMonth)}/mes para llegar el ${A.u.fmtDate(g.deadline, { year: true })}`);
      if (p.eta) bits.push(`a tu ritmo llegas el ${A.u.fmtDate(p.eta, { year: true })}`);
      else if (p.contributed === 0) bits.push('Haz tu primer aporte para ver la proyección');
      pace = bits.join(' · ');
    }
    return `
      <article class="goal-card ${g.doneAt ? 'done' : ''} ${p.late ? 'late' : ''}">
        <div class="goal-top">
          <span class="goal-emoji" aria-hidden="true">${esc(g.emoji || '🎯')}</span>
          <div class="goal-titles">
            <div class="goal-name">${esc(g.name)}</div>
            <div class="muted small">${A.forms.GOAL_KINDS[g.kind]?.[1] || ''}${g.deadline ? ` · para el ${A.u.fmtDate(g.deadline, { year: true })}` : ''}</div>
          </div>
          <button class="icon-btn" data-action="edit-goal" data-id="${g.id}" aria-label="Editar meta">✎</button>
        </div>
        <div class="goal-amounts"><b>${money(p.contributed)}</b> <span class="muted">de ${money(p.target)}</span><span class="goal-pct">${Math.floor(p.pct * 100)} %</span></div>
        <div class="goal-bar">${A.ui.bar(p.pct, g.doneAt || p.reached ? 'var(--good)' : 'var(--accent)')}${milestones}</div>
        <div class="goal-pace small ${p.late ? 'late-text' : 'muted'}">${p.late ? '⏰ ' : ''}${pace}</div>
        ${compact || g.doneAt ? '' : `<div class="btn-row goal-actions">
          <button class="btn btn-sm btn-primary" data-action="contribute" data-id="${g.id}">+ Aportar</button>
          ${p.balance > 0 ? `<button class="btn btn-sm btn-ghost" data-action="withdraw" data-id="${g.id}">Retirar</button>` : ''}
          ${p.reached ? `<button class="btn btn-sm btn-good" data-action="complete-goal" data-id="${g.id}">${g.kind === 'compra' ? '🛍️ Comprar' : '🏅 Marcar cumplida'}</button>` : ''}
        </div>`}
      </article>`;
  }

  /** Fila de presupuesto de una categoría: gastado vs. límite con semáforo. */
  function budgetRow(x, { editable = false, base = 0 } = {}) {
    const c = x.cat;
    const color = A.store.catColor(c);
    const pctTxt = c.budget ? (c.budget.mode === 'pct' ? `${c.budget.value} %` : base ? `≈ ${Math.round(c.budget.value / base * 100)} %` : 'fijo') : '';
    const rest = x.limit != null ? x.limit - x.spent : null;
    return `
      <div class="budget-row st-row-${x.status}">
        <div class="budget-head">
          <span class="budget-name">${A.ui.dot(color)}${esc(c.icon || '')} ${esc(c.name)}</span>
          ${editable && pctTxt && x.limit != null ? `<span class="budget-limit muted small">${pctTxt}</span>` : ''}
          <span class="budget-value"><b>${money(x.spent)}</b> <span class="muted">${x.limit != null ? `/ ${money(x.limit)}` : c.budget ? `· ${c.budget.value} % del ingreso` : '· sin límite'}</span></span>
          ${editable ? `<button class="icon-btn sm" data-action="edit-category" data-id="${c.id}" aria-label="Editar ${esc(c.name)}">✎</button>` : ''}
        </div>
        ${x.limit != null ? A.ui.bar(x.ratio, A.ui.statusColor(x.status), { label: c.name }) : '<div class="progress progress-none"></div>'}
        ${x.limit != null ? `<div class="budget-foot small">${A.ui.statusPill(x.status)}<span class="muted">${rest >= 0 ? `Te quedan ${money(rest)}` : `Te pasaste ${money(-rest)}`}</span></div>` : ''}
      </div>`;
  }

  return { levelCard, streakCard, allowanceCard, movementRow, movementList, movementsByDay, goalCard, budgetRow };
})();
