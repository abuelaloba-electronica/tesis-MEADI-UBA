# dispositivo1 — acelerómetro en la mano

Textil electrónico con un acelerómetro que la persona lleva en la mano. El
sketch lee los tres ejes y los envía por Serial; el navegador los usa para
mover la visualización de bandada.

## Hardware

- **Placa**: Adafruit Flora V3 (ATmega32u4, USB nativo, 3.3 V).
  [Guía de la placa](https://learn.adafruit.com/getting-started-with-flora)
- **Sensor**: Adafruit LSM6DSO32 — IMU de 6 ejes (acelerómetro + giroscopio).
  **Sólo se usa el canal de acelerómetro**; el giroscopio y la temperatura se
  leen en el mismo `getEvent()` pero se descartan.
- **Conexión**: I2C por los pads dedicados **SCL** y **SDA** de la Flora — no
  hace falta ninguno de los pines digitales numerados. Dirección I2C por
  defecto del breakout: `0x6A`.

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

## Estructura del sketch

Un solo archivo, `dispositivo1.ino`:

- `setup()` reintenta `begin_I2C()` cada 200 ms hasta que el sensor responda —
  sin acelerómetro no hay nada que enviar, así que **bloquea indefinidamente**
  si el I2C no engancha. Si la placa parece "muerta" al arrancar, ese lazo es el
  primer sospechoso.
- `loop()` sólo mira el reloj y llama a `sendAccelReading()` cada
  `sendInterval`.
- `sendAccelReading()` lee, convierte a g e imprime la línea.

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
