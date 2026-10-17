# Documentación: `prototipo_percusion_guante_a[_dispositivo].html`

Y sus variantes con Helm, `prototipo_percusion_guante_a_midi[_v2]_dispositivo.html`.

## Qué es

Un guante de percusión. La placa **LilyPad Arduino USB** va en el dorso de la
mano; dos piezos cosidos en las puntas de dos dedos detectan golpes contra una
superficie, y un FSR —el mismo que ya usaba `dispositivo2`— se toca con la mano
opuesta.

Cada golpe **suena** (una nota sintetizada en la propia página o, en las
versiones `_midi_`, en Helm) y **deja una marca** en el lienzo. La presión del
FSR **modula el sonido** (en las páginas con Web Audio, lo distorsiona; en las
`_midi_`, mueve el parámetro de Helm que se le asigne) y se ve de dos maneras
según la versión: como un efecto **global** sobre toda la imagen, o —en la
`_midi_v2_`— como una **marca propia**, un disco azul.

Reemplaza al par fuerza + pulso: el Pulse Sensor Amped nunca llegó a dar
lecturas estables y se descartó. Las páginas de círculos quedaron archivadas en
`prototipos/` (siguen funcionando con el firmware nuevo, porque el formato `F:`
no cambió).

Inspiración: [Adafruit MIDI Drum Glove](https://learn.adafruit.com/midi-drum-glove).
De ahí sale el gesto y el circuito base. Lo que **no** tomamos es su detección
—un umbral binario que manda siempre velocity 127— porque acá la intensidad del
golpe es justamente lo que da la expresión.

## Los cuatro archivos

| Archivo | Variante musical | Datos | Sonido |
|---|---|---|---|
| `prototipo_percusion_guante_a.html` | (a) nota fija por dedo | pads y sliders manuales | Web Audio |
| `prototipo_percusion_guante_a_dispositivo.html` | (a) | Web Serial | Web Audio |
| `prototipo_percusion_guante_a_midi_dispositivo.html` | imagen de (a); la intensidad elige la nota de una escala elegible | Web Serial | **Helm**, por Web MIDI |
| `prototipo_percusion_guante_a_midi_v2_dispositivo.html` | igual que la anterior; cambia la imagen: los dos dedos son anillos y el FSR dibuja un disco azul propio | Web Serial | **Helm**, por Web MIDI |

Las dos páginas con Web Audio comparten la misma cadena de audio, y las cuatro
el mismo motor de dibujo. Las versiones `_midi_` no
tienen voz propia: ver [Sonido en Helm por MIDI](#sonido-en-helm-por-midi). La
`_midi_v2_` sólo cambia la imagen: ver [El FSR como disco azul](#el-fsr-como-disco-azul-versión-_midi_v2_).

## Requisitos para probarlo

- **Navegador**: Chrome o Edge de escritorio para las versiones `_dispositivo`
  (la Web Serial API no existe en Firefox ni Safari; ahí el botón queda
  deshabilitado). Las versiones simuladas andan en cualquier navegador con Web
  Audio.
- **El sonido necesita un gesto del usuario.** El `AudioContext` se construye
  perezosamente en `asegurarAudio()`, enganchada al clic de "Conectar
  dispositivo" (versión real) o al de "Activar sonido" y al primer golpe en un
  pad (versión simulada). Si la página está en silencio, mirar el estado del
  audio en el panel.
- **Firmware**: `dispositivo2/dispositivo2.ino` con la detección de piezos.
- Se abren con doble clic (`file://`). No hay build step ni dependencias.

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
datos: por ahí entran el lector de Web Serial, los pads, los sliders, el teclado
y cualquier prueba desde la consola.

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

## El sonido: cadena de Web Audio

Esta sección describe la voz propia de las páginas con Web Audio, que suenan
sin nada instalado. Helm no puede correr *dentro* del navegador, pero sí *en
paralelo*, recibiendo los golpes por MIDI: eso es la versión `_midi_`, en la
sección siguiente.

```
por golpe (efímeros):
  oscPrincipal ─┐
  oscCuerpo    ─┼→ ganVoz(envolvente) → filtroVoz ─┐
  ruido → bpRuido → ganRuido ─────────────────────┴→ bus

persistentes:
  bus ├─────────────────────────────────────────→ ganDry ─┐
      └→ preGain → shaper(curva FIJA) → postGain → lpPost → ganWet ─┤
                                                                    ↓
                                       limitador → master → destination
```

Decisiones que no son obvias y que conviene no revertir sin motivo:

- **Todo se programa en `currentTime + 0.005`**, nunca en `currentTime` pelado:
  si el envelope cae en el pasado, el ataque se convierte en un click.
- **Ataque de 2 ms, no 0.** Un salto instantáneo clickea. Y el decay termina en
  `0.0001`, porque `exponentialRampToValueAtTime(0)` lanza excepción.
- **Pitch drop** (`f0*1.7 → f0` en 30 ms): es lo que hace que suene a membrana
  golpeada y no a un beep. Es la línea con mayor retorno de toda la voz.
- **El ruido sale de un único `AudioBuffer` generado en JS** y reusado por
  `BufferSource` desechables. Nada de `fetch`: desde `file://` muere por CORS.
- **Todo oscilador tiene su `stop()` programado.** Uno sin `stop()` corre para
  siempre; es la fuga clásica, y se manifiesta a oído como "después de diez
  minutos empieza a crujir".
- **Nada de `AudioWorklet`**: requiere `addModule()` con una URL y no funciona
  desde `file://`.

**Distorsión continua desde el FSR.** `shaper.curve = ...` es una asignación
discreta: cambiarla en caliente produce una discontinuidad audible. Por eso la
curva `tanh(7·x)` se calcula una vez y no se toca nunca más, y lo que se mueve
es un `AudioParam`:

1. `preGain` empuja de 1 (zona lineal de tanh → limpio) a 15 (recorte duro).
2. `postGain = 1/pre^0.7` compensa la sonoridad — sin esto, saturar más sube el
   volumen y no se distingue distorsión de "más fuerte".
3. Crossfade de **potencia constante** (`dry = cos θ`, `wet = sin θ`): con
   crossfade lineal el punto medio se escucha hundido.
4. `lpPost` baja de 12 kHz a 3,5 kHz con el drive; sin eso el waveshaping suena
   áspero y metálico aun con `oversample = "4x"`.
5. **Los cinco parámetros se mueven con `setTargetAtTime(..., τ=0.03)`.** Es la
   pieza que resuelve que el FSR llegue a sólo 50 Hz: la rampa exponencial
   interpola entre lecturas y no se escuchan escalones.

**Polifonía**: tope de 12 voces, con **robo** de la más vieja en vez de descarte
del golpe nuevo (descartar se siente como que el instrumento se cuelga). La voz
robada queda marcada, porque sigue en el array los ~30 ms que tarda en apagarse
y si no se la saltea se termina robando siempre la misma en una ráfaga.

**Limitador soft-clip** (`tanh` unitario) como último nodo, en lugar de un
`DynamicsCompressorNode`: el attack mínimo de 3 ms de ese nodo redondea
justamente los ataques, que es lo único que hace que un golpe suene a golpe.

## Sonido en Helm por MIDI

`prototipo_percusion_guante_a_midi_dispositivo.html` (y su `_v2_`, que suena
exactamente igual) tiene la imagen de la
variante (a) y el sonido delegado a **Helm**, que corre en paralelo como
aplicación standalone. La página no produce ningún sonido. A diferencia de la
(a) con Web Audio, la nota no es fija por dedo: la intensidad del golpe elige
una nota de una escala (ver abajo), y la misma intensidad sigue dando el
tamaño y la opacidad del círculo. El porqué de cada
decisión está en
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
lienzo: los círculos no dependen de la nota.

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
Detalle en
[`prototipos/cambios_percusion_guante_midi.md`](prototipos/cambios_percusion_guante_midi.md),
segunda parte.

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

### Latencia

Mandar el mensaje MIDI cuesta menos de 1 ms. La etapa de Web Audio (10–30 ms)
de la tabla de [Latencia](#latencia) se reemplaza por el buffer de audio de
Helm, que se elige en su configuración: 128–256 muestras a 48 kHz son
3–5 ms, más la latencia del driver (con JACK en Linux puede quedar por debajo
de Web Audio). La página ya no puede mostrar este número: se lee en Helm.

## La imagen: dos capas

```
#acum   persistente, nunca se limpia   ← se le dibuja SÓLO el golpe nuevo, con multiply
#over   se limpia en cada frame        ← anillos de impacto vivos (≤10), guías, cursor
```

El prototipo de círculos anterior redibujaba la lista completa en cada frame,
porque el parpadeo por latido lo exigía. Acá eso no sirve: un guante genera 4–8
golpes por segundo y a los pocos minutos serían cientos de arcos por frame. Y
**no es sólo cuestión de fps**: el lector de Web Serial corre en el mismo hilo
que el dibujo, así que un frame caro retrasa el sonido. El costo por frame
constante es un requisito de latencia.

Efecto lateral bienvenido: con lienzo persistente el `multiply` se aplica una
sola vez por marca sobre lo ya pintado, que es la definición de tinta
acumulándose. El orden temporal deja huella, cosa que antes no pasaba.

**Efecto global del FSR**, la contraparte visual de la distorsión (todas las
páginas salvo la `_midi_v2_`, que lo reemplaza por un disco; ver la sección
siguiente):

1. **Filtro CSS sobre el elemento canvas** —`blur` + `contrast` + `saturate`
   proporcionales a la presión—. Lo hace la GPU, cuesta cero JS. El string se
   reescribe sólo cuando la fuerza cambia más de 0,02; si no, se fuerza un
   recálculo de estilo 60 veces por segundo para nada.
2. **Una tinta acumulada**, un solo `fillRect` con `multiply` y alpha muy baja:
   apretar tiñe permanentemente lo ya dibujado. La distorsión es reversible en
   el audio, pero en el lienzo deja registro de que la hubo.

La fuerza visual se suaviza con **la misma constante que la del audio** (τ =
0,03 s): si la imagen respondiera más rápido que el sonido, se notaría como
desincronía.

## El FSR como disco azul (versión `_midi_v2_`)

En `prototipo_percusion_guante_a_midi_v2_dispositivo.html` el FSR deja de ser
un efecto sobre todo el lienzo y pasa a tener **su propia marca**, como los
piezos. El sonido no cambia: la presión sigue saliendo como CC1 hacia Helm,
con el mismo filtro de repetidos y el mismo pánico.

**Los dos dedos son anillos.** El disco relleno que antes era del dedo 0 queda
reservado para el FSR, así que los dos piezos se dibujan como anillos huecos
(mismo grosor, `0.35·r`) y se distinguen sólo por el tono: amarillo `#FFDE21`
el dedo 0 y naranja `#FF8C1A` el dedo 1, por defecto. El selector de color
ofrece tres pares (amarillo + naranja, amarillo + rojo anaranjado, amarillo
fluo + naranja); el azul del FSR, `#0000FF`, es fijo. La forma basta para
separar las dos fuentes de datos —anillo = golpe, disco = presión— y el tono
separa los dedos entre sí.

**Una presión es un evento.** El FSR es una señal continua, pero el disco se
dibuja por gesto:

```
fuerza > 0,06           → empieza la presión: se elige una posición al azar
mientras se aprieta     → el disco vive en el overlay; radio y opacidad siguen
                          el PICO de la fuerza suavizada (crece, nunca se achica)
fuerza < 0,03           → se estampa en el lienzo acumulado con ese pico
```

| Decisión | Por qué |
|---|---|
| Umbral 0,06 / 0,03, con histéresis | El FSR en reposo no marca 0 exacto. Sin umbral el ruido dibujaría discos solos; sin histéresis, una presión floja que ronda el umbral se partiría en muchos discos. |
| El disco sigue el **pico**, no la fuerza actual | Si siguiera la fuerza actual, al aflojar se achicaría y el disco estampado (del pico) saltaría de tamaño al soltar. Así lo que se ve mientras se aprieta es exactamente lo que queda. |
| Radio de `0,05` a `0,14 · min(W,H)` | Más amplio que el de los anillos (`0,08`–`0,10`): el tamaño es lo único que distingue una presión de otra. |
| Opacidad con la misma ley que los golpes (piso 0,08) | Una presión suave nunca queda invisible. |
| `mix-blend-mode: multiply` en `#over` | El disco vivo compone igual que el estampado en `#acum`; sin esto, al soltar se oscurecería de golpe. Los anillos de impacto también pasan a componer así, con un cambio apenas visible. |
| Posición al azar, independiente de los golpes | El agrupamiento temporal de 250 ms es para redobles; una presión dura segundos y no tiene "anterior". |
| Desconectar el cable estampa la presión en curso | Si no, un disco quedaría vivo para siempre en el overlay. |

**Se quitó el efecto global** (filtro CSS `blur`/`contrast`/`saturate` y la
tinta violeta acumulada). Con el FSR como marca propia, el desenfoque global
borronearía también el disco azul, y la tinta oscurecía todo el lienzo en
pocos segundos de presión sostenida.

**La tecla F ahora es una rampa.** Mantenida, la presión simulada sube de 0 a
1 en 1,5 s (antes saltaba a 0,68 fija). Sin la placa, así se ven discos de
distinto tamaño según cuánto se mantenga, y en Helm se escucha el barrido
completo del CC1 en lugar de un único valor.

**Costo de dibujo**: el disco vivo suma un arco por frame mientras se aprieta,
y el estampado es un arco por presión. Sigue siendo constante.

El porqué de cada cambio, en detalle, está en
[`prototipos/cambios_percusion_guante_midi_v2.md`](prototipos/cambios_percusion_guante_midi_v2.md).

## La variante (a): nota fija por dedo — una pintura

Dedo 0 en A2 (MIDI 45), dedo 1 en A3 (57). La intensidad controla volumen,
brillo y decay, con ley `0.05 + 0.45·v^1.6`. El exponente mayor que 1 compensa
que el ADC es lineal en fuerza y el oído logarítmico en sonoridad: sin él, los
golpes suaves suenan casi igual de fuerte que los duros.

La intensidad es una magnitud continua, así que se mapea a magnitudes continuas:
**tamaño y opacidad**. Dedo 0 se dibuja como disco relleno, dedo 1 como anillo
(se distinguen aun superpuestos, y cuestan lo mismo), con una pareja de colores
elegible de la misma paleta fija de siempre.

**Agrupamiento temporal**: un golpe que llega a menos de 250 ms del anterior se
dibuja cerca de él, no al azar en toda la pantalla. Un redoble dibuja una
constelación y los golpes espaciados se dispersan — el gesto rítmico se vuelve
visible sin ninguna estructura de datos nueva.

Hubo una variante (b), con la pentatónica por intensidad sonando en Web Audio
y una imagen de partitura (bandas horizontales y un cursor que avanza). Se
eliminó: su manejo del sonido —escala por intensidad, velocity plana,
histéresis— sigue vivo en las páginas `_midi_` (ver
[Escala elegible y tabla de tramos](#escala-elegible-y-tabla-de-tramos)), y la
imagen de partitura se descartó. Queda en el historial de git.

## Latencia

Presupuesto, término por término:

| Etapa | Típico |
|---|---|
| Ventana de pico (deliberada) | 8 ms |
| Loop del sketch hasta el `Serial.print` | <1 ms |
| Buffer CDC → host (USB SOF cada 1 ms) | ~1 ms |
| Web Serial: proceso de dispositivo → renderer | ~4 ms |
| Web Audio (`outputLatency`, depende del SO) | 10–30 ms |
| **Total** | **~25–30 ms** |

Es tocable y expresivo, pero **no es percusión de precisión**: no se va a poder
tocar un redoble apretado. Se documenta como propiedad del medio, no se esconde.
La página muestra `baseLatency + outputLatency` en el panel, así que el número
real de la máquina donde se exponga la tesis se puede leer ahí mismo.

Lo que más molesta no es la latencia media —el cuerpo la compensa sola, como un
baterista compensa la distancia al parche— sino el *jitter*. Su fuente dominante
es el main thread, y por eso el lienzo persistente. **No se puede sacar Web
Serial de ese hilo**: `SerialPort` no es transferible a un Worker. Es una
limitación de la plataforma, no del diseño.

## Cómo probarlo

### 1. Harness de Node — `entorno-digital/tools/harness_golpes.js`

`harness.js` no sirve acá: es específico de la bandada (sólo exporta
`updateAccel`, sus perfiles son de acelerómetro, su DOM falso no tiene
`createElement` ni `stroke`). `harness_golpes.js` es su hermano por copia.

La idea: **el grafo de Web Audio es contabilidad de JavaScript puro**, así que
se puede verificar entero sin producir un solo sonido.

```
node entorno-digital/tools/harness_golpes.js entorno-digital/prototipo_percusion_guante_a_dispositivo.html
node entorno-digital/tools/harness_golpes.js <archivo.html> --golpes=500 --jitter=0.08 --frames=600
```

Verifica: que no queden nodos sin liberar tras 500 golpes, que todo `start()`
tenga su `stop()`, que el robo de voz acote la polifonía en ráfaga, que la
cantidad de `arc()` por frame no crezca con el historial, que cada lectura de
FSR mueva los cinco parámetros con rampa suave, y —si la página cuantiza la
intensidad en una escala— cuántas notas distintas salen de un mismo golpe
cuando se le inyecta jitter. Con la (a) esa última sección no aplica: la nota
no depende de la intensidad.

Esto **ya encontró un bug**: `robarVoz()` tomaba siempre `voces[0]`, que sigue
en el array hasta que corre su `onended`, así que en ráfaga robaba la misma voz
una y otra vez y la polifonía llegaba a 24 voces en vez de 12.

Requisito que le impone al diseño de las páginas: **el `AudioContext` se
construye perezosamente dentro de `asegurarAudio()`**. Si se construyera en el
cuerpo del script, evaluarlo en Node explotaría.

Para la versión `_midi_` está su hermano `tools/harness_midi.js`: con un
`MIDIAccess` falso verifica que no se construya ningún `AudioContext`, que
todo noteOn tenga su noteOff, que un retrigger cierre la nota anterior antes
del noteOn nuevo, que el FSR mande CC sólo al cambiar, el pánico al cerrar la
página y el costo de dibujo. Y la escala: que el barrido recorra todas las
notas, que los tramos tengan ancho parejo, el jitter, y el cambio a 11 notas.

```
node entorno-digital/tools/harness_midi.js entorno-digital/prototipo_percusion_guante_a_midi_dispositivo.html
node entorno-digital/tools/harness_midi.js entorno-digital/prototipo_percusion_guante_a_midi_v2_dispositivo.html
```

La `_v2_` pasa todas las verificaciones sin cambios en el harness. Su costo de
dibujo da un arco más por frame que la anterior (~2,8 contra ~1,8): es el disco
vivo, porque la prueba de pánico deja el FSR apretado en 0,8. El harness no
verifica el ciclo de vida del disco (que aparezca, que se estampe con el mismo
tamaño al soltar, que el ruido bajo el umbral no dibuje); eso se comprobó con
una prueba aparte, no incorporada.

### 2. Verificación de sintaxis

Extraer el `<script>` a un `.js` y correr `node --check`.

### 3. Chrome o Edge, sin hardware

Abrir cualquiera de las páginas y disparar con las teclas **A** y **L**
(dedos 0 y 1) y **F** mantenida (presión del FSR); en las simuladas, además, los
pads clicables y el slider. Es la única forma de **escuchar** el diseño de audio
hoy. Confirmar: sin clicks en los ataques, la distorsión barre sin escalones, el
crossfade no se hunde en el medio, y no hay clipping con golpes simultáneos.

### 4. Con la placa (pendiente)

Subir el sketch, abrir el Monitor Serial y verificar las líneas `G:` y `F:`. Ahí
se calibran `UMBRAL_ON`, el factor de diafonía y los sliders `PICO_MIN`/
`PICO_MAX` mientras se toca. Y se mide la latencia real contra la estimada.

## Estado actual / pendiente

- **No se probó contra el hardware**: no existe todavía el guante, y este
  entorno no tiene Chrome ni la placa. Lo que sí está validado es el grafo de
  audio y el costo de dibujo, por el harness.
- **`UMBRAL_ON`, `FACTOR_DIAFONIA` y el rango de pico son estimaciones.** Los
  tres se calibran con el guante puesto.
- **Cuántas notas usar en la escala de las páginas `_midi_` queda abierto.**
  El harness muestra que la histéresis carga con casi todo el trabajo: con
  ±8 % de jitter, tanto seis como once notas dan 1–2 notas por golpe repetido.
  Se dejan **seis** por defecto sólo porque ese ±8 % es una estimación y no una
  medición. Una vez medida la dispersión real del piezo, decidir con ese
  número (el selector de escala ya permite probar las dos).
- **La diafonía mecánica entre los dos piezos es el riesgo abierto más grande.**
  El árbitro del firmware y la espuma la mitigan, pero puede que nunca haya
  separación perfecta.
- **La `_midi_v2_` no se probó en Chrome**: el ciclo del disco se verificó en
  Node, pero no se vio todavía en pantalla con el FSR real; los umbrales
  0,06/0,03 hay que confirmarlos con el reposo real del sensor.
- **La versión `_midi_` no se probó contra Helm real**: el harness valida el
  flujo de mensajes, pero el envío por Web MIDI necesita Chrome. Falta también
  armar el patch percusivo y elegir qué controla la rueda de modulación.
- Si alguna vez hiciera falta que ande en Firefox o Safari, la alternativa sería
  un puente local (servidor que lea el puerto serie y lo reexponga por
  WebSocket). No está implementado.
