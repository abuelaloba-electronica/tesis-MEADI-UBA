# Análisis: `dispositivo3` sin cable, con un Bluefruit LE SPI Friend

Documento de viabilidad. **No modifica el sketch ni las páginas**: analiza qué
haría falta para que `dispositivo3` (AD8232 en la pantorrilla, sobre LilyPad
Arduino USB) mande sus lecturas por Bluetooth a una notebook con Linux Mint, en
lugar de depender del cable USB.

Referencias: [guía del módulo](https://learn.adafruit.com/introducing-the-adafruit-bluefruit-spi-breakout?view=all)
y su [sección de pinouts](https://learn.adafruit.com/introducing-the-adafruit-bluefruit-spi-breakout/pinouts?view=all).

## Veredicto

**Sí es viable**, con tres condiciones que conviene tener claras antes de
comprar nada:

1. Los pines **entran justo**: el módulo necesita 5 o 6 pads y quedan
   exactamente 6 libres. Y hay que usarlo con **SPI por software (bitbang)**,
   porque la LilyPad Arduino USB no expone los pines de SPI por hardware en sus
   pads cosibles.
2. Ese bitbang **bloquea el muestreo**, así que hay que cambiar cómo se emiten
   las líneas: juntarlas en tandas de ~100 ms en vez de mandar una cada 20 ms.
   El contrato del repositorio (una línea de texto por lectura, terminada en
   `\n`) **se conserva igual**; lo que cambia es la granularidad del transporte.
3. La página **deja de abrirse con doble clic**. Web Bluetooth, a diferencia de
   Web Serial, exige que el HTML se sirva desde `https://` o `localhost`, y en
   Linux Chrome la mantiene detrás de un flag.

Lo que se gana no es sólo comodidad: sacar el USB **también mejora la señal**
(ver [Alimentación](#alimentación)).

Y una aclaración que ahorra una tarde de pruebas: **el Bluefruit es BLE, no
Bluetooth clásico.** No implementa el perfil SPP, así que **no aparece ningún
`/dev/rfcomm0`** y no hay forma de que la página siga usando Web Serial tal
como está hoy. El transporte cambia por fuerza; la única pregunta es por dónde.

## El módulo

| | |
|---|---|
| Chip | nRF51822, ARM Cortex-M0 a 16 MHz, 256 KB flash, 32 KB SRAM |
| Transporte al micro | SPI a 4 MHz + un pin de IRQ (5 pines, 6 con reset) |
| `VIN` | 3,3–16 V, regulado a bordo a 3,3 V. Alimentarlo con los 3,3 V de la LilyPad está dentro de especificación (es el mínimo) |
| `3V3O` | Salida del regulador, hasta 250 mA. No se usa en este diseño |
| Entradas | Tolerantes a 5 V; con la LilyPad a 3,3 V no hace falta adaptar niveles |
| `IRQ` | El nRF51 avisa que tiene datos para el micro y hay que iniciar una transacción SPI |
| `RST` | Reset. El breakout lo tiene en alto por su cuenta: es opcional |
| `DFU` | Actualización de firmware / reset de fábrica manteniéndolo bajo >5 s |

Del lado del aire expone el **servicio UART de Nordic** (NUS), que es
transparente: lo que el sketch escribe sale por una característica de
notificación y lo que el host escribe entra por otra.

| UUID | Qué es |
|---|---|
| `6e400001-b5a3-f393-e0a9-e50e24dcca9e` | El servicio |
| `6e400003-b5a3-f393-e0a9-e50e24dcca9e` | TX: placa → host, por **notificaciones**. Es la que nos interesa |
| `6e400002-b5a3-f393-e0a9-e50e24dcca9e` | RX: host → placa, por escritura. No la usamos (por ahora) |

Cada notificación lleva como máximo **20 bytes útiles** con el MTU por defecto.
Una línea `E:123\n` son 6 bytes, así que entran tres o cuatro por paquete.

## Conexionado

El AD8232 ocupa `A2` (OUTPUT), `2` (`LO+`) y `3` (`LO-`). El README declara
libres `9, 10, 11, A3, A4, A5` — seis pads, que es exactamente lo que el módulo
pide.

| Bluefruit | LilyPad USB | Nota |
|---|---|---|
| `VIN` | `+` (3,3 V) | Dentro de especificación: el regulador del módulo acepta 3,3 V |
| `GND` | `-` | |
| `SCK` | **9** | SPI por software |
| `MISO` | **10** | |
| `MOSI` | **11** | |
| `CS` | **A3** | Los pads analógicos se usan como digitales sin problema |
| `IRQ` | **A4** | Se lee por *polling*, no necesita ser un pin de interrupción |
| `RST` | **A5**, o sin conectar | Opcional: con `-1` en el constructor queda un pad libre |

Dos cosas que esto implica:

- **Por qué SPI por software.** En el ATmega32U4 el SPI por hardware vive en
  PB1/PB2/PB3, que en la LilyPad Arduino USB **no están sacados a pads
  cosibles** (los pads son `2, 3, 9, 10, 11, A2–A5` y nada más). La librería de
  Adafruit tiene un constructor de bitbang que acepta SCK/MISO/MOSI
  arbitrarios, así que no es un bloqueo — pero sí tiene un costo de tiempo
  (siguiente sección).
- **Por qué `IRQ` puede ir en cualquier pad.** En el 32u4 los pines con
  interrupción externa son `0, 1, 2, 3, 7`, y `2`/`3` ya los usa el AD8232.
  Por suerte la librería no llama a `attachInterrupt()`: lee el pin con
  `digitalRead()` dentro de un bucle de espera. Cualquier GPIO sirve.

Nota de costura: el SPI bitbang con hilo conductor es sensible a la longitud y
al roce de las pistas, y un flanco sucio en `SCK` corrompe el paquete entero.
Conviene **montar el módulo pegado a la placa** (cable flexible corto, o un
pequeño sustrato rígido compartido) y no tender seis pistas de hilo a lo largo
de la prenda. Los pads que sí toleran hilo largo son los del AD8232, que ya
están tendidos.

Después de esto **no quedan pads libres**. Si más adelante hace falta un
actuador (como la tira de LEDs de `dispositivo1`), hay que renunciar a `RST` o
cambiar de placa.

## Cambios en el sketch

Fragmentos ilustrativos; no son la implementación.

### Inicialización

```cpp
#include <SPI.h>
#include <Adafruit_BluefruitLE_SPI.h>

// SPI por software: la LilyPad no expone PB1/PB2/PB3 en pads cosibles.
// El ultimo argumento es RST; con -1 se ahorra un pad (el breakout lo tiene
// en alto por su cuenta).
Adafruit_BluefruitLE_SPI ble(9, 10, 11, A3, A4, -1);
```

En `setup()`, después de `sembrarBase()`:

```cpp
ble.begin(false);                       // false = sin verbose por Serial
ble.echo(false);
ble.sendCommandCheckOK("AT+GAPDEVNAME=dispositivo3");
ble.setMode(BLUEFRUIT_MODE_DATA);       // a partir de aca, print() va al aire
```

Conviene además **bajar el timeout por defecto** de la librería: si el módulo
se cuelga o se desconecta en el medio de una transacción, `getPacket()` se
queda esperando el `IRQ` hasta que expire, y con el valor de fábrica eso
congela el loop de muestreo un cuarto de segundo.

### Doble salida: USB y BLE a la vez

El sketch debería seguir imprimiendo por `Serial`, no reemplazarlo. En el 32u4
el puerto es USB CDC virtual, y el core descarta la escritura cuando no hay
host leyendo, así que no cuesta nada dejarlo; para ser explícito, se guarda con
`if (Serial)`. Beneficios concretos:

- El Monitor Serial sigue sirviendo para `MODO_CRUDO` y las líneas legibles.
- La vía USB sigue existiendo como **referencia de calibración**: la amplitud
  medida por cable es contra la que hay que comparar la medida por BLE.
- Las páginas actuales con Web Serial siguen funcionando sin cambios.

### El batching, que es el cambio de fondo

El software SPI de la librería es `digitalWrite()` bit a bit. A 8 MHz cada
`digitalWrite()` cuesta varios microsegundos, así que un paquete SDEP de 20
bytes (más su encabezado) sale del orden de **4–6 ms, bloqueantes**. Si se
emitiera una línea `E:` cada 20 ms como hoy, el radio se comería **20–30 % del
tiempo de CPU** justo en el camino de muestreo a 1 kHz.

La mitigación es juntar ~100 ms de salida en un buffer de texto y mandarla en
**una sola** escritura, con los `\n` adentro:

```cpp
// "E:12\nE:14\nE:19\nE:20\nE:22\n" en una sola transaccion
if (ble.isConnected()) ble.print(bufferLineas);
```

Por qué esto no rompe nada: el lector de las páginas acumula bytes y parte por
`\n` antes de pasar cada línea a `handleLine()` (ver
`entorno-digital/prototipo_percusion_guante_a_dispositivo.html:894-919`). La
página ve **exactamente las mismas líneas** que por USB, en la misma cantidad;
sólo llegan en tandas de cinco en vez de de a una. Baja a ~10 transacciones por
segundo, o sea ~5 % de duty.

Y las muestras que igual se pierdan durante esos milisegundos **no sesgan la
amplitud**: la MAV se calcula dividiendo por `muestrasEnVentana` real
([dispositivo3.ino:139](dispositivo3.ino#L139)), no por la constante 20. Una
ventana que juntó 16 muestras en vez de 20 sale un poco más ruidosa, no más
alta. La lógica de descarte de atraso del loop
([dispositivo3.ino:155-157](dispositivo3.ino#L155-L157)) ya cubre el resto.

Si el ruido extra molestara, la salida limpia es mover el muestreo a una ISR de
Timer1 a 1 kHz y dejar el envío en el `loop()`. Es más código y más delicado:
vale la pena sólo si se mide que hace falta.

`MODO_CRUDO` debe quedar **sólo por USB**. Mil líneas `S:<n>` por segundo no
pasan por este transporte y no tiene sentido intentarlo: para mirar la forma de
onda se usa el cable.

### Memoria: el riesgo principal

La librería de Adafruit no es chica. En el 32u4 quedan ~28,6 KB de flash útiles
(el bootloader se come el resto) y 2,5 KB de RAM. `Adafruit_BluefruitLE_nRF51`
más `SPI` se llevan del orden de **15–20 KB de flash** y varios cientos de
bytes de RAM entre buffers de paquete y cadenas. El sketch actual es diminuto,
así que probablemente entre — pero **hay que medirlo compilando antes de
coser**, y es el escenario más plausible de "no cierra". Si queda al límite, lo
primero que se recorta son las cadenas de diagnóstico legible (o se las envuelve
en `F()`).

## Recepción en la notebook (Linux Mint)

Dos caminos. Funcionan los dos; pagan cosas distintas.

### A) Web Bluetooth dentro de la página

La página habla directamente con el módulo, sin nada instalado en el medio.

**Requisitos del sistema**

- BlueZ ≥ 5.43 — Mint 21/22 trae 5.6x, así que no hay nada que hacer.
- Chrome o Chromium **de escritorio**. Firefox no implementa Web Bluetooth
  (igual que no implementa Web Serial).
- En Linux la API está detrás de un flag:
  `chrome://flags/#experimental-web-platform-features` → *Enabled* → reiniciar.
- **La página hay que servirla.** Web Bluetooth exige contexto seguro servido:
  `file://` no alcanza. Con la biblioteca estándar de Python ya instalada en
  Mint:

  ```
  cd entorno-digital && python3 -m http.server 8000
  ```

  y abrir `http://localhost:8000/<pagina>.html`. No se instala ninguna
  dependencia, pero se pierde el doble clic.

**Qué cambia en el código de la página**

Sólo el bloque de conexión. El equivalente del bloque de Web Serial de
`prototipo_percusion_guante_a_dispositivo.html:817-929` sería:

```js
const NUS     = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_TX  = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

const dev  = await navigator.bluetooth.requestDevice({ filters: [{ services: [NUS] }] });
const srv  = await (await dev.gatt.connect()).getPrimaryService(NUS);
const tx   = await srv.getCharacteristic(NUS_TX);
const dec  = new TextDecoder();
let buffer = "";

tx.addEventListener("characteristicvaluechanged", function (e) {
  buffer += dec.decode(e.target.value);
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    handleLine(buffer.slice(0, idx));   // el mismo handleLine() de siempre
    buffer = buffer.slice(idx + 1);
  }
});
await tx.startNotifications();
```

Lo importante es lo que **no** cambia: el buffer de `\n`, el `handleLine()` que
ignora en silencio las líneas que no reconoce, y `window.feedEMG(v01)`
([prototipos/prototipo_emg_acumulacion_v2.html:288](../entorno-digital/prototipos/prototipo_emg_acumulacion_v2.html#L288))
como **única frontera de entrada de datos**. La convención del repositorio se
respeta tal cual: el lector BLE es otro lector que llama a la misma función.

Hay que agregar la detección de soporte, igual que con Web Serial: si
`"bluetooth" in navigator` es falso, deshabilitar el botón y decir por qué.

### B) Puente BLE → WebSocket en la notebook

Un script corre en la notebook, se suscribe a las notificaciones del módulo y
reexpone las mismas líneas por un WebSocket local. La página cambia su lector
por `new WebSocket("ws://localhost:8765")` y conserva todo el parseo.

```python
# puente_ble.py (esquema)
from bleak import BleakClient, BleakScanner      # pip install bleak

NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
# scan por nombre "dispositivo3" -> connect -> start_notify(NUS_TX, cb)
# cb: reenviar los bytes crudos a todos los clientes WebSocket conectados
```

Ventajas reales:

- **La página se sigue abriendo con doble clic.** Un WebSocket a `localhost` no
  exige contexto seguro, así que `file://` funciona.
- Anda en **Firefox**, y sin flags.
- El puente puede **loguear a archivo** en paralelo, que para analizar sesiones
  de EMG después (y para la tesis) vale bastante.
- Centraliza la reconexión: un corte de BLE no obliga a tocar la página.

Costos:

- Una dependencia instalada (`bleak`, y `websockets` o equivalente). Esto
  **rompe la convención de "sin dependencias"** del repositorio, que hasta
  ahora sólo toleraba herramientas de Node con biblioteca estándar
  (`entorno-digital/tools/`). Es del lado de las herramientas, no de la página,
  pero es un entorno más que hay que reproducir.
- Un proceso más que hay que acordarse de arrancar antes de la pieza.

### Comparación

| | A) Web Bluetooth | B) Puente → WebSocket |
|---|---|---|
| Instalar algo | Nada (Python ya está) | `bleak` + servidor WebSocket |
| Navegador | Sólo Chrome/Chromium, con flag | Cualquiera, sin flags |
| `file://` | **No**: hay que servir por `localhost` | Sí, doble clic |
| Procesos a arrancar | Uno (el `http.server`) | Dos (puente + nada más) |
| Reconexión | En la página | En el puente, mejor lugar |
| Log de sesión | No, sin código extra | Gratis |
| Reproducibilidad para una defensa | Depende de un flag de Chrome en una máquina ajena | Depende de un entorno Python |

Ninguna domina. **A** es más fiel al espíritu del repositorio (todo en el
archivo, sin instalar); **B** es más robusta el día de la muestra y deja datos
para analizar.

### Depurar sin navegador

Antes de culpar a la web, confirmar que el módulo anuncia y que manda lo que se
espera:

```
bluetoothctl           # scan on; devices; info <MAC>
```

y, desde el celular, **nRF Connect** (Nordic) o **Bluefruit Connect**
(Adafruit): se conectan al servicio UART y muestran las líneas `E:` en crudo.
Si ahí se ven bien, el problema está en el host.

## Alimentación

La LilyPad Arduino USB está pensada para esto: tiene **conector JST**, **switch
de encendido** y **cargador de LiPo a bordo** (al conectar el USB con la
batería puesta, la carga). No hace falta ningún circuito adicional.

**Celda recomendada:** LiPo plana de 3,7 V y **400–500 mAh**.

**Presupuesto de corriente estimado** (a medir, no medido):

| | |
|---|---|
| ATmega32U4 a 8 MHz / 3,3 V | ~10–15 mA |
| AD8232 | ~0,2 mA (despreciable) |
| nRF51 conectado y anunciando | ~5–15 mA promedio |
| **Total** | **~25–35 mA** → ~11–16 h con 400–500 mAh |

Autonomía de sobra para cualquier sesión. El consumo no es el problema.

**La trampa sí es el final de la descarga.** La placa regula a 3,3 V con un
MIC5219, cuya entrada nominal es 3,8–5 V. Una LiPo arranca en 4,2 V y baja;
cerca del final sale de la ventana del regulador, el riel cae **y `AREF` cae con
él**, porque el ADC del 32u4 referencia a VCC. Consecuencias:

- La escala del ADC cambia: la misma contracción da **menos cuentas**.
- El pasaaltos IIR del sketch absorbe la deriva lenta del cero
  ([dispositivo3.ino:126](dispositivo3.ino#L126)), así que el reposo sigue
  quedando en ~0; lo que se mueve es la **ganancia**, que el filtro no corrige.
- Y la salida del AD8232, centrada en VCC/2, se mueve junto con el riel.

O sea: **no confiar en la calibración de amplitud con la batería baja.** Lo
práctico es cortar la sesión cuando empiece a bajar, y hacer la medición de
referencia (reposo y contracción máxima) con la batería cargada — todavía
pendiente según el README, y que conviene hacer **por USB** antes de pasar a
BLE, para tener un patrón contra el que comparar.

**Seguridad y uso sobre el cuerpo:**

- La celda va en un bolsillo cosido, **nunca contra la piel** y nunca dentro de
  una costura que la pueda punzar o doblar.
- **No cargar la batería con la prenda puesta**, y no dejarla cargando sin
  supervisión.
- Alivio de tensión en el cable del JST: es el punto que se arranca primero.

**El beneficio no obvio.** Hoy, con la notebook enchufada a la red, el
front-end de EMG está galvánicamente ligado a la instalación eléctrica a través
del USB, y eso mete ruido de **50 Hz** justo en la banda que el AD8232 deja
pasar (0,5–40 Hz, con el flanco del filtro todavía cerca). Pasar a batería
**corta ese camino y suele bajar el piso de ruido en reposo** de forma visible.
La batería no es sólo comodidad: es parte de la corrección de la señal, y
seguramente se note al comparar la amplitud en reposo con cable y sin cable.
Esa comparación es una medición que vale la pena registrar.

## Trampas conocidas (de esta integración)

- **La flash del 32u4 es el límite real.** La librería de BLE es grande.
  Compilar y mirar el porcentaje **antes** de coser nada.
- **El bitbang bloquea.** Cada transacción son milisegundos sin muestrear. De
  ahí el batching; sin él, el radio compite con el ADC.
- **Un módulo colgado congela el loop.** `getPacket()` espera el `IRQ` hasta
  que expira el timeout. Bajarlo, y mandar sólo con `ble.isConnected()`.
- **El intervalo de conexión lo negocia el host.** BlueZ puede quedarse en
  decenas de milisegundos, así que no se puede *garantizar* una entrega cada
  20 ms. El batching de 100 ms también cubre esto.
- **No quedan pads libres.** Seis pads para el radio es todo lo que había.
- **Se pierde `file://`** en la vía A. Es la convención del repositorio que esta
  integración rompe, y conviene documentarlo en la página misma.
- **BLE no es SPP.** No hay `/dev/rfcomm0`, no hay Web Serial. Ver
  [Alternativas](#alternativas-si-no-cierra).
- **Hilo conductor y SPI no son amigos.** Seis pistas de hilo largas van a dar
  paquetes corruptos intermitentes, que se ven como líneas raras (que la página
  ignora en silencio, así que el síntoma es "falta señal", no "error").

## Plan de verificación incremental

En este orden, y sin saltear pasos: cada uno descarta una causa.

1. **Compilar** el sketch con la librería incluida y anotar flash y RAM. Si no
   entra, el resto no importa.
2. **El módulo solo**, sin el AD8232 conectado: subir el ejemplo `atcommand` de
   la librería y verificar que responde por SPI bitbang en los pines elegidos.
   Esto valida el conexionado, que es la causa más probable de todo lo demás.
3. **`bluetoothctl`**: confirmar que anuncia y que el nombre quedó en
   `dispositivo3`.
4. **nRF Connect / Bluefruit Connect** desde el celular: ver llegar las líneas
   `E:` y `L:` en crudo, con el sketch completo. Acá se valida el formato y el
   batching, sin navegador de por medio.
5. **La página**, servida desde `localhost` (vía A) o con el puente (vía B),
   usando el `handleLine()` real. Lo que debería pasar es: nada nuevo. Si las
   líneas son las mismas, la visualización no distingue el transporte.
6. **Comparar contra USB**: amplitud en reposo y en contracción máxima por
   cable vs. por BLE con batería. Es la medición que todavía falta según el
   README, y acá cumple doble función: fija el rango de normalización y
   verifica que el transporte no perdió nada. El sketch mantiene las dos
   salidas justamente para poder hacer esto.
7. **Autonomía real** con la celda elegida, y una lectura de amplitud al final
   de la descarga para ver cuánto se corre la escala.

## Alternativas si no cierra

- **Bluefruit LE UART Friend** (en vez del SPI). Usa sólo dos pines, pero la
  LilyPad no expone un segundo UART por hardware: `Serial1` vive en D0/D1, que
  no son pads cosibles, y `SoftwareSerial` a 9600 baudios bloquea **peor** que
  el SPI bitbang. Para esta placa, el SPI Friend es la opción correcta.
- **Módulo clásico (HC-05)**. Conservaría en teoría el camino de Web Serial, al
  presentarse como puerto serie en el host — pero consume bastante más, no es
  BLE, y **está por verificar que Chrome enumere `/dev/rfcomm0`** como puerto
  de Web Serial en Linux (sin probar; el enumerado va por udev y puede
  perfectamente no listarlo). No lo recomiendo sin esa prueba.
- **Cambiar de placa: Adafruit Feather 32u4 Bluefruit LE**, o una Flora con el
  Bluefruit, que traen el radio integrado, el conector de LiPo y el cargador.
  Vale decirlo aunque implique rehacer el textil: si el pinaje agotado y las
  seis pistas de hilo resultan un problema real al coser, es la salida más
  limpia, y el sketch migra casi sin cambios (mismo 32u4, misma librería, SPI
  por hardware y sin bloqueo).
