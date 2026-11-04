# Experiencia: pantalla 11, composición de las tres capturas

Primera etapa de la composición final: después de la pantalla 10, una pantalla
nueva (`experiencia/composicion.html`) muestra superpuestas las tres
composiciones que la persona capturó con la barra espaciadora. La etapa
siguiente va a permitir editar los elementos; esta sólo los muestra, pero ya
guarda lo que la siguiente va a necesitar.

## Por qué cada cambio

**El fondo pasa del canvas al CSS en las tres copias `_experiencia`.** Para
superponer los lienzos, cada captura tiene que ser transparente donde no hay
dibujo. Antes las tres pintaban el fondo dentro del canvas y además
`componerCaptura()` rellenaba de blanco: el PNG era opaco y la capa de arriba
tapaba todo. Ahora el canvas queda limpio y el color lo pone el `body`, así que
en pantalla se ve igual.

- Bandada: `draw()` hace `clearRect` en lugar del `fillRect` blanco, y el
  selector `canvas` del CSS perdió su `background`.
- Guante: `pintarFondo()` limpia en lugar de pintar `#faf6f0`. Los golpes se
  siguen componiendo con `multiply`: sobre un píxel transparente, multiply da
  el color de la fuente tal cual, y entre anillos superpuestos sigue
  multiplicando. Contra el fondo crema la diferencia era de 2-6 % por canal.
- EMG: no cambió el dibujo. La capa offscreen `capa` nunca tuvo fondo, y
  `congelar()` ya estampa en ella los cuadriláteros que estaban apareciendo,
  así que se captura `capa` en lugar del canvas visible.

Es la única diferencia buscada entre una copia y su página activa: la física
es la misma.

**La captura guarda también los elementos.** Para editar elementos en la etapa
siguiente, un PNG no alcanza: hacen falta posición, tamaño y color de cada
cosa. El registro en IndexedDB pasó de `{ imagen, fecha }` a
`{ imagen, ancho, alto, dpr, elementos, version, fecha }`, en la misma base,
el mismo almacén y con las mismas claves, así que no hubo que subir la versión
de la base. Los elementos están en px CSS y en orden de dibujo:

- bandada: `punto` (x, y, r, alpha, color). Salen del mismo `draw()`: `punto()`
  anota en `registro` si no es `null`, así la lista no repite la proyección y
  no puede diferir de lo dibujado. Incluye las copias fantasma de los bordes;
- guante: `anillo` (dedo, x, y, r, grosor, color, alpha) y `disco` (el FSR), con
  `modo: "multiply"`, anotados en el momento de estamparlos en `#acum`;
- EMG: `cuadrilatero` con sus cuatro vértices en px, más los datos
  normalizados (`v`, `cu`, `cv`, `semiAlto`) que permiten rehacerlo a otro
  tamaño.

`ancho`, `alto` y `dpr` están porque la bandada no usa `devicePixelRatio` y
las otras dos sí: para la misma pantalla, los PNG pueden tener resoluciones
distintas.

**Un canvas por capa en la pantalla 11, y no uno solo fundido.** En la etapa
siguiente cada capa se va a editar, ocultar o reordenar por separado, y
redibujar una no obliga a recomponer las otras. Cada captura se encaja sin
deformar (*contain*) a partir de `ancho`/`alto`: si se capturó en la misma
pantalla es la identidad.

**Orden: EMG abajo, guante, bandada arriba.** Lo grande y translúcido de
fondo, el detalle fino encima: los puntos de la bandada nunca quedan tapados
por los cuadriláteros. Está en un solo lugar, `CAPAS`, en `composicion.html`.
Entre capas la composición es `source-over`: el multiply del guante vale
dentro de su capa, no sobre la EMG. Si hiciera falta, es un `mix-blend-mode`
por capa.

**La 11 es una página aparte y no una pantalla más de `experiencia.html`.**
En la etapa siguiente va a ser el editor y va a crecer mucho;
`experiencia.html` sigue siendo sólo texto. Por eso la tecla Inicio del
operador (borrar las capturas y volver a la 0) se mudó de la 10 a la 11, y la
10 dejó de ser el cierre: → la lleva a la 11 (`SALIDA`, antes
`DISPOSITIVO_SIGUIENTE`, ya no son sólo dispositivos) y ← en la 11 vuelve a la
10.

## Validación

- `node --check` sobre los cinco scripts.
- `tools/harness.js` sobre la copia de la bandada, perfil `despertar`: corre
  igual que antes. Hubo que agregar `clearRect` al contexto falso.
- `tools/harness_emg.js` sobre la copia de la EMG, con una captura sintética
  (`dispositivo3/salida.txt` no está en el repositorio): corre igual.
- Una prueba descartable en Node corrió las tres copias con un DOM genérico
  falso, simuló actividad, pulsó la barra espaciadora y leyó el registro de
  un IndexedDB falso: los tres guardan PNG, medidas y elementos (bandada 29
  puntos para 24 aves, por las copias fantasma; guante anillos y disco; EMG
  cuadriláteros).
- Captura headless de Firefox de `composicion.html`: renderiza.
- **Falta**: el recorrido completo en Chrome de escritorio (capturar las tres
  y mirar la superposición). Es la única prueba que lee la IndexedDB real
  compartida entre las páginas `file://`.
