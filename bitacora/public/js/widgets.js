/* Bloques compartidos entre vistas: nivel, racha, metas, fila de sesión, fila de tarea. */
window.B = window.B || {};

B.widgets = (() => {
  const { esc } = B.u;
  const expanded = new Set(); // tareas con la descripción desplegada

  function levelCard(state) {
    const lv = B.stats.level(state);
    return `
      <div class="level">
        <div class="level-badge" aria-hidden="true">${lv.level}</div>
        <div class="level-info">
          <div class="level-title">Nivel ${lv.level} · ${B.stats.levelTitle(lv.level)}</div>
          ${B.ui.bar(lv.pct, 'var(--accent)', { label: 'Progreso al siguiente nivel' })}
          <div class="muted small" data-live="xp">${lv.into} / ${lv.needed} XP para el nivel ${lv.level + 1}</div>
        </div>
      </div>`;
  }

  function streakCard(state) {
    const st = B.stats.streaks(state);
    const msg = st.current === 0
      ? `Estudia ${st.minMinutes} min hoy para empezar una racha.`
      : st.todayOk ? '¡Hoy ya cuenta!' : `Estudia ${st.minMinutes} min hoy para no perderla.`;
    return `
      <div class="streak ${st.current ? 'on' : ''}">
        <div class="streak-flame" aria-hidden="true">🔥</div>
        <div>
          <div class="streak-num">${B.u.plural(st.current, 'día', 'días')} de racha</div>
          <div class="muted small">${msg} Mejor: ${st.best}.</div>
        </div>
      </div>`;
  }

  function goalColor(state, g) {
    if (g.scope === 'category') return B.store.catColor(B.store.category(g.targetId));
    if (g.scope === 'area') return B.store.areaColor(g.targetId);
    return 'var(--accent)';
  }

  function goalRow(state, g, { editable = false } = {}) {
    const p = B.stats.goalProgress(state, g);
    return `
      <div class="goal ${p.met ? 'met' : ''}" data-goal="${g.id}">
        <div class="goal-head">
          <span class="goal-label">${B.ui.dot(goalColor(state, g))}${esc(B.stats.goalLabel(state, g))}</span>
          <span class="goal-value" data-live-goal-text="${g.id}">${p.met ? '🎯 ' : ''}${B.u.durCompact(p.done)} / ${B.u.durCompact(p.target)}</span>
          ${editable ? `<button class="icon-btn" data-action="edit-goal" data-id="${g.id}" aria-label="Editar meta">✎</button>` : ''}
        </div>
        <div data-live-goal-bar="${g.id}">${B.ui.bar(p.pct, goalColor(state, g))}</div>
      </div>`;
  }

  function goalsList(state, opts = {}) {
    if (!state.goals.length) {
      return `<p class="empty-small">Aún no tienes metas. <button class="link" data-action="new-goal">Crear una</button></p>`;
    }
    const sorted = state.goals.slice().sort((a, b) => (a.period === b.period ? 0 : a.period === 'day' ? -1 : 1));
    return sorted.map((g) => goalRow(state, g, opts)).join('');
  }

  /** Actualiza en vivo (cada segundo) las barras de metas visibles. */
  function tickGoals(state) {
    for (const g of state.goals) {
      const txt = document.querySelector(`[data-live-goal-text="${g.id}"]`);
      if (!txt) continue;
      const p = B.stats.goalProgress(state, g);
      txt.textContent = `${p.met ? '🎯 ' : ''}${B.u.durCompact(p.done)} / ${B.u.durCompact(p.target)}`;
      const fill = document.querySelector(`[data-live-goal-bar="${g.id}"] .progress-fill`);
      if (fill) fill.style.width = `${(p.pct * 100).toFixed(1)}%`;
      txt.closest('.goal')?.classList.toggle('met', p.met);
    }
  }

  function sessionRow(s, { showDate = false } = {}) {
    const color = B.store.areaColor(s.areaId);
    const when = `${showDate ? B.u.fmtDate(s.start, { weekday: true }) + ' · ' : ''}${B.u.fmtTime(s.start)}–${s.running ? (s.paused ? 'pausa' : 'ahora') : B.u.fmtTime(s.end)}`;
    const ms = s.durMs ?? (s.end - s.start);
    return `
      <li class="session ${s.running ? 'running' : ''} ${s.paused ? 'paused' : ''}">
        ${B.ui.dot(color)}
        <div class="session-main">
          <div class="session-what">${B.ui.breadcrumb(s.areaId, s.taskId, { withCategory: false })}</div>
          ${s.note ? `<div class="session-note">${esc(s.note)}</div>` : ''}
        </div>
        <div class="session-when muted">${when}</div>
        <div class="session-dur" ${s.running ? 'data-live="running-dur"' : ''}>${B.u.durCompact(ms)}</div>
        ${s.running ? (s.paused ? '<span class="pill pill-paused">en pausa</span>' : '<span class="pill pill-live">en curso</span>') : `<button class="icon-btn" data-action="edit-session" data-id="${s.id}" aria-label="Editar sesión">✎</button>`}
      </li>`;
  }

  function taskRow(t, { timeMs = 0, showArea = false } = {}) {
    const open = expanded.has(t.id);
    const due = B.ui.dueInfo(t.dueDate, t.done);
    const running = B.store.state.activeTimer?.taskId === t.id;
    return `
      <li class="task ${t.done ? 'done' : ''} ${running ? 'running' : ''}" data-task="${t.id}">
        <label class="task-check" aria-label="${t.done ? 'Marcar como pendiente' : 'Marcar como completada'}">
          <input type="checkbox" data-action="toggle-task" data-id="${t.id}" ${t.done ? 'checked' : ''}><span></span>
        </label>
        <div class="task-main">
          <button class="task-title" data-action="expand-task" data-id="${t.id}" aria-expanded="${open}">${esc(t.title)}</button>
          <div class="task-meta">
            <span class="prio prio-${t.priority}">${t.priority}</span>
            ${due ? `<span class="${due.cls}">📅 ${esc(due.text)}</span>` : ''}
            ${showArea ? `<span class="task-area">${B.ui.dot(B.store.areaColor(t.areaId))}${esc(B.store.area(t.areaId)?.name || '')}</span>` : ''}
            ${t.description ? '<span class="muted" title="Tiene descripción">≡</span>' : ''}
            ${t.done && t.completedAt ? `<span class="muted">Completada ${B.u.fmtDate(t.completedAt)}</span>` : ''}
          </div>
          ${open && t.description ? `<div class="task-desc">${esc(t.description)}</div>` : ''}
        </div>
        <div class="task-time muted" data-tip="Tiempo total invertido">${timeMs ? B.u.durCompact(timeMs) : ''}</div>
        <div class="task-actions">
          ${t.done ? '' : running
            ? `<button class="icon-btn play running" data-action="stop" aria-label="Detener reloj" data-tip="Detener">■</button>`
            : `<button class="icon-btn play" data-action="start-task" data-id="${t.id}" aria-label="Iniciar reloj en esta tarea" data-tip="Iniciar reloj">▶</button>`}
          <button class="icon-btn" data-action="edit-task" data-id="${t.id}" aria-label="Editar tarea">✎</button>
        </div>
      </li>`;
  }

  function toggleExpanded(id) { expanded.has(id) ? expanded.delete(id) : expanded.add(id); }

  return { levelCard, streakCard, goalsList, goalRow, tickGoals, sessionRow, taskRow, toggleExpanded };
})();
