# Propuesta: fractura low-poly + temblor dirigida por EMG (MAEDI) — V1

## Requerimiento

Un textil electrónico montado sobre un músculo de la pierna, construido sobre Arduino/Lilypad, incorpora electrodos de electromiografía (EMG) de superficie. Al contraer o relajar el músculo, el sensor entrega una lectura proporcional a la actividad eléctrica muscular. A partir de esos datos se debe generar una visualización de un triángulo escaleno que se altera con la contracción, inspirada en la imagen de referencia: una figura poligonal fracturada en facetas irregulares, en una gama de rojos y rosas, tal como un cristal roto. El dispositivo físico todavía no existe, así que el prototipo debe simular la entrada del sensor.

**Criterio de diseño (idea B+C, elegida entre las opciones presentadas):** la contracción se traduce en dos capas superpuestas sobre el mismo triángulo. Por un lado, una **fractura progresiva**: en reposo el triángulo se ve apenas dividido en unas pocas facetas grandes; a mayor contracción, se subdivide en más facetas, cada vez más numerosas y pequeñas, igual que el cristal fragmentado de la referencia. Por otro lado, un **temblor**: a diferencia de un sensor de fuerza o de estiramiento —señales relativamente suaves—, la EMG cruda es intrínsecamente ruidosa (hay microfluctuaciones de alta frecuencia por el disparo de unidades motoras, incluso con la contracción sostenida). Ese ruido se visualiza como una vibración de los vértices de cada faceta, cuya amplitud crece con la intensidad de la contracción. Ninguna de las dos capas requiere que el usuario "termine" un gesto: ambas responden en vivo, cuadro a cuadro, mientras el músculo está siendo leído.

## Lenguaje y plataforma

Se mantiene **HTML5 + JavaScript + Canvas 2D**, el mismo enfoque usado en los tres prototipos anteriores de esta serie (`bandada_prototipo.html`, `prototipo_circulos_fuerza_pulso.html`, `prototipo_estiramiento_lineas.html`), por las mismas razones que siguen vigentes:

El archivo corre igual en Windows, macOS y Linux con solo abrirlo en un navegador, sin compilar nada por plataforma.

Cuando el textil exista, la Web Serial API (USB) o Web Bluetooth API (BLE, más probable en Lilypad) permiten leer el Arduino directamente desde JavaScript, sin drivers adicionales. El prototipo expone un único punto de enganche: `window.feedEMG(valor01)` (ver más abajo).

Mantener un único stack entre los cuatro prototipos de la serie simplifica el paso a producto final y deja abierta la posibilidad de combinarlos en una misma pantalla si el proyecto lo requiere.

## Cómo funciona el prototipo

El archivo `prototipo_emg_fractura_v1.html` es autocontenido (sin dependencias externas) y contiene:

**Triángulo base:** un triángulo escaleno definido en coordenadas normalizadas (tres lados de longitud distinta), escalado al tamaño de pantalla en cada cuadro.

**Árbol de fractura:** el triángulo se subdivide recursivamente de forma aleatoria (cada nodo se parte en 3 triángulos que comparten un punto interior, sin huecos ni superposición entre ellos) hasta una profundidad máxima configurable. Cada nodo de esa subdivisión guarda un "umbral de contracción" propio, con algo de variación aleatoria: los nodos más profundos (facetas más chicas) requieren mayor contracción para aparecer. Al renderizar, se recorre el árbol y se muestra cada nodo o, si la contracción actual supera su umbral, se desciende y se muestran sus hijos en su lugar. El triángulo raíz siempre se fractura al menos una vez, así que en reposo ya se ven unas pocas facetas grandes — nunca una figura completamente lisa, igual que un músculo en reposo nunca está en tensión cero.

**Señal EMG (envolvente + temblor):** el prototipo procesa la lectura cruda simulada igual que se procesaría una señal real de electrodos de superficie: una media móvil exponencial lenta da la **envolvente** (nivel de contracción suavizado, que controla cuántas facetas se muestran y el color), y el residuo entre la lectura cruda y esa envolvente —suavizado con su propia media móvil, más rápida— da la magnitud del **temblor**, que desplaza cada vértice de cada faceta visible en un pequeño círculo oscilante (frecuencia y fase propias por vértice, para que no todas tiemblen sincronizadas).

**Color:** cada faceta interpola entre rosa pálido (reposo) y rojo saturado (contracción máxima) según la envolvente, con una variación de tono y luminosidad fija por faceta (asignada al crearse el árbol) que reproduce la mezcla de tonos rojos/rosas de la imagen de referencia en vez de un color plano uniforme.

**Aparición animada:** cuando una faceta pasa de oculta a visible (porque la contracción superó su umbral), aparece con una breve animación de escala y opacidad (~0.2s) en vez de un salto abrupto — un gesto de "cristal asentándose".

**Simulación del sensor EMG:** un recuadro vertical ("Sensor EMG (simulado) — pierna") que responde a mouse y touch (Pointer Events). La posición donde se sostiene el puntero define el nivel de contracción objetivo. Mientras se sostiene, el prototipo genera muestras crudas alrededor de ese objetivo con ruido cuya amplitud crece con la contracción (igual que el reclutamiento de unidades motoras aumenta la variabilidad de una EMG real), y alimenta esas muestras a `window.feedEMG` a la frecuencia de refresco de pantalla. Un botón "Relajar ahora" y un modo automático (oscilación senoidal, para probar sin sostener el puntero) completan la simulación.

**Panel de estado:** barras en vivo de envolvente (% de contracción) y temblor, cantidad de facetas visibles, y dos controles ajustables: profundidad máxima de fractura (detalle) y sensibilidad del temblor.

## Próximos pasos hacia el dispositivo real

Cuando el textil esté disponible, el reemplazo no requiere tocar la lógica de fractura, temblor ni dibujo:

Leer el electrodo EMG (probablemente un valor ADC rectificado, sin promediar) por Web Serial o Web Bluetooth, normalizarlo a 0–1, y llamar a `window.feedEMG(valor01)` en cada lectura, a la frecuencia que entregue el hardware. El cálculo de la envolvente (media móvil exponencial) y del temblor (residuo respecto a esa envolvente) ya están implementados dentro de esa función.

Si la lectura real llega ya rectificada pero muy ruidosa incluso en reposo, puede ajustarse `ENV_ALPHA` (velocidad de suavizado de la envolvente) directamente en el archivo para calibrar qué tan "nervioso" se ve el temblor en reposo frente a un baseline real del electrodo.

`window.feedEMG` ya está expuesta globalmente en el archivo actual, alimentada hoy por el control simulado; el día que exista hardware, ese control se puede ocultar o dejar como respaldo de prueba y alimentar la misma función desde el puerto serie o BLE.

## Cómo probar

Abrir `prototipo_emg_fractura_v1.html` con doble clic en cualquier navegador moderno (Chrome, Edge, Firefox), en Windows, macOS o Linux — no requiere servidor ni instalación. Mantener presionado el recuadro de "Sensor EMG" y mover el puntero arriba/abajo para simular distintos niveles de contracción; ver cómo aparecen más facetas y el temblor se hace más marcado a mayor contracción, y cómo el triángulo se relaja gradualmente al soltar. Probar el modo automático para una demo sin manos, y ajustar el detalle de fractura y la sensibilidad del temblor desde el panel.
