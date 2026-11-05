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
