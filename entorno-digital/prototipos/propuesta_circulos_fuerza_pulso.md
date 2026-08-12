# Propuesta: visualización de círculos dirigida por fuerza y pulso (MAEDI)

## Requerimiento

Un textil electrónico montado sobre el brazo de una persona, construido sobre Arduino/Lilypad, incorpora al menos dos componentes: un sensor de fuerza y un sensor de pulso. Al presionar el sensor de fuerza durante un intervalo de tiempo (con un mínimo y un máximo permitidos, por ejemplo 4 segundos de tope), se dibuja un círculo en una posición aleatoria de la pantalla. La duración de la presión determina el diámetro del círculo (a menor tiempo, menor diámetro; a mayor tiempo, mayor diámetro, hasta el tope). La intensidad de fuerza percibida durante la presión determina el color del círculo. Los círculos deben tener transparencia y poder superponerse, generando mezclas de color en las zonas de solapamiento, tal como en las imágenes de referencia (superposiciones de círculos en rosa, amarillo, naranja). El sensor de pulso, en paralelo, hace parpadear cada círculo según los pulsos percibidos. El dispositivo físico todavía no existe, así que el prototipo debe simular ambas entradas.

**Supuesto de interpretación:** en el enunciado se menciona presionar "el sensor de pulso" para generar el círculo, pero el dato que determina el diámetro y color es "la fuerza percibida por el sensor". Se asume que la acción de presión ocurre sobre el **sensor de fuerza** (el sensor de pulso se lee de forma continua e independiente, solo para el parpadeo). Si esta lectura no es correcta, es un ajuste menor sobre el mismo prototipo.

## Lenguaje y plataforma

Se mantiene **HTML5 + JavaScript + Canvas 2D**, el mismo enfoque usado en el prototipo de bandada (`bandada_prototipo.html` / `bandada_prototipo_v2.html`) de esta misma sesión de trabajo, por las mismas razones que siguen vigentes acá:

El archivo corre igual en Windows, macOS y Linux con solo abrirlo en un navegador, sin compilar nada por plataforma.

Cuando el textil exista, la Web Serial API (USB) o Web Bluetooth API (BLE, más probable en Lilypad) permiten leer el Arduino directamente desde JavaScript, sin drivers adicionales. El prototipo ya expone los dos puntos de enganche necesarios: `window.feedForce(valor01)` y `window.feedPulseBpm(bpm)` (ver más abajo).

No hay razón para introducir Processing/p5.js u otro lenguaje distinto al ya validado en el prototipo anterior: mantener un único stack simplifica el paso de ambos prototipos a producto final, e incluso permitiría combinarlos en una misma pantalla si el proyecto lo requiere más adelante.

## Cómo funciona el prototipo

El archivo `prototipo_circulos_fuerza_pulso.html` es autocontenido (sin dependencias externas) y contiene:

**Simulación del sensor de fuerza:** un recuadro ("Sensor de fuerza (simulado)") que responde a mouse y touch (Pointer Events, funciona igual con dedo o mouse). Al presionar dentro del recuadro, la posición vertical del puntero define la intensidad simulada en tiempo real (arriba = fuerza alta, abajo = fuerza baja), imitando la variabilidad de un sensor analógico real (FSR) en vez de una simple señal on/off. Mientras se mantiene la presión, se acumulan la duración y el promedio de intensidad. Al soltar: si la presión duró menos que el mínimo configurado, se descarta (se asume ruido/toque accidental); si duró más que el máximo, se recorta al máximo para el cálculo del diámetro. El mínimo y el máximo son ajustables en el panel para poder probar ambos límites.

**Mapeo duración → diámetro:** interpolación lineal entre un diámetro mínimo y uno máximo (en píxeles, proporcional al tamaño de pantalla), usando la duración recortada al rango [mínimo, máximo].

