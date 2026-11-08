# Acumulación EMG (dispositivo tres)

Cada contracción de la pantorrilla deja un cuadrilátero translúcido, una
variación de un rectángulo invisible. Los cuadriláteros nunca se borran: se
superponen en abanicos que, cada 1 a 5 contracciones, se mudan a otro punto
de la pantalla y cambian de familia de color. Cuántos abanicos hay y qué tan
densos son dice cuánto se trabajó; el tono de cada capa, con qué intensidad.

| Archivo | Qué es |
|---|---|
| [`../prototipo_emg_acumulacion_v4_dispositivo.html`](../prototipo_emg_acumulacion_v4_dispositivo.html) | versión activa, lee el `dispositivo3` por USB |
| [`../experiencia/emg_acumulacion.html`](../experiencia/emg_acumulacion.html) | su copia para la pantalla 9 de la experiencia |
| [`../tools/harness_emg.js`](../tools/harness_emg.js) | harness de Node que reproduce una captura real del Monitor Serial |

Hardware y sketch: [`../../dispositivo3/README.md`](../../dispositivo3/README.md)
(LilyPad Arduino USB + AD8232 en la pantorrilla). La placa muestrea a 1 kHz,
rectifica y promedia ventanas de 20 muestras, y manda la amplitud media
(MAV) cruda:

| Línea | Frecuencia | Qué hace la página |
|---|---|---|
| `E:<amplitud>` | 50/s | `feedEMG((E − reposo) / techo)` |
| `L:<0\|1>` | al cambiar y cada 3 s | `1` = algún electrodo suelto (ver §2.3) |
| `EMG base = …` | cada 3 s | se ignora (diagnóstico) |

`handleLine` compara los dos primeros caracteres, no usa `startsWith("E")`,
porque la línea legible también empieza con `E`. `window.feedEMG(v01)` es la
**única frontera** de entrada: por ahí entran el lector de Web Serial, el pad
simulado, el modo automático y la consola.

---

## 1 · Comportamiento actual (v4)

### 1.1 · La figura

- **Un rectángulo original que nunca se dibuja**, más alto que ancho: alto =
  50 % del viewport (`ALTO_FRAC`), ancho = 0,45 × alto (`RATIO`). Cada
  contracción produce una variación de ese molde.
- **Rotación siempre desde el original**, al azar en ±35° (`ROT_MAX`)
  alrededor de su centro. Si se acumulara sobre la anterior, la figura giraría
  en espiral y perdería la verticalidad.
- **Lados deformados moviendo las esquinas**, no los lados: cada esquina se
  aleja o acerca del centro hasta ±20 % (`DEF`) y gira alrededor de él hasta
  `JIT`. Un lado es siempre el segmento entre dos esquinas contiguas, así que
  la continuidad está garantizada. `JIT` vale 0,8 × la mitad del hueco angular
  más chico entre esquinas, así que dos vecinas nunca intercambian su orden y
  el polígono nunca queda anudado. Puede quedar levemente cóncavo, que es
  buscado: es la diferencia visible con un rectángulo rotado. (Con `DEF` 0,25
  algunos vértices se salían del viewport.)
- **La señal elige cuándo y de qué color; el azar, la forma.**

### 1.2 · Dónde: el centro se muda

- **Cada 1 a 5 cuadriláteros** (`POR_UBICACION_MIN`/`_MAX`, sorteado de
  nuevo en cada mudanza) el centro se muda. La sesión deja varios abanicos
  repartidos, y con 1 como mínimo aparecen también cuadriláteros sueltos: la
  composición es menos regular.
- **Arranca en el centro**, con la familia cálida.
- La mudanza ocurre **después** de estampar el cuadrilátero que completa el
  grupo.
- Cada ubicación nueva queda a una distancia mínima de la anterior
  (`DIST_MIN`), para que el cambio se note.
- **El centro puede caer en cualquier punto del viewport, incluso pegado al
  borde**, y ahí los cuadriláteros se cortan. Limitarlo a la zona donde el
  rectángulo entraba entero dejaba los abanicos agrupados en el centro y los
  bordes vacíos: que se corten contra el borde es parte de la composición.
