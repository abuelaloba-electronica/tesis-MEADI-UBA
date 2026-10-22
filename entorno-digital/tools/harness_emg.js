#!/usr/bin/env node
//
// Banco de pruebas para la acumulacion EMG del dispositivo3
// (prototipo_emg_acumulacion_*_dispositivo.html).
//
// Hermano por copia de harness.js, pero en vez de inventar la senal la
// REPRODUCE: lee una captura del Monitor Serial (un archivo de texto con las
// lineas tal como las imprimio el sketch: "E:<n>", "L:<0|1>", "EMG base = ...")
// y se la entrega a la pagina por un puerto Web Serial falso, linea por linea.
// Asi se prueba el camino completo —handleLine(), el estado de electrodos,
// feedEMG() y la deteccion de contracciones— con la senal real de una sesion,
// sin placa, sin navegador y sin esperar.
//
// El reloj lo maneja el harness: cada linea "E:" avanza 20 ms (el sketch las
// emite a 50/s, tambien con el electrodo suelto); "L:" y las lineas legibles no
// avanzan el tiempo. Una captura del Monitor Serial no trae marcas de tiempo,
// asi que eso es lo mas fiel que se puede reconstruir.
//
// Salida: cuantos cuadrilateros se estamparon, cuando, con que duracion e
// intensidad, y cuantas contracciones se descartaron por breves. Comparar
// siempre contra la misma captura antes y despues de un cambio.
//
// Uso:
//   node entorno-digital/tools/harness_emg.js <archivo.html> <captura.txt>
//   node entorno-digital/tools/harness_emg.js <archivo.html> <captura.txt> --techo=300 --minDur=0.2
//   node entorno-digital/tools/harness_emg.js <archivo.html> <captura.txt> --traza
//
// --techo y --minDur mueven los sliders de la pagina antes de reproducir.
// --traza imprime cada linea con la envolvente y el estado, para ver por que
// una contraccion empezo o no.

"use strict";

const fs = require("fs");

// ---------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------
const args = process.argv.slice(2);
const posicionales = args.filter(function (a) { return a.indexOf("--") !== 0; });
const archivo = posicionales[0];
const captura = posicionales[1];
if (!archivo || !captura) {
  console.error("uso: node harness_emg.js <archivo.html> <captura.txt> [--techo=N] [--minDur=S] [--traza]");
  process.exit(1);
}
function opcion(nombre) {
  const a = args.find(function (x) { return x.indexOf("--" + nombre + "=") === 0; });
  return a ? a.split("=")[1] : null;
}
const TRAZA = args.indexOf("--traza") >= 0;
const MS_POR_E = 20;

