# Cambios: el guante graba el sonido de Helm (etapa 2)

Etapa 2 de `propuesta_sonido_composicion.md`: la pantalla 7
(`experiencia/prototipo_percusion_guante_a_midi_v2_experiencia.html`) graba lo
que suena en Helm mientras se usa el guante y lo guarda con la captura. La
pantalla 11 todavía no lo usa (es la etapa 3). La página activa
(`prototipo_percusion_guante_a_midi_v2_dispositivo.html`) no cambia: grabar es
cosa de la experiencia.

Requiere la etapa 1 (`tools/audio_helm.sh`, con Helm abierto) y el navegador de
la sala (Brave con el perfil `maedi-sala` y `--use-fake-ui-for-media-stream`).

## Qué cambió y por qué

### Una sola fuente, buscada por nombre

La página abre **sólo** `MAEDI-Helm-grabacion`. La busca por su nombre en
`enumerateDevices()` y la pide con `deviceId: { exact }`. Con un pedido simple,
si la fuente faltara, el navegador abriría el micrófono por defecto sin avisar.
Después mira el nombre de la pista recibida y, si no es la de Helm, la cierra
sin grabar.

Se descartan además las entradas `default` y `communications` aunque su
nombre diga `MAEDI-Helm-grabacion`. Chrome lista así la entrada por defecto
(«Predeterminado - …»), y ese alias no garantiza qué fuente hay detrás: es el
mismo motivo por el que se descartó usar la entrada por defecto (ver el
diagnóstico).

Cuando no hay fuente, la página funciona igual y la captura sale con
`sonido: null`. El panel nuevo, *Grabación del sonido*, dice por qué. Hay dos
casos que conviene separar porque se arreglan distinto:

- **los nombres se ven, pero Helm no está**: falta correr `audio_helm.sh`;
- **todos los nombres están vacíos**: falta el permiso, o sea que el navegador
  no se abrió con el perfil de la sala.

El botón *Buscar la fuente de Helm* reintenta. El evento `devicechange` también
reintenta solo: si se corre `audio_helm.sh` con la página ya abierta, la fuente
aparece sin recargar.

### Cuándo se pide el permiso

La fuente se pide encadenada **después** del MIDI (`habilitarMidi().then(habilitarAudio)`)
en los tres lugares donde hoy se habilita el MIDI: al conectar el
dispositivo, con el botón de MIDI y al cargar si el permiso MIDI ya estaba
concedido. Así nunca se superponen dos avisos de permiso. Si el permiso de
audio ya está concedido (`permissions.query({ name: "microphone" })`), que es
lo que pasa con el perfil de la sala, se abre al cargar.

Abrir la fuente no es grabar. El `MediaStream` queda abierto y el
`MediaRecorder` recién arranca con el **primer golpe o la primera presión**,
porque el silencio de antes no sirve. Las teclas A, L y F pasan por la misma
frontera, así que también graban.

### Retroceso descarta, la barra espaciadora cierra con cola

- **Retroceso** (`limpiarLienzo`) tira la grabación sin esperar su Blob. La
  próxima arranca con el próximo golpe, así que el sonido corresponde siempre a
  lo que está dibujado. Si en ese momento se está apretando el FSR, esa
  presión es la primera del dibujo nuevo y abre la grabación en el acto: si
  no, el disco que se estampa al soltar quedaría sin tiempos.
- **La barra espaciadora**: `congelar()` silencia Helm igual que antes, pero el
  delay y la reverb siguen sonando. La grabación se cierra `COLA_MS` (2 s)
  después, y recién entonces se guarda el registro. La imagen se compone en
  paralelo. El aviso "Capturando la composición…" cubre la espera, y → ya
  estaba bloqueado hasta que se guarde.
- **Tope** de `GRABACION_MAX_MS` (15 min): se deja de grabar y se sigue
  dibujando. Lo estampado después queda sin tiempos. Si una presión cruza el
  tope, su `t1` es el final de la grabación. Si la fuente desaparece a mitad
  de camino (por ejemplo, `audio_helm.sh --quitar`), pasa lo mismo: se
  conserva lo grabado.
