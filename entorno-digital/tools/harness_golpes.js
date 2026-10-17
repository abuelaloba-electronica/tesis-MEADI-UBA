#!/usr/bin/env node
//
// Banco de pruebas para las paginas prototipo_percusion_guante_*.html.
//
// Hermano de harness.js (que es especifico de la bandada: solo exporta
// updateAccel, sus perfiles son de acelerometro y su DOM falso no tiene
// createElement ni stroke). Aca la idea es la misma — extraer el <script> del
// HTML y evaluarlo con stubs minimos — pero lo que se mide es otra cosa.
//
// La clave: el grafo de Web Audio es contabilidad de JavaScript puro, asi que
// se puede verificar entero sin producir un solo sonido. Con un AudioContext
// falso que registre cada createOscillator/createGain/connect/disconnect se
// comprueban automaticamente cosas que a oido son casi imposibles de detectar:
//
//   - fugas de nodos: el bug que despues de diez minutos se manifiesta como
//     "empieza a crujir", y que aca aparece como un contador que no vuelve a 0
//   - techo de polifonia y robo de voz
//   - cuantizacion por escala, si la pagina la tiene (la tuvo la variante (b),
//     ya eliminada; la (a) no): cuantas notas distintas salen de un mismo
//     golpe cuando se le inyecta el jitter real del piezo. Es lo que responde
//     "6 grados o 10" sin necesidad de hardware
//   - costo por frame constante: que la cantidad de arc() por frame no crezca
//     con el tiempo (el test directo de la decision de lienzo persistente)
//
// Uso:
//   node entorno-digital/tools/harness_golpes.js <archivo.html>
//   node entorno-digital/tools/harness_golpes.js <archivo.html> --golpes=500 --jitter=0.08
//
// Requisito que esto le impone a las paginas: el AudioContext tiene que
// construirse perezosamente dentro de asegurarAudio(). Si se construyera en el
// cuerpo del script, evaluarlo aca explotaria.

"use strict";

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------
const args = process.argv.slice(2);
const archivo = args.find(function (a) { return a.indexOf("--") !== 0; });
if (!archivo) {
  console.error("uso: node harness_golpes.js <archivo.html> [--golpes=N] [--jitter=F] [--frames=N]");
  process.exit(1);
}
function opcion(nombre, porDefecto) {
  const a = args.find(function (x) { return x.indexOf("--" + nombre + "=") === 0; });
  return a ? parseFloat(a.split("=")[1]) : porDefecto;
}
const N_GOLPES = opcion("golpes", 500);
const JITTER = opcion("jitter", 0.08);   // dispersion relativa del pico entre golpes iguales
const N_FRAMES = opcion("frames", 600);

// ---------------------------------------------------------------
// AudioContext falso: lleva la cuenta de todo lo que se crea y se desconecta.
// ---------------------------------------------------------------
const audio = {
  creados: 0,
  desconectados: 0,
  vivos: new Set(),
  arrancados: 0,
  detenidos: 0,
  setTargets: 0
};

function nodoFalso(tipo, ctx) {
  audio.creados++;
  const n = {
    tipo: tipo,
    _conectado: [],
    connect: function (destino) { n._conectado.push(destino); return destino; },
    disconnect: function () {
      if (audio.vivos.has(n)) {
        audio.vivos.delete(n);
        audio.desconectados++;
      }
    }
  };
  audio.vivos.add(n);
  return n;
}

function paramFalso(valorInicial, ctx) {
  return {
    value: valorInicial,
    setValueAtTime: function () { return this; },
    linearRampToValueAtTime: function () { return this; },
    exponentialRampToValueAtTime: function (v) {
      if (v === 0) throw new Error("exponentialRampToValueAtTime(0) lanza en navegadores reales");
      return this;
    },
    setTargetAtTime: function () { audio.setTargets++; return this; },
    cancelScheduledValues: function () { return this; }
  };
}

