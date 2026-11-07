# Propuesta: grabar el sonido del guante y reproducirlo en la pantalla 11

## Requerimiento

Durante la pantalla 7 (`experiencia/prototipo_percusion_guante_a_midi_v2_experiencia.html`)
el sonido no lo produce la página: la página manda notas y CC1 por Web MIDI y
**Helm** —una aplicación aparte— sintetiza, distorsiona y le agrega delay y
reverb. Se pide:

1. **Grabar** lo que suena mientras se usa el guante.
2. En la pantalla 11 (`composicion.html`), **reproducir** esa grabación y, si
   se puede, **mover elementos de la composición a partir del sonido**.

Todo en Linux. La máquina de trabajo tiene **PipeWire 1.0.5** con la capa de
compatibilidad de PulseAudio (`pactl`, `pw-record`, `pw-link`, `wpctl`
instalados; sin JACK, `pw-jack`, `sox` ni `ffmpeg`). Helm 0.9.0 está instalado
y su `Helm.config` asigna CC1 a `delay_on`, `distortion_on` y `reverb_on`: el
FSR prende efectos con cola, así que el sonido **dura más que el último golpe**.

## El problema de fondo: el sonido no está en el navegador

La página nunca tiene el audio: lo tiene Helm, que lo entrega a PipeWire, que
lo manda a los parlantes. Cualquier grabación tiene que tomar la señal en algún
punto de ese camino. Hay tres lugares posibles, y de eso salen las
alternativas.

## Alternativas para grabar

### A. Grabar desde afuera del navegador (`pw-record`)

Un script de terminal graba la salida de Helm a un `.wav` mientras dura la
pantalla 7:

```
pw-record --target <nodo de Helm o monitor de la salida> guante.wav
```

- A favor: sin pérdida, cero código en las páginas, lo más robusto.
- En contra: el archivo queda en disco y una página abierta por `file://` **no
  lo puede leer sola** (haría falta elegirlo a mano con un `<input type=file>`
  en la 11). No sabe cuándo empieza y termina la pantalla 7, ni cuándo se
  borra con Retroceso: alguien tiene que arrancarlo y pararlo. Y no hay forma
  de alinear el audio con los anillos del dibujo.

### B. Grabar desde la página del guante (`getUserMedia` + `MediaRecorder`)

PipeWire expone la salida de cualquier *sink* como una fuente de captura (el
*monitor*). Chrome en Linux la ve como un micrófono más. La página del guante
abre esa fuente con `getUserMedia`, la graba con `MediaRecorder` (Opus en
WebM) y al pulsar la barra espaciadora guarda el `Blob` en IndexedDB **junto
con la captura**, igual que hoy guarda el PNG y los `elementos`.

- A favor: la grabación sigue exactamente el ciclo de la pantalla: empieza con
  la página, Retroceso la descarta y vuelve a empezar, la barra espaciadora la
  cierra. La pantalla 11 la lee de la misma base, sin que nadie elija
  archivos. Y como la misma página sabe cuándo dispara cada nota, puede
  anotar en cada anillo **en qué momento de la grabación ocurrió**.
- En contra: pide permiso de micrófono (una vez más, como el de MIDI). Hay que
  apagar el procesamiento de voz de Chrome (cancelación de eco, supresión de
  ruido, control de ganancia), que sobre música destroza la señal. Opus es con
  pérdida (a 128 kb/s no se nota; ~1 MB por minuto).

### C. No grabar audio: grabar los eventos MIDI y volver a mandarlos

La página ya conoce cada nota, su velocity y cada valor de CC1. Se guarda esa
partitura con tiempos (unos KB) y en la 11 se le vuelve a mandar a Helm por
Web MIDI.

- A favor: sincronía perfecta con el dibujo, tamaño despreciable, y el sonido
  sale con la calidad de Helm.
- En contra: no es *el sonido que se grabó* sino una nueva ejecución: depende
  de que Helm siga abierto en la pantalla 11, con el mismo patch y el mismo
  puerto. Si alguien tocó una perilla de Helm durante la pantalla 7, eso no
  queda.

### Recomendación: B, guardando además los eventos de C

