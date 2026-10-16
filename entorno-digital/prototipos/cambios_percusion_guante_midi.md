# Cambios del guante (a) → (a) con Helm por MIDI

Archivo nuevo: `entorno-digital/prototipo_percusion_guante_a_midi_dispositivo.html`.
`prototipo_percusion_guante_a_dispositivo.html` queda intacta para comparar, y
sigue siendo la versión que suena sola, sin nada instalado. El sketch de
`dispositivo2` no cambia: las líneas `G:` y `F:` son las mismas.

El pedido, en una frase: que el sonido lo genere **Helm**, corriendo en
paralelo como aplicación, y que la página no suene. La visualización no cambia.

---

## 0 · Qué se había entendido antes y por qué se descartó Helm

La documentación del guante decía que Helm "no entra" porque no corre en el
navegador. Eso responde a una pregunta que no era la que se había hecho: lo
trataba como **reemplazo de la voz de la página**, metido adentro del
navegador. Lo que se pidió es otra cosa: Helm como **segundo programa** que
recibe los golpes por un puerto MIDI. Para eso alcanza con que la página sea
la que traduce golpes a mensajes MIDI. El contrato serie no se toca.

## 1 · El sonido sale por Web MIDI; Web Audio desaparece

**Qué cambió.** Todo el bloque de Web Audio —voces, robo de voz, cadena de
distorsión, limitador, ruido— se reemplazó por una salida MIDI de ~150
líneas. La página no construye ningún `AudioContext` (el harness lo verifica).

**Por qué en la página y no en el firmware.** La placa podría presentarse como
dispositivo USB-MIDI (`MIDIUSB` en el 32u4) y hablarle a Helm directamente.
Se descartó porque la conversión de pico crudo a velocity tendría que vivir en
el sketch, y los sliders `picoMin`/`picoMax` dejarían de afectar al sonido: la
calibración quedaría partida en dos lugares. Así, en cambio, la frontera única
de datos sigue intacta: `feedGolpe` y `feedForce` siguen siendo la única
entrada, y por ahí también pasan el teclado (`A`, `L`, `F`) y la consola. Eso
es lo que permite diseñar el patch de Helm sin el guante.

## 2 · Golpe → noteOn con velocity, y noteOff a los 80 ms

- Notas fijas por dedo, las mismas que antes: 45 (A2) y 57 (A3), canal 1.
- **Velocity** = `13 + 114·v^1.6`. Es la misma ley que tenía la amplitud de
  la voz de Web Audio (`0.05 + 0.45·v^1.6`), trasladada a 1–127. El exponente
  sigue compensando que el ADC es lineal en fuerza y el oído logarítmico; el
  piso de 13 (10 % del máximo) es el mismo cociente 0.05/0.5 de antes: un
  golpe suave nunca queda inaudible. 0 no se puede mandar porque un noteOn con
  velocity 0 significa noteOff. La ley asume que Helm escala la amplitud
  linealmente con la velocity (`velocity_track` al máximo); si se baja ese
  control, la dinámica se achica del lado de Helm y no hace falta tocar la
  página.
- **noteOff a los `GATE_MS = 80` ms.** Un instrumento percusivo no tiene
  "soltar la tecla", pero Helm necesita el noteOff: sin él la voz queda
  ocupada para siempre. En un patch con sustain 0 la duración de la compuerta
  no se escucha; sólo tiene que ser más corta que un golpe y el siguiente.
- **El noteOff va con `setTimeout`, no con timestamp.** `send(msg, t)`
  programaría el noteOff a futuro, pero un mensaje ya enviado no se puede
  cancelar, y el retrigger (punto 3) necesita cancelarlo.
- **El noteOn va sin timestamp** ("lo antes posible"): programarlo a futuro
  sólo sumaría latencia.

## 3 · Retrigger: cerrar la nota anterior antes del noteOn nuevo

**Qué pasaba en el primer borrador mental.** Con dos golpes del mismo dedo
separados menos que la compuerta, la secuencia sería `on₁, on₂, off₁`: el
noteOff atrasado del primer golpe llegaría después del segundo y lo cortaría.
A 6–8 golpes/s por dedo eso pasa todo el tiempo.

**Qué cambió.** Si la nota todavía está abierta, se manda su noteOff
inmediatamente, se cancela su timer, y recién después va el noteOn nuevo:
`on₁, off₁, on₂, off₂`. En un patch percusivo cerrar la nota vieja la manda a
su release, que es justamente la cola natural del golpe anterior. El harness
lo verifica con una ráfaga de 120 golpes cada 20 ms; quitando esa línea, la
prueba falla con 119 retriggers sin cierre.

