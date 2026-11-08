# Bandada (dispositivo uno, acelerómetro)

Unos 400 puntos negros sobre fondo blanco que se mueven como un campo
—separación, alineación, cohesión— con deriva propia, y que responden al
acelerómetro que la persona lleva en el antebrazo y la mano derecha. La
murmuración de estorninos es la inspiración de base, no el objetivo literal.

| Archivo | Qué es |
|---|---|
| [`../bandada_prototipo_v5a_dispositivo.html`](../bandada_prototipo_v5a_dispositivo.html) | versión activa, lee el `dispositivo1` por USB |
| [`../experiencia/bandada.html`](../experiencia/bandada.html) | su copia para la pantalla 5 de la experiencia |
| [`../tools/harness.js`](../tools/harness.js) | harness de Node que corre la física real sin navegador |

Hardware y sketch: [`../../dispositivo1/README.md`](../../dispositivo1/README.md)
(Adafruit Flora V3 + LSM6DSO32, ±4 g, `A:<x>,<y>,<z>` en g a ~33 líneas/s; la
tira de LEDs del textil no pasa por la página). El sketch no cambió desde la
v3: toda la corrección de la señal ocurre en el navegador.

---

## 1 · Comportamiento actual (v5a)

- **Arranca quieta.** Al abrir la página hay un campo de puntos inmóvil que
  ocupa toda la pantalla, con profundidad en todo el rango. Nada se mueve
  hasta que el acelerómetro registra movimiento de verdad; la gravedad que
  aparece al conectar el USB no cuenta. Despierta con una rampa de 1,5 s y no
  se vuelve a dormir.
- **Campo continuo.** Lo que sale por un borde entra por el opuesto. La
  densidad se conserva, no hay orilla apelmazada ni franja vacía, y un
  desplazamiento sostenido se lee como la cámara moviéndose a través de un
  campo que no termina.
- **El gesto sesga el movimiento; nunca lo reemplaza.** Inclinar y mover la
  mano empuja el campo en esa dirección de inmediato; al detenerse, la
  bandada vuelve a su deriva propia sin deshacer el movimiento.
- **El eje Z mueve el campo en profundidad**, con perspectiva: más cerca,
  puntos más grandes, opacos y separados del centro.
- **La barra espaciadora termina la interacción**: congela el lienzo, suelta
  el puerto serie y apaga los controles. En la página activa se sale
  recargando; en la experiencia es la captura (§5).

### Cómo probarla

Sin hardware: abrir el archivo en cualquier navegador y marcar **"Modo demo
automático"**, o mover los sliders X/Y/Z del panel.

Con `dispositivo1`: abrir en **Chrome, Edge o Brave**, "Conectar dispositivo
(USB)", elegir el puerto. Con la mano quieta, pulsar **"Poner a cero
(reposo)"**: calibra la referencia y hace desaparecer la gravedad de la
señal. El panel muestra en vivo `gesto` y `sacudida`; si ambos quedan en ~0
con la mano quieta, está bien calibrado.

---

## 2 · Cómo funciona

### 2.1 · La señal del acelerómetro

`window.updateAccel(x, y, z)` es el único punto de entrada (recorta a ±4 g,
el rango del sensor). La simulación **no usa esa lectura cruda**: en reposo
un eje marca ~1,0 g permanentemente. Cada eje pasa por tres filtros
exponenciales —rápido (τ 0,1 s), medio (τ 0,45 s) y lento (τ 6 s)— de los que
salen las dos señales que gobiernan todo:

- **`gesto` = rápido − lento.** Dirige el movimiento. Absorbe la gravedad
  sola, sin saber cómo está orientado el textil.
- **`sacudida` = |rápido − medio|**, normalizada a 0–1. Da la energía:
  velocidad, velocidad de giro, impulsos y depredador.

El filtro rápido además interpola entre las ~33 muestras/s del serial y los
60 fps del render. La primera lectura tras conectar recarga los tres filtros,
para que la gravedad no entre de golpe como un gesto fantasma.

