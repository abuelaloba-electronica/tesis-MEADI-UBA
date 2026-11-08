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
// Y en la copia de la experiencia (experiencia/guante_percusion.html), que ademas graba lo que suena en Helm (ver
// documentacion/experiencia.md, sección 5.3), con
// navigator.mediaDevices, MediaRecorder e IndexedDB falsos:
//
//   - que pida SOLO la fuente MAEDI-Helm-grabacion, por deviceId exacto y sin
//     procesamiento de voz; nunca el alias "default" ni un microfono
//   - sin la fuente, con los nombres ocultos o con una pista ajena: no graba
//   - que la grabacion arranque con el primer golpe, que Retroceso la
//     descarte y que la siguiente arranque recien con el golpe siguiente
//   - que el registro no se guarde antes de la cola (COLA_MS)
//   - registro version 2: cada anillo con su `t` y su nota en los eventos,
//     cada disco con `t0`/`t1` y sus CC, tiempos relativos al evento start
//   - el tope de GRABACION_MAX_MS y la fuente que aparece despues (devicechange)
//
// En las paginas que no graban (las activas), esa seccion dice "no aplica".
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

let accesoMidi = { outputs: new Map(), inputs: new Map(), onstatechange: null };

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
    getBoundingClientRect: function () { return { top: 0, left: 0, width: 100, height: 100 }; },
    // La captura de las copias de la experiencia compone un PNG.
    toBlob: function (cb) { cb(new Blob([new Uint8Array(64)], { type: "image/png" })); }
  };
  Object.defineProperty(el, "innerHTML", {
    set: function () { el.hijos = []; }, get: function () { return ""; }
  });
  return el;
}

let elementos = {};
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

// requestAnimationFrame encola: correrFrames() ejecuta lo pendiente. La
// captura pide su propio frame ademas del bucle de dibujo.
let rafCola = [];
function correrFrames() {
  const cola = rafCola;
  rafCola = [];
  cola.forEach(function (f) { f(); });
}
let audioContextsCreados = 0;
let oyentesWindow = {};

function AudioContextFalso() { audioContextsCreados++; }

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

// ---------------------------------------------------------------
// Grabacion falsa: fuentes de audio, pistas, MediaRecorder e IndexedDB.
// ---------------------------------------------------------------
const LATENCIA_START_MS = 7;   // el evento start llega unos ms despues de start()
let pedidosAudio = [];         // restricciones de cada getUserMedia
let pistas = [];               // pistas entregadas
let grabadores = [];           // MediaRecorder construidos
let guardados = {};            // lo que la pagina puso en IndexedDB, por clave

function flujoFalso(etiqueta, deviceId) {
  const oy = {};
  const pista = {
    kind: "audio", label: etiqueta, readyState: "live",
    // Como en el navegador, stop() no dispara "ended".
    stop: function () { pista.readyState = "ended"; },
    addEventListener: function (t, f) { (oy[t] = oy[t] || []).push(f); },
    getSettings: function () { return { deviceId: deviceId }; },
    _terminar: function () { pista.readyState = "ended"; (oy.ended || []).forEach(function (f) { f({}); }); }
  };
  pistas.push(pista);
  return {
    getAudioTracks: function () { return [pista]; },
    getTracks: function () { return [pista]; }
  };
}

// esc.entradas: [{ label, deviceId }] tal como las listaria el navegador.
// esc.etiquetaPista: si esta, la pista entregada se llama asi (fuente ajena).
function mediaDevicesFalso(esc) {
  const oyentes = {};
  return {
    oyentes: oyentes,
    enumerateDevices: function () {
      return Promise.resolve(esc.entradas.map(function (d) {
        return { kind: "audioinput", label: d.label, deviceId: d.deviceId, groupId: "" };
      }));
    },
    getUserMedia: function (c) {
      pedidosAudio.push(JSON.parse(JSON.stringify(c)));
      const a = c && c.audio;
      const pedido = a && a.deviceId;
      const id = pedido && (pedido.exact !== undefined ? pedido.exact : pedido);
      // Sin deviceId, el navegador entrega la entrada por defecto: la primera.
      const dev = id ? esc.entradas.find(function (d) { return d.deviceId === id; }) : esc.entradas[0];
      if (!dev) {
        const err = new Error("no existe esa fuente");
        err.name = "OverconstrainedError";
        return Promise.reject(err);
      }
      return Promise.resolve(flujoFalso(esc.etiquetaPista || dev.label, dev.deviceId));
    },
    addEventListener: function (t, f) { (oyentes[t] = oyentes[t] || []).push(f); }
  };
}