function FakeAudioContext(opciones) {
  const ctx = this;
  this.sampleRate = 48000;
  this.currentTime = 0;
  this.state = "running";
  this.baseLatency = 0.005;
  this.outputLatency = 0.012;
  this.destination = nodoFalso("destination", ctx);
  this.latencyHint = opciones && opciones.latencyHint;
  this._pendientes = [];   // callbacks onended agendados

  this.createGain = function () {
    const n = nodoFalso("gain", ctx);
    n.gain = paramFalso(1, ctx);
    return n;
  };
  this.createOscillator = function () {
    const n = nodoFalso("oscillator", ctx);
    n.type = "sine";
    n.frequency = paramFalso(440, ctx);
    n.detune = paramFalso(0, ctx);
    n.onended = null;
    n.start = function () { audio.arrancados++; n._arrancado = true; };
    // Igual que en un navegador real: se puede llamar stop() de nuevo y la
    // ultima llamada es la que vale. De eso depende el robo de voz, que
    // adelanta el stop() de la voz mas vieja.
    n.stop = function (t) {
      if (!n._detenido) { n._detenido = true; audio.detenidos++; }
      ctx._pendientes = ctx._pendientes.filter(function (p) { return p.nodo !== n; });
      ctx._pendientes.push({ t: t, nodo: n });
    };
    return n;
  };
  this.createBufferSource = function () {
    const n = nodoFalso("bufferSource", ctx);
    n.buffer = null;
    n.onended = null;
    n.start = function () { audio.arrancados++; };
    n.stop = function () { audio.detenidos++; };
    return n;
  };
  this.createBiquadFilter = function () {
    const n = nodoFalso("biquad", ctx);
    n.type = "lowpass";
    n.frequency = paramFalso(350, ctx);
    n.Q = paramFalso(1, ctx);
    n.gain = paramFalso(0, ctx);
    return n;
  };
  this.createWaveShaper = function () {
    const n = nodoFalso("waveShaper", ctx);
    n.curve = null;
    n.oversample = "none";
    return n;
  };
  this.createBuffer = function (canales, largo) {
    const datos = new Float32Array(largo);
    return { getChannelData: function () { return datos; }, length: largo };
  };
  this.resume = function () { ctx.state = "running"; return Promise.resolve(); };

  // Avanza el reloj y dispara los onended que ya vencieron: es lo que permite
  // detectar si las voces se liberan de verdad.
  this.avanzar = function (dt) {
    ctx.currentTime += dt;
    const vencidos = ctx._pendientes.filter(function (p) { return p.t <= ctx.currentTime; });
    ctx._pendientes = ctx._pendientes.filter(function (p) { return p.t > ctx.currentTime; });
    vencidos.forEach(function (p) { if (p.nodo.onended) p.nodo.onended(); });
  };
}

// ---------------------------------------------------------------
// DOM falso: lo minimo para que el script corra. Registra los arc() por frame,
// que es como se mide el costo de dibujo.
// ---------------------------------------------------------------
const dibujo = { arcsFrame: 0, historial: [] };

function ctx2dFalso() {
  return {
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    setTransform: function () {},
    save: function () {}, restore: function () {},
    fillRect: function () {}, clearRect: function () {},
    beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
    arc: function () { dibujo.arcsFrame++; },
    fill: function () {}, stroke: function () {},
    drawImage: function () {}
  };
}

function elementoFalso(id) {
  const el = {
    id: id,
    width: 0, height: 0,
    value: "",
    textContent: "",
    className: "",
    disabled: false,
    style: {},
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; } },
    _oyentes: {},
    addEventListener: function (tipo, fn) {
      (el._oyentes[tipo] = el._oyentes[tipo] || []).push(fn);
    },
    getContext: function () { return el._ctx || (el._ctx = ctx2dFalso()); },
    getBoundingClientRect: function () { return { top: 0, left: 0, width: 100, height: 100 }; }
  };
  return el;
}

const elementos = {};
// Valores iniciales de los sliders, tomados del HTML (el DOM falso no parsea).
const VALORES = { picoMin: "30", picoMax: "600", vol: "80", fsrSlider: "0" };
const COLOR_INICIAL = "#0000FF,#FFDE21";

