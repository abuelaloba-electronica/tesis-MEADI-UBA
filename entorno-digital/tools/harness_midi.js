#!/usr/bin/env node
//
// Banco de pruebas para las paginas del guante que mandan el sonido a Helm por
// MIDI (prototipo_percusion_guante_*_midi_dispositivo.html).
//
// Hermano por copia de harness_golpes.js. Aquel verifica el grafo de Web
// Audio; aca no hay grafo — la pagina no tiene voz propia — y lo que se
// verifica es el flujo de mensajes MIDI. Igual que alla, es contabilidad de
// JavaScript puro: con un MIDIAccess falso que registre cada send() se
// comprueba sin Helm, sin puerto y sin sonido:
//
//   - que la pagina no construya ningun AudioContext (el sonido es de Helm)
//   - notas colgadas: todo noteOn tiene su noteOff. Una nota colgada en Helm
//     es la version MIDI de la fuga de nodos — en un patch con sustain se
//     escucharia como un zumbido que no termina
//   - retrigger: un golpe sobre una nota todavia abierta la cierra ANTES del
//     noteOn nuevo, y no despues (si no, el noteOff viejo corta al nuevo)
//   - rango: velocity siempre en 1-127 (0 seria un noteOff disfrazado)
//   - el FSR manda CC solo cuando el valor cambia
//   - panico al cerrar la pagina: All Notes Off y la fuerza de vuelta a 0
//   - eleccion de puerto, incluido Helm abierto DESPUES que la pagina
//   - costo de dibujo constante (el mismo test que harness_golpes.js)
//
// Uso:
//   node entorno-digital/tools/harness_midi.js <archivo.html>
//   node entorno-digital/tools/harness_midi.js <archivo.html> --golpes=500 --frames=600

"use strict";

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------
const args = process.argv.slice(2);
const archivo = args.find(function (a) { return a.indexOf("--") !== 0; });
if (!archivo) {
  console.error("uso: node harness_midi.js <archivo.html> [--golpes=N] [--frames=N]");
  process.exit(1);
}
function opcion(nombre, porDefecto) {
  const a = args.find(function (x) { return x.indexOf("--" + nombre + "=") === 0; });
  return a ? parseFloat(a.split("=")[1]) : porDefecto;
}
const N_GOLPES = opcion("golpes", 500);
const N_FRAMES = opcion("frames", 600);

// ---------------------------------------------------------------
// Reloj falso: performance.now() y setTimeout manejados a mano, para que los
// noteOff diferidos corran cuando el harness lo decide.
// ---------------------------------------------------------------
let tiempoFalso = 0;   // ms
let timers = [];
let proximoTimer = 1;

function setTimeoutFalso(fn, ms) {
  const id = proximoTimer++;
  timers.push({ id: id, t: tiempoFalso + (ms || 0), fn: fn });
  return id;
}
function clearTimeoutFalso(id) {
  timers = timers.filter(function (x) { return x.id !== id; });
}
function avanzar(ms) {
  const fin = tiempoFalso + ms;
  for (;;) {
    timers.sort(function (a, b) { return a.t - b.t; });
    if (timers.length === 0 || timers[0].t > fin) break;
    const x = timers.shift();
    tiempoFalso = x.t;
    x.fn();
  }
  tiempoFalso = fin;
}

// ---------------------------------------------------------------
// MIDI falso: cada send() queda registrado con el puerto que lo recibio.
// ---------------------------------------------------------------
const mensajes = [];   // { puerto, bytes, t }

function salidaFalsa(id, nombre) {
  return {
    id: id, name: nombre, state: "connected",
    send: function (bytes) {
      mensajes.push({ puerto: nombre, bytes: Array.from(bytes), t: tiempoFalso });
    }
  };
}

const accesoMidi = { outputs: new Map(), inputs: new Map(), onstatechange: null };

// ---------------------------------------------------------------
// DOM falso: lo minimo para que el script corra. Registra los arc() por frame.
// ---------------------------------------------------------------
const dibujo = { arcsFrame: 0 };

