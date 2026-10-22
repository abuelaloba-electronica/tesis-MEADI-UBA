# CLAUDE.md

Repositorio de tesis (MEADI, UBA). Textiles electrónicos sobre el cuerpo que
alimentan visualizaciones generativas en pantalla: cada **dispositivo** es una
placa Arduino con sensores cosidos a una prenda, y cada **entorno digital** es
una página web que lee ese sensor en vivo y dibuja a partir de él.

Toda la documentación y los comentarios de código están **en español**.

## Arquitectura: dos mitades y un contrato

```
dispositivoN/          sketch Arduino  →  imprime líneas de texto por Serial
       ↓ USB (Web Serial API)
entorno-digital/       página HTML     →  parsea esas líneas y dibuja en Canvas 2D
```

El contrato entre las dos mitades es **una línea de texto por lectura**, con
prefijo, terminada en `\n`, a 9600 baudios nominales. Nada más. No hay
protocolo binario, ni handshake, ni librería compartida.

Un dispositivo puede además tener **actuadores propios**, que no pasan por el
contrato: `dispositivo1` enciende una tira de LEDs a partir de la misma lectura
que envía. El navegador no se enteró y no tiene que enterarse.

| Dispositivo | Placa | Sensores / actuadores | Emite | Frecuencia | Lo consume |
|---|---|---|---|---|---|
| `dispositivo1` | Adafruit Flora V3 (ATmega32u4) | LSM6DSO32 por I2C (acelerómetro, ±4 g); tira de 13 LEDs WS2812B en D6 | `A:<x>,<y>,<z>` en g | ~33/s | `entorno-digital/bandada_prototipo_v5a_dispositivo.html` (las v4a/v4b anteriores, archivadas en `prototipos/`) |
| `dispositivo2` | LilyPad Arduino USB (ATmega32u4, 8 MHz) | 2 piezos de guante (A2, A3) + FSR (A4) | `F:<0-1023>` y `G:<dedo>,<pico>` | ~50/s y por golpe | `entorno-digital/prototipo_percusion_guante_a_midi_v2_dispositivo.html` (sonido en Helm; el FSR como disco azul). Las versiones anteriores, archivadas en `prototipos/` |
| `dispositivo3` | LilyPad Arduino USB (ATmega32u4, 8 MHz) | AD8232 en la pantorrilla (A2, leads-off en 2 y 3) | `E:<amplitud MAV>` y `L:<0\|1>` | 50/s y al cambiar | `entorno-digital/prototipo_emg_acumulacion_v4_dispositivo.html` (cuadriláteros superpuestos que cambian de lugar y de color cada 1-5; la v3, la v2 y la fractura v1, en `prototipos/`) |

Las páginas ignoran en silencio cualquier línea que no reconozcan, así que los
sketches pueden seguir imprimiendo diagnósticos legibles para el Monitor Serial
sin romper nada.

## Convenciones

**Páginas web autocontenidas.** Un solo archivo `.html` con su `<style>` y su
`<script>` adentro. Sin dependencias externas, sin build step, sin
`package.json`, sin tests automatizados. Se abren con doble clic (`file://`).
No introducir frameworks, bundlers ni CDNs sin pedirlo explícitamente.

**Un único punto de entrada de datos por página.** La simulación nunca lee el
puerto serie directamente: el lector de Web Serial llama a una función global
(`window.updateAccel(x,y,z)`, `window.feedForce(v01)`, `window.feedPulseBpm(n)`,
`window.feedEMG(v01)`) y esa función es la única frontera. Sirve para probar a
mano desde la consola y permitió que los prototipos existieran antes que el
hardware. Al tocar la física, respetar esa frontera.

**Versionado por copia.** Una variante nueva es un archivo nuevo
(`..._v2.html`, `..._v3.html`, `..._v4a...`), no una reescritura del anterior:
las versiones previas se conservan para poder comparar el comportamiento. Cada
salto de versión deja un `entorno-digital/prototipos/cambios_<tema>_vN.md` que
explica **por qué** cambió cada cosa, no sólo qué cambió.