Se graba el **audio real** (B) y, en el mismo registro, la **lista de eventos**
con sus tiempos (C), que cuesta casi nada. El audio es lo que se escucha en la
11; los eventos son lo que permite que cada anillo sepa cuándo sonó. La
reproducción por MIDI queda descartada como camino principal, pero los eventos
la dejan posible más adelante sin volver a capturar.

A queda como herramienta de operador: un `pw-record` aparte sirve para
archivar una versión sin pérdida de cada sesión para la tesis, en paralelo y
sin tocar las páginas.

## Diseño de la recomendación

### 1 · Ruteo en Linux: un sink propio para Helm

**Se graba sólo lo que produce Helm** (decisión tomada). Por eso no sirve el
monitor de la salida de audio general, que se lleva todo lo que suene en la
máquina (notificaciones, otra pestaña): hace falta un **sink virtual sólo para
Helm**:

```sh
# Sink virtual: lo que entra acá se puede grabar desde su monitor.
pactl load-module module-null-sink sink_name=maedi_helm \
  sink_properties=device.description=MAEDI-Helm
# Fuente "normal" a partir del monitor: Chrome la lista sin ambigüedad.
pactl load-module module-remap-source master=maedi_helm.monitor \
  source_name=maedi_helm_rec source_properties=device.description=MAEDI-Helm-grabacion
```

Helm tiene que sonar **en los parlantes y en el sink a la vez**. Hay dos
formas:

- **Duplicar la salida de Helm con `pw-link`** (recomendada): Helm sigue
  saliendo directo a la placa de audio, y además sus puertos se enlazan a
  `maedi_helm`. No agrega latencia a lo que oye la persona, que es lo que
  importa en un instrumento de percusión.

  ```sh
  pw-link -o | grep -i helm          # ver los nombres reales de los puertos
  pw-link "<puerto FL de Helm>" maedi_helm:playback_FL
  pw-link "<puerto FR de Helm>" maedi_helm:playback_FR
  ```

- Mandar Helm sólo a `maedi_helm` y un `module-loopback` del monitor a los
  parlantes. Es más fácil de entender, pero el loopback suma latencia (hay que
  bajarla con `latency_msec=20`) y se va a notar en los golpes.

Los enlaces de `pw-link` no sobreviven a reiniciar Helm, así que todo esto va
en un script `entorno-digital/tools/audio_helm.sh` que el operador corre una
vez, con Helm abierto, antes de la sesión. Verificación sin el navegador:

```sh
pw-record --target maedi_helm_rec prueba.wav   # tocar A/L/F en la página, Ctrl+C
```

Helm no tiene JACK en esta máquina (no hay `pw-jack`): sale por ALSA, y
PipeWire lo muestra como un flujo más (`wpctl status`).

### 2 · Grabación en la página del guante

Todo en la copia `_experiencia` (la página activa no graba nada):

- **Permiso y fuente.** Al conectar el dispositivo, después del permiso MIDI
  (el mismo encadenamiento de hoy, para no superponer avisos), se pide
  `getUserMedia({ audio: { deviceId, echoCancellation: false,
  noiseSuppression: false, autoGainControl: false, channelCount: 2 } })`. La
  única fuente aceptada es `MAEDI-Helm-grabacion`, buscada por nombre: no hay
  selector ni respaldo. Si no aparece (no se corrió `audio_helm.sh`) o no hay
  permiso, la página funciona igual, la captura sale sin sonido y el panel
  lo dice.
- **Nunca un micrófono.** Un monitor es la copia digital de lo que se manda a
  un sink: no pasa por ningún micrófono, así que no graba la sala ni las
  conversaciones. El riesgo es que la página termine abriendo el micrófono
  por error, y se evita así: el `deviceId` se pide con `{ exact: … }` (con un
  pedido simple, si la fuente no está, Chrome cae al micrófono por defecto
  sin avisar), y si la fuente de Helm no aparece **no se graba**, en vez de
  grabar lo que haya.
