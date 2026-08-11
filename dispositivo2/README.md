# dispositivo2

Proyecto de Arduino que conecta un sensor de pulso (Pulse Sensor Amped) a una placa **LilyPad Arduino USB** (ATmega32U4, 3.3V, 8MHz) y mide el ritmo cardíaco (BPM), mostrándolo por el Monitor Serial.

## Hardware

- Placa: LilyPad Arduino USB (LilyPad 2)
- Sensor: Pulse Sensor Amped
- Conexión: cable morado (señal) del sensor al pin **6** de la LilyPad (pin analógico en este board)
- Sin LEDs ni otros actuadores conectados (por ahora)

## Archivos del sketch

- **`dispositivo2.ino`** — archivo principal. Contiene el flujo del programa (`setup()`/`loop()`) y las variables compartidas con la rutina de interrupción (`Signal`, `IBI`, `Pulse`, `QS`, `BPM`). Imprime el BPM cada vez que se detecta un latido, y además imprime un mensaje de estado cada 3 segundos con la última lectura cruda del sensor (`Signal`), para poder verificar que el sensor está funcionando aunque todavía no se detecten latidos.
- **`PulseSensor.ino`** — lógica de detección de latidos, separada del archivo principal para mantener alta cohesión. Configura un timer (Timer1) que lee el sensor cada 2ms (500Hz) mediante una interrupción, calcula el pico y el valle de la onda, y decide cuándo ocurrió un latido comparando la señal contra un umbral que se auto-calibra. El BPM se calcula promediando los últimos 10 intervalos entre latidos.
- **`Meditation_Trainer-master/`** — código de referencia (de Adafruit/Pulse Sensor) en el que se basó el algoritmo de detección de latidos. No se usa directamente en el sketch; sirvió como fuente para entender y adaptar el procesamiento de la señal.
- **`explicacion_meditation_trainer.md`** — explicación en español, en términos simples, de cómo funciona el procesamiento de señal del código de referencia (`Meditation_Trainer-master/`).

## Qué se hizo, paso a paso

1. **Lectura básica del sensor**: sketch mínimo que hace `analogRead()` sobre el pin 6 y lo imprime por Serial cada 20ms, para confirmar que el sensor está conectado y respondiendo.
2. **Detección de BPM**: se agregó `PulseSensor.ino` con el algoritmo de pico/valle/umbral (adaptado de `Meditation_Trainer-master/Interrupt.ino`), ajustando la configuración del timer para el reloj de 8MHz de la LilyPad USB (el código original estaba pensado para un ATmega32U4 a 16MHz). `dispositivo2.ino` quedó reducido a imprimir el BPM cuando hay un latido nuevo.
3. **Mensaje de estado periódico**: como no se veía ningún BPM en el Monitor Serial, se agregó un print cada 3 segundos con la última lectura cruda (`Signal`), para poder diagnosticar si el sensor está entregando datos aunque no se detecten latidos.
4. **Corrección de la calibración del umbral**: se detectó que el pico, el valle y el umbral iniciales estaban fijos en valores (`512`/`525`) que asumen que el sensor descansa cerca de la mitad del rango del ADC. En este sensor/placa, la lectura de reposo real es más alta (~656), por lo que la señal nunca bajaba del umbral fijo y el algoritmo se quedaba "trabado" sin poder detectar un segundo latido. Se cambió `PulseSensor.ino` para calibrar el valor de reposo (`baseline`) leyendo el sensor una vez al inicio (`pulseSensorSetup()`), y usar ese valor real en vez de la constante fija, tanto al arrancar como cada vez que el algoritmo se reinicia por inactividad.

## Estado actual / pendiente

- El sketch compila con la lógica corregida, pero falta confirmar en la placa real que el BPM se calcula de forma estable.
- Las lecturas crudas del sensor variaban muy poco (~655–658), lo cual sugiere que el contacto del dedo con el sensor podría no ser suficientemente firme o estable, o que hay interferencia de luz ambiental. Ver `explicacion_meditation_trainer.md` para más detalle sobre posibles causas y qué revisar.
