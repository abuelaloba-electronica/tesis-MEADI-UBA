# Propuesta: visualización de bandada dirigida por acelerómetro (MAEDI)

## Requerimiento

Un textil electrónico con acelerómetro (x, y, z) en la mano de una persona debe controlar la visualización de una bandada de pájaros abstraída como puntos negros sobre fondo blanco, con movimiento aleatorio de base y concentraciones variables, tal como se ve en fenómenos de murmuración de estorninos. El dispositivo aún no existe: se está construyendo sobre Arduino/Lilypad. Se necesita un prototipo utilizable hoy, con controles manuales (sliders) que simulen las tres lecturas del acelerómetro.

## Lenguaje y plataforma

Se recomienda **HTML5 + JavaScript + Canvas 2D**, ejecutado en un navegador estándar (Chrome, Edge o Firefox), por sobre alternativas como Processing/Java o un motor nativo en C++/openFrameworks. Las razones:

Portabilidad real sin instalación: el mismo archivo `.html` corre igual en Windows, macOS y Linux, sin compilar binarios distintos por plataforma. Esto resuelve directamente el requisito de portar a Linux, Windows o macOS.

Camino directo hacia el hardware: cuando el textil esté listo, Chrome expone la **Web Serial API** (para USB) y la **Web Bluetooth API** (para BLE, relevante si el Lilypad transmite inalámbrico) directamente desde JavaScript, sin drivers ni librerías nativas adicionales. El prototipo ya está preparado para ese salto: toda la lógica de movimiento depende de una única función, `window.updateAccel(x, y, z)`, que hoy alimentan los sliders y que luego alimentará el puerto serie leyendo el Arduino.

Rendimiento suficiente: Canvas 2D dibuja miles de puntos por frame sin problema (se probó hasta 8000 en el prototipo) usando `fillRect` en vez de figuras complejas, evitando cálculos costosos de pares de partículas (boids clásico O(n²)).

Alternativa considerada: **Processing** (o p5.js) es la opción clásica en arte generativo con Arduino, gracias a su librería `Serial` madura y su tradición en simulaciones de flocking. Es una alternativa válida si se prefiere una app de escritorio exportable en vez de una página web, pero exige empaquetar el runtime de Java por plataforma y no aporta ventajas sobre Web Serial para este caso. Si más adelante se quiere una app nativa "instalable", el mismo código JavaScript se puede envolver en **Electron** sin reescribir la lógica de la simulación.

## Cómo funciona el prototipo

El archivo `bandada_prototipo.html` es autocontenido (sin dependencias externas) y contiene:

Un sistema de partículas donde cada punto orbita alrededor de un centroide común, con un radio propio y algo de ruido individual, en lugar de un boids clásico por pares. Esto es lo que permite escalar a miles de puntos manteniendo 60fps.

Mapeo de ejes: X e Y desplazan el centroide (dirección de la bandada); Z controla el radio objetivo de la nube, es decir, si la bandada se concentra (compacta, como en las imágenes de referencia) o se dispersa. La magnitud del vector (x,y,z) también modula la turbulencia general del movimiento.

Un slider de densidad (100 a 8000 pájaros) para ajustar el costo visual/computacional.

Un modo demo automático que mueve los tres ejes con funciones senoidales de distinto período, para simular una mano en movimiento sin tocar los sliders.

## Próximos pasos hacia el dispositivo real

Cuando el textil esté disponible, agregar un pequeño bloque de código que solicite acceso al puerto serie (`navigator.serial.requestPort()`), lea las tres lecturas del acelerómetro (probablemente enviadas como texto separado por comas desde el Arduino) y llame a `window.updateAccel(x, y, z)` en cada lectura. No hace falta tocar el resto del archivo. Si la comunicación termina siendo Bluetooth (más habitual en Lilypad), el reemplazo es análogo usando `navigator.bluetooth`.

## Cómo probar

Abrir `bandada_prototipo.html` con doble clic en cualquier navegador moderno (no requiere servidor ni instalación). Mover los sliders X/Y/Z para ver el cambio de dirección y concentración, o activar el modo demo automático.
