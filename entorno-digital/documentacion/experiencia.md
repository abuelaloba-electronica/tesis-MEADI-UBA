# La experiencia interactiva

Recorrido completo de la muestra: pantallas de texto, las tres
visualizaciones de los dispositivos vestibles con su captura, y una
composición final que la persona edita y que después suena y se mueve con lo
que grabó el guante.

Todo vive en [`../experiencia/`](../experiencia/). El texto y el orden de las
pantallas salen del guion
[`../experiencia-interactiva-guion.md`](../experiencia-interactiva-guion.md),
que **manda sobre el contenido**: un cambio de texto se hace primero en el
guion y se porta a mano a `experiencia.html` (y al revés).

Las tres visualizaciones tienen su propio documento:
[`bandada.md`](bandada.md) (dispositivo uno), [`guante.md`](guante.md)
(dispositivo dos) y [`emg.md`](emg.md) (dispositivo tres). Acá sólo se
describe lo que agrega la experiencia.

| Archivo | Pantallas | Qué es |
|---|---|---|
| `experiencia.html` | 0–4, 6, 8, 10 | las pantallas de texto |
| `bandada.html` | 5 | copia de la bandada activa, con captura |
| `guante_percusion.html` | 7 | copia del guante activo, con captura y grabación del sonido de Helm |
| `emg_acumulacion.html` | 9 | copia de la EMG activa, con captura |
| `composicion.html` | 11 | la composición final: editor, modo final con sonido y descarga del video |
| `fuentes/` | — | Roboto Light (normal e itálica) y Bold, locales |
| `Logo_MAEDI+UBA.jpg` | 0 | logo de la maestría |

Herramientas de apoyo, en [`../tools/`](../tools/): `audio_helm.sh` (ruteo de
Helm en PipeWire), `diagnostico_audio.html` (comprueba que el navegador ve y
graba la fuente de Helm) y los harness de Node de cada visualización.

---

## 1 · El recorrido

| Pantalla | Dónde | Contenido | Salida |
|---|---|---|---|
| 0 | texto | bienvenida, marco de tesis, logo | → |
| 1 | texto | qué va a pasar: datos del cuerpo → composición gráfica | → |
| 2 | texto | dos citas de Donna Haraway (ciborg, simpoiesis) | → |
| 3 | texto | "Frontera entre humano y máquina se desdibuja": a los 3 s el texto se desenfoca y queda así | → |
| 4 | texto | **Paso 1**: instrucciones del dispositivo uno | → a la 5 |
| 5 | bandada | visualización del acelerómetro, sin instrucciones en pantalla | captura, → a la 6 |
| 6 | texto | **Paso 2**: instrucciones del dispositivo dos | → a la 7 |
| 7 | guante | visualización y sonido del guante; graba lo que suena en Helm | captura, → a la 8 |
| 8 | texto | **Paso 3**: instrucciones del dispositivo tres | → a la 9 |
| 9 | EMG | visualización de la pantorrilla | captura, → a la 10 |
| 10 | texto | cierre y agradecimiento | → a la 11 |
| 11 | composición | las tres capturas en una sola escena: edición y modo final | Inicio vuelve a la 0 |

**Navegación.** ← → entre pantallas de texto contiguas. De la 4, la 6 y la 8,
→ sale a la visualización (`SALIDA` en `experiencia.html`). Una
visualización sólo deja seguir con → **después de capturar**, y vuelve a
`experiencia.html#6`, `#8` o `#10`. A una visualización no se vuelve hacia
atrás: ← en la 6 o en la 8 no hace nada, porque la captura es definitiva. En
la 11, ← vuelve a la 10.

**El número de pantalla vive en el hash** (`experiencia.html#6`): recargar no
pierde el lugar, y es la forma en que las otras páginas vuelven al recorrido.

**Inicio** es la tecla del operador, y sólo existe en la 11: borra todas las
capturas y la composición de IndexedDB y vuelve a la 0, listo para la
próxima persona.

---

## 2 · Las pantallas de texto (`experiencia.html`)

Cada pantalla es una entrada de `PANTALLAS`, una lista de párrafos
`{ texto, clase, resaltar }`:

- `resaltar` lista fragmentos del texto, en orden de aparición, que se
  marcan con el resaltador (`#ECFC2B`, todo el alto de la tipografía);
- `imagen` dibuja una imagen y usa `texto` como descripción;
- `paso` + `lista` arman las pantallas de instrucciones: el rótulo "# Paso N"
  en negrita y resaltado, y debajo las instrucciones con viñetas, todo
  alineado a la izquierda en un bloque centrado del ancho de su línea más
  larga;
- la clase `desdibuja` (pantalla 3) desenfoca el texto a los 3 s y lo deja
  así.

`SALIDA` dice a qué página sale → desde la 4, la 6, la 8 y la 10, y `CIERRE`
(11) es sólo para el pie "n / 11". **Si cambia la numeración**, hay que
actualizar `SALIDA`, `CIERRE`, los `experiencia.html#N` a los que vuelven
las copias (`siguiente` en `montarExperiencia`) y `composicion.html`, y los
rangos de pantallas de `CLAUDE.md` y de [`../README.md`](../README.md).

**Tipografía**: Roboto Light en toda la experiencia (Bold sólo para el
rótulo del paso), local en `fuentes/` porque las páginas se abren por
`file://` y no pueden depender de un CDN.

**Por qué las instrucciones van en pantallas de texto y no en la
visualización.** Al principio cada visualización mostraba un aviso con sus
instrucciones al entrar. Separarlas en la pantalla anterior (4, 6, 8) deja la
visualización limpia, sin nada encima mientras la persona explora, y pone
las tres instrucciones en el mismo formato.

---

## 3 · Las pantallas de los dispositivos (5, 7 y 9)

Son **copias** de las páginas activas de `entorno-digital/`, con un nombre
simple (`bandada.html`, `guante_percusion.html`, `emg_acumulacion.html`). La física y el dibujo son los mismos: un ajuste en una página
activa **hay que portarlo a mano** a su copia. Lo que agregan las copias es
igual en las tres, y vive en `montarExperiencia()`, al final de cada script:

| Tecla | Acción |
|---|---|
| Retroceso | borra el lienzo y empieza de nuevo (sólo antes de capturar) |
| barra espaciadora | la primera vez pide confirmación; la segunda, antes de 4 s, captura |
| Esc o la X del aviso | cancela la confirmación |
| → | pasa a la pantalla siguiente, sólo después de que la captura terminó de guardarse |

