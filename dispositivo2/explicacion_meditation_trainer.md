# Cómo funciona el procesamiento de la señal en Meditation Trainer

Este documento explica, en términos simples, cómo el código de `Meditation_Trainer-master/` toma la señal cruda del sensor de pulso y la convierte en ritmo cardíaco (BPM) y una "coherencia" (nivel de relajación). También explica por qué tus lecturas actuales casi no varían.

## 1. Leer la señal muchas veces por segundo

El sensor de pulso no da un "latido" directamente: da un valor analógico (0–1023) que sube y baja lentamente con cada pulso de sangre bajo la piel.

En `Interrupt.ino`, el código configura un **timer** (`interruptSetup()`) para que, 500 veces por segundo (cada 2 milisegundos), se ejecute automáticamente una función (`ISR`) que hace:

```cpp
Signal = analogRead(pulsePin);
```

Esto pasa en segundo plano, sin importar qué esté haciendo el resto del programa. Es como un reloj que cada 2ms interrumpe todo y dice "lee el sensor ahora".

## 2. Encontrar el pico y el valle de la onda

Cada lectura (`Signal`) se compara con dos variables:

- `P` (peak): el valor más alto visto recientemente.
- `T` (trough): el valor más bajo visto recientemente.

El código va actualizando `P` y `T` continuamente, así "aprende" cuál es la forma de la onda de esa persona en ese momento (cada quien tiene una señal de distinta amplitud).

## 3. Detectar el latido con un umbral (`thresh`)

Hay una variable `thresh` (umbral). Cuando la señal **cruza hacia arriba** ese umbral, el código asume "aquí hubo un latido":

```cpp
if ((Signal > thresh) && (Pulse == false) && ...) {
    Pulse = true;
    IBI = sampleCounter - lastBeatTime;   // tiempo desde el último latido
    lastBeatTime = sampleCounter;
}
```

`IBI` (Inter-Beat Interval) es el tiempo en milisegundos entre un latido y el siguiente.

## 4. Calcular el ritmo cardíaco (BPM)

En vez de usar un solo `IBI` (que puede tener ruido), el código guarda los **últimos 10 IBI** en un arreglo (`rate[]`) y calcula el promedio. Con ese promedio calcula los latidos por minuto:

```cpp
BPM = 60000 / runningTotal;   // 60000 ms en un minuto
```

Promediar 10 latidos hace que el BPM mostrado sea más estable y no salte tanto entre un latido y otro.

## 5. Auto-calibración del umbral

Después de que termina un latido (la señal vuelve a bajar), el código recalcula el umbral basándose en la amplitud real que acaba de medir:

```cpp
amp = P - T;             // qué tan grande fue la onda
thresh = amp / 2 + T;    // el nuevo umbral queda a la mitad de esa onda
```

Esto es clave: el sensor **se adapta automáticamente** a la fuerza de la señal de cada persona, en vez de usar un número fijo que podría no funcionar para todos.

## 6. Filtros para evitar ruido falso

Hay varias condiciones con la variable `N` (tiempo desde el último latido) para evitar que ruido eléctrico o vibraciones se confundan con un latido real:

- Ignora cambios muy rápidos (`N > 250`) — un corazón no late más rápido que eso.
- Si pasan más de 2.5 segundos (`N > 2500`) sin detectar nada (por ejemplo, si el dedo se despega del sensor), resetea todo a valores por defecto y empieza de nuevo.

## 7. "Coherencia" (nivel de relajación)

El código también observa si el `IBI` va subiendo o bajando de un latido a otro (`goingUp`). Cada vez que la tendencia cambia de dirección, suma 1 a un contador (`coh`). Cada 12 segundos (`cohPeriod`) guarda ese conteo como `tCoh`, que luego se usa para decidir el color del LED (rojo = baja relajación, azul = moderada, verde = alta). La idea es que una respiración lenta y constante produce menos cambios de dirección, lo cual se interpreta como más relajación.

## 8. Envío de datos por Serial

`AllSerialHandling.ino` decide cómo mostrar los datos: o manda números con un prefijo (`S` = señal cruda, `B` = BPM, `Q` = IBI) para ser leídos por un programa externo, o dibuja un gráfico simple con guiones (`---`) en el Monitor Serial.

---

## Por qué tus valores (656, variando solo entre 655–658) casi no cambian

Tu sketch actual (`dispositivo2.ino`) **todavía no hace nada del procesamiento anterior** — solo hace `analogRead()` y lo imprime cada 20ms. Eso está bien para este primer paso, pero significa que estás viendo la señal 100% cruda, sin ningún filtro.

Aun así, con un sensor bien puesto sobre el dedo, ese valor crudo debería subir y bajar de forma visible con cada latido (normalmente decenas de unidades, no solo 1–3). Que casi no varíe sugiere que el sensor no está captando bien el pulso todavía. Causas típicas:

1. **Presión y contacto del dedo**: el sensor debe tocar la piel con presión firme y constante, y la mano debe quedarse quieta. Si el dedo se mueve o hace poca presión, casi no hay señal.
2. **Luz ambiental**: el sensor de pulso funciona con un LED y un fototransistor; la luz externa (sol, lámparas) puede "inundar" la lectura. Prueba tapando el sensor y el dedo con la otra mano.
3. **Alimentación**: si estás alimentando desde el puerto USB de la computadora, a veces hay ruido eléctrico. Si tienes una batería LiPo para el Lilypad, prueba con esa.
4. **Dale unos segundos**: espera unos 5-10 segundos con el dedo quieto sobre el sensor antes de juzgar la variación.
5. **Revisa el cableado**: negro a GND, rojo a VCC/5V, morado (señal) al pin 6. Un mal contacto en alguno de estos puede dar una lectura plana.

Si después de probar esto la señal sigue casi plana, sería bueno confirmar con un multímetro o con otro sensor de pulso que el sensor mismo funciona bien.
