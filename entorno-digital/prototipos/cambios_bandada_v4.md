# Cambios en `bandada_prototipo_v4a/v4b_dispositivo.html` respecto a v3

## Contexto

Punto de partida: `bandada_prototipo_v3_dispositivo.html`, ya conectado al
dispositivo real (`dispositivo1/dispositivo1.ino` — Adafruit Flora V3 +
LSM6DSO32 por I2C, que envía `A:<x>,<y>,<z>` en g por Serial a ~33 líneas/s y
se lee por Web Serial).

Con el dispositivo en la mano aparecieron tres problemas y un pedido:

1. **Demasiados puntos.** El slider iba de 100 a 16000; se necesita un rango
   de 10 a 40.
2. **El acelerómetro no se sentía.** Al mover el dispositivo, los puntos no
   parecían obedecer.
3. **Todo ocurría en un plano.** Faltaba una dimensión de acercamiento /
   alejamiento.
4. **Había que conservar la deriva autónoma**: mientras el dispositivo está
   quieto —o mantiene una postura fija— los puntos deben seguir moviéndose
   solos, de forma continua y no repetitiva.

La murmuración de estorninos sigue siendo la inspiración de base, pero ya no
el objetivo literal.

## Diagnóstico: por qué el acelerómetro no se sentía en v3

Tres causas concretas, todas medibles en el código de v3:

1. **La gravedad entraba como viento constante.** El sketch envía g crudos:
   en reposo, el eje que apunta hacia abajo marca ~1.0 de forma permanente.
   v3 usaba ese valor tal cual, así que había un empuje de fondo que nunca se
   apagaba, y la "turbulencia" (calculada sobre la magnitud del vector) valía
   ~0.4 permanentemente sin que nadie moviera nada. Además `updateAccel`
   recortaba a ±2 mientras el sensor está configurado en ±4 g, así que los
   gestos fuertes saturaban.
2. **El viento era una fuerza débil, y encima llegaba tarde.** `WIND_K = 70`
   px/s² competía contra separación (75), cohesión, núcleos y bordes; y esa
   suma no se usaba como velocidad sino sólo para calcular un rumbo deseado,
   al que el pájaro se acercaba a 3–5.5 rad/s como máximo. Casi nada del
   gesto sobrevivía a esa cadena.
3. **Con pocos puntos no había bandada.** `NEIGHBOR_R = 64` px con ~25 puntos
   en pantalla completa significa que prácticamente nunca hay vecinos: cada
   punto hacía la suya.

## 1 · Señal acondicionada (el cambio central)

`window.updateAccel(x,y,z)` sigue siendo el único punto de entrada (ahora
recorta a ±4, el rango real del sensor), pero ya no alimenta la simulación
directamente. Cada eje pasa por tres filtros exponenciales —rápido (τ 0,1 s),
medio (τ 0,45 s) y lento (τ 6 s)— de los que salen dos señales:

- **gesto** = rápido − lento. Es lo que dirige el movimiento. Absorbe la
  gravedad sin necesidad de saber cómo está orientado el textil.
- **sacudida** = |rápido − medio|, normalizada. Reemplaza a la "turbulencia"
  de v3: regula velocidad, velocidad de giro, impulsos y depredador.

El filtro rápido cumple además una segunda función: interpola entre las ~33
muestras/s del serial y los 60 fps del render, evitando el escalonado.

Hay un botón **"Poner a cero (reposo)"** en el panel (fuera del `fieldset` que
se deshabilita al conectar, así que sigue disponible con el dispositivo
enchufado), y la primera lectura tras conectar recarga los tres filtros para
que la gravedad no entre de golpe como un gesto fantasma.

### La cola invertida, y cómo se corrigió

`gesto` es un pasa-altos, y un pasa-altos tiene integral cero en el tiempo:
todo empuje viene seguido de una cola opuesta, más débil y más larga, de la
misma área. Medido con el harness de Node (ver más abajo) sobre una
inclinación de 1.6 g durante 2 s: la bandada avanzaba +357 px durante el gesto
y luego retrocedía −620 px en los 8 s siguientes, terminando más lejos del
punto de partida que durante el propio gesto. No es lo que se pidió: la
relajación tiene que devolver la autonomía, no deshacer el movimiento.

