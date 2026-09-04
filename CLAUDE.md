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

| Dispositivo | Placa | Sensores | Emite | Frecuencia | Lo consume |
|---|---|---|---|---|---|
| `dispositivo1` | Adafruit Flora V3 (ATmega32u4) | LSM6DSO32 por I2C (acelerómetro, ±4 g) | `A:<x>,<y>,<z>` en g | ~33/s | `entorno-digital/bandada_prototipo_v4a/v4b_dispositivo.html` |
| `dispositivo2` | LilyPad Arduino USB (ATmega32u4, 8 MHz) | Pulse Sensor Amped (A5) + FSR (A4) | `F:<0-1023>` y `BPM: <n>` | ~33/s y por latido | `entorno-digital/prototipo_circulos_fuerza_pulso_dispositivo.html` |
| `dispositivo3` | — | — | — | — | carpeta vacía, reservada |

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
propuestas de visualizaciones cuyo dispositivo todavía no existe. No editar
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
   node entorno-digital/tools/harness.js entorno-digital/bandada_prototipo_v4a_dispositivo.html
   node entorno-digital/tools/harness.js <archivo.html> --segundos=15 --perfil=tiltX --muestreo=1
   ```

   **Comparar siempre contra el perfil `gravedad`** (mano inmóvil) antes de
   llamarle bug a un movimiento: la bandada deriva sola por diseño. El
   encabezado del archivo documenta los perfiles y qué mirar en la salida.
2. **Captura headless con Firefox** para confirmar que la página renderiza:
   `firefox --headless --profile <dir-nuevo> --window-size=1280,800
   --screenshot <salida>.png "file:///<ruta>"`. Cuidado: dispara antes del
   primer frame de animación, así que un lienzo vacío no prueba que haya un bug.
3. **Chrome o Edge de escritorio** para todo lo que involucre Web Serial —
   **la API no existe en Firefox ni en Safari**, y ahí el botón de conexión
   queda deshabilitado a propósito.

Verificación de sintaxis rápida: extraer el `<script>` a un `.js` y correr
`node --check`.

## Trampas conocidas

- **El acelerómetro incluye la gravedad.** En reposo, un eje marca ~1.0 g de
  forma permanente. Usar la lectura cruda como si fuera "movimiento" produce un
  empuje constante de fondo; la corrección vive del lado del navegador (filtros
  + referencia de reposo), no en el sketch.
- **El baudrate es nominal.** En ATmega32u4 el puerto es USB CDC virtual:
  `Serial.begin(9600)` y `baudRate: 9600` tienen que coincidir por formalidad,
  pero no limitan el caudal real.
- **Las lecturas de reposo de los sensores analógicos no están centradas.** El
  Pulse Sensor de `dispositivo2` descansa en ~656, no en 512; los umbrales fijos
  heredados de código de referencia hay que calibrarlos contra el sensor real.

## Dónde seguir leyendo

| Para trabajar en… | Leer |
|---|---|
| el acelerómetro y su textil | `dispositivo1/README.md` |
| el pulso y la fuerza | `dispositivo2/README.md` |
| cualquier visualización | `entorno-digital/README.md` |
| la bandada (física, señal, constantes de ajuste) | `entorno-digital/README.md` + `entorno-digital/prototipos/cambios_bandada_v4.md` |
| los círculos de fuerza + pulso | `entorno-digital/documentacion_circulos_fuerza_pulso_dispositivo.md` |
| visualizaciones sin hardware todavía (EMG, estiramiento) | `entorno-digital/prototipos/propuesta_*.md` |
