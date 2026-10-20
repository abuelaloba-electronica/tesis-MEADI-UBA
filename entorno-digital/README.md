# entorno-digital

Las visualizaciones. Cada una es un archivo `.html` autocontenido —sin
dependencias, sin build step— que se abre con doble clic y dibuja sobre un
Canvas 2D a partir de un sensor.

Los archivos con sufijo **`_dispositivo`** leen hardware real por USB (Web
Serial API, sólo Chrome/Edge de escritorio). En esta carpeta queda sólo la
versión activa de cada dispositivo; las anteriores y las que simulan el sensor
están en [`prototipos/`](prototipos/).

## Índice

### Versiones activas

| Archivo | Sensor | Dispositivo | Documentación |
|---|---|---|---|
| [`bandada_prototipo_v5a_dispositivo.html`](bandada_prototipo_v5a_dispositivo.html) | acelerómetro | [`dispositivo1`](../dispositivo1/) | acá abajo + [`cambios_bandada_v5.md`](prototipos/cambios_bandada_v5.md) |
| [`prototipo_percusion_guante_a_midi_v2_dispositivo.html`](prototipo_percusion_guante_a_midi_v2_dispositivo.html) | 2 piezos + FSR (escala por intensidad, sonido en Helm por MIDI, el FSR como disco azul) | [`dispositivo2`](../dispositivo2/) | [`documentacion_percusion_guante.md`](documentacion_percusion_guante.md) |
| [`prototipo_emg_acumulacion_v3_dispositivo.html`](prototipo_emg_acumulacion_v3_dispositivo.html) | EMG (cuadriláteros superpuestos derivados de un rectángulo invisible; la intensidad elige el color) | [`dispositivo3`](../dispositivo3/) | [`cambios_emg_acumulacion_v3.md`](prototipos/cambios_emg_acumulacion_v3.md) |

### Archivadas en `prototipos/`

Versiones anteriores, que se conservan para comparar, y propuestas cuyo
hardware todavía no existe. Las propuestas tienen su `propuesta_*.md` con el
requerimiento original, el criterio de diseño y el mapeo de sensor a imagen.

