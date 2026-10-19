# dispositivo2 — guante de percusión

Proyecto de Arduino sobre una placa **LilyPad Arduino USB** (ATmega32U4, 3.3V,
8MHz) que va cosida al dorso de la mano. Dos piezos en las puntas de dos dedos
detectan golpes contra una superficie, y un sensor de fuerza (FSR) se toca con
la mano opuesta. Las dos lecturas salen por Serial, tanto en formato legible
para el Monitor Serial como en líneas que consume la visualización web.

Inspirado en [Adafruit MIDI Drum Glove](https://learn.adafruit.com/midi-drum-glove),
del que se toma el gesto y el circuito base. Lo que **no** se toma es su
detección: ese proyecto usa un umbral binario y manda siempre la misma
intensidad, y acá la intensidad del golpe es justamente lo que da la expresión,
así que se captura el **pico** de cada golpe.

## Hardware

- Placa: LilyPad Arduino USB (LilyPad 2)
- Piezo del dedo 0 al pin **A2**, piezo del dedo 1 al pin **A3**, cada uno con
  su front-end RC en la punta del dedo:

  ```
  piezo ──┬── R_serie 10 kΩ ──┬── A2 / A3
          │                   │
       R_pd 100 kΩ         C 100 nF
          │                   │
         GND                 GND
  ```

  El capacitor no es opcional: sin él, con AREF = 3,3 V casi cualquier golpe
  satura en 1023 y se pierde toda la dinámica que se quiere medir, y además la
  resonancia mecánica del disco (3–6 kHz) queda muy por encima de lo que este
  loop alcanza a muestrear. **El pulldown va de 100 kΩ, no de 1 MΩ**: con el
  capacitor, 1 MΩ daría τ = 120 ms y bloquearía el retrigger unos 300 ms. La
  justificación completa está en
  [`entorno-digital/documentacion_percusion_guante.md`](../entorno-digital/documentacion_percusion_guante.md).
- Sensor de fuerza: FSR al pin **A4**, con resistencia de pulldown de 10K a GND
  ([referencia](https://learn.adafruit.com/force-sensitive-resistor-fsr/using-an-fsr))
- La LilyPad USB expone nueve sew tabs de I/O (`2, 3, 9, 10, 11, A2, A3, A4,
  A5`), o sea exactamente cuatro entradas analógicas: A5 queda libre. Verificar
  contra la serigrafía de la placa antes de coser.
- Sin LEDs ni otros actuadores conectados (por ahora)

## Protocolo de salida

Una línea por lectura, terminada en `\n`, a 9600 baudios. Conviven dos tipos de
línea sobre el mismo puerto: las legibles para depurar en el Monitor Serial y
las que parsea la web (que ignora en silencio todo lo que no reconoce).

| Línea | Frecuencia | Para qué |
|---|---|---|
| `G:<dedo>,<pico>` | por golpe detectado | `dedo` ∈ {0,1}, `pico` ∈ 0–1023 crudo (ya restado el reposo), para la web |
| `F:<0-1023>` | cada 20 ms (`printForceReading()`) | lectura cruda del FSR, para la web |
| `FSR reading = <n> - <descripción>` | cada 3 s (`printFsrReading()`) | diagnóstico legible |

El pico va **crudo**, no normalizado: la corrección vive del lado del navegador
—igual que con la gravedad del acelerómetro de `dispositivo1`— y así se puede
recalibrar el rango con sliders mientras se toca.

Quién lo consume:
[`entorno-digital/prototipo_percusion_guante_a_midi_v2_dispositivo.html`](../entorno-digital/prototipo_percusion_guante_a_midi_v2_dispositivo.html),
por Web Serial (Chrome o Edge de escritorio), que reenvía los golpes y la
presión a Helm por MIDI. Las versiones anteriores, con voz propia de Web Audio
o con la primera salida MIDI, están archivadas en
[`entorno-digital/prototipos/`](../entorno-digital/prototipos/). Ver
[`entorno-digital/documentacion_percusion_guante.md`](../entorno-digital/documentacion_percusion_guante.md).

## Archivos del sketch

- **`dispositivo2.ino`** — archivo único. Contiene el flujo del programa
  (`setup()`/`loop()`), la máquina de estados de detección de golpe por dedo, el
  árbitro que resuelve la diafonía entre los dos piezos, y las impresiones del
  FSR.

## Detección del golpe

Máquina de tres estados por dedo — `REPOSO` → `MIDIENDO_PICO` → `BLOQUEADO` —
con estas constantes, todas a calibrar contra el guante real:

| Constante | Valor | Criterio |
|---|---|---|
| `UMBRAL_ON` | 20 cuentas sobre el reposo | ≈65 mV, por encima del ruido del ADC (±3). El `threshold = 40` de Adafruit corresponde a otro front-end |
| `UMBRAL_OFF` | `UMBRAL_ON / 2` | Histéresis: evita re-disparar en la cola del decaimiento |
| `VENTANA_PICO` | 8 ms | ~23 muestras; cubre el ataque de la envolvente ya filtrada por el RC |
| `BLOQUEO_MS` | 60 ms | Techo de 16 golpes/s por dedo (un dedo humano sostiene 6–8) |
| `FACTOR_DIAFONIA` | 0,6 | Ver abajo |

**Diafonía entre dedos.** Los dos piezos están acoplados mecánicamente por el
guante y por el hueso: golpear un dedo excita el piezo del otro. Cuando los dos
pican en la misma ventana, se emite siempre el mayor y el menor sólo si supera
`0,6 × pico_mayor`. Ese 0,6 hay que medirlo con el guante puesto: golpear un
solo dedo veinte veces y ver qué fracción aparece en el otro canal. Si la
diafonía real lo supera, amortiguar con una capa de espuma entre piezo y guante.

El loop no usa `delay()` y el diagnóstico por golpe está detrás de
`DIAGNOSTICO = false`: los dos entrarían en el camino crítico de latencia, que
ya es de ~25–30 ms de punta a punta.

## Qué se hizo, paso a paso

1. **Sensor de pulso (descartado).** El dispositivo empezó siendo un par pulso +
   fuerza: un Pulse Sensor Amped en A5 con detección de latidos por interrupción
   de Timer1 a 500 Hz, que alimentaba el parpadeo de los círculos de
   `prototipo_circulos_fuerza_pulso_dispositivo.html`. Se le corrigió la
   calibración del umbral (el reposo real del sensor estaba en ~656 y no en el
   512 que asumía el código de referencia), pero aun así las lecturas crudas
   variaban muy poco (~655–658) y el BPM nunca se estabilizó. Se descartó el
   sensor, y con él `PulseSensor.ino` y `explicacion_meditation_trainer.md`. El
   historial de git los conserva.
2. **Sensor de fuerza (FSR).** Se mantiene tal cual: `printFsrReading()` cada 3s
   con su descripción legible ("Light touch", "Big squeeze") para el Monitor
   Serial, y `printForceReading()` con el formato compacto `F:<0-1023>` que
   consume la web. Al sacar la interrupción del sensor de pulso se liberó el
   ~5 % de CPU que gastaba, y el intervalo bajó de 30 ms a **20 ms**: eso suaviza
   la distorsión del audio y el efecto global del canvas.
3. **Guante de percusión.** Se agregaron los dos piezos con captura de pico, el
   front-end RC que hace que ese pico sea repetible, y el árbitro de diafonía.

## Estado actual / pendiente

- **Falta armar el guante y probarlo.** El sketch está escrito pero no se subió
  todavía a la placa: no existe el hardware.
- `UMBRAL_ON`, `FACTOR_DIAFONIA` y el rango de pico del lado de la web son
  estimaciones; los tres se calibran con el guante puesto.
- La diafonía mecánica entre los dos piezos es el riesgo abierto más grande.
- **Si se cambia el formato de las líneas `G:` o `F:`, hay que actualizar
  `handleLine()` en las cinco páginas `prototipo_percusion_guante_*.html`.** Las
  dos mitades están acopladas sólo por ese formato de texto.
