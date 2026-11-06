/*
 * Estado y persistencia.
 *
 * Modelo de datos (data/data.json). Todos los montos son pesos enteros.
 *   accounts:   [{ id, name, type, initial, createdAt, archived,
 *                  limit?, cutDay?, payDay?, original? }]
 *                type: 'efectivo' | 'banco' | 'billetera'       → cuentas (dinero que tienes)
 *                      'credito' | 'prestamo'                   → deudas (saldo negativo = lo que debes)
 *                initial: saldo al crear la cuenta (en deudas, negativo).
 *                credito: limit = cupo, cutDay = día de corte, payDay = día límite de pago.
 *                prestamo: original = monto total prestado (para la barra de "pagado").
 *   categories: [{ id, name, kind: 'gasto'|'ingreso', parentId|null, icon, color (0..7 | null),
 *                  budget: { mode: 'pct'|'fixed', value } | null }]
 *                Las subcategorías tienen parentId. El límite va en la categoría principal.
 *   movements:  [{ id, type, amount, date: 'YYYY-MM-DD', accountId, toAccountId, categoryId,
 *                  goalId, recurringId, note, createdAt }]
 *                type: 'gasto'         sale de accountId (si es la tarjeta, aumenta la deuda)
 *                      'ingreso'       entra a accountId
 *                      'transferencia' de accountId a toAccountId (pagar la tarjeta es una transferencia)
 *                      'aporte'        aparta dinero para goalId (amount < 0 = retiro). No mueve saldos.
 *                      'ajuste'        corrige el saldo de accountId (amount con signo). No cuenta como gasto.
 *                Un gasto con goalId es la compra de una meta: se paga con lo ahorrado y no afecta el presupuesto.
 *   recurring:  [{ id, name, amount, categoryId, accountId, day, active }]   gastos fijos mensuales
 *   goals:      [{ id, name, emoji, kind: 'compra'|'ahorro'|'emergencia', target, deadline|null,
 *                  createdAt, doneAt|null }]
 *   checkins:   ['YYYY-MM-DD']   días cerrados con "Cerrar el día"
 *   settings:   { payDay, expectedIncome, savingsPct, smallExpense, theme }
 */
window.A = window.A || {};

