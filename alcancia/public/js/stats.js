/* Cálculos: periodos, saldos, presupuesto, "hoy puedes gastar", metas, rachas, XP, niveles y logros. */
window.A = window.A || {};

A.stats = (() => {
  const u = A.u;
  const S = () => A.store;

  // ---------- Periodos (de día de pago a día de pago) ----------
  /** Periodo que empieza en el mes (y, m) — m puede salirse de 0..11. */
  function periodFromMonth(state, y, m) {
    const p = Math.min(31, Math.max(1, Number(state.settings.payDay) || 1));
    const start = u.clampDate(y, m, p);
    const end = u.clampDate(y, m + 1, p); // exclusivo
    const sd = u.parseDayKey(start);
    return {
      start, end, key: start, y: new Date(sd).getFullYear(), m: new Date(sd).getMonth(),
      days: u.daysBetween(start, end),
      label: `${u.fmtDate(start)} – ${u.fmtDate(u.addDaysKey(end, -1), { year: true })}`,
    };
  }
  /** Periodo que contiene el día `k` (por defecto hoy), desplazado `offset` periodos. */
  function period(state, k = u.todayKey(), offset = 0) {
    const [y, m] = k.split('-').map(Number);
    let P = periodFromMonth(state, y, m - 1);
    if (k < P.start) P = periodFromMonth(state, y, m - 2);
    return offset ? periodFromMonth(state, P.y, P.m + offset) : P;
  }
  const inP = (P, k) => k >= P.start && k < P.end;

  // ---------- Saldos ----------
  /** Efecto de un movimiento en los saldos: [[accountId, delta], ...] */
  function effects(mv) {
    switch (mv.type) {
      case 'gasto': return [[mv.accountId, -mv.amount]];
      case 'ingreso': return [[mv.accountId, mv.amount]];
      case 'transferencia': return [[mv.accountId, -mv.amount], [mv.toAccountId, mv.amount]];
      case 'ajuste': return [[mv.accountId, mv.amount]];
      default: return [];
    }
  }
  function balances(state) {
    const m = new Map(state.accounts.map((a) => [a.id, Number(a.initial) || 0]));
    for (const mv of state.movements) for (const [id, d] of effects(mv)) if (m.has(id)) m.set(id, m.get(id) + d);
    return m;
  }
  /** Totales: lo que tienes, lo que debes, lo apartado en metas, lo libre y el patrimonio. */
  function worth(state) {
    const b = balances(state);
    let assets = 0, debts = 0;
    for (const a of state.accounts) {
      const v = b.get(a.id) || 0;
      if (S().isDebt(a)) debts += Math.max(0, -v); else assets += v;
    }
    const reserved = state.goals.reduce((acc, g) => acc + Math.max(0, goalBalance(state, g.id)), 0);
    return { assets, debts, reserved, free: assets - reserved, net: assets - debts, balances: b };
  }

  // ---------- Presupuesto del periodo ----------
  const isVariable = (mv) => mv.type === 'gasto' && !mv.goalId && !mv.recurringId;
  const isBudgetExpense = (mv) => mv.type === 'gasto' && !mv.goalId;

  function limitOf(c, base) {
    if (!c.budget || !(c.budget.value > 0)) return null;
    if (c.budget.mode === 'fixed') return c.budget.value;
    return base > 0 ? Math.round(base * c.budget.value / 100) : null; // sin ingreso aún no hay límite en pesos
  }

  /** Resumen de un periodo. */
  function summary(state, P) {
    let income = 0, expenses = 0, fixedSpent = 0, goalPurchases = 0, saved = 0, debtPaid = 0, small = 0, smallCount = 0;
    const byTop = new Map(), bySub = new Map(), incomeByCat = new Map();
    const smallLimit = Number(state.settings.smallExpense) || 0;
    for (const mv of state.movements) {
      if (!inP(P, mv.date)) continue;
      if (mv.type === 'ingreso') {
        income += mv.amount;
        incomeByCat.set(mv.categoryId || null, (incomeByCat.get(mv.categoryId || null) || 0) + mv.amount);
      } else if (mv.type === 'gasto') {
        if (mv.goalId) { goalPurchases += mv.amount; continue; }
        expenses += mv.amount;
        if (mv.recurringId) fixedSpent += mv.amount;
        else if (smallLimit && mv.amount < smallLimit) { small += mv.amount; smallCount++; }
        const top = S().topCategory(mv.categoryId);
        const tk = top ? top.id : null;
        byTop.set(tk, (byTop.get(tk) || 0) + mv.amount);
        const sk = mv.categoryId || null;
        bySub.set(sk, (bySub.get(sk) || 0) + mv.amount);
      } else if (mv.type === 'aporte') {
        saved += mv.amount;
      } else if (mv.type === 'transferencia' && S().isDebt(S().account(mv.toAccountId))) {
        debtPaid += mv.amount;
      }
    }
    const expected = Number(state.settings.expectedIncome) || 0;
    const base = Math.max(expected, income);
    const savingsTarget = Math.round(base * (Number(state.settings.savingsPct) || 0) / 100);
    const cats = S().topCategories('gasto').map((c) => {
      const spent = byTop.get(c.id) || 0;
      const limit = limitOf(c, base);
      const ratio = limit ? spent / limit : null;
      return { cat: c, spent, limit, ratio, status: status(ratio) };
    });
    const budgeted = cats.filter((x) => x.limit != null);
    const ok = budgeted.every((x) => x.spent <= x.limit);
    return {
      P, income, expected, base, expenses, fixedSpent, goalPurchases, saved, debtPaid, small, smallCount,
      byTop, bySub, incomeByCat, cats, ok, savingsTarget,
      savingsRate: income > 0 ? saved / income : 0,
      unassigned: income - expenses - saved,
      count: state.movements.filter((mv) => inP(P, mv.date) && mv.type !== 'ajuste').length,
    };
  }
  /** Semáforo: verde < 75 %, amarillo 75–100 %, rojo > 100 %. */
  function status(ratio) {
    if (ratio == null) return 'none';
    if (ratio > 1) return 'over';
    if (ratio >= 0.75) return 'warn';
    return 'ok';
  }

  // ---------- Gastos fijos ----------
  function fixedStatus(state, P, today = u.todayKey()) {
    return state.recurring.filter((r) => r.active !== false).map((r) => {
      let due = u.clampDate(P.y, P.m, r.day);
      if (!inP(P, due)) due = u.clampDate(P.y, P.m + 1, r.day);
      if (!inP(P, due)) due = P.start;
      const paid = state.movements.find((mv) => mv.recurringId === r.id && inP(P, mv.date)) || null;
      const st = paid ? 'pagado' : due < today ? 'vencido' : due === today ? 'hoy' : 'pendiente';
      return { r, due, paid, status: st };
    }).sort((a, b) => a.due.localeCompare(b.due));
  }

  // ---------- Hoy puedes gastar ----------
  function allowance(state, today = u.todayKey()) {
    const P = period(state, today);
    const sm = summary(state, P);
    const fx = fixedStatus(state, P, today);
    const fixedTotal = fx.reduce((a, f) => a + (f.paid ? f.paid.amount : f.r.amount), 0);
    const fixedPending = fx.filter((f) => !f.paid).reduce((a, f) => a + f.r.amount, 0);
    const savingPlan = Math.max(sm.savingsTarget, sm.saved);
    let variableBefore = 0, spentToday = 0;
    for (const mv of state.movements) {
      if (!isVariable(mv) || !inP(P, mv.date)) continue;
      if (mv.date < today) variableBefore += mv.amount;
      else if (mv.date === today) spentToday += mv.amount;
    }
    const daysLeft = Math.max(1, u.daysBetween(today, P.end));
    const pool = sm.base - fixedTotal - savingPlan - variableBefore;
    const daily = Math.floor(pool / daysLeft);
    const variableMonth = sm.base - fixedTotal - savingPlan;
    return {
      P, sm, base: sm.base, fixedTotal, fixedPending, savingPlan, variableBefore, spentToday, daysLeft, pool, daily,
      left: daily - spentToday,
      variableMonth, variableSpent: variableBefore + spentToday,
      hasIncome: sm.base > 0,
    };
  }

  // ---------- Metas ----------
  function goalContributed(state, id) {
    return state.movements.reduce((a, mv) => a + (mv.type === 'aporte' && mv.goalId === id ? mv.amount : 0), 0);
  }
  function goalBalance(state, id) {
    return state.movements.reduce((a, mv) => {
      if (mv.goalId !== id) return a;
      if (mv.type === 'aporte') return a + mv.amount;
      if (mv.type === 'gasto') return a - mv.amount;
      return a;
    }, 0);
  }
  function goalProgress(state, g, today = u.todayKey()) {
    const contributed = goalContributed(state, g.id);
    const balance = goalBalance(state, g.id);
    const target = Number(g.target) || 0;
    const pct = target > 0 ? Math.max(0, Math.min(1, contributed / target)) : 0;
    const missing = Math.max(0, target - contributed);
    // Ritmo: aportes netos de los últimos 90 días, llevados a 30 días.
    const from = u.addDaysKey(today, -90);
    const created = g.createdAt ? u.dayKey(g.createdAt) : from;
    const windowStart = created > from ? created : from;
    const windowDays = Math.max(30, u.daysBetween(windowStart, today) + 1);
    const recent = state.movements.reduce((a, mv) => a + (mv.type === 'aporte' && mv.goalId === g.id && mv.date >= windowStart ? mv.amount : 0), 0);
    const perMonth = recent > 0 ? recent * 30 / windowDays : 0;
    const eta = missing === 0 ? today : perMonth > 0 ? u.addDaysKey(today, Math.ceil(missing / perMonth * 30)) : null;
    let needPerMonth = null, monthsLeft = null;
    if (g.deadline && missing > 0) {
      monthsLeft = Math.max(1, u.daysBetween(today, g.deadline) / 30);
      needPerMonth = Math.ceil(missing / monthsLeft);
    }
    const late = g.deadline && missing > 0 && (u.daysBetween(today, g.deadline) < 0 || (eta && eta > g.deadline));
    return { contributed, balance, target, pct, missing, perMonth, eta, needPerMonth, monthsLeft, late, reached: target > 0 && contributed >= target };
  }
  /** Gasto promedio mensual de los últimos 3 periodos cerrados (para sugerir el fondo de emergencia). */
  function avgMonthlyExpenses(state) {
    const vals = [];
    for (let i = 1; i <= 3; i++) {
      const sm = summary(state, period(state, u.todayKey(), -i));
      if (sm.expenses > 0) vals.push(sm.expenses);
    }
    if (!vals.length) {
      const cur = summary(state, period(state));
      const fixed = state.recurring.filter((r) => r.active !== false).reduce((a, r) => a + r.amount, 0);
      return Math.max(cur.expenses, fixed);
    }
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  // ---------- Deudas ----------
  function debtInfo(state, a, bal, today = u.todayKey()) {
    const owed = Math.max(0, -(bal ?? balances(state).get(a.id) ?? 0));
    const info = { owed };
    if (a.type === 'credito') {
      info.limit = Number(a.limit) || 0;
      info.available = info.limit ? info.limit - owed : null;
      info.usage = info.limit ? owed / info.limit : null;
      const nextDay = (day) => {
        const [y, m] = today.split('-').map(Number);
        let d = u.clampDate(y, m - 1, day);
        if (d < today) d = u.clampDate(y, m, day);
        return d;
      };
      if (a.payDay) info.nextPay = nextDay(a.payDay);
      if (a.cutDay) info.nextCut = nextDay(a.cutDay);
    } else {
      info.original = Number(a.original) || Math.max(owed, -Number(a.initial) || 0);
      info.paidPct = info.original ? Math.max(0, Math.min(1, 1 - owed / info.original)) : 0;
    }
    return info;
  }

  // ---------- Constancia ----------
  /** Días registrados: con algún gasto/ingreso con esa fecha, o cerrados con "Cerrar el día". */
  function registeredDays(state) {
    const set = new Set(state.checkins);
    for (const mv of state.movements) if (mv.type === 'gasto' || mv.type === 'ingreso' || mv.type === 'aporte') set.add(mv.date);
    const t = u.todayKey();
    for (const k of [...set]) if (k > t) set.delete(k);
    return set;
  }
  function streaks(state, today = u.todayKey()) {
    const days = registeredDays(state);
    const todayOk = days.has(today);
    let d = todayOk ? today : u.addDaysKey(today, -1);
    let current = 0;
    while (days.has(d)) { current++; d = u.addDaysKey(d, -1); }
    let best = 0, run = 0, prev = null;
    for (const k of [...days].sort()) {
      run = prev && u.addDaysKey(prev, 1) === k ? run + 1 : 1;
      best = Math.max(best, run);
      prev = k;
    }
    return { current, best: Math.max(best, current), todayOk, closedToday: state.checkins.includes(today), total: days.size };
  }
  /** Días sin gastos (cerrados con "Cerrar el día" y sin ningún gasto) en un rango. */
  function noSpendDays(state, from, to) {
    const spent = new Set(state.movements.filter((m) => m.type === 'gasto').map((m) => m.date));
    return state.checkins.filter((k) => k >= from && k < to && !spent.has(k)).length;
  }

  /** Periodos ya cerrados (desde el primer movimiento hasta el anterior al actual). */
  function closedPeriods(state, today = u.todayKey()) {
    const dates = state.movements.filter((m) => m.type !== 'ajuste').map((m) => m.date).sort();
    if (!dates.length) return [];
    const out = [];
    let P = period(state, dates[0]);
    const cur = period(state, today);
    let guard = 0;
    while (P.start < cur.start && guard++ < 600) { out.push(P); P = periodFromMonth(state, P.y, P.m + 1); }
    return out;
  }
  function budgetStreaks(state) {
    const list = closedPeriods(state).map((P) => { const sm = summary(state, P); return { P, ok: sm.ok && sm.count > 0, sm }; });
    let current = 0;
    for (let i = list.length - 1; i >= 0 && list[i].ok; i--) current++;
    let best = 0, run = 0;
    for (const x of list) { run = x.ok ? run + 1 : 0; best = Math.max(best, run); }
    return { current, best, okCount: list.filter((x) => x.ok).length, list };
  }

  // ---------- XP y niveles ----------
  const XP = { day: 10, perMoney: 10000, period: 100, goal: 50 };
  function xpBreakdown(state) {
    const days = registeredDays(state).size;
    const saved = state.movements.reduce((a, m) => a + (m.type === 'aporte' ? m.amount : 0), 0);
    const debtPaid = state.movements.reduce((a, m) => a + (m.type === 'transferencia' && S().isDebt(S().account(m.toAccountId)) && !S().isDebt(S().account(m.accountId)) ? m.amount : 0), 0);
    const periods = budgetStreaks(state).okCount;
    const goals = state.goals.filter((g) => g.doneAt).length;
    const parts = {
      days: days * XP.day,
      saved: Math.floor(Math.max(0, saved) / XP.perMoney),
      debt: Math.floor(debtPaid / XP.perMoney),
      periods: periods * XP.period,
      goals: goals * XP.goal,
    };
    return { ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0), counts: { days, saved, debtPaid, periods, goals } };
  }
  const xpForLevel = (n) => 50 * (n - 1) ** 2;
  function level(state) {
    const x = xpBreakdown(state).total;
    const n = Math.floor(Math.sqrt(x / 50)) + 1;
    const lo = xpForLevel(n), hi = xpForLevel(n + 1);
    return { xp: x, level: n, into: x - lo, needed: hi - lo, pct: (x - lo) / (hi - lo) };
  }
  const LEVEL_TITLES = ['Alcancía', 'Ahorrador', 'Previsor', 'Estratega', 'Inversionista', 'Patrimonio sólido', 'Libertad financiera'];
  const levelTitle = (n) => LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((n - 1) / 3))];

  // ---------- Logros ----------
  function achievements(state) {
    const st = streaks(state);
    const bs = budgetStreaks(state);
    const savedTotal = state.movements.reduce((a, m) => a + (m.type === 'aporte' ? m.amount : 0), 0);
    const goalsDone = state.goals.filter((g) => g.doneAt).length;
    const emergency = state.goals.some((g) => g.kind === 'emergencia' && goalProgress(state, g).reached);
    const anySaving20 = bs.list.some((x) => x.sm.income > 0 && x.sm.savingsRate >= 0.2);
    const debtAccounts = state.accounts.filter((a) => S().isDebt(a));
    const bal = balances(state);
    const paidSomething = state.movements.some((m) => m.type === 'transferencia' && S().isDebt(S().account(m.toAccountId)));
    const card0 = paidSomething && debtAccounts.some((a) => a.type === 'credito' && (bal.get(a.id) || 0) >= 0);
    const hadDebt = debtAccounts.some((a) => (Number(a.initial) || 0) < 0) || state.movements.some((m) => m.type === 'gasto' && S().isDebt(S().account(m.accountId)));
    const debtFree = hadDebt && debtAccounts.every((a) => (bal.get(a.id) || 0) >= 0);
    const P = period(state);
    const noSpend = noSpendDays(state, P.start, P.end);
    const adjusted = state.movements.some((m) => m.type === 'ajuste');
    const list = [
      ['primer-registro', '🌱', 'Primer registro', 'Registra tu primer movimiento', state.movements.some((m) => m.type !== 'ajuste')],
      ['cuentas-claras', '🧮', 'Cuentas claras', 'Cuadra el saldo real de una cuenta', adjusted],
      ['racha7', '🔥', 'Semana al día', 'Racha de 7 días registrando', st.best >= 7],
      ['racha30', '☄️', 'Mes al día', 'Racha de 30 días registrando', st.best >= 30],
      ['racha100', '🏛️', 'Centenario', 'Racha de 100 días registrando', st.best >= 100],
      ['sin-gastos', '🧘', 'Día zen', 'Cierra un día sin gastar nada', noSpendDays(state, '0000', '9999') >= 1],
      ['frugal', '🌿', 'Modo frugal', '5 días sin gastos en un mismo periodo', noSpend >= 5 || bs.list.some((x) => noSpendDays(state, x.P.start, x.P.end) >= 5)],
      ['primera-meta', '🎯', 'Con un propósito', 'Crea tu primera meta', state.goals.length > 0],
      ['meta-cumplida', '🏅', 'Lo logré', 'Cumple una meta', goalsDone >= 1],
      ['cinco-metas', '🏆', 'Coleccionista de metas', 'Cumple 5 metas', goalsDone >= 5],
      ['millon', '💰', 'Primer millón', 'Aporta $ 1.000.000 a tus metas en total', savedTotal >= 1e6],
      ['diez-millones', '💎', 'Diez millones', 'Aporta $ 10.000.000 a tus metas en total', savedTotal >= 1e7],
      ['emergencia', '🛟', 'Red de seguridad', 'Completa un fondo de emergencia', emergency],
      ['mes-verde', '✅', 'Mes en verde', 'Cierra un periodo con todas las categorías dentro del límite', bs.okCount >= 1],
      ['tres-verdes', '🌳', 'Trimestre en verde', '3 periodos seguidos dentro del presupuesto', bs.best >= 3],
      ['ahorro20', '🐷', 'El 20 %', 'Cierra un periodo ahorrando el 20 % o más de tus ingresos', anySaving20],
      ['tarjeta0', '💳', 'Tarjeta en cero', 'Deja la tarjeta de crédito sin deuda', card0],
      ['libre', '🕊️', 'Libre de deudas', 'Todas tus deudas en cero', debtFree],
    ];
    return list.map(([id, icon, name, desc, unlocked]) => ({ id, icon, name, desc, unlocked }));
  }

  /** Foto rápida para detectar celebraciones después de cada cambio. */
  function snapshot(state) {
    try {
      const P = period(state);
      const sm = summary(state, P);
      return {
        level: level(state).level,
        goals: new Map(state.goals.map((g) => [g.id, goalProgress(state, g).pct])),
        cats: new Map(sm.cats.filter((x) => x.limit).map((x) => [x.cat.id, x.ratio])),
        ach: new Set(achievements(state).filter((x) => x.unlocked).map((x) => x.id)),
        P: P.key,
      };
    } catch { return null; }
  }

  // ---------- Reportes ----------
  /** Por cada día del periodo: Map categoría principal → gasto. */
  function perDay(state, P) {
    const rows = u.daysIn(P.start, P.end).map((day) => ({ day, byCat: new Map() }));
    const idx = new Map(rows.map((r, i) => [r.day, i]));
    for (const mv of state.movements) {
      if (!isBudgetExpense(mv) || !idx.has(mv.date)) continue;
      const top = S().topCategory(mv.categoryId);
      const k = top ? top.id : null;
      const m = rows[idx.get(mv.date)].byCat;
      m.set(k, (m.get(k) || 0) + mv.amount);
    }
    return rows;
  }
  function history(state, n = 6, ref = u.todayKey()) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(summary(state, period(state, ref, -i)));
    return out;
  }

  return {
    period, periodFromMonth, inP, balances, worth, summary, status, limitOf, fixedStatus, allowance,
    goalContributed, goalBalance, goalProgress, avgMonthlyExpenses, debtInfo,
    registeredDays, streaks, noSpendDays, closedPeriods, budgetStreaks,
    XP, xpBreakdown, level, levelTitle, achievements, snapshot, perDay, history, isVariable,
  };
})();