**Mapeo intensidad → color:** el matiz de relleno se elige de un dropdown con seis colores primarios (Azul puro `#0000FF`, Rojo puro `#FF2C2C`, Amarillo `#FFDE21`, Verde `#008000`, Amarillo fluo `#ECFD18`, Amarillo chillón `#ECF50B`); la intensidad de fuerza no cambia ese matiz, sino la opacidad sobre él. Con fuerza mínima el círculo queda apenas visible (opacidad con un piso configurable, nunca 0); con fuerza máxima se muestra en color pleno (opacidad 1). Entre ambos extremos, la opacidad escala linealmente con la intensidad promedio registrada durante la presión. Cambiar el color en el dropdown solo afecta a los círculos que se dibujen de ahí en adelante; los ya dibujados conservan el matiz con el que se crearon.

**Transparencia y superposición:** cada círculo se dibuja con opacidad parcial y `globalCompositeOperation = "multiply"`, que es lo que produce el efecto de mezcla de color visible en las imágenes de referencia cuando dos círculos se solapan (en vez de que uno tape al otro).

**Simulación del sensor de pulso:** un slider de pulsaciones por minuto (BPM). Cada círculo, al crearse, guarda el BPM vigente en ese momento y, de manera indefinida, aparece y desaparece por completo a ese ritmo (en vez de agrandarse o achicarse): se dibuja con su opacidad base intacta durante una fracción inicial de cada período del latido (por defecto, el 35%) y se omite el resto del ciclo. Esto asegura que el color nunca se vea semitransparente: cuando el círculo está visible, se muestra siempre con la opacidad exacta que le corresponde por su fuerza (color pleno si la fuerza fue máxima); el parpadeo es un asunto de visibilidad, no de atenuación gradual. Esto permite que círculos creados en distintos momentos parpadeen a ritmos distintos si el pulso de la persona varía a lo largo de la sesión, en vez de que todos parpadeen sincronizados. Al lado del slider hay un punto de referencia que parpadea en vivo al BPM actual, para poder calibrar el control antes de presionar.

**Panel de estado:** muestra intensidad y tiempo de presión en vivo mientras se sostiene el sensor simulado, y los datos del último círculo creado (diámetro, intensidad, BPM). Un botón permite reiniciar el lienzo.

## Próximos pasos hacia el dispositivo real

Cuando el textil esté disponible, el reemplazo no requiere tocar la lógica de mapeo ni de dibujo:

Leer el sensor de fuerza (probablemente un valor ADC 0–1023) por Web Serial o Web Bluetooth, normalizarlo a 0–1, y llamar a `window.feedForce(valor01)` en cada lectura (a la frecuencia que entregue el Arduino). La detección de inicio/fin de presión, acumulación de duración e intensidad, y creación del círculo ya están implementadas dentro de esa función; no dependen de un evento "botón presionado" separado, sino de que el valor cruce un umbral bajo (igual que ocurriría con un sensor de fuerza real en reposo).

Leer el sensor de pulso, calcular BPM (lo más simple es hacer la detección de picos en el propio Arduino y enviar solo el BPM ya calculado, en vez de la forma de onda cruda) y llamar a `window.feedPulseBpm(bpm)` cada vez que haya una nueva estimación.

Ambas funciones ya están expuestas globalmente en el archivo actual, alimentadas hoy por los controles simulados; el día que exista hardware, esos controles se pueden ocultar o dejar como respaldo de prueba y alimentar las mismas funciones desde el puerto serie o BLE.

## Cómo probar

Abrir `prototipo_circulos_fuerza_pulso.html` con doble clic en cualquier navegador moderno (Chrome, Edge, Firefox), en Windows, macOS o Linux — no requiere servidor ni instalación. Mantener presionado el recuadro de "Sensor de fuerza" moviendo el puntero arriba/abajo para variar la intensidad simulada, y soltar para dibujar un círculo. Ajustar el slider de BPM antes de soltar para ver círculos con distintos ritmos de parpadeo. Repetir para ver cómo se superponen y mezclan los colores.
