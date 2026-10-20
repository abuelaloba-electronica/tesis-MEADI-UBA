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
