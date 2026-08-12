# Propuesta: acumulación de contracciones dirigida por EMG (MAEDI) — V2

## Requerimiento

Mismo dispositivo que en V1: un textil electrónico con electrodos EMG de superficie sobre un músculo de la pierna, que el usuario contrae y relaja. Esta segunda variante toma la **idea D** entre las opciones presentadas: en vez de que la figura vuelva a su estado de reposo apenas el músculo se relaja, cada contracción sostenida (una "repetición") deja una marca permanente. Con el tiempo, esas marcas construyen un mosaico que registra el historial de una sesión de ejercicio, en el mismo lenguaje visual de fractura low-poly de V1 (rojos y rosas, facetas irregulares), en vez de resetearse a cada gesto. El dispositivo físico todavía no existe, así que el prototipo debe simular la entrada del sensor.

**Ajuste sobre la versión inicial — crecimiento contiguo:** cada repetición agrega exactamente un triángulo nuevo, y ese triángulo siempre queda pegado a una cara (borde) de algún triángulo que ya esté en el lienzo, elegida al azar. Ya no se generan fragmentos sueltos en posiciones aleatorias: la figura entera es una sola malla conectada que crece hacia afuera, como un cristal que se expande de a una faceta por vez — nunca quedan piezas flotando separadas del resto.

## Lenguaje y plataforma

Se mantiene **HTML5 + JavaScript + Canvas 2D**, el mismo enfoque usado en toda la serie de prototipos de esta sesión de trabajo. El archivo corre igual en Windows, macOS y Linux con solo abrirlo en un navegador, sin compilar nada por plataforma. Cuando el textil exista, la Web Serial API (USB) o Web Bluetooth API (BLE) permiten leer el Arduino directamente desde JavaScript; el prototipo expone el mismo punto de enganche que V1: `window.feedEMG(valor01)`.

El patrón de acumulación reutiliza directamente el criterio ya validado en `prototipo_circulos_fuerza_pulso.html` (duración del gesto → tamaño; intensidad → color; mezcla de color en las zonas de solapamiento) y en `prototipo_estiramiento_lineas.html` (las marcas no se borran solas, la composición se va densificando con el uso), aplicado acá a una malla de triángulos que crece pegada a sí misma en vez de círculos o líneas sueltas — para que la acumulación hable el mismo idioma visual que V1 en lugar de introducir una figura nueva.

## Cómo funciona el prototipo

El archivo `prototipo_emg_acumulacion_v2.html` es autocontenido (sin dependencias externas) y contiene:

**Detección de repetición sobre la envolvente, no sobre la señal cruda:** igual que en V1, cada lectura EMG cruda se suaviza con una media móvil exponencial para obtener una envolvente de contracción. A diferencia de V1, acá esa envolvente se usa además para detectar el inicio y el fin de cada contracción (cuando cruza un umbral bajo hacia arriba y hacia abajo), tal como el sensor de fuerza del prototipo de círculos detectaba el inicio/fin de una presión. Usar la envolvente en vez de la lectura cruda evita que el ruido propio de la EMG dispare repeticiones falsas.

**Bolsa de caras disponibles ("freeEdges"):** el prototipo mantiene una lista de todos los bordes de la malla que todavía no tienen un triángulo vecino del lado de afuera. Cada vez que se agrega un triángulo, sus dos caras nuevas entran a esa bolsa y la cara sobre la que se acaba de enganchar sale de circulación (ya quedó compartida entre dos triángulos, es interior a la malla). La primera repetición de toda la sesión es la única excepción: como el lienzo está vacío, no hay ninguna cara a la cual pegarse, así que planta un triángulo semilla en una posición aleatoria del lienzo, y sus 3 caras son las primeras en entrar a la bolsa.

**Selección aleatoria de triángulo y cara:** para cada repetición siguiente, se elige al azar un borde cualquiera de la bolsa de caras disponibles (con igual probabilidad entre todos) — como cada borde pertenece a un único triángulo, este sorteo selecciona al mismo tiempo qué triángulo existente se usa como vecino y cuál de sus caras libres se ocupa.