**La captura es definitiva.** Congela la escena (la bandada suelta el puerto
serie y apaga los controles; el guante silencia Helm), compone el PNG y lo
guarda. Por eso pide confirmación: el aviso "¿Capturar la composición?" dice
que después ya no se puede seguir dibujando. La repetición de la tecla
mantenida no confirma, y Retroceso durante el aviso lo cancela. Estados:
`libre → confirmando → guardando → lista`; → sólo funciona en `lista`,
porque navegar con el `toBlob` o la transacción en curso perdería la
captura.

**El aviso** copia a mano la anatomía y los tokens del Alert de Ant Design
(ícono, título, texto, X), sin depender de un CDN en la sala.

**Los colores del guante y de la EMG** son la otra diferencia buscada: las
copias usan la paleta elegida con
[`../tools/paleta_colores.html`](../tools/paleta_colores.html), que
previsualiza las dos visualizaciones solas y superpuestas como en la 11
(detalle en [`guante.md`](guante.md) §1 y [`emg.md`](emg.md) §1.3). Las
páginas activas conservan la anterior.

**El fondo lo pinta el CSS, no el canvas.** Para superponer las capturas,
cada PNG tiene que ser transparente donde no hay dibujo:

- bandada: `draw()` hace `clearRect` en lugar del `fillRect` blanco;
- guante: `pintarFondo()` limpia en lugar de pintar `#faf6f0`. Los anillos
  siguen componiéndose con `multiply`: sobre un píxel transparente, multiply
  da el color de la fuente tal cual;
- EMG: se captura la capa offscreen `capa`, que nunca tuvo fondo, en vez del
  canvas visible.

En pantalla se ven igual que antes.

**Lo que guarda cada captura.** Un registro en IndexedDB (base
`experiencia`, almacén `capturas`, claves `bandada`, `guante` y `emg`):

```js
{ imagen: Blob,          // PNG transparente
  ancho, alto,           // px CSS de la ventana
  dpr,                   // densidad del canvas (la bandada no usa devicePixelRatio)
  elementos: [...],      // lo dibujado, en px CSS y en orden de dibujo
  version,               // 1; el guante, 2
  sonido,                // sólo el guante (version 2): ver §5
  fecha }
```

El PNG no alcanza para editar: hacen falta posición, tamaño y color de cada
cosa. Por eso cada copia anota sus `elementos`:

| Origen | Tipo | Datos |
|---|---|---|
| bandada | `punto` | x, y, r, alpha, color. Salen del mismo `draw()` (`punto()` anota en `registro`), así que no pueden diferir de lo dibujado. Incluye las copias fantasma de los bordes del campo continuo |
| guante | `anillo` | dedo, x, y, r, grosor, color, alpha, `modo: "multiply"`, y `t` (cuándo sonó) |
| guante | `disco` | x, y, r, color, alpha, `modo: "multiply"`, y `t0`/`t1` (la presión del FSR) |
| EMG | `cuadrilatero` | cuatro vértices en px, color, alpha, familia, y los datos normalizados (`v`, `cu`, `cv`, `semiAlto`) para rehacerlo a otro tamaño |

**IndexedDB y no `localStorage`**: tres PNG de pantalla completa pasan los
~5 MB de `localStorage`. En Chrome y Brave todas las páginas `file://`
comparten origen, así que la 11 lee lo que escribieron las otras.

**Particularidades por copia.** La bandada no dibuja los puntos hasta que
llega el primer dato (del dispositivo, de los sliders o del demo), para que
la pantalla no arranque con un campo que todavía no responde. El panel de la
bandada arranca oculto. El guante además graba el sonido (§5).

---

## 4 · La composición final (`composicion.html`, pantalla 11)

Dos momentos, como en las pantallas de los dispositivos: primero se hace,
después se cierra.

| | Modo edición (al entrar) | Modo final |
|---|---|---|
| Qué se ve | todos los elementos, con marcas de selección | la composición tal como quedó, sin marcas |
| Qué se puede hacer | seleccionar, mover, agrandar, cambiar color y opacidad, copiar, pegar, eliminar, deshacer | mirar y escuchar |
| Sonido | ninguno | la grabación del guante, en loop |
| Movimiento | sólo el que hace la persona | el que produce el sonido |
| Exportar | — | el botón "Descargar obra" (§5.6) |

### 4.1 · La escena en vector

Al entrar, los `elementos` de las tres capturas se vuelcan en **una sola
lista ordenada**, la escena, y se redibujan en vector en un único canvas.
De abajo hacia arriba: EMG, guante, bandada (`CAPAS`), cada grupo en su
orden de dibujo. Lo grande y translúcido de fondo y el detalle fino encima:
los puntos de la bandada nunca quedan tapados por los cuadriláteros.

**Un solo lienzo y no una capa por captura**, para que la persona toque lo
que ve, venga del dispositivo que venga, sin entender qué es una "capa" ni
traer una al frente (ver Alternativas descartadas).

**Forma común para todos los tipos.** Cada elemento de escena es

```js
{ id, origen, tipo,       // "emg" | "guante" | "bandada";  "punto" | "anillo" | "disco" | "cuadrilatero" | "imagen"
  x, y,                   // centro, en coordenadas del marco
  escala,                 // la transformación que editan las operaciones
  forma: { ... },         // geometría relativa al centro (r; o los vértices del cuadrilátero)
  estilo: { color, alpha, grosor?, modo? },
  tiempos? }              // { t } o { t0, t1 }, sólo lo que sonó
```

Para el cuadrilátero el centro es el promedio de sus vértices. Así mover y
escalar son la misma cuenta para cualquier tipo (`translate · scale`).

**El marco.** Las coordenadas de la escena viven en el tamaño de pantalla de
la primera captura, y al dibujar ese marco se encaja (*contain*) en la
ventana. Cambiar el tamaño de la ventana no toca los elementos. Una captura
hecha en otra pantalla se encaja en el marco al construir la escena.

**Los PNG dejan de usarse.** Editar obliga a redibujar desde los datos.
Además la bandada no usa `devicePixelRatio`, y su PNG se veía más blando que
los otros dos en una pantalla de alta densidad; en vector se ve igual de
nítida.

**Cada elemento con su `modo`.** Los anillos y discos del guante multiplican
también sobre los cuadriláteros de la EMG que tengan debajo, igual que entre
ellos. Fue una decisión, coherente con cómo se mezclan los golpes entre sí.

**Copias fantasma de la bandada como puntos sueltos.** En una composición
quieta el espacio ya no es continuo: no se agrupan con su original ni se
descartan.

**Respaldo.** Una captura sin `elementos` (anterior a `version: 1`) entra
entera como un elemento `imagen` que dibuja su PNG y no admite ninguna
operación. Un elemento de tipo desconocido o con datos no numéricos se
ignora en silencio, como las líneas serie que una página no reconoce.

### 4.2 · Edición

