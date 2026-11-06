/* Vista "Recompensas": saldo, tope del mes, permisos, reglas con su progreso e historial. */
window.B = window.B || {};
B.views = B.views || {};

B.views.rewards = (() => {
  const { esc, uid } = B.u;
  const R = B.rewards;
  const S = () => B.store.state;
  const ICON = { hours: '⏱️', task: '✅', goal: '🎯', streak: '🔥', habits: '📋' };
  const parseMoney = (v) => Number(String(v || '').replace(/[^\d]/g, '')) || 0;

  // ---------- Pantalla ----------
  function render(el) {
    const state = S();
    const bal = R.balances(state);
    const cap = Number(state.settings.rewardMonthlyCap) || 0;
    const month = R.monthEarned(state, Date.now());
    // Las recompensas que el tope dejó en $0 se guardan (para no volver a darlas) pero no se listan.
    const hiddenByCap = state.rewardEvents.filter((e) => e.capped && !e.amount && e.kind === 'money').length;
    const events = state.rewardEvents.filter((e) => !(e.capped && !e.amount && e.kind === 'money')).sort((a, b) => b.at - a.at);

    el.innerHTML = `
      <div class="grid-3">
        <section class="card reward-balance">
          <span class="stat-label">Saldo para gastar</span>
          <span class="tile-value money ${bal.money < 0 ? 'neg' : ''}">${R.money(bal.money)}</span>
          <span class="muted small">Ganado ${R.money(bal.moneyEarned)} · usado ${R.money(bal.moneyUsed)}</span>
          <div class="btn-row"><button class="btn btn-primary btn-sm" data-action="rw-redeem-money" ${bal.money > 0 ? '' : 'disabled'}>Usar dinero</button></div>
        </section>
        <section class="card">
          <header class="card-head"><h3>Tope del mes</h3><button class="icon-btn" data-action="rw-cap" aria-label="Cambiar tope" data-tip="Cambiar tope">✎</button></header>
          ${cap > 0 ? `
            <div class="cap-line"><b>${R.money(month)}</b> <span class="muted">de ${R.money(cap)}</span></div>
            ${B.ui.bar(month / cap, month >= cap ? 'var(--warn)' : 'var(--good)', { label: 'Tope del mes' })}
            <p class="muted small">${month >= cap ? 'Llegaste al tope: el dinero vuelve a contar el 1 del próximo mes. Los permisos siguen sumando.' : `Puedes ganar ${R.money(cap - month)} más este mes.`}</p>`
          : '<p class="muted small">Sin tope: todo lo que ganes en dinero suma.</p>'}
        </section>
        <section class="card">
          <header class="card-head"><h3>Permisos</h3></header>
          ${bal.permits.length ? `<ul class="permit-list">${bal.permits.map((p) => `
            <li>
              <span class="permit-qty">${R.num(p.balance)} ${esc(p.unit)}</span>
              <span class="permit-label">${esc(p.label)}</span>
              <button class="btn btn-ghost btn-sm" data-action="rw-redeem-permit" data-key="${esc(p.key)}" ${p.balance > 0 ? '' : 'disabled'}>Usar</button>
            </li>`).join('')}</ul>`
          : '<p class="empty-small">Aún no has ganado permisos.</p>'}
        </section>
      </div>

      <section class="card">
        <header class="card-head"><h3>Reglas</h3><button class="btn btn-primary btn-sm" data-action="rw-new-rule">+ Nueva regla</button></header>
        ${state.rewardRules.length ? `<ul class="rule-list">${state.rewardRules.map((r) => ruleRow(state, r)).join('')}</ul>`
          : '<p class="empty-small">No tienes reglas. Crea una, por ejemplo: cada 10 h de estudio → $15.000.</p>'}
      </section>

      <section class="card">
        <header class="card-head"><h3>Historial</h3><span class="muted small">${B.u.plural(events.length, 'movimiento', 'movimientos')}</span></header>
        ${events.length ? `<ul class="ledger">${events.map(eventRow).join('')}</ul>` : '<p class="empty-small">Aquí aparecerá lo que ganes y lo que uses.</p>'}
        ${hiddenByCap ? `<p class="muted small">${B.u.plural(hiddenByCap, 'recompensa no sumó', 'recompensas no sumaron')} dinero porque ya estabas en el tope del mes.</p>` : ''}
      </section>`;
  }

  function ruleRow(state, r) {
    let progress = '';
    if (r.trigger === 'hours' && r.active) {
      const p = R.hoursProgress(state, r);
      progress = `
        <div class="rule-progress">
          <div class="rule-progress-text"><span>${B.u.durCompact(p.into)} / ${R.hoursText(r.hours)}</span><span class="muted">${p.count ? `Ganada ${B.u.plural(p.count, 'vez', 'veces')}` : ''}</span></div>
          <div data-live-rule="${r.id}">${B.ui.bar(p.pct, 'var(--accent)')}</div>
        </div>`;
    } else {
      const n = state.rewardEvents.filter((e) => e.type === 'earn' && e.ruleId === r.id).length;
      if (n) progress = `<div class="muted small">Ganada ${B.u.plural(n, 'vez', 'veces')}</div>`;
    }
    return `
      <li class="rule ${r.active ? '' : 'paused'}">
        <div class="rule-icon" aria-hidden="true">${ICON[r.trigger] || '🎁'}</div>
        <div class="rule-main">
          <div class="rule-text">${esc(R.triggerText(state, r))} <span class="rule-arrow">→</span> <b>${esc(R.rewardText(r.reward))}</b>${r.for ? ` <span class="muted">para ${esc(r.for)}</span>` : ''}
            ${r.active ? '' : '<span class="pill pill-paused">pausada</span>'}</div>
          ${progress}
        </div>
        <div class="rule-actions">
          <button class="icon-btn" data-action="rw-toggle-rule" data-id="${r.id}" aria-label="${r.active ? 'Pausar' : 'Activar'} regla" data-tip="${r.active ? 'Pausar' : 'Activar (cuenta desde ahora)'}">${r.active ? '❚❚' : '▶'}</button>
          <button class="icon-btn" data-action="rw-edit-rule" data-id="${r.id}" aria-label="Editar regla">✎</button>
        </div>
      </li>`;
  }

  function eventRow(e) {
    const earn = e.type === 'earn';
    const sign = earn ? '+' : '−';
    const detail = earn ? e.reason : (e.note || 'Usado');
    return `
      <li class="ledger-row ${earn ? 'earn' : 'redeem'} ${e.voided ? 'voided' : ''}">
        <span class="ledger-date muted small">${B.u.fmtDate(e.at, { weekday: true })} · ${B.u.fmtTime(e.at)}</span>
        <span class="ledger-detail">${esc(detail)}${earn && e.for ? ` <span class="muted">· para ${esc(e.for)}</span>` : ''}
          ${e.capped ? `<span class="pill pill-cap" data-tip="Iban a ser ${R.money(e.originalAmount)}; se recortó por el tope del mes">tope</span>` : ''}
          ${e.voided ? '<span class="pill pill-paused">anulado</span>' : ''}</span>
        <span class="ledger-amount">${sign}${esc(R.eventText(e))}</span>
        ${earn
          ? `<button class="icon-btn sm" data-action="rw-void" data-id="${e.id}" aria-label="${e.voided ? 'Restaurar' : 'Anular'}" data-tip="${e.voided ? 'Restaurar' : 'Anular (no cuenta en el saldo)'}">${e.voided ? '↺' : '⊘'}</button>`
          : `<button class="icon-btn sm" data-action="rw-del-redeem" data-id="${e.id}" aria-label="Borrar" data-tip="Borrar este uso">✕</button>`}
      </li>`;
  }

  /** Resumen compacto para la pantalla del Reloj. */
  function summaryCard(state) {
    if (!state.rewardRules.length && !state.rewardEvents.length) return '';
    const bal = R.balances(state);
    const next = state.rewardRules.filter((r) => r.active && r.trigger === 'hours')
      .map((r) => ({ r, p: R.hoursProgress(state, r) }))
      .sort((a, b) => b.p.pct - a.p.pct);
    return `
      <section class="card">
        <header class="card-head"><h3>Recompensas</h3><button class="link" data-action="go" data-route="recompensas">Ver</button></header>
        <div class="reward-mini">
          <div><span class="muted small">Saldo</span><b>${R.money(bal.money)}</b></div>
          ${bal.permits.filter((p) => p.balance > 0).map((p) => `<div><span class="muted small">${esc(p.label)}</span><b>${R.num(p.balance)} ${esc(p.unit)}</b></div>`).join('')}
        </div>
        ${next.slice(0, 2).map(({ r, p }) => `
          <div class="goal">
            <div class="goal-head"><span class="goal-label">${esc(R.rewardText(r.reward))}${r.for ? ` · ${esc(r.for)}` : ''}</span>
              <span class="goal-value" data-live-rule-text="${r.id}">${B.u.durCompact(p.into)} / ${R.hoursText(r.hours)}</span></div>
            <div data-live-rule="${r.id}">${B.ui.bar(p.pct, 'var(--good)')}</div>
          </div>`).join('')}
      </section>`;
  }

  /** Actualiza cada segundo las barras de reglas por horas visibles. */
  function tick(state) {
    for (const r of state.rewardRules) {
      if (r.trigger !== 'hours' || !r.active) continue;
      const bars = document.querySelectorAll(`[data-live-rule="${r.id}"] .progress-fill`);
      if (!bars.length) continue;
      const p = R.hoursProgress(state, r);
      bars.forEach((b) => { b.style.width = `${(p.pct * 100).toFixed(1)}%`; });
      document.querySelectorAll(`[data-live-rule-text="${r.id}"]`).forEach((x) => { x.textContent = `${B.u.durCompact(p.into)} / ${R.hoursText(r.hours)}`; });
    }
  }

  // ---------- Formularios ----------
  function scopeOptions(scope, targetId) {
    const st = S();
    const cur = scope === 'category' ? `cat:${targetId}` : scope === 'area' ? `area:${targetId}` : scope === 'categories' ? 'multi' : 'total';
    const opt = (v, l) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
    return opt('total', 'Todo el estudio') + opt('multi', 'Elegir varias categorías…')
      + (st.categories.length ? `<optgroup label="Categorías">${st.categories.map((c) => opt(`cat:${c.id}`, c.name)).join('')}</optgroup>` : '')
      + (st.areas.length ? `<optgroup label="Áreas">${st.areas.map((a) => opt(`area:${a.id}`, a.name)).join('')}</optgroup>` : '');
  }
  function parseScope(v, ids) {
    if (v === 'multi') return { scope: 'categories', targetId: null, targetIds: ids };
    if (v && v.startsWith('cat:')) return { scope: 'category', targetId: v.slice(4) };
    if (v && v.startsWith('area:')) return { scope: 'area', targetId: v.slice(5) };
    return { scope: 'total', targetId: null };
  }

  function ruleForm(rule) {
    const isNew = !rule;
    const r = rule || { trigger: 'hours', scope: 'total', targetId: null, hours: 10, priority: 'any', goalId: null, streakDays: 7, reward: { kind: 'money', amount: 15000, quantity: 2, unit: 'h', label: '' }, for: '', active: true };
    const rw = r.reward || {};
    const goals = S().goals;
    B.ui.modal({
      title: isNew ? 'Nueva regla de recompensa' : 'Editar regla',
      wide: true,
      body: `
        <div class="field"><span>Se gana…</span>
          <div class="segmented">
            ${[['hours', '⏱️ Por horas'], ['task', '✅ Por tareas'], ['goal', '🎯 Por metas'], ['streak', '🔥 Por racha'], ['habits', '📋 Por hábitos']].map(([v, l]) => `<label><input type="radio" name="trigger" value="${v}" ${v === r.trigger ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          </div>
        </div>
        <div class="field-row">
          <label class="field" data-when="hours"><span>Cada cuántas horas</span><input type="number" name="hours" min="0.25" step="0.25" value="${r.hours ?? 10}"></label>
          <label class="field" data-when="task"><span>Prioridad de la tarea</span>
            <select name="priority">${[['any', 'Cualquiera'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']].map(([v, l]) => `<option value="${v}" ${v === (r.priority || 'any') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field" data-when="hours task"><span>De qué</span><select name="scopeSel">${scopeOptions(r.scope, r.targetId)}</select></label>
          <label class="field" data-when="goal"><span>Qué meta</span>
            <select name="goalId"><option value="">Cualquier meta</option>
              <option value="any-day" ${r.goalId === 'any-day' ? 'selected' : ''}>Cualquier meta diaria</option>
              <option value="any-week" ${r.goalId === 'any-week' ? 'selected' : ''}>Cualquier meta semanal</option>
              ${goals.map((g) => `<option value="${g.id}" ${g.id === r.goalId ? 'selected' : ''}>${esc(R.goalName(S(), g))}</option>`).join('')}</select></label>
          <label class="field" data-when="habits"><span>Cuándo se gana</span>
            <select name="habitMode">${[['approved', 'Cada día aprobado'], ['perfect', 'Cada día perfecto (100 %)'], ['streak', 'Cada N días aprobados seguidos']].map(([v, l]) => `<option value="${v}" ${v === (r.habitMode || 'approved') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field" data-when="streak habits" data-streakdays><span>Cada cuántos días seguidos</span><input type="number" name="streakDays" min="1" max="365" value="${r.streakDays || 7}"></label>
        </div>
        <div class="field" data-multi>
          <span>Categorías que cuentan</span>
          ${B.ui.categoryChecks(r.scope === 'categories' ? r.targetIds : S().categories.map((c) => c.id))}
          <p class="hint">Si creas una categoría nueva, márcala aquí para que cuente.</p>
        </div>

        <div class="field"><span>Premio</span>
          <div class="segmented">
            ${[['money', '💵 Dinero'], ['permit', '🎮 Permiso']].map(([v, l]) => `<label><input type="radio" name="kind" value="${v}" ${v === (rw.kind || 'money') ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          </div>
        </div>
        <div class="field-row" data-kind="money">
          <label class="field"><span>Monto (COP)</span><input name="amount" inputmode="numeric" value="${rw.amount ? Number(rw.amount).toLocaleString('es-CO') : ''}" placeholder="15.000"></label>
          <label class="field"><span>Para qué <em>(opcional)</em></span><input name="for" maxlength="60" value="${esc(r.for)}" placeholder="recreación, un libro…"></label>
        </div>
        <div class="permit-row" data-kind="permit">
          <label class="field"><span>Cantidad</span><input type="number" name="quantity" min="0.25" step="0.25" value="${rw.quantity ?? 2}"></label>
          <label class="field"><span>Unidad</span><input name="unit" maxlength="20" list="unit-list" value="${esc(rw.unit ?? 'h')}" placeholder="h, min, capítulos…"></label>
          <label class="field"><span>De qué</span><input name="label" maxlength="40" value="${esc(rw.label)}" placeholder="videojuegos"></label>
          <datalist id="unit-list"><option value="h"><option value="min"><option value="capítulos"><option value="veces"><option value="salidas"></datalist>
        </div>
        <p class="rule-preview" data-preview></p>
        ${isNew ? '<p class="hint">Empieza a contar desde el inicio de hoy (también cuentan las sesiones de hoy que añadas a mano).</p>' : `
          <label class="check-line"><input type="checkbox" name="active" ${r.active ? 'checked' : ''}> Activa</label>
          <p class="hint">Si cambias la condición (no el premio), el conteo vuelve a empezar desde ahora. Lo ya ganado se conserva.</p>`}`,
      onMount: (form) => {
        const sync = () => {
          const trig = form.querySelector('[name=trigger]:checked').value;
          const kind = form.querySelector('[name=kind]:checked').value;
          form.querySelectorAll('[data-when]').forEach((x) => { x.hidden = !x.dataset.when.split(' ').includes(trig); });
          form.querySelectorAll('[data-kind]').forEach((x) => { x.hidden = x.dataset.kind !== kind; });
          if (trig === 'habits') form.querySelector('[data-streakdays]').hidden = form.habitMode.value !== 'streak';
          form.querySelector('[data-multi]').hidden = !['hours', 'task'].includes(trig) || form.scopeSel.value !== 'multi';
          const draft = build(form);
          form.querySelector('[data-preview]').innerHTML = `${esc(R.triggerText(S(), draft))} → <b>${esc(R.rewardText(draft.reward) || '…')}</b>${draft.for ? ` para ${esc(draft.for)}` : ''}`;
        };
        form.addEventListener('input', sync);
        form.addEventListener('change', sync);
        form.amount.addEventListener('blur', () => { const n = parseMoney(form.amount.value); form.amount.value = n ? n.toLocaleString('es-CO') : ''; });
        sync();
      },
      onSubmit: (d, form) => {
        const draft = build(form);
        if (draft.scope === 'categories' && !draft.targetIds.length) return B.ui.fieldError(form, 'cats', 'Marca al menos una categoría.');
        if (draft.trigger === 'hours' && !(draft.hours > 0)) return B.ui.fieldError(form, 'hours', 'Pon un número de horas mayor que 0.');
        if ((draft.trigger === 'streak' || (draft.trigger === 'habits' && draft.habitMode === 'streak')) && !(draft.streakDays >= 1)) return B.ui.fieldError(form, 'streakDays', 'Mínimo 1 día.');
        if (draft.reward.kind === 'money' && !(draft.reward.amount > 0)) return B.ui.fieldError(form, 'amount', 'Pon un monto.');
        if (draft.reward.kind === 'permit') {
          if (!(draft.reward.quantity > 0)) return B.ui.fieldError(form, 'quantity', 'Pon una cantidad.');
          if (!draft.reward.label) return B.ui.fieldError(form, 'label', '¿Permiso para qué? (p. ej. videojuegos)');
        }
        const now = Date.now();
        B.store.update((st) => {
          if (isNew) { st.rewardRules.push({ id: uid(), ...draft, active: true, since: B.u.startOfDay(now), createdAt: now }); return; }
          const x = st.rewardRules.find((y) => y.id === rule.id);
          const keys = ['trigger', 'scope', 'targetId', 'targetIds', 'hours', 'priority', 'goalId', 'streakDays', 'habitMode'];
          const changed = keys.some((k) => JSON.stringify(x[k] ?? null) !== JSON.stringify(draft[k] ?? null));
          const reactivated = !x.active && !!d.active;
          Object.assign(x, draft, { active: !!d.active });
          if (changed || reactivated) x.since = now;
        });
      },
      onDelete: isNew ? null : async () => {
        if (!(await B.ui.confirm('Se eliminará esta regla. Lo que ya ganaste con ella se conserva en el historial.'))) return false;
        B.store.update((st) => { st.rewardRules = st.rewardRules.filter((x) => x.id !== rule.id); });
      },
    });
  }

  function build(form) {
    const fd = new FormData(form);
    const d = Object.fromEntries(fd);
    const trigger = d.trigger || 'hours';
    const scoped = trigger === 'hours' || trigger === 'task';
    const { scope, targetId, targetIds } = scoped ? parseScope(d.scopeSel, fd.getAll('cats')) : { scope: 'total', targetId: null };
    const kind = d.kind || 'money';
    return {
      trigger,
      scope,
      targetId,
      targetIds: scope === 'categories' ? targetIds : null,
      hours: Number(d.hours) || 0,
      priority: d.priority || 'any',
      goalId: d.goalId || null,
      streakDays: Math.round(Number(d.streakDays) || 0),
      habitMode: trigger === 'habits' ? (d.habitMode || 'approved') : null,
      for: (d.for || '').trim(),
      reward: kind === 'permit'
        ? { kind, quantity: Number(d.quantity) || 0, unit: (d.unit || '').trim(), label: (d.label || '').trim() }
        : { kind, amount: parseMoney(d.amount) },
    };
  }

  function redeemMoney() {
    const bal = R.balances().money;
    B.ui.modal({
      title: 'Usar dinero de recompensas',
      body: `
        <p class="muted small">Disponible: <b>${R.money(bal)}</b></p>
        <label class="field"><span>Monto (COP)</span><input name="amount" inputmode="numeric" placeholder="20.000"></label>
        <label class="field"><span>¿En qué lo usaste? <em>(opcional)</em></span><input name="note" maxlength="100" placeholder="Cine con amigos"></label>`,
      submitLabel: 'Registrar',
      onSubmit: (d, form) => {
        const amount = parseMoney(d.amount);
        if (!amount) return B.ui.fieldError(form, 'amount', 'Pon un monto.');
        if (amount > bal) return B.ui.fieldError(form, 'amount', `Solo tienes ${R.money(bal)} disponibles.`);
        R.redeem({ kind: 'money', amount, note: d.note.trim() });
        B.ui.toast(`Disfrútalo 🎉 Te quedan ${R.money(bal - amount)}.`, 'success');
      },
    });
  }

  function redeemPermit(key) {
    const permits = R.balances().permits.filter((p) => p.balance > 0);
    if (!permits.length) return;
    const sel = permits.find((p) => p.key === key) || permits[0];
    B.ui.modal({
      title: 'Usar un permiso',
      body: `
        <label class="field"><span>Permiso</span><select name="key">${permits.map((p) => `<option value="${esc(p.key)}" ${p === sel ? 'selected' : ''}>${esc(p.label)} (te quedan ${R.num(p.balance)} ${esc(p.unit)})</option>`).join('')}</select></label>
        <label class="field"><span>Cantidad</span><input type="number" name="quantity" min="0.25" step="0.25" value="${Math.min(1, sel.balance)}"></label>
        <label class="field"><span>Nota <em>(opcional)</em></span><input name="note" maxlength="100" placeholder="Partida con amigos"></label>`,
      submitLabel: 'Registrar',
      onSubmit: (d, form) => {
        const p = permits.find((x) => x.key === d.key);
        const q = Number(d.quantity) || 0;
        if (!(q > 0)) return B.ui.fieldError(form, 'quantity', 'Pon una cantidad.');
        if (q > p.balance + 1e-9) return B.ui.fieldError(form, 'quantity', `Solo te quedan ${R.num(p.balance)} ${p.unit}.`);
        R.redeem({ kind: 'permit', quantity: q, label: p.label, unit: p.unit, note: d.note.trim() });
        B.ui.toast(`¡A disfrutar! Te quedan ${R.num(Math.round((p.balance - q) * 100) / 100)} ${p.unit} de ${p.label}.`, 'success');
      },
    });
  }

  function capForm() {
    const cap = Number(S().settings.rewardMonthlyCap) || 0;
    B.ui.modal({
      title: 'Tope mensual de dinero',
      body: `
        <label class="field"><span>Máximo que puedes ganar en dinero cada mes (COP)</span>
          <input name="cap" inputmode="numeric" value="${cap ? cap.toLocaleString('es-CO') : ''}" placeholder="200.000"></label>
        <p class="hint">Déjalo vacío o en 0 para no tener tope. El mes es el calendario (del 1 al último día). Los permisos no tienen tope.</p>`,
      onSubmit: (d) => { B.store.update((st) => { st.settings.rewardMonthlyCap = parseMoney(d.cap); }); },
    });
  }

  function handle(action, ds) {
    const st = S();
    switch (action) {
      case 'rw-new-rule': ruleForm(null); return 'done';
      case 'rw-edit-rule': ruleForm(st.rewardRules.find((r) => r.id === ds.id)); return 'done';
      case 'rw-toggle-rule':
        B.store.update((s) => {
          const r = s.rewardRules.find((x) => x.id === ds.id);
          r.active = !r.active;
          if (r.active) r.since = Date.now();
        });
        return 'done';
      case 'rw-redeem-money': redeemMoney(); return 'done';
      case 'rw-redeem-permit': redeemPermit(ds.key); return 'done';
      case 'rw-cap': capForm(); return 'done';
      case 'rw-void':
        B.store.update((s) => { const e = s.rewardEvents.find((x) => x.id === ds.id); e.voided = !e.voided; });
        return 'done';
      case 'rw-del-redeem':
        B.ui.confirm('Se borrará este uso y el saldo volverá a subir.').then((ok) => {
          if (ok) B.store.update((s) => { s.rewardEvents = s.rewardEvents.filter((x) => x.id !== ds.id); });
        });
        return 'done';
      default: return false;
    }
  }

  return { render, handle, summaryCard, tick };
})();
