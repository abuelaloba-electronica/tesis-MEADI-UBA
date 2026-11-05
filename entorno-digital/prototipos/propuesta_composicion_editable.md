# Propuesta: composición editable en la pantalla 11

## Requerimiento

Hoy la pantalla 11 (`experiencia/composicion.html`) muestra las tres capturas
como tres canvas superpuestos, cada uno con su PNG. La etapa siguiente tiene
que dejar que la persona **intervenga** lo capturado: mover elementos,
agrandarlos, copiarlos y pegarlos, eliminarlos. No todas las operaciones valen
para todos los elementos (por ejemplo, los puntos de la bandada no se agrandan),
así que hace falta un conjunto de operaciones y una forma de declarar a qué
tipos de elemento se aplica cada una.

Se maneja con **mouse y teclado**. La composición intervenida **se guarda** en
IndexedDB y se puede **exportar como PNG**.

## Lo que ya tenemos

La captura de cada página `_experiencia` guarda, además del PNG, la lista de
elementos en px CSS y en orden de dibujo (ver `cambios_experiencia_composicion.md`):

| Origen | Tipo | Datos | Cantidad típica |
|---|---|---|---|
| bandada | `punto` | x, y, r, alpha, color | decenas (incluye copias fantasma de los bordes) |
| guante | `anillo` | dedo, x, y, r, grosor, color, alpha, `modo: "multiply"` | uno por golpe |
| guante | `disco` | x, y, r, color, alpha, `modo: "multiply"` | uno por presión del FSR |
| emg | `cuadrilatero` | 4 vértices en px, color, alpha, familia (+ datos normalizados) | hasta algunos cientos |

Con eso alcanza para redibujar todo en vector: son círculos, anillos y
polígonos rellenos. Unos cientos de figuras se redibujan enteras en cada cuadro
sin costo apreciable en Canvas 2D, así que no hace falta ninguna optimización.

## Alternativas

### A. Capas intercambiables (lo que hay, más una capa activa)

Se mantienen los tres canvas. Una tecla (1/2/3) elige la capa activa, que pasa
adelante; las otras se atenúan y no reciben clics. Dentro de la capa activa se
editan sus elementos, redibujados en vector.

- A favor: es el cambio más chico; la composición entre capas no cambia.
- En contra: obliga a la persona a entender qué es una "capa" y a qué
  dispositivo pertenece cada cosa antes de poder tocarla. Traer una capa al
  frente cambia lo que se ve mientras se edita, y no permite poner un
  cuadrilátero de la EMG por encima de un punto de la bandada: el orden queda
  fijo por origen para siempre.

### B. Un solo lienzo con todos los elementos

Al entrar a la 11 se vuelcan los elementos de las tres capturas, en el orden
actual (EMG, guante, bandada), en **una única lista ordenada** —la escena— y se
dibuja todo en un canvas. Cada elemento se puede seleccionar directamente,
venga de donde venga, y el orden de apilado pasa a ser por elemento.

- A favor: la persona ve una sola composición y toca lo que ve. Permite
  mezclar el orden entre orígenes (traer al frente, enviar al fondo).
- En contra: aparece el problema de la superposición —un elemento grande
  encima tapa a los de abajo— y hay que resolverlo con herramientas de
  selección (abajo).

### C. Lienzo único con filtros por origen (B + lo bueno de A)

Igual que B, pero cada elemento conserva su `origen` y hay teclas para
**bloquear** u **ocultar** los elementos de un origen. Bloqueado: se ve, pero
el clic lo atraviesa. Es la "capa activa" de A sin su costo: no reordena nada,
sólo deja de interceptar.

**Recomendación: C.** La interacción por defecto es la de B (tocar lo que se
ve), y los filtros por origen quedan como recurso para cuando la superposición
molesta.

## Diseño de la recomendación

### Modelo: la escena

Al cargar, cada elemento de cada captura se convierte a un elemento de escena
con forma común:

```js
{
  id: 17,                 // único, para selección y deshacer
  origen: "emg",          // "emg" | "guante" | "bandada"
  tipo: "cuadrilatero",   // decide qué operaciones admite
  x: 412, y: 233,         // centro, en px CSS de la pantalla actual
  escala: 1,              // la transformación que editan las operaciones
  forma: { ... },         // geometría relativa al centro, sin tocar
  estilo: { color, alpha, grosor?, modo? }
}
```

- `punto`, `anillo`, `disco`: el centro es (x, y) y `forma` guarda `r`.
- `cuadrilatero`: el centro es el centroide de los cuatro vértices y `forma`
  guarda los vértices relativos a ese centro. Así mover y escalar son la misma
  cuenta para todos los tipos: `translate(x, y) · scale(escala)`.
