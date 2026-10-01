# dispositivo1 — acelerómetro en la mano

Textil electrónico con un acelerómetro que la persona lleva en la mano. El
sketch lee los tres ejes y hace dos cosas con la misma lectura: los envía por
Serial —el navegador los usa para mover la visualización de bandada— y enciende
una tira de LEDs cosida a la prenda, cuyo brillo sigue al movimiento. La señal
es una, las salidas son dos: una en la pantalla, la otra en el cuerpo.

## Hardware

- **Placa**: Adafruit Flora V3 (ATmega32u4, USB nativo, 3.3 V).
  [Guía de la placa](https://learn.adafruit.com/getting-started-with-flora)
- **Sensor**: Adafruit LSM6DSO32 — IMU de 6 ejes (acelerómetro + giroscopio).
  **Sólo se usa el canal de acelerómetro**; el giroscopio y la temperatura se
  leen en el mismo `getEvent()` pero se descartan.
- **Conexión**: I2C por los pads dedicados **SCL** y **SDA** de la Flora — no
  hace falta ninguno de los pines digitales numerados. Dirección I2C por
  defecto del breakout: `0x6A`.
- **Actuador**: tira de **13 LEDs WS2812B** ("NeoPixel") en el pad **D6**, que
  no compite con el I2C. Requiere la librería `Adafruit NeoPixel` (en el IDE de
  Arduino, *Herramientas → Administrar bibliotecas*).

### Cableado de la tira

La tira trae tres conductores y **tiene sentido**: hay una punta de entrada
(`DIN`, a veces sólo una flecha impresa apuntando hacia adentro de la tira) y
una de salida (`DOUT`). Siempre se conecta la de **entrada**.

| Cable de la tira | Pad de la Flora | Notas |
|---|---|---|
| `GND` | `GND` | **conectar este primero**, siempre |
| `+5V` / `VCC` | `VBATT` | es la línea de USB (~4,7 V), no el pad de 3,3 V |
| `DIN` / `DI` | `D6` | el pad rotulado también `A7`; es `PIN_DATOS` en el sketch |

```
   Flora V3                      tira WS2812B (13 LEDs)
  ┌──────────┐                  ┌───┬───┬───┬─ … ─┬───┐
  │   VBATT ●├──────── +5V ─────┤ 1 │ 2 │ 3 │     │13 │
  │     GND ●├──────── GND  ────┤   │   │   │     │   │
  │      D6 ●├──────── DIN  ───►└───┴───┴───┴─ … ─┴───┘
  └──────────┘                    (DOUT queda libre)
```

Tres cosas que importan:

- **`VBATT`, no `3.3V`.** Los WS2812B son de 5 V y el pad de 3,3 V de la Flora
  sale de un regulador chico (~100 mA); no alcanza para 13 LEDs. `VBATT` lleva
  lo que entra por USB (o por la batería, si hubiera una conectada).
- **El orden al conectar**: primero `GND`, después `+5V`, después `DIN`. Meter
  datos en una tira sin masa común deja el pin de la Flora como único retorno de
  corriente y lo puede quemar.
- **Con la placa desenchufada.** Cablear con el USB puesto es la forma más
  común de cortocircuitar `VBATT` contra `GND`.

Si vas a coser en vez de soldar: los tres pads de la Flora son grandes a
propósito, pero la línea de datos no tolera bien un hilo conductor largo (ver
Problemas de la tira, más abajo).

## Configuración del sensor

| Parámetro | Valor | Por qué |
|---|---|---|
| Rango | `LSM6DSO32_ACCEL_RANGE_4_G` | margen suficiente para gestos de mano sin perder resolución |
| Data rate | `LSM6DS_RATE_104_HZ` | holgado respecto de la frecuencia a la que se envía |
| `sendInterval` | 30 ms (~33 líneas/s) | igual que el FSR de `dispositivo2` |

## Protocolo de salida

Una línea por lectura, terminada en `\n`, a 9600 baudios nominales:

```
A:<x>,<y>,<z>
```

Los tres valores van **en g** (1 g = 9,80665 m/s²), con dos decimales. El
`getEvent()` de la librería devuelve m/s², la conversión la hace el sketch.

**Los valores incluyen la gravedad.** En reposo, el eje que apunta hacia abajo
marca ~1.0; eso es esperado, no un error de lectura. El sketch envía la señal
cruda a propósito: la separación entre "orientación" y "movimiento" ocurre del
lado del navegador, que filtra la referencia de reposo sin necesidad de saber
cómo quedó orientado el textil. Ver
[`entorno-digital/README.md`](../entorno-digital/README.md#1--la-señal-del-acelerómetro).

## Quién lo consume

[`entorno-digital/bandada_prototipo_v4a_dispositivo.html`](../entorno-digital/bandada_prototipo_v4a_dispositivo.html)
y su variante `v4b`, por Web Serial (Chrome o Edge de escritorio).

Sumar la tira **no cambió el protocolo**: el formato de línea, los decimales y
la frecuencia son los mismos que antes, así que las páginas funcionan sin tocar
una coma.

## La tira de LEDs

Quieta, la tira queda como una **brasa** ámbar apenas visible. Con movimiento
dinámico sube a amarillo cálido. El brillo es la variable principal; el matiz
acompaña, y **todo el recorrido se queda dentro del amarillo cálido**: nunca
pasa por el rojo.

### De la aceleración al brillo

```
gx,gy,gz crudos
   → línea de base por eje (exponencial, tau 0,7 s)  = gravedad + postura
   → módulo de (lectura − base), menos ZONA_MUERTA   = movimiento, sin gravedad
   → / ENERGIA_REF, acotado a 0..1
   → envolvente asimétrica (sube en 0,12 s, baja en 0,70 s)
   → rampa perceptual (energia^2,2)
   = valor HSV (brillo) + matiz (ámbar → amarillo cálido)
```

**El módulo crudo no sirve para esto.** Incluye la gravedad: en reposo vale
~1,0 de forma permanente y la tira nunca se apagaría. Por eso el brillo sale de
la aceleración *menos* una línea de base que persigue lentamente a la lectura.
Como esa base se actualiza sola, no hace falta saber cómo quedó orientado el
textil al coserlo ni al ponérselo — y una inclinación **mantenida** se apaga
sola, que es lo buscado: la luz responde al gesto, no a la postura.

La zona muerta no es un adorno: **sin ella la brasa de reposo no queda quieta**.
El ruido propio del LSM6DSO32 alcanza para subirla de ~3 a ~6 de 255 y hacerla
titilar (medido, ver Validación).

### Constantes de ajuste

Todas en la cabecera de `dispositivo1.ino`.

| Constante | Valor | Qué pasa si se cambia |
|---|---|---|
| `BRILLO_MAXIMO` | 60 de 255 | techo de corriente. **No subirlo** alimentando por USB |
| `TAU_BASE` | 0,70 s | cuán rápido una postura mantenida deja de contar. Más largo ilumina más tiempo una inclinación; más corto apaga también los gestos lentos |
| `TAU_ATAQUE` | 0,12 s | cuánto tarda la luz en reaccionar al golpe |
| `TAU_CAIDA` | 0,70 s | la estela. Más corto parpadea con cada muestra; más largo se lee como una lámpara con inercia |
| `ENERGIA_REF` | 0,55 g | el "volumen": con cuánto movimiento se llega al brillo pleno. Bajarlo si la tira apenas enciende con el textil puesto |
| `ZONA_MUERTA` | 0,03 g | el piso de ruido. Subirla si la brasa titila en reposo; bajarla si un movimiento suave no enciende nada |
| `VALOR_REPOSO` | 16 de 255 | la brasa (efectivo ~3/255). En 0 la tira se apaga del todo en reposo; por debajo de ~16 el canal verde no sobrevive al redondeo y la brasa se ve naranja |
| `MATIZ_REPOSO` / `MATIZ_MAXIMO` | 7000 / 9600 de 65536 | los extremos del color: ~38° (ámbar) → ~53° (amarillo). **No bajar `MATIZ_REPOSO`**: ver Por qué el color no puede acercarse al rojo |
| `CURVA_BRILLO` | 2,2 | la rampa perceptual. Va sobre la energía, no por canal (misma sección) |
| `PASO_LUZ` | 40 ms | ~25 cuadros/s |

### Validación de la envolvente

`TAU_BASE` y `ZONA_MUERTA` se eligieron corriendo `actualizarEnergia()` fuera de
la placa —compilada con `g++` contra perfiles de mano sintéticos— y barriendo
los dos valores. Lo que dio el par elegido (0,70 s y 0,03 g):

| Perfil | Energía de pico | Brillo efectivo |
|---|---|---|
| Inmóvil, ruido de sensor ±0,015 g | **0,000**, sin titilar | 3/255 (la brasa) |
| Giro de 90° en 10 s | 0,14 | ~9/255, apenas se nota |
| Giro de 90° en 5 s | 0,33 | tenue |
| Giro de 90° en 2 s | 0,80 | ilumina — a esa velocidad ya *es* movimiento |
| Un sacudón de 0,4 s | 0,90, alcanzado en ~0,2 s; decae a 0,04 en 2,5 s | pleno y con estela |
| Agitación sostenida | 0,99 estable, sin parpadeo | el techo |

Los descartes valen tanto como la elección: con `TAU_BASE = 1,0 s` un giro de
90° en 2 s **saturaba** la tira (energía 1,00), y sin zona muerta el reposo se
quedaba en 0,038–0,076 según el ruido, o sea con la brasa al doble y moviéndose.

### Por qué el color no puede acercarse al rojo

A brillo de brasa quedan **2 o 3 valores útiles por canal**, y ahí la
cuantización de 8 bits decide el color más que el matiz nominal. Dos cosas que
parecían inocentes hacían que la tira se viera roja:

1. **`MATIZ_REPOSO` en 0.** Obvio en retrospectiva, pero el problema no es sólo
   el extremo: con el matiz arrancando en rojo, la mitad baja del recorrido
   entero cae en naranjas que a 3/255 no tienen resolución para distinguirse
   del rojo.
2. **`gamma32()`, que era lo que más pesaba.** La corrección de gamma de la
   librería se aplica **por canal**, y en un ámbar el verde siempre vale menos
   que el rojo; elevar ambos a 2,6 por separado hunde el verde a 0 mucho antes.
   Medido reproduciendo `ColorHSV()`, `gamma8()` y el escalado de brillo de la
   librería, con el matiz ya corregido al ámbar:

   | energía | con `gamma32()` | sin `gamma32()`, rampa en la energía |
   |---|---|---|
   | 0,00 | `RGB(0,0,0)` — **apagada** | `RGB(3,2,0)` ámbar |
   | 0,25 | `RGB(2,0,0)` — **rojo puro** | `RGB(6,4,0)` |
   | 0,50 | `RGB(11,5,0)` | `RGB(16,12,0)` |
   | 1,00 | `RGB(60,43,0)` | `RGB(60,53,0)` |

   O sea que `gamma32()` no sólo desteñía: **en reposo apagaba la tira del
   todo**, y la brasa no existía.

La corrección es aplicar la rampa perceptual a `energia` (`CURVA_BRILLO`) antes
de armar el color, en vez de corregir el color ya armado. Así la proporción
entre canales —el color— se mantiene en todo el recorrido, la relación
verde/rojo nunca baja de 0,50, y la rampa de brillo queda casi idéntica a la
anterior (canal rojo: 2/11/29/60 antes, 6/16/33/60 ahora).

### Dos detalles del código que no son casuales

- **`setBrightness()` se llama una sola vez**, en `setup()`, y queda clavado en
  `BRILLO_MAXIMO`. La librería reescala el buffer de píxeles en el momento de
  llamarlo, así que invocarlo en cada cuadro acumula pérdida de precisión. Toda
  la modulación pasa por el canal *value* del HSV. De paso, el techo fijo
  garantiza que ningún camino del código pueda pasarse del presupuesto de
  corriente.
- **La primera lectura carga la línea de base y no enciende nada.** Al enchufar,
  la gravedad aparece de golpe; sin esa precaución la tira arrancaría con un
  fogonazo. Es el mismo cuidado que `signalPrimed` del lado del navegador.

### Corriente

Cada LED WS2812B a brillo pleno y blanco pide ~60 mA, o sea **~780 mA para los
13** — bastante más de lo que da un puerto USB (500 mA nominales). De ahí el
techo: ámbar a `BRILLO_MAXIMO` son ~7 mA por LED, o sea ~90 mA para los 13 más
la placa y el IMU, cómodo para el USB. Si con agitación sostenida la placa se
reinicia, se desconecta del puerto o los últimos LEDs de la tira se ven
amarillentos, es caída de tensión: bajar `BRILLO_MAXIMO`. Para usar la tira en
serio, brillante, hay que alimentarla desde una fuente de 5 V aparte (uniendo
las masas) y no desde el USB.

### Problemas de la tira

- **Los colores salen permutados** (el rojo aparece verde, etc.): la tira es de
  otra variante de orden de bytes. Cambiar `NEO_GRB` por `NEO_RGB` en la
  declaración de `tira`. Si además tiene un LED blanco por píxel, es `NEO_GRBW`
  y hay cuatro canales por LED.
- **Sólo enciende el primer LED, o parpadean al azar**: la lógica de la Flora es
  de **3,3 V** y el umbral del WS2812B es 0,7 × VDD. Alimentada por USB, `VBATT`
  queda en ~4,7 V y el umbral en ~3,3 V: funciona, pero justo. Los arreglos
  habituales, en orden de esfuerzo: acortar el cable de datos (menos de 20 cm),
  poner una resistencia de 330 Ω en serie con `DIN`, o bajar un poco la
  alimentación de la tira con un diodo 1N4001 en serie en el `+5V` para que el
  umbral baje con ella.
- **La tira queda encendida al arrancar, antes de que el sketch dibuje nada**:
  eso no es el sketch (hace `clear()` y `show()` en el `setup()`), es
  alimentación o datos flotando. Revisar la masa común.
- **El primer LED se porta distinto que los demás**: suele ser el que absorbe el
  ruido de la línea de datos. Un capacitor de 100 nF entre `+5V` y `GND` en la
  punta de entrada de la tira lo estabiliza.
- **Un LED muerto corta la cadena**: todos los siguientes quedan apagados. Con
  la tira encendida en brasa se ve mal; conviene provocar brillo pleno agitando
  el textil y contar que estén los 13.

## Cómo probarlo

1. **Que no se haya roto el contrato serial** — es lo único que no se puede
   romper. Abrir `bandada_prototipo_v4a_dispositivo.html` en Chrome o Edge,
   conectar, y confirmar que *gesto* y *sacudida* del panel se mueven como antes
   y que los fps no bajan.
2. **La luz**, con el textil en la mano: inmóvil sobre la mesa 10 s → brasa
   ámbar estable (si titila, subir `ZONA_MUERTA`); un sacudón → amarillo en menos de
   0,2 s y estela de ~1 s; agitación sostenida → arriba y sin parpadeo; una
   inclinación lenta y mantenida → se apaga sola en unos segundos.
3. **Corriente**: con agitación sostenida durante ~30 s la placa no se reinicia,
   el puerto no se desconecta y los últimos LEDs de la tira no se ven
   amarillentos. Si pasa algo de eso, es caída de tensión: bajar
   `BRILLO_MAXIMO`.
4. Si la tira no responde pero el serial sí, el sketch está corriendo y el
   problema es de la tira o su cableado: ver Problemas de la tira, arriba. Para
   aislarlo, subir `VALOR_REPOSO` a 255 momentáneamente fuerza la tira a brillo
   pleno sin depender del movimiento.

## Estructura del sketch

Un solo archivo, `dispositivo1.ino`:

- `setup()` inicializa la tira **antes** del sensor y la deja apagada, y después
  reintenta `begin_I2C()` cada 200 ms hasta que el sensor responda — sin
  acelerómetro no hay nada que enviar, así que **bloquea indefinidamente** si el
  I2C no engancha. Si la placa parece "muerta" al arrancar, ese lazo es el
  primer sospechoso; **la tira lo delata**: la brasa sólo aparece con la primera
  lectura, así que una tira que queda negra con el USB puesto apunta al I2C, no
  a la tira.
- `loop()` mira el reloj y corre **dos temporizadores independientes**, sin
  `delay()`: `sendInterval` (30 ms) para la lectura + la línea serial, y
  `PASO_LUZ` (40 ms) para el cuadro de luz.
- `sendAccelReading()` lee, convierte a g, imprime la línea y le pasa la misma
  lectura a `actualizarEnergia()` con el `dt` medido —no la constante—, para que
  los filtros no se desfasen si el lazo se atrasa.
- `actualizarEnergia()` mantiene la línea de base y la envolvente.
- `actualizarTira()` pinta los 13 LEDs con el color que sale de `energia`.

`show()` deshabilita las interrupciones unos 30 µs por LED, o sea ~0,4 ms por
cuadro: a 25 cuadros/s es ~1 % del tiempo. No afecta al Serial porque acá el
puerto es USB CDC y sólo se transmite (el caso conocido de pérdida de datos es
la *recepción* por UART).

## Posibles mejoras (no aplicadas)

Ninguna es necesaria: la visualización funciona con el sketch tal como está.

- **`sendInterval` de 30 → 10 ms.** La señal de *sacudida* del navegador sale de
  la diferencia entre un filtro de 0,1 s y otro de 0,45 s; a 33 muestras/s hay
  ~3 muestras por constante de tiempo rápida. A 100 Hz —que es lo que ya está
  configurado en el sensor— los sacudones se leerían más nítidos. En ATmega32u4
  el puerto es USB CDC virtual, así que subir la frecuencia **no obliga a tocar
  el baudrate** en ninguno de los dos lados.
- **Tres decimales en vez de dos.** La resolución actual es de 0,01 g. Para el
  *gesto* sobra (la zona muerta del navegador es de 0,18 g), pero el cálculo de
  sacudida trabaja con diferencias chicas y ganaría algo de suavidad.

El lado del navegador no requiere nada a cambio en ninguno de los dos casos: sus
filtros se calculan por `dt` real en cada frame y sólo leen el último valor
recibido.