function conseguir(id) {
  if (!elementos[id]) {
    elementos[id] = elementoFalso(id);
    if (VALORES[id] !== undefined) elementos[id].value = VALORES[id];
    if (id === "colorSelect") elementos[id].value = COLOR_INICIAL;
  }
  return elementos[id];
}

let rafPendiente = null;

const window_ = {
  innerWidth: 1280,
  innerHeight: 800,
  devicePixelRatio: 1,
  AudioContext: FakeAudioContext,
  addEventListener: function () {},
  requestAnimationFrame: function (fn) { rafPendiente = fn; return 1; }
};

const document_ = {
  getElementById: conseguir,
  createElement: function () { return elementoFalso("tmp"); }
};

// ---------------------------------------------------------------
// Extraer y evaluar el <script> de la pagina
// ---------------------------------------------------------------
const rutaHtml = path.resolve(archivo);
const html = fs.readFileSync(rutaHtml, "utf8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) {
  console.error("no se encontro un <script> en " + rutaHtml);
  process.exit(1);
}

let tiempoFalso = 0;   // ms, manejado a mano para controlar el reloj de la pagina

const entorno = {
  window: window_,
  document: document_,
  navigator: {},                                  // sin "serial": la pagina toma la rama sin Web Serial
  performance: { now: function () { return tiempoFalso; } },
  requestAnimationFrame: window_.requestAnimationFrame,
  setTimeout: function () { return 0; },
  console: console,
  Math: Math,
  Float32Array: Float32Array,
  TextDecoderStream: function () {}
};

const cuerpo = m[1] + "\n; return { feedGolpe: window.feedGolpe, feedForce: window.feedForce };";
const fn = new Function(
  "window", "document", "navigator", "performance", "requestAnimationFrame",
  "setTimeout", "console", "TextDecoderStream",
  cuerpo
);
const api = fn(
  entorno.window, entorno.document, entorno.navigator, entorno.performance,
  entorno.requestAnimationFrame, entorno.setTimeout, entorno.console,
  entorno.TextDecoderStream
);

if (typeof api.feedGolpe !== "function" || typeof api.feedForce !== "function") {
  console.error("la pagina no expone window.feedGolpe y window.feedForce");
  process.exit(1);
}

// El AudioContext lo crea la pagina en el primer feedGolpe. Hay que alcanzarlo
// para poder avanzar su reloj y disparar los onended.
let ac = null;
const CrearOriginal = FakeAudioContext;
window_.AudioContext = function (o) {
  const c = new CrearOriginal(o);
  ac = c;
  return c;
};

// ---------------------------------------------------------------
// Pruebas
// ---------------------------------------------------------------
console.log("Archivo: " + path.relative(process.cwd(), rutaHtml));
console.log("");

let fallas = 0;
function verificar(nombre, ok, detalle) {
  console.log((ok ? "  OK   " : "  FALLA") + "  " + nombre + (detalle ? " — " + detalle : ""));
  if (!ok) fallas++;
}

// --- 1. Fugas de nodos y polifonia --------------------------------
// Se dispara una tanda larga de golpes espaciados 120ms (mas que el bloqueo de
// 60ms del sketch) y se avanza el reloj de audio en paralelo, para que los
// onended de las voces terminadas lleguen a correr.
let maxVivos = 0;
const PASO_MS = 120;
for (let i = 0; i < N_GOLPES; i++) {
  const dedo = i % 2;
  api.feedGolpe(dedo, 200 + Math.round(Math.random() * 300));
  tiempoFalso += PASO_MS;
  if (ac) ac.avanzar(PASO_MS / 1000);
  maxVivos = Math.max(maxVivos, audio.vivos.size);
}
// Un margen generoso al final para que se liberen las ultimas voces.
tiempoFalso += 5000;
if (ac) ac.avanzar(5);