- `cerrarSonido()` **nunca rechaza**. Si el `MediaRecorder` no entrega el
  audio en `ESPERA_CIERRE_MS`, la captura se guarda igual, con `sonido: null`
  y los elementos sin tiempos. Un problema de audio no puede costar la
  imagen.

### Tiempos

`t0` es el `performance.now()` del evento `start` del `MediaRecorder`, como
dice la propuesta. Ese evento llega unos ms **después** del golpe que abrió la
grabación, y por eso mientras se graba todo se anota en tiempo absoluto. Recién
al cerrar se pasa a ms desde `t0`, con piso en 0: el primer golpe queda en
`t = 0`.

Cada golpe toma un solo `performance.now()`, y lo usan la nota, el anillo y el
evento. Por eso el `t` de un anillo es **exactamente** el de su nota en la
lista de eventos, sin diferencias de 1 ms por redondeo. Con la presión pasa lo
mismo: el `t0` y el `t1` del disco son exactamente los de sus CC.

- `anillo.t`: cuándo sonó.
- `disco.t0`, `disco.t1`: de cruzar `FSR_ON` a bajar de `FSR_OFF`.

Los eventos son lo que de verdad le llegó a Helm: una nota sólo se anota si se
mandó, y un CC sólo si cambió (incluido el CC1 = 0 de `silenciarTodo` al
congelar, que es lo que apaga los efectos). Sin puerto MIDI no hay eventos de
nota, aunque los anillos tengan su `t`.

### El registro

```js
{ imagen, ancho, alto, dpr, elementos, fecha,
  version: 2,
  sonido: {                 // o null
    audio: Blob,            // audio/webm;codecs=opus, 128 kb/s
    duracion: 4.993,        // s, del start al cierre (incluye la cola)
    eventos: [ { t, tipo: "nota", nota, vel, dedo }, { t, tipo: "cc", valor }, … ],
    latenciaMs: 0           // LATENCIA_MS, falta medirla
  } }
```

`composicion.html` lee los `elementos` de toda versión `>= 1`, así que la
pantalla 11 sigue funcionando sin cambios. Por ahora `convertirElemento` no
copia `t`, `t0` ni `t1` a la escena. Eso entra en la etapa 3 o 4, junto con el
modo final.

## Validación

`tools/harness_midi.js` suma la sección *Grabación del sonido*, con
`mediaDevices`, `MediaRecorder` (que entrega trozos según el bitrate y manda
`start` 7 ms tarde) e IndexedDB falsos. Para eso ahora carga la página varias
veces, una por escenario, porque la captura es definitiva. Verifica:

- un solo pedido, por `deviceId` exacto, sin procesamiento de voz y en
  estéreo; nunca el alias `default`, ni un micrófono cuando falta Helm;
- sin la fuente, con los nombres ocultos o con una pista ajena: no graba y la
  captura sale con `sonido: null`;
- nada antes del primer golpe; Retroceso descarta y no reabre solo; el audio
  guardado es sólo el de después de Retroceso (por tamaño);
- el registro no se guarda antes de la cola, y la grabación se cierra a los
  `COLA_MS` de congelar;
- cada anillo tiene su `t` y su nota con el mismo `t` y el mismo dedo; el disco
  tiene `t0`/`t1` y sus CC 64 y 0 en esos instantes; los eventos están en orden
  y dentro de la duración;
- Retroceso con el FSR apretado, `devicechange` y el tope de 15 min.

Seis mutaciones de la página hacen fallar al menos una prueba cada una: sacar
el `exact`, sacar la cola, que Retroceso no descarte, aceptar el alias, no
comprobar la pista y tomar `t0` en `start()` en lugar del evento.

```
node entorno-digital/tools/harness_midi.js entorno-digital/experiencia/prototipo_percusion_guante_a_midi_v2_experiencia.html
```

**Probado en Brave con Helm** (2026-11-07, con las teclas A, L y F): la
captura guarda el sonido y el `.webm` se descarga desde IndexedDB por la
consola de la pantalla 11 y se escucha. Falta ajustar `COLA_MS` a oído con el
patch y medir `LATENCIA_MS`.