| Entrada | Acción |
|---|---|
| clic | selecciona el elemento de más arriba bajo el puntero |
| Mayús+clic | lo suma a la selección o lo quita |
| arrastrar un seleccionado | mueve la selección |
| arrastrar en el vacío | marco: selecciona todo lo que toca, aunque esté tapado (con Mayús, suma) |
| clic al vacío, Esc | deselecciona |
| tirador de la esquina, rueda | agranda o achica la selección |
| muestra de color (arriba a la izquierda) | abre el panel de color y opacidad de la selección |
| Ctrl+C / Ctrl+V | copia / pega desplazado, encima de todo |
| Supr, Retroceso | elimina la selección |
| Ctrl+Z / Ctrl+Mayús+Z o Ctrl+Y | deshace / rehace |
| barra espaciadora ×2 | cierra la edición (§4.4) |
| V | diagnóstico: alterna con los PNG originales |

**Permisos por tipo, en una tabla.** El código de puntero y teclado nunca
pregunta por tipos: pregunta `permite(el, op)`.

```js
const PERMITIDAS = {
  punto:        ["mover", "copiar", "eliminar", "color"],
  anillo:       ["mover", "escalar", "copiar", "eliminar", "color"],
  disco:        ["mover", "escalar", "copiar", "eliminar", "color"],
  cuadrilatero: ["mover", "escalar", "copiar", "eliminar", "color"],
  imagen:       []
};
```

Como cada origen tiene sus propios tipos, `escalar` fuera de la fila de
`punto` es exactamente "el guante y la EMG se agrandan, la bandada no". Una
operación nueva (rotar, por ejemplo; así entró `color`) es una entrada en esa tabla, no
condiciones en el código. `pegar` no es un permiso: actúa sobre el
portapapeles, que sólo contiene lo que ya se pudo copiar.

Las decisiones que sostienen la interacción:

- **Cada tipo intercepta sólo lo que se ve de él.** Un anillo responde en su
  trazo y no en el hueco (si no, un anillo grande bloquearía todo lo que
  rodea). Un punto, en un radio de al menos 8 px de pantalla, porque los más
  chicos miden 2-3 px. Un cuadrilátero, por punto en polígono. Las
  tolerancias van en px de pantalla, no del marco.
- **Clic sobre algo ya seleccionado no cambia la selección**: así se arrastra
  un grupo agarrándolo de cualquiera de sus elementos.
- **Nada se pierde fuera del marco.** El centro de un elemento no puede salir
  del marco, ni al arrastrar ni al escalar. El límite se aplica al
  desplazamiento o al factor del grupo, no a cada elemento, para que el grupo
  no se deforme contra un borde.
- **Un clic no es un arrastre**: por debajo de 3 px de movimiento es sólo
  selección y no agrega un paso al historial.
- **En una selección mixta los puntos se separan pero no crecen.** Escalar
  multiplica la escala de lo que admite `escalar` y la distancia al centro de
  lo que admite `mover`: un marco sobre un disco y unos puntos agranda el
  disco y abre la bandada alrededor. Si la selección es sólo de puntos, no
  aparece el tirador y la rueda no hace nada.
- **El escalado** es desde el centro de la caja de la selección, entre 0,2 y
  8 veces el tamaño capturado. El tirador no salta: el factor es cuánto se
  alejó el puntero del centro respecto de donde lo agarró.
- **Una ráfaga de rueda es un solo paso de deshacer** (eventos a menos de
  350 ms), que se cierra antes con cualquier tecla o clic.
- **El marco toca, no contiene**, con la misma idea de la prueba de impacto:
  un anillo cuenta por su corona, un cuadrilátero por su polígono. Alcanza lo
  tapado, que es la forma directa de llegar a lo que está debajo.
- **El portapapeles guarda copias, no referencias**, y es interno (ninguna
  otra aplicación entiende estos elementos). Cada pegado crea ids propios,
  va encima de todo, se corre 16 px por cada pegado de la misma copia y queda
  seleccionado. El pie dice cuánto hay seleccionado y copiado, porque copiar
  no cambia nada en pantalla.
- **Deshacer por instantáneas** (hasta 50 pasos): antes de cada cambio se
  copia la lista entera. Con unos cientos de elementos es barato, y mucho más
  robusto que saber invertir cada operación. Un elemento recuperado vuelve a
  su lugar en la pila.
- **Las marcas de selección se dibujan fuera de la escena**, en px de
  pantalla: un recuadro blanco con punteado negro, que se lee sobre cualquier
  color. No son elementos.
- **Se repinta sin redimensionar el canvas** (eso sólo en `resize`), y los
  eventos de puntero piden como mucho un repintado por cuadro.
- **Con V la edición queda en pausa**: los PNG no reflejan los cambios, y
  editar mirándolos sería editar a ciegas. Si la escena está bien construida,
  al alternar no se mueve nada; sólo cambian el multiply del guante sobre la
  EMG y la nitidez de la bandada.

**Color y opacidad.** Con algo seleccionado que admita `color`, arriba a
la izquierda aparece una muestra discreta, como la de
`tools/paleta_colores.html`: sólo el color, sin código ni nombre, para no
sumar texto a una pantalla que no lo tiene. Muestra el color del
seleccionado de más arriba, partida en diagonal si la selección mezcla
colores. Al tocarla se abre un panel con:

- **Color**: el selector nativo del navegador (`<input type="color">`). Pasa
  a los destinos; la opacidad de cada uno queda como estaba.
- **Opacidad**: un deslizador de 0 a 100 %, que escribe `estilo.alpha`. Pasa
  a los destinos; el color de cada uno queda como estaba.
- **Con más de un elemento seleccionado, una casilla por cada tipo
  presente**: "Aplicar a todos los anillos", "… los cuadriláteros", "… los
  círculos" (el disco del FSR), "… los puntos", en ese orden. Los destinos
  son los seleccionados de los tipos marcados, nunca algo fuera de la
  selección. Arrancan todas marcadas, para que el panel actúe sobre toda la
  selección sin un paso previo, y se vuelven a marcar cada vez que cambia la
  selección (deshacer no la cambia). Marcar o desmarcar no aplica nada en el
  acto: sólo decide a qué le llega el próximo cambio. Sin ninguna marcada,
  el color y la opacidad se deshabilitan. Con un solo elemento no hay
  casillas: el destino es ése.

El panel muestra el color y la opacidad del de más arriba entre los
destinos. El modo de fusión no cambia: un anillo recoloreado sigue en `multiply`. El
anillo de impacto del modo final toma el color nuevo, porque lee
`estilo.color`. Arrastrar en el selector o en el deslizador es una ráfaga,
como la rueda: un solo paso de deshacer, que se cierra al soltar, con
cualquier tecla o al cerrar el panel; elegir el mismo color no suma paso. El
panel se cierra con un clic fuera, con Esc (que entonces no deselecciona) o
tocando otra vez la muestra. Con el foco en el panel las teclas son de sus
controles: las flechas mueven el deslizador y no navegan, la barra marca una
casilla y no cierra la edición, Supr no borra; Ctrl+Z sí deshace.