**La referencia de reposo se congela mientras hay movimiento** (la τ del
filtro lento se multiplica por `1 + 12·sacudida`). `gesto` es un pasa-altos,
y un pasa-altos tiene integral cero: sin esto, todo empuje venía seguido de
una cola opuesta de la misma área, y la bandada retrocedía varios segundos
deshaciendo cada movimiento (medido en la v4: +357 px durante el gesto,
−620 px después). Con la referencia congelada, un gesto de ida y vuelta
termina en cero sin cola, y una postura mantenida deja que la referencia la
alcance en ~6 s: el gesto se apaga hacia cero, nunca se invierte. Refuerzan
la asimetría una zona muerta de 0,18 g y un exponente 1,5 sobre lo que la
supera.

### 2.2 · Cómo el gesto llega a los puntos

Tres mecanismos encadenados, de más lento a más inmediato:

1. **Viento**: 420 px/s² por unidad de gesto.
2. **Sesgo directo del rumbo deseado**: el gesto reclama hasta el 85 % de la
   dirección objetivo, sin esperar a que la fuerza se integre. Es lo que hace
   que el movimiento se lea de inmediato.
3. **Impulso instantáneo**: cuando la sacudida supera 0,30, cada punto gira
   de una vez hacia la dirección del movimiento —con dispersión individual,
   para que no se desplacen como un bloque— y acelera, con un enfriamiento de
   0,22 s.

La sacudida sube además la velocidad angular máxima (3,5 → 9,0 rad/s) y la
velocidad máxima (115 → 320 px/s), y un pico brusco dispara un
**depredador**: un punto de repulsión temporal que abre un vacío y se
disuelve solo.

### 2.3 · El modelo de movimiento