Se corrigió con tres mecanismos que se refuerzan entre sí:

1. **Referencia de reposo congelada durante el movimiento.** La constante de
   tiempo del filtro lento se multiplica por `(1 + 12 · sacudida)`. Mientras
   la mano se mueve, la referencia prácticamente no avanza, así que un gesto
   de ida y vuelta termina con gesto ≈ 0, sin cola. Cuando la mano se
   detiene —vuelva al reposo o quede en una postura nueva— la referencia la
   alcanza en ~6 s: eso es la relajación buscada, un apagado hacia cero y no
   una inversión de signo.
2. **Zona muerta** de 0,18 g: lo que quede de cola cae por debajo del umbral
   y no produce ningún empuje. De paso filtra el ruido del sensor.
3. **Exponente 1,5** sobre lo que supera la zona muerta: un gesto marcado pesa
   mucho más que cualquier residuo.

Verificado en aislamiento: tras un gesto de 1,6 g durante 2 s, la respuesta
cae exactamente a 0 desde el instante en que la mano vuelve.

## 2 · Que los puntos obedezcan

Tres mecanismos encadenados, de más lento a más inmediato:

1. **Viento**: 70 → 420 px/s² por unidad de gesto.
2. **Sesgo directo del rumbo deseado**: en vez de esperar a que la fuerza se
   integre, el gesto reclama hasta el 85 % de la dirección objetivo, mezclando
   angularmente el rumbo deseado con el rumbo del gesto. Esto es lo que hace
   que el movimiento se lea de inmediato.
3. **Impulso instantáneo**: cuando la sacudida supera 0,30, cada punto gira de
   una vez hacia la dirección del movimiento (con ±0,55 rad de dispersión
   individual, para que no se desplacen como un bloque rígido) y acelera hasta
   un 90 %. Hay un enfriamiento de 0,22 s para que una sacudida sostenida no
   los congele apuntando siempre al mismo lado.

Además, la sacudida sube la velocidad angular máxima (3,5 → 9,0 rad/s) y la
velocidad máxima (115 → 320 px/s), y el depredador de v3 pasa a dispararse por
picos de sacudida —no por la magnitud cruda, que estaba dominada por la
gravedad— con el radio agrandado a 260 px.

**Los bordes tienen prioridad sobre el gesto.** Como el sesgo de rumbo puede
reclamar el 85 % de la dirección, un viento sostenido contra una pared dejaba
a toda la bandada aplastada contra el borde (visto en el harness: los 24
puntos con exactamente la misma `y`, sobre el límite inferior). La corrección
de borde se aplica ahora *después* del sesgo del gesto, girando hacia adentro
en proporción a cuánto entró cada punto en el margen: el gesto sigue mandando
en el centro del lienzo, pero nunca contra el borde.

## 3 · Profundidad (la dimensión nueva)

El eje Z ya no regula el peso de la cohesión (que pasó a una constante fija
re-tuneada): mueve toda la bandada en profundidad.

- Una profundidad global se integra a partir del gesto en Z, con
  amortiguación y un resorte débil que la devuelve a 0.
- Cada punto tiene su propia `z` ∈ [−1, 1]: la profundidad global, más una
  deriva lenta propia (fase y frecuencia aleatorias), corregida hacia la
  profundidad de sus vecinos y con una separación en z entre los muy cercanos
  —acotada, porque sin tope el grupo se abría siempre hasta los dos extremos y
  la profundidad global dejaba de leerse.
- Se dibuja de atrás hacia adelante (ordenado por z) con opacidad y radio
  propios por punto. Ya no sirve el `path` único con un solo `fill()` de v3,
  pero con ≤40 puntos eso no cuesta nada.

Hay **dos variantes**, idénticas salvo unas quince líneas en `draw()`:

- **`bandada_prototipo_v4a_dispositivo.html` — perspectiva.** La posición
  también se escala desde el centro por `2^(z·0.55)`: al acercarse, la bandada
  crece, se oscurece y se expande hacia los bordes; al alejarse se contrae
  hacia el centro y se aclara. Para que no se salga del lienzo, la simulación
  ocurre en un "mundo" achicado justo por el máximo de esa expansión (×0,97
  para dejar sitio al radio del punto), de modo que con todo al frente el
  mundo llena exactamente la pantalla.