| Prototipo | Sensor | Idea principal |
|---|---|---|
| `bandada_prototipo.html` · `_v2` · `_v3` · `_v3_dispositivo` | acelerómetro | primeras bandadas: de puntos sueltos a boids, y v3 con el dispositivo real |
| `bandada_prototipo_v4a_dispositivo.html` · `_v4b_` | acelerómetro | la física de la bandada actual, en una caja reducida al 66 % del lienzo; ver [Bandada v4](#bandada-v4-archivada) |
| `prototipo_percusion_guante_a.html` · `_a_dispositivo` | 2 piezos + FSR | guante con nota fija por dedo y voz propia de Web Audio; el FSR distorsiona y aplica un efecto global a la imagen |
| `prototipo_percusion_guante_a_midi_dispositivo.html` | 2 piezos + FSR | primera versión con Helm por MIDI; la intensidad elige la nota de una escala |
| `prototipo_circulos_fuerza_pulso.html` · `_dispositivo` | fuerza + pulso | **el sensor de pulso se descartó** (ver abajo) |
| `prototipo_estiramiento_lineas.html` | sensor de estiramiento | no existe todavía |
| `prototipo_emg_fractura_v1.html` | EMG (fractura low-poly + temblor) | no existe todavía |
| `prototipo_emg_acumulacion_v2.html` | EMG (mosaico que se acumula) | base de la v3 activa; sólo simulada |

Las ideas del guante, versión por versión, están resumidas en
[`documentacion_percusion_guante.md`](documentacion_percusion_guante.md#versiones).

**Sensor de pulso (descartado).** `dispositivo2` usaba un Pulse Sensor Amped
que nunca llegó a dar lecturas estables; se reemplazó por el guante de
percusión. Las dos páginas de círculos siguen funcionando con el firmware
nuevo, porque el formato `F:` del FSR no cambió, pero su parpadeo por latido
quedó fijo en el valor por defecto de 72 bpm.

Historia de la bandada: [`propuesta_bandada.md`](prototipos/propuesta_bandada.md)
(v1) → [`instrucciones_mejoras_bandada.md`](prototipos/instrucciones_mejoras_bandada.md)
(v2, boids) → [`cambios_bandada_v3.md`](prototipos/cambios_bandada_v3.md) →
[`cambios_bandada_v4.md`](prototipos/cambios_bandada_v4.md) →
[`cambios_bandada_v5.md`](prototipos/cambios_bandada_v5.md).

---

# Bandada v5a — `bandada_prototipo_v5a_dispositivo.html`

Unos 400 puntos negros sobre fondo blanco que se mueven como un campo
—separación, alineación, cohesión— con deriva propia, y que responden al
acelerómetro que la persona lleva en la mano. La murmuración de estorninos es
la inspiración de base, no el objetivo literal.

Lo propio de v5a respecto de la v4 archivada, con el detalle y las mediciones
en [`cambios_bandada_v5.md`](prototipos/cambios_bandada_v5.md):

1. **El mundo es el tronco de visión.** v4a simulaba en una caja achicada al
   66% del lienzo para que la perspectiva no sacara los puntos de pantalla, y
   dejaba un marco vacío permanente. Ahora la caja de cada punto es el lienzo
   retroproyectado a *su* profundidad: a cualquier z se puede usar todo el
   lienzo sin cortarse.
2. **Arranque quieto.** Nada se mueve hasta que el acelerómetro registra
   movimiento de verdad; la gravedad que aparece al conectar el USB no cuenta.
   Despierta con una rampa de 1,5 s y no se vuelve a dormir.
3. **Campo continuo.** Lo que sale por un borde entra por el opuesto, con
   vecinos de mínima imagen y copias fantasma en los bordes. Desaparece la
   pelea entre el gesto y la pared. Hay una casilla para volver al modo caja y
   comparar.
4. **Sin núcleos en campo continuo**: en un espacio que envuelve, orbitar "el
   centro" sólo produce un grumo fijo.
5. **400 puntos (10–600) y profundidad en todo el rango**, para que siempre
   haya campo alrededor y el abanico de opacidad y tamaño se lea.
6. **La barra espaciadora termina la interacción**: congela el lienzo, suelta
   el puerto serie y apaga los controles. Se sale recargando.

## Cómo probarla

Sin hardware: abrir el archivo en cualquier navegador y marcar **"Modo demo
automático"**, o mover los sliders X/Y/Z del panel.

Con `dispositivo1`: abrir en **Chrome o Edge**, "Conectar dispositivo (USB)",
elegir el puerto. Con la mano quieta, pulsar **"Poner a cero (reposo)"** —
calibra la referencia y hace desaparecer la gravedad de la señal. El panel
muestra en vivo `gesto` y `sacudida`; si ambos quedan en ~0 con la mano quieta,
está bien calibrado.

## Cómo funciona

### 1 · La señal del acelerómetro

`window.updateAccel(x, y, z)` es el único punto de entrada (recorta a ±4 g, el
rango en que está configurado el sensor). Pero la simulación **no usa esa
lectura cruda**: el sketch envía g crudos, con la gravedad incluida, así que en
reposo un eje marca ~1.0 permanentemente. Cada eje pasa por tres filtros
exponenciales —rápido (τ 0,1 s), medio (τ 0,45 s) y lento (τ 6 s)— de los que
salen las dos señales que gobiernan todo:

- **`gesto` = rápido − lento.** Dirige el movimiento. Absorbe la gravedad sola,
  sin necesidad de saber cómo está orientado el textil.
- **`sacudida` = |rápido − medio|**, normalizada a 0–1. Da la energía: regula
  velocidad, velocidad de giro, impulsos y depredador.

El filtro rápido cumple además una segunda función: interpola entre las ~33
muestras/s del serial y los 60 fps del render, evitando el escalonado.

**La referencia de reposo se congela mientras hay movimiento** (la τ del filtro
lento se multiplica por `1 + 12·sacudida`). Sin eso, al terminar un gesto la
referencia ya subió y `gesto` cambia de signo: la bandada retrocedía en sentido
contrario durante varios segundos, deshaciendo prolijamente cada movimiento.
Con la referencia congelada, un gesto de ida y vuelta termina en cero sin cola,
y una postura mantenida sí deja que la referencia la alcance en ~6 s — que es la
relajación buscada: el gesto se apaga hacia cero, nunca se invierte. Refuerzan
esa asimetría una zona muerta de 0,18 g y un exponente 1,5 sobre lo que la
supera.

### 2 · Cómo el gesto llega a los puntos

Tres mecanismos encadenados, de más lento a más inmediato:

1. **Viento**: fuerza de 420 px/s² por unidad de gesto.
2. **Sesgo directo del rumbo deseado**: el gesto reclama hasta el 85 % de la
   dirección objetivo, sin esperar a que la fuerza se integre. Esto es lo que
   hace que el movimiento se lea de inmediato.
3. **Impulso instantáneo**: cuando la sacudida supera 0,30, cada punto gira de
   una vez hacia la dirección del movimiento —con dispersión individual, para
   que no se desplacen como un bloque rígido— y acelera.

La sacudida además sube la velocidad angular máxima (3,5 → 9,0 rad/s) y la
velocidad máxima (115 → 320 px/s), y un pico brusco dispara un "depredador":
un punto de repulsión temporal que se disuelve solo.

En **modo caja**, los bordes tienen la última palabra, después del gesto: como
el sesgo de rumbo puede reclamar el 85 % de la dirección, un viento sostenido
contra una pared dejaría a toda la bandada aplastada contra el borde. En campo
continuo el problema no existe.

### 3 · Profundidad

El eje Z mueve la bandada en profundidad. Una profundidad global se integra a
partir del gesto en Z, con amortiguación y un resorte débil que la devuelve a
0. Cada punto tiene además su propia `z ∈ [−1, 1]`: esa profundidad global más
una deriva lenta propia, corregida hacia la profundidad de sus vecinos, con una
separación acotada entre los muy cercanos para darle espesor al grupo. Se
dibuja de atrás hacia adelante, ordenado por `z`, con perspectiva: la posición
también se escala desde el centro según la profundidad.

### 4 · Autonomía

Cada punto tiene un ángulo de deriva (*wander*) que hace una caminata aleatoria
propia y aporta 100 px/s² a la suma de fuerzas. No depende del acelerómetro,
así que una vez despierta la bandada sigue moviéndose sola, de forma continua y
no repetitiva. **El gesto sesga el movimiento; nunca lo reemplaza.**

En modo caja hay además 1 a 3 "núcleos" (slider) que orbitan el centro con un
tirón débil y un radio que sube y baja en un ciclo largo: en el mínimo la
bandada se ve como un solo grupo y en el máximo se separa en sub-grupos.

### 5 · El modelo de movimiento

Los vecinos se clasifican en **tres zonas concéntricas** (separación /
alineación / cohesión) con peso en "joroba" `sin(t·π)` para que cruzar de zona
no produzca un salto — técnica del shader de
[Starling-Simulation](https://github.com/techcentaur/Flocking-Simulation). La
suma de fuerzas no se asigna como velocidad: sólo define un **rumbo deseado**
hacia el que el punto gira a una velocidad angular máxima, con la velocidad
suavizada por separado — el modelo de orientación social de
[flock2](https://github.com/ramakarl/flock2). La separación se **acumula sin
promediar** (promediando, los empujes desde lados opuestos se cancelan justo
cuando más hacen falta) y hay un **frenado en la curva** (`targetSpeed *=
lerp(1.0, 0.4, |bank|)`) que repone el amortiguamiento que el boids clásico de
Reynolds trae de fábrica y este modelo perdió al separar rumbo de velocidad.

El radio de vecindad sale de la densidad (cuántos puntos comparten el lienzo),
entre 70 y 420 px, así que no hay que reescalarlo al cambiar la cantidad de
puntos. **No hay grilla espacial**: el escaneo de vecinos es un doble bucle
directo, y con 400 puntos el cuadro cuesta ~3,5 ms de CPU.

## Constantes de ajuste

Agrupadas y comentadas al principio del bloque de simulación. Las que importan
para calibrar cómo "se siente" el dispositivo en la mano:

| Constante | Qué controla |
|---|---|
| `WIND_K` | fuerza del viento por unidad de gesto |
| `HEADING_BIAS_K` / `HEADING_BIAS_MAX` | cuánto reclama el gesto del rumbo |
| `TILT_DEADBAND` / `TILT_EXP` | umbral y curva de respuesta al gesto |
| `SHAKE_REF` | cuántos g equivalen a sacudida = 1 |
| `IMPULSE_SHAKE_MIN` | a partir de qué sacudida se dispara el impulso |
| `DEPTH_K` / `DEPTH_SPRING` | cuánto y por cuánto tiempo acerca/aleja el eje Z |
| `NEIGHBOR_SPACING_K` · `SEP_FRAC` · `ALIGN_FRAC` | tamaño de las tres zonas de vecindad |
| `WANDER_STRENGTH` / `WANDER_RATE` | cuánta deriva propia tiene cada punto |

## Medir la física sin navegador

[`tools/harness.js`](tools/harness.js) corre la simulación real en Node y mide
lo que se habría dibujado, para poder evaluar el comportamiento a lo largo del
tiempo en números en vez de a ojo:

```
node entorno-digital/tools/harness.js entorno-digital/bandada_prototipo_v5a_dispositivo.html --perfil=despertar
node entorno-digital/tools/harness.js <archivo.html> --segundos=15 --perfil=tiltX --muestreo=1
```

Perfiles: `quieto` (verifica la deriva autónoma), `gravedad` (mano inmóvil),
`despertar` (una sacudida al segundo 1 y después mano inmóvil), `tiltX` (gesto
de 2 s y relajación), `auto` (el del modo demo). El encabezado del archivo
explica cómo leer la salida y qué patrones delatan un problema.

- **Comparar siempre contra el control antes de llamarle bug a un
  movimiento**: la bandada deriva sola por diseño. En v5a el control es
  **`despertar`**: con la escena dormida, `gravedad` mide quietud (que es lo
  que verifica el requisito del arranque quieto, pero no sirve de comparación).
- `--caja` apaga el campo continuo y mide la física con paredes.
- Las columnas **`desp`** y **`arrastre`** salen de `window.__diag`. Con campo
  continuo el radio RMS y el centroide dejan de significar algo —son promedios
  de coordenadas envueltas—; `arrastre` es el desplazamiento medio sin
  envolver, o sea cuánto empujó el gesto al campo entero.

## Estado

Validada con el harness (arranque inmóvil con 1 g, pantalla llena en todo
momento, sin costura en la densidad, 3,45 ms de CPU por cuadro con 400 puntos)
y con captura headless. Falta la confirmación con el dispositivo en la mano,
sobre todo para calibrar el umbral de despertar. Ver
[`cambios_bandada_v5.md`](prototipos/cambios_bandada_v5.md), sección
Validación.

`dispositivo1/dispositivo1.ino` no necesita cambios: el protocolo `A:x,y,z` es
el mismo desde v3 y toda la corrección de gravedad ocurre del lado del
navegador.

---

# Bandada v4 (archivada)

[`prototipos/bandada_prototipo_v4a_dispositivo.html`](prototipos/bandada_prototipo_v4a_dispositivo.html)
y [`prototipos/bandada_prototipo_v4b_dispositivo.html`](prototipos/bandada_prototipo_v4b_dispositivo.html)
introdujeron la física que v5a hereda: la señal acondicionada (gesto y
sacudida), la obediencia inmediata al gesto, el rumbo objetivo con banking y la
profundidad. Simulaban dentro de una caja con paredes y arrancaban moviéndose.
Las dos variantes eran idénticas salvo cómo se lee la profundidad:

- **`v4a`, perspectiva**: la posición también se escala desde el centro, y la
  bandada entera se acerca y se aleja de la cámara. Es la que siguió v5a.
- **`v4b`, foco**: la profundidad sólo cambia radio y opacidad, y los puntos
  entran y salen de foco sin que el conjunto se expanda.

Se validaron con el harness (5 minutos simulados, el grupo nunca colapsa ni
llena el lienzo) con el perfil `gravedad` como control. Detalle en
[`cambios_bandada_v4.md`](prototipos/cambios_bandada_v4.md).
