# Experiencia: pantalla 11, composición v2 (escena editable)

Segunda versión de `experiencia/composicion.html`, hacia el editor descripto
en `propuesta_composicion_editable.md`. Se hace por etapas que se pueden probar
por separado; este registro crece con cada una. La v1, que apilaba los tres
PNG en tres canvas, quedó en `prototipos/composicion_v1.html`.

## Etapa 1: la escena en vector

### Por qué cada cambio

**Un solo canvas con todos los elementos, en lugar de un canvas por captura.**
Para que la persona pueda tocar lo que ve, venga del dispositivo que venga, sin
tener que traer una capa al frente (ver la comparación de alternativas en la
propuesta). Los `elementos` de las tres capturas se vuelcan en una sola lista
ordenada, la escena: primero los de la EMG, después los del guante, arriba los
de la bandada, cada grupo en su orden de dibujo. Es el mismo apilado que la
v1, pero ahora por elemento: en las etapas siguientes un elemento podrá
cambiar de lugar en la pila sin arrastrar a su captura entera.

**Los elementos se redibujan en vector y el PNG deja de usarse.** Editar un
elemento obliga a redibujar la escena, y eso sólo se puede hacer desde los
datos. Además, la bandada no usa `devicePixelRatio`, así que su PNG se veía
más blando que las otras dos en una pantalla de alta densidad; en vector se ve
tan nítida como el resto.

**Forma común para los cuatro tipos.** Cada elemento de escena tiene un
centro (`x`, `y`), una `escala`, su geometría relativa al centro (`forma`) y
su aspecto (`estilo`). Para el cuadrilátero el centro es el promedio de los
vértices. Así mover y escalar van a ser la misma cuenta para cualquier tipo
(`translate · scale`), y la tabla de permisos de la etapa 3 decide qué tipo
admite qué, sin casos especiales en el código de interacción.

**El marco.** Las coordenadas de la escena viven en el tamaño de pantalla de
la primera captura, y al dibujar ese marco se encaja (*contain*) en la ventana.
Un cambio de tamaño de ventana no toca los elementos, y el día que se guarde la
escena (etapa 5) no depende de la ventana en que se abrió. Si una captura se
hizo en otra pantalla, se encaja en el marco al construir la escena, como
antes se encajaba su PNG en la ventana.

**Multiply del guante también sobre la EMG.** Cada elemento se dibuja con su
`modo`. En la v1 el multiply valía sólo dentro de la capa del guante y entre
capas era source-over; ahora un anillo multiplica sobre el cuadrilátero que
tenga debajo, igual que sobre otro anillo. Fue una decisión, no un efecto
colateral: es coherente con cómo se mezclan los golpes entre sí.

**Copias fantasma de la bandada como puntos sueltos.** La captura las guarda
como un `punto` más y así entran a la escena. No se agrupan con su pájaro
original ni se descartan: en una composición quieta el espacio ya no es
continuo.

**Respaldo para capturas sin `elementos`.** Un registro anterior a
`version: 1` entra entero como un elemento `imagen` que dibuja su PNG. Un
elemento de tipo desconocido o con datos no numéricos se ignora en silencio,
como las líneas serie que una página no reconoce.

**Tecla V de diagnóstico.** Alterna entre la escena y los PNG originales
apilados como en la v1. Si la escena está bien construida, al alternar no se
mueve nada; lo único que tiene que cambiar es el cruce de anillos y discos con
cuadriláteros (por el multiply) y la nitidez de la bandada.

**`composicion.html#demo`.** Una escena sintética con semilla fija:
cuadriláteros superpuestos de dos familias, anillos de los dos dedos, un disco
del FSR, una nube de puntos y un pájaro partido entre los bordes izquierdo y
derecho. Pasa por el mismo camino de conversión que las capturas reales (se
arma como registros con `elementos`), no lee ni borra la base, e Inicio ahí
vuelve a la 0 sin borrar nada. Sirve para trabajar las etapas siguientes sin
recorrer las tres páginas con el hardware.

**`window.__escena()`.** Enganche de diagnóstico para la consola o un harness
de Node, como `window.__diag` en la bandada. La página no lo usa.

### Validación

