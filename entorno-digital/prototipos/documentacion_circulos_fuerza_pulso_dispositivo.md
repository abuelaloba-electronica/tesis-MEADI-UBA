# Documentación: `prototipo_circulos_fuerza_pulso_dispositivo.html`

> **Archivado.** El sensor de pulso de `dispositivo2` se descartó: nunca llegó a
> dar lecturas estables (ver `dispositivo2/README.md`, paso 1). En su lugar la
> placa maneja ahora un guante de percusión con dos piezos —ver
> [`documentacion_percusion_guante.md`](../documentacion_percusion_guante.md).
>
> Esta página sigue funcionando con el firmware nuevo, porque el formato `F:`
> del FSR no cambió: los círculos se siguen creando al soltar la presión. Lo que
> quedó muerto es la rama `BPM:`, así que todos parpadean al valor por defecto
> de 72 bpm. Se conserva para poder comparar el comportamiento.

## Qué es

Versión del prototipo de círculos (fuerza + pulso) que, en vez de simular los sensores con mouse/touch, lee los datos reales emitidos por el sketch `dispositivo2/dispositivo2.ino` (placa **LilyPad Arduino USB / ATmega32U4**) directamente desde el navegador, por USB, usando la **Web Serial API**.

Es la evolución de `prototipos/prototipo_circulos_fuerza_pulso.html` (la versión simulada, documentada en `prototipos/propuesta_circulos_fuerza_pulso.md`): mantiene exactamente la misma lógica de dibujo, mezcla de color y parpadeo por pulso; lo único que cambia es de dónde vienen los datos y, dentro de esa lógica, qué agregado de fuerza se usa (ver más abajo).

## Requisitos para probarlo

- **Navegador**: Chrome o Edge de escritorio. La Web Serial API no existe en Firefox ni Safari — si se abre ahí, el botón de conexión queda deshabilitado y aparece un aviso en el panel.
- **Hardware**: LilyPad Arduino USB con el sensor de pulso (Pulse Sensor Amped) en el pin A5 y el FSR en el pin A4 (con pulldown de 10K a GND), conectada por USB.
- **Firmware actualizado**: el sketch `dispositivo2/dispositivo2.ino` tiene que tener la función `printForceReading()` (agregada junto con este prototipo) para que el FSR se envíe con la frecuencia que la web necesita. Si la placa todavía tiene una versión anterior del sketch, hay que volver a subirlo antes de conectar.
- El archivo se puede abrir con doble clic (`file://`) en Chrome/Edge. Si por algún motivo no aparece el selector de puertos al hacer clic en "Conectar dispositivo", como alternativa se puede servir la carpeta con `python -m http.server` y abrir por `http://localhost`.

## Protocolo serie (Arduino → navegador)

El sketch imprime por `Serial` (9600 baudios) líneas de texto separadas por `\n`. El parser de la web (`handleLine()` en el HTML) reconoce dos formatos y descarta cualquier otra línea:

| Línea emitida por el Arduino | Frecuencia | Qué hace la web |
|---|---|---|
| `F:<0-1023>` | ~cada 30ms (`printForceReading()`) | Normaliza a 0–1 y llama a `window.feedForce(valor01)` |
| `BPM: <n>` | en cada latido detectado | Llama a `window.feedPulseBpm(n)` |
| `FSR reading = ... - ...` / `Status - signal: ...` | cada 3s | Se ignoran (son los diagnósticos legibles para el Monitor Serial, sin cambios) |

`window.feedForce` y `window.feedPulseBpm` son los mismos dos puntos de enganche que ya existían en la versión simulada; acá los alimenta el lector de Web Serial en vez de los controles manuales.

## Cómo se dibuja cada círculo

Igual que en la versión simulada, con un solo cambio de agregación:

- **Diámetro**: determinado por cuánto tiempo se mantuvo la presión por encima del umbral (`PRESS_THRESHOLD`), interpolado entre los sliders de mínimo/máximo permitido del panel (0.4s–4s por defecto). Sin cambios respecto al documento original.
- **Opacidad/color**: determinada por el **pico de fuerza** (`peakIntensity`) alcanzado durante esa misma presión — no el promedio, que era lo que usaba la versión simulada. Se decidió así porque, con el sensor real, lo relevante es "hasta dónde llegó la fuerza", no un promedio suavizado por la duración de la presión.
- **Superposición y mezcla de color** (`globalCompositeOperation = "multiply"`) y **parpadeo por pulso** (cada círculo guarda el BPM vigente al crearse y parpadea a ese ritmo de forma indefinida): sin cambios.

## Diferencias con la versión simulada

- No tiene el recuadro de fuerza arrastrable ni el slider de BPM: depende exclusivamente de la conexión USB.
- Agrega un botón **"Conectar dispositivo (USB)"** con indicador de estado (conectado / sin conexión / error) y manejo de desconexión (evento `disconnect` de `navigator.serial`, o corte de la lectura).
- El panel muestra en vivo la lectura cruda de fuerza (0–1023) y el BPM recibido, para poder calibrar a ojo si el sensor está respondiendo antes de presionar.
- Se mantienen sin cambios los sliders de mínimo/máximo de duración, el selector de color de relleno y el botón de limpiar lienzo.

## Estado actual / pendiente

- No se probó todavía end-to-end contra la placa física (este entorno de trabajo no tiene el hardware ni un navegador Chrome/Edge disponibles) — se revisó manualmente la lógica y la sintaxis del HTML, pero falta la validación real con el dispositivo.
- El umbral de inicio de presión (`PRESS_THRESHOLD = 0.06`, equivalente a una lectura cruda de FSR de ~61/1023) es el mismo que se usaba para el sensor simulado; conviene confirmarlo contra el comportamiento real del FSR una vez conectado (el `README.md` de `dispositivo2` ya advierte que las lecturas de reposo pueden variar según el sensor/placa), y ajustar la constante en el HTML si hiciera falta.
- Si más adelante se necesita que funcione también en navegadores sin Web Serial (Firefox/Safari), la alternativa sería un puente local (servidor Python/Node que lea el puerto serie y lo reexponga por WebSocket) — no está implementado.