### 4.3 · El script en capas

Cada capa usa sólo las de arriba:

| Capa | Contenido |
|---|---|
| modelo | geometría, `TIPOS` (cada tipo con `desdeCaptura`, `dibujar`, `caja`, `toca`, `tocaRect`), construcción de la escena, `PERMITIDAS`, `REACCIONES` y operaciones puras sobre listas de elementos (`prepararTraslado`, `prepararEscalado`, `copiar`, `pegar`, `eliminar`, `aplicarEstilo`) |
| editor | historial, selección, portapapeles y comandos (`aplicarCambio` hace de cada uno un paso de deshacer) |
| vista | dibujo de la escena y de las marcas de edición |
| sonido | decodificar o sintetizar la grabación, reproducirla en loop, analizarla, llevar el cuadro de la animación |
| video | grabar una vuelta de la animación con su sonido en un lienzo propio y descargarla (§5.6) |
| entrada | gestos (mover, escalar, marco: objetos con `mover`, `terminar`, `pintar`), rueda, color y opacidad, teclado, cierre de la edición |
| datos | IndexedDB, demo y arranque |

Un tipo nuevo es una entrada en `TIPOS` y sus filas en `PERMITIDAS` y
`REACCIONES`. Un gesto nuevo es una función más y una línea en
`iniciarGesto`. Los gestos continuos devuelven una transformación preparada
que se aplica desde el estado inicial, así que el límite se calcula una vez
y no se acumula error.

### 4.4 · Cerrar la edición

La barra espaciadora pulsada dos veces, con el mismo aviso y el mismo plazo
(`CONFIRMAR_MS`, 4 s) que en las pantallas 5, 7 y 9: "¿Finalizar la
composición?". Es definitivo.

- **Esc con el aviso a la vista sólo lo cancela**, no deselecciona.
- **Cualquier edición en el medio cancela el aviso** (una tecla no
  modificadora, un clic, la rueda): el aviso pregunta por la composición tal
  como estaba cuando se pidió.
- No se puede finalizar en medio de un arrastre ni sin capturas. Si se
  estaban viendo los PNG (V), se vuelve a la escena en vector: lo que se
  finaliza es la escena.

**En el modo final** no se edita nada (tampoco V). Quedan ← e Inicio, y
con sonido el botón "Descargar obra" (§5.6). Se borran la selección y el
portapapeles. El pie conserva "11 / 11 · ←" y, si
hace falta, por qué no suena.

**La composición se guarda** en el mismo almacén, clave `"composicion"`:

```js
{ version: 1, ancho, alto, elementos, fuentes: { emg, guante, bandada }, fecha }
```

`elementos` son los de la escena con sus `tiempos`; `fuentes`, la `fecha` de
cada captura usada. Al cargar, si hay composición guardada **y sus `fuentes`
coinciden con las capturas actuales**, la página vuelve directo al modo
final con esa escena. Si alguna captura cambió, es otro recorrido: se ignora
la guardada y se vuelve a editar (si no, el sonido de una captura nueva
sonaría con los tiempos de la anterior). ← e Inicio esperan a que termine la
escritura. Inicio hace `clear()` del almacén y la borra junto con las
capturas.

---

## 5 · El sonido

### 5.1 · El problema y la decisión

En la pantalla 7 la página no produce sonido: manda notas y CC1 por Web MIDI
y **Helm**, una aplicación aparte, sintetiza, distorsiona y suma delay y
reverb. El audio nunca pasa por el navegador. Se eligió:

- **grabar el audio real desde la página del guante** (`getUserMedia` +
  `MediaRecorder`), porque así la grabación sigue exactamente el ciclo de la
  pantalla (empieza con el primer golpe, Retroceso la descarta, la barra
  espaciadora la cierra), la 11 la lee de la misma base sin que nadie elija
  archivos, y la página puede anotar en cada anillo cuándo sonó;
- **guardar además la lista de eventos MIDI** con sus tiempos, que cuesta
  casi nada y deja abierta una reproducción por MIDI más adelante.

### 5.2 · El ruteo en Linux (`tools/audio_helm.sh`)

**Se graba sólo lo que produce Helm**, nunca un micrófono ni el monitor de la
salida general (que se llevaría notificaciones u otra pestaña). El script,
que se corre una vez por sesión con Helm abierto, crea en PipeWire:

- `maedi_helm`, un sink virtual (`MAEDI-Helm`);
- `maedi_helm_rec`, una fuente hecha del monitor de ese sink
  (`MAEDI-Helm-grabacion`), que el navegador ve como un micrófono más;
- enlaces con `pw-link` de la salida de Helm (`alsa_playback.helm`) a ese
  sink **además** de a los parlantes: lo que oye la persona no pasa por
  ningún intermediario y no suma latencia a los golpes.

`--estado` muestra qué está armado y `--quitar` lo desarma. Verificación sin
navegador: `pw-record --target maedi_helm_rec prueba.wav`.

**El navegador de la sala es Brave con un perfil propio**:

```
brave-browser --user-data-dir=$HOME/.config/maedi-sala --use-fake-ui-for-media-stream
```

En `file://` el permiso de audio no se guarda, y mientras está en `prompt` el
navegador oculta los nombres de todas las fuentes: sin nombres no hay forma
de encontrar la de Helm. El flag lo concede sin aviso; como lo concede a
cualquier página, va sólo en el perfil `maedi-sala`. `diagnostico_audio.html`
comprobó todo esto (Brave sobre Chromium 156 y 157). Chrome debería
comportarse igual, pero no se probó.

### 5.3 · La grabación (pantalla 7)

Sólo en la copia de la experiencia (`guante_percusion.html`); la página activa del guante no graba.

- **Una sola fuente, buscada por nombre.** `MAEDI-Helm-grabacion` en
  `enumerateDevices()`, pedida con `deviceId: { exact }` (con un pedido
  simple, si faltara, el navegador abriría el micrófono por defecto sin
  avisar), sin cancelación de eco, supresión de ruido ni control de
  ganancia, en estéreo. Se descartan los alias `default` y `communications`
  aunque digan Helm: no garantizan qué fuente hay detrás. Al recibir la
  pista se comprueba su nombre y, si no es la de Helm, se cierra sin grabar.
- **Sin fuente, la página funciona igual** y la captura sale con
  `sonido: null`. El panel *Grabación del sonido* distingue los dos casos:
  se ven los nombres pero falta Helm (correr `audio_helm.sh`), o todos los
  nombres están vacíos (falta el permiso: no se abrió con el perfil de la
  sala). `devicechange` reintenta solo.