- **`bandada_prototipo_v4b_dispositivo.html` — foco.** La profundidad sólo
  cambia radio y opacidad; las posiciones no se escalan. Se lee como puntos
  que entran y salen de foco, sin que el conjunto se expanda. Acá el mundo
  coincide con el lienzo.

## 4 · Autonomía preservada

Cada punto tiene un ángulo de deriva (*wander*) que hace una caminata
aleatoria propia (2,2 rad/s) y aporta 55 px/s² a la suma de fuerzas. No
depende del acelerómetro ni de los núcleos, así que con el dispositivo quieto
la bandada sigue moviéndose sola. El gesto **sesga** el movimiento; nunca lo
reemplaza.

Se conservan los núcleos de v3 con su respiración, reescalados: slider de 1 a
3 (default 2), tirón de largo alcance 0,0035 → 0,03 (hay muchos menos vecinos
locales sosteniendo cada sub-grupo) e intervalos de respiración 14-30 s →
10-22 s, porque con pocos puntos el efecto se ve mucho más.

## 5 · Escala

- Slider de cantidad: 100-16000 → **10-40**, default 24.
- `NEIGHBOR_R`: 64 → **260 px** (separación < 73 px, alineación < 156 px,
  cohesión hasta 260 px).
- Radio del punto: 1,5 → **4,5 px** al 100 %; slider de tamaño 50-250 %.
- **Se eliminó la grilla espacial** (`buildGrid`, `cellIndex`, `cellKey`,
  `MAX_NEIGHBORS`): con ≤40 puntos son ≤1600 comparaciones por frame, y una
  grilla de celda 260 px no ahorraría nada.

Lo demás de v3 sigue igual: rumbo objetivo con velocidad angular máxima y
banking (flock2, Rama Hoetzlein), zonas concéntricas con suavizado tipo coseno
en los bordes (Starling-Simulation, techcentaur), separación acumulada (no
promediada) y frenado en la curva.

## Validación

Se reutilizó el enfoque del harness de Node de v3 (extraer el `<script>` del
HTML, stubs mínimos de DOM/canvas, `requestAnimationFrame` con dt fijo),
interceptando `ctx.arc()` para medir directamente lo que se dibuja. Con él se
detectaron y corrigieron, en este orden, la cola invertida del gesto, la
bandada aplastada contra el borde y la profundidad que se abría siempre a los
dos extremos.

Estado final, sobre 5 minutos simulados con el perfil del modo demo, en ambas
variantes: 24 puntos, radio RMS del grupo entre ~66 y ~210 px (nunca colapsa a
un punto, nunca llena el lienzo), todo dentro de pantalla, profundidad global
recorriendo su rango completo y radios de punto entre 3,07 y 6,59 px. Con el
perfil "quieto" (sin ninguna entrada) la bandada recorre el lienzo de forma
continua con sacudida 0,00 y profundidad 0,00, que es la autonomía pedida.

También se verificó el render en Firefox headless: la variante a se capturó
con sus 24 puntos de tamaño y opacidad variables y el panel completo.

Queda pendiente, como en v3, la **confirmación visual del usuario en el
navegador** —y sobre todo con el dispositivo en la mano, que es lo único que
puede decir si el gesto "se siente" bien calibrado. Las constantes pensadas
para ese ajuste están agrupadas y comentadas al principio del bloque de
simulación: `WIND_K`, `HEADING_BIAS_K`, `TILT_DEADBAND`, `SHAKE_REF`,
`DEPTH_K` y `IMPULSE_SHAKE_MIN`.

## Archivos

- `bandada_prototipo_v4a_dispositivo.html` y
  `bandada_prototipo_v4b_dispositivo.html` — archivos únicos, autocontenidos,
  sin dependencias ni build step.
- `bandada_prototipo_v3_dispositivo.html` se conserva sin modificar.
- `dispositivo1/dispositivo1.ino` no cambia: el protocolo `A:x,y,z` es el
  mismo y toda la corrección de gravedad ocurre del lado del navegador.