// Los nodos persistentes del grafo (bus, preGain, shaper, postGain, lpPost,
// ganWet, ganDry, limitador, master, destination) nunca se desconectan: viven
// mientras viva la pagina.
const PERSISTENTES = 10;
const NODOS_POR_VOZ = 8;   // osc, oscCuerpo, ganCuerpo, gan, filtro, ruido, bpRuido, ganRuido
const MAX_VOCES = 12;      // tiene que coincidir con la constante de la pagina
const fugados = audio.vivos.size - PERSISTENTES;

console.log("Nodos de audio");
console.log("  creados: " + audio.creados + "  desconectados: " + audio.desconectados +
            "  vivos al final: " + audio.vivos.size);
console.log("  start(): " + audio.arrancados + "  stop(): " + audio.detenidos +
            "  setTargetAtTime(): " + audio.setTargets);
verificar("no quedan nodos de voz sin liberar tras " + N_GOLPES + " golpes",
          fugados <= 0, "sobran " + fugados);
verificar("todo lo que arranco tiene su stop() programado",
          audio.arrancados === audio.detenidos,
          audio.arrancados + " vs " + audio.detenidos);
verificar("el pico de nodos vivos no crece sin limite",
          maxVivos < PERSISTENTES + MAX_VOCES * NODOS_POR_VOZ,
          "pico " + maxVivos + " nodos (" + PERSISTENTES + " persistentes + voces)");

// --- 2. Rafaga: techo de polifonia --------------------------------
// Golpes cada 20ms, mas rapido de lo que el sketch deja pasar, para forzar el
// robo de voz.
const vivosAntes = audio.vivos.size;
for (let i = 0; i < 120; i++) {
  api.feedGolpe(i % 2, 500);
  tiempoFalso += 20;
  if (ac) ac.avanzar(0.02);
}
const picoRafaga = audio.vivos.size;
tiempoFalso += 5000;
if (ac) ac.avanzar(5);
console.log("");
console.log("Rafaga (120 golpes cada 20ms)");
console.log("  pico de nodos vivos: " + picoRafaga + "  (antes: " + vivosAntes + ")");
// El techo no es exactamente MAX_VOCES: una voz robada sigue en el array los
// ~30ms que tarda en apagarse, asi que se toleran unas pocas en vuelo.
const TECHO = PERSISTENTES + (MAX_VOCES + 4) * NODOS_POR_VOZ;
verificar("el robo de voz limita la polifonia en rafaga",
          picoRafaga <= TECHO,
          "pico " + picoRafaga + ", techo esperado " + TECHO);
verificar("tras la rafaga se libera todo de nuevo",
          audio.vivos.size <= PERSISTENTES, "quedaron " + audio.vivos.size);

// --- 3. Costo de dibujo constante ---------------------------------
// Se corre el bucle de animacion y se cuentan los arc() por frame. Si la pagina
// redibujara la lista completa como el prototipo viejo, este numero creceria
// con la cantidad de golpes.
console.log("");
console.log("Costo de dibujo (arc() por frame)");
const muestras = [];
for (let f = 0; f < N_FRAMES; f++) {
  if (f % 6 === 0) api.feedGolpe(f % 2, 400);   // ~10 golpes/s a 60fps
  dibujo.arcsFrame = 0;
  tiempoFalso += 1000 / 60;
  if (ac) ac.avanzar(1 / 60);
  const cb = rafPendiente;
  rafPendiente = null;
  if (cb) cb();
  muestras.push(dibujo.arcsFrame);
}
const primerTercio = muestras.slice(0, Math.floor(N_FRAMES / 3));
const ultimoTercio = muestras.slice(-Math.floor(N_FRAMES / 3));
const prom = function (a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; };
const pIni = prom(primerTercio), pFin = prom(ultimoTercio);
console.log("  promedio primer tercio: " + pIni.toFixed(2) +
            "   ultimo tercio: " + pFin.toFixed(2) +
            "   maximo: " + Math.max.apply(null, muestras));
verificar("el costo por frame no crece con el historial (lienzo persistente)",
          pFin <= pIni + 2, "de " + pIni.toFixed(2) + " a " + pFin.toFixed(2));

