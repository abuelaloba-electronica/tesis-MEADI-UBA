# Documentación: `prototipo_percusion_guante_a_midi_v2_dispositivo.html`

## Qué es

Un guante de percusión. La placa **LilyPad Arduino USB** va en el dorso de la
mano; dos piezos cosidos en las puntas de dos dedos detectan golpes contra una
superficie, y un FSR —el mismo que ya usaba `dispositivo2`— se toca con la mano
opuesta.

Cada golpe **suena** en **Helm**, un sintetizador que corre en paralelo y
recibe los golpes por MIDI, y **deja un anillo** en el lienzo. La intensidad
del golpe elige la nota dentro de una escala y el tamaño del anillo. La presión
del FSR **modula el sonido** (mueve el parámetro de Helm que se le asigne) y
dibuja su propia marca, un **disco azul**.

Reemplaza al par fuerza + pulso: el Pulse Sensor Amped nunca llegó a dar
lecturas estables y se descartó. Las páginas de círculos quedaron archivadas en
`prototipos/` (siguen funcionando con el firmware nuevo, porque el formato `F:`
no cambió).

Inspiración: [Adafruit MIDI Drum Glove](https://learn.adafruit.com/midi-drum-glove).
De ahí sale el gesto y el circuito base. Lo que **no** tomamos es su detección
—un umbral binario que manda siempre velocity 127— porque acá la intensidad del
golpe es justamente lo que da la expresión.

## Versiones

La versión activa es
[`prototipo_percusion_guante_a_midi_v2_dispositivo.html`](prototipo_percusion_guante_a_midi_v2_dispositivo.html).
Las anteriores están archivadas en [`prototipos/`](prototipos/) y se conservan
para comparar:

| Archivo | Idea principal |
|---|---|
| [`prototipos/prototipo_percusion_guante_a.html`](prototipos/prototipo_percusion_guante_a.html) | Variante (a) con sensores simulados (pads clicables y slider de fuerza). Nota fija por dedo (A2 y A3); la intensidad controla volumen, brillo y tamaño del círculo. Suena con una voz propia de Web Audio. |
| [`prototipos/prototipo_percusion_guante_a_dispositivo.html`](prototipos/prototipo_percusion_guante_a_dispositivo.html) | La misma variante (a), leyendo el guante por USB. El FSR distorsiona la voz de Web Audio y aplica un efecto global a la imagen: desenfoque y una tinta violeta acumulada. |
| [`prototipos/prototipo_percusion_guante_a_midi_dispositivo.html`](prototipos/prototipo_percusion_guante_a_midi_dispositivo.html) | La imagen de la (a), con el sonido en Helm por MIDI. La intensidad pasa a elegir la nota de una escala elegible. El FSR sale como CC1 y conserva el efecto global sobre la imagen. Ver [`cambios_percusion_guante_midi.md`](prototipos/cambios_percusion_guante_midi.md). |
| **`prototipo_percusion_guante_a_midi_v2_dispositivo.html`** (activa) | Suena igual que la anterior. Cambia la imagen: los dos dedos son anillos de dos tonos de amarillo, y el FSR dibuja un disco azul propio en lugar del efecto global. Ver [`cambios_percusion_guante_midi_v2.md`](prototipos/cambios_percusion_guante_midi_v2.md). |

**Sobre las versiones con Web Audio**, en una línea cada idea: la voz era un
oscilador con *pitch drop* (`f0·1,7 → f0` en 30 ms, lo que la hace sonar a
membrana) más un chasquido de ruido; la distorsión del FSR movía `AudioParam`
con `setTargetAtTime` sobre una curva `tanh` fija, porque cambiar la curva en
caliente clickea; y la polifonía tenía tope de 12 voces con robo de la más
vieja. Su harness es [`tools/harness_golpes.js`](tools/harness_golpes.js).
El detalle está en el código de esas páginas y en el historial de git de este
documento.

Hubo además una variante (b), con la escala por intensidad y una imagen de
partitura. Se eliminó; su manejo del sonido sigue vivo en las páginas `_midi_`
y queda en el historial de git.

## Requisitos para probarlo

- **Navegador**: Chrome o Edge de escritorio. Web Serial y Web MIDI no existen
  en Firefox ni en Safari; ahí los botones quedan deshabilitados.
- **Helm** abierto y un puerto MIDI entre Chrome y Helm: ver
  [Puesta en marcha](#puesta-en-marcha).
- **Firmware**: `dispositivo2/dispositivo2.ino` con la detección de piezos.
- Se abre con doble clic (`file://`). No hay build step ni dependencias.

## Circuito de los piezos

Acá nos apartamos de Adafruit a propósito. Su montaje —piezo con un pulldown de
1 MΩ y nada más— alcanza para decidir *si* hubo golpe, pero no para medir *cuán
fuerte*, por dos razones:

1. Un disco piezo golpeado no da un pulso: da un timbrado en su resonancia
   mecánica, típicamente **3–6 kHz**. El loop del ATmega32U4 a 8 MHz alcanza
   unas 2,7 kHz de muestreo (`analogRead()` tarda ~112 µs y hay tres canales),
   o sea **por debajo de Nyquist de ese timbrado**: cada muestra cae en una fase
   arbitraria y el pico varía ±20–40 % entre golpes idénticos.
2. Con AREF = 3,3 V, un golpe fuerte satura en 1023 y se pierde toda la
   dinámica.

Por eso cada dedo lleva su propio front-end RC, montado **en la punta del dedo,
junto al piezo**:

```
piezo ──┬── R_serie 10 kΩ ──┬── A2 (dedo 0) / A3 (dedo 1)
        │                   │
     R_pd 100 kΩ         C 100 nF
        │                   │
       GND                 GND
```

| Componente | Qué resuelve |
|---|---|
| `C 100 nF` | Divisor capacitivo con la capacidad del piezo (~20 nF): atenúa el transitorio ×6, así que 30–60 V quedan en 5–10 V. Junto con `R_serie` forma un pasabajos de ~160 Hz, que deja pasar entera la envolvente del golpe (10–30 ms) y elimina la resonancia. Con la señal limitada a ~150 Hz y muestreo a 2,7 kHz hay ×18 de sobremuestreo: el pico se vuelve repetible. |
| `R_serie 10 kΩ` | Limita la corriente en los diodos de clamp internos del 32U4 (~0,7 mA con 10 V residuales). Sin protección, esa corriente la limita sólo la impedancia de la fuente piezoeléctrica, que en el transitorio es baja: es un riesgo real de degradar el pin. |
| `R_pd 100 kΩ` | Descarga, τ = 100k × 120n = **12 ms**. **No poner 1 MΩ acá**: con el capacitor daría τ = 120 ms y bloquearía el retrigger unos 300 ms. El 1 MΩ de Adafruit es correcto sólo *sin* capacitor. |

Montarlo en el dedo y llevar por hilo conductor sólo la salida de baja
impedancia importa más de lo que parece: un nodo de alta impedancia atravesando
el textil capta zumbido de red y artefactos triboeléctricos del propio
movimiento de la tela. De yapa, el capacitor elimina el *crosstalk* entre
canales del ADC (el sample-and-hold de 14 pF del 32U4 retiene carga del canal
anterior).

Opcional y barato: un Zener de 3,3 V o dos Schottky (a 3V3 y a GND) en el nodo
del ADC.

**Pines.** La LilyPad USB expone nueve sew tabs de I/O —`2, 3, 9, 10, 11, A2,
A3, A4, A5`—, o sea exactamente cuatro entradas analógicas. Piezos en **A2/A3**,
FSR en **A4** (sin cambios), A5 libre. Conviene verificarlo contra la serigrafía
de la placa antes de coser.

## Protocolo serie (Arduino → navegador)

Una línea de texto por lectura, terminada en `\n`, a 9600 baudios nominales.

| Línea | Frecuencia | Qué hace la web |
|---|---|---|
| `G:<dedo>,<pico>` | por golpe | `dedo` ∈ {0,1}, `pico` ∈ 0–1023 **crudo** (ya restado el reposo). Llama a `window.feedGolpe(dedo, pico)` |
| `F:<0-1023>` | cada 20 ms | Normaliza a 0–1 y llama a `window.feedForce(v)`. **Sin cambios** respecto del sketch anterior |
| `FSR reading = ... - ...` | cada 3 s | Se ignora (diagnóstico legible para el Monitor Serial) |

El pico va **crudo, no normalizado**: es la convención del repo —la corrección
vive del lado del navegador, igual que con la gravedad del acelerómetro— y
permite recalibrar el rango con sliders mientras se toca.

El parser (`handleLine()`) compara los **dos primeros caracteres**, no usa
`startsWith("F")`: la línea de diagnóstico `FSR reading = ...` también empieza
con `F` y no debe confundirse con una lectura. Y conserva el `trim()`, porque
`Serial.println()` emite `\r\n`.

`window.feedGolpe` y `window.feedForce` son la **única** frontera de entrada de
datos: por ahí entran el lector de Web Serial, el teclado y cualquier prueba
desde la consola.

## Detección del golpe (en el sketch)

Máquina de tres estados por dedo:

```
REPOSO  : si (v - base) > UMBRAL_ON  → MIDIENDO_PICO, pico = v-base
MIDIENDO: pico = max(pico, v-base)
          al vencer VENTANA_PICO → arbitrar contra el otro dedo, emitir
BLOQUEADO: tras BLOQUEO_MS y con la señal ya baja → REPOSO
```

| Constante | Valor | Criterio |
|---|---|---|
| `UMBRAL_ON` | 20 cuentas sobre el reposo | ≈65 mV, por encima del ruido del ADC (±3). El `threshold = 40` de Adafruit corresponde a otro front-end |
| `UMBRAL_OFF` | `UMBRAL_ON / 2` | Histéresis: evita re-disparar en la cola del decaimiento |
| `VENTANA_PICO` | 8 ms | ~23 muestras; cubre el ataque de la envolvente ya filtrada |
| `BLOQUEO_MS` | 60 ms | Techo de 16 golpes/s por dedo (un dedo humano sostiene 6–8) |
| `FACTOR_DIAFONIA` | 0,6 | Ver abajo |
| `base` | promedio de 64 lecturas al arrancar | Mismo criterio que hubo que aplicarle al sensor de pulso |

**Diafonía entre dedos.** Los dos piezos están acoplados mecánicamente por el
guante y por el hueso: golpear un dedo excita el piezo del otro. Cuando los dos
pican en la misma ventana se emite siempre el mayor, y el menor sólo si supera
`0,6 × pico_mayor`. **Ese 0,6 hay que medirlo con el guante puesto** (golpear un
solo dedo veinte veces y ver qué fracción aparece en el otro canal); si la
diafonía real lo supera, hay que amortiguar con una capa de espuma entre piezo y
guante. Es el ajuste que más va a costar.

## El sonido: Helm por MIDI

La página no produce ningún sonido: traduce golpes y presión a mensajes MIDI,
y **Helm**, que corre en paralelo como aplicación standalone, los convierte en
sonido. El porqué de cada decisión está en
[`prototipos/cambios_percusion_guante_midi.md`](prototipos/cambios_percusion_guante_midi.md).

```
dispositivo2 ──USB serie──→ página (Web Serial) ──→ dibujo
                               │
                               └─ Web MIDI ──puerto MIDI──→ Helm ──→ parlantes
```

| Entrada | Mensaje MIDI |
|---|---|
| golpe | noteOn de la nota del tramo de intensidad donde cayó el golpe, dentro de la escala elegida (desde A2 el dedo 0, desde A3 el dedo 1), canal 1, velocity plana `58 + 69·v`; noteOff a los 80 ms |
| FSR | CC1 (rueda de modulación) 0–127, sólo cuando cambia |
| cerrar la página, cambiar de puerto, desconectar, botón de pánico | noteOff pendientes + CC123 + CC120 + CC1 = 0 |

### Escala elegible y tabla de tramos

La página parte el rango de calibración (`picoMin`–`picoMax`) en tantos
tramos **iguales** como notas tenga la escala, y cada tramo dispara una nota.
Se elige la escala en el panel: pentatónica menor de 6 notas (por defecto) o
de 11 (dos octavas), pentatónica mayor de 6, mayor de 8, o cromática de 13
como contraste. Debajo, una tabla muestra qué rango de pico dispara qué nota
en cada dedo y resalta la del último golpe. Cambiar de escala no limpia el
lienzo: los anillos no dependen de la nota.

Para alguien sin formación musical, alcanza con esto:

- **Nota MIDI** es un número: 60 es el do central del piano, y sumar 1 sube
  una tecla (blanca o negra). Sumar 12 da la misma nota una **octava** más
  aguda.
- **Escala** es la lista de notas permitidas. En vez de usar las 12 de cada
  octava, se usa un subconjunto que suena bien en cualquier orden.
- **Pentatónica** es una escala de 5 notas por octava (6 contando la repetición
  de arriba) sin ningún par de notas pegadas: por eso cualquier secuencia de
  golpes suena a música. Es la escala de muchas músicas tradicionales y del
  blues.
- **Velocity** es la fuerza con que se "aprieta la tecla" (1–127). Acá la
  fuerza ya eligió la nota, así que la velocity varía poco: si además
  dominara el volumen, sería imposible tocar una nota aguda suave.

Cuántas notas usar es un compromiso: más notas son tramos más angostos, y un
mismo golpe repetido cae más fácil en dos notas distintas. Una histéresis (un
15 % de margen para cambiar de nota) lo contiene, y el harness muestra 1–2
notas por golpe repetido con ±8 % de dispersión, tanto con 6 como con 11.

### Puesta en marcha

1. **Un puerto MIDI entre Chrome y Helm.**
   - **Linux**: no hace falta instalar nada. El kernel ya trae *Midi Through
     Port-0* (`aconnect -o` lo lista). Si Helm aparece con su propio nombre en
     el selector de la página, también sirve elegirlo directamente.
   - **macOS**: *Configuración de Audio MIDI → Estudio MIDI → IAC Driver →*
     activar "El dispositivo está en línea". Una sola vez.
   - **Windows**: instalar loopMIDI, crear un puerto y dejarlo en el inicio.
2. **Helm**: abrir la aplicación y, en su configuración de audio/MIDI, activar
   como entrada ese mismo puerto. La elección persiste.
3. **La página**, en Chrome o Edge: *Habilitar salida MIDI* (la primera vez
   Chrome pide permiso; después se habilita sola), elegir el puerto si no lo
   eligió sola, y *Conectar dispositivo (USB)*.
4. Probar con **A**, **L** y **F** antes de ponerse el guante.

El orden de apertura no importa: si Helm se abre después, la lista de puertos
se actualiza sola.

### El patch de Helm

Un patch de teclado no suena a golpe. Lo mínimo para que sea percusivo:

- **Envolvente de amplitud**: attack en 0, sustain en 0, decay corto
  (0,1–0,5 s), release igual al decay. Con sustain 0 la duración de la nota no
  importa, y con release = decay un retrigger corta la nota anterior sin que
  se note.
- **`velocity_track` al máximo**: la velocity que manda la página ya es
  plana (de 45 % a 100 %), así que Helm sólo tiene que respetarla.
- **Rueda de modulación → el parámetro que controle el FSR.** La página sólo
  manda CC1; **si no se conecta en Helm, apretar el FSR no cambia nada del
  sonido**. Para conectarla: clic derecho sobre la perilla → *Learn MIDI
  Assignment* y apretar el FSR (o mantener **F**), o arrastrar el botón de
  modulación de la rueda *mod* sobre una o varias perillas. Destinos
  posibles (ninguno probado todavía contra Helm real):
  - **distorsión** (`distortion_drive`, con la sección encendida y el *mix*
    arriba): apretar ensucia el golpe;
  - **corte del filtro**: el cambio más fácil de oír, bueno para una primera
    prueba;
  - **delay**: conviene modular el *feedback* (con el *mix* fijo en un valor
    medio) y no el *mix*, porque al soltar el FSR el *mix* vuelve a 0 y corta
    de golpe los ecos que estaban sonando; con el *feedback* se apagan solos.
  Como el golpe es corto, el efecto se escucha mientras se toca: mantener el
  FSR (o **F**) y golpear a la vez. Para verificar que el CC llega, la rueda
  *mod* de Helm tiene que moverse al apretar.
- Guardar el patch en `~/.helm/User Patches` y anotar en este documento cuál
  se usa en la muestra.

## La imagen

### Dos capas

```
#acum   persistente, nunca se limpia   ← se le estampa SÓLO la marca nueva, con multiply
#over   se limpia en cada frame        ← anillos de impacto vivos (≤10) y el disco del FSR mientras se aprieta
```

Un guante genera 4–8 golpes por segundo: redibujar el historial completo en
cada frame serían cientos de arcos a los pocos minutos. Y **no es sólo
cuestión de fps**: el lector de Web Serial corre en el mismo hilo que el
dibujo, así que un frame caro retrasa el sonido. El costo por frame constante
es un requisito de latencia. Efecto lateral bienvenido: con lienzo
persistente el `multiply` se aplica una sola vez por marca sobre lo ya
pintado, que es la definición de tinta acumulándose.

`#over` también compone con `mix-blend-mode: multiply`, para que el disco vivo
del FSR se vea igual que cuando queda estampado y no haya salto al soltar.

### Los golpes: anillos

Cada golpe deja un **anillo hueco**. El dedo 0 es amarillo (`#FFDE21`) y el
dedo 1 naranja (`#FF8C1A`); el selector de color ofrece otros dos pares de
amarillos. La intensidad del golpe da el **tamaño** (de `0,08` a
`0,10 · min(W,H)`) y la **opacidad** (con un piso de 0,08, para que un golpe
suave nunca quede invisible). El tamaño usa la intensidad continua, no la
nota: un anillo más grande es un golpe más fuerte y, por lo tanto, una nota
más aguda.

**Agrupamiento temporal**: un golpe que llega a menos de 250 ms del anterior se
dibuja cerca de él, no al azar en toda la pantalla. Un redoble dibuja una
constelación y los golpes espaciados se dispersan: el gesto rítmico se vuelve
visible sin ninguna estructura de datos nueva.

### El FSR: un disco azul

La forma separa las dos fuentes de datos —anillo = golpe, disco = presión— y
el tono separa los dedos entre sí. El FSR es una señal continua, pero el disco
se dibuja por gesto:

```
fuerza > 0,06           → empieza la presión: se elige una posición al azar
mientras se aprieta     → el disco vive en el overlay; radio y opacidad siguen
                          el PICO de la fuerza suavizada (crece, nunca se achica)
fuerza < 0,03           → se estampa en el lienzo acumulado con ese pico
```

| Decisión | Por qué |
|---|---|
| Umbral 0,06 / 0,03, con histéresis | El FSR en reposo no marca 0 exacto. Sin umbral el ruido dibujaría discos solos; sin histéresis, una presión floja que ronda el umbral se partiría en muchos discos. |
| El disco sigue el **pico**, no la fuerza actual | Si siguiera la fuerza actual, al aflojar se achicaría y el disco estampado (del pico) saltaría de tamaño al soltar. Lo que se ve mientras se aprieta es exactamente lo que queda. |
| Radio de `0,05` a `0,14 · min(W,H)` | Más amplio que el de los anillos: el tamaño es lo único que distingue una presión de otra. |
| Posición al azar, independiente de los golpes | El agrupamiento de 250 ms es para redobles; una presión dura segundos y no tiene "anterior". |
| Desconectar el cable estampa la presión en curso | Si no, un disco quedaría vivo para siempre en el overlay. |

La fuerza visual se suaviza con τ = 0,03 s. Helm suaviza el CC con su propia
constante: si la imagen y el sonido se sienten desincronizados, ajustar `TAU`
a oído.

**La tecla F es una rampa**: mantenida, la presión simulada sube de 0 a 1 en
1,5 s. Sin la placa, así se ven discos de distinto tamaño y en Helm se escucha
el barrido completo del CC1.

## Latencia

Presupuesto, término por término:

| Etapa | Típico |
|---|---|
| Ventana de pico (deliberada) | 8 ms |
| Loop del sketch hasta el `Serial.print` | <1 ms |
| Buffer CDC → host (USB SOF cada 1 ms) | ~1 ms |
| Web Serial: proceso de dispositivo → renderer | ~4 ms |
| Envío del mensaje MIDI | <1 ms |
| Buffer de audio de Helm (128–256 muestras a 48 kHz) | 3–5 ms, más la latencia del driver |
| **Total** | **~17–20 ms más el driver** |

El buffer de Helm se elige en su configuración; con JACK en Linux el driver
suma poco. La página no puede medir este número: se lee en Helm.

Es tocable y expresivo, pero **no es percusión de precisión**: no se va a poder
tocar un redoble apretado. Se documenta como propiedad del medio, no se esconde.

Lo que más molesta no es la latencia media —el cuerpo la compensa sola, como un
baterista compensa la distancia al parche— sino el *jitter*. Su fuente dominante
es el main thread, y por eso el lienzo persistente. **No se puede sacar Web
Serial de ese hilo**: `SerialPort` no es transferible a un Worker. Es una
limitación de la plataforma, no del diseño.

## Cómo probarlo

### 1. Harness de Node — `tools/harness_midi.js`

Con un `MIDIAccess` falso verifica que no se construya ningún `AudioContext`,
que todo noteOn tenga su noteOff, que un retrigger cierre la nota anterior
antes del noteOn nuevo, que el FSR mande CC sólo al cambiar, el pánico al
cerrar la página y el costo de dibujo. Y la escala: que el barrido recorra
todas las notas, que los tramos tengan ancho parejo, el jitter, y el cambio a
11 notas.

```
node entorno-digital/tools/harness_midi.js entorno-digital/prototipo_percusion_guante_a_midi_v2_dispositivo.html
```

El costo de dibujo da ~2,8 arcos por frame: uno de ellos es el disco vivo,
porque la prueba de pánico deja el FSR apretado en 0,8. El harness no verifica
el ciclo de vida del disco (que aparezca, que se estampe con el mismo tamaño
al soltar, que el ruido bajo el umbral no dibuje); eso se comprobó con una
prueba aparte, no incorporada.

Para las versiones archivadas con Web Audio está
[`tools/harness_golpes.js`](tools/harness_golpes.js), que verifica el grafo de
audio sin producir sonido:

```
node entorno-digital/tools/harness_golpes.js entorno-digital/prototipos/prototipo_percusion_guante_a_dispositivo.html
```

### 2. Verificación de sintaxis

Extraer el `<script>` a un `.js` y correr `node --check`.

### 3. Chrome o Edge, sin hardware

Con Helm abierto, disparar con las teclas **A** y **L** (dedos 0 y 1) y **F**
mantenida (presión del FSR). Es la forma de diseñar el patch y de ver los
anillos y el disco sin el guante.

### 4. Con la placa (pendiente)

Subir el sketch, abrir el Monitor Serial y verificar las líneas `G:` y `F:`. Ahí
se calibran `UMBRAL_ON`, el factor de diafonía y los sliders `picoMin`/
`picoMax` mientras se toca. Y se mide la latencia real contra la estimada.

## Estado actual / pendiente

- **No se probó contra el hardware**: no existe todavía el guante, y este
  entorno no tiene Chrome ni la placa. Lo validado es el flujo de mensajes MIDI
  y el costo de dibujo, por el harness.
- **No se probó contra Helm real**: el envío por Web MIDI necesita Chrome.
  Falta armar el patch percusivo y elegir qué controla la rueda de modulación.
- **`UMBRAL_ON`, `FACTOR_DIAFONIA` y el rango de pico son estimaciones.** Los
  tres se calibran con el guante puesto. Lo mismo los umbrales del disco del
  FSR (0,06/0,03), que dependen del reposo real del sensor.
- **Cuántas notas usar en la escala queda abierto.** El harness muestra que la
  histéresis carga con casi todo el trabajo: con ±8 % de jitter, tanto seis
  como once notas dan 1–2 notas por golpe repetido. Se dejan **seis** por
  defecto sólo porque ese ±8 % es una estimación y no una medición.
- **La diafonía mecánica entre los dos piezos es el riesgo abierto más grande.**
  El árbitro del firmware y la espuma la mitigan, pero puede que nunca haya
  separación perfecta.
- Si alguna vez hiciera falta que ande en Firefox o Safari, la alternativa sería
  un puente local (servidor que lea el puerto serie y lo reexponga por
  WebSocket). No está implementado.