// ---------------------------------------------------------------
// Reloj falso: performance.now() y setTimeout manejados a mano.
// ---------------------------------------------------------------
let tiempoFalso = 0;   // ms
let timers = [];
let proximoTimer = 1;
function setTimeoutFalso(fn, ms) {
  const id = proximoTimer++;
  timers.push({ id: id, t: tiempoFalso + (ms || 0), fn: fn });
  return id;
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
// DOM falso: lo minimo para que el script corra.
// ---------------------------------------------------------------
function ctx2dFalso() {
  return {
    globalCompositeOperation: "source-over",
    globalAlpha: 1, fillStyle: "#000", strokeStyle: "#000", lineWidth: 1,
    setTransform: function () {}, save: function () {}, restore: function () {},
    fillRect: function () {}, clearRect: function () {},
    beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
    closePath: function () {}, arc: function () {},
    fill: function () {}, stroke: function () {}, drawImage: function () {}
  };
}

function elementoFalso(id) {
  const el = {
    id: id, width: 0, height: 0,
    value: "", textContent: "", innerHTML: "", className: "",
    disabled: false, checked: false,
    style: {},
    classList: { add: function () {}, remove: function () {}, toggle: function () { return false; },
                 contains: function () { return false; } },
    _oyentes: {},
    addEventListener: function (tipo, fn) {
      (el._oyentes[tipo] = el._oyentes[tipo] || []).push(fn);
    },
    disparar: function (tipo, ev) {
      return Promise.all((el._oyentes[tipo] || []).map(function (fn) { return fn(ev || { target: el }); }));
    },
    setPointerCapture: function () {},
    getContext: function () { return el._ctx || (el._ctx = ctx2dFalso()); },
    getBoundingClientRect: function () { return { top: 0, left: 0, width: 100, height: 100 }; }
  };
  return el;
}

const elementos = {};
function conseguir(id) {
  if (!elementos[id]) elementos[id] = elementoFalso(id);
  return elementos[id];
}

// ---------------------------------------------------------------
// Web Serial falso: el harness empuja las lineas de la captura.
// ---------------------------------------------------------------
let controladorPuerto = null;
const puertoFalso = {
  readable: new ReadableStream({ start: function (c) { controladorPuerto = c; } }),
  open: async function () {},
  close: async function () {}
};
const serialFalso = {
  requestPort: async function () { return puertoFalso; },
  addEventListener: function () {}
};

let rafPendiente = null;
const ventana = {
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
  addEventListener: function () {},
  requestAnimationFrame: function (fn) { rafPendiente = fn; return 1; }
};

const documento = {
  getElementById: conseguir,
  createElement: function (tag) { return elementoFalso("<" + tag + ">"); }
};

// ---------------------------------------------------------------
// Cargar el <script> de la pagina
// ---------------------------------------------------------------
const html = fs.readFileSync(archivo, "utf8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("no encontre <script> en " + archivo); process.exit(1); }

const performanceFalso = { now: function () { return tiempoFalso; } };
const fn = new Function(
  "window", "document", "navigator", "performance", "requestAnimationFrame", "setTimeout",
  m[1]
);
fn(ventana, documento, { serial: serialFalso }, performanceFalso,
   ventana.requestAnimationFrame, setTimeoutFalso);

// ---------------------------------------------------------------
// Reproducir
// ---------------------------------------------------------------
function esperarMicrotareas() {
  return new Promise(function (r) { setImmediate(r); });
}

function mover(id, valor) {
  const el = conseguir(id);
  el.value = String(valor);
  return el.disparar("input");
}

async function main() {
  if (opcion("techo") !== null) await mover("techo", opcion("techo"));
  if (opcion("minDur") !== null) await mover("minDur", opcion("minDur"));

  await conseguir("connectBtn").disparar("click");
  for (let i = 0; i < 5; i++) await esperarMicrotareas();

  const lineas = fs.readFileSync(captura, "utf8").split(/\r?\n/);
  const enc = new TextEncoder();
  const estampados = [];
  let breves = 0;
  let cuentaPrevia = 0;
  let segundosSueltos = 0, electrodoSuelto = false;
  const emgLabel = conseguir("emgLabel");

  for (const linea of lineas) {
    if (linea.trim() === "") continue;
    const esE = /^E:\d/.test(linea);
    if (esE) {
      avanzar(MS_POR_E);
      if (electrodoSuelto) segundosSueltos += MS_POR_E / 1000;
    }
    if (/^L:/.test(linea)) electrodoSuelto = linea.trim() === "L:1";

    const antesLabel = emgLabel.innerHTML;
    controladorPuerto.enqueue(enc.encode(linea + "\n"));
    for (let i = 0; i < 4; i++) await esperarMicrotareas();
    if (esE && rafPendiente) { const f = rafPendiente; rafPendiente = null; f(tiempoFalso); }

    if (emgLabel.innerHTML !== antesLabel && /breve/i.test(emgLabel.innerHTML)) breves++;

    const cuenta = parseInt(conseguir("repCountVal").textContent || "0", 10);
    if (cuenta > cuentaPrevia) {
      estampados.push({ t: tiempoFalso / 1000, detalle: conseguir("lastVal").textContent });
      cuentaPrevia = cuenta;
    }
    if (TRAZA) {
      console.log(
        (tiempoFalso / 1000).toFixed(2).padStart(6) + "s  " + linea.padEnd(48).slice(0, 48) +
        " env " + conseguir("envVal").textContent.padStart(4) +
        (cuenta > 0 ? "  cuads " + cuenta : "")
      );
    }
  }

  const total = tiempoFalso / 1000;
  console.log("captura: " + captura);
  console.log("pagina:  " + archivo);
  console.log("duracion reproducida: " + total.toFixed(1) + " s  (" +
              Math.round(100 * segundosSueltos / Math.max(total, 0.001)) + " % con algun electrodo suelto)");
  console.log("cuadrilateros: " + estampados.length + "   descartados por breves: " + breves);
  for (const e of estampados) console.log("  " + e.t.toFixed(2).padStart(6) + " s   " + e.detalle);
  const extra = conseguir("pisoVal").textContent;
  if (extra) console.log("reposo estimado al final: " + extra);
}

main().catch(function (err) { console.error(err); process.exit(1); });