- **Cuándo graba.** Arranca con el primer golpe o la primera presión (no al
  cargar: el silencio de antes de empezar no sirve). Retroceso descarta la
  grabación junto con el lienzo, y la próxima vuelve a empezar en el próximo
  golpe: el sonido corresponde siempre a lo que está dibujado.
- **Tope de 15 minutos** (`GRABACION_MAX_MS`). Pasado el tope se cierra la
  grabación y se sigue dibujando; lo que se estampe después queda sin `t`.
- **La cola.** Al pulsar la barra espaciadora, `congelar()` ya silencia Helm y
  manda CC1 a 0, pero el delay y la reverb siguen sonando un rato. La
  grabación se detiene `COLA_MS` después (unos 2 s, a ajustar a oído con el
  patch). El aviso "Capturando la composición…" ya cubre esa espera, y → ya
  está bloqueado hasta que la captura termine de guardarse.
- **Tiempos.** `t0` es el `performance.now()` del evento `start` del
  `MediaRecorder`. Cada nota, cada CC1 y cada elemento estampado anota
  `t = performance.now() − t0` en ms:
  - `anillo`: `t` del golpe;
  - `disco`: `t0` y `t1` de la presión (de cruzar `FSR_ON` a bajar de
    `FSR_OFF`).
- **Registro.** La captura del guante pasa a `version: 2` y suma un campo:

  ```js
  sonido: {
    audio: Blob,            // audio/webm;codecs=opus
    duracion: 183.4,        // s, medida por la página (el WebM de Chrome no la trae)
    eventos: [              // en orden; t en ms desde el inicio de la grabación
      { t: 812, tipo: "nota", nota: 52, vel: 91, dedo: 0 },
      { t: 1430, tipo: "cc", valor: 64 },
      ...
    ],
    latenciaMs: 0           // corrimiento medido entre evento y sonido (ver abajo)
  }
  ```

  Va dentro del registro `"guante"` y no en una clave aparte: se guarda en la
  misma transacción que la imagen, e Inicio lo borra con el resto sin cambios.
- **Latencia.** El sonido llega a la grabación algunas decenas de ms después
  del evento (búfer de Helm + ciclo de PipeWire). Se mide una vez: golpe
  aislado, se busca el ataque en la grabación, se anota la diferencia. Para que
  un pulso visual coincida con el golpe a la vista alcanza con ±30 ms.

### 3 · La pantalla 11 en dos modos: edición y composición final

La 11 sigue el mismo ritmo que las pantallas de los dispositivos: primero se
hace, después se cierra.

| | Modo edición (al entrar) | Modo final |
|---|---|---|
| Qué se ve | todos los elementos, como hoy | la composición tal como quedó |
| Qué se puede hacer | mover, agrandar, copiar y pegar, eliminar, deshacer | mirar y escuchar |
| Sonido | ninguno | la grabación del guante, en loop |
| Movimiento | sólo el que hace la persona | el que produce el sonido |
| Marcas de edición | recuadros, tirador, marco | ninguna |

- **Pasar al modo final con la barra espaciadora pulsada dos veces**, igual
  que en las pantallas 5, 7 y 9. La primera pulsación muestra el aviso
  "¿Finalizar la composición?"; la segunda, antes de 4 s, confirma. Si no se
  confirma, o se pulsa Esc o la X del aviso, se sigue editando. Igual que
  allá, es **definitivo**: la edición termina y no se vuelve a ella. Ojo: en
  la 11 Esc ya deselecciona; con el aviso a la vista, Esc sólo cancela la
  confirmación.
- **Al finalizar se guarda la composición editada** en IndexedDB (clave
  `"composicion"`, la que ya prevé la etapa 5 del editor). Si la página se
  recarga, vuelve directo al modo final con esa composición, en lugar de
  reconstruir la escena desde las capturas. Inicio la borra con todo lo
  demás.
- **El sonido arranca solo, en el mismo instante.** Chrome no deja sonar
  audio en una página sin un gesto de la persona; la barra espaciadora es ese
  gesto (la segunda pulsación, la que confirma), así que el `AudioContext`
  se crea y arranca dentro de su manejador.
  No hace falta una tecla de reproducir, ni hay pausa: la composición final
  suena y se mueve mientras está en pantalla.