- La conversión de coordenadas de captura a pantalla es el mismo encaje
  *contain* que hoy se aplica al PNG (a partir de `ancho`/`alto` del registro),
  aplicado una vez al construir la escena.
- Las copias fantasma de la bandada (un pájaro partido por un borde se
  dibuja también del lado opuesto) entran como puntos independientes: en una
  composición quieta el espacio ya no es continuo, y medio punto en un borde
  es sólo medio punto. Nunca caen enteras fuera del encuadre: una copia sólo
  existe si el pájaro toca un borde.

### Dibujo

Se deja de dibujar el PNG: cada cuadro limpia el canvas y recorre la escena en
orden, con el `color`, `alpha` y `modo` de cada elemento. El PNG queda como
respaldo si una captura no trae `elementos` (registros anteriores a `version: 1`):
en ese caso esa captura entra como un único elemento `imagen`, que sólo admite
ocultarse.

Cada elemento se dibuja con su `modo`. En la v1 el `multiply` del guante
valía sólo dentro de su capa; en el lienzo único los anillos y discos
multiplican también sobre los cuadriláteros de la EMG que tengan debajo, igual
que entre ellos: se oscurecen donde se cruzan en lugar de taparlos con
transparencia.

Para verificar la fidelidad del redibujo, una tecla de diagnóstico alterna
entre la escena en vector y los PNG originales: si la escena está bien
construida, al alternar no se mueve nada.

### Selección y superposición

- **Clic**: selecciona el elemento de más arriba bajo el puntero.
  **Mayús+clic** suma o quita de la selección. **Arrastrar sobre el vacío**:
  marco de selección (elige todo lo que toca, incluso lo que está debajo de
  otros: es la forma más directa de alcanzar lo tapado).
- **Clic repetido en el mismo lugar** baja por la pila: el segundo clic elige
  el elemento de abajo del seleccionado, el tercero el siguiente, y vuelve a
  empezar. Resuelve "quiero lo de abajo" sin mover ni borrar lo de arriba.
- **Prueba de impacto por tipo**, para que nada tape más de lo que se ve:
  - `punto`: distancia al centro ≤ r, con un mínimo de ~8 px (los puntos de la
    bandada son chicos);
  - `anillo`: sólo el trazo, |d − r| ≤ grosor/2 + tolerancia; el hueco no
    intercepta, así un anillo grande no bloquea lo que rodea;
  - `disco`: d ≤ r;
  - `cuadrilatero`: punto en polígono (`ctx.isPointInPath` con el mismo
    trayecto con que se dibuja).
  - Los elementos casi transparentes (alpha muy bajo) cuentan igual: si se
    ven, se pueden tocar.
- **Filtros por origen**: `1`, `2`, `3` bloquean o desbloquean EMG, guante y
  bandada (el clic los atraviesa); `Mayús+1/2/3` los ocultan. Un indicador
  discreto en el pie muestra qué está bloqueado u oculto. Lo oculto no se
  exporta: ocultar es una intervención más, y bloquear es la herramienta para
  "que no estorbe".
- **Orden**: `]` trae la selección al frente, `[` la envía al fondo.

La selección se marca con un recuadro punteado alrededor de cada elemento
(dibujado aparte, encima de la escena, nunca en la exportación) y un tirador en
la esquina del recuadro conjunto para escalar.

### Operaciones y permisos

Las operaciones se declaran en una tabla, y los permisos en otra, indexada por
tipo. El código de interacción nunca pregunta por tipos concretos: pregunta si
la operación está permitida.

```js
const OPERACIONES = {
  mover:    (el, dx, dy) => { el.x += dx; el.y += dy; },
  escalar:  (el, k, cx, cy) => { /* escala respecto del centro de la selección */ },
  duplicar: ...,   // copia en la escena, desplazada 16 px, encima de todo
  copiar:   ...,   // al portapapeles interno (no el del sistema)
  pegar:    ...,
  eliminar: ...,
  alFrente: ..., alFondo: ...,
};

const PERMITIDAS = {
  punto:        ["mover", "duplicar", "copiar", "pegar", "eliminar", "alFrente", "alFondo"],
  anillo:       ["mover", "escalar", "duplicar", "copiar", "pegar", "eliminar", "alFrente", "alFondo"],
  disco:        ["mover", "escalar", "duplicar", "copiar", "pegar", "eliminar", "alFrente", "alFondo"],
  cuadrilatero: ["mover", "escalar", "duplicar", "copiar", "pegar", "eliminar", "alFrente", "alFondo"],
  imagen:       [],
};
```

**Selección mixta**: una operación se aplica a los elementos de la selección
que la admiten y deja quietos a los demás. Si ninguno la admite, no pasa nada
(y el tirador de escalar no aparece si la selección es sólo de puntos).
Escalar una selección que mezcla puntos y anillos agranda los anillos y separa
los puntos respecto del centro, pero no les cambia el radio: es lo esperable
("la bandada se abre") y respeta la regla.

