# Alcancía

Finanzas personales con **cuentas, gastos por categoría, presupuesto en %, metas de ahorro, deudas** y gamificación (racha, XP, niveles y logros). Es hermana de la Bitácora: misma arquitectura, sin dependencias, solo necesita Node.js (16 o superior).

## Arrancar

```bash
cd ~/utils/alcancia
npm start          # abre http://localhost:4748 en el navegador
# o: ./start.sh
# o: node server.js  (sin abrir el navegador)
```

Puede correr al mismo tiempo que la Bitácora (que usa el puerto 4747). Para otro puerto: `PORT=5000 npm start`.

Los datos se guardan en `data/data.json`, con una copia diaria en `data/backups/` (se conservan las últimas 30).

## Rutina sugerida (2 minutos por la noche)

1. Abre **Inicio** y registra los gastos del día con la tecla **G** (o **I** para ingresos). Con **Guardar y otro** se registran varios seguidos.
2. Pulsa **Cerrar el día**. Si no gastaste nada, ciérralo igual para no perder la racha.
3. Cuando pagues un gasto fijo (arriendo, servicios…), dale **Pagar** en la lista de pendientes.
4. Cuando quieras ahorrar para una meta, pulsa **Aportar** (tecla **A**).

Atajos para escribir montos: `25k` = 25.000 · `1,5m` = 1.500.000.

## Conceptos

- **Periodo:** va del día de pago (30) al día anterior del mes siguiente. En febrero empieza el último día del mes. Se cambia en *Presupuesto* o en *Progreso → Ajustes*.
- **Ingreso base:** el mayor entre tu *ingreso esperado* y lo que realmente te ha entrado en el periodo. Los límites en % se calculan sobre él, así que si ganas más en la semana, tus límites crecen.
- **Límites por categoría:** en % del ingreso o en monto fijo. Semáforo: ● verde < 75 % · ▲ amarillo 75–100 % · ✕ rojo si te pasas.
- **Hoy puedes gastar** = (ingreso base − gastos fijos − ahorro planeado − gastos variables de días anteriores) ÷ días que quedan, menos lo que ya gastaste hoy.
- **Tarjeta de crédito:** es una cuenta de tipo deuda. Comprar con ella = *gasto* (cuenta en su categoría ese día). Pagarla = *transferencia* del banco a la tarjeta (no se cuenta dos veces). Intereses y cuota de manejo → gasto en *Financieros*.
- **Metas:** los aportes **apartan** dinero, pero no lo sacan de tu cuenta. *Dinero libre* = lo que tienes en cuentas − lo apartado. Al cumplir una meta de compra, la compra se registra como gasto "pagado con meta" y no afecta el presupuesto del mes.
- **Cuadrar saldos:** si una cuenta no coincide con la real, edítala y escribe el saldo real. Se crea un *ajuste* que no cuenta como gasto ni como ingreso.

## Gamificación (en `public/js/stats.js`)

- **XP:** +10 por cada día registrado, +1 por cada $ 10.000 aportados a metas o pagados a deudas, +100 por cada periodo cerrado dentro del presupuesto y +50 por cada meta cumplida.
- **Nivel:** el nivel *n* se alcanza con 50·(n−1)² XP (igual que la Bitácora).
- **Rachas:** días seguidos registrando y periodos seguidos "en verde".
- **Logros:** es una lista en `achievements()`; para agregar uno, añade una fila con su condición.
- **Avisos:** al llegar al 25/50/75/100 % de una meta, al pasar el 75 % o el 100 % del límite de una categoría, al subir de nivel y al desbloquear un logro.

## Usarla en varios computadores con git

Igual que la Bitácora: sube `data/data.json` a un repositorio **privado** (son tus finanzas).

```bash
git init && git add . && git commit -m "Alcancía"
```

Antes de usarla: `git pull`. Al terminar: `git add data/data.json && git commit -m "movimientos" && git push`.
También puedes exportar e importar todo en JSON, y exportar los movimientos en CSV, desde *Progreso → Ajustes y datos*.

## Cómo está organizada

```
server.js              servidor local: sirve public/ y guarda en data/data.json (GET/PUT /api/data)
public/index.html      estructura de la página
public/css/styles.css  estilos (misma base que la Bitácora)
public/js/
  util.js              fechas y dinero (formato $ 1.234.567, lectura de "25k")
  store.js             estado, guardado, datos iniciales y el modelo de datos (documentado arriba del archivo)
  stats.js             periodos, saldos, presupuesto, "hoy puedes gastar", metas, rachas, XP y logros
  forms.js             formularios (movimiento, cuenta, categoría, gasto fijo, meta, cumplir meta)
  widgets.js           piezas reutilizables (filas de movimientos, tarjetas de metas, filas de presupuesto)
  charts.js            gráficos SVG sin librerías (gasto por día, tendencia y constancia)
  view-*.js            pantallas: Inicio, Movimientos, Presupuesto, Metas, Cuentas y deudas, Reportes, Progreso
  app.js               navegación, botones, atajos de teclado y celebraciones
```

## Ideas para la v2

Lista de deseos con la regla de 30 días, retos ("semana sin gastos hormiga"), puntaje de salud financiera, importar extractos del banco (CSV) y registro desde el celular.