- **En el modo final no se edita nada**: ni clics, ni rueda, ni teclas de
  edición. Quedan ← (volver a la 10) e Inicio (operador). La tecla V de
  diagnóstico también se desactiva: comparar con los PNG es una herramienta
  del modo edición.
- Sin sonido grabado (no se capturó el guante, o la captura es anterior a la
  `version: 2`), el modo final existe igual: muestra la composición quieta.

- **Web Audio sólo para reproducir y medir**, nunca para sintetizar: el `Blob`
  se decodifica con `decodeAudioData` a un `AudioBuffer` (así la duración y el
  tiempo son exactos, cosa que un `<audio>` con WebM de Chrome no garantiza) y
  suena por un `AudioBufferSourceNode` → `AnalyserNode` → salida. El reloj de
  la animación es `audioCtx.currentTime`, no el de `requestAnimationFrame`.
- **En loop.** Al terminar, la grabación vuelve a empezar sola
  (`source.loop = true`), y con ella la animación: el reloj es
  `currentTime` módulo la duración, así que cada vuelta los anillos vuelven a
  golpear en su momento. Al empezar cada vuelta los discos vuelven a su
  estado inicial antes de inflarse de nuevo. La costura no hace ruido: la
  grabación termina en la cola de la reverb, que ya decae a silencio, y
  arranca con el primer golpe; si el salto se notara, un fundido de ~50 ms en
  los dos extremos lo resuelve.
- **Por dónde sale.** En la 11 Helm ya no recibe nada, así que la reproducción
  puede salir por la salida normal; si Helm siguiera conectado a los
  parlantes, no se superponen porque está en silencio.

### 4 · Mover elementos con el sonido

**Principio:** la animación es una **capa visual**, no una edición. Cada
cuadro calcula, para cada elemento, un desplazamiento, una escala o un alpha
**extra** que se aplica en `dibujarElemento()` encima de su `x`, `y` y
`escala`, sin escribirlos. Así:

- no modifica la composición que se guardó al finalizar: lo que se mueve es
  la imagen en pantalla, no los datos;
- lo que la persona movió o agrandó se anima **desde donde lo dejó**;
- **una copia pegada de un anillo conserva su `t`** (es dato del elemento, y
  `copiaProfunda` lo arrastra): suena como un eco del golpe original. Es un
  efecto que sale gratis del modelo y tiene sentido en la obra.

Como sonido y edición nunca conviven (el sonido empieza recién en el modo
final), no hay que resolver qué pasa si alguien hace clic sobre un elemento
que se está moviendo.

Dos fuentes de movimiento, con alcances distintos:

**a) Por eventos — los elementos del guante** (lo principal). Cada elemento
sabe cuándo nació:

| Tipo | Animación cuando la reproducción pasa por su momento |
|---|---|
| `anillo` | se re-golpea: escala 1 → 1,25 → 1 en ~200 ms, con el mismo anillo de impacto que se expande y se desvanece en la página del guante (`ANILLO_DUR`) |
| `disco` | entre `t0` y `t1` se infla siguiendo la curva de CC1 grabada, hasta su tamaño estampado, y queda |

Es la correspondencia más fuerte posible: la composición **vuelve a contar su
propia historia** al ritmo en que se hizo, y cada anillo se ilumina en el
instante exacto en que se escuchó su nota.

**b) Por análisis del audio — los demás elementos.** Los puntos de la bandada
y los cuadriláteros de la EMG no tienen relación con el sonido; el
`AnalyserNode` les da una, a partir de lo que suena de verdad (incluidas la
distorsión y la reverb, que ningún evento describe):

- **envolvente** (RMS suavizado): la bandada se abre y se cierra respecto de su
  centro, unos pocos px, como un sobresalto en cada golpe;
- **energía grave** (FFT, < 250 Hz): los cuadriláteros respiran, escala
  1 → 1,05;
- **energía aguda**: un temblor mínimo en la posición de los puntos.

Las bandas y las ganancias van en una tabla, como los permisos:
`REACCIONES = { punto: […], cuadrilatero: […], anillo: […], disco: […] }`.
El código de dibujo no pregunta por tipos: pregunta qué reacción tiene el
elemento. Un tipo nuevo, o un elemento al que no se quiera animar, es una fila.