- `node --check` sobre el script.
- Una prueba descartable en Node corrió la página con un DOM y un canvas
  falsos:
  - en `#demo`: 14 cuadriláteros, 12 anillos, 1 disco y 42 puntos; 13 trazos
    en multiply (anillos y disco) y el resto en source-over;
  - con un IndexedDB falso: una captura de la EMG con un elemento de tipo
    desconocido y otro con `x: NaN` (los dos descartados), una del guante
    capturada a 640×400 (encajada con escala 2 en el marco de 1280×800: centro,
    radio y grosor duplicados) y una de la bandada sin `elementos` (entra como
    `imagen`). V cambia a los tres PNG y lo anota en el pie.
- Captura headless de Firefox de `composicion.html#demo`: renderiza los cuatro
  tipos, el multiply de los anillos sobre los cuadriláteros azules se ve
  oscuro, y el pájaro partido asoma en los dos bordes.
- **Falta**: abrirla en Chrome de escritorio después de capturar las tres
  páginas, y alternar con V para comparar contra los PNG reales.

## Etapa 2: seleccionar, mover, eliminar, deshacer

| Entrada | Acción |
|---|---|
| clic | selecciona el elemento de más arriba bajo el puntero |
| Mayús+clic | lo suma a la selección o lo quita |
| clic al vacío, Esc | deselecciona |
| arrastrar | mueve la selección |
| Supr, Retroceso | elimina la selección |
| Ctrl+Z / Ctrl+Mayús+Z o Ctrl+Y | deshace / rehace |

### Por qué cada cambio

**La tabla de permisos ya existe, con dos operaciones.** `PERMITIDAS` dice,
por tipo, qué operaciones admite; el código de puntero y teclado sólo pregunta
`permite(el, op)`. Hoy los cuatro tipos admiten `mover` y `eliminar`, y la
`imagen` de respaldo no admite nada, así que ni siquiera se puede seleccionar.
La etapa 3 agrega filas y columnas a esa tabla, no condiciones en el código.

**Cada tipo intercepta sólo lo que se ve de él.** Un anillo responde en su
trazo y no en el hueco: si respondiera en todo su círculo, un anillo grande
bloquearía todo lo que rodea. Un punto de la bandada responde en un radio de al
menos 8 px de pantalla, porque los más chicos miden 2-3 px y serían
imposibles de agarrar. Los cuadriláteros usan punto en polígono. Las
tolerancias van en px de pantalla y no del marco, para que no cambien si la
escena se encaja más chica en una ventana más chica.

**Clic sobre algo ya seleccionado no cambia la selección.** Así se arrastra un
grupo entero agarrándolo de cualquiera de sus elementos, como en cualquier
editor.

**El arrastre no deja perder elementos.** El centro de un elemento no puede
salir del marco: un elemento arrastrado afuera sería imposible de recuperar.
El límite se aplica al desplazamiento del grupo y no a cada elemento, para que
el grupo no se deforme contra un borde. Una copia fantasma de la bandada,
cuyo centro ya está afuera, no puede alejarse más, pero sí volver.

**Un clic no es un arrastre.** Por debajo de 3 px de movimiento el gesto es
sólo de selección y no agrega un paso al historial.

**Deshacer por instantáneas.** Antes de cada cambio se guarda una copia de la
lista de elementos (hasta 50 pasos). Con unos cientos de elementos es barato,
y es mucho más simple y robusto que saber invertir cada operación, cosa que
con escalar, pegar y reordenar se volvería frágil. Un elemento eliminado y
recuperado vuelve a su lugar en la pila, no arriba de todo. La selección
sobrevive al deshacer en lo que siga existiendo.

**Se repinta sin redimensionar.** En la etapa 1 cada dibujo reasignaba
`width`/`height` del canvas, lo que lo borra y lo realoca; durante un
arrastre son decenas de veces por segundo. Ahora eso pasa sólo en `resize`, y
los eventos de puntero piden un repintado por cuadro como mucho.

**La selección se marca fuera de la escena.** Un recuadro blanco con un
punteado negro encima, que se lee sobre cualquier color, dibujado en px de
pantalla (grosor constante) después de la escena. No es parte de los
elementos, así que no va a salir en la exportación.