Los vecinos se clasifican en **tres zonas concéntricas** (separación /
alineación / cohesión) con peso en "joroba" `sin(t·π)` para que cruzar de
zona no produzca un salto (técnica del shader de
[Starling-Simulation](https://github.com/techcentaur/Flocking-Simulation)).
La suma de fuerzas no se asigna como velocidad: define un **rumbo deseado**
hacia el que el punto gira a una velocidad angular máxima, con la velocidad
suavizada por separado (el modelo de orientación social de
[flock2](https://github.com/ramakarl/flock2)).

Dos correcciones propias, sin las cuales el grupo colapsa u oscila:

- **La separación se acumula sin promediar.** Promediando, los empujes desde
  lados opuestos se cancelan justo donde la densidad es mayor y más hacen
  falta.
- **Frenado en la curva** (`targetSpeed *= lerp(1.0, 0.4, |bank|)`). Al
  separar rumbo de velocidad se pierde el amortiguamiento que el boids
  clásico de Reynolds trae de fábrica; frenar en proporción a cuánto falta
  girar reduce el radio de giro (`r ≈ v/ω`) y amortigua la oscilación.

**El radio de vecindad sale de la densidad**,
`clamp(1,55·√(área / n), 70, 420)` px: con un radio fijo, la cantidad de
puntos decidía sola si había bandada (muchos puntos se veían todos y
acordaban un rumbo único que los compactaba; pocos no veían a nadie). La
separación (`SEP_FRAC` 0,60 del radio) fija la distancia entre puntos, y la
cohesión es débil a propósito (`COHESION_W` 0,03): lo que compactaba el grupo
era la alineación global, y la corrección fue volverla local, no bajarla.

**Autonomía.** Cada punto tiene un ángulo de deriva (*wander*) con una
caminata aleatoria propia, que aporta 100 px/s² a la suma de fuerzas y no
depende del acelerómetro: despierta, la bandada sigue moviéndose sola de
forma continua y no repetitiva.

**No hay grilla espacial**: el escaneo de vecinos es un doble bucle directo
(O(n²)). Con 400 puntos el cuadro cuesta ~3,5 ms de CPU, y ~7,8 ms con 600,
dentro de los 16,7 ms de 60 fps. Si hiciera falta más, el camino es volver a
la grilla de la v2/v3.

### 2.4 · Profundidad

Una profundidad global se integra a partir del gesto en Z, con amortiguación
y un resorte débil que la devuelve a 0. Cada punto tiene su propia
`z ∈ [−1, 1]`: la global más una deriva lenta propia (`Z_PERSONAL` 0,45),
corregida hacia la de sus vecinos, con una separación acotada entre los muy
cercanos para darle espesor al grupo. Se dibuja de atrás hacia adelante,
ordenado por `z`, con perspectiva: la posición se escala desde el centro por
`2^(z·0,55)`, y radio y opacidad también dependen de `z`.

### 2.5 · El mundo es el tronco de visión

La caja de cada punto es **el lienzo retroproyectado a su profundidad**
(`halfW = (w/2)/s`). Un punto lejano puede alejarse más del centro en
coordenadas de mundo, porque al dibujarse se contrae; uno al frente tiene
menos margen. A cualquier `z` se usa todo el lienzo sin cortarse, y los bordes
de esa caja son exactamente los de la pantalla: por eso envolver en ella es
envolver en el lienzo.

### 2.6 · Campo continuo

Tres piezas que tienen que ir juntas:

- **Envoltura** modular en la caja de la profundidad del punto.
- **Vecinos con mínima imagen**: si el cálculo siguiera siendo euclídeo
  plano, los puntos de un borde no verían a los del opuesto y se formaría una
  **costura**, una franja de densidad anómala. Se usa el período de la caja
  del punto evaluado; como los vecinos cercanos están a `z` parecida, la
  diferencia es despreciable.
- **Copias fantasma**: todo punto a menos de un radio de un borde se dibuja
  también del lado opuesto. Sin esto el cruce se ve como un parpadeo.

La cohesión acumula desplazamientos relativos y no posiciones absolutas (el
promedio de absolutas tira para el lado largo cuando el vecino está del otro
lado de la costura).

**Sin núcleos en campo continuo.** Los núcleos orbitan un punto fijo del
lienzo, que en un espacio que envuelve es arbitrario: sólo producían un grumo
anclado al centro con un vacío alrededor. Sin ellos la densidad por franja va
de 0,62 a 1,21 (1,00 = reparto perfecto), contra 0,48–1,47 con núcleo.

La casilla **"espacio continuo"** (encendida por defecto) permite volver al
**modo caja**, que conserva la física de la v4: bordes con rebote, el gesto
cediendo ante la pared (si no, un viento sostenido aplastaría la bandada
contra el borde) y 1 a 3 núcleos que orbitan el centro con un radio que sube
y baja en un ciclo largo.

### 2.7 · El arranque

- Los puntos nacen con velocidad cero, con posición sorteada **en
  coordenadas de pantalla** y retroproyectada a su `z`: el primer cuadro ya es
  el campo lleno.
- `despierto` arranca en `false`. `frame()` acondiciona la señal siempre (es
  lo que detecta el primer movimiento) pero sólo llama a `step()` despierto.
- Despierta con `sacudida > 0,12` o `|gesto| > TILT_DEADBAND`: hacen falta las
  dos condiciones, porque con sólo la primera una inclinación lenta no
  despertaría nada.
- La gravedad no la despierta porque la primera lectura recarga los filtros.
- La rampa de despertar (`DESPERTAR_DUR` 1,5 s) multiplica el piso de
  velocidad y el *wander*; sin ella el primer cuadro despierto se ve como un
  tirón.
- No se vuelve a dormir: el reposo pelearía contra la deriva autónoma.

---

## 3 · Constantes de ajuste

Agrupadas y comentadas al principio del bloque de simulación. Las que
importan para calibrar cómo "se siente" el dispositivo en la mano:

| Constante | Qué controla |
|---|---|
| `WIND_K` | fuerza del viento por unidad de gesto |
| `HEADING_BIAS_K` / `HEADING_BIAS_MAX` | cuánto reclama el gesto del rumbo |
| `TILT_DEADBAND` / `TILT_EXP` | umbral y curva de respuesta al gesto |
| `SHAKE_REF` | cuántos g equivalen a sacudida = 1 |
| `IMPULSE_SHAKE_MIN` | a partir de qué sacudida se dispara el impulso |
| `DEPTH_K` / `DEPTH_SPRING` | cuánto y por cuánto tiempo acerca/aleja el eje Z |
| `NEIGHBOR_SPACING_K` · `SEP_FRAC` · `ALIGN_FRAC` | tamaño de las tres zonas de vecindad |
| `WANDER_STRENGTH` / `WANDER_RATE` | cuánta deriva propia tiene cada punto |
| umbral de despertar (0,12 de sacudida) | el primer número a tocar si despierta sola por el ruido o cuesta despertarla |

---

## 4 · Medir la física sin navegador

```
node entorno-digital/tools/harness.js entorno-digital/bandada_prototipo_v5a_dispositivo.html --perfil=despertar
node entorno-digital/tools/harness.js <archivo.html> --segundos=15 --perfil=tiltX --muestreo=1
```

Corre la simulación real con stubs de DOM y canvas, maneja el reloj a mano y
mide interceptando `ctx.arc()`. Perfiles: `quieto`, `gravedad` (mano
inmóvil), `despertar` (una sacudida al segundo 1 y después mano inmóvil),
`tiltX` (gesto de 2 s y relajación), `auto` (el del modo demo). `--caja`
apaga el campo continuo. El encabezado del archivo explica cómo leer la
salida.

- **Comparar siempre contra el control** antes de llamarle bug a un
  movimiento: la bandada deriva sola por diseño. En v5a el control es
  **`despertar`**; con `gravedad` la escena queda dormida, lo que mide el
  requisito del arranque quieto pero no sirve de comparación.
- Las columnas **`desp`** y **`arrastre`** salen de `window.__diag`. Con campo
  continuo el radio RMS y el centroide son promedios de coordenadas
  envueltas y no significan nada; `arrastre` es el módulo del desplazamiento
  medio sin envolver (un odómetro por punto, fuera de la física), o sea cuánto
  movió el gesto al campo entero.

**Validado** (1600×900, 400 puntos): con `gravedad` 20 s, dormida y arrastre
0; con `despertar` 60 s, pantalla llena en todo momento y RMS 435–440 px;
con `tiltX`, dormida hasta el gesto y relajación sin rebote; en modo caja,
todo dentro del lienzo; densidad por franja sin picos en los bordes (sin
costura); 3,45 ms por cuadro. Render confirmado con captura headless de
Firefox.

**Falta** la confirmación con el dispositivo puesto, sobre todo para el
umbral de despertar.

---

## 5 · La copia de la experiencia (pantalla 5)

`bandada.html` tiene la misma física. Lo que
agrega, además de lo común a las tres copias (Retroceso, barra espaciadora
dos veces, captura en IndexedDB, → a `experiencia.html#6`; ver
[`experiencia.md`](experiencia.md) §3):

- **El fondo lo pinta el CSS**: `draw()` hace `clearRect`, y el PNG sale
  transparente.
- **Los elementos de la captura** salen del mismo `draw()`: `punto()` anota
  cada punto dibujado (x, y, r, alpha, color, en px CSS) en `registro`, así
  que la lista no repite la proyección y no puede diferir de lo dibujado.
  Incluye las copias fantasma.
- **Los puntos no se dibujan hasta el primer dato** (del dispositivo, de los
  sliders, del modo demo o de cualquier control del panel). La física no se
  entera: sólo decide si `draw()` los pinta. La línea de estado dice
  "esperando datos".
- **Retroceso** reinicia la bandada y la vuelve a ocultar hasta el próximo
  dato.
- El panel arranca oculto y la tipografía es Roboto Light, como el resto de
  la experiencia.

En la composición final (pantalla 11) los puntos no se agrandan, sólo se
mueven, y en el modo final se abren con la envolvente del sonido y tiemblan
con los agudos ([`experiencia.md`](experiencia.md) §5.5).

---

## 6 · Historial de versiones

Los archivos de cada versión anterior se conservan en
[`../prototipos/`](../prototipos/).

**v1 · Órbita alrededor de un centroide** (`bandada_prototipo.html`,
2026-08-11). Antes de que existiera el dispositivo, con sliders que simulaban
los tres ejes. Cada punto orbitaba un centroide común con radio y ruido
propios, sin interactuar con los demás: escalaba a miles de puntos (se probó
hasta 8000) a 60 fps. X e Y desplazaban el centroide, Z regulaba el radio de
la nube (concentrada o dispersa), y la magnitud del vector, la turbulencia.
Ya exponía `window.updateAccel(x, y, z)` como única frontera, pensando en
Web Serial. Se eligió HTML + Canvas 2D por sobre Processing o
openFrameworks: el mismo archivo corre en los tres sistemas sin instalar
nada, y Chrome lee el puerto serie desde JavaScript.

**v2 · Boids con grilla espacial** (`bandada_prototipo_v2.html`,
2026-08-11). A la v1 le
faltaba lo más importante de una murmuración: la forma no emergía de
interacciones locales sino de una fórmula global. Se pasó a boids
(separación, alineación, cohesión) con una grilla espacial para que el costo
fuera ~O(n) hasta 16000 puntos, X/Y como viento en vez de desplazamiento
rígido, Z como peso de la cohesión, estela por opacidad y un depredador por
picos de turbulencia. Se veía como cuadrados y, con el uso, colapsaba en una
bola que se movía como un bloque.

**v3 · Rumbo objetivo, zonas concéntricas y núcleos**
(`bandada_prototipo_v3.html` y `_v3_dispositivo`, 2026-09-01/02). De flock2,
el rumbo como objetivo hacia el que se gira con velocidad angular máxima y
*banking*; de Starling-Simulation, las tres zonas concéntricas con peso en
joroba. Se sumaron núcleos (1-4 sub-grupos que orbitan el centro y respiran
en un ciclo de ~40 s). El primer harness de Node encontró por qué seguía
colapsando: la cohesión no multiplicaba por `dt` (era ~60 veces más fuerte),
la separación se promediaba, y —una vez corregida— el grupo oscilaba de 50 a
400 px de radio porque el modelo de rumbo había perdido el amortiguamiento
de Reynolds; de ahí el frenado en la curva. Los triángulos orientados
volvieron a ser puntos. `_v3_dispositivo` fue la primera conectada al
`dispositivo1`.

**v4a / v4b · La señal acondicionada y la profundidad**
(`bandada_prototipo_v4a_dispositivo.html` y `_v4b_`, 2026-09-04). Con el
dispositivo en la mano el acelerómetro no se sentía: la gravedad entraba
como un viento constante, el viento era débil y llegaba tarde a través del
rumbo, y con pocos puntos no había vecinos. Nacieron `gesto` y `sacudida`
con los tres filtros, la referencia congelada contra la cola invertida, la
zona muerta, el viento ×6, el sesgo del rumbo, el impulso instantáneo y la
profundidad con el eje Z (que dejó de regular la cohesión). Se eliminó la
grilla (10-40 puntos). Dos variantes, idénticas salvo cómo se lee la
profundidad: **v4a, perspectiva** (la posición se escala desde el centro: la
bandada se acerca y se aleja), que es la que siguió; y **v4b, foco** (sólo
cambian radio y opacidad). Para que la perspectiva no sacara puntos de
pantalla, v4a simulaba en una caja del 66 % del lienzo.

**v4a, addenda · Pantalla llena con 200 puntos** (2026-09-30, en el mismo
archivo). 10-250 puntos (200 por defecto), arranque repartido en todo el
mundo y el radio de vecindad ligado a la densidad; separación más fuerte,
cohesión y núcleos ~5 veces más débiles, más deriva propia. El radio RMS pasó
de ~185 a ~290 px de forma estable. Quedaba el marco vacío permanente por la
caja del 66 %.

**v5a · Arranque quieto y campo continuo**
(`bandada_prototipo_v5a_dispositivo.html`, 2026-10-12, la activa). El pedido:
un campo quieto que ocupe toda la pantalla, que se mueva sólo cuando el
cuerpo se mueve, que nunca se vacíe, y que la barra espaciadora termine la
interacción. El mundo pasó a ser el tronco de visión, la escena arranca
dormida, el espacio envuelve (con mínima imagen y copias fantasma), los
núcleos se apagan en campo continuo, 10–600 puntos (400 por defecto) con la
profundidad en todo el rango y `Z_PERSONAL` 0,28 → 0,45, y la barra
espaciadora congela. El harness sumó el perfil `despertar`, `--caja` y las
columnas `desp`/`arrastre`.

**Copia para la experiencia** (2026-10-28 en adelante). Captura con la barra
espaciadora (2026-10-28), los puntos ocultos hasta el primer dato
(2026-11-01), instrucciones movidas a la pantalla 4 (2026-11-02), fondo por
CSS y lista de `elementos` (2026-11-03), y la confirmación con la segunda
pulsación (2026-11-07).

**Quedó afuera**: envolver también la profundidad (efecto túnel), porque un
punto que salta de grande y opaco a chico y tenue es un salto mucho más
violento que el lateral y exige desvanecer en los dos extremos; y portar la
variante *b* (foco) a v5.
