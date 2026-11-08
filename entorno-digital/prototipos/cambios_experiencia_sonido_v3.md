# Cambios: la composición se mueve con el sonido (etapas 4 y 5)

Etapas 4 y 5 de `propuesta_sonido_composicion.md`. En el modo final de
`experiencia/composicion.html` (etapa 3, `cambios_experiencia_sonido_v2.md`)
la escena ya no queda quieta mientras suena la grabación del guante:

- **etapa 4, por eventos**: los anillos y los discos del guante vuelven a
  sonar en el momento en que se hicieron;
- **etapa 5, por análisis**: la bandada y la EMG, que no tienen relación con
  el sonido, reaccionan a lo que suena de verdad (incluidas la distorsión y
  la reverb de Helm, que ningún evento describe).

Van juntas porque comparten todo el mecanismo: la tabla `REACCIONES`, el
efecto por elemento y el cuadro de la animación. No cambia el texto de
ninguna pantalla, así que el guion no se toca.

## El principio: una capa visual, no una edición

En cada cuadro, cada elemento recibe un **efecto**
`{ dx, dy, escala, alpha, encima }` que `dibujarElemento` aplica sobre su `x`,
`y`, `escala` y `alpha` **sin escribirlos**. Por eso:

- la composición guardada al finalizar no cambia (la prueba compara los
  elementos y el registro `"composicion"` antes y después de animar);
- lo que la persona movió o agrandó se anima desde donde lo dejó;
- una copia pegada de un anillo conserva su `t` y late con su original, como
  un eco.

`encima` es lo que un efecto dibuja además del elemento (hoy, el anillo de
impacto). Va en las coordenadas del elemento con su escala de la escena, sin
la del efecto: la onda no late con el anillo.

## La tabla `REACCIONES`

```js
const REACCIONES = {
  anillo:       [{ r: "golpe", aumento: 0.25, durMs: 200 }],
  disco:        [{ r: "inflar" }],
  punto:        [{ r: "abrir", senal: "envolvente", ganancia: 0.03 },
                 { r: "temblar", senal: "agudos", px: 1.5 }],
  cuadrilatero: [{ r: "respirar", senal: "graves", ganancia: 0.05 }],
  imagen:       []
};
```

Igual que con `PERMITIDAS`, el dibujo no pregunta por tipos sino qué
reacciones tiene el elemento. Cada reacción es una función de `REACCION` que
suma lo suyo al efecto. Un tipo nuevo, o uno que no se quiera animar, es una
fila; ajustar cuánto se mueve algo es cambiar un número de la fila. Las
reacciones están en el modelo y son puras: reciben el elemento y el cuadro y
no tocan el DOM, el audio ni el estado.

## Etapa 4: por eventos

### El anillo se vuelve a golpear

Cuando la reproducción pasa por su `t`, el anillo late
(1 → 1,25 → 1 en 200 ms, con un seno) y suelta el mismo anillo de impacto de
la página del guante: un trazo de 2 px de su color, que crece hasta 2,2
veces el radio y se desvanece desde un alpha de 0,55. Son los números de allá
(`ANILLO_DUR` y el dibujo del overlay), para que se reconozca el golpe.

Un golpe del final de la grabación termina de latir al principio de la vuelta
siguiente. Si no, cortaría en seco en la costura del loop.

### El disco se infla con la presión grabada

El disco **no existe antes de su `t0`**. Entre `t0` y `t1` crece y después
queda. Cada vuelta empieza sin él, como empezó el dibujo: la composición
vuelve a contar su historia.

Para que crezca como creció de verdad, `curvaDeInflado` rehace a partir de
los CC grabados lo que hizo la página del guante: la fuerza es el último CC,
se suaviza con su `TAU` y el disco sigue el **pico**, que nunca baja. Así,
cuando se aflojó, el disco no se desinfla, igual que allá. Del pico salen el
radio y el alpha con las mismas fórmulas de la página del guante, divididos
por los del pico final. Así, al llegar a `t1` el disco queda **exactamente**
como se estampó, con su tamaño editado incluido.

Esas constantes (`R_FSR_MIN`, `R_FSR_MAX`, `ALPHA_MIN`, `TAU`) están copiadas
en `DISCO_GUANTE`. Si cambian en la página del guante, hay que portarlas a
mano, como cualquier ajuste entre las copias.

Sin CC entre `t0` y `t1` (se grabó sin puerto MIDI), el disco crece con una
rampa pareja.

Las curvas se calculan una sola vez, al arrancar el sonido, porque en el
modo final la escena ya no cambia. Las copias pegadas de un disco comparten
la de su original.

### Latencias

- `latenciaMs` (de la captura del guante, todavía 0 hasta medirla): el sonido
  de un evento llega a la grabación ese tanto después de su `t`, así que la
  imagen va ese tanto atrás. Se resta módulo la vuelta: al principio de una
  vuelta, la imagen todavía está en el final de la anterior.
- La salida de audio: `relojSonido()` ahora resta `baseLatency` y
  `outputLatency` del `AudioContext`, para que la imagen vaya con lo que se
  **oye** y no con lo que se acaba de procesar. Con PipeWire son unas decenas
  de ms, del orden de lo que se nota en un golpe.