Captura sin sonido (o anterior a la `version: 2`): el modo final muestra la
composición quieta.

### 5 · Probar sin el hardware

- `composicion.html#demo` agrega un sonido sintético: un `OfflineAudioContext`
  genera un clic filtrado en el `t` de cada anillo de la demo y una
  envolvente en cada disco. Con eso se ajustan las reacciones sin guante ni
  Helm.
- En la página del guante, las teclas `A`, `L` y `F` ya pasan por la misma
  frontera y por Helm: graban igual que el guante real.
- `harness_midi.js` puede verificar, con un `MediaRecorder` falso, que cada
  `anillo` y cada `disco` de los `elementos` tiene su `t` y su evento
  correspondiente, que Retroceso reinicia la grabación y que el registro no se
  guarda antes de la cola.

## Etapas

Cada una se puede probar sola:

1. **Ruteo de audio**: `tools/audio_helm.sh` y verificación con `pw-record`.
   No toca ninguna página.
2. **Grabación en la página del guante**: permiso, fuente, `MediaRecorder`,
   cola, `t` en los elementos, eventos, registro `version: 2`.
3. **Modo final en la 11**, sin animación: la barra espaciadora cierra la
   edición, guarda la composición y arranca el sonido en loop; `#demo` con
   sonido sintético.
4. **Reacciones por eventos** (anillos y discos).
5. **Reacciones por análisis** (bandada y EMG), con la tabla `REACCIONES`.
6. Opcional: **exportar un video** de la composición animada con su sonido
   (`canvas.captureStream()` + la pista de audio en un `MediaRecorder`) —el
   equivalente en movimiento del PNG que exporta la etapa 5 del editor.

Cada salto deja su `cambios_experiencia_sonido_vN.md`, y el texto nuevo de las
pantallas (la barra espaciadora en la 11, el permiso de audio en la 7) entra
primero al guion.

## Decisiones tomadas

- **Sólo se graba lo que produce Helm.** La única fuente es el sink propio
  (`MAEDI-Helm-grabacion`); no se usa el monitor general, ni un selector, ni
  un respaldo. Sin esa fuente, no se graba.
- **Permiso en la sala.** Como la página sólo pide la fuente de Helm, por
  `deviceId` exacto, se puede abrir Chrome con
  `--use-fake-ui-for-media-stream` para que no aparezca el aviso de
  "micrófono" en cada carga. Ese flag concede cualquier pedido de audio a
  cualquier página, así que va en un perfil de Chrome dedicado a la
  instalación (`--user-data-dir=…`), no en el de uso diario.
- **Reproducción en loop** en la pantalla 11, con la animación siguiendo
  cada vuelta.
- **Confirmar antes de finalizar, en todas las pantallas.** La barra
  espaciadora se pulsa dos veces: la primera muestra el aviso, la segunda
  (antes de 4 s, y sin contar la repetición de la tecla mantenida) confirma.
  Ya está hecho en las tres copias `_experiencia`; en la 11 entra con el modo
  final. El guion dice ahora "pulsando dos veces la barra espaciadora".
- **Tope de grabación: 15 minutos.** Pasado el tope se deja de grabar pero se
  sigue dibujando; los anillos y discos de después quedan sin `t` y no se
  animan. Con ~1 MB por minuto, la grabación pesa 15 MB como mucho. El loop y
  el tope son cosas distintas: el loop dice qué pasa cuando termina la
  reproducción, el tope cuánto se graba.
- **Primero se edita, después se escucha.** La 11 tiene dos modos: al entrar
  se edita sin sonido, como hoy; la barra espaciadora cierra la edición
  (definitivo) y pasa al modo final, donde la composición suena y se mueve.
  Con eso el sonido **muestra** la composición y no la cambia: lo que se
  mueve en el modo final es la imagen, no los datos guardados. Una operación
  como "ordenar en el tiempo" (los anillos ubicados según cuándo sonaron)
  sigue siendo posible más adelante, pero como una herramienta más del modo
  edición.