// --- 4. Cuantizacion: cuantas notas distintas da un mismo golpe ----
// Solo tiene sentido si la altura depende de la intensidad (como en la
// antigua variante (b)). Se detecta preguntandole a la pagina: si el texto del ultimo
// golpe cambia de nota ante intensidades iguales, hay cuantizacion.
const lastVal = conseguir("lastVal");
function notaDe(pico) {
  api.feedGolpe(0, pico);
  return lastVal.textContent;
}
const esVarianteB = (function () {
  const a = notaDe(50), b = notaDe(550);
  return a !== b && a.indexOf("dedo 0") === 0 && b.indexOf("dedo 0") === 0 &&
         a.split("·")[1] !== b.split("·")[1];
})();

console.log("");
if (esVarianteB) {
  console.log("Cuantizacion pentatonica");
  // Barrido: cuantos grados distintos aparecen a lo largo del rango.
  const barrido = new Set();
  for (let x = 0; x <= 1.0001; x += 0.01) {
    barrido.add(notaDe(Math.round(30 + x * 570)).split("·")[1].trim());
  }
  console.log("  grados distintos en el barrido completo: " + barrido.size);

  // Jitter: el mismo golpe repetido con la dispersion real del piezo.
  // Es la prueba que decide cuantos grados se pueden usar sin que suene a azar.
  [0.25, 0.5, 0.75].forEach(function (centro) {
    const vistas = new Set();
    for (let i = 0; i < 400; i++) {
      const ruido = 1 + (Math.random() * 2 - 1) * JITTER;
      vistas.add(notaDe(Math.round((30 + centro * 570) * ruido)).split("·")[1].trim());
    }
    console.log("  intensidad " + (centro * 100) + "% con jitter +-" +
                (JITTER * 100).toFixed(0) + "%: " + vistas.size + " nota(s) distinta(s)");
  });
  console.log("  (la histeresis del cuantizador deberia mantener esto en 1-2;");
  console.log("   si da 3 o mas, hay que usar menos grados o mas histeresis)");

  // La estabilidad sola no alcanza: la histeresis puede volver el instrumento
  // estable Y sordo, si tambien impide llegar a proposito a una nota. Esta
  // segunda medicion es la contracara — una escalera ascendente con el mismo
  // jitter, contando a cuantos grados distintos se llega de verdad.
  const pasos = barrido.size;
  const alcanzadas = new Set();
  for (let i = 0; i < pasos; i++) {
    const x = i / (pasos - 1);
    const ruido = 1 + (Math.random() * 2 - 1) * JITTER;
    alcanzadas.add(notaDe(Math.round((30 + x * 570) * ruido)).split("·")[1].trim());
  }
  console.log("  escalera ascendente de " + pasos + " pasos con jitter: se alcanzan " +
              alcanzadas.size + " de " + barrido.size + " grados");
  verificar("la histeresis no impide llegar a proposito a cada grado",
            alcanzadas.size >= barrido.size - 1,
            alcanzadas.size + " de " + barrido.size);
} else {
  console.log("Cuantizacion: no aplica (la nota no depende de la intensidad en esta variante)");
}

// --- 5. La distorsion se aplica de forma suave --------------------
console.log("");
const targetsAntes = audio.setTargets;
for (let i = 0; i <= 50; i++) {
  api.feedForce(i / 50);
  tiempoFalso += 20;
  if (ac) ac.avanzar(0.02);
}
const targetsNuevos = audio.setTargets - targetsAntes;
console.log("Distorsion");
console.log("  setTargetAtTime() en un barrido de 51 lecturas de FSR: " + targetsNuevos);
verificar("cada lectura de FSR mueve los 5 parametros con rampa suave",
          targetsNuevos >= 51 * 5,
          targetsNuevos + " llamadas (esperadas al menos " + 51 * 5 + ")");

console.log("");
if (fallas === 0) {
  console.log("Todo en orden.");
} else {
  console.log(fallas + " verificacion(es) fallaron.");
  process.exit(1);
}