function ctx2dFalso() {
  return {
    globalCompositeOperation: "source-over",
    globalAlpha: 1, fillStyle: "#000", strokeStyle: "#000", lineWidth: 1,
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
    value: "", textContent: "", className: "",
    disabled: false, selected: false,
    style: {},
    hijos: [],
    classList: { add: function () {}, remove: function () {}, toggle: function () { return false; },
                 contains: function () { return false; } },
    _oyentes: {},
    addEventListener: function (tipo, fn) {
      (el._oyentes[tipo] = el._oyentes[tipo] || []).push(fn);
    },
    appendChild: function (h) { el.hijos.push(h); return h; },
    getContext: function () { return el._ctx || (el._ctx = ctx2dFalso()); },
    getBoundingClientRect: function () { return { top: 0, left: 0, width: 100, height: 100 }; }
  };
  Object.defineProperty(el, "innerHTML", {
    set: function () { el.hijos = []; }, get: function () { return ""; }
  });
  return el;
}

const elementos = {};
const VALORES = { picoMin: "30", picoMax: "600" };
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
let audioContextsCreados = 0;
const oyentesWindow = {};

const window_ = {
  innerWidth: 1280,
  innerHeight: 800,
  devicePixelRatio: 1,
  // Si la pagina construyera un AudioContext, aca queda registrado.
  AudioContext: function () { audioContextsCreados++; },
  addEventListener: function (tipo, fn) {
    (oyentesWindow[tipo] = oyentesWindow[tipo] || []).push(fn);
  },
  requestAnimationFrame: function (fn) { rafPendiente = fn; return 1; }
};

const document_ = {
  getElementById: conseguir,
  createElement: function () { return elementoFalso("tmp"); }
};

// La pagina recuerda el ultimo puerto elegido. Sin este stub, Node avisa que
// no tiene localStorage (y la pagina igual lo tolera, por el try/catch).
const guardado_ = {};
const localStorageFalso = {
  getItem: function (k) { return guardado_[k] === undefined ? null : guardado_[k]; },
  setItem: function (k, v) { guardado_[k] = String(v); }
};