- **El permiso se pide después del MIDI** (`habilitarMidi().then(habilitarAudio)`),
  para no superponer dos avisos.
- **Abrir la fuente no es grabar.** El `MediaRecorder` arranca con el primer
  golpe o la primera presión: el silencio de antes no sirve. Las teclas A, L
  y F pasan por la misma frontera, así que también graban.
- **Retroceso descarta** la grabación con el lienzo: el sonido corresponde
  siempre a lo que está dibujado. Si el FSR está apretado en ese momento, esa
  presión abre la grabación nueva en el acto.
- **La barra espaciadora cierra con cola.** `congelar()` silencia Helm, pero
  el delay y la reverb siguen sonando: la grabación se cierra `COLA_MS` (2 s)
  después y recién entonces se guarda el registro. El aviso "Capturando la
  composición…" cubre la espera.
- **Tope** de 15 min (`GRABACION_MAX_MS`): se deja de grabar y se sigue
  dibujando; lo de después queda sin tiempos.
- **Un problema de audio no puede costar la imagen**: `cerrarSonido()` nunca
  rechaza, y si el `MediaRecorder` no entrega en `ESPERA_CIERRE_MS` la captura
  se guarda con `sonido: null`.
- **Tiempos.** `t0` es el `performance.now()` del evento `start` del
  `MediaRecorder`, que llega unos ms después del golpe que lo abrió; por eso
  todo se anota en tiempo absoluto y al cerrar se pasa a ms desde `t0`, con
  piso en 0. Cada golpe toma un solo `performance.now()` para la nota, el
  anillo y el evento: el `t` de un anillo es exactamente el de su nota. Los
  eventos son lo que de verdad le llegó a Helm (una nota sólo si se mandó, un
  CC sólo si cambió).

```js
sonido: {                 // o null
  audio: Blob,            // audio/webm;codecs=opus, 128 kb/s (~1 MB por minuto)
  duracion: 4.993,        // s, del start al cierre (incluye la cola)
  eventos: [ { t, tipo: "nota", nota, vel, dedo }, { t, tipo: "cc", valor }, … ],
  latenciaMs: 0           // LATENCIA_MS: falta medirla
}
```

### 5.4 · La reproducción (pantalla 11)

- **Preparado al cargar, arrancado en el gesto.** El `Blob` se decodifica al
  cargar en un `OfflineAudioContext` a 48 kHz, que no necesita gesto. Un
  `AudioBuffer`, y no un `<audio>`, da una duración exacta (el WebM de Chrome
  no la trae). El `AudioContext` se crea dentro del manejador de la segunda
  barra espaciadora, que es el gesto que el navegador exige para sonar.
- **Grafo**: `AudioBufferSourceNode` (`loop = true`) → `AnalyserNode` → salida.
- **El reloj** de la animación es el del audio, `relojSonido()`:
  `currentTime` desde el arranque, menos `baseLatency` y `outputLatency` (para
  ir con lo que se **oye** y no con lo que se acaba de procesar; con PipeWire
  son unas decenas de ms), módulo la duración del buffer. Con `loop` la vuelta
  dura exactamente eso, así que el módulo no se desfasa nunca.
- **La costura del loop**: fundidos de 5 ms al principio y de 50 ms al final.
  El del principio es mínimo para no ablandar el primer golpe.
- **Sin grabación** (sin captura del guante, versión 1 o `sonido: null`) el
  modo final existe igual y queda quieto.
- **Al recargar en el modo final** no hay gesto y Brave no deja arrancar el
  `AudioContext`: queda en pausa con la reproducción programada, la primera
  tecla o clic lo reanuda, y el pie lo avisa. Es un caso de operador; si se
  quisiera que sonara solo, el perfil de la sala puede sumar
  `--autoplay-policy=no-user-gesture-required`.

### 5.5 · La composición se mueve con el sonido

**Principio: una capa visual, no una edición.** En cada cuadro cada elemento
recibe un efecto `{ dx, dy, escala, alpha, encima }` que `dibujarElemento`
aplica sobre su `x`, `y`, `escala` y `alpha` **sin escribirlos**. Por eso la
composición guardada no cambia, lo que la persona movió o agrandó se anima
desde donde lo dejó, y una copia pegada de un anillo conserva su `t` y late
con su original, como un eco. `encima` es lo que un efecto dibuja además del
elemento (el anillo de impacto), en las coordenadas del elemento y sin la
escala del efecto.

Igual que con los permisos, el dibujo no pregunta por tipos sino qué
reacciones tiene el elemento:

```js
const REACCIONES = {
  anillo:       [{ r: "golpe", aumento: 0.25, durMs: 200 }],
  disco:        [{ r: "inflar" }],
  punto:        [{ r: "abrir", senal: "envolvente", ganancia: 0.03 },
                 { r: "temblar", senal: "agudos", px: 1.5 }],
  cuadrilatero: [{ r: "respirar", senal: "graves", ganancia: 0.05 }],
  imagen:       []
};
```

Cada reacción es una función pura de `REACCION`: recibe el elemento y el
cuadro `{ tMs, durMs, seg, senal }` y no toca el DOM, el audio ni el estado.
Ajustar cuánto se mueve algo es cambiar un número de la fila.

**a) Por eventos: el guante vuelve a contar su historia.**

- **El anillo se vuelve a golpear** cuando la reproducción pasa por su `t`:
  late 1 → 1,25 → 1 en 200 ms con un seno, y suelta el mismo anillo de
  impacto de la página del guante (trazo de 2 px de su color, que crece hasta
  2,2 veces el radio y se desvanece desde 0,55). Un golpe del final termina
  de latir al principio de la vuelta siguiente, para no cortar en la costura.
- **El disco no existe antes de su `t0`.** Entre `t0` y `t1` crece y después
  queda: cada vuelta empieza sin él, como empezó el dibujo. `curvaDeInflado`
  rehace con los CC grabados lo que hizo la página del guante (fuerza = último
  CC, suavizada con su `TAU`, y el disco sigue el **pico**, que nunca baja), y
  divide por el pico final: en `t1` el disco queda **exactamente** como se
  estampó, con su tamaño editado incluido. Sin CC (se grabó sin puerto MIDI)
  crece con una rampa pareja. Las curvas se calculan una vez, al arrancar el
  sonido; las copias pegadas comparten la de su original. Las constantes del
  disco están copiadas en `DISCO_GUANTE`: si cambian en la página del guante,
  hay que portarlas a mano.
- **Latencia de la grabación**: el sonido de un evento llega a la grabación
  `latenciaMs` después de su `t`, así que la imagen va ese tanto atrás
  (módulo la vuelta). Hoy vale 0 hasta medirla.

