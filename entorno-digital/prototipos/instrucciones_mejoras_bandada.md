# Instrucciones: acercar el prototipo de bandada al movimiento real de estorninos

## Contexto para quien retome esto en una nueva sesión

Este documento continúa el trabajo sobre `bandada_prototipo.html`, un prototipo en **HTML5 + JavaScript + Canvas 2D** (proyecto MAEDI) que visualiza una bandada de pájaros (puntos negros sobre fondo blanco) controlada por un acelerómetro de 3 ejes (x, y, z). El dispositivo real (textil con acelerómetro sobre Arduino/Lilypad) todavía no existe, así que el prototipo simula esas tres lecturas con sliders y expone una función global `window.updateAccel(x, y, z)` que en el futuro alimentará el dato real leído por Web Serial / Web Bluetooth, sin tocar el resto del código.

Estado actual de la simulación (para orientarse en el archivo):

- `NUM_CLUSTERS = 3` sub-núcleos ("centroides") flotan alrededor de un centro maestro que se desplaza según X/Y.
- Cada centroide tiene armónicos (`makeHarmonics`, `organicRadius`) que deforman su radio en función del ángulo, dando un contorno no-circular.
- Cada pájaro (`makeBird`) orbita su centroide asignado con un ángulo y radio propios (`orbitAngle`, `baseFactor`), sin interactuar entre sí.
- Z controla la concentración (radio objetivo); la magnitud del vector controla la "turbulencia" general.
- Densidad configurable hasta 16000 puntos; tamaño de punto configurable (base 1.76px, hasta el doble).

Comparado con una murmuración real de estorninos, a este enfoque le falta lo más importante: **la forma no emerge de interacciones locales entre pájaros**, sino de una fórmula geométrica global. Eso es lo que hay que cambiar. Lo que sigue es la hoja de ruta, ordenada de mayor a menor relación costo/beneficio.

## Objetivo

Lograr que la bandada muestre el comportamiento distintivo de una murmuración real: ondas de giro que viajan por toda la nube, bordes duros con vacíos y puentes delgados entre núcleos, y una sensación de "viento" en vez de desplazamiento rígido — manteniendo los ejes x/y/z del acelerómetro como única entrada de control y sin romper el rendimiento a 16000 puntos en Canvas 2D.

## Tarea 1 — Estela por opacidad (quick win, hacer primero)

**Qué hacer:** en `draw()`, en vez de limpiar el canvas con blanco sólido, pintar un rectángulo blanco semitransparente sobre el frame anterior.

```js
// antes:
ctx.fillStyle = "#fff";
ctx.fillRect(0, 0, canvas.width, canvas.height);

// después:
ctx.fillStyle = "rgba(255,255,255,0.18)"; // ajustar 0.12–0.25 a gusto
ctx.fillRect(0, 0, canvas.width, canvas.height);
```

**Por qué:** deja un rastro tenue del movimiento anterior (efecto de foto de larga exposición), que da sensación de fluidez sin tocar la lógica de movimiento.

**Verificación:** correr el prototipo, confirmar visualmente que aparece una estela suave y que no se acumula "suciedad" (si el alpha es muy bajo el fondo nunca termina de blanquear del todo; probar valores hasta encontrar el punto donde la estela se disipa en ~0.5–1s).

## Tarea 2 — Reemplazar el modelo de órbita por vecinos locales (boids con grilla espacial)

Este es el cambio central: es lo único que puede producir la onda de giro que recorre la bandada, la característica más reconocible de una murmuración real.

**Qué hacer:**

1. Cambiar la representación de cada pájaro de `{orbitAngle, baseFactor, ...}` a posición + velocidad: `{x, y, vx, vy}`.
2. Cada frame, construir una grilla espacial: dividir el canvas en celdas (`cellSize` ≈ 40–60px), y ubicar a cada pájaro en `grid[`${cellX},${cellY}`]` (usar un `Map`, reconstruirlo cada frame, es O(n)).
3. Para cada pájaro, buscar vecinos solo en su celda y las 8 celdas adyacentes (no en toda la bandada) y aplicar las tres reglas clásicas de boids sobre esos vecinos:
   - **Separación:** alejarse de vecinos más cercanos que `minDist` (~8–14px).
   - **Alineación:** promediar la velocidad de los vecinos y mezclar la propia velocidad hacia ese promedio (factor de mezcla bajo, tipo 0.05–0.15 por frame, para que el giro se propague como onda y no de golpe).
   - **Cohesión:** atracción suave hacia el centro de masa de los vecinos (factor aún más bajo que alineación).
