# entorno-digital

Las visualizaciones. Cada una es un archivo `.html` autocontenido —sin
dependencias, sin build step— que se abre con doble clic y dibuja sobre un
Canvas 2D a partir de un sensor.

Los archivos con sufijo **`_dispositivo`** leen hardware real por USB (Web
Serial API, sólo Chrome, Edge o Brave de escritorio). En esta carpeta queda
sólo la versión activa de cada dispositivo; las anteriores y las que simulan
el sensor están en [`prototipos/`](prototipos/).

## Documentación

Toda la documentación vigente está en [`documentacion/`](documentacion/): un
archivo por tema, con el comportamiento actual, las decisiones que llevaron a
él, cómo probarlo, lo pendiente y un historial de las versiones anteriores.

| Documento | Qué cubre |
|---|---|
| [`documentacion/experiencia.md`](documentacion/experiencia.md) | la experiencia completa: pantallas, captura, composición final editable, grabación y reproducción del sonido |
| [`documentacion/bandada.md`](documentacion/bandada.md) | la bandada del dispositivo uno (acelerómetro) |
| [`documentacion/guante.md`](documentacion/guante.md) | el guante de percusión del dispositivo dos (piezos + FSR, Helm por MIDI) |
| [`documentacion/emg.md`](documentacion/emg.md) | la acumulación EMG del dispositivo tres (pantorrilla) |

El texto y el orden de las pantallas de la experiencia salen del guion,
[`experiencia-interactiva-guion.md`](experiencia-interactiva-guion.md), que
manda sobre el contenido.

## Versiones activas

| Archivo | Sensor | Dispositivo | Documentación |
|---|---|---|---|
| [`bandada_prototipo_v5a_dispositivo.html`](bandada_prototipo_v5a_dispositivo.html) | acelerómetro (campo continuo de ~400 puntos que arranca quieto) | [`dispositivo1`](../dispositivo1/) | [`bandada.md`](documentacion/bandada.md) |
| [`prototipo_percusion_guante_a_midi_v2_dispositivo.html`](prototipo_percusion_guante_a_midi_v2_dispositivo.html) | 2 piezos + FSR (anillos por golpe, disco azul por presión; sonido en Helm por MIDI, la intensidad elige la nota) | [`dispositivo2`](../dispositivo2/) | [`guante.md`](documentacion/guante.md) |
| [`prototipo_emg_acumulacion_v4_dispositivo.html`](prototipo_emg_acumulacion_v4_dispositivo.html) | EMG (cuadriláteros superpuestos; cada 1-5 el centro se muda y cambia la familia de color) | [`dispositivo3`](../dispositivo3/) | [`emg.md`](documentacion/emg.md) |

## La experiencia completa: `experiencia/`

[`experiencia/experiencia.html`](experiencia/experiencia.html) encadena las
tres visualizaciones en un recorrido de pantallas (0–11). Las pantallas 0–4,
6, 8 y 10 son texto y se recorren con ← →; la 5, la 7 y la 9 son copias
de las tres páginas activas (`bandada.html`, `guante_percusion.html`,
`emg_acumulacion.html`), con sus instrucciones en la
pantalla de texto anterior (4, 6 y 8). En ellas Retroceso borra, la barra
espaciadora pulsada dos veces captura (sin vuelta atrás: PNG transparente y
lista de `elementos` en IndexedDB; el guante guarda además lo que sonó en
Helm) y recién entonces → pasa a la siguiente.

Desde la 10, → lleva a la 11,
[`experiencia/composicion.html`](experiencia/composicion.html): los elementos
de las tres capturas en una sola escena en vector (EMG abajo, guante, bandada
arriba), donde se pueden seleccionar, mover, agrandar, copiar, pegar y
eliminar, con deshacer. La barra espaciadora dos veces cierra la edición: la
composición se guarda y suena en loop la grabación del guante, que la mueve;
un botón flotante descarga un video de una vuelta, con su sonido.
Inicio borra todo y vuelve a la 0; `composicion.html#demo` arma una escena
sintética, con sonido, sin capturar.

Las copias no cambian la física: un ajuste en una visualización activa hay
que portarlo a mano a su copia en `experiencia/`. Detalle en
[`documentacion/experiencia.md`](documentacion/experiencia.md).

## Herramientas: `tools/`

| Archivo | Para qué |
|---|---|
| [`tools/harness.js`](tools/harness.js) | física de la bandada en Node, sin navegador |
| [`tools/harness_golpes.js`](tools/harness_golpes.js) | grafo de Web Audio de las páginas archivadas del guante |
| [`tools/harness_midi.js`](tools/harness_midi.js) | MIDI del guante activo, y la grabación del sonido en su copia de la experiencia |
| [`tools/harness_emg.js`](tools/harness_emg.js) | reproduce una captura del Monitor Serial del `dispositivo3` contra la página EMG |
| [`tools/audio_helm.sh`](tools/audio_helm.sh) | ruteo de Helm en PipeWire para grabarlo desde el navegador |
| [`tools/diagnostico_audio.html`](tools/diagnostico_audio.html) | comprueba que el navegador ve y graba la fuente de Helm |

Cómo usar cada harness: en el documento de su visualización.

## Archivadas en `prototipos/`

Versiones anteriores, que se conservan para comparar, y una propuesta cuyo
hardware todavía no existe. Qué cambió en cada una y por qué está en el
historial de versiones del documento correspondiente.

| Prototipo | Sensor | Idea principal | Historia en |
|---|---|---|---|
| `bandada_prototipo.html` · `_v2` · `_v3` · `_v3_dispositivo` | acelerómetro | de una órbita alrededor de un centroide a boids, y la v3 con el dispositivo real | [`bandada.md`](documentacion/bandada.md#6--historial-de-versiones) |
| `bandada_prototipo_v4a_dispositivo.html` · `_v4b_` | acelerómetro | la física de la bandada actual, en una caja reducida al 66 % del lienzo; profundidad con perspectiva (a) o foco (b) | ídem |
| `prototipo_circulos_fuerza_pulso.html` · `_dispositivo` | fuerza + pulso | el antecesor del guante; **el sensor de pulso se descartó** | [`guante.md`](documentacion/guante.md#9--historial-de-versiones) |
| `prototipo_percusion_guante_a.html` · `_a_dispositivo` | 2 piezos + FSR | nota fija por dedo y voz propia de Web Audio; el FSR distorsiona y aplica un efecto global a la imagen | ídem |
| `prototipo_percusion_guante_a_midi_dispositivo.html` | 2 piezos + FSR | primera versión con Helm por MIDI; la intensidad elige la nota de una escala | ídem |
| `prototipo_emg_fractura_v1.html` | EMG | fractura low-poly + temblor, sólo simulada | [`emg.md`](documentacion/emg.md#6--historial-de-versiones) |
| `prototipo_emg_acumulacion_v2.html` | EMG | malla de triángulos que crece, sólo simulada | ídem |
| `prototipo_emg_acumulacion_v3_dispositivo.html` | EMG | primera con el `dispositivo3`: cuadriláteros con centro fijo y una sola paleta | ídem |
| `composicion_v1.html` | — | la primera pantalla 11, que apilaba los tres PNG | [`experiencia.md`](documentacion/experiencia.md#9--historial-de-versiones) |
| `prototipo_estiramiento_lineas.html` | sensor de estiramiento | sin hardware todavía; ver [`propuesta_estiramiento_lineas.md`](prototipos/propuesta_estiramiento_lineas.md) | — |