**b) Por análisis: la bandada y la EMG**, que no tienen relación con el
sonido, reaccionan a lo que suena de verdad, incluidas la distorsión y la
reverb que ningún evento describe. Las señales salen del `AnalyserNode`
(FFT de 2048, ~43 ms a 48 kHz) en cada cuadro:

| Señal | De dónde | Ataque / caída |
|---|---|---|
| `envolvente` | RMS de la forma de onda | 10 ms / 250 ms |
| `graves` | amplitud media del espectro entre 20 y 250 Hz | 20 ms / 300 ms |
| `agudos` | ídem entre 3 y 10 kHz | 10 ms / 150 ms |

El suavizado del analizador se apaga y lo hace `seguir()`: el golpe se ve en
el instante, y la vuelta al reposo es un gesto y no un corte. Cada señal se
**normaliza por su propio máximo reciente**, que cae muy despacio (30 s): va
de 0 a 1 sin importar a qué volumen se grabó ni cómo está el patch, sin
calibrar por sesión. Un **piso** evita que, en un silencio largo, el ruido de
fondo se agrande hasta parecer señal. Con el contexto en pausa `dt` es 0 y
las señales no cambian.

- **Bandada, `abrir`**: cada punto se aleja del centro de los de su origen en
  proporción a la envolvente, hasta un 3 % de su distancia: la bandada entera
  se abre y se cierra con cada golpe. Se escala respecto del centro, y no se
  desplaza cada punto unos px fijos, para que se lea como un gesto de toda la
  bandada.
- **Bandada, `temblar`**: con los agudos, hasta 1,5 px. Fase y frecuencia de
  cada punto salen de su id: no tiemblan todos juntos ni cambian al azar en
  cada cuadro, que se vería como ruido de imagen.
- **EMG, `respirar`**: con los graves, los cuadriláteros crecen hasta un 5 %.
  Es la señal más lenta: el zumbido del FSR y la cola de la reverb son graves.

**El bucle.** `animar()` corre por `requestAnimationFrame` mientras dure el
modo final con sonido; arma el cuadro, lo deja en `cuadroActual`, repinta y
le pasa el turno al video (`avanzarVideo`, §5.6).
Sin sonido no hay cuadro y la composición queda quieta. Costo: repintar la
escena entera por cuadro; en Brave headless (render por software) la demo, con
69 elementos, anduvo a 30 fps con el peor cuadro entre 17 y 30 ms.

### 5.6 · Exportar el video

En el modo final con sonido aparece abajo a la derecha, sobre el pie, un
botón flotante **"Descargar obra"**: graba una vuelta de la composición
animada, con su sonido, y la descarga como un archivo (en Brave, a
Descargas). El botón es DOM y no sale en el video, igual que el pie.

**Cómo graba.** En tiempo real, con lo que trae el navegador y sin
dependencias: `canvas.captureStream()` para la imagen, un
`MediaStreamAudioDestinationNode` colgado del mismo `AnalyserNode` que va a
los parlantes para el sonido, y `MediaRecorder` para las dos pistas. El
sonido es el del grafo, no un micrófono: sale limpio aunque la sala haga
ruido.

**Un lienzo propio para el video, no el de la pantalla**, por tres razones:

- **Tamaño fijo.** El marco encajado en `VIDEO_ANCHO × VIDEO_ALTO`
  (1280×720, con lados pares para H.264), y no la ventana ×
  `devicePixelRatio`. Dibujar y codificar comparten el hilo con la
  animación: en Brave headless, con render por software, 1280×720 grabó a
  30 cuadros/s y 1920×1080 a unos 19, que se veían a tirones.
- **El fondo pintado.** El lienzo de la pantalla es transparente (el blanco
  lo pone el CSS, §3) y el codificador descarta el alfa: el video salía
  negro. Pintar el blanco no cambia la mezcla, porque multiply sobre blanco
  da el color de la fuente: el video se ve igual que la pantalla.
- **Un reloj propio.** `relojSonido()` descuenta la latencia de salida para
  que la pantalla vaya con lo que se **oye**. El audio del video, en cambio,
  se toma del grafo antes de los parlantes: el cuadro del video
  (`cuadroVideo`) no la descuenta. Las señales del análisis son las mismas
  que en pantalla.

**Una vuelta exacta.** Al pulsar, el botón espera la próxima costura del
loop ("El video empieza en N s"), graba la duración de una vuelta
("Grabando 0:12 / 1:05") y descarga ("Preparando la descarga…"). Arranca
`VIDEO_ANTICIPO_S` (0,3 s) antes de la costura: la grabación del guante
empieza con el primer golpe, y arrancar justo ahí le comería el ataque.
Como dura una vuelta, el archivo también se puede reproducir en loop. La
costura que se espera es como mínimo el final de la primera vuelta, cuando
la normalización de las señales (§5.5) ya se asentó. El archivo sale unas
decenas de ms más corto que la vuelta (~70 ms en headless), porque
`MediaRecorder` tarda en arrancar. El evento `start` no sirve para
corregirlo: llega cientos de ms después.

**Cuadros a ritmo fijo.** Se dibuja y se pide un cuadro
(`captureStream(0)` + `requestFrame()`) a `VIDEO_FPS` (30), al ritmo de
`performance.now()`. `currentTime` avanza a saltos, de a bloques de audio,
y daba cuadros irregulares.

**Formato.** El primero de `VIDEO_FORMATOS` que acepte el navegador. Se
prefiere MP4, que abre cualquier reproductor y trae su duración (el WebM
de `MediaRecorder` no la trae y no se puede adelantar). Brave 157 graba
`video/mp4;codecs=avc1,opus` (H.264 + Opus). AAC no lo acepta. El nombre
es `composicion-AAAA-MM-DD-HHMM.mp4`. La tasa de video tiene un techo de
6 Mb/s; con gráficos planos sale mucho menos (la demo, ~10 MB por minuto).

**Lo que corta una grabación**, que entonces no se descarga y el botón lo
dice 5 s: que el sonido se pause, que la página se oculte
(`requestAnimationFrame` se detiene y el video saldría congelado) o un
error del grabador. Salir con ← o Inicio a mitad de una grabación la
pierde. Sin sonido (sin captura del guante o `sonido: null`) el botón no
aparece, porque el video sería una imagen quieta. Tampoco aparece con el
sonido en pausa, al recargar en el modo final antes de la primera tecla.

---

## 6 · Probar sin recorrer todo