**Con V la edición queda en pausa.** Los PNG originales no reflejan los
cambios: editar mirándolos sería editar a ciegas.

**Sin panel de instrucciones todavía.** Va a llegar cuando el conjunto de
operaciones esté completo, para no reescribirlo (y el guion con él) en cada
etapa.

### Validación

- `node --check` sobre el script.
- Una prueba descartable en Node, con DOM, canvas, IndexedDB y eventos de
  puntero falsos, sobre una escena armada a propósito: un cuadrilátero, un
  anillo encima con el mismo centro, un punto encima de ambos y una copia
  fantasma en el borde izquierdo. Verificó, entre otras cosas: el clic en el
  centro elige el punto; arrastrar desde el trazo del anillo mueve el anillo
  y desde su hueco mueve el cuadrilátero; Mayús+clic suma y quita; un grupo
  arrastrado contra el borde se frena con los centros en 0; Supr elimina y
  Ctrl+Z lo devuelve a su lugar en la pila; un clic sin arrastre no agrega
  pasos al historial; con V no se edita nada; el cursor cambia sobre el
  trazo y no sobre el vacío. 23 de 23.
- Captura headless de Firefox de `#demo`: idéntica a la de la etapa 1.
- **Falta**: probarla con el mouse en Chrome.

## Etapa 3: agrandar, seleccionar por área, copiar y pegar

Toma de la etapa 3 de la propuesta el escalado y copiar/pegar, y adelanta de
la etapa 4 el marco de selección. Quedan para después duplicar, el orden
(`[` `]`), el clic repetido que baja por la pila y bloquear/ocultar por
origen.

| Entrada | Acción |
|---|---|
| arrastrar en el vacío | marco: selecciona todo lo que toca, aunque esté tapado |
| Mayús + arrastrar en el vacío | suma lo del marco a la selección |
| tirador de la esquina, rueda | agranda o achica la selección |
| Ctrl+C / Ctrl+V | copia la selección / la pega desplazada, encima de todo |

### Por qué cada cambio

**Agrandar es un permiso de tipo, no de origen.** `escalar` está en las filas
de `anillo`, `disco` y `cuadrilatero` de `PERMITIDAS` y no en la de `punto`.
Como cada origen tiene sus propios tipos (guante: anillos y discos; EMG:
cuadriláteros; bandada: puntos), eso es exactamente "el guante y la EMG sí,
la bandada no", y el código de interacción sigue sin preguntar por tipos ni
por orígenes: sólo `permite(el, "escalar")`.

**En una selección mixta los puntos se separan, pero no crecen.** Escalar
multiplica la escala de lo que admite `escalar` y la distancia al centro de
lo que admite `mover`. Un marco sobre un disco y unos puntos agranda el disco
y abre la bandada alrededor, sin cambiarle el radio a ningún punto. Si la
selección es sólo de puntos no aparece el tirador y la rueda no hace nada.

**El centro del escalado es el de la caja de la selección.** Para un solo
elemento coincide con su centro; para un grupo, todo crece desde el medio
del grupo, que es lo que se ve marcado con el recuadro conjunto.

**El tirador no salta.** El factor es cuánto se alejó el puntero del centro
respecto de donde lo agarró, no respecto de la esquina exacta: tomarlo un par
de px adentro no produce un salto al empezar.

**Límites del escalado.** La escala de cada elemento queda entre 0,2 y 8
veces el tamaño capturado, y ningún centro sale del marco (la misma regla que
al arrastrar, para no perder elementos fuera de la pantalla). Se acota el
factor del grupo, no cada elemento, para que el grupo no se deforme contra un
borde.

**Una ráfaga de rueda es un solo paso de deshacer.** Cada evento de la rueda
escala un poco; si cada uno fuera un paso, deshacer un escalado costaría
decenas de Ctrl+Z. Los eventos separados por menos de 350 ms forman un solo
gesto, que se cierra antes con cualquier tecla o clic: Ctrl+Z justo después
de girar la rueda deshace el escalado entero.

**El marco toca, no contiene.** Elige todo lo que cruza el rectángulo, con la
misma idea de la prueba de impacto: un anillo cuenta sólo por su corona (un
marco trazado en el hueco no lo elige), un cuadrilátero por su polígono (no
por su caja) y un círculo por su radio real. Alcanza también lo tapado, que
es la forma directa de llegar a lo que está debajo. La selección se actualiza
mientras se arrastra, para ver qué va a quedar adentro.