- Los centros se guardan en **unidades de zona** (−1…1 de borde a borde), no
  en píxeles: al cambiar el tamaño de la ventana todos quedan en la misma
  posición relativa.

### 1.3 · De qué color: familias

Cada ubicación usa una **familia** de tonos de un mismo matiz, ordenados de
suave a intenso. Son cinco, en `FAMILIAS`: **cálida** (rosa, ocre, coral,
naranja, magenta, bordó; la del arranque), **azul**, **verde**, **violeta** y
**turquesa**. Se pueden agregar, quitar o reordenar editando ese arreglo, con
cualquier cantidad de tonos (2 o más); la primera es la del arranque.

- **La intensidad elige el tono dentro de la familia**: la media de la
  contracción, reescalada entre el umbral y la mayor vista en la sesión (para
  recorrer toda la paleta aunque el rango real del AD8232 sea chico), con ±1
  de variación al azar. Si coincide con el tono anterior se corre uno: dos
  consecutivos nunca son iguales.
- **El sorteo de familias es una bolsa mezclada**: se usan todas antes de
  repetir, y nunca la misma dos veces seguidas, tampoco al rellenar la bolsa.

El nombre de la familia aparece en "Último" del panel, y por lo tanto en la
salida del harness.

### 1.4 · Cómo se dibuja

