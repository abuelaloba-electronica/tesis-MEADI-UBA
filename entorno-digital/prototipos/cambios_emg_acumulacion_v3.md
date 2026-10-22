# Cambios de la acumulación EMG → v3: cuadriláteros superpuestos

Archivo: [`../prototipo_emg_acumulacion_v3_dispositivo.html`](../prototipo_emg_acumulacion_v3_dispositivo.html).
Parte de [`prototipo_emg_acumulacion_v2.html`](prototipo_emg_acumulacion_v2.html)
(se conserva sin cambios) y es la primera página que lee el `dispositivo3`
(AD8232 en la pantorrilla) por USB.

Se mantiene de v2 todo lo que ya resolvía la señal: `window.feedEMG(v01)` como
única frontera, la envolvente EMA, el umbral de inicio/fin de repetición, la
duración mínima que descarta los gestos breves, el pad simulado y el modo
automático. Lo que cambia es la figura y la entrada real.

## 1 · Un rectángulo invisible como molde, en vez de una malla que crece

v2 agregaba triángulos pegados a una cara libre: la figura crecía hacia
cualquier lado y podía salirse del lienzo. En v3 hay un **rectángulo original**
centrado, más alto que ancho (alto = 75 % del viewport, `ALTO_FRAC`; ancho =
0,45 × alto, `RATIO`), que **nunca se dibuja**. Cada contracción produce una
variación de ese molde, así que la composición queda siempre en el centro y del
mismo orden de tamaño: lo que se acumula es la densidad y el color, no la
extensión. En pantallas angostas el molde se achica entero para que entre a lo
ancho.

## 2 · Rotación siempre desde el original, no acumulada

Cada cuadrilátero rota un ángulo al azar en ±35° (`ROT_MAX`) alrededor del
centro del rectángulo original. Si la rotación se acumulara sobre el anterior,
tras muchas contracciones la figura giraría como una espiral y perdería la
verticalidad del molde.

## 3 · Lados deformados moviendo las esquinas, con el orden angular protegido

Para cambiar el largo de los cuatro lados sin que dejen de estar unidos se
mueven **las esquinas**, no los lados: cada una se aleja o acerca del centro
hasta ±20 % (`DEF`) y gira alrededor de él hasta `JIT`. Un lado es siempre el
segmento entre dos esquinas contiguas, así que la continuidad está garantizada
por construcción.

El riesgo es que dos esquinas vecinas se crucen y el polígono quede
"anudado" (lados que se cortan). `JIT` vale 0,8 × la mitad del hueco angular
más chico entre esquinas (el del lado corto, 2·atan(0,45) ≈ 48°), así que dos
vecinas nunca intercambian su orden alrededor del centro. Un polígono cuyos
vértices están en orden angular alrededor de un punto interior es estrellado
respecto de ese punto y, por lo tanto, simple. Puede quedar levemente cóncavo,
que es buscado: es la diferencia visible con un rectángulo rotado.

Con `DEF = 0,25` algunos vértices salían del viewport arriba y abajo (el radio
de la esquina ya es 1,1 semi-altos); se bajó a 0,2. Igual puede rozar el borde
en casos extremos: es la constante para ajustar si molesta.

## 4 · La señal elige el color; el azar, la forma

La forma no depende de la señal: la contracción sólo decide **cuándo** aparece
un cuadrilátero y **de qué color**. La intensidad media de la repetición,
reescalada entre el umbral y la mayor vista en la sesión (para recorrer toda la
paleta aunque el rango real del AD8232 sea chico), elige una posición en una
paleta cálida de 6 colores ordenada de suave a intensa (rosa, ocre, coral,
naranja, magenta, bordó), con ±1 de variación al azar. Si coincide con el color
del cuadrilátero anterior se corre uno, para que dos consecutivos nunca sean
iguales.

## 5 · Opacidad fija por capa y `source-over`, sin `multiply`

v2 dibujaba con `multiply`. Con decenas de capas superpuestas exactamente en la
misma zona, `multiply` lleva el centro a casi negro. v3 rellena con
`source-over` y opacidad ~22 % (slider "Opacidad de cada capa", que vale para
los cuadriláteros nuevos: los ya dibujados conservan la suya), sin trazo. Los
anteriores quedan visibles por transparencia y el centro se satura hacia el
color dominante en vez de hacia el negro.

## 6 · Capa offscreen: el costo por frame no crece con la sesión

Los cuadriláteros nunca se borran. Redibujarlos todos en cada frame haría que
una sesión larga se vuelva lenta. Al terminar su animación de aparición (260 ms,
igual que en v2) cada uno se estampa en un canvas offscreen, y cada frame cuesta
un `drawImage` más las piezas que todavía están apareciendo. Se guardan
normalizados (en semi-altos del molde) para reconstruir la capa al cambiar el
tamaño de la ventana.

## 7 · Lector Web Serial del dispositivo3

Mismo patrón que la página activa del guante. `handleLine` compara los dos
primeros caracteres y no usa `startsWith("E")`, porque la línea legible del
sketch empieza con `EMG base = …`.

- **`E:<n>`** → `feedEMG(n / techo)`. El rango real de la MAV todavía no se
  midió (ver `dispositivo3/README.md`), así que el techo es un slider (10-512,
  100 por defecto) y el panel muestra la última `E:` y el máximo visto, con un
  botón para usar ese máximo como techo tras una contracción fuerte.
- **`L:1`** → indicador "alguno suelto" y se **cancela** la contracción en
  curso. El sketch manda `E:0` mientras hay un electrodo suelto; sin cancelar,
  esa caída se leería como una relajación y estamparía un cuadrilátero falso.
  Lo mismo al desconectar el puerto.