- **`composicion.html#demo`** arma una escena sintética con semilla fija
  (cuadriláteros de dos familias de la paleta nueva, anillos de los dos
  dedos y un disco con sus colores nuevos, una
  nube de puntos y un pájaro partido entre los bordes) por el mismo camino de
  conversión que las capturas reales. Su guante trae tiempos (un anillo cada
  ~0,5 s, el disco de 2,4 a 4,2 s) y un sonido **sintetizado a partir de los
  eventos** en un `OfflineAudioContext` (un clic de ruido filtrado por nota,
  un zumbido grave que sigue los CC): sólo cambia de dónde sale el
  `AudioBuffer`. No lee ni escribe la base; su modo final dura hasta
  recargar, e Inicio vuelve a la 0 sin borrar nada.
- **Las teclas A, L y F** de la página del guante disparan golpes y presión
  sin la placa, y graban igual que el guante real.
- **Enganches de diagnóstico** para la consola: `window.__escena()`;
  `window.__sonido()` (`{ etapa, estado, reloj, duracion, motivo, cuadro }`);
  `window.__video()` (`{ estado, formato, ancho, alto, ultima }`, con
  `ultima = { segundos, cuadros, fps }` de la última grabación);
  `window.__efecto(id[, cuadro])`, el efecto de un elemento en el cuadro
  actual o en uno armado a mano, para ajustar reacciones sin esperar a que la
  reproducción pase por un momento.
- **Harness**: `tools/harness_midi.js` sobre la copia del guante verifica la
  grabación con `mediaDevices`, `MediaRecorder` e IndexedDB falsos (una sola
  fuente por `deviceId` exacto, nunca `default` ni un micrófono, nada antes
  del primer golpe, Retroceso descarta, la cola, `t` de cada anillo igual al
  de su nota, `t0`/`t1` del disco con sus CC, el tope). `tools/harness.js` y
  `tools/harness_emg.js` corren también sobre las copias. Para
  `composicion.html` no hay harness en `tools/`: se probó con pruebas
  descartables en Node (DOM, canvas, IndexedDB, eventos y Web Audio falsos).
  El video se probó con Brave headless manejado por el protocolo de
  DevTools desde Node: `#demo`, barra espaciadora dos veces, clic en el
  botón, y el archivo descargado abierto en un `<video>` (duración, tamaño,
  fondo, pista de audio) y leído caja por caja (cuadros por pista).

```
node entorno-digital/tools/harness_midi.js entorno-digital/experiencia/guante_percusion.html
```

---

## 7 · Pendiente

- **Verlo y oírlo en la sala** con una captura real del guante, y ajustar a
  ojo las ganancias de `REACCIONES` y las bandas de `SENALES` con el patch de
  Helm.
- **Medir `LATENCIA_MS`** y ajustar `COLA_MS` a oído en la página del guante.
- **Mirar el costo de la animación con una escena real**, que puede tener
  bastante más que los 69 elementos de la demo.
- **El video en la sala**: verlo y oírlo para comprobar la sincronía (en
  headless no se pudo juzgar), y mirar `__video().ultima.fps` con
  1920×1080 para decidir si se sube `VIDEO_ANCHO × VIDEO_ALTO`.
- **Memoria**: 15 minutos decodificados en estéreo a 48 kHz son ~350 MB de
  `Float32Array`. Una sesión típica está muy por debajo; si molestara, se
  decodifica a mono.
- **Del editor, sin hacer**: duplicar (Ctrl+D), orden (`[` `]`), clic
  repetido que baja por la pila, bloquear u ocultar por origen (`1` `2` `3`),
  exportar PNG (`P`) y el panel de instrucciones (cuyo texto tiene que entrar
  primero al guion).

---

## 8 · Alternativas descartadas

**Para editar la composición:**

- *Capas intercambiables*: mantener un canvas por captura y elegir con 1/2/3
  la capa activa. Era el cambio más chico, pero obligaba a la persona a
  entender qué es una capa y de qué dispositivo viene cada cosa antes de
  tocarla, y dejaba el orden fijo por origen para siempre.
- Se eligió **un solo lienzo**, con la idea de sumar después filtros por
  origen (bloquear u ocultar) para cuando la superposición moleste.

**Para el sonido:**

- *Grabar desde afuera con `pw-record`*: sin pérdida y sin código en las
  páginas, pero una página `file://` no puede leer el archivo sola, nadie
  sabe cuándo arrancar y parar, y no hay forma de alinear el audio con los
  anillos. Queda como herramienta de operador para archivar una versión sin
  pérdida de cada sesión.
- *Grabar sólo los eventos MIDI y volver a mandarlos a Helm*: sincronía
  perfecta y tamaño despreciable, pero no es el sonido que se grabó sino una
  nueva ejecución, que depende de que Helm siga abierto con el mismo patch.
  Los eventos se guardan igual, por si se quiere más adelante.
- *Dejar la fuente de Helm como entrada por defecto del sistema*: el alias
  «Predeterminado» no dice qué fuente hay detrás, y dejaba sin micrófono al
  resto de la máquina.
- *Mandar Helm sólo al sink virtual con un loopback a los parlantes*: más
  fácil de entender, pero el loopback suma latencia a los golpes.

**Para exportar el video:**

- *Render cuadro por cuadro*: un `OfflineAudioContext` con el mismo
  analizador, pausado con `suspend(t)` en cada cuadro, y la imagen y el
  sonido codificados con WebCodecs. Cuadros exactos, cualquier resolución y
  más rápido que el tiempo real, pero WebCodecs no arma el archivo: hacía
  falta un muxer escrito a mano (200-300 líneas) o una librería copiada
  localmente. Queda para si la grabación en tiempo real se ve mal en la
  sala.
- *Grabar la pantalla desde afuera* (OBS, ffmpeg): no toca la página, pero
  se lleva el pie, no corta en la costura y depende del operador.
- *Grabar el lienzo de la pantalla*: es transparente (el video salía con
  fondo negro), mide la ventana × `devicePixelRatio` y su reloj descuenta
  la latencia de salida.

**Primero se edita, después se escucha.** Sonido y edición nunca conviven:
el sonido **muestra** la composición y no la cambia. Una operación como
"ordenar en el tiempo" (los anillos ubicados según cuándo sonaron) sigue
siendo posible, como una herramienta más del modo edición.

---

## 9 · Historial de versiones

De la más vieja a la más nueva. Los archivos de versiones anteriores que se
conservan están en [`../prototipos/`](../prototipos/); el resto, en el
historial de git.

**2026-10-28 · Primera experiencia** (`3f7724c`). `experiencia.html` con las
pantallas de texto 0–6 y 10 y tres copias de las páginas activas (entonces
con sufijo `_experiencia`) como pantallas 7, 8 y 9. Cada copia mostraba un aviso con sus
instrucciones al entrar; Retroceso borraba, la barra espaciadora capturaba
(definitivo, un PNG en IndexedDB) y → seguía.