**El portapapeles guarda copias, no referencias.** Copiar y después mover o
borrar el original no cambia lo que se pega, y cada pegado crea elementos
con id propio que no comparten ningún objeto con el portapapeles ni con otro
pegado. Lo pegado va encima de todo, corrido 16 px por cada pegado de la
misma copia (para que no caiga exactamente encima del anterior), y queda
seleccionado, listo para arrastrarlo. Es interno y no el del sistema: no hay
otra aplicación que entienda estos elementos.

**`copiar` es un permiso; `pegar` no.** La propuesta ponía los dos en la
tabla, pero pegar actúa sobre el portapapeles, no sobre la selección, y el
portapapeles sólo contiene lo que ya se pudo copiar.

**El pie dice cuánto hay seleccionado y cuánto copiado.** Copiar no cambia
nada en la pantalla; sin eso no habría forma de saber si funcionó.

**El script se reordenó en capas.** Con tres operaciones más, los `switch`
por tipo repartidos en el dibujo, la prueba de impacto y la caja iban a
crecer en cada lugar a la vez. Ahora:

- *Tipos*: cada tipo es una estrategia en `TIPOS` con la misma interfaz
  (`desdeCaptura`, `dibujar`, `caja`, `toca`, `tocaRect`). Un tipo nuevo es
  una entrada ahí y su fila en `PERMITIDAS`; no hay que tocar nada más.
- *Operaciones*: funciones sobre listas de elementos, sin DOM ni estado del
  editor (`prepararTraslado`, `prepararEscalado`, `copiar`, `pegar`,
  `eliminar`). Las de los gestos continuos devuelven una transformación
  preparada que se aplica muchas veces desde el estado inicial, así que el
  límite se calcula una sola vez y no se acumula error.
- *Editor*: historial (un objeto con `foto`, `registrar`, `deshacer`,
  `rehacer`), selección, portapapeles y los comandos del teclado, que pasan
  por `aplicarCambio` para que cada uno sea un paso de deshacer.
- *Gestos*: mover, escalar con el tirador y el marco son objetos con la
  misma interfaz (`mover`, `terminar`, `pintar` opcional). Al apretar,
  `iniciarGesto` elige uno según lo que hay bajo el puntero; después los
  eventos de puntero sólo le pasan el movimiento y filtran el umbral de
  arrastre, sin saber qué gesto es. La vista dibuja lo que el gesto pinte
  (el rectángulo del marco) sin conocerlo.

### Validación

- `node --check` sobre el script.
- Una prueba descartable en Node con DOM, canvas, IndexedDB y eventos de
  puntero, rueda y teclado falsos, sobre una escena de un cuadrilátero, un
  anillo con el mismo centro, un disco y tres puntos. Verificó, entre otras
  cosas: el tirador lleva el anillo a escala 2 sin moverle el centro ni
  tocarle `forma.r`, y se deshace y rehace; un punto solo no muestra tirador
  ni responde a la rueda; un marco elige los dos puntos de abajo y la rueda
  no los agranda; Ctrl+C y Ctrl+V los pegan corridos 16 px y luego 32, con
  ids nuevos y sin compartir objetos; Supr borra lo pegado y Ctrl+Z lo
  devuelve; un marco sobre el disco y dos puntos agranda el disco, separa los
  puntos sin cambiarles el radio, y toda la ráfaga de rueda se deshace de un
  Ctrl+Z; la escala se frena en 8 y en 0,2; un grupo agrandado al máximo no
  saca ningún centro del marco; un marco dentro del hueco del anillo elige el
  punto y no el anillo; una franja que cruza los lados del cuadrilátero sin
  contener vértices lo elige; Mayús+marco suma; con V nada escala ni se
  copia. 42 de 42.
- Captura headless de Firefox de `#demo`: idéntica a la de la etapa 1.
- **Falta**: probarla con el mouse y la rueda en Chrome, y ver si 350 ms de
  pausa separan bien las ráfagas de una rueda real y de un touchpad.
