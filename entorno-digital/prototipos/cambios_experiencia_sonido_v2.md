# Cambios: modo final de la pantalla 11 y el sonido en loop (etapa 3)

Etapa 3 de `propuesta_sonido_composicion.md`: `experiencia/composicion.html`
pasa a tener dos modos. Al entrar se edita en silencio, como hasta ahora. La
barra espaciadora pulsada dos veces cierra la edición: la composición queda
como se dejó, se guarda, y suena en loop la grabación del guante (etapa 2,
`cambios_experiencia_sonido_v1.md`). Todavía no se mueve nada con el sonido:
eso es la etapa 4.

El texto nuevo entró primero al guion (pantalla 11).

## Qué cambió y por qué

### Los tiempos llegan a la escena

`convertirElemento` copia `t` (anillos) y `t0`/`t1` (discos) del registro de
captura al elemento de escena, en un campo `tiempos`. No pasa por
`desdeCaptura` de cada tipo porque los tiempos no son geometría ni aspecto:
son datos de cuándo sonó el elemento, y valen igual para cualquier tipo. Así
`TIPOS` no se entera, y un tipo nuevo que quiera sonar no necesita código
propio para eso.

- Un valor roto (no numérico, negativo) se descarta; `t0` y `t1` sólo van
  juntos y con `t1 >= t0`. La página del guante ya quita los tiempos cuando
  no hubo audio, así que acá sólo hay que defenderse de datos rotos.
- Ninguna operación los toca, y `copiaProfunda` los arrastra: **una copia
  pegada de un anillo conserva su `t`** y, cuando haya animación, sonará como
  un eco de su original, como prevé la propuesta.
- Los tiempos se guardan tal cual, sin sumar `latenciaMs`: la corrección
  entre evento y sonido es cosa de la animación (etapa 4).

### La barra espaciadora pulsada dos veces, como en 5, 7 y 9

El aviso es el mismo de las pantallas de los dispositivos (mismo CSS, mismo
plazo `CONFIRMAR_MS` de 4 s, la repetición de la tecla mantenida no cuenta).
Texto: "¿Finalizar la composición?" y "Pulsa otra vez la barra espaciadora
para confirmar. Es definitivo: después ya no se puede seguir editando."

- **Esc, con el aviso a la vista, sólo cancela**: no deselecciona. Era la
  ambigüedad que señalaba la propuesta.
- **Cualquier edición en el medio cancela el aviso** (una tecla que no sea
  modificadora, un clic, la rueda sobre una selección). El aviso pregunta por
  la composición tal como estaba cuando se pidió; si se siguió editando,
  confirmar tiene que volver a pedirse. Las pantallas de los dispositivos
  hacen lo mismo con Retroceso.
- No se puede finalizar en medio de un arrastre (el gesto quedaría a medio
  aplicar) ni sin capturas.
- Al confirmar, si se estaban viendo los PNG (V), se vuelve a la escena en
  vector: lo que se finaliza es la escena.

### El modo final

- No se edita nada: el puntero, la rueda y las teclas de edición no hacen
  nada, y V tampoco. Quedan ← (vuelve a la 10) e Inicio (borra todo).
- Se borran la selección y el portapapeles, y con ellos las marcas de
  edición. `pintar()` además no las dibuja en este modo, aunque hubiera algo.
- El pie conserva "11 / 11 · ←" y, sólo si hace falta, por qué no suena:
  "sin sonido: …" o "sonido en pausa: pulsa una tecla o haz clic".

### La composición se guarda en `"composicion"`

Al confirmar se escribe en el mismo almacén de las capturas, con la clave que
ya preveía `propuesta_composicion_editable.md`:

```js
{ version: 1, ancho, alto, elementos, fuentes: { emg, guante, bandada }, fecha }
```

`elementos` son los de la escena tal cual, con sus `tiempos`; `fuentes`, la
`fecha` de cada captura usada. Inicio hace `clear()` del almacén, así que la
borra sin cambios.

Al cargar, si hay composición guardada **y sus `fuentes` coinciden con las
capturas actuales**, la página vuelve directo al modo final con esa escena,
sin reconstruirla. Si alguna captura cambió (se volvió a la pantalla 9 y se
capturó de nuevo, por ejemplo), es otro recorrido: la guardada se ignora, se
reconstruye la escena y se vuelve a editar. Sin esta comprobación, el sonido
de una captura nueva sonaría con los tiempos de la anterior.

← e Inicio esperan a que termine la escritura: navegar con la transacción en
curso podía perderla, y borrar en el medio podía dejarla escrita después del
`clear()`. Si la escritura falla, el modo final sigue igual y el pie lo dice.

La demo no escribe la base, como antes: su modo final dura hasta recargar.

### El sonido: preparado al cargar, arrancado en el gesto

- El `Blob` de la grabación se decodifica **al cargar**, en un
  `OfflineAudioContext` (48 kHz), que no necesita gesto. Así, al confirmar,
  el sonido arranca en el acto. Decodificar a un `AudioBuffer`, y no usar un
  `<audio>`, es lo que da una duración exacta: el WebM de Chrome no la trae.
  Probado en Brave: el WebM/Opus de `MediaRecorder` se decodifica así sin
  problema.
