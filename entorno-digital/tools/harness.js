// Banco de pruebas: corre la física real de una visualización de bandada
// (bandada_prototipo_v5a_dispositivo.html, o las v4 archivadas en prototipos/) sin abrir un navegador, para poder medirla en
// números en vez de mirarla.
//
// Cómo funciona, en cuatro pasos:
//   1. Extrae el <script> del HTML y lo evalúa con new Function(), pasándole
//      document / window / navigator / performance / requestAnimationFrame.
//   2. Le da un DOM falso: elementos que no hacen nada y un canvas cuyo
//      contexto 2D son funciones vacías. A `navigator` NO se le pone la
//      propiedad `serial`, así que el script toma solo la rama "Web Serial no
//      disponible" y no intenta conectarse a nada.
//   3. Maneja el reloj a mano: requestAnimationFrame sólo guarda el callback y
//      un for lo llama con dt fijo de 1/60s, avanzando un performance.now()
//      falso. 5 minutos de animación se simulan en un par de segundos, de
//      forma reproducible.
//   4. Mide interceptando ctx.arc(). `birds` es privado dentro de la IIFE del
//      HTML y no hay forma de leerlo desde afuera, pero draw() llama a
//      arc(x, y, radio) una vez por punto: anotando esos argumentos se obtiene
//      exactamente lo que se habría dibujado.
//
// Lo que NO prueba: nada visual (render real, panel, apariencia) ni la
// conexión USB. Para eso, captura headless con Firefox y Chrome con el
// dispositivo enchufado — ver CLAUDE.md.
//
// Uso:
//   node entorno-digital/tools/harness.js <archivo.html> [opciones]
//
//   --segundos=N   tiempo simulado          (default 300)
//   --perfil=P     entrada del acelerómetro (default auto)
//   --muestreo=N   segundos entre filas     (default 10)
//   --puntos=N     cantidad de puntos       (default 24)
//   --nucleos=N    cantidad de núcleos      (default 2)
//   --caja         apaga el campo continuo  (sólo v5: mide el modo con paredes)
//
// Perfiles disponibles:
//   quieto     sin ninguna entrada: verifica que la deriva autónoma siga viva
//   gravedad   1 g constante en Z, mano inmóvil. Es el CONTROL: cualquier
//              medición sobre otro perfil hay que compararla contra este para
//              distinguir un bug del movimiento propio de la bandada.
//              OJO con v5: la escena arranca dormida y este perfil NO la
//              despierta (ese es justamente el requisito), así que mide
//              quietud, no deriva. Para el control de deriva de v5 está
//              `despertar`
//   despertar  1 g constante, con una sacudida breve a los 1,0 s. Es el
//              control de v5: despierta la escena y después deja la mano
//              inmóvil, o sea mide la deriva autónoma igual que `gravedad`
//              medía en v4
//   tiltX      ciclo de 12s: 3s de reposo, 2s de inclinación fuerte en X, y
//              reposo. Sirve para ver la respuesta al gesto y su relajación
//   auto       el perfil del "modo demo automático" del panel, más gravedad
//
// Ejemplos:
//   node entorno-digital/tools/harness.js entorno-digital/bandada_prototipo_v5a_dispositivo.html --perfil=despertar
//   node entorno-digital/tools/harness.js entorno-digital/prototipos/bandada_prototipo_v4b_dispositivo.html --segundos=15 --perfil=tiltX --muestreo=1
//
// Cómo leer la salida: una fila por muestra, con la cantidad de puntos
// dibujados, el radio RMS del grupo (qué tan disperso está), el centroide, el
// bounding box en pantalla, el rango de radios de punto y la línea de stats
// que la página mostraría abajo a la izquierda.
//
// Qué mirar:
//   - rms que tiende a 0        -> la bandada colapsa en un punto
//   - rms que crece sin parar   -> se desarma y llena el lienzo
//   - x/y fuera de 0..ancho/alto-> puntos cortados fuera de pantalla
//   - varios puntos con el mismo valor de x o y -> aplastados contra un borde
//   - rango de radios siempre pegado a sus extremos -> la profundidad está
//     saturada y el eje Z dejó de leerse
//
// Dos avisos para v5 (campo continuo):
//   - `n` puede superar la cantidad de puntos: los que están a menos de un
//     radio de un borde se dibujan dos veces (o cuatro, en una esquina), que
//     es lo que hace invisible la costura. La diferencia son las copias
//     fantasma, no puntos de más.
//   - rms y centroide DEJAN DE SIGNIFICAR ALGO: son promedios de coordenadas
//     envueltas. En su lugar está la columna `arrastre`, que la página expone
//     por window.__diag: el módulo del desplazamiento medio sin envolver, o
//     sea cuánto movió el gesto al campo entero. La deriva propia de cada
//     punto se cancela en ese promedio; el empuje común, no.

