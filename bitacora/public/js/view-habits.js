/* Vista "Hábitos": registro del día, semana, racha y hábitos por mejorar. */
window.B = window.B || {};
B.views = B.views || {};

B.views.habits = (() => {
  const { esc, uid } = B.u;
  const Hb = B.habits;
  const S = () => B.store.state;
  const ui = { day: null }; // null = hoy (día lógico)

  const currentDay = () => ui.day ?? Hb.logicalToday();

  function dayTitle(day) {
    const today = Hb.logicalToday();
    const diff = Math.round((day - today) / 864e5);
    const base = `${B.u.WEEKDAYS_LONG[B.u.weekdayIndex(day)]} ${B.u.fmtDate(day)}`;
    if (diff === 0) return `Hoy · ${base}`;
    if (diff === -1) return `Ayer · ${base}`;
    return base[0].toUpperCase() + base.slice(1);
  }

  function scoreBlock(state, day) {
    const sc = Hb.dayScore(state, day);
    const th = Hb.threshold(state);
    let msg;
    if (!sc.total) msg = 'No hay hábitos programados este día.';
    else if (sc.perfect) msg = '🌟 ¡Día perfecto!';
    else if (sc.approved) msg = `✓ Día aprobado (mínimo ${Math.round(th * 100)} %)`;
    else msg = `Te ${sc.needed - sc.done === 1 ? 'falta 1' : `faltan ${sc.needed - sc.done}`} para aprobar el día (${sc.needed} de ${sc.total})`;
    return `
      <div class="habit-score ${sc.approved ? 'ok' : ''}">
        <div class="habit-score-num"><b>${sc.done}</b><span>/ ${sc.total}</span></div>
        <div class="habit-score-bar">
          <div class="progress progress-lg"><div class="progress-fill" style="width:${(sc.pct * 100).toFixed(1)}%;background:${sc.approved ? 'var(--good)' : 'var(--accent)'}"></div>
            <span class="threshold-mark" style="left:${th * 100}%" data-tip="Mínimo para aprobar: ${Math.round(th * 100)} %"></span></div>
          <div class="habit-score-msg">${msg}</div>
        </div>
      </div>`;
  }

  function habitRow(state, h, day, done) {
    const checked = done.has(h.id);
    const st = Hb.habitStreak(state, h);
    const weekly = Hb.isWeekly(h);
    const sub = weekly
      ? `${Hb.weekCount(state, h, day)} de ${h.schedule.times} esta semana${Hb.weekMet(state, h, day) ? ' ✓' : ''}`
      : (h.schedule?.type === 'days' ? Hb.scheduleText(h) : '');
    return `
      <li class="habit ${checked ? 'done' : ''}">
        <label class="habit-check">
          <input type="checkbox" data-action="habit-toggle" data-id="${h.id}" ${checked ? 'checked' : ''}>
          <span class="habit-box" aria-hidden="true"></span>
          <span class="habit-text">
            <span class="habit-name">${esc(Hb.display(h))}</span>
            ${sub || h.note ? `<span class="habit-sub">${esc(sub)}${sub && h.note ? ' · ' : ''}${h.note ? esc(h.note) : ''}</span>` : ''}
          </span>
        </label>
        ${st.n >= 2 ? `<span class="habit-streak" data-tip="Racha: ${st.n} ${st.unit} seguidos">🔥 ${st.n}</span>` : ''}
        <button class="icon-btn sm" data-action="habit-edit" data-id="${h.id}" aria-label="Editar hábito">✎</button>
      </li>`;
  }

  function weekGrid(state, day) {
    const w0 = B.u.startOfWeek(day);
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => B.u.addDays(w0, i));
    const today = Hb.logicalToday();
    const head = days.map((d) => `<th><button class="grid-day ${d === day ? 'sel' : ''}" data-action="habit-day" data-day="${d}" aria-label="${B.u.fmtDate(d, { weekday: true })}">${B.u.WEEKDAYS[B.u.weekdayIndex(d)][0].toUpperCase()}<small>${new Date(d).getDate()}</small></button></th>`).join('');
    const scoreRow = days.map((d) => {
      if (d > today) return '<td></td>';
      const sc = Hb.dayScore(state, d);
      if (!sc.total) return '<td></td>';
      return `<td><span class="day-pill ${sc.approved ? 'ok' : 'no'}" data-tip="${sc.done}/${sc.total} · ${Math.round(sc.pct * 100)} %">${Math.round(sc.pct * 100)}</span></td>`;
    }).join('');
    const rows = state.habits.filter((h) => B.u.addDays(w0, 6) >= B.u.startOfDay(h.createdAt || 0)).map((h) => {
      const cells = days.map((d) => {
        if (d > today || !Hb.shownOn(h, d)) return '<td><span class="cell cell-off"></span></td>';
        const ok = Hb.doneSet(state, d).has(h.id);
        return `<td><span class="cell ${ok ? 'cell-ok' : Hb.isWeekly(h) ? 'cell-opt' : 'cell-miss'}" data-tip="${esc(Hb.display(h))} · ${B.u.fmtDate(d, { weekday: true })}: ${ok ? 'cumplido' : 'no'}"></span></td>`;
      }).join('');
      return `<tr><th class="grid-name" title="${esc(Hb.display(h))}">${esc(Hb.display(h))}</th>${cells}</tr>`;
    }).join('');
    return `
      <table class="habit-grid">
        <thead><tr><th></th>${head}</tr></thead>
        <tbody><tr class="score-row"><th class="grid-name">% del día</th>${scoreRow}</tr>${rows}</tbody>
      </table>`;
  }

  function render(el) {
    const state = S();
    const day = currentDay();
    const today = Hb.logicalToday();
    if (!state.habits.length) {
      el.innerHTML = `<div class="empty card"><h2>Aún no tienes hábitos</h2><p>Los hábitos son objetivos que se repiten: dormir temprano, tomar agua, ir al gym…</p>
        <button class="btn btn-primary" data-action="habit-new">+ Nuevo hábito</button></div>`;
      return;
    }
    const done = Hb.doneSet(state, day);
    const shown = state.habits.filter((h) => Hb.shownOn(h, day));
    const notToday = state.habits.filter((h) => !Hb.shownOn(h, day) && day >= B.u.startOfDay(h.createdAt || 0));
    const streak = Hb.approvedStreak(state);
    const best = Math.max(Hb.bestApprovedStreak(state), streak.current);
    const m0 = B.u.startOfMonth(day), m1 = B.u.addMonths(m0, 1);
    let mApproved = 0, mDays = 0;
    for (let d = Math.max(m0, Hb.firstDay(state)); d < m1 && d <= today; d = B.u.addDays(d, 1)) {
      const sc = Hb.dayScore(state, d);
      if (!sc.total) continue;
      mDays++; if (sc.approved) mApproved++;
    }
    // Hábitos a mejorar: últimos 30 días, con al menos 3 días programados
    const a30 = B.u.addDays(today, -29), b30 = B.u.addDays(today, 1);
    const rates = state.habits.map((h) => ({ h, r: Hb.rate(state, h, a30, b30) })).filter((x) => x.r.scheduled >= 3).sort((x, y) => x.r.pct - y.r.pct);

    el.innerHTML = `
      <div class="habits-layout">
        <section class="card habits-main">
          <header class="habits-head">
            <div class="period-nav">
              <button class="icon-btn" data-action="habit-shift" data-v="-1" aria-label="Día anterior">‹</button>
              <strong class="day-title">${dayTitle(day)}</strong>
              <button class="icon-btn" data-action="habit-shift" data-v="1" aria-label="Día siguiente" ${day >= today ? 'disabled' : ''}>›</button>
              ${day !== today ? '<button class="btn btn-ghost btn-sm" data-action="habit-today">Ir a hoy</button>' : ''}
            </div>
            <button class="btn btn-ghost btn-sm" data-action="habit-new">+ Hábito</button>
          </header>
          ${scoreBlock(state, day)}
          ${Hb.MOMENTS.map(([key, label, icon]) => {
            const list = shown.filter((h) => (h.moment || 'dia') === key);
            if (!list.length) return '';
            return `<div class="habit-group"><h3>${icon} ${label}</h3><ul class="habit-list">${list.map((h) => habitRow(state, h, day, done)).join('')}</ul></div>`;
          }).join('')}
          ${notToday.length ? `<p class="muted small not-today">No toca este día: ${notToday.map((h) => esc(Hb.display(h))).join(', ')}.</p>` : ''}
        </section>

        <aside class="side-col">
          <section class="card">
            <div class="streak ${streak.current ? 'on' : ''}">
              <div class="streak-flame" aria-hidden="true">🔥</div>
              <div><div class="streak-num">${B.u.plural(streak.current, 'día aprobado', 'días aprobados')} seguidos</div>
                <div class="muted small">Mejor: ${best}. Este mes: ${mApproved} de ${mDays} días aprobados.</div></div>
            </div>
            <p class="muted small threshold-line">Un día se aprueba con el <b>${Math.round(Hb.threshold(state) * 100)} %</b> de los hábitos que tocan.
              <button class="link" data-action="habit-threshold">Cambiar</button></p>
          </section>
          <section class="card">
            <header class="card-head"><h3>Semana</h3><span class="muted small">Toca un día para verlo</span></header>
            <div class="grid-scroll">${weekGrid(state, day)}</div>
          </section>
          ${rates.length ? `
          <section class="card">
            <header class="card-head"><h3>Últimos 30 días</h3><span class="muted small">Del más difícil al más fácil</span></header>
            ${rates.map(({ h, r }) => `
              <div class="hbar hbar-compact">
                <div class="hbar-label"><span>${esc(Hb.display(h))}</span></div>
                <div class="hbar-track"><div class="hbar-fill" style="width:${(r.pct * 100).toFixed(1)}%;background:${r.pct >= Hb.threshold(state) ? 'var(--good)' : 'var(--warn)'}"></div></div>
                <div class="hbar-value">${Math.round(r.pct * 100)} %</div>
              </div>`).join('')}
          </section>` : ''}
        </aside>
      </div>`;
  }

  // ---------- Formulario ----------
  function habitForm(h) {
    const isNew = !h;
    const s = h?.schedule || { type: 'daily' };
    const days = s.type === 'days' ? s.days : [0, 1, 2, 3, 4];
    B.ui.modal({
      title: isNew ? 'Nuevo hábito' : 'Editar hábito',
      wide: true,
      body: `
        <label class="field"><span>Hábito</span><input name="name" maxlength="80" value="${esc(h?.name)}" placeholder="Ej. Dormir a las 10"></label>
        <div class="field-row">
          <label class="field"><span>Momento del día</span>
            <select name="moment">${Hb.MOMENTS.map(([v, l, i]) => `<option value="${v}" ${(h?.moment || 'dia') === v ? 'selected' : ''}>${i} ${l}</option>`).join('')}</select></label>
          <label class="field"><span>Nombre visible <em>(opcional)</em></span><input name="alias" maxlength="40" value="${esc(h?.alias)}" placeholder="Para ocultar el real"></label>
        </div>
        <div class="field"><span>¿Cuándo toca?</span>
          <div class="segmented">
            ${[['daily', 'Todos los días'], ['days', 'Ciertos días'], ['weekly', 'X veces por semana']].map(([v, l]) => `<label><input type="radio" name="stype" value="${v}" ${v === s.type ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          </div>
        </div>
        <div class="field" data-stype="days"><span>Días</span>
          <div class="cat-checks">${B.u.WEEKDAYS_LONG.map((d, i) => `<label class="cat-check"><input type="checkbox" name="days" value="${i}" ${days.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div>
        </div>
        <label class="field" data-stype="weekly"><span>¿Cuántas veces por semana para cumplirlo?</span>
          <input type="number" name="times" min="1" max="7" value="${s.times || 4}"></label>
        <p class="hint" data-stype="weekly">Aparece todos los días para marcarlo, pero no cuenta en el % diario: se cumple por semana.</p>
        <label class="field"><span>¿Qué cuenta como cumplido? <em>(opcional)</em></span>
          <input name="note" maxlength="120" value="${esc(h?.note)}" placeholder="Ej. proteína + verdura, sin fritos"></label>
        ${isNew ? '<p class="hint">Empieza a contar desde hoy.</p>' : ''}`,
      onMount: (form) => {
        const sync = () => {
          const t = form.querySelector('[name=stype]:checked').value;
          form.querySelectorAll('[data-stype]').forEach((x) => { x.hidden = x.dataset.stype !== t; });
        };
        form.addEventListener('change', sync);
        sync();
      },
      onSubmit: (d, form) => {
        const name = d.name.trim();
        if (!name) return B.ui.fieldError(form, 'name', 'Escribe el hábito.');
        const fd = new FormData(form);
        let schedule = { type: 'daily' };
        if (d.stype === 'days') {
          const ds = fd.getAll('days').map(Number);
          if (!ds.length) return B.ui.fieldError(form, 'days', 'Elige al menos un día.');
          schedule = { type: 'days', days: ds };
        } else if (d.stype === 'weekly') {
          const t = Math.round(Number(d.times) || 0);
          if (t < 1 || t > 7) return B.ui.fieldError(form, 'times', 'Entre 1 y 7.');
          schedule = { type: 'weekly', times: t };
        }
        const fields = { name, alias: d.alias.trim(), moment: d.moment, schedule, note: d.note.trim() };
        B.store.update((st) => {
          if (isNew) st.habits.push({ id: uid(), ...fields, createdAt: B.u.startOfDay(Date.now()) });
          else Object.assign(st.habits.find((x) => x.id === h.id), fields);
        });
      },
      onDelete: isNew ? null : async () => {
        const ok = await B.ui.confirm(`Se eliminará "${Hb.display(h)}" y su historial de checks.`);
        if (!ok) return false;
        B.store.update((st) => {
          st.habits = st.habits.filter((x) => x.id !== h.id);
          for (const k of Object.keys(st.habitLog)) {
            st.habitLog[k] = st.habitLog[k].filter((id) => id !== h.id);
            if (!st.habitLog[k].length) delete st.habitLog[k];
          }
        });
      },
    });
  }

  function thresholdForm() {
    B.ui.modal({
      title: 'Mínimo para aprobar el día',
      body: `
        <label class="field"><span>Porcentaje de hábitos cumplidos</span>
          <div class="inline-inputs"><input type="number" name="pct" min="10" max="100" step="5" value="${Math.round(Hb.threshold() * 100)}"> <span>%</span></div></label>
        <p class="hint">Con 11 hábitos en un día, 70 % = 8 cumplidos (puedes fallar 3).</p>`,
      onSubmit: (d, form) => {
        const v = Math.round(Number(d.pct));
        if (!(v >= 10 && v <= 100)) return B.ui.fieldError(form, 'pct', 'Entre 10 y 100.');
        B.store.update((st) => { st.settings.habitThreshold = v; });
      },
    });
  }

  /** Resumen para la pantalla del Reloj. */
  function summaryCard(state) {
    if (!state.habits.length) return '';
    const sc = Hb.dayScore(state, Hb.logicalToday());
    return `
      <section class="card">
        <header class="card-head"><h3>Hábitos de hoy</h3><button class="link" data-action="go" data-route="habitos">Registrar</button></header>
        <div class="goal-head"><span class="goal-label">${sc.perfect ? '🌟 Día perfecto' : sc.approved ? '✓ Día aprobado' : `Faltan ${Math.max(0, sc.needed - sc.done)} para aprobar`}</span>
          <span class="goal-value">${sc.done} / ${sc.total}</span></div>
        ${B.ui.bar(sc.pct, sc.approved ? 'var(--good)' : 'var(--accent)')}
      </section>`;
  }

  function handle(action, ds) {
    switch (action) {
      case 'habit-toggle': Hb.toggle(currentDay(), ds.id); return 'done';
      case 'habit-shift': {
        const next = B.u.addDays(currentDay(), Number(ds.v));
        ui.day = next >= Hb.logicalToday() ? null : next;
        return true;
      }
      case 'habit-today': ui.day = null; return true;
      case 'habit-day': { const d = Number(ds.day); ui.day = d >= Hb.logicalToday() ? null : d; return true; }
      case 'habit-new': habitForm(null); return 'done';
      case 'habit-edit': habitForm(S().habits.find((h) => h.id === ds.id)); return 'done';
      case 'habit-threshold': thresholdForm(); return 'done';
      default: return false;
    }
  }

  return { render, handle, summaryCard };
})();
