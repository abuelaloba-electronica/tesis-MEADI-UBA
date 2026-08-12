# Propuesta: visualización de líneas dirigida por un sensor de estiramiento (MAEDI)

## Requerimiento

Un textil electrónico montado sobre la mano de una persona, construido sobre Arduino/Lilypad, incorpora un sensor de estiramiento (*stretch sensor*) montado sobre un elástico cosido al textil. Al estirar el elástico, el sensor entrega una lectura analógica proporcional a la elongación alcanzada. A partir de esos datos se debe generar una visualización de líneas, inspirada en las imágenes de referencia: haces de trazos rectos que se cruzan en negro y azul, algunos punteados, algunos con textura de boceto a mano suelto, en distintos grados de densidad y superposición según cuánto se haya "usado" el dispositivo. El dispositivo físico todavía no existe, así que el prototipo debe simular la entrada del sensor.

**Supuesto de interpretación:** se sugiere simular la entrada con un pulsador (on/off). Un sensor de estiramiento real, sin embargo, no es binario: entrega un valor continuo proporcional a cuánto se estiró el elástico, y esa continuidad es justamente lo que permite que las líneas de las imágenes de referencia tengan largos tan distintos entre sí. Por eso el control simulado por defecto es una banda arrastrable (mismo mecanismo de Pointer Events que el "sensor de fuerza" del prototipo anterior, pero en horizontal, para evocar el gesto de tironear un elástico): la posición donde se suelta el arrastre define la elongación. Para no perder la sugerencia original, se agrega igualmente un botón/checkbox "Modo pulsador simple" que convierte el mismo control en un botón on/off puro (al presionar, estiramiento = máximo; al soltar, cero) — así se puede probar el caso extremo sin tocar el resto del prototipo. Si el dispositivo real termina siendo binario (un microswitch en vez de un sensor analógico), alcanza con dejar ese modo activado por defecto.

## Lenguaje y plataforma

Se mantiene **HTML5 + JavaScript + Canvas 2D**, el mismo enfoque usado en los prototipos anteriores de esta sesión (`bandada_prototipo.html` / `bandada_prototipo_v2.html`, `prototipo_circulos_fuerza_pulso.html`), por las mismas razones que siguen vigentes:

El archivo corre igual en Windows, macOS y Linux con solo abrirlo en un navegador, sin compilar nada por plataforma.

Cuando el textil exista, la Web Serial API (USB) o Web Bluetooth API (BLE, más probable en Lilypad) permiten leer el Arduino directamente desde JavaScript, sin drivers adicionales. El prototipo expone un único punto de enganche: `window.feedStretch(valor01)` (ver más abajo).

Mantener un único stack entre los tres prototipos simplifica el paso a producto final y deja abierta la posibilidad de combinarlos en una misma pantalla si el proyecto lo requiere (por ejemplo, un mismo lienzo con círculos de un sensor y líneas de otro).

## Cómo funciona el prototipo

El archivo `prototipo_estiramiento_lineas.html` es autocontenido (sin dependencias externas) y contiene:

**Simulación del sensor de estiramiento:** un recuadro horizontal ("Sensor de estiramiento (simulado)") con un ancla fija a la izquierda y una banda que se estira visualmente hacia la derecha a medida que se arrastra el puntero (mouse o dedo, vía Pointer Events). La posición horizontal donde se suelta define cuánto se "estiró" el elástico en esa pasada. Un checkbox "Modo pulsador simple" cambia el control a un simple on/off, como se describe arriba.

**Mapeo estiramiento pico → largo de la línea:** cada gesto (desde que el estiramiento supera un umbral bajo hasta que se suelta) registra el valor máximo alcanzado. Ese pico, interpolado entre un largo mínimo y uno máximo (proporcional al tamaño de pantalla), define el largo del trazo. Si el pico no supera un mínimo configurable, el gesto se descarta (se asume roce accidental) — el umbral es ajustable en el panel.

**Mapeo estiramiento promedio → opacidad de la tinta:** el promedio del estiramiento durante el gesto controla la opacidad del trazo sobre el color elegido (piso configurado para que ningún trazo sea invisible, tope en tinta plena). Es el mismo criterio de "intensidad → opacidad" del prototipo de círculos, aplicado acá a un trazo en vez de a un relleno.