**Sufijo `_dispositivo`.** `prototipo_x.html` simula el sensor con controles
manuales; `prototipo_x_dispositivo.html` es la misma visualización leyendo el
hardware real por USB. Las versiones simuladas siguen siendo útiles: son la
única forma de trabajar sin la placa en la mano.

**`entorno-digital/prototipos/` es histórico.** Versiones anteriores y
propuestas de visualizaciones cuyo dispositivo todavía no existe. En
`entorno-digital/` queda sólo la versión activa de cada dispositivo. No editar
salvo pedido expreso; el trabajo activo vive en `entorno-digital/`.

**Commits en español, sin tildes** (así está el historial).

## Cómo probar

No hay suite de tests. Tres técnicas, en orden de costo:

1. **Harness de Node para la física** — `entorno-digital/tools/harness.js`.
   Corre la simulación real sin navegador: extrae el `<script>` del HTML, lo
   evalúa con stubs mínimos de DOM y canvas, y maneja el reloj a mano para
   simular minutos en segundos. Mide interceptando `ctx.arc()`. Es lo que
   detectó los tres bugs de comportamiento de la bandada v4 (ver
   `entorno-digital/prototipos/cambios_bandada_v4.md`, sección Validación).

   ```
   node entorno-digital/tools/harness.js entorno-digital/bandada_prototipo_v5a_dispositivo.html --perfil=despertar
   node entorno-digital/tools/harness.js <archivo.html> --segundos=15 --perfil=tiltX --muestreo=1
   ```

   **Comparar siempre contra el perfil de control** antes de llamarle bug a un
   movimiento: la bandada deriva sola por diseño. En v4 el control es
   `gravedad` (mano inmóvil); en v5a es `despertar`, porque v5a arranca
   dormida y con `gravedad` no se mueve nada —eso mide el requisito de
   arranque quieto, no la deriva—. `--caja` apaga el campo continuo de v5a. El
   encabezado del archivo documenta los perfiles y qué mirar en la salida.

   Ojo: `harness.js` es **específico de la bandada** (sólo expone
   `updateAccel`, sus perfiles son de acelerómetro y su DOM falso es mínimo).
   Para las páginas archivadas del guante con Web Audio está su hermano por
   copia `entorno-digital/tools/harness_golpes.js`, que además del costo de dibujo
   verifica el grafo de Web Audio —fugas de nodos, techo de polifonía,
   cuantización de la escala— con un `AudioContext` falso, sin producir sonido.
   Para eso las páginas construyen el `AudioContext` perezosamente dentro de
   `asegurarAudio()`; construirlo en el cuerpo del script rompería el harness.

   ```
   node entorno-digital/tools/harness_golpes.js entorno-digital/prototipos/prototipo_percusion_guante_a_dispositivo.html
   node entorno-digital/tools/harness_golpes.js <archivo.html> --golpes=500 --jitter=0.08
   ```

   Las páginas `_midi_`, incluida la activa, no tienen voz propia (el sonido lo hace Helm, que corre
   en paralelo y recibe los golpes por Web MIDI): para ellas está
   `entorno-digital/tools/harness_midi.js`, que con un `MIDIAccess` falso
   verifica notas colgadas, retrigger, CC del FSR, pánico y el reparto de la
   intensidad en tramos de la escala.

   Para la acumulación EMG está `entorno-digital/tools/harness_emg.js`, que
   en vez de inventar la señal **reproduce una captura del Monitor Serial**
   (las líneas `E:`/`L:` tal cual) por un puerto Web Serial falso, y cuenta
   los cuadriláteros que se habrían estampado. Cada `E:` avanza 20 ms.

   ```
   node entorno-digital/tools/harness_emg.js entorno-digital/prototipo_emg_acumulacion_v4_dispositivo.html dispositivo3/salida.txt
   node entorno-digital/tools/harness_emg.js <archivo.html> <captura.txt> --techo=300 --minDur=0.2 --traza
   ```