Agregar una operación nueva más adelante (rotar, cambiar color, cambiar
opacidad) es una entrada en `OPERACIONES` y su nombre en las filas de
`PERMITIDAS` que la admitan. Rotar, por ejemplo, tiene sentido para
cuadriláteros y para nada más.

### Teclado y mouse

| Entrada | Acción |
|---|---|
| clic / Mayús+clic / arrastre en vacío | seleccionar / sumar / marco |
| clic repetido en el mismo lugar | elegir el de abajo |
| arrastrar un seleccionado | mover |
| tirador de la esquina, o rueda del mouse | escalar |
| Ctrl+C / Ctrl+V / Ctrl+D | copiar / pegar / duplicar |
| Supr o Retroceso | eliminar |
| Ctrl+Z / Ctrl+Mayús+Z | deshacer / rehacer |
| `[` / `]` | al fondo / al frente |
| `1` `2` `3` (con Mayús: ocultar) | bloquear EMG / guante / bandada |
| Esc | deseleccionar |
| `P` | exportar PNG |
| ← | volver a la 10 (sin cambios) |
| Inicio | operador: borrar capturas **y composición**, volver a la 0 |

Las flechas no mueven la selección, para no chocar con ← que navega.

**Deshacer** es una pila de instantáneas de la escena (unas decenas de pasos):
con unos cientos de elementos, copiar la lista entera por paso es barato y
mucho más simple que invertir cada operación. Para una persona que prueba sin
saber qué hace cada tecla, poder volver atrás importa más que cualquier
operación nueva.

### Persistencia y exportación

- La escena se guarda en la misma base y el mismo almacén, con la clave
  `"composicion"`: `{ version, ancho, alto, elementos, fuentes, fecha }`, con
  un retardo corto después de cada cambio. `fuentes` anota la `fecha` de cada
  captura usada.
- Al entrar a la 11: si hay composición guardada y sus `fuentes` coinciden con
  las capturas actuales, se carga esa; si alguna captura cambió o apareció una
  nueva, se reconstruye desde las capturas. Inicio ya hace `clear()` del
  almacén, así que borra también la composición sin cambios.
- `P` exporta: se dibuja la escena (sin marcas de selección ni elementos
  ocultos) en un canvas fuera de pantalla al `devicePixelRatio` actual, sobre
  fondo blanco, y se descarga con un `<a download>` como
  `composicion-AAAAMMDD-HHMM.png`. Funciona en Chrome desde `file://`.

### Probar sin capturar las tres

Hoy, para ver la 11 hay que recorrer las tres páginas con el hardware. Para
trabajar el editor, `composicion.html#demo` (ya está desde la etapa 1) arma una escena sintética con los
cuatro tipos (puntos, anillos, un disco y cuadriláteros superpuestos) sin leer
la base y sin guardar. Es el equivalente, para esta pantalla, de las versiones
simuladas sin sufijo `_dispositivo`.

Para la lógica, conviene que la escena y las operaciones sean funciones puras
sobre la lista de elementos, separadas del DOM: así un
`tools/harness_composicion.js` puede construir una escena desde registros de
captura falsos y verificar en Node que los permisos se respetan (escalar no
cambia `r` de un punto), que deshacer vuelve exactamente al estado anterior,
que pegar no comparte objetos con lo copiado y que el orden de la escena
reconstruida es EMG, guante, bandada.

## Etapas

Cada una se puede probar sola, con `#demo`:

1. **Escena en vector.** Construir la escena desde las capturas y dibujarla
   en lugar de los PNG; tecla de diagnóstico para comparar con los PNG.
2. **Seleccionar, mover, eliminar, deshacer.**
3. **Catálogo de operaciones**: escalar, duplicar, copiar/pegar, orden, con
   la tabla de permisos.
4. **Superposición**: clic repetido, marco, bloquear/ocultar por origen.
5. **Guardar y exportar.**

Por la convención de versionado por copia, la `composicion.html` actual se
conserva como `prototipos/composicion_v1.html` antes de empezar, y el salto
deja su `cambios_experiencia_composicion_v2.md`. Las instrucciones van en un **panel que se puede colapsar u ocultar y
volver a mostrar**, como el de las páginas de captura; su texto entra al guion
(`experiencia-interactiva-guion.md`), que hoy dice "Sin texto" para la 11.

## Decisiones tomadas

- **Multiply**: cada elemento con su `modo`; el guante multiplica sobre todo
  lo que tenga debajo, también la EMG.
- **Copias fantasma**: puntos independientes, sin agrupar ni descartar.
- **Lo oculto** no se exporta.
- **Fondo del PNG exportado**: blanco.
- **Instrucciones**: panel colapsable que se puede ocultar y volver a mostrar.