**Mapeo de velocidad del gesto → grosor del trazo:** se mide qué tan rápido cambia el estiramiento mientras se sostiene. Ese valor se suma, en menor medida, al grosor del trazo (junto con el estiramiento promedio): gestos más rápidos dejan una línea levemente más gruesa que gestos lentos y controlados, pero sin alterar su forma.

**Variación aleatoria de grosor:** el ancho calculado a partir de fuerza y velocidad se toma como 100%; cada trazo nuevo sortea además un factor al azar entre 50% y 200% de ese valor, igual que su posición en el lienzo también es aleatoria. Así, dos gestos con el mismo estiramiento no dejan líneas idénticas — una queda fina, otra gruesa — reforzando la sensación de acumulación orgánica de las imágenes de referencia en vez de un patrón repetitivo.

**Trazo recto y continuo:** cada línea es un único segmento recto entre sus dos puntas, de ancho uniforme en todo su recorrido — sin temblor ni variación de grosor por tramo. Esto prioriza un trazo bien definido tipo vector/tinta dura, dejando de lado la variante de boceto suelto que se había probado en una primera versión. Al crearse, un trazo aparece con un breve destello de tinta más intensa que se asienta en su opacidad definitiva en menos de un segundo ("tinta recién puesta"), como única señal de retroalimentación — sin parpadeo permanente, porque acá el trazo es una marca que queda, no un pulso que se repite.

**Paleta:** un dropdown con cuatro tintas (negra, azul lápiz, azul eléctrico, grafito), inspiradas en los tonos de las imágenes de referencia. Cada trazo nuevo suma además una variación aleatoria leve de brillo, para que no todas las líneas del mismo color se vean idénticas.

**Acumulación:** los trazos no se borran solos. Cada gesto de estiramiento suma una línea más al lienzo, que se superpone (con mezcla de color tipo tinta, `multiply`) sobre las anteriores. Repitiendo el gesto varias veces, la composición pasa de unas pocas líneas sueltas a una maraña densa de trazos cruzados — el mismo recorrido que muestran las cuatro imágenes de referencia entre sí, de más dispersa a más saturada.

**Panel de estado:** muestra estiramiento y velocidad en vivo mientras se sostiene el control, y datos del último trazo creado (largo, opacidad). Un botón permite limpiar el lienzo.

## Próximos pasos hacia el dispositivo real

Cuando el textil exista, el reemplazo no requiere tocar la lógica de mapeo ni de dibujo:

Calibrar el sensor de estiramiento: tomar la lectura ADC en reposo (elástico sin estirar) y la lectura en el estiramiento máximo físicamente posible del elástico montado, y usar esos dos valores para normalizar cada lectura cruda a 0–1 (`(raw - min) / (max - min)`, recortado a ese rango).

Llamar a `window.feedStretch(valor01)` con esa lectura normalizada, a la frecuencia que entregue el Arduino. Toda la detección de inicio/fin de gesto, el pico, el promedio y la velocidad ya están calculados dentro de esa función — no dependen de un evento "botón presionado" separado.

Si el sensor real resulta ruidoso (algo común en sensores resistivos de estiramiento), conviene aplicar un filtro simple (promedio móvil o suavizado exponencial) antes de llamar a `feedStretch`, ya sea en el propio sketch de Arduino o en JavaScript justo antes de esa llamada. El prototipo no lo necesita porque el control simulado ya entrega valores limpios, pero la función está pensada para poder intercalar ese paso sin cambiar nada más.

`feedStretch` ya está expuesta globalmente en el archivo actual, alimentada hoy por el control simulado; el día que exista hardware, ese control se puede ocultar o dejar como respaldo de prueba y alimentar la misma función desde el puerto serie o BLE.

## Cómo probar

Abrir `prototipo_estiramiento_lineas.html` con doble clic en cualquier navegador moderno (Chrome, Edge, Firefox), en Windows, macOS o Linux — no requiere servidor ni instalación. Mantener presionado el recuadro de "Sensor de estiramiento" y arrastrar hacia la derecha para variar la elongación simulada; soltar cerca del punto de origen produce trazos cortos, soltar lejos produce trazos largos. Probar arrastres lentos contra arrastres bruscos para ver cómo cambia apenas el grosor del trazo, sin que la línea deje de ser recta. Activar "Modo pulsador simple" para ver el caso de un botón on/off puro. Repetir varias veces para ver cómo la composición se va densificando, igual que en las imágenes de referencia.
