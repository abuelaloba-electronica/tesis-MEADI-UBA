# Cambios en `bandada_prototipo_v3.html` respecto a v2

## Contexto

Punto de partida: `bandada_prototipo_v2.html`, que ya implementaba boids con
grilla espacial (ver `instrucciones_mejoras_bandada.md`), pero el resultado
visual no resultaba atractivo (pájaros como puntos cuadrados) y, con el uso,
la bandada terminaba colapsando en una bola densa que se movía como un solo
bloque.

Se pidió incorporar elementos formales de dos implementaciones de
referencia:

- **[flock2](https://github.com/ramakarl/flock2)** (Rama Hoetzlein) — modelo
  de orientación social: el rumbo (heading) se trata como un objetivo hacia
  el que el pájaro gira, con banking al virar, en vez de un vector de
  velocidad que se reemplaza de golpe.
- **[Starling-Simulation](https://github.com/techcentaur/Flocking-Simulation)**
  (techcentaur) — shader de boids con zonas concéntricas
  (separación/alineación/cohesión) suavizadas con curvas tipo coseno en los
  bordes, y renderizado como silueta orientada (no como punto).

Ambas se leyeron directamente desde el repositorio (README y fuente) antes de
implementar, no de memoria.

## v3 — primera versión: boids orientados + banking

**Render:** cada pájaro pasa de ser un `fillRect` cuadrado a un triángulo
orientado según su `heading`, con las alas asimétricas según cuánto está
usando de su giro máximo en ese frame (`bank`), sugiriendo una inclinación al
virar. Todos los triángulos del frame se acumulan en un único `path` y se
pintan con un solo `fill()` (mucho más barato que miles de llamadas
individuales).

**Vecinos por zonas concéntricas** (inspirado en Starling-Simulation): en vez
de radios superpuestos (v2: separación siempre + alineación/cohesión
siempre), se clasifican en tres zonas excluyentes — separación / alineación /
cohesión — con un peso en "joroba" (`sin(t·π)`, sube desde 0 y vuelve a 0 en
los bordes de cada zona) para que un vecino que cruza de zona no produzca un
salto brusco.

**Rumbo objetivo, no velocidad directa** (inspirado en flock2): la suma de
separación + alineación + cohesión + viento + bordes + depredador ya no se
asigna directamente como nueva velocidad. Se usa solo para calcular un rumbo
deseado (`atan2`); el pájaro gira hacia ese rumbo a una velocidad angular
máxima por segundo, y el módulo de la velocidad se suaviza por separado. Esto
evita el "salto" de dirección de un frame a otro.

Se mantiene sin cambios la idea original: X/Y como viento, Z como peso de
cohesión, magnitud del vector como turbulencia/depredador,
`window.updateAccel(x,y,z)` como punto de conexión futuro con el
acelerómetro real.

## v3 — segunda ronda: por qué la bandada seguía apelmazándose

Con el tiempo de uso, dentro de cada agrupación los pájaros se seguían
juntando hasta formar una bola densa. Se diagnosticó y corrigió en dos
pasadas.

### Bug de cohesión sin escalar por tiempo

El término de cohesión no multiplicaba por `dt`, a diferencia de separación,
alineación, viento y bordes. Se aplicaba una vez por frame (no por segundo,
≈60× más fuerte de lo previsto) sin nada que lo compensara a media
distancia → la bandada colapsaba en espiral hasta un punto en pocos
segundos. Corregido agregando el `* dt` faltante.

### Núcleos: dispersión en 2-4 sub-grupos que se separan y reúnen

Se agregó (a pedido explícito, no está en ninguna de las dos referencias)
un mecanismo de "núcleos": cada pájaro queda asignado a uno de 1-4 núcleos
(slider en el panel) que orbitan el centro del lienzo con un tirón de largo
alcance muy débil (≪ cohesión local). El radio de esa órbita sube y baja en
un ciclo coseno de ~40s: en el mínimo los núcleos coinciden (bandada como un
solo grupo), en el máximo quedan repartidos (bandada separada en
sub-grupos). La forma orgánica de cada sub-grupo la sigue dando el flocking
local; esto solo sesga hacia dónde gravita cada porción de la bandada.

### Por qué corregir la cohesión no alcanzaba: dos causas más

Con el bug de `dt` corregido, la densidad interna de cada núcleo seguía
creciendo sin límite. Se armó un harness de Node (`node` instalado durante
la sesión) que corre la física real del archivo sin navegador —
extrayendo el `<script>`, con stubs mínimos de DOM/canvas — para medir el
radio (RMS respecto al centroide) de cada núcleo a lo largo del tiempo
simulado. Se encontraron dos causas:

1. **Separación por promedio, no por suma.** El empuje de cada vecino
   cercano se promediaba entre la cantidad de vecinos (`sepX / sepCount`).
   En una zona apretada, los empujes desde lados opuestos se cancelan entre
   sí, así que el empuje neto se debilitaba justo cuando más hacía falta,
   permitiendo que la densidad creciera sin freno. Se corrigió sumando (sin
   promediar) las contribuciones — la misma técnica del shader de
   Starling-Simulation, que tampoco promedia. Se agregó un tope de
   seguridad a la magnitud combinada.

2. **Sin ese freno, apareció algo peor: oscilación grande y sostenida** (el
   radio de un núcleo pasando de ~50px a ~400px y de vuelta, medido durante
   150s simulados, sin converger). Causa: al separar "hacia dónde girar"
   del "qué tan rápido ir" (el modelo de rumbo objetivo agregado en la
   primera ronda), se perdió el freno natural que tiene el boids clásico de
   Reynolds — ahí la fuerza de dirección resta directamente sobre la
   velocidad, oponiéndose a la componente que ya no corresponde. Sin eso,
   el pájaro sigue acelerando hacia el objetivo aunque tenga que girar muy
   cerrado, dibujando una vuelta amplia en vez de converger (como un auto
   tomando una curva cerrada a toda velocidad). **Esta parte es una
   extensión propia, no está documentada en flock2 ni en
   Starling-Simulation.** Arreglo: reducir la velocidad objetivo en
   proporción a cuánto giro falta (`targetSpeed *= lerp(1.0, 0.4,
   |bank|)`), lo que reduce el radio de giro (`r ≈ v/ω`) y amortigua la
   oscilación. Se subió además el factor de alineación (0.11 → 0.22) como
   amortiguación adicional.

Con ambas causas corregidas, se retuneó la respiración de los núcleos a una
magnitud más suave (antes competía contra una oscilación descontrolada):
fuerza 210 → 70, intervalo aleatorio 7-17s → 14-30s, duración del pulso
0.8s → 0.7s.

### Validación

Con el mismo harness de Node, se corrió la física real durante 5 minutos
simulados usando el perfil oscilante exacto del "modo demo automático" (el
que ve un usuario real), midiendo el radio RMS de cada núcleo cada 10s: se
mantuvo siempre entre ~60px y ~210px — nunca colapsa a un punto, nunca
crece hasta llenar el lienzo, respira de forma continua entre compacto y
disperso.

No se verificó visualmente en navegador dentro de la sesión donde se creó
v3 originalmente (no había Chrome/Firefox disponibles); las correcciones de
esta segunda ronda sí se validaron con la física real vía Node, pero el
resultado final en pantalla queda sujeto a confirmación visual del usuario.

## v3 — tercera ronda: pájaros como puntos

A pedido, el render vuelve a ser un **punto** (círculo), no el triángulo
orientado de la primera ronda. Se reemplazaron las tres medidas del triángulo
(`BASE_NOSE` / `BASE_REAR` / `BASE_WING`) por un único `BASE_RADIUS = 1.5` px
a tamaño 100%; el slider de tamaño sigue existiendo y funcionando igual, solo
que ahora escala ese radio (1,5 px al 100%, 3 px al 200%), con un piso de
0,35 px para que nunca desaparezca. A diferencia del punto cuadrado de v2
(`fillRect`), es un círculo: se acumulan todos en un único `path` y se pintan
con un solo `fill()`, con un `moveTo()` antes de cada `arc()` — sin él, el
path uniría con una recta el final de un círculo con el comienzo del
siguiente.

**La física no cambió.** `heading` y `bank` se siguen calculando y siguen
gobernando el movimiento (rumbo objetivo, velocidad angular máxima, frenado en
la curva); simplemente dejaron de usarse para orientar la silueta. Volver al
triángulo es solo cambiar el cuerpo del bucle de `draw()`.

## Archivo

- `bandada_prototipo_v3.html` — archivo único, autocontenido, sin
  dependencias externas ni build step. `bandada_prototipo_v2.html` se
  conserva sin modificar.
