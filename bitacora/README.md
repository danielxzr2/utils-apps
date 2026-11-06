# Bitácora

Reloj de estudio que cuenta hacia arriba, organizado en **categorías → áreas → tareas**, con reportes, metas y algo de gamificación (racha, XP, niveles y logros).

No tiene dependencias: solo necesita Node.js (16 o superior).

## Arrancar

```bash
cd ~/utils/bitacora
npm start          # abre http://localhost:4747 en el navegador
# o: ./start.sh    # lo mismo
# o: node server.js  (sin abrir el navegador)
```

Para usar otro puerto: `PORT=5000 npm start`.

Los datos se guardan en `data/data.json`. El servidor también guarda una copia diaria en `data/backups/` y conserva las últimas 30.

> También puedes abrir `public/index.html` directamente, pero entonces los datos quedan **solo en ese navegador** (localStorage). La app te avisa con un aviso amarillo cuando estás en ese modo.

## Usarla en varios computadores con git

Clonar el repositorio te lleva **el código**. Para llevar también **tus datos**, sube `data/data.json` al repositorio (no está en `.gitignore`).

```bash
git init && git add . && git commit -m "Bitácora"
# crea un repositorio PRIVADO en GitHub y súbelo (son tus datos personales)
```

Rutina para no generar conflictos:

1. Antes de usarla en un computador: `git pull`
2. Al terminar: `git add data/data.json && git commit -m "sesiones" && git push`

Si usas dos computadores sin hacer pull/push, git tendrá un conflicto en `data.json`. Como respaldo, en *Progreso → Ajustes y datos* puedes exportar o importar todo en JSON.

## Cómo está organizada

```
server.js              servidor local: sirve public/ y guarda en data/data.json (GET/PUT /api/data)
public/index.html      estructura de la página
public/css/styles.css  estilos; los colores están en variables al inicio (--c0…--c7 son los de las categorías)
public/js/
  util.js              fechas, formatos
  store.js             estado, guardado y el modelo de datos (documentado arriba del archivo)
  stats.js             cálculos: tiempos, metas, racha, XP/niveles, logros  ← aquí se ajusta la gamificación
  timer.js             iniciar / detener / descartar
  habits.js            hábitos diarios: programación, puntaje del día, rachas
  view-habits.js       pantalla de Hábitos y su formulario
  rewards.js           recompensas reales: reglas, tope mensual, saldo y canjes
  migrations.js        ajustes de datos que se aplican una sola vez (p. ej. las reglas acordadas)
  view-rewards.js      pantalla de Recompensas y sus formularios
  forms.js             formularios (categoría, área, tarea, sesión, meta)
  widgets.js           piezas reutilizables (filas de tareas y sesiones, barra de nivel, metas)
  charts.js            gráfico de barras por día y mapa de calor (SVG, sin librerías)
  view-*.js            las pantallas: Reloj, Hábitos, Áreas y tareas, Reportes, Progreso, Recompensas
  app.js               navegación, acciones de los botones y el "tic" de cada segundo
```

### Reglas de diseño

- El reloj se inicia sobre un **área**, y la **tarea es opcional**. La categoría sale del área, así que no hay que elegirla.
- Cada inicio y parada genera una **sesión** (inicio, fin, área, tarea y nota). Todos los totales se calculan a partir de las sesiones, por eso puedes editar o añadir sesiones a mano.
- El reloj guarda solo marcas de tiempo, así que sigue contando aunque cierres la pestaña o apagues el servidor.
- **Pausar** detiene el conteo sin guardar la sesión; **Reanudar** la continúa. El tiempo en pausa no cuenta. Al **detener y guardar**, cada tramo entre pausas se guarda como una sesión (con el mismo `groupId`). La barra espaciadora inicia, pausa o reanuda.
- Hay un solo reloj a la vez. Si pulsas ▶ en otra tarea, la sesión actual se guarda y empieza una nueva.
- Las sesiones de menos de 5 segundos se descartan.

### Gamificación (en `stats.js`)

- **XP**: 1 por minuto estudiado, más 30/20/10 por tarea completada según su prioridad (alta/media/baja).
- **Nivel**: el nivel *n* se alcanza con 50·(n−1)² XP.
- **Racha**: días seguidos con al menos *X* minutos (por defecto 15; se cambia en Progreso).
- **Logros**: es una lista en `achievements()`; para añadir uno, agrega una fila con su condición.

### Recompensas (en `rewards.js`)

- **Reglas**: *se gana…* por horas de estudio (de todo, de varias categorías elegidas, de una categoría o de un área), por tarea completada (opcionalmente de cierta prioridad), por meta cumplida (una en particular, cualquiera, cualquier diaria o cualquier semanal) o por días de racha.
- Las **metas** también pueden sumar varias categorías a la vez (opción «Varias categorías»). Si creas una categoría nueva, márcala en esas reglas o metas para que cuente.
- **Premio**: dinero (COP) o un permiso con cantidad, unidad y nombre (p. ej. *2 h de videojuegos*).
- Una regla cuenta desde el inicio del día en que la creas. Si cambias su condición o la reactivas, el conteo empieza de nuevo desde ese momento, para no premiar dos veces las mismas horas. Cambiar solo el premio no reinicia el conteo.
- **Tope mensual** (mes calendario): solo limita el dinero. Lo que pase del tope se registra en $0 para no volver a darlo.
- **Saldo** = lo ganado menos lo usado. Usar dinero o un permiso se registra en el historial. Lo ganado se puede *anular* (deja de contar) y un uso se puede borrar.
- Si desmarcas una tarea, se quita la recompensa que había dado.

### Hábitos (en `habits.js`)

- Todos se marcan con un check. Cada uno tiene un momento del día (mañana, comidas, durante el día o noche) y cuándo toca: todos los días, ciertos días (p. ej. clase martes y jueves) o X veces por semana (p. ej. gym 4).
- **Puntaje del día** = cumplidos ÷ los que tocan ese día. Se **aprueba** con el 70 %, que se cambia en la pantalla de Hábitos. Los hábitos semanales no entran en el % diario: se cumplen por semana.
- Antes de las 4 a. m. la pantalla abre el día anterior, para registrar tarde en la noche. Con ‹ › se puede ir a cualquier día pasado.
- **Nombre visible**: si lo llenas, se muestra ese nombre en vez del real.
- **XP**: 5 por check y 20 por día aprobado. Las recompensas tienen el disparador «Por hábitos»: por día aprobado, por día perfecto o por N días aprobados seguidos. Si desmarcas algo de hoy o de ayer y el día deja de cumplir, se quita ese premio.

### Abrirla desde el celular (misma red Wi-Fi)

El servidor ya lo permite, pero viene apagado:

```bash
HOST=0.0.0.0 npm start   # escucha en tu red, no solo en este computador
hostname -I              # muestra la IP del computador, p. ej. 192.168.1.20
```

En el navegador del celular abre `http://192.168.1.20:4747`. Si no carga, revisa el firewall (`sudo ufw allow 4747/tcp`). No tiene contraseña: cualquiera en esa misma red podría abrirla, así que úsalo solo en tu red de casa.