## Etapa 5: por análisis del audio

### Las tres señales

Salen del `AnalyserNode` que ya estaba entre la fuente y la salida (FFT de
2048, unos 43 ms a 48 kHz), en cada cuadro:

| Señal | De dónde | Ataque / caída |
|---|---|---|
| `envolvente` | RMS de la forma de onda | 10 ms / 250 ms |
| `graves` | amplitud media del espectro entre 20 y 250 Hz | 20 ms / 300 ms |
| `agudos` | ídem entre 3 y 10 kHz | 10 ms / 150 ms |

El suavizado del analizador se apaga (`smoothingTimeConstant = 0`) y lo hace
`seguir()`, con un ataque rápido y una caída más lenta: el golpe se ve en el
instante, y la vuelta al reposo es un gesto y no un corte.

**Normalización.** Cada señal se divide por su propio máximo reciente, que
cae muy despacio (30 s). Así va de 0 a 1 sin importar a qué volumen se grabó
ni cómo está el patch de Helm, y no hay que calibrar nada por sesión. El
**piso** de la referencia evita que, en un silencio largo, el ruido de fondo
se agrande hasta parecer una señal.

El reloj del análisis también es el del audio: con el contexto en pausa,
`dt` es 0 y las señales no cambian.

### Las reacciones

- **Bandada, `abrir`**: cada punto se aleja del centro de los de su origen en
  proporción a la envolvente, hasta un 3 % de su distancia al centro. En la
  demo son unos 8 px en el borde de la bandada: la bandada entera se abre y
  se cierra con cada golpe. Se escala respecto del centro, y no se desplaza
  cada punto unos px fijos, para que se lea como un gesto de toda la bandada.
- **Bandada, `temblar`**: con los agudos, un temblor de hasta 1,5 px. La
  fase y la frecuencia de cada punto salen de su id: no tiemblan todos
  juntos, ni cambian al azar en cada cuadro, que se vería como ruido de
  imagen.
- **EMG, `respirar`**: con los graves, los cuadriláteros crecen hasta un 5 %.
  Es la señal más lenta: el FSR (que en Helm prende los efectos) y la cola
  de la reverb son graves.
- Anillos y discos no reaccionan al análisis: ya tienen sus eventos.

## El bucle de animación

`animar()` corre por `requestAnimationFrame` mientras dure el modo final con
sonido. En cada cuadro arma `{ tMs, durMs, seg, senal }`, lo deja en
`cuadroActual` y repinta. Sin sonido (sin captura del guante, o una captura
sin grabación) no hay cuadro y la composición queda quieta, como en la etapa
3.

Costo: el de repintar la escena entera en cada cuadro, sin marcas de
edición. En Brave headless (con render por software) la demo anduvo a 30
cuadros por segundo, con el peor cuadro entre 17 y 30 ms. En la máquina de
la sala tiene que andar mejor, pero conviene mirarlo con una escena real,
que puede tener bastante más que los 69 elementos de la demo.

## Diagnóstico

- `window.__sonido()` suma `cuadro`, el cuadro en curso.
- `window.__efecto(id[, cuadro])` devuelve el efecto de un elemento en el
  cuadro actual o en uno armado a mano. Sirve para ajustar las reacciones
  desde la consola sin esperar a que la reproducción pase por un momento.

## Validación

La prueba en Node de la etapa 3 (DOM, IndexedDB y Web Audio falsos, ahora
con un analizador que entrega la señal que se le pide) suma estas
verificaciones:

- **anillos**: quietos antes de su `t`, laten a 1,25 con onda a los 100 ms,
  terminan a los 200 ms, siguen después de la costura del loop; la copia
  pegada late con su original; sin `t` no laten;
- **discos**: no existen antes de `t0`, aparecen chicos, nunca se achican
  (tampoco al aflojar), suben con el CC máximo y llegan exactos a lo
  estampado en `t1` (escala y alpha);
- **bandada y EMG**: quietas en silencio; con la envolvente en 1 la bandada
  se abre un 3 %; con agudos tiembla a lo sumo 1,5 px; con graves la EMG
  llega a 1,05; anillos y discos no reaccionan al análisis;
- **cuadro en vivo**: `tMs` sigue al reloj del audio dentro de la vuelta; con
  sonido fuerte las señales llegan a ~1, con 20 dB menos la envolvente baja a
  ~0,1, en silencio vuelven a 0; sin avanzar el reloj del audio la imagen no
  avanza; la animación no escribe ni la escena ni la composición guardada;
- **latencia**: con `latenciaMs` 30, `tMs` va 30 ms atrás, y al principio de
  una vuelta cae en el final de la anterior.

En Brave headless, con `#demo` y las dos barras espaciadoras simuladas: el
disco no existe hasta los 2,4 s, se infla hasta los 4,2 s y queda; los graves
llegan a 1 con el zumbido del FSR y los agudos siguen a los clics del dedo 1;
en la cola todo vuelve a 0.

**Falta**: verlo y oírlo en la sala con una captura real del guante, y
ajustar las ganancias de `REACCIONES` (y las bandas de `SENALES`) a ojo con el
patch de Helm. Sigue pendiente medir `LATENCIA_MS` en la página del guante.
