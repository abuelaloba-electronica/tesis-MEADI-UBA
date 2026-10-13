# Cambios de la bandada v4a → v5a

Archivo nuevo: `entorno-digital/bandada_prototipo_v5a_dispositivo.html`.
`v4a` y `v4b` quedan intactas para comparar. El sketch de `dispositivo1` no
cambia: el protocolo `A:x,y,z` es el mismo y toda la corrección sigue
ocurriendo del lado del navegador.

El pedido fue, en una frase: que al abrir la página haya un campo de puntos
quieto que ocupe toda la pantalla, que se mueva sólo cuando el cuerpo se
mueve, que nunca se vacíe, y que la barra espaciadora termine la interacción.
Seis cambios salen de ahí.

---

## 1 · El mundo es el tronco de visión, no una caja achicada

**Qué pasaba.** v4a dibujaba los puntos en apenas el 66% central del lienzo,
con un marco vacío permanente alrededor. Medido con el harness (1600x900, 400
puntos, perfil `gravedad`): los puntos ocupaban `x 368..1322` e `y 209..697`.

No era azar. Con perspectiva, `draw()` escala la posición desde el centro por
`s = 2^(z·DEPTH_EXP)`, y para que un punto al frente (z=+1, s≈1.46) no se
saliera de la pantalla, v4a simulaba dentro de un rectángulo achicado por
`WORLD_SCALE = 0.97/1.46 ≈ 0.66`. Como la mayoría de los puntos vive cerca de
z=0 (s≈1), se dibujaban dentro de ese 66% y el resto del lienzo quedaba vacío.

**Qué cambió.** `worldRect(z)` ahora depende de la profundidad: es el lienzo
**retroproyectado** a la z del punto, `halfW = (w/2)/s`. Como
`px = cx + (x-cx)·s`, pedir `px ∈ [0, w]` es exactamente pedir
`|x-cx| ≤ (w/2)/s`. Un punto lejano puede alejarse más del centro en
coordenadas de mundo, porque al dibujarse se contrae; uno al frente tiene
menos margen. A cualquier profundidad el punto puede usar todo el lienzo y
nunca queda cortado.

Esto no es sólo un ajuste de encuadre: es la precondición del cambio 3. Los
bordes de esa caja son exactamente los bordes de la pantalla, así que envolver
en ella equivale a envolver en el lienzo.

**Medido.** v5a, mismo escenario: `x -3..1604`, `y -3..904` (lo que se pasa
son las copias fantasma del punto 3 y el radio del punto). Pantalla llena.

---

## 2 · Arranque quieto

**Qué pasaba.** v4 se movía desde el primer cuadro: el *wander*, los núcleos y
la respiración no dependen de la señal, y cada punto nacía además con
`rand(50,110)` px/s de velocidad. Era imposible distinguir "la pieza no
empezó" de "el sensor no está haciendo nada".

**Qué cambió.** Tres piezas:

- Los puntos nacen con velocidad cero.
- Un flag `despierto`, que arranca en `false`. `frame()` acondiciona la señal
  **siempre** —es lo que detecta el primer movimiento— pero sólo llama a
  `step()` si la escena está despierta. Dormida no se gasta nada: el lienzo se
  queda exactamente como se sorteó.
- La condición de despertar vive en `updateSignal()`: `shake > 0.12` (una
  sacudida) o `|tilt| > TILT_DEADBAND` (un gesto sostenido). Hacen falta las
  dos: con sólo la primera, una inclinación lenta no despertaría nada.

**La gravedad no despierta la escena**, que es la trampa obvia: al conectar el
USB, un eje salta a ~1 g de golpe. No la despierta porque `signalPrimed` ya
recargaba los tres filtros con la primera lectura (mecanismo heredado de v4),
así que el escalón nunca llega a verse como gesto. Verificado con el harness:
perfil `gravedad`, 20 s, `despierto = NO` y arrastre 0 px — el campo queda
literalmente inmóvil.

Una vez despierta **no se vuelve a dormir**. Volver al reposo pelearía contra
la deriva autónoma, que es el corazón del modelo de v4.

Al despertar hay una rampa de 1,5 s (`despertarRampa`) que multiplica el piso
de velocidad y la fuerza de *wander*. Sin ella, el primer cuadro despierto
empuja a los 400 puntos de 0 a ~32 px/s de una sola vez y se ve como un tirón.

---

## 3 · Campo continuo (toroide)