4. El eje Z del acelerómetro pasa a controlar el **peso de la cohesión** (más cohesión = bandada más compacta) en vez de un radio geométrico fijo.
5. Limitar la velocidad máxima de cada pájaro (`maxSpeed`) y aplicar un mínimo de velocidad para que nunca queden estáticos.
6. Los `NUM_CLUSTERS` pueden eliminarse o mantenerse como un sesgo de cohesión de largo alcance opcional (atracción débil hacia 2-3 "centros de gravedad" que vagan igual que ahora) — probar primero sin ellos, ya que la cohesión local debería generar sub-grupos por sí sola.

**Por qué:** con reglas puramente locales, un cambio de dirección en una zona de la bandada se propaga a los vecinos, y de esos a los suyos, generando la onda de giro característica — sin necesidad de coordinación global.

**Cuidado con el rendimiento:** vecinos por pares sin grilla es O(n²) e inviable a 16000 puntos. Con grilla espacial (paso 2-3) el costo es ~O(n). Si aun así rinde poco: reducir la frecuencia de recálculo de vecinos (cada 2-3 frames en vez de cada frame), o limitar cuántos vecinos por celda se evalúan (tomar los primeros 8-10 encontrados).

**Verificación:** agregar un contador de FPS visible (`performance.now()` entre frames) y confirmar que se mantienen ~60fps con el slider de densidad al máximo (16000). Confirmar visualmente que aparecen ondas de giro que recorren la nube en vez de una rotación pareja de todo el conjunto.

## Tarea 3 — Acelerómetro como viento, no como desplazamiento rígido

**Qué hacer:** en vez de que X/Y muevan un "centro maestro" que arrastra a todos los pájaros en bloque, sumar un vector de "viento" (`windX = accel.x * k`, `windY = -accel.y * k`) directamente a la velocidad de cada pájaro en el paso de alineación (mezclar el rumbo local hacia el rumbo local + viento, no reemplazarlo). Mantener límites de pantalla con rebote suave en vez de clamp de un centro único.

**Por qué:** una bandada real ante una ráfaga se inclina y se estira en la dirección del viento en vez de moverse como un bloque rígido siguiendo un punto.

**Verificación:** mover el slider X o Y y observar que la nube se estira/inclina en esa dirección en vez de trasladarse como un solo objeto.

## Tarea 4 — Evento de "depredador" simulado (opcional, después de las anteriores)

**Qué hacer:** cuando la turbulencia (magnitud del vector x,y,z) supera un umbral de forma repentina (pico, no un valor sostenido — comparar con el valor del frame anterior), generar un punto de repulsión temporal dentro de la nube que empuja a los vecinos cercanos y se disuelve en 1-2 segundos.

**Por qué:** replica el patrón de "agujero negro" que se ve en videos reales cuando un halcón cruza la bandada, y le da variedad dramática al movimiento cuando el usuario "sacude" la mano.

**Verificación:** mover un slider bruscamente y confirmar que aparece un vacío temporal que se cierra solo.

## Tarea 5 — Bordes duros y contraste de densidad

Una vez implementada la Tarea 2 (vecinos locales), este punto debería emerger solo: los pájaros del borde "sienten" que no tienen vecinos de un lado y se cierran hacia el resto, generando el corte nítido característico (en vez del degradé suave actual). Si no aparece naturalmente, ajustar el radio de separación/cohesión para que sea más agresivo cerca del borde exterior de cada agrupación.

## Orden recomendado de implementación

1. Tarea 1 (estela) — inmediato, bajo riesgo.
2. Tarea 2 (vecinos locales + grilla) — el cambio real, requiere reescribir el modelo de movimiento.
3. Tarea 3 (viento).
4. Tarea 5 (verificar si ya emergió; ajustar si no).
5. Tarea 4 (evento de depredador) — el más opcional, agregar al final si sobra tiempo.

## Archivos involucrados

- `bandada_prototipo.html` — archivo único, autocontenido, sin dependencias externas. Todas las tareas de arriba se implementan dentro de su bloque `<script>`.
- No es necesario ningún build step ni servidor: se abre con doble clic en cualquier navegador moderno (Chrome, Edge, Firefox) en Windows, macOS o Linux.