**2026-10-28 · Guion y tipografía** (`377200e`, `62d5f0d`, `912a6d7`). El
borrador pasa a `experiencia-interactiva-guion.md`, que desde entonces manda
sobre el contenido. Nueva pantalla 1 con la invitación; se elimina la
pantalla de la "nueva identidad"; el cierre pasa a ser la 9. Roboto Light,
local, en todas las páginas.

**2026-10-28 → 11-02 · La pantalla 3, ida y vuelta** (`f90e4ab`, `8ebe281`,
`213e76d`). Primero un conteo 5 a 1 en un círculo y, después, palabras que
aparecían de a una cada 2 s en lugares libres, con tamaño y ejes de Roboto
Flex al azar; después agrupadas en el centro con pesos livianos. Finalmente
se eliminó: la pantalla 3 pasó a ser una sola frase que se desdibuja a los
3 s, y se quitó Roboto Flex. En el mismo cambio las instrucciones del
dispositivo uno pasaron del aviso de la bandada a la pantalla 4 ("# Paso 1"),
y se agregó Roboto Bold para el rótulo.

**2026-11-01 · Ajustes** (`dfdebc2`, `901b856`). Logo de la maestría,
resaltados, tamaños y autorías de las citas. La copia de la bandada deja de
dibujar los puntos hasta que llega el primer dato.

**2026-11-02 · Instrucciones en pantallas propias** (`dadb084`). Las del
guante y la EMG pasan a las pantallas 6 y 8 (Paso 2 y Paso 3). Numeración
actual: bandada 5, guante 7, EMG 9, cierre 10.

**2026-11-03 · Pantalla 11, v1: las capturas apiladas** (`80dcfc3`, archivo
conservado en `prototipos/composicion_v1.html`). Una página aparte, y no una
pantalla más de `experiencia.html`, porque iba a convertirse en el editor.
Las copias pasan a pintar el fondo por CSS (captura transparente) y guardan,
además del PNG, las medidas y los `elementos` (registro `version: 1`, misma
base y mismas claves). La 11 apilaba los tres PNG en tres canvas
(EMG, guante, bandada), cada uno encajado sin deformar, compuestos entre sí
con `source-over`. La tecla Inicio del operador se mudó de la 10 a la 11, y
`DISPOSITIVO_SIGUIENTE` pasó a llamarse `SALIDA`.

**2026-11-04 · Pantalla 11, v2, etapas 1 y 2: escena en vector, seleccionar,
mover, eliminar, deshacer** (`27feb00`). Un solo canvas con la escena,
forma común para los tipos, marco encajado, multiply sobre la EMG,
respaldo `imagen`, tecla V y `#demo`. `PERMITIDAS` nace con `mover` y
`eliminar`; deshacer por instantáneas.

**2026-11-07 · Etapa 3: agrandar, marco, copiar y pegar** (`ed4fcf3`). Se
suman `escalar` y `copiar` a la tabla, el tirador y la rueda (con ráfagas
como un solo paso), el marco que toca, el portapapeles de copias, y el
script se reordena en capas (tipos, operaciones, editor, gestos).

**2026-11-07 · Confirmación de la captura** (`71899c3`). La barra
espaciadora pasa a pulsarse dos veces en las pantallas 5, 7 y 9; el guion
dice "pulsando dos veces".

**2026-11-07 · Sonido, etapa 1: ruteo** (`ed4b867`). `tools/audio_helm.sh` y
`tools/diagnostico_audio.html`, que descubrió que en `file://` hace falta el
permiso concedido de antemano (perfil de la sala).

**2026-11-07 · Sonido, etapa 2: el guante graba** (`f5e4db3`). Grabación de
la fuente de Helm en la copia del guante, registro `version: 2` con
`sonido`, `t` en los anillos y `t0`/`t1` en los discos. Probado en Brave con
Helm y las teclas A, L y F: el `.webm` se descarga desde IndexedDB y se
escucha.

**2026-11-07 · Sonido, etapas 3 a 5: modo final, loop y movimiento**
(`b527d00`). La 11 pasa a tener dos modos: la barra espaciadora dos veces
cierra la edición, guarda `"composicion"` con sus `fuentes` y arranca el
loop; los `tiempos` llegan a la escena; `#demo` suena. En el mismo commit la
escena se mueve con el sonido: anillos y discos por eventos, bandada y EMG
por análisis (`REACCIONES`, `SENALES`), y `relojSonido()` descuenta la
latencia de salida.

**2026-11-07 · Nombres simples para las copias.** Las tres copias dejan el
nombre de su página activa con sufijo `_experiencia` y pasan a
`bandada.html`, `guante_percusion.html` y `emg_acumulacion.html`, más
fáciles de leer en `SALIDA` y en la barra del navegador. La documentación
dispersa en `prototipos/` se consolidó en `documentacion/`, un archivo por
tema.

**2026-11-08 · Descargar el video.** En el modo final con sonido, un
botón flotante graba en tiempo real una vuelta de la composición animada
con su sonido (`captureStream` + `MediaRecorder`) y la descarga en MP4
(§5.6). Usa un lienzo propio de 1280×720 con el fondo pintado y un reloj
sin la latencia de salida. `dibujarEscena` recibe el cuadro como parámetro,
para que la pantalla y el video dibujen cada uno el suyo.

**2026-11-09 · Paleta nueva.** Las copias del guante y de la EMG cambian de
colores con una paleta elegida en `tools/paleta_colores.html`, que muestra
las dos visualizaciones solas y superpuestas en la composición. Guante:
anillos amarillo limón `#eef202` y gris cálido `#847575`, disco negro
azulado `#151923`. EMG: cinco familias derivadas de cinco colores base. La
física, el `multiply` y las opacidades no cambian. `#demo` usa los colores
nuevos. Las capturas guardan el color de cada elemento, así que no hubo que
migrar IndexedDB: la paleta alcanza a las capturas posteriores.

**2026-11-09 · Color y opacidad en la composición.** Se suma `color` a
`PERMITIDAS` (los cuatro tipos) y, en el modo edición, una muestra discreta
arriba a la izquierda con el color de la selección; al tocarla, un panel con
el selector de color, la opacidad y, con más de un elemento seleccionado,
una casilla por tipo presente que decide a qué tipos de la selección les
llega el cambio (§4.2). Una primera versión tenía una sola casilla "aplicar
a todos los del mismo tipo" que alcanzaba también a lo no seleccionado; se
reemplazó por las casillas por tipo, que se quedan dentro de la selección.
Probado en Brave headless con `#demo`: selección, ráfagas de un solo paso,
casillas con un marco sobre los cuatro tipos (desmarcar círculos y puntos
los deja intactos), Ctrl+Z, y que ← y Esc con el foco en el panel no navegan
ni deseleccionan.
