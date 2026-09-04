# dispositivo2 — pulso y fuerza en el brazo

Proyecto de Arduino sobre una placa **LilyPad Arduino USB** (ATmega32U4, 3.3V, 8MHz) con dos sensores: uno de pulso, que mide el ritmo cardíaco (BPM), y un sensor de fuerza (FSR). Ambas lecturas salen por Serial, tanto en formato legible para el Monitor Serial como en líneas que consume la visualización web.

## Hardware

- Placa: LilyPad Arduino USB (LilyPad 2)
- Sensor de pulso: Pulse Sensor Amped — cable morado (señal) al pin **A5**
- Sensor de fuerza: FSR al pin **A4**, con resistencia de pulldown de 10K a GND ([referencia](https://learn.adafruit.com/force-sensitive-resistor-fsr/using-an-fsr))
- Sin LEDs ni otros actuadores conectados (por ahora)

## Protocolo de salida

Una línea por lectura, terminada en `\n`, a 9600 baudios. Conviven dos tipos de línea sobre el mismo puerto: las legibles para depurar en el Monitor Serial y las que parsea la web (que ignora en silencio todo lo que no reconoce).

| Línea | Frecuencia | Para qué |
|---|---|---|
| `F:<0-1023>` | cada 30 ms (`printForceReading()`) | lectura cruda del FSR, para la web |
| `BPM: <n>` | en cada latido detectado | ritmo cardíaco, para la web |
| `FSR reading = <n> - <descripción>` | cada 3 s (`printFsrReading()`) | diagnóstico legible |
| `Status - signal: ...` | cada 3 s (`printPulseStatus()`) | diagnóstico legible |

Quién lo consume: [`entorno-digital/prototipo_circulos_fuerza_pulso_dispositivo.html`](../entorno-digital/prototipo_circulos_fuerza_pulso_dispositivo.html), por Web Serial (Chrome o Edge de escritorio). Ver [`entorno-digital/documentacion_circulos_fuerza_pulso_dispositivo.md`](../entorno-digital/documentacion_circulos_fuerza_pulso_dispositivo.md).

## Archivos del sketch

- **`dispositivo2.ino`** — archivo principal. Contiene el flujo del programa (`setup()`/`loop()`) y las variables compartidas con la rutina de interrupción (`Signal`, `IBI`, `Pulse`, `QS`, `BPM`). Imprime el BPM cada vez que se detecta un latido, transmite la lectura del FSR cada 30ms, y además imprime un mensaje de estado cada 3 segundos con la última lectura cruda del sensor (`Signal`), para poder verificar que el sensor está funcionando aunque todavía no se detecten latidos.
- **`PulseSensor.ino`** — lógica de detección de latidos, separada del archivo principal para mantener alta cohesión. Configura un timer (Timer1) que lee el sensor cada 2ms (500Hz) mediante una interrupción, calcula el pico y el valle de la onda, y decide cuándo ocurrió un latido comparando la señal contra un umbral que se auto-calibra. El BPM se calcula promediando los últimos 10 intervalos entre latidos.
- **`explicacion_meditation_trainer.md`** — explicación en español, en términos simples, de cómo funciona el procesamiento de señal del código de referencia de Adafruit/Pulse Sensor (*Meditation Trainer*) en el que se basó el algoritmo de detección de latidos. Ese código de referencia no forma parte de este repositorio: sirvió como fuente para entender y adaptar el procesamiento de la señal.

## Qué se hizo, paso a paso

1. **Lectura básica del sensor**: sketch mínimo que hace `analogRead()` sobre el pin del sensor de pulso y lo imprime por Serial cada 20ms, para confirmar que el sensor está conectado y respondiendo.
2. **Detección de BPM**: se agregó `PulseSensor.ino` con el algoritmo de pico/valle/umbral (adaptado de `Meditation_Trainer-master/Interrupt.ino`), ajustando la configuración del timer para el reloj de 8MHz de la LilyPad USB (el código original estaba pensado para un ATmega32U4 a 16MHz). `dispositivo2.ino` quedó reducido a imprimir el BPM cuando hay un latido nuevo.
3. **Mensaje de estado periódico**: como no se veía ningún BPM en el Monitor Serial, se agregó un print cada 3 segundos con la última lectura cruda (`Signal`), para poder diagnosticar si el sensor está entregando datos aunque no se detecten latidos.
4. **Corrección de la calibración del umbral**: se detectó que el pico, el valle y el umbral iniciales estaban fijos en valores (`512`/`525`) que asumen que el sensor descansa cerca de la mitad del rango del ADC. En este sensor/placa, la lectura de reposo real es más alta (~656), por lo que la señal nunca bajaba del umbral fijo y el algoritmo se quedaba "trabado" sin poder detectar un segundo latido. Se cambió `PulseSensor.ino` para calibrar el valor de reposo (`baseline`) leyendo el sensor una vez al inicio (`pulseSensorSetup()`), y usar ese valor real en vez de la constante fija, tanto al arrancar como cada vez que el algoritmo se reinicia por inactividad.
5. **Sensor de fuerza (FSR)**: se agregó la lectura del FSR en A4, con dos salidas distintas sobre el mismo puerto — `printFsrReading()` cada 3s con su descripción legible ("Light touch", "Big squeeze") para el Monitor Serial, y `printForceReading()` cada 30ms con el formato compacto `F:<0-1023>` que necesita la visualización web para detectar una presión de 0,4–4s y su pico de fuerza.

## Estado actual / pendiente

- El sketch compila con la lógica corregida, pero falta confirmar en la placa real que el BPM se calcula de forma estable.
- Las lecturas crudas del sensor de pulso variaban muy poco (~655–658), lo cual sugiere que el contacto del dedo con el sensor podría no ser suficientemente firme o estable, o que hay interferencia de luz ambiental. Ver `explicacion_meditation_trainer.md` para más detalle sobre posibles causas y qué revisar.
- Falta la prueba end-to-end contra la visualización web con la placa conectada. En particular, el umbral de inicio de presión del lado de la web (`PRESS_THRESHOLD = 0.06`, equivalente a ~61/1023 de FSR) se heredó del sensor simulado y conviene confirmarlo contra el comportamiento real del FSR.
- **Si se cambia el formato de las líneas `F:` o `BPM:`, hay que actualizar `handleLine()` en `entorno-digital/prototipo_circulos_fuerza_pulso_dispositivo.html`.** Las dos mitades están acopladas sólo por ese formato de texto.