"use strict";

const fs = require("fs");
const path = require("path");

// --- argumentos ---------------------------------------------------------
const args = process.argv.slice(2);
const htmlPath = args.find((a) => !a.startsWith("--"));
const opt = (nombre, def) => {
  const hit = args.find((a) => a.startsWith("--" + nombre + "="));
  return hit ? hit.split("=")[1] : def;
};

if (!htmlPath) {
  console.error("Uso: node harness.js <archivo.html> [--segundos=N] [--perfil=quieto|gravedad|tiltX|auto] [--muestreo=N] [--puntos=N] [--nucleos=N]");
  process.exit(1);
}

const SEGUNDOS = parseFloat(opt("segundos", "300"));
const PERFIL = opt("perfil", "auto");
const MUESTREO = parseFloat(opt("muestreo", "10"));
const PUNTOS = opt("puntos", "24");
const NUCLEOS = opt("nucleos", "2");
const CAJA = args.includes("--caja");

const PERFILES = ["quieto", "gravedad", "despertar", "tiltX", "auto"];
if (!PERFILES.includes(PERFIL)) {
  console.error(`Perfil desconocido "${PERFIL}". Disponibles: ${PERFILES.join(", ")}`);
  process.exit(1);
}

// --- extracción del script ----------------------------------------------
const html = fs.readFileSync(htmlPath, "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) {
  console.error(`No se encontró un bloque <script> en ${htmlPath}`);
  process.exit(1);
}
const code = m[1];

// --- DOM falso ----------------------------------------------------------
const W = 1600, H = 900;

function elementoFalso(id) {
  const el = {
    id,
    value: "0",
    textContent: "",
    disabled: false,
    checked: false,
    className: "",
    style: {},
    classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } },
    // Los oyentes se guardan para poder disparar eventos a mano (ver --caja).
    _ev: {},
    addEventListener(tipo, fn) { (this._ev[tipo] || (this._ev[tipo] = [])).push(fn); },
  };
  // Los sliders arrancan con su valor por defecto: el script los lee al
  // inicializarse (parseInt(sliderN.value), etc.).
  if (id === "sliderN") el.value = PUNTOS;
  if (id === "sliderCores") el.value = NUCLEOS;
  if (id === "sliderSize") el.value = "100";
  return el;
}

const elementos = new Map();
const puntosDibujados = [];

const ctx2d = {
  fillStyle: "",
  globalAlpha: 1,
  fillRect() {},
  beginPath() {},
  moveTo() {},
  fill() {},
  // El punto de medición: draw() llama a arc() una vez por punto.
  arc(x, y, r) { puntosDibujados.push([x, y, r]); },
};

const canvas = Object.assign(elementoFalso("canvas"), {
  width: W, height: H,
  getContext() { return ctx2d; },
});
elementos.set("canvas", canvas);

const document = {
  getElementById(id) {
    if (!elementos.has(id)) elementos.set(id, elementoFalso(id));
    return elementos.get(id);
  },
};

// --- reloj y loop manejados a mano --------------------------------------
let ahora = 0;                 // performance.now() falso, en ms
let pendiente = null;          // el callback que el script quiere para el próximo frame
const requestAnimationFrame = (cb) => { pendiente = cb; };
const performance = { now: () => ahora };
const navigator = { userAgent: "node" };   // sin `serial`: rama "no disponible"
const windowFalso = { addEventListener() {}, innerWidth: W, innerHeight: H };

const runner = new Function(
  "document", "window", "navigator", "performance", "requestAnimationFrame", "TextDecoderStream",
  code + "\n; return { get updateAccel() { return window.updateAccel; }," +
         "\n          get diag() { return window.__diag; } };"
);
const api = runner(document, windowFalso, navigator, performance, requestAnimationFrame, function () {});