**Triángulo nuevo pegado sin huecos:** el triángulo que se agrega comparte exactamente los dos extremos del borde elegido con su vecino (mismas coordenadas), así que no hay separación entre ambos. Su tercer vértice (el ápice) se calcula hacia afuera del borde —nunca hacia el interior de la malla existente— a una distancia proporcional a la duración de la contracción, con un desplazamiento lateral al azar para que la malla resultante sea irregular en vez de perfectamente geométrica, en línea con la estética de fractura de V1 y de la imagen de referencia.

**Mapeo duración → qué tan prominente sale la faceta:** el largo del borde compartido ya viene determinado por el triángulo vecino, así que la duración de la contracción (recortada a un máximo configurable, igual que en el prototipo de círculos) ya no controla un diámetro sino la altura del ápice: contracciones breves producen facetas bajas y contracciones largas producen facetas más puntiagudas y prominentes. Contracciones más breves que el mínimo configurado se descartan, igual que antes.

**Mapeo intensidad → color:** la intensidad promedio durante la contracción determina el matiz y la luminosidad del triángulo agregado, con la misma escala de rosa pálido a rojo saturado que V1. Cada triángulo tiene además una variación de tono propia, para que la malla no se vea como un color plano uniforme.

**Mezcla en las zonas donde la malla se pliega sobre sí misma:** los triángulos se dibujan con `globalCompositeOperation = "multiply"`, igual que en los círculos y las líneas de los prototipos anteriores. En una malla que crece de forma orgánica (sin verificar colisiones contra el resto de la figura, solo contra su vecino inmediato) es posible que una rama vuelva a pasar cerca de otra ya existente; en esos casos puntuales, la mezcla de color evita que una faceta tape lisa y llanamente a la otra.

**Aparición animada y acumulación permanente:** al crearse, cada triángulo aparece con una breve animación de escala y opacidad (~0.25s, "asentándose") antes de quedar en su posición final y ya perfectamente pegado a su vecino. Ningún triángulo se borra solo: repetir el gesto varias veces va extendiendo la malla, igual que ocurría con los trazos del prototipo de estiramiento.

**Simulación del sensor EMG:** el mismo tipo de control que en V1 (recuadro vertical con Pointer Events, ruido fisiológico simulado alrededor del nivel sostenido), más un modo automático que genera ráfagas de contracción con pausas entre repeticiones (en vez de una oscilación continua), para poder previsualizar la acumulación sin sostener el puntero repetidamente.

**Panel de estado:** contador de repeticiones (equivale a la cantidad de triángulos en la malla), datos de la última repetición (duración, intensidad, altura resultante), controles de duración mínima/máxima permitida, y botón para limpiar el lienzo.

## Próximos pasos hacia el dispositivo real

Igual que en V1: leer el electrodo EMG por Web Serial o Web Bluetooth, normalizar a 0–1 y llamar a `window.feedEMG(valor01)` a la frecuencia que entregue el hardware. Toda la detección de inicio/fin de repetición, el promedio, el pico y la creación del triángulo nuevo (semilla o enganchado a una cara libre) ya están implementados dentro de esa función — no dependen de un evento "botón presionado" separado, sino de que la envolvente cruce el umbral, igual que ocurriría con una contracción real.

`window.feedEMG` ya está expuesta globalmente en el archivo actual, alimentada hoy por el control simulado; el día que exista hardware, ese control se puede ocultar o dejar como respaldo de prueba y alimentar la misma función desde el puerto serie o BLE.

## Cómo probar

Abrir `prototipo_emg_acumulacion_v2.html` con doble clic en cualquier navegador moderno (Chrome, Edge, Firefox), en Windows, macOS o Linux — no requiere servidor ni instalación. Presionar el recuadro de "Sensor EMG", mantener y soltar para simular una contracción completa; repetir varias veces (variando cuánto se sostiene y con qué intensidad) para ver cómo la malla va creciendo triángulo a triángulo, siempre pegada a sí misma, sin fragmentos sueltos. Probar el modo automático para ver varias repeticiones seguidas sin intervención manual, y ajustar la duración mínima/máxima desde el panel.