A.store = (() => {
  const LS_KEY = 'alcancia:data';
  const listeners = [];
  let state = null;
  let mode = 'local';
  let saveTimer = null;
  let saving = Promise.resolve();
  let pending = false;

  const emptyState = () => ({
    version: 1,
    accounts: [],
    categories: [],
    movements: [],
    recurring: [],
    goals: [],
    checkins: [],
    settings: { payDay: 30, expectedIncome: 0, savingsPct: 20, smallExpense: 20000, theme: 'auto', setupDismissed: false },
    updatedAt: 0,
  });

  function normalize(d) {
    const out = Object.assign(emptyState(), d && typeof d === 'object' ? d : {});
    out.settings = Object.assign(emptyState().settings, out.settings || {});
    for (const k of ['accounts', 'categories', 'movements', 'recurring', 'goals', 'checkins']) if (!Array.isArray(out[k])) out[k] = [];
    return out;
  }

  /** Datos iniciales: cuentas y categorías típicas. Todo se puede editar o borrar. */
  function seed(s) {
    const now = Date.now();
    const acc = (name, type, extra = {}) => s.accounts.push({ id: A.u.uid(), name, type, initial: 0, createdAt: now, archived: false, ...extra });
    acc('Efectivo', 'efectivo');
    acc('Cuenta bancaria', 'banco');
    acc('Nequi', 'billetera');
    acc('Tarjeta de crédito', 'credito', { limit: 0, cutDay: 15, payDay: 30 });

    const cat = (name, icon, color, pct, subs, kind = 'gasto') => {
      const id = A.u.uid();
      s.categories.push({ id, name, kind, parentId: null, icon, color, budget: pct == null ? null : { mode: 'pct', value: pct } });
      for (const sub of subs) s.categories.push({ id: A.u.uid(), name: sub, kind, parentId: id, icon: '', color: null, budget: null });
    };
    cat('Vivienda', '🏠', 0, 25, ['Arriendo', 'Servicios públicos', 'Internet y celular', 'Hogar']);
    cat('Comida', '🍽️', 1, 15, ['Mercado', 'Restaurantes', 'Domicilios', 'Café y snacks']);
    cat('Transporte', '🚌', 2, 8, ['Transporte público', 'Taxi / app', 'Gasolina y parqueadero']);
    cat('Salud', '🩺', 7, 4, ['Medicamentos', 'Citas médicas', 'Deporte']);
    cat('Educación', '🎓', 6, 5, ['Universidad', 'Cursos', 'Libros']);
    cat('Recreación', '🎉', 4, 12, ['Salidas', 'Planes y viajes', 'Hobbies']);
    cat('Compras', '🛍️', 3, 6, ['Ropa', 'Tecnología', 'Cuidado personal']);
    cat('Suscripciones', '📺', 5, 3, ['Streaming', 'Apps y software']);
    cat('Financieros', '🏦', null, 2, ['Intereses', 'Cuota de manejo', '4×1000']);
    cat('Otros', '📦', null, null, ['Regalos', 'Imprevistos']);
    cat('Salario', '💼', 2, null, [], 'ingreso');
    cat('Ingresos semanales', '💵', 0, null, [], 'ingreso');
    cat('Otros ingresos', '✨', 3, null, [], 'ingreso');
  }

  async function load() {
    let loaded = null;
    try {
      if (location.protocol === 'file:') throw new Error('file');
      const r = await fetch('api/data', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      loaded = await r.json();
      mode = 'server';
    } catch {
      mode = 'local';
      try { loaded = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { loaded = null; }
    }
    const isNew = !loaded || !loaded.version;
    state = normalize(loaded);
    if (isNew) { seed(state); commit(); }
    window.addEventListener('focus', resync);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush({ keepalive: true }); });
    window.addEventListener('beforeunload', () => flush({ keepalive: true }));
    return state;
  }

  function mirrorLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* sin espacio o bloqueado */ }
  }

  function commit() {
    state.updatedAt = Date.now();
    mirrorLocal();
    if (mode !== 'server') return;
    pending = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }

  let errorShown = false;
  function flush({ keepalive = false } = {}) {
    if (mode !== 'server' || !pending) return saving;
    clearTimeout(saveTimer);
    pending = false;
    const body = JSON.stringify(state);
    saving = saving.then(() => fetch('api/data', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: keepalive && body.length < 60000,
    }).then((r) => { if (!r.ok) throw new Error(r.status); errorShown = false; })
      .catch(() => {
        pending = true;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, 5000);
        if (errorShown) return;
        errorShown = true;
        A.ui && A.ui.toast('No se pudo guardar en el archivo. ¿Sigue corriendo el servidor? (Los datos quedan en este navegador.)', 'error');
      }));
    return saving;
  }

  /** Al volver a la pestaña, trae cambios hechos en otra pestaña. */
  async function resync() {
    if (mode !== 'server' || pending) return;
    try {
      const r = await fetch('api/data', { cache: 'no-store' });
      const remote = normalize(await r.json());
      if (remote.updatedAt > state.updatedAt && !pending) {
        state = remote;
        mirrorLocal();
        emit();
      }
    } catch { /* servidor apagado */ }
  }

  function update(fn) {
    const before = A.stats ? A.stats.snapshot(state) : null;
    fn(state);
    commit();
    emit();
    if (before && A.app) A.app.celebrate(before, A.stats.snapshot(state));
  }

  function replaceAll(data) { state = normalize(data); commit(); emit(); }
  function subscribe(fn) { listeners.push(fn); }
  function emit() { listeners.forEach((fn) => fn(state)); }

  // --- Búsquedas ---
  const account = (id) => state.accounts.find((a) => a.id === id) || null;
  const category = (id) => state.categories.find((c) => c.id === id) || null;
  const goal = (id) => state.goals.find((g) => g.id === id) || null;
  const recurring = (id) => state.recurring.find((r) => r.id === id) || null;
  /** Categoría principal de una categoría (ella misma si no es subcategoría). */
  const topCategory = (id) => { const c = category(id); if (!c) return null; return c.parentId ? category(c.parentId) || c : c; };
  const catColor = (c) => (c && c.color != null ? `var(--c${c.color})` : 'var(--c-none)');
  const isDebt = (a) => a && (a.type === 'credito' || a.type === 'prestamo');
  const topCategories = (kind) => state.categories.filter((c) => c.kind === kind && !c.parentId);
  const subcategories = (id) => state.categories.filter((c) => c.parentId === id);
  /** "Comida › Mercado" */
  function catLabel(id) {
    const c = category(id);
    if (!c) return 'Sin categoría';
    const p = c.parentId ? category(c.parentId) : null;
    return p ? `${p.name} › ${c.name}` : c.name;
  }
  const catIcon = (id) => { const t = topCategory(id); return t && t.icon ? t.icon : '•'; };

  return {
    load, update, replaceAll, subscribe, flush,
    get state() { return state; },
    get mode() { return mode; },
    account, category, goal, recurring, topCategory, catColor, isDebt, topCategories, subcategories, catLabel, catIcon,
  };
})();