**Qué pasaba.** El borde le peleaba al acelerómetro. v4 tenía fuerza de rebote
en el margen **y además** una corrección que le sacaba hasta el 90% del rumbo
al gesto cuando un punto entraba en el margen; ese parche existía porque, sin
él, un viento sostenido dejaba toda la bandada aplastada contra un lado. O sea:
el mecanismo que hacía "obediente" a la v4 estaba acotado por el marco.

**Qué cambió.** Lo que sale por un borde entra por el opuesto, en las dos
direcciones. Desaparecen la fuerza de rebote, la corrección de rumbo y el
clamp duro; en su lugar hay una envoltura modular en la caja del punto. Son
tres piezas que hay que hacer juntas o el resultado se nota mal:

- **Envoltura.** `envolver(v, min, span)` sobre la caja de la profundidad del
  punto, recalculada después de actualizar su z.
- **Vecinos con mínima imagen.** Si el cálculo de vecinos siguiera siendo
  euclídeo plano, los puntos de un borde no verían a los del opuesto: la
  separación dejaría de empujarlos y se formaría una **costura**, una franja de
  densidad anómala justo donde el campo se cierra. Dos condicionales en el
  bucle interno lo resuelven. El período usado es el de la caja del punto
  evaluado; los vecinos cercanos están a z parecida —la cohesión en z los
  mantiene juntos— así que la diferencia entre períodos es despreciable. Es una
  aproximación, no una identidad.
- **Copias fantasma.** Todo punto a menos de un radio de un borde se dibuja
  además del lado opuesto. Sin esto el cruce se ve como un parpadeo: medio
  disco que se evapora de un lado y aparece entero del otro. Son unos pocos
  puntos por cuadro (medido: 400 puntos dibujan entre 402 y 437 arcos).

La cohesión pasó a acumular **desplazamientos relativos** (`-ddx`, `-ddy`) en
vez de posiciones absolutas: el promedio de posiciones absolutas tira para el
lado largo cuando el vecino está del otro lado de la costura. Para el modo caja
es idéntico a lo de siempre, porque el promedio de `(ob - b)` es el centroide
menos `b`.

**Qué efecto tiene.** Más allá de que no se pierdan puntos: la densidad se
conserva, no hay orilla apelmazada ni franja vacía, y un desplazamiento
sostenido se lee como la cámara moviéndose a través de un campo que no termina
en vez de como partículas escapándose de una hoja. El gesto puede mandar el
100% del rumbo en todo el lienzo.

Hay una casilla **"espacio continuo"**, encendida por defecto, que permite
comparar las dos lecturas en la misma página. El modo caja conserva la física
de v4 (con el mundo corregido del punto 1).

---

## 4 · Los núcleos no existen en campo continuo

Los núcleos orbitan un punto fijo del lienzo, y en un espacio que envuelve ese
punto es arbitrario: lo único que producen es un grumo anclado al centro con
un vacío alrededor, en contra del reparto parejo que se pidió.

**Medido** (densidad por franja en X, promediada sobre 60 s, 1.00 = reparto
perfecto): con núcleo va de 0.48 a 1.47; sin núcleo, de 0.62 a 1.21 — y lo que
queda ya no es un grumo fijo sino la bandada agrupándose y desagrupándose, que
es lo que tiene que hacer. El arrastre del campo pasa de 630 px a 4576 px en
180 s: la diferencia entre una bandada atada a un poste y un campo que de
verdad se desplaza.

Con campo continuo el slider de núcleos se deshabilita y el panel dice por qué.
En modo caja sigue funcionando igual que en v4.

---

## 5 · Más puntos, más profundidad

- **10–600 puntos, arranca en 400** (v4: 10–250, arrancaba en 200). Costo
  medido con 400 puntos: 3,45 ms por cuadro de CPU, contra los 16,7 ms que
  hay de presupuesto a 60 fps. El cuello de botella sigue siendo el doble
  bucle de vecinos, que es O(n²); a 600 puntos son ~7,8 ms, todavía dentro.
  Si en el futuro hiciera falta más, el camino es volver a la grilla espacial
  que tenía v3.
- **Profundidad en todo el rango al arrancar.** `z = rand(-1, 1)` en vez de
  `rand(-0.4, 0.4)`. El rango viejo daba opacidades 0.51–0.79 y tamaños
  0.86–1.16×: demasiado angosto para leerse como profundidad.