// --caja: apaga el campo continuo disparando a mano el "change" de la casilla,
// que es la única forma de cambiarlo desde afuera (la página no lee su estado
// al arrancar, justamente para que este harness no mida siempre el modo caja).
if (CAJA) {
  const el = document.getElementById("toroideBox");
  el.checked = false;
  (el._ev.change || []).forEach((fn) => fn());
}

// --- perfiles de entrada -------------------------------------------------
function alimentar(t) {
  switch (PERFIL) {
    case "quieto":
      return;                                        // ninguna llamada a updateAccel
    case "gravedad":
      return api.updateAccel(0, 0, 1.0);             // control: mano inmóvil
    case "despertar":
      // Una sacudida corta al segundo 1 y después mano inmóvil: despierta la
      // escena de v5 y mide la deriva autónoma, igual que `gravedad` en v4.
      if (t > 1.0 && t < 1.3) return api.updateAccel(0.9, 0.6, 1.0);
      return api.updateAccel(0, 0, 1.0);
    case "tiltX": {
      const fase = t % 12;
      if (fase < 3) api.updateAccel(0, 0, 1.0);      // reposo
      else if (fase < 5) api.updateAccel(1.6, 0, 1.0); // gesto de 2s
      else api.updateAccel(0, 0, 1.0);               // vuelta al reposo
      return;
    }
    default: {
      // Mismo perfil del "modo demo automático", más 1 g de gravedad en Z (que
      // el modo demo del navegador no incluye, porque ahí no hay sensor real).
      const ax = Math.sin(t * 0.9) * 0.9 + Math.sin(t * 2.3) * 0.35;
      const ay = Math.cos(t * 0.7) * 0.8 + Math.sin(t * 1.9) * 0.30;
      const az = Math.sin(t * 0.55) * 1.0 + Math.sin(t * 1.7) * 0.20 + 1.0;
      return api.updateAccel(ax, ay, az);
    }
  }
}

// --- corrida -------------------------------------------------------------
const DT = 1 / 60;
const pasos = Math.round(SEGUNDOS / DT);
const muestras = [];
let t = 0;
let ultimaMuestra = 0;

for (let i = 0; i < pasos; i++) {
  alimentar(t);
  ahora += DT * 1000;
  t += DT;

  puntosDibujados.length = 0;
  const cb = pendiente;
  pendiente = null;
  if (!cb) throw new Error("El script dejó de pedir frames (¿excepción dentro del loop?)");
  cb(ahora);

  if (t - ultimaMuestra >= MUESTREO) {
    ultimaMuestra = t;
    muestras.push(medir(t));
  }
}

function medir(t) {
  const pts = puntosDibujados;
  if (pts.length === 0) return { t: t.toFixed(1), n: 0 };

  let sx = 0, sy = 0;
  for (const p of pts) { sx += p[0]; sy += p[1]; }
  const cx = sx / pts.length, cy = sy / pts.length;

  let rms = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let minR = Infinity, maxR = -Infinity;
  for (const [x, y, r] of pts) {
    rms += (x - cx) ** 2 + (y - cy) ** 2;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (r < minR) minR = r; if (r > maxR) maxR = r;
  }
  rms = Math.sqrt(rms / pts.length);

  // Sólo v5 expone diagnóstico; en v4 estas columnas quedan vacías.
  const d = api.diag ? api.diag() : null;

  return {
    t: t.toFixed(1),
    n: pts.length,
    rms: rms.toFixed(0),
    centro: `${cx.toFixed(0)},${cy.toFixed(0)}`,
    x: `${minX.toFixed(0)}..${maxX.toFixed(0)}`,
    y: `${minY.toFixed(0)}..${maxY.toFixed(0)}`,
    radio: `${minR.toFixed(2)}..${maxR.toFixed(2)}`,
    desp: d ? (d.despierto ? "si" : "NO") : "",
    arrastre: d ? d.arrastre.toFixed(0) : "",
    stats: elementos.has("stats") ? elementos.get("stats").textContent : "",
  };
}

console.log(
  `${path.basename(htmlPath)} · perfil "${PERFIL}" · ${SEGUNDOS}s simulados · ` +
  `lienzo ${W}x${H} · ${PUNTOS} puntos · ${NUCLEOS} núcleos` +
  (CAJA ? " · modo caja" : "")
);
console.table(muestras);