- Con el puerto abierto el simulador deja de alimentar `feedEMG` y el pad y el
  modo automático se deshabilitan: dos fuentes sobre la misma envolvente se
  mezclarían. Al desconectar vuelven.

`ENV_ALPHA = 0,15` se ajustó en v2 para una llamada por frame (~60/s); el
sketch manda 50/s, así que la envolvente responde apenas más lento. Se dejó
igual hasta probar con la pierna.

## Validación

- `node --check` del `<script>` extraído.
- Script ad-hoc con stubs de DOM y canvas: 20 ráfagas de 1 s → 20
  cuadriláteros; 5 ráfagas de 50 ms → ninguno; los 4 vértices de cada uno en
  orden angular alrededor del centro (polígono simple); ningún par de
  consecutivos del mismo color.
- Captura headless con Firefox de una copia que siembra 25 cuadriláteros al
  cargar: el abanico queda centrado, alrededor del 75 % del alto.
- **Pendiente:** probar con la placa en Chrome/Edge y fijar el techo por
  defecto con la amplitud real de contracción.

## Calibración con la primera sesión real

Con la placa puesta, la página casi no dibujaba: reproduciendo la captura del
Monitor Serial ([`dispositivo3/salida.txt`](../../dispositivo3/salida.txt),
~30 s de movimientos) contra la v3 tal como se había commiteado,
**0 cuadriláteros**. Se ajustó en el lugar y no por copia: es la calibración
que la sección Validación dejaba pendiente, no una variante nueva. Con la
misma captura ahora salen **13**, uno por movimiento.

La captura mostró tres cosas que la v3 no esperaba:

1. **El reposo no es ~0 sino ~60 cuentas**, y deambula hasta ~115. Con el
   techo en 100 y sin restar nada, la pierna quieta ya daba una envolvente
   de 0,6-1,0, siempre por encima del umbral (0,08): **ninguna contracción
   terminaba**. Ahora la página estima el reposo en vivo (panel: "reposo") y
   normaliza `(E − reposo) / techo`. El reposo baja rápido hacia las
   lecturas más bajas (~0,2 s) y sube lento (~5 s), y sólo con lecturas
   cercanas a él: sin esa compuerta, como casi todas las lecturas válidas de
   la sesión eran de actividad, trepaba de ~60 a ~95 y se comía los
   movimientos de la segunda mitad. Las lecturas altas igual lo suben, muy
   despacio (~40 s), para que un salto real del reposo no deje la envolvente
   trabada arriba. Se vuelve a medir al conectar.
2. **Casi cada movimiento termina con `L:1`.** El movimiento de la
   pantorrilla despega el electrodo: la `E:` sube 3-6 lecturas hacia el riel
   y llega `L:1`. La v3 *cancelaba* la contracción en curso, así que aun con
   el reposo bien resuelto se descartaba todo. Ahora `L:1` la **cierra** en
   ese instante (las `E:0` que siguen no entran) y la estampa si duró la
   duración mínima **o** si la envolvente llegó a `PICO_TRUNCADA` (0,3): una
   contracción cortada por el electrodo no es un gesto breve, no se sabe
   cuánto iba a durar. La casilla "Electrodo suelto cierra la contracción"
   vuelve al comportamiento anterior (con ella destildada, la misma captura
   da 4), para cuando el contacto esté resuelto.
3. **Tras reconectar llega una cola falsa.** Después de los 500 ms de `E:0`
   del sketch, la `E:` arranca en ~100-150 y cae en exponencial hasta ~20 en
   ~0,5 s: es el pasaaltos del sketch re-sembrado con una lectura todavía
   fuera de lugar. Esa cola es monótona y ni el ruido de reposo ni una
   contracción lo son, así que la página la descarta hasta la primera lectura
   que no baja (con un tope de 1,5 s). Sin esto, la cola bajaba el reposo a
   ~15 y la pierna quieta pasaba a leerse como contracción.

Constantes que cambiaron, todas medidas contra la captura con
`tools/harness_emg.js`:

| | antes | ahora | por qué |
|---|---|---|---|
| techo por defecto | 100 (sobre 0) | 300 (sobre el reposo) | movimientos de ~150 a ~850; slider hasta 1023, porque la MAV pasó de 512 cerca del riel |
| umbral | 0,08 | inicio 0,25 / fin 0,12 | con histéresis. 0,25 × 300 ≈ 75 cuentas sobre el reposo, por encima de lo que deambula la pierna quieta (~55); con 0,10 el ruido de reposo estampaba cuadriláteros falsos, y con 0,20 dos movimientos seguidos se fundían en uno |
| `ENV_ALPHA` | 0,15 | 0,25 | el sketch manda 50/s y no ~60/s, y las ventanas con contacto son cortas |
| duración mínima | 0,3 s | 0,2 s (slider desde 0,05) | las contracciones completas de la sesión duraron 0,3-0,7 s; con 0,3 se perdía una que quedaba justo por debajo |

Control contra falsos positivos con una captura sintética (reposo uniforme
55-115, como el real): 20 s de pierna quieta → 0 cuadriláteros; 10 ráfagas de
1 s a 250-400 → 10; 5 picos de 40 ms sin `L:1` → descartados por breves.

**Lo que la página no puede arreglar:** un tercio de la sesión transcurre con
un electrodo suelto, y en la segunda mitad las ventanas con contacto duran
0,1-0,5 s. Ahí lo único que se ve de cada movimiento es la subida al riel que
precede a `L:1`, y eso es lo que estampa los cuadriláteros de 0,0-0,1 s.
Con el contacto resuelto (ver `dispositivo3/README.md`), probablemente haya
que subir de nuevo el umbral de inicio y volver a la duración mínima de
0,3 s. Volver a capturar una sesión y pasarla por el harness antes de tocar
constantes.