// Entrega un trozo por cada `timeslice`, con el tamano que daria el bitrate
// pedido, y uno ultimo al parar, antes de onstop: igual que el navegador.
function MediaRecorderFalso(flujo, opciones) {
  this.stream = flujo;
  this.mimeType = opciones && opciones.mimeType;
  this.bps = (opciones && opciones.audioBitsPerSecond) || 128000;
  this.state = "inactive";
  this.onstart = this.onstop = this.ondataavailable = this.onerror = null;
  this.bytes = 0;
  this.tStart = null;
  this.tStop = null;
  grabadores.push(this);
}
MediaRecorderFalso.isTypeSupported = function (m) { return m === "audio/webm;codecs=opus"; };
MediaRecorderFalso.prototype.start = function (slice) {
  if (this.state !== "inactive") throw new Error("InvalidStateError");
  const r = this;
  r.state = "recording";
  let ultimo = tiempoFalso;
  r._entregar = function () {
    const n = Math.max(1, Math.round((tiempoFalso - ultimo) * r.bps / 8000));
    ultimo = tiempoFalso;
    r.bytes += n;
    if (r.ondataavailable) r.ondataavailable({ data: new Blob([new Uint8Array(n)]) });
  };
  setTimeoutFalso(function () {
    r.tStart = tiempoFalso;
    ultimo = tiempoFalso;      // lo grabado empieza en start, no en start()
    if (r.onstart) r.onstart({});
  }, LATENCIA_START_MS);
  const tic = function () {
    if (r.state !== "recording") return;
    r._entregar();
    r._timer = setTimeoutFalso(tic, slice);
  };
  r._timer = setTimeoutFalso(tic, slice);
};
MediaRecorderFalso.prototype.stop = function () {
  if (this.state === "inactive") return;
  const r = this;
  r.state = "inactive";
  r.tStop = tiempoFalso;
  clearTimeoutFalso(r._timer);
  setTimeoutFalso(function () {
    r._entregar();
    if (r.onstop) r.onstop({});
  }, 0);
};

const indexedDBFalso = {
  open: function () {
    const pedido = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    setTimeoutFalso(function () {
      pedido.result = {
        createObjectStore: function () {},
        close: function () {},
        transaction: function () {
          const tx = { oncomplete: null, onerror: null, _put: null,
            objectStore: function () { return { put: function (reg, k) { tx._put = [k, reg]; } }; } };
          setTimeoutFalso(function () {
            if (tx._put) guardados[tx._put[0]] = tx._put[1];
            if (tx.oncomplete) tx.oncomplete();
          }, 1);
          return tx;
        }
      };
      if (pedido.onupgradeneeded) pedido.onupgradeneeded();
      if (pedido.onsuccess) pedido.onsuccess();
    }, 1);
    return pedido;
  }
};