- El `AudioContext` de verdad se crea recién **dentro del manejador de la
  segunda barra espaciadora**, que es el gesto que el navegador exige para
  dejar sonar audio. Se crea antes que todo lo demás de `finalizar()`.
- Grafo: `AudioBufferSourceNode` (`loop = true`) → `AnalyserNode` → salida.
  El analizador todavía no se lee: está para la etapa 5.
- **El reloj** de la reproducción es `relojSonido()`: `currentTime` desde el
  arranque, módulo la duración del buffer. Con `loop` la vuelta dura
  exactamente `buffer.duration`, así que el módulo no se desfasa nunca. Se usa
  la duración del buffer decodificado y no `sonido.duracion` (la que midió la
  página del guante), porque es la del loop que suena de verdad; pueden
  diferir en unos ms.
- **La costura del loop**: un fundido de 5 ms al principio y de 50 ms al
  final, aplicados al buffer. La grabación termina en la cola de la reverb y
  empieza con el primer golpe, así que el salto casi no existe, pero una
  muestra distinta de cero en el borde suena como un clic. El fundido del
  principio es mínimo para no ablandar el primer golpe (que además llega a la
  grabación unas decenas de ms después de `t = 0`).
- Sin grabación (sin captura del guante, versión 1 o `sonido: null`) el modo
  final existe igual y queda quieto; el `AudioContext` se cierra.

### Recargar en el modo final

Al recargar no hay gesto, y en `file://` Brave no deja arrancar un
`AudioContext` creado sin gesto (lo dice la consola: "The AudioContext was
not allowed to start"). El contexto queda en pausa, con la reproducción ya
programada; la primera tecla o clic lo reanuda, y el pie lo avisa mientras
tanto. Es un caso de operador (en el recorrido normal se llega por →, y la
barra espaciadora que confirma es el gesto). Si se quisiera que sonara solo
también al recargar, el perfil de la sala puede abrirse con
`--autoplay-policy=no-user-gesture-required`.

### La demo suena

`composicion.html#demo` agrega al guante sintético lo que anotaría la página
del guante: un `t` por anillo (uno cada ~0,5 s), `t0`/`t1` en el disco (de
2,4 s a 4,2 s), la lista de eventos (notas y la rampa de CC1) y la duración
(último evento más 2 s de cola). Los tiempos no salen del generador al azar,
así que la escena de la demo es la misma de antes.

El sonido se sintetiza **a partir de los eventos**, en un
`OfflineAudioContext`, como si los hubiera tocado Helm: cada nota es un clic
de ruido filtrado (más agudo para el dedo 1, con la velocity como volumen) y
los CC del FSR suben y bajan un zumbido grave. Partir de los eventos y no de
los elementos es lo que hace que la demo pruebe el mismo camino que una
captura real: la única diferencia es de dónde sale el `AudioBuffer`.

### Diagnóstico

`window.__sonido()` devuelve `{ etapa, estado, reloj, duracion, motivo }`,
para mirar desde la consola en qué modo está la página y por dónde va la
reproducción.

## Lo que falta

- **Etapa 4**: animar anillos y discos con `relojSonido()` y sus `tiempos`
  (más `latenciaMs`, cuando esté medida).
- **Memoria**: una grabación de 15 minutos (el tope) decodificada en estéreo
  a 48 kHz ocupa unos 350 MB de `Float32Array`. Una sesión típica, de pocos
  minutos, está muy por debajo; si una sesión larga trajera problemas, se
  puede decodificar a mono.

## Validación

Sin harness en `tools/` todavía: una prueba en Node, con DOM, IndexedDB,
`OfflineAudioContext` y `AudioContext` falsos, cargando la página varias
veces sobre la misma base, verificó:

- los tiempos llegan a la escena (y no los rotos, ni `t0` sin `t1`); una copia
  pegada conserva su `t`;
- la confirmación: Esc, la X, el plazo de 4 s, otra tecla y un clic la
  cancelan; Esc no deselecciona; la tecla mantenida no confirma;
- la grabación se decodifica al cargar y el `AudioContext` se crea dentro del
  gesto que confirma; suena en loop, por el analizador, con los fundidos; el
  reloj es `currentTime` módulo la duración;
- la composición se guarda con sus `fuentes` y sus tiempos; en el modo final
  no se borra, ni se pega, ni se deshace, ni se arrastra;
- al recargar vuelve directo al modo final con la escena editada y el sonido
  en pausa hasta la primera tecla; si cambió una captura, vuelve a la
  edición con la escena reconstruida;
- sin sonido, el modo final queda quieto y el pie lo dice; ← espera a que se
  termine de guardar;
- la demo: tiempos en sus 12 anillos y su disco, un clic sintetizado por
  nota, loop de 7,72 s y ninguna escritura en la base.

En Brave (headless): la página `#demo` carga sin errores y sintetiza su
sonido (7,72 s, pico 0,44), y el WebM/Opus de `MediaRecorder` se decodifica
en el `OfflineAudioContext`. Falta escucharlo en la sala con una captura
real del guante.