2. **Captura headless con Firefox** para confirmar que la página renderiza:
   `firefox --headless --profile <dir-nuevo> --window-size=1280,800
   --screenshot <salida>.png "file:///<ruta>"`. Cuidado: dispara antes del
   primer frame de animación, así que un lienzo vacío no prueba que haya un bug.
3. **Chrome o Edge de escritorio** para todo lo que involucre Web Serial —
   **la API no existe en Firefox ni en Safari**, y ahí el botón de conexión
   queda deshabilitado a propósito. Es también la única forma de *escuchar* las
   páginas del guante: tienen disparo por teclado (`A`/`L` para cada dedo, `F`
   mantenida para el FSR) justamente para poder ajustar el timbre sin la placa.

Verificación de sintaxis rápida: extraer el `<script>` a un `.js` y correr
`node --check`.

## Trampas conocidas

- **El acelerómetro incluye la gravedad.** En reposo, un eje marca ~1.0 g de
  forma permanente. Usar la lectura cruda como si fuera "movimiento" produce un
  empuje constante de fondo; la corrección vive del lado del navegador (filtros
  + referencia de reposo) y, para la tira de LEDs, dentro del propio sketch de
  `dispositivo1`: el brillo sale del módulo de la aceleración **menos** una
  línea de base exponencial, no del módulo crudo. Con el módulo crudo la tira
  quedaría encendida a media asta para siempre.
- **El baudrate es nominal.** En ATmega32u4 el puerto es USB CDC virtual:
  `Serial.begin(9600)` y `baudRate: 9600` tienen que coincidir por formalidad,
  pero no limitan el caudal real.
- **Los umbrales heredados de código de referencia hay que recalibrarlos.** El
  `threshold = 40` del proyecto de Adafruit corresponde a su front-end, no al
  nuestro; lo mismo pasaba con el Pulse Sensor que se descartó, cuyo reposo real
  estaba en ~656 y no en el 512 que asumía el código original.
- **Un piezo sin filtrar no sirve para medir intensidad.** Resuena a 3-6 kHz y
  el loop del 32u4 a 8 MHz muestrea a ~2,7 kHz, o sea por debajo de Nyquist: el
  pico varía ±20-40 % entre golpes idénticos. Y con AREF = 3,3 V satura en 1023.
  La corrección es un divisor RC en la punta del dedo, no muestrear más rápido.
- **Los dos piezos del guante están acoplados mecánicamente.** Golpear un dedo
  excita el piezo del otro; el sketch lo arbitra comparando picos en la misma
  ventana, con un factor que hay que medir con el guante puesto.

## Dónde seguir leyendo

| Para trabajar en… | Leer |
|---|---|
| el acelerómetro, su textil y su tira de LEDs | `dispositivo1/README.md` |
| el guante de percusión y la fuerza | `dispositivo2/README.md` |
| cualquier visualización | `entorno-digital/README.md` |
| la bandada (física, señal, constantes de ajuste) | `entorno-digital/README.md` + `entorno-digital/prototipos/cambios_bandada_v4.md` |
| la bandada v5a (arranque quieto, campo continuo, encuadre) | `entorno-digital/prototipos/cambios_bandada_v5.md` |
| el guante: circuito, audio, variantes | `entorno-digital/documentacion_percusion_guante.md` |
| el guante con Helm por MIDI | `entorno-digital/prototipos/cambios_percusion_guante_midi.md` (y `..._midi_v2.md`, el FSR como disco) |
| la acumulación EMG v3 (cuadriláteros, lector del dispositivo3) | `entorno-digital/prototipos/cambios_emg_acumulacion_v3.md` |
| la acumulación EMG v4 (centro que se muda, familias de color) | `entorno-digital/prototipos/cambios_emg_acumulacion_v4.md` |
| visualizaciones sin hardware todavía (EMG, estiramiento) | `entorno-digital/prototipos/propuesta_*.md` |