Con esto ya no hace falta el robo de voz de la versión anterior: la polifonía
y su techo los maneja Helm (se configura en su patch).

## 4 · FSR → CC1, sólo cuando cambia

- La presión normalizada se manda como **CC1 (rueda de modulación)**, 0–127.
  Se eligió CC1 porque en Helm la rueda de modulación es además una fuente de
  modulación propia: se la puede arrastrar a varios destinos a la vez
  (distorsión, filtro, lo que sea), sin depender sólo de *Learn MIDI
  Assignment*, que asigna un CC a una única perilla.
- **Sólo se manda si el valor cambió.** El FSR llega a 50 Hz; con el guante
  quieto, mandaría 50 mensajes por segundo idénticos. En el harness, 202
  lecturas producen 100 CC.
- **El suavizado ahora es de Helm.** La versión anterior movía cinco
  `AudioParam` con `setTargetAtTime(τ = 0.03)` para que no se escucharan los
  escalones entre lecturas. Esa pieza ya no existe en la página: los 128 pasos
  del CC los interpola Helm con su propio suavizado de parámetros. Si se
  escucharan escalones en la distorsión, la solución es del lado de Helm
  (modular a través de un parámetro más suave) y no mandar más mensajes.
- La fuerza visual se sigue suavizando con `TAU = 0.03`, la constante de la
  voz anterior. Helm suaviza el CC con otra constante que no controlamos: si
  la imagen y la distorsión se sienten desincronizadas, ajustar `TAU` a oído.

## 5 · Pánico: que Helm nunca quede colgado ni distorsionado

Tres situaciones dejarían a Helm en un estado que la página ya no puede
corregir: cerrar o recargar la página con una nota abierta, cambiar de puerto
con una nota abierta, y desconectar el cable con el FSR apretado (Helm
quedaría distorsionado indefinidamente). En las tres se llama a
`silenciarTodo()`: cierra las notas propias, manda All Notes Off (CC123) y All
Sound Off (CC120), y devuelve CC1 a 0. También hay un botón **Silenciar todo
(pánico)** en el panel.

## 6 · Elegir el puerto sin configurar nada en cada arranque

- **Helm puede abrirse después que la página.** La lista de puertos se rearma
  sola con `onstatechange`.
- **Preferencia automática**: el último puerto elegido a mano (se recuerda en
  `localStorage`, con `try/catch` porque puede no estar disponible) → uno que
  se llame "Helm" → un puerto virtual conocido (*Midi Through* en Linux, *IAC*
  en macOS, *loopMIDI* en Windows) → el primero.
- **El permiso.** Chrome pide permiso para Web MIDI. La primera vez se concede
  con el botón *Habilitar salida MIDI* (o al conectar el dispositivo, después
  de elegir el puerto serie, para no superponer los dos avisos). Si ya se
  concedió antes, la página lo habilita sola al cargar.

## 7 · Lo que se fue del panel

- **Volumen general, estado del audio y latencia de salida**: ya no hay audio
  en la página; esas tres cosas se ajustan y se miden en Helm.
- En su lugar: estado del MIDI, selector de puerto, notas enviadas, último
  valor de CC1 y el botón de pánico.
- El texto "Último golpe" muestra la velocity enviada en lugar del porcentaje.

---

## Validación

`entorno-digital/tools/harness_midi.js`, hermano por copia de
`harness_golpes.js` (que mide el grafo de Web Audio y acá no aplica). Con un
`MIDIAccess` falso y el reloj manejado a mano (incluido `setTimeout`, para
que los noteOff diferidos corran cuando el harness decide) verifica:

- que no se construye ningún `AudioContext`;
- que prefiere el puerto "Helm" aunque aparezca después de habilitar MIDI;
- 500 golpes espaciados: 500 noteOn, 500 noteOff, ninguna nota colgada,
  velocity en 13–127, un solo canal;
- ráfaga de 120 golpes del mismo dedo cada 20 ms: cero retriggers sin cierre;
- FSR: ningún CC repetido, recorre 0–127, no manda notas;
- pánico en `pagehide` con una nota abierta y el FSR apretado;
- costo de dibujo constante (1,75 → 1,83 arcos por frame).

Se comprobó que el harness detecta fallas: quitando el cierre del retrigger
o el filtro de CC repetidos, las pruebas correspondientes fallan.

**Lo que no se probó**: el envío real a Helm. Este entorno no tiene Chrome, y
Web MIDI no se puede ejercitar sin él.