- **`Z_PERSONAL` de 0.28 a 0.45.** Con 0.28, la cohesión en z comprimía el
  grupo a z ≈ ±0.6 a los pocos segundos, o sea que la profundidad sorteada al
  arrancar se iba perdiendo con la escena andando. Medido con el harness
  (rango de radios de punto, perfil `despertar`, 40 s): 0.28 da ±0.6, 0.45 da
  ±0.9, 0.60 ya no agrega nada.
- **La posición inicial se sortea en coordenadas de pantalla** y se
  retroproyecta a la z del punto, así que el primer cuadro —antes de que la
  física corra una sola vez— ya es el campo lleno y disparejo en profundidad
  que se quiere ver al abrir.

---

## 6 · La barra espaciadora termina la interacción

`keydown` sobre `Space` congela la escena: `frame()` dibuja un último cuadro y
corta la cadena de `requestAnimationFrame`. No es una pausa — se sale
recargando la página. Como es el cierre de la pieza y no un botón de pausa,
también suelta el puerto serie y deshabilita todos los controles, para que no
quede nada a medio camino. La línea de estado lo dice.

Detalle: redimensionar la ventana borra el lienzo, y con la escena congelada
nadie lo volvería a dibujar, así que el *listener* de `resize` redibuja a mano.

---

## Validación

Todo lo de arriba se midió con `entorno-digital/tools/harness.js`, que recibió
tres agregados para poder hacerlo:

- **Perfil `despertar`**: 1 g constante con una sacudida breve al segundo 1.
  Es el nuevo control de deriva. `gravedad` sigue siendo el control, pero en v5
  mide **quietud**: con la escena dormida no hay movimiento que medir (que es
  justamente el requisito 1).
- **Opción `--caja`**: apaga el campo continuo disparando a mano el `change` de
  la casilla. La página no lee el estado de la casilla al arrancar —el valor
  por defecto vive en el código— precisamente para que el harness, cuyos
  elementos falsos tienen `checked = false`, no midiera siempre el modo caja.
- **Columnas `desp` y `arrastre`**, que salen de `window.__diag`. Con campo
  continuo, el radio RMS y el centroide de lo dibujado dejan de significar
  algo: son promedios de coordenadas envueltas. En su lugar, cada punto lleva
  un odómetro (desplazamiento acumulado sin envolver, fuera de la física) y
  `arrastre` es el módulo del desplazamiento medio. La deriva propia de cada
  punto se cancela en ese promedio; el empuje común, no. Es lo único que queda
  para medir cuánto movió el gesto al campo entero.

Resultados, lienzo 1600x900, 400 puntos:

| Prueba | Resultado |
|---|---|
| `--perfil=gravedad --segundos=20` | `despierto = NO`, arrastre 0 px, radios y posiciones idénticos en las tres muestras: la escena está literalmente inmóvil y 1 g no la despierta |
| `--perfil=despertar --segundos=60` | despierta, `x -3..1604` / `y -3..904` (pantalla llena en todo momento), RMS 435–440 px (no colapsa ni se desarma) |
| `--perfil=tiltX --segundos=24` | dormida hasta el primer gesto (t=3 s), arrastre pico 245 px durante la inclinación y relajación posterior sin rebote |
| `--caja --perfil=despertar` | 400 arcos (sin fantasmas), todo dentro del lienzo (`x 59..1513`, `y 50..860`): el modo v4 sigue conteniendo |
| densidad por franja, 60 s | X 0.62–1.21, Y 0.58–1.19 sin núcleos; sin picos en los bordes, o sea **sin costura** |
| costo | 3,45 ms de CPU por cuadro con 400 puntos |

Render confirmado con captura headless de Firefox: campo parejo sobre todo el
lienzo, abanico completo de opacidad y tamaño, y la línea de estado en "en
reposo, esperando movimiento".

**Falta la confirmación con el dispositivo en la mano**, que es lo único que
puede decir si el umbral de despertar (0,12 de sacudida) está bien calibrado
para el textil puesto. Es el primer número a tocar si la escena despierta sola
por el ruido del sensor, o si cuesta despertarla.

---

## Lo que quedó afuera

**Envolver también la profundidad** —el que se aleja del todo reaparece al
frente, efecto túnel— completaría el gesto en Z, pero un punto saltando de
grande y opaco a chico y tenue es un pop mucho más violento que el lateral, y
taparlo exige desvanecer en ambos extremos del rango. Es un cambio de carácter
visual grande y va a su propia versión.

**La variante `b`** (profundidad sin perspectiva) no se portó todavía. En ella
el factor de perspectiva es 1, así que el punto 1 de esta lista es trivial —el
mundo ya era el lienzo— y el resto se aplica igual.