- **`source-over` con opacidad fija por capa** (~22 %, slider "Opacidad de
  cada capa", que vale para los nuevos), sin trazo. Con decenas de capas en la
  misma zona, `multiply` llevaba el centro a casi negro; así los anteriores
  quedan visibles por transparencia y el centro se satura hacia el color
  dominante.
- **Aparición** de 260 ms (`POP_MS`), y después **se estampa en una capa
  offscreen** (`capa`): cada frame cuesta un `drawImage` más las piezas que
  están apareciendo, y una sesión larga no se vuelve lenta. Se guardan
  normalizados para reconstruir la capa al redimensionar.
- "Limpiar lienzo" vuelve al centro y a la familia cálida.

---

## 2 · La señal

### 2.1 · De la lectura a la envolvente

- **Reposo estimado en vivo.** El reposo de la MAV no es ~0 sino ~60 cuentas,
  y deambula hasta ~115. La página normaliza `(E − reposo) / techo`. El reposo
  baja rápido hacia las lecturas más bajas (~0,2 s) y sube lento (~5 s), y
  sólo con lecturas cercanas a él: sin esa compuerta, como casi todas las
  lecturas de una sesión son de actividad, trepaba y se comía los movimientos.
  Las lecturas altas igual lo suben, muy despacio (~40 s), para que un salto
  real del reposo no deje la envolvente trabada arriba. Se vuelve a medir al
  conectar. El panel lo muestra.
- **Techo** por defecto 300 cuentas sobre el reposo (slider 20–1023, con un
  botón para usar el máximo visto): los movimientos de la primera sesión real
  iban de ~150 a ~850.
- **Envolvente** EMA con `ENV_ALPHA` 0,25, ajustada a las 50 lecturas/s del
  sketch.

### 2.2 · Una contracción, un cuadrilátero

- Empieza cuando la envolvente supera **0,25** (`PRESS_THRESHOLD`, ≈75
  cuentas sobre el reposo, por encima de lo que deambula la pierna quieta) y
  termina cuando baja de **0,12** (`RELEASE_THRESHOLD`). Con la histéresis,
  dos movimientos seguidos no se funden en uno, y el ruido de reposo no
  estampa cuadriláteros falsos.
- **Duración mínima** 0,2 s (slider desde 0,05): más breve se descarta y el
  pad lo avisa. Las contracciones completas de la sesión real duraron
  0,3-0,7 s.
- Usar la envolvente y no la lectura cruda evita que el ruido propio de la
  EMG dispare repeticiones falsas.

### 2.3 · El electrodo suelto

- **`L:1` cierra la contracción en curso** en ese instante (las `E:0` que
  manda el sketch mientras está suelto no entran) y la estampa si duró la
  mínima **o** si la envolvente llegó a `PICO_TRUNCADA` (0,3): una
  contracción cortada por el electrodo no es un gesto breve. En la sesión real
  casi cada movimiento terminaba con `L:1`, porque el movimiento de la
  pantorrilla despega el electrodo. La casilla "Electrodo suelto cierra la
  contracción" vuelve a cancelarla, para cuando el contacto esté resuelto.
- **Asentamiento al reconectar**: tras los 500 ms de `E:0` del sketch llega
  una cola falsa (~100-150 que cae en exponencial a ~20 en ~0,5 s), que es el
  pasaaltos del sketch re-sembrado con una lectura todavía fuera de lugar. Es
  monótona, y ni el ruido de reposo ni una contracción lo son: la página la
  descarta hasta la primera lectura que no baja (tope 1,5 s, `ASENT_MAX`). Sin
  esto la cola bajaba el reposo y la pierna quieta pasaba a leerse como
  contracción.
- Con el puerto abierto **el simulador deja de alimentar `feedEMG`** y el pad
  y el modo automático se deshabilitan: dos fuentes sobre la misma envolvente
  se mezclarían.

---

## 3 · Cómo probar

Sin hardware: el pad vertical del panel (mantener y soltar simula una
contracción completa) o el modo automático, en cualquier navegador.

Con el `dispositivo3`, en Chrome, Edge o Brave: "Conectar", y mirar en el
panel la última `E:`, el máximo visto y el reposo.

**Harness**: en vez de inventar la señal, reproduce una captura del Monitor
Serial (las líneas `E:`/`L:` tal cual) por un puerto Web Serial falso, y
cuenta los cuadriláteros que se habrían estampado y los descartados. Cada
`E:` avanza 20 ms.

```
node entorno-digital/tools/harness_emg.js entorno-digital/prototipo_emg_acumulacion_v4_dispositivo.html dispositivo3/salida.txt
node entorno-digital/tools/harness_emg.js <archivo.html> <captura.txt> --techo=300 --minDur=0.2 --traza
```

**Validado**: con `dispositivo3/salida.txt` (~30 s de movimientos de la
primera sesión real), 13 cuadriláteros y 3 descartados, uno por movimiento.
La misma captura repetida 25 veces (~13 min, 277 cuadriláteros, 89
ubicaciones): grupos de 1 a 5, ninguna familia seguida, cada ronda de cinco
usa las cinco. Con una captura sintética de reposo uniforme (55-115): 20 s de
pierna quieta → 0 cuadriláteros; 10 ráfagas de 1 s → 10; 5 picos de 40 ms
sin `L:1` → descartados. Captura headless de Firefox de una copia que siembra
40 cuadriláteros: abanicos de colores distintos por todo el viewport.

**Antes de tocar constantes**, volver a capturar una sesión y pasarla por el
harness.

---

## 4 · La copia de la experiencia (pantalla 9)

`emg_acumulacion.html` dibuja igual. Lo que agrega,
además de lo común a las tres copias (Retroceso, barra espaciadora dos veces,
captura, → a `experiencia.html#10`; ver [`experiencia.md`](experiencia.md) §3):

- **Se captura la capa offscreen** `capa` y no el canvas visible: tiene todos
  los cuadriláteros estampados y nunca se le pintó el fondo, así que el PNG ya
  sale transparente. `congelar()` cierra la contracción en curso y estampa los
  que estaban apareciendo. El canvas visible y su `BG_COLOR` no cambian.
- **Los elementos de la captura** son `cuadrilatero`s con sus cuatro
  vértices en px, color, alpha y familia, más los datos normalizados (`v`,
  `cu`, `cv`, `semiAlto`) que permiten rehacerlos a otro tamaño.

En la composición final (pantalla 11) los cuadriláteros quedan abajo de
todo, se pueden agrandar, y en el modo final respiran con los graves del
sonido (hasta un 5 %; [`experiencia.md`](experiencia.md) §5.5).

---

## 5 · Pendiente

- **Probar con la placa** después de la recalibración, y decidir si 1-5 por
  ubicación y el 50 % de alto dan la densidad buscada en una sesión real.
- **El contacto de los electrodos**: un tercio de la primera sesión pasó con
  un electrodo suelto, y en la segunda mitad las ventanas con contacto duraban
  0,1-0,5 s. Con el contacto resuelto probablemente haya que subir de nuevo el
  umbral de inicio y volver a la duración mínima de 0,3 s.
- El AD8232 es un front-end de ECG (filtra ~0,5–40 Hz) y atenúa buena parte
  del EMG de superficie; ver `dispositivo3/README.md`.

---

## 6 · Historial de versiones

Los archivos de cada versión anterior se conservan en
[`../prototipos/`](../prototipos/).

**v1 · Fractura low-poly y temblor** (`prototipo_emg_fractura_v1.html`,
2026-08-11, sólo simulada, antes de que existiera el `dispositivo3`). Un triángulo
escaleno en rojos y rosas que se fracturaba en facetas, como un cristal roto:
un árbol de subdivisión aleatoria donde cada nodo tenía un umbral de
contracción, así que a más contracción más facetas, más chicas (en reposo ya
se veían unas pocas: un músculo nunca está en tensión cero). El residuo entre
la lectura y la envolvente se veía como un temblor de los vértices,
porque la EMG es intrínsecamente ruidosa. Respondía en vivo y volvía al
reposo al relajar. De acá quedan la envolvente EMA y `window.feedEMG(v01)`.

**v2 · Acumulación: una malla que crece** (`prototipo_emg_acumulacion_v2.html`,
2026-08-11, sólo simulada). En vez de volver al reposo, cada contracción sostenida (una
"repetición") deja una marca permanente: la sesión se registra. Cada
repetición agregaba un triángulo pegado a una cara libre de la malla, elegida
al azar, con la altura según la duración y el color según la intensidad, con
`multiply` y una aparición de 0,25 s. La detección de inicio y fin sobre la
envolvente, la duración mínima, el pad simulado y el modo automático por
ráfagas nacieron acá y siguen. La malla crecía hacia cualquier lado y podía
salirse del lienzo.

**v3 · Cuadriláteros superpuestos** (`prototipo_emg_acumulacion_v3_dispositivo.html`,
2026-10-19). La primera con el `dispositivo3`. El molde invisible centrado
(75 % del alto) reemplazó a la malla: la composición queda siempre en el
centro y lo que se acumula es densidad y color, no extensión. Rotación desde
el original, esquinas deformadas con el orden angular protegido, una paleta
cálida de 6 colores elegida por la intensidad, `source-over` en lugar de
`multiply`, la capa offscreen y el lector Web Serial con `E:`/`L:` (`L:1`
cancelaba la contracción).

**v3, calibración con la primera sesión real** (2026-10-21, en el mismo
archivo). Con la placa puesta la página no dibujaba nada: reproduciendo
`salida.txt`, 0 cuadriláteros. Se descubrió el reposo de ~60 cuentas, que
casi cada movimiento termina con `L:1` y la cola falsa al reconectar. Entraron
el reposo estimado en vivo, `L:1` que cierra en vez de cancelar (con
`PICO_TRUNCADA`), el asentamiento, y las constantes medidas con el harness:
techo 100 → 300 sobre el reposo, umbral 0,08 → 0,25/0,12 con histéresis,
`ENV_ALPHA` 0,15 → 0,25, duración mínima 0,3 → 0,2 s. Con la misma captura,
13 cuadriláteros.

**v4 · El centro se muda y cambia de color**
(`prototipo_emg_acumulacion_v4_dispositivo.html`, 2026-10-21, la activa). La
señal quedó igual que la v3 calibrada; cambió dónde y de qué color se dibuja.
El rectángulo bajó de 75 % a 50 % del alto (a 75 % un abanico tapaba casi
todo y los demás se encimaban), el centro se muda cada 1-5 (un primer
borrador usaba 3-5) a cualquier punto del viewport (un primer borrador lo
limitaba a donde entraba entero), y la paleta única pasó a cinco familias
sorteadas por bolsa.

**Copia para la experiencia** (2026-10-28 en adelante). Captura con la barra
espaciadora (2026-10-28); instrucciones movidas a la pantalla 8 (2026-11-02);
captura de la capa offscreen y lista de `elementos` (2026-11-03);
confirmación con la segunda pulsación (2026-11-07).
