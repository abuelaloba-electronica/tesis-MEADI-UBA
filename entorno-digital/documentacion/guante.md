# Guante de percusión (dispositivo dos)

Un guante de percusión. La placa **LilyPad Arduino USB** va en el dorso de la
mano; dos piezos cosidos en las puntas de los dedos índice y medio detectan
golpes contra la mesa, y un FSR en el pecho se presiona con el índice de la
otra mano.

Cada golpe **suena** en **Helm**, un sintetizador que corre en paralelo y
recibe los golpes por MIDI, y **deja un anillo** en el lienzo. La intensidad
del golpe elige la nota dentro de una escala y el tamaño del anillo. La
presión del FSR **modula el sonido** (mueve los parámetros de Helm asignados a
la rueda de modulación) y dibuja su propia marca, un **disco relleno**.

| Archivo | Qué es |
|---|---|
| [`../prototipo_percusion_guante_a_midi_v2_dispositivo.html`](../prototipo_percusion_guante_a_midi_v2_dispositivo.html) | versión activa, lee el `dispositivo2` por USB y habla con Helm por Web MIDI |
| [`../experiencia/guante_percusion.html`](../experiencia/guante_percusion.html) | su copia para la pantalla 7, que además graba lo que suena en Helm |
| [`../tools/harness_midi.js`](../tools/harness_midi.js) | harness de Node con un `MIDIAccess` falso |

