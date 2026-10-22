# Cambios de la acumulación EMG → v4: el centro se muda y cambia de color

Archivo: [`../prototipo_emg_acumulacion_v4_dispositivo.html`](../prototipo_emg_acumulacion_v4_dispositivo.html).
Parte de [`prototipo_emg_acumulacion_v3_dispositivo.html`](prototipo_emg_acumulacion_v3_dispositivo.html)
(se conserva sin cambios, ver [`cambios_emg_acumulacion_v3.md`](cambios_emg_acumulacion_v3.md)).

Todo lo que resuelve la señal queda igual que en la v3 ya calibrada:
`window.feedEMG(v01)` como única frontera, el reposo estimado en vivo, el
asentamiento al reconectar, el cierre de la contracción al soltarse el
electrodo y los umbrales. Cambia sólo dónde y de qué color se dibuja.

## 1 · El centro deja de estar fijo

En la v3 todos los cuadriláteros salían del mismo rectángulo invisible
centrado, así que la composición era siempre un único abanico en el medio. En
la v4 el centro **se muda cada 1 a 5 cuadriláteros** (un entero al azar en
[`POR_UBICACION_MIN`, `POR_UBICACION_MAX`], sorteado de nuevo en cada mudanza).
La sesión deja así varios abanicos repartidos por la pantalla, y cuántos hay
dice cuánto se trabajó. Un primer borrador mudaba cada 3 a 5; con 1 como
mínimo aparecen también cuadriláteros sueltos, y la composición es menos
regular.

- **Arranca en el centro**, con la familia cálida de la v3: la primera
  ubicación es la misma composición de antes.
- La mudanza ocurre **después** de estampar el cuadrilátero que completa el
  grupo; el siguiente ya cae en el lugar nuevo.
- Cada ubicación nueva queda a una distancia mínima de la anterior
  (`DIST_MIN`, en unidades de zona): sin eso, un sorteo podía caer casi encima
  del previo y el cambio no se notaba.
- "Limpiar lienzo" vuelve al centro y a la familia cálida.

## 2 · Rectángulo más chico y el centro en cualquier punto del viewport

El rectángulo baja de 75 % a **50 %** del alto (`ALTO_FRAC`): a 75 % un solo
abanico tapaba casi todo el alto y los demás quedaban encimados.

El centro puede caer **en cualquier punto del viewport, incluso pegado al
borde**, y ahí los cuadriláteros se salen en parte. Un primer borrador lo
limitaba a la zona donde el rectángulo sin rotar entraba entero (con un 5 % de
aire), para que casi nada se saliera; se quitó porque dejaba los abanicos
agrupados en el centro y los bordes siempre vacíos. Que se corten contra el
borde es parte de la composición.

Cada cuadrilátero guarda su centro en **unidades de zona** (−1…1 en cada eje,
o sea de borde a borde del viewport), no en píxeles: al cambiar el tamaño de
la ventana la capa se reconstruye y todos quedan en la misma posición
relativa.

## 3 · Familias de color en vez de una paleta única

Cada ubicación usa un **color base**, que es una familia de tonos de un mismo
matiz, ordenados de suave a intenso. Dentro de la familia la intensidad media
de la contracción sigue eligiendo el tono, igual que en la v3 (y sigue sin
repetir el tono del cuadrilátero anterior), así que la lectura de intensidad
se conserva; lo que cambia con la mudanza es el matiz.

Son cinco, en `FAMILIAS`: la **cálida** de la v3 (rosa → bordó, la del
arranque), **azul**, **verde**, **violeta** y **turquesa**. Se configuran
editando ese arreglo: se pueden agregar, quitar o reordenar familias, y cada
una puede tener cualquier cantidad de tonos (2 o más). La primera es siempre
la del arranque.

El sorteo es una **bolsa mezclada**: se usan todas las familias antes de
repetir alguna, y nunca la misma dos veces seguidas, tampoco al rellenar la
bolsa (si la mezcla nueva empieza con la que está en uso, se intercambia con
la última). La familia del arranque cuenta como ya usada en la primera ronda.

El nombre de la familia aparece al final de "Último" en el recuadro de
estadísticas, y por lo tanto en la salida de `harness_emg.js`.

## Validación

- `node --check` del `<script>` extraído.
- `harness_emg.js` con `dispositivo3/salida.txt`: **13 cuadriláteros y 3
  descartados**, lo mismo que la v3 (la detección no cambió). En una corrida
  los grupos salieron de 4, 2, 5 y 2: cálida → verde → violeta → azul.
- La misma captura repetida 25 veces (~13 min, 277 cuadriláteros, 89
  ubicaciones): hay grupos de 1, 2, 3, 4 y 5 (20, 14, 14, 18 y 23), ninguna
  familia se repite seguida y cada ronda de cinco usa las cinco.
- Captura headless con Firefox de una copia que siembra 40 cuadriláteros al
  cargar: abanicos de colores distintos repartidos por todo el viewport,
  algunos cortados contra el borde, y cuadriláteros sueltos.
- **Pendiente:** verlo con la placa en Chrome/Edge y decidir si 1-5 por
  ubicación y el 50 % de alto dan la densidad buscada en una sesión real.