// ---------------------------------------------------------------
// Extraer el <script> de la pagina. Se puede evaluar varias veces, cada una
// con un DOM, un window y un entorno de audio nuevos (cargarPagina).
// ---------------------------------------------------------------
const rutaHtml = path.resolve(archivo);
const html = fs.readFileSync(rutaHtml, "utf8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) {
  console.error("no se encontro un <script> en " + rutaHtml);
  process.exit(1);
}
const GRABA = /new MediaRecorder\(/.test(m[1]);
// Constantes de la pagina que las pruebas necesitan conocer.
function constante(nombre) {
  const c = m[1].match(new RegExp("const " + nombre + " = ([^;]+);"));
  return c ? Function("return (" + c[1] + ");")() : undefined;
}

const cuerpo = m[1] + "\n; return { feedGolpe: window.feedGolpe, feedForce: window.feedForce };";
const fn = new Function(
  "window", "document", "navigator", "performance", "requestAnimationFrame",
  "setTimeout", "clearTimeout", "console", "TextDecoderStream", "AudioContext",
  "localStorage", "MediaRecorder", "indexedDB", "Blob", cuerpo
);

// op.mediaDevices / op.MediaRecorder: sin ellos, la pagina no tiene con que
// grabar (como en las primeras pruebas). op.puertos: salidas MIDI ya abiertas.
let api = null;
function cargarPagina(op) {
  op = op || {};
  timers = [];
  rafCola = [];
  elementos = {};
  oyentesWindow = {};
  mensajes.length = 0;
  accesoMidi = { outputs: new Map(), inputs: new Map(), onstatechange: null };
  (op.puertos || []).forEach(function (p) { accesoMidi.outputs.set(p[0], salidaFalsa(p[0], p[1])); });
  const window_ = {
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    // Si la pagina construyera un AudioContext, aca queda registrado.
    AudioContext: AudioContextFalso,
    addEventListener: function (tipo, fn) {
      (oyentesWindow[tipo] = oyentesWindow[tipo] || []).push(fn);
    },
    requestAnimationFrame: function (fn) { rafCola.push(fn); return 1; }
  };
  const navigator_ = {
    // Sin "serial": la pagina toma la rama sin Web Serial. Sin "permissions":
    // el MIDI (y el audio) se habilitan recien con el clic, como en la
    // primera visita.
    requestMIDIAccess: function () { return Promise.resolve(accesoMidi); }
  };
  if (op.mediaDevices) navigator_.mediaDevices = op.mediaDevices;
  api = fn(
    window_, document_, navigator_, { now: function () { return tiempoFalso; } },
    window_.requestAnimationFrame, setTimeoutFalso, clearTimeoutFalso, console,
    function () {}, AudioContextFalso, localStorageFalso,
    op.MediaRecorder, op.indexedDB, Blob
  );
  if (typeof api.feedGolpe !== "function" || typeof api.feedForce !== "function") {
    console.error("la pagina no expone window.feedGolpe y window.feedForce");
    process.exit(1);
  }
  return api;
}
cargarPagina();

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
// Pruebas de grabacion. Cada escenario carga la pagina de nuevo: la captura
// es definitiva, asi que no se puede repetir sobre la misma instancia.
// ---------------------------------------------------------------
const FUENTE = "MAEDI-Helm-grabacion";
const HELM = { label: FUENTE, deviceId: "id-helm" };
// En Chrome, si la fuente de Helm fuera la entrada por defecto, aparece
// ademas este alias. La pagina no lo tiene que usar.
const ALIAS = { label: "Predeterminado - " + FUENTE, deviceId: "default" };
const MIC = { label: "Audio interno Estéreo analógico", deviceId: "id-mic" };

function vaciar() { return new Promise(function (r) { setImmediate(r); }); }

// Avanza el reloj de a un frame, corriendo el dibujo y las promesas.
async function pasar(ms) {
  const fin = tiempoFalso + ms;
  while (tiempoFalso < fin) {
    avanzar(Math.min(1000 / 60, fin - tiempoFalso));
    correrFrames();
    await vaciar();
  }
}

function tecla(key, code) {
  const e = { key: key, code: code || "", repeat: false, target: { tagName: "BODY" },
              preventDefault: function () {} };
  (oyentesWindow.keydown || []).forEach(function (f) { f(e); });
}
const espacio = function () { tecla(" ", "Space"); };

async function escenario(esc) {
  pedidosAudio = []; pistas = []; grabadores = []; guardados = {};
  const md = mediaDevicesFalso(esc);
  cargarPagina({ mediaDevices: md, MediaRecorder: MediaRecorderFalso,
                 indexedDB: indexedDBFalso, puertos: [["p1", "Helm"]] });
  for (const f of elementos.midiBtn._oyentes.click) await f();
  await vaciar();
  return md;
}

const estadoAudio = function () { return elementos.audioStatusText ? elementos.audioStatusText.textContent : ""; };

// Doble barra espaciadora y espera hasta que el registro este guardado.
async function capturar(margen) {
  espacio(); espacio();
  await pasar(margen);
  return guardados.guante;
}

async function probarGrabacion() {
  const COLA = constante("COLA_MS");
  const TOPE = constante("GRABACION_MAX_MS");
  console.log("Grabacion del sonido (COLA_MS " + COLA + ", tope " + (TOPE / 60000) + " min)");

  // --- 8a. Ciclo completo -------------------------------------------
  await escenario({ entradas: [ALIAS, MIC, HELM] });
  verificar("pide una sola fuente, la de Helm, por deviceId exacto",
            pedidosAudio.length === 1 && pedidosAudio[0].audio.deviceId &&
            pedidosAudio[0].audio.deviceId.exact === HELM.deviceId,
            JSON.stringify(pedidosAudio.map(function (p) { return p.audio.deviceId; })));
  const a0 = (pedidosAudio[0] || {}).audio || {};
  verificar("sin cancelacion de eco, supresion de ruido ni control de ganancia, en estereo",
            a0.echoCancellation === false && a0.noiseSuppression === false &&
            a0.autoGainControl === false && a0.channelCount === 2);
  verificar("el panel dice que esta lista", /Lista/.test(estadoAudio()), estadoAudio());

  await pasar(3000);
  verificar("no graba antes del primer golpe", grabadores.length === 0, grabadores.length + " grabadores");

  // Un dibujo de prueba que despues se borra.
  api.feedGolpe(0, 300); await pasar(400);
  api.feedGolpe(1, 300); await pasar(400);
  const r0 = grabadores[0];
  verificar("el primer golpe abre la grabacion, en Opus a 128 kb/s",
            grabadores.length === 1 && r0.state === "recording" &&
            r0.mimeType === "audio/webm;codecs=opus" && r0.bps === 128000,
            grabadores.length + " grabadores");
  verificar("el panel muestra que graba", /Grabando/.test(estadoAudio()), estadoAudio());

  tecla("Backspace");
  verificar("Retroceso descarta la grabacion", r0.state === "inactive");
  await pasar(1500);
  verificar("despues de Retroceso no vuelve a grabar sola", grabadores.length === 1,
            grabadores.length + " grabadores");

  // El dibujo que queda: tres golpes y una presion, con sus instantes.
  const tGolpes = [];
  tGolpes.push([tiempoFalso, 0]); api.feedGolpe(0, 300); await pasar(500);
  tGolpes.push([tiempoFalso, 1]); api.feedGolpe(1, 500); await pasar(500);
  const tPresion = tiempoFalso; api.feedForce(0.5); await pasar(600);
  const tSuelta = tiempoFalso; api.feedForce(0); await pasar(400);
  tGolpes.push([tiempoFalso, 0]); api.feedGolpe(0, 800); await pasar(1000);
  // La ultima: si Retroceso no la hubiera descartado, seria la primera y
  // las pruebas de abajo fallan en vez de romper el harness.
  const r1 = grabadores[grabadores.length - 1];
  verificar("el golpe siguiente abre una grabacion nueva", grabadores.length === 2 && r1.state === "recording",
            grabadores.length + " grabadores");

  espacio(); espacio();
  const tCongelar = tiempoFalso;
  await pasar(COLA - 300);
  verificar("durante la cola sigue grabando y no se guardo nada",
            r1.state === "recording" && guardados.guante === undefined,
            "estado " + r1.state + ", guardado " + (guardados.guante !== undefined));
  await pasar(1000);
  const reg = guardados.guante;
  verificar("despues de la cola se guarda el registro", !!reg);
  if (reg) {
    const s = reg.sonido;
    verificar("version 2 con su campo sonido", reg.version === 2 && s && typeof s === "object");
    verificar("la grabacion se cerro al terminar la cola",
              r1.tStop !== null && Math.abs(r1.tStop - (tCongelar + COLA)) < 20,
              "a los " + Math.round(r1.tStop - tCongelar) + " ms de congelar");
    if (s) {
      const durEsperada = (r1.tStop - r1.tStart) / 1000;
      const bytesEsperados = durEsperada * 128000 / 8;
      console.log("  duracion: " + s.duracion + " s  audio: " + s.audio.size + " bytes  eventos: " +
                  s.eventos.length + "  latenciaMs: " + s.latenciaMs);
      verificar("el audio es un Blob Opus en WebM", s.audio instanceof Blob &&
                s.audio.type === "audio/webm;codecs=opus" && s.audio.size > 0);
      verificar("la duracion va del evento start al final de la cola",
                Math.abs(s.duracion - durEsperada) < 0.02,
                s.duracion + " s, esperada " + durEsperada.toFixed(3));
      verificar("el audio es solo el de la segunda grabacion (lo descartado no entra)",
                Math.abs(s.audio.size - bytesEsperados) / bytesEsperados < 0.02,
                s.audio.size + " bytes, esperados ~" + Math.round(bytesEsperados));
      verificar("latenciaMs es un numero", typeof s.latenciaMs === "number");

      const anillos = reg.elementos.filter(function (e) { return e.tipo === "anillo"; });
      const discos = reg.elementos.filter(function (e) { return e.tipo === "disco"; });
      const rel = function (abs) { return Math.max(0, Math.round(abs - r1.tStart)); };
      verificar("quedan solo los elementos dibujados despues de Retroceso (3 anillos, 1 disco)",
                anillos.length === 3 && discos.length === 1, anillos.length + " anillos, " + discos.length + " discos");
      verificar("cada anillo tiene su t, en ms desde el evento start",
                anillos.length === 3 && anillos.every(function (e, i) { return e.t === rel(tGolpes[i][0]); }),
                anillos.map(function (e) { return e.t; }).join(", ") + " (esperados " +
                tGolpes.map(function (x) { return rel(x[0]); }).join(", ") + ")");
      verificar("el golpe que abrio la grabacion queda en t = 0", anillos[0] && anillos[0].t === 0);
      const d = discos[0] || {};
      verificar("el disco tiene t0 y t1 de la presion", d.t0 === rel(tPresion) && d.t1 === rel(tSuelta),
                d.t0 + "-" + d.t1 + " (esperados " + rel(tPresion) + "-" + rel(tSuelta) + ")");

      const ev = s.eventos;
      let ordenados = true;
      for (let i = 1; i < ev.length; i++) if (ev[i].t < ev[i - 1].t) ordenados = false;
      verificar("los eventos estan en orden y dentro de la grabacion",
                ordenados && ev.every(function (e) { return e.t >= 0 && e.t <= s.duracion * 1000; }));
      const notas = ev.filter(function (e) { return e.tipo === "nota"; });
      verificar("cada anillo tiene su nota en los eventos, con el mismo t y el mismo dedo",
                notas.length === anillos.length && anillos.every(function (a, i) {
                  return notas[i].t === a.t && notas[i].dedo === a.dedo &&
                         notas[i].vel >= 1 && notas[i].vel <= 127 && typeof notas[i].nota === "number";
                }), notas.length + " notas");
      const ccs = ev.filter(function (e) { return e.tipo === "cc"; });
      verificar("el disco tiene sus CC: 64 al apretar y 0 al soltar",
                ccs.some(function (e) { return e.t === d.t0 && e.valor === 64; }) &&
                ccs.some(function (e) { return e.t === d.t1 && e.valor === 0; }),
                ccs.map(function (e) { return e.t + ":" + e.valor; }).join(" "));
    }
  }
  verificar("despues de la captura la fuente queda cerrada", pistas.length === 1 && pistas[0].readyState === "ended");
  verificar("el panel dice que se guardo", /guardada/.test(estadoAudio()), estadoAudio());
  verificar("tampoco aca se construye ningun AudioContext", audioContextsCreados === 0);

  // --- 8b. Retroceso con el FSR apretado --------------------------------
  // La presion en curso es la primera del dibujo nuevo: abre la grabacion
  // siguiente y su disco arranca en t = 0.
  await escenario({ entradas: [HELM] });
  api.feedForce(0.5); await pasar(300);
  tecla("Backspace"); await pasar(300);
  api.feedForce(0); await pasar(200);
  let r = await capturar(COLA + 500);
  const disco = r && r.elementos.find(function (e) { return e.tipo === "disco"; });
  verificar("Retroceso con el FSR apretado: grabacion nueva y disco desde t = 0",
            grabadores.length === 2 && disco && disco.t0 === 0 && disco.t1 > 0 && r.sonido,
            grabadores.length + " grabadores, disco " + (disco ? disco.t0 + "-" + disco.t1 : "ninguno"));

  // --- 8c. Sin la fuente de Helm -----------------------------------------
  await escenario({ entradas: [MIC] });
  verificar("sin la fuente de Helm no abre ninguna entrada (ni el microfono)", pedidosAudio.length === 0,
            pedidosAudio.length + " pedidos");
  verificar("el panel lo dice", /No aparece/.test(estadoAudio()), estadoAudio());
  api.feedGolpe(0, 300); await pasar(300);
  r = await capturar(COLA + 500);
  verificar("se captura igual, con sonido null y anillos sin t",
            r && r.version === 2 && r.sonido === null && grabadores.length === 0 &&
            r.elementos.every(function (e) { return e.t === undefined; }));

  // --- 8d. El alias de la entrada por defecto, solo ------------------------
  await escenario({ entradas: [ALIAS, MIC] });
  verificar("no usa el alias \"default\" aunque diga " + FUENTE, pedidosAudio.length === 0,
            pedidosAudio.length + " pedidos");

  // --- 8e. Nombres ocultos (sin permiso guardado) ---------------------------
  await escenario({ entradas: [{ label: "", deviceId: "" }, { label: "", deviceId: "" }] });
  verificar("con los nombres ocultos no pide nada y el panel lo explica",
            pedidosAudio.length === 0 && /oculta/.test(estadoAudio()), estadoAudio());

  // --- 8f. La pista recibida no es la de Helm -------------------------------
  await escenario({ entradas: [HELM], etiquetaPista: MIC.label });
  api.feedGolpe(0, 300); await pasar(300);
  verificar("si la pista no es la de Helm, la cierra y no graba",
            pedidosAudio.length === 1 && pistas[0].readyState === "ended" && grabadores.length === 0,
            "pista " + (pistas[0] && pistas[0].readyState) + ", " + grabadores.length + " grabadores");

  // --- 8g. La fuente aparece despues (audio_helm.sh con la pagina abierta) --
  const entradas = [MIC];
  const md = await escenario({ entradas: entradas });
  entradas.push(HELM);
  (md.oyentes.devicechange || []).forEach(function (f) { f({}); });
  await vaciar();
  api.feedGolpe(0, 300); await pasar(300);
  verificar("devicechange: aparece la fuente y el golpe siguiente graba",
            pedidosAudio.length === 1 && grabadores.length === 1, grabadores.length + " grabadores");

  // --- 8h. Tope de grabacion ---------------------------------------------
  await escenario({ entradas: [HELM] });
  api.feedGolpe(0, 300);
  avanzar(TOPE + 1000);       // de un salto: los trozos de 1 s corren igual
  await vaciar();
  correrFrames();
  verificar("al tope se deja de grabar y el panel lo dice",
            grabadores[0].state === "inactive" && /Tope/.test(estadoAudio()), estadoAudio());
  api.feedGolpe(1, 300); await pasar(300);
  r = await capturar(COLA + 500);
  const an = r ? r.elementos.filter(function (e) { return e.tipo === "anillo"; }) : [];
  verificar("despues del tope se sigue dibujando: el anillo nuevo queda sin t, y no se abre otra grabacion",
            an.length === 2 && an[0].t === 0 && an[1].t === undefined && grabadores.length === 1);
  verificar("la duracion es la del tope y no espera la cola",
            r && r.sonido && Math.abs(r.sonido.duracion - TOPE / 1000) < 0.05,
            r && r.sonido ? r.sonido.duracion + " s" : "sin sonido");
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
    correrFrames();
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

  // --- 8. Grabacion del sonido de Helm (copia de la experiencia) ------
  console.log("");
  if (!GRABA) {
    console.log("Grabacion del sonido: no aplica (esta pagina no graba)");
  } else {
    await probarGrabacion();
  }

  console.log("");
  if (fallas === 0) {
    console.log("Todo en orden.");
  } else {
    console.log(fallas + " verificacion(es) fallaron.");
    process.exit(1);
  }
})();