Hardware y sketch: [`../../dispositivo2/README.md`](../../dispositivo2/README.md).
Inspiración: [Adafruit MIDI Drum Glove](https://learn.adafruit.com/midi-drum-glove),
de donde salen el gesto y el circuito base. Lo que **no** se tomó es su
detección —un umbral binario que manda siempre velocity 127—, porque acá la
intensidad del golpe es justamente lo que da la expresión.

---

## 1 · Comportamiento actual (midi v2)

```
dispositivo2 ──USB serie──→ página (Web Serial) ──→ dibujo
                               │
                               └─ Web MIDI ──puerto MIDI──→ Helm ──→ parlantes
```

- **Los dos dedos dejan anillos huecos** de dos colores, compuestos con
  `multiply`: se oscurecen donde se cruzan, como tinta acumulándose.
- **El FSR deja un disco relleno** por presión, que crece mientras se aprieta
  y se estampa al soltar.

| | Página activa | Copia de la experiencia (§7) |
|---|---|---|
| dedo 0 | amarillo `#FFDE21` | amarillo limón `#eef202` |
| dedo 1 | naranja `#FF8C1A` | gris cálido `#847575` |
| FSR | azul `#0000FF` | negro azulado `#151923` |

La copia usa la paleta elegida con
[`../tools/paleta_colores.html`](../tools/paleta_colores.html); la página
activa conserva la anterior.
- **La página no suena**: traduce golpes y presión a mensajes MIDI. El sonido
  (síntesis, distorsión, delay, reverb) lo pone el patch de Helm.

### Requisitos para probarla

- **Navegador**: Chrome, Edge o Brave de escritorio. Web Serial y Web MIDI no
  existen en Firefox ni en Safari; ahí los botones quedan deshabilitados.
- **Helm** abierto y un puerto MIDI entre el navegador y Helm (§3.4).
- **Firmware**: `dispositivo2/dispositivo2.ino`.
- Sin la placa: con Helm abierto, **A** y **L** disparan los dedos 0 y 1, y
  **F** mantenida es una rampa de presión del FSR. Es la forma de diseñar el
  patch y de ver anillos y discos sin el guante.

---

## 2 · La entrada: circuito, protocolo y detección

El detalle del sketch está en `dispositivo2/README.md`. Lo que importa para
entender la página:

**El front-end RC de cada piezo** va en la punta del dedo, junto al piezo:

```
piezo ──┬── R_serie 10 kΩ ──┬── A2 (dedo 0) / A3 (dedo 1)
        │                   │
     R_pd 100 kΩ         C 100 nF
        │                   │
       GND                 GND
```

El montaje de Adafruit (piezo con un pulldown de 1 MΩ y nada más) alcanza
para saber *si* hubo golpe, pero no *cuán fuerte*: un piezo golpeado timbra
en su resonancia (3–6 kHz), por encima de Nyquist del loop del 32U4 a 8 MHz
(~2,7 kHz), así que el pico variaba ±20–40 % entre golpes idénticos; y con
AREF = 3,3 V un golpe fuerte satura en 1023.

| Componente | Qué resuelve |
|---|---|
| `C 100 nF` | divisor capacitivo con el piezo (~20 nF): atenúa el transitorio ×6. Con `R_serie` forma un pasabajos de ~160 Hz que deja pasar la envolvente del golpe y elimina la resonancia: ×18 de sobremuestreo, pico repetible. Elimina además el *crosstalk* del ADC |
| `R_serie 10 kΩ` | limita la corriente en los diodos de clamp del 32U4 (~0,7 mA con 10 V residuales) |
| `R_pd 100 kΩ` | descarga con τ = 12 ms. **No 1 MΩ**: con el capacitor daría τ = 120 ms y bloquearía el retrigger ~300 ms |

Montarlo en el dedo y llevar por hilo conductor sólo la salida de baja
impedancia evita que un nodo de alta impedancia atraviese el textil
captando zumbido de red y artefactos triboeléctricos.

**Protocolo** (una línea por lectura, `\n`, 9600 baudios nominales):

| Línea | Frecuencia | Qué hace la página |
|---|---|---|
| `G:<dedo>,<pico>` | por golpe | `dedo` ∈ {0,1}, `pico` 0–1023 **crudo** (ya restado el reposo) → `window.feedGolpe(dedo, pico)` |
| `F:<0-1023>` | cada 20 ms | normaliza a 0–1 → `window.feedForce(v)` |
| `FSR reading = … - …` | cada 3 s | se ignora (diagnóstico para el Monitor Serial) |

El pico va crudo: la calibración vive en el navegador (sliders `picoMin` /
`picoMax`), igual que la gravedad del acelerómetro. `handleLine()` compara los
**dos primeros caracteres** y no usa `startsWith("F")`, porque la línea de
diagnóstico también empieza con `F`; y conserva el `trim()`, porque
`println()` emite `\r\n`.

`window.feedGolpe` y `window.feedForce` son la **única frontera de entrada**:
por ahí entran el lector de Web Serial, el teclado y la consola.

**Detección en el sketch**: una máquina de tres estados por dedo
(reposo → midiendo el pico durante 8 ms → bloqueado 60 ms), con umbral de 20
cuentas e histéresis. **Diafonía**: los dos piezos están acoplados por el
guante y el hueso; cuando los dos pican en la misma ventana se emite el mayor,
y el menor sólo si supera `0,6 × pico_mayor`. Ese 0,6 hay que medirlo con el
guante puesto: es el ajuste que más va a costar.

---

## 3 · El sonido: Helm por MIDI

| Entrada | Mensaje MIDI |
|---|---|
| golpe | noteOn de la nota del tramo de intensidad donde cayó, dentro de la escala elegida (desde A2 el dedo 0, desde A3 el dedo 1), canal 1, velocity `58 + 69·v`; noteOff a los 80 ms |
| FSR | CC1 (rueda de modulación) 0–127, sólo cuando cambia |
| cerrar la página, cambiar de puerto, desconectar, botón de pánico | noteOff pendientes + CC123 + CC120 + CC1 = 0 |

### 3.1 · Por qué así

- **La traducción a MIDI vive en la página, no en el firmware.** La placa
  podría presentarse como USB-MIDI y hablarle a Helm directamente, pero la
  conversión de pico a nota tendría que vivir en el sketch y los sliders de
  calibración dejarían de afectar al sonido. Así, `feedGolpe` y `feedForce`
  siguen siendo la única frontera, y por ahí también pasan el teclado y la
  consola.
- **noteOff a los 80 ms con `setTimeout`, sin timestamp.** Un instrumento
  percusivo no tiene "soltar la tecla", pero Helm necesita el noteOff para
  liberar la voz. Con un patch de sustain 0 la duración no se oye. Va con
  `setTimeout` porque un mensaje programado a futuro no se puede cancelar, y
  el retrigger necesita cancelarlo. El noteOn va "lo antes posible".
- **Retrigger**: si la nota del dedo todavía está abierta, se cierra **antes**
  del noteOn nuevo (`on₁, off₁, on₂, off₂`). Si no, el noteOff atrasado del
  primer golpe cortaría al segundo, y a 6-8 golpes/s pasa todo el tiempo.
- **CC1 sólo cuando cambia**: el FSR llega a 50 Hz y con la mano quieta
  mandaría 50 mensajes idénticos por segundo. Se eligió CC1 porque en Helm la
  rueda de modulación es una fuente propia que se puede arrastrar a varios
  destinos a la vez. El suavizado de los 128 pasos lo hace Helm.
- **Pánico** (`silenciarTodo()`): cerrar la página con una nota abierta,
  cambiar de puerto o desconectar con el FSR apretado dejarían a Helm colgado
  o distorsionado para siempre.
- **El puerto se elige solo**: el último elegido a mano (en `localStorage`) →
  uno que se llame "Helm" → un puerto virtual conocido (*Midi Through*,
  *IAC*, *loopMIDI*) → el primero. La lista se rearma con `onstatechange`,
  así que Helm puede abrirse después. El permiso de MIDI se pide con el
  botón o al conectar el dispositivo (después del puerto serie, para no
  superponer avisos), y si ya se concedió se habilita solo al cargar.

### 3.2 · La intensidad elige la nota

La página parte el rango de calibración (`picoMin`–`picoMax`) en tantos
**tramos iguales** como notas tenga la escala, y cada tramo dispara una
nota: `nota = TONICA[dedo] + GRADOS[g]`, con `x = v·n − 0,5` para que cada
tramo tenga el mismo ancho (el redondeo de `v·(n−1)` dejaba los extremos con
la mitad). Una **histéresis** del 15 % del tramo evita que un golpe justo en
el borde alterne entre dos notas.

Escalas del panel: **pentatónica menor de 6** (por defecto) o de 11 (dos
octavas), pentatónica mayor de 6, mayor de 8, y cromática de 13 como
contraste. Las pentatónicas no tienen notas a un semitono: tocadas en
cualquier orden suenan a música. Debajo, una tabla muestra qué rango de pico
dispara qué nota en cada dedo y resalta la del último golpe; sirve para
calibrar con el guante puesto. Cambiar de escala no limpia el lienzo: los
anillos no dependen de la nota.

**Velocity plana** (`58 + 69·v`, de 45 % a 100 %): si la intensidad eligiera
la nota y además dominara el volumen, sería imposible tocar una nota aguda
suave.

Cuántas notas usar es un compromiso: más notas son tramos más angostos. El
harness muestra 1–2 notas por golpe repetido con ±8 % de dispersión, tanto
con 6 como con 11; se dejan 6 porque ese ±8 % es una estimación.

### 3.3 · El patch de Helm

Lo mínimo para que suene a golpe:

- **Envolvente de amplitud**: attack 0, sustain 0, decay corto (0,1–0,5 s),
  release igual al decay (un retrigger corta la nota anterior sin que se
  note).
- **`velocity_track` al máximo**: la velocity ya llega plana.
- **Rueda de modulación → lo que controle el FSR.** Si no se conecta en
  Helm, apretar el FSR no cambia nada del sonido. El `Helm.config` de la
  máquina de trabajo asigna CC1 a `delay_on`, `distortion_on` y `reverb_on`:
  el FSR prende efectos con cola, y por eso el sonido dura más que el último
  golpe. Otros destinos posibles: el corte del filtro (el más fácil de oír) o
  el *feedback* del delay (no el *mix*, que al soltar corta los ecos de
  golpe).

### 3.4 · Puesta en marcha

1. **Un puerto MIDI entre el navegador y Helm.** Linux: *Midi Through Port-0*
   ya existe (`aconnect -o`), o elegir Helm directamente si aparece en el
   selector. macOS: activar el IAC Driver. Windows: loopMIDI.
2. **Helm**: activar ese puerto como entrada en su configuración.
3. **La página**: *Habilitar salida MIDI*, elegir el puerto si no lo eligió
   sola, y *Conectar dispositivo (USB)*.
4. Probar con **A**, **L** y **F** antes de ponerse el guante.

El orden de apertura no importa.

---

## 4 · La imagen

### 4.1 · Dos capas

```
#acum   persistente, nunca se limpia   ← se le estampa SÓLO la marca nueva, con multiply
#over   se limpia en cada frame        ← anillos de impacto vivos y el disco del FSR mientras se aprieta
```

Un guante genera 4–8 golpes por segundo: redibujar el historial completo
serían cientos de arcos a los pocos minutos. Y **no es sólo cuestión de
fps**: el lector de Web Serial corre en el mismo hilo que el dibujo, así que
un frame caro retrasa el sonido. El costo constante por frame es un requisito
de latencia. Con lienzo persistente, además, el `multiply` se aplica una sola
vez por marca, que es la definición de tinta acumulándose.

`#over` también compone con `mix-blend-mode: multiply`, para que el disco
vivo se vea igual que estampado y no haya salto al soltar.

### 4.2 · Los golpes: anillos

Cada golpe deja un anillo hueco de grosor `0,35·r`. La **forma** codifica qué
sensor produjo la marca (anillo = golpe, disco = presión) y el **tono**, qué
dedo. En la página activa los tonos son vecinos (amarillo y naranja), porque
los dos dedos son el mismo gesto; en la copia, el par de la paleta nueva
(amarillo limón y gris cálido) se separa más. El selector ofrece además otros
pares de amarillo y naranja. La intensidad
continua (no la nota) da el **tamaño** (`0,08` a `0,10 · min(W,H)`) y la
**opacidad** (piso 0,08): un anillo más grande es un golpe más fuerte, y por
lo tanto una nota más aguda.

Al golpear aparece además un **anillo de impacto** en el overlay, que crece
hasta 2,2 veces el radio y se desvanece en `ANILLO_DUR` (200 ms).

**Agrupamiento temporal**: un golpe a menos de 250 ms del anterior se dibuja
cerca de él y no al azar. Un redoble dibuja una constelación y los golpes
espaciados se dispersan.

### 4.3 · El FSR: un disco por presión

```
fuerza > 0,06           → empieza la presión: se elige una posición al azar
mientras se aprieta     → el disco vive en el overlay; radio y opacidad siguen
                          el PICO de la fuerza suavizada (crece, nunca se achica)
fuerza < 0,03           → se estampa en el lienzo acumulado con ese pico
```

| Decisión | Por qué |
|---|---|
| un disco por presión, no una señal continua | dibujado frame a frame sería una mancha que se espesa sin límite. Como gesto, se acumula igual que los golpes |
| umbral 0,06 / 0,03, con histéresis | el FSR en reposo no marca 0 exacto; sin histéresis, una presión floja se partiría en una ráfaga de discos |
| sigue el **pico**, no la fuerza actual | si no, al aflojar se achicaría y el estampado saltaría de tamaño al soltar |
| radio de `0,05` a `0,14 · min(W,H)` | más amplio que los anillos: el tamaño es lo único que distingue una presión de otra |
| posición al azar | una presión dura segundos y no tiene "anterior" |
| desconectar estampa la presión en curso | si no, el disco quedaría vivo para siempre |

La fuerza visual se suaviza con `TAU` = 0,03 s. Si la imagen y el sonido se
sienten desincronizados, ajustar `TAU` a oído (Helm suaviza el CC con su
propia constante). **F** es una rampa de 0 a 1 en 1,5 s (`FSR_RAMPA`), para
ver discos de distinto tamaño y oír el barrido completo del CC1 sin la placa.

---

## 5 · Latencia

| Etapa | Típico |
|---|---|
| ventana de pico (deliberada) | 8 ms |
| loop del sketch hasta el `Serial.print` | <1 ms |
| buffer CDC → host | ~1 ms |
| Web Serial: proceso de dispositivo → renderer | ~4 ms |
| envío del mensaje MIDI | <1 ms |
| buffer de audio de Helm (128–256 muestras a 48 kHz) | 3–5 ms, más el driver |
| **total** | **~17–20 ms más el driver** |

Es tocable y expresivo, pero no es percusión de precisión. Lo que más
molesta no es la latencia media (el cuerpo la compensa) sino el *jitter*, y
su fuente dominante es el hilo principal: por eso el lienzo persistente. Web
Serial no se puede sacar de ese hilo (`SerialPort` no es transferible a un
Worker).

---

## 6 · Cómo probar

```
node entorno-digital/tools/harness_midi.js entorno-digital/prototipo_percusion_guante_a_midi_v2_dispositivo.html
```

Con un `MIDIAccess` falso y el reloj manejado a mano verifica: que no se
construye ningún `AudioContext`; la preferencia por el puerto "Helm" aunque
aparezca después; 500 golpes sin notas colgadas, velocity en rango y un solo
canal; una ráfaga de 120 golpes del mismo dedo sin retriggers sin cierre; el
FSR sin CC repetidos; el pánico en `pagehide`; el costo de dibujo constante
(~2,8 arcos por frame, uno de ellos el disco vivo); y la escala (el barrido
recorre todas las notas, los tramos son parejos, el jitter, el cambio a 11).
Se comprobó que detecta fallas: quitando el cierre del retrigger o el filtro
de CC repetidos, las pruebas fallan. El ciclo de vida del disco (que se
estampe del mismo tamaño que el vivo, que el ruido bajo el umbral no dibuje)
se comprobó con una prueba aparte, no incorporada.

Sobre la copia de la experiencia, el mismo harness verifica además la
grabación del sonido ([`experiencia.md`](experiencia.md) §6).

---

## 7 · La copia de la experiencia (pantalla 7)

`guante_percusion.html` suena y dibuja igual.
Lo que agrega, además de lo común a las tres copias (Retroceso, barra
espaciadora dos veces, captura, → a `experiencia.html#8`; ver
[`experiencia.md`](experiencia.md) §3):

- **El fondo lo pinta el CSS**: `pintarFondo()` limpia `#acum` en lugar de
  pintar `#faf6f0`, y se captura `#acum`.
- **La paleta nueva** (§1): `colorDedo` arranca en `#eef202` / `#847575`, que
  es la primera opción del selector, y `COLOR_FSR` es `#151923`. Las barras
  del panel (`#hit0Fill`, `#hit1Fill`, `#forceFillBar`) usan los mismos
  colores. Siguen en `multiply` y con la opacidad por intensidad.
- **Los elementos de la captura**: cada anillo y cada disco estampado se
  anota en `elementos` en el momento de estamparlo, con `modo: "multiply"`.
- **Graba lo que suena en Helm** (sólo la fuente `MAEDI-Helm-grabacion`,
  nunca un micrófono) y lo guarda con la captura (`version: 2`, campo
  `sonido`), con el `t` de cada anillo, el `t0`/`t1` de cada disco y la
  lista de eventos MIDI. El detalle completo está en
  [`experiencia.md`](experiencia.md) §5.3.
- **Congelar** silencia Helm (CC1 = 0 apaga los efectos) y la grabación se
  cierra 2 s después para que entre la cola.
- En esta copia el MIDI no se habilita solo con el teclado: hay que usar el
  botón del panel, o conectar el guante.

En la composición final (pantalla 11) los anillos y discos se pueden agrandar,
y en el modo final vuelven a sonar en su momento: el anillo late y suelta su
onda, el disco se infla siguiendo los CC grabados
([`experiencia.md`](experiencia.md) §5.5). Las constantes del disco
(`R_FSR_MIN`, `R_FSR_MAX`, `ALPHA_MIN`, `TAU`) están copiadas allá en
`DISCO_GUANTE`: si cambian acá, hay que portarlas a mano.

---

## 8 · Pendiente

- **Calibrar con el guante puesto**: `UMBRAL_ON`, `FACTOR_DIAFONIA` y el
  rango de pico (`picoMin`/`picoMax`), y los umbrales del disco (0,06/0,03),
  que dependen del reposo real del FSR cosido. Medir la latencia real.
- **La diafonía mecánica entre los dos piezos** es el riesgo abierto más
  grande: el árbitro del firmware y una capa de espuma la mitigan, pero puede
  que nunca haya separación perfecta.
- **Elegir y guardar el patch de Helm** de la muestra (en
  `~/.helm/User Patches`) y anotarlo acá.
- Cuántas notas usar en la escala queda abierto (6 por defecto).
- Si alguna vez hiciera falta Firefox o Safari: un puente local que lea el
  puerto serie y lo reexponga por WebSocket. No está implementado.

---

## 9 · Historial de versiones

Los archivos de cada versión anterior se conservan en
[`../prototipos/`](../prototipos/).

**Círculos de fuerza y pulso** (`prototipo_circulos_fuerza_pulso.html` y
`_dispositivo`, 2026-08-11). El `dispositivo2` empezó siendo un textil en el brazo con
un FSR y un sensor de pulso. Cada presión del FSR dibujaba un círculo en una
posición al azar: la duración daba el diámetro, la fuerza la opacidad (la
versión con hardware usaba el pico y no el promedio), y los círculos se
mezclaban con `multiply`. El pulso hacía parpadear cada círculo al BPM
vigente cuando se creó, de forma indefinida. El Pulse Sensor Amped nunca dio
lecturas estables (el reposo estaba en ~656 y no en 512, y las lecturas
variaban en ~3 cuentas) y se descartó. Las páginas siguen funcionando con el
firmware nuevo, porque el formato `F:` no cambió, pero el parpadeo quedó fijo
en 72 bpm. De acá vienen el `multiply` y la idea de que una presión es un
gesto con principio y fin.

**Guante (a) con voz de Web Audio** (`prototipo_percusion_guante_a.html`
simulado y `_a_dispositivo`, 2026-09-07). Llegan los dos piezos con el
front-end RC y el árbitro de diafonía. Nota fija por dedo (A2 y A3); la
intensidad controlaba volumen, brillo y tamaño del círculo. La voz era un
oscilador con *pitch drop* (`f0·1,7 → f0` en 30 ms, que lo hace sonar a
membrana) más un chasquido de ruido, con tope de 12 voces y robo de la más
vieja. El FSR distorsionaba la voz moviendo `AudioParam` con
`setTargetAtTime` sobre una curva `tanh` fija (cambiar la curva en caliente
clickea) y aplicaba un efecto global a la imagen: desenfoque y una tinta
violeta acumulada. Su harness es `tools/harness_golpes.js`.

**Variante (b)** (eliminada el 2026-10-17). La intensidad elegía la nota de
una escala, con una imagen de partitura (bandas horizontales con un cursor).
Gustó el sonido y no la imagen: su manejo del sonido pasó a la (a) con MIDI y
la página se borró. Queda en el historial de git.

**Guante (a) con Helm por MIDI** (`prototipo_percusion_guante_a_midi_dispositivo.html`,
2026-10-15/17). Pedido: que el sonido lo genere Helm, en paralelo, y que la
página no suene. Antes se había descartado Helm "porque no corre en el
navegador"; la respuesta era otra: Helm como segundo programa que recibe los
golpes por un puerto MIDI. Web Audio desapareció y entró la salida MIDI con
el retrigger, el CC1 filtrado, el pánico y la elección de puerto. Primero con
nota fija por dedo y velocity `13 + 114·v^1,6` (la ley de amplitud de la voz
anterior); en una segunda parte, en el mismo archivo, la intensidad pasó a
elegir la nota con tramos iguales e histéresis, el selector de escala, la
tabla de tramos y la velocity plana. La imagen era la de la (a), con el
efecto global del FSR. El panel se hizo colapsable y ocultable.

**Guante (a) con Helm, v2: el FSR como disco azul**
(`prototipo_percusion_guante_a_midi_v2_dispositivo.html`, 2026-10-17, la
activa). El sonido no cambió. Los dos dedos pasaron a ser anillos de dos
tonos de amarillo, y el FSR, un disco azul propio que sigue el pico y se
estampa al soltar. Se quitó el efecto global: el desenfoque borroneaba
justamente el disco que representa al FSR, y la tinta se sumaba por frame y
no por tiempo (en un monitor de 120 Hz oscurecía el doble de rápido). El
overlay pasó a `multiply` y la tecla F, a una rampa.

**Copia para la experiencia** (2026-10-28 en adelante). Captura con la barra
espaciadora (2026-10-28); instrucciones movidas a la pantalla 6 (2026-11-02);
fondo por CSS y lista de `elementos` (2026-11-03); confirmación con la
segunda pulsación y **grabación del sonido de Helm** (2026-11-07).

**Copia: paleta nueva** (`experiencia/guante_percusion.html`, 2026-11-09).
Sólo cambian los colores: dedo 0 `#FFDE21` → `#eef202` (amarillo limón),
dedo 1 `#FF8C1A` → `#847575` (gris cálido) y el FSR `#0000FF` → `#151923`
(negro azulado), también en las barras del panel. El par nuevo es la primera
opción del selector y la de arranque; las tres anteriores se conservan. La
paleta se eligió con `tools/paleta_colores.html`, que previsualiza el guante
y la EMG solos y superpuestos en la composición. La página activa no se
tocó. Las capturas guardan el color de cada elemento, así que las anteriores
conservan los suyos. `harness_midi.js` da la misma salida que antes.