const navigator_ = {
  // Sin "serial": la pagina toma la rama sin Web Serial. Sin "permissions":
  // el MIDI se habilita recien con el clic, como en la primera visita.
  requestMIDIAccess: function () { return Promise.resolve(accesoMidi); }
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

const cuerpo = m[1] + "\n; return { feedGolpe: window.feedGolpe, feedForce: window.feedForce };";
const fn = new Function(
  "window", "document", "navigator", "performance", "requestAnimationFrame",
  "setTimeout", "clearTimeout", "console", "TextDecoderStream", "AudioContext",
  "localStorage", cuerpo
);
const api = fn(
  window_, document_, navigator_, { now: function () { return tiempoFalso; } },
  window_.requestAnimationFrame, setTimeoutFalso, clearTimeoutFalso, console,
  function () {}, window_.AudioContext, localStorageFalso
);

if (typeof api.feedGolpe !== "function" || typeof api.feedForce !== "function") {
  console.error("la pagina no expone window.feedGolpe y window.feedForce");
  process.exit(1);
}

// ---------------------------------------------------------------
// Utilidades de analisis
// ---------------------------------------------------------------
const esNoteOn = function (b) { return (b[0] & 0xF0) === 0x90 && b[2] > 0; };
const esNoteOff = function (b) {
  return (b[0] & 0xF0) === 0x80 || ((b[0] & 0xF0) === 0x90 && b[2] === 0);
};
const esCC = function (b, n) { return (b[0] & 0xF0) === 0xB0 && (n === undefined || b[1] === n); };

// Recorre una lista de mensajes y cuenta notas abiertas por numero de nota.
// Un noteOn sobre una nota ya abierta es un retrigger sin cierre previo.
function analizarNotas(lista) {
  const abiertas = {};
  let on = 0, off = 0, retriggerSinCierre = 0, offHuerfanos = 0;
  let velMin = 128, velMax = -1;
  lista.forEach(function (x) {
    const b = x.bytes;
    if (esNoteOn(b)) {
      on++;
      if (abiertas[b[1]]) retriggerSinCierre++;
      abiertas[b[1]] = (abiertas[b[1]] || 0) + 1;
      velMin = Math.min(velMin, b[2]);
      velMax = Math.max(velMax, b[2]);
    } else if (esNoteOff(b)) {
      off++;
      if (abiertas[b[1]]) abiertas[b[1]]--; else offHuerfanos++;
    }
  });
  const colgadas = Object.keys(abiertas).reduce(function (s, k) { return s + abiertas[k]; }, 0);
  return { on: on, off: off, colgadas: colgadas, retriggerSinCierre: retriggerSinCierre,
           offHuerfanos: offHuerfanos, velMin: velMin, velMax: velMax };
}

let fallas = 0;
function verificar(nombre, ok, detalle) {
  console.log((ok ? "  OK   " : "  FALLA") + "  " + nombre + (detalle ? " — " + detalle : ""));
  if (!ok) fallas++;
}

// ---------------------------------------------------------------
// Pruebas
// ---------------------------------------------------------------
(async function () {
  console.log("Archivo: " + path.relative(process.cwd(), rutaHtml));
  console.log("");

  // --- 1. Eleccion de puerto -----------------------------------------
  // Se habilita el MIDI sin ningun puerto (Helm todavia cerrado), y despues
  // aparecen dos: tiene que preferir el que se llama Helm.
  console.log("Puertos");
  const clic = (elementos.midiBtn && elementos.midiBtn._oyentes.click) || [];
  verificar("existe el boton para habilitar MIDI", clic.length > 0);
  for (const f of clic) await f();
  await Promise.resolve();

  api.feedGolpe(0, 300);   // sin puerto: no tiene que explotar ni mandar nada
  avanzar(500);
  verificar("sin puertos no se manda nada y no falla", mensajes.length === 0,
            mensajes.length + " mensajes");

  accesoMidi.outputs.set("p0", salidaFalsa("p0", "Midi Through Port-0"));
  accesoMidi.outputs.set("p1", salidaFalsa("p1", "Helm"));
  verificar("la pagina escucha cambios de puertos (Helm abierto despues)",
            typeof accesoMidi.onstatechange === "function");
  if (accesoMidi.onstatechange) accesoMidi.onstatechange({});

  api.feedGolpe(0, 300);
  avanzar(500);
  const destinos = new Set(mensajes.map(function (x) { return x.puerto; }));
  verificar("prefiere el puerto llamado Helm", destinos.size === 1 && destinos.has("Helm"),
            Array.from(destinos).join(", ") || "ningun mensaje");
  mensajes.length = 0;

  // --- 2. Ningun AudioContext ---------------------------------------
  console.log("");
  console.log("Sonido");
  api.feedForce(0.5);
  verificar("la pagina no construye ningun AudioContext", audioContextsCreados === 0,
            audioContextsCreados + " creados");
  api.feedForce(0);
  mensajes.length = 0;

  // --- 3. Golpes espaciados: notas colgadas y rango ------------------
  // Espaciados 120ms (mas que el bloqueo de 60ms del sketch), alternando dedos.
  for (let i = 0; i < N_GOLPES; i++) {
    api.feedGolpe(i % 2, Math.round(Math.random() * 1023));
    avanzar(120);
  }
  avanzar(2000);
  let a = analizarNotas(mensajes);
  console.log("");
  console.log("Golpes espaciados (" + N_GOLPES + " cada 120ms)");
  console.log("  noteOn: " + a.on + "  noteOff: " + a.off +
              "  velocity: " + a.velMin + "-" + a.velMax);
  verificar("cada golpe manda exactamente un noteOn", a.on === N_GOLPES, a.on + " de " + N_GOLPES);
  verificar("no quedan notas colgadas", a.colgadas === 0, a.colgadas + " abiertas");
  verificar("no hay noteOff sin su noteOn", a.offHuerfanos === 0, String(a.offHuerfanos));
  verificar("la velocity queda en 1-127", a.velMin >= 1 && a.velMax <= 127,
            a.velMin + "-" + a.velMax);
  const canales = new Set(mensajes.map(function (x) { return x.bytes[0] & 0x0F; }));
  verificar("todo va por un solo canal", canales.size === 1, "canales " + Array.from(canales).join(","));
  const notas = new Set(mensajes.filter(function (x) { return esNoteOn(x.bytes); })
                                .map(function (x) { return x.bytes[1]; }));
  console.log("  notas usadas: " + Array.from(notas).sort().join(", "));

  // La ley de velocity tiene que conservar la dinamica: el golpe mas suave y
  // el mas fuerte no pueden caer en la misma velocity.
  mensajes.length = 0;
  api.feedGolpe(0, 0); avanzar(500);
  api.feedGolpe(0, 1023); avanzar(500);
  const vels = mensajes.filter(function (x) { return esNoteOn(x.bytes); })
                       .map(function (x) { return x.bytes[2]; });
  console.log("  velocity del golpe mas suave / mas fuerte: " + vels.join(" / "));
  verificar("la velocity recorre el rango (suave < fuerte, fuerte = 127)",
            vels.length === 2 && vels[0] < vels[1] && vels[1] === 127);
  mensajes.length = 0;

  // --- 3b. Escala por intensidad ----------------------------------------
  // Si la pagina tiene selector de escala, la intensidad elige la nota. Se
  // verifica que el rango de calibracion se parta en tantos tramos como notas
  // tenga la escala, que los tramos tengan ancho parejo, que el mismo golpe
  // con la dispersion del piezo no salte entre muchas notas, y que cambiar de
  // escala cambie la cantidad de notas.
  const escalaSel = elementos.escalaSelect;
  console.log("");
  if (escalaSel && (escalaSel._oyentes.change || []).length > 0) {
    const PMIN = 30, PMAX = 600;   // calibracion por defecto de la pagina
    const notaDe = function (pico) {
      mensajes.length = 0;
      api.feedGolpe(0, pico);
      avanzar(150);
      const on = mensajes.find(function (x) { return esNoteOn(x.bytes); });
      return on ? on.bytes[1] : -1;
    };
    // Barrido ascendente: cuantas notas aparecen y cuantos pasos ocupa cada una.
    const barrer = function () {
      const cuenta = new Map();
      for (let i = 0; i <= 400; i++) {
        const nota = notaDe(Math.round(PMIN + (PMAX - PMIN) * i / 400));
        cuenta.set(nota, (cuenta.get(nota) || 0) + 1);
      }
      return cuenta;
    };
    const cambiarEscala = function (valor) {
      escalaSel.value = valor;
      escalaSel._oyentes.change.forEach(function (f) { f(); });
    };

    console.log("Escala por intensidad");
    cambiarEscala("pentaMenor6");
    notaDe(0);   // arranca desde abajo, para que la histeresis no arrastre nada
    let cuenta = barrer();
    const notas6 = Array.from(cuenta.keys()).sort(function (x, y) { return x - y; });
    const anchos = Array.from(cuenta.values());
    const desparejo = Math.max.apply(null, anchos) / Math.min.apply(null, anchos);
    console.log("  pentatonica de 6: notas " + notas6.join(", ") +
                "  ancho de cada tramo (pasos de 400): " + notas6.map(function (n) { return cuenta.get(n); }).join(", "));
    verificar("el barrido recorre las 6 notas de la escala", notas6.length === 6,
              notas6.length + " notas");
    const intervalos = notas6.map(function (n) { return n - notas6[0]; }).join(",");
    verificar("las notas son las de la pentatonica menor", intervalos === "0,3,5,7,10,12", intervalos);
    // La histeresis corre los bordes un 15 %, asi que en un barrido ascendente
    // el primer tramo queda un poco mas ancho y el ultimo un poco mas angosto
    // (1,15 contra 0,85, cociente 1,35). Con tramos a la mitad en los extremos,
    // como redondeaba la (b) con Web Audio, el cociente pasaria de 2,5.
    verificar("los tramos tienen ancho parejo (cociente max/min < 1,5)", desparejo < 1.5,
              desparejo.toFixed(2));

    // Jitter: el mismo golpe repetido con la dispersion real estimada (+-8 %).
    [0.25, 0.5, 0.75].forEach(function (centro) {
      const vistas = new Set();
      for (let i = 0; i < 200; i++) {
        const ruido = 1 + (Math.random() * 2 - 1) * 0.08;
        vistas.add(notaDe(Math.round((PMIN + centro * (PMAX - PMIN)) * ruido)));
      }
      verificar("golpe al " + (centro * 100) + " % con jitter +-8 %: a lo sumo 2 notas",
                vistas.size <= 2, vistas.size + " nota(s)");
    });

    cambiarEscala("pentaMenor11");
    notaDe(0);
    cuenta = barrer();
    verificar("con la escala de 11 notas el barrido recorre 11", cuenta.size === 11,
              cuenta.size + " notas");
    cambiarEscala("pentaMenor6");
    avanzar(2000);
    mensajes.length = 0;
  } else {
    console.log("Escala por intensidad: no aplica (la nota no depende de la intensidad en esta pagina)");
  }

  // --- 4. Rafaga sobre la misma nota: retrigger -----------------------
  // Golpes cada 20ms, mas rapido que la compuerta de la nota: cada golpe cae
  // con la nota anterior todavia abierta.
  for (let i = 0; i < 120; i++) {
    api.feedGolpe(1, 500);
    avanzar(20);
  }
  avanzar(2000);
  a = analizarNotas(mensajes);
  console.log("");
  console.log("Rafaga (120 golpes del mismo dedo cada 20ms)");
  console.log("  noteOn: " + a.on + "  noteOff: " + a.off);
  verificar("cada retrigger cierra la nota anterior antes del noteOn nuevo",
            a.retriggerSinCierre === 0, a.retriggerSinCierre + " sin cierre");
  verificar("tras la rafaga no queda ninguna nota colgada", a.colgadas === 0,
            a.colgadas + " abiertas");
  verificar("no hay noteOff sin su noteOn", a.offHuerfanos === 0, String(a.offHuerfanos));
  mensajes.length = 0;

  // --- 5. FSR -> CC ----------------------------------------------------
  // 50Hz durante 4s: reposo, rampa, meseta sostenida, bajada. La meseta
  // repite el mismo valor 50 veces y no deberia mandar nada.
  const lecturas = [];
  for (let i = 0; i < 50; i++) lecturas.push(0);
  for (let i = 0; i <= 50; i++) lecturas.push(i / 50);
  for (let i = 0; i < 50; i++) lecturas.push(1);
  for (let i = 50; i >= 0; i--) lecturas.push(i / 50);
  lecturas.forEach(function (f) { api.feedForce(f); avanzar(20); });
  const ccs = mensajes.filter(function (x) { return esCC(x.bytes, 1); })
                      .map(function (x) { return x.bytes[2]; });
  let repetidos = 0;
  for (let i = 1; i < ccs.length; i++) if (ccs[i] === ccs[i - 1]) repetidos++;
  console.log("");
  console.log("Fuerza -> CC1");
  console.log("  lecturas de FSR: " + lecturas.length + "  CC enviados: " + ccs.length +
              "  min/max: " + Math.min.apply(null, ccs) + "/" + Math.max.apply(null, ccs));
  verificar("solo se manda CC cuando el valor cambia", repetidos === 0 && ccs.length < lecturas.length,
            repetidos + " repetidos");
  verificar("el CC recorre 0-127", Math.max.apply(null, ccs) === 127 && ccs[ccs.length - 1] === 0);
  verificar("la fuerza no manda notas", analizarNotas(mensajes).on === 0);
  mensajes.length = 0;

  // --- 6. Panico al cerrar la pagina ------------------------------------
  api.feedForce(0.8);
  api.feedGolpe(0, 400);              // nota abierta en el momento de cerrar
  (oyentesWindow.pagehide || []).forEach(function (f) { f(); });
  avanzar(2000);
  a = analizarNotas(mensajes);
  const allNotesOff = mensajes.some(function (x) { return esCC(x.bytes, 123); });
  const ultimoCC1 = mensajes.filter(function (x) { return esCC(x.bytes, 1); }).pop();
  console.log("");
  console.log("Panico al cerrar la pagina");
  verificar("manda All Notes Off (CC123)", allNotesOff);
  verificar("devuelve la fuerza a 0", ultimoCC1 && ultimoCC1.bytes[2] === 0);
  verificar("la nota abierta queda cerrada", a.colgadas === 0, a.colgadas + " abiertas");
  verificar("el noteOff diferido no llega despues del panico como huerfano",
            a.offHuerfanos === 0, String(a.offHuerfanos));
  mensajes.length = 0;

  // --- 7. Costo de dibujo constante -----------------------------------
  console.log("");
  console.log("Costo de dibujo (arc() por frame)");
  const muestras = [];
  for (let f = 0; f < N_FRAMES; f++) {
    if (f % 6 === 0) api.feedGolpe(f % 2, 400);   // ~10 golpes/s a 60fps
    dibujo.arcsFrame = 0;
    avanzar(1000 / 60);
    const cb = rafPendiente;
    rafPendiente = null;
    if (cb) cb();
    muestras.push(dibujo.arcsFrame);
  }
  const tercio = Math.floor(N_FRAMES / 3);
  const prom = function (x) { return x.reduce(function (s, y) { return s + y; }, 0) / x.length; };
  const pIni = prom(muestras.slice(0, tercio)), pFin = prom(muestras.slice(-tercio));
  console.log("  promedio primer tercio: " + pIni.toFixed(2) +
              "   ultimo tercio: " + pFin.toFixed(2) +
              "   maximo: " + Math.max.apply(null, muestras));
  verificar("el costo por frame no crece con el historial (lienzo persistente)",
            pFin <= pIni + 2, "de " + pIni.toFixed(2) + " a " + pFin.toFixed(2));

  console.log("");
  if (fallas === 0) {
    console.log("Todo en orden.");
  } else {
    console.log(fallas + " verificacion(es) fallaron.");
    process.exit(1);
  }
})();
