# dispositivo3 — EMG de pantorrilla

Proyecto de Arduino sobre una placa **LilyPad Arduino USB** (ATmega32U4, 3.3V,
8MHz), la misma de `dispositivo2`. Un módulo **AD8232** con tres electrodos de
superficie mide la actividad eléctrica del gemelo mientras el usuario contrae y
relaja la pantorrilla. El sketch emite por Serial la amplitud de esa actividad,
pensada para alimentar `window.feedEMG(v01)` en una visualización web.

## Hardware

| AD8232 (breakout) | LilyPad USB | Nota |
|---|---|---|
| `3.3V` | `+` | Alimentación directa, sin divisor |
| `GND` | `-` | |
| `OUTPUT` | **A2** | Salida analógica, centrada en ~1,65 V (~512 cuentas) |
| `LO+` | **2** | En alto si se suelta un electrodo |
| `LO-` | **3** | En alto si se suelta el otro |
| `SDN` | sin conectar | El breakout lo deja en alto (encendido) |

Quedan libres `9, 10, 11, A3, A4, A5`. Verificar la serigrafía antes de coser.

**Electrodos sobre la pantorrilla** (colores del cable de SparkFun; verificar
contra el cable real):

- **Rojo (RA) y amarillo (LA)** — los dos de medición, sobre el vientre del
  gemelo (la parte más abultada), **alineados con la fibra del músculo**
  (verticales, uno sobre otro) y a 2–3 cm entre centros.
- **Verde (RL)** — referencia, sobre una zona ósea sin músculo: la cara
  interna de la tibia o el maléolo del tobillo.

Piel limpia (alcohol) y electrodos de gel descartables para las primeras
pruebas; los electrodos textiles cosidos tienen más impedancia de contacto y
más ruido, y conviene compararlos contra el gel antes de decidir.

## Protocolo de salida

Una línea por lectura, terminada en `\n`, a 9600 baudios.

| Línea | Frecuencia | Para qué |
|---|---|---|
| `E:<amplitud>` | cada 20 ms (50 Hz) | Amplitud media rectificada (MAV) de la ventana, en cuentas del ADC: ~0 en reposo, techo teórico ~512. Para la web |
| `L:<0\|1>` | al cambiar, y cada 3 s | `1` = algún electrodo suelto. Para la web |
| `EMG base = <n> - amplitud = <n> - <estado>` | cada 3 s | Diagnóstico legible |
| `S:<muestra>` | 1 kHz, sólo con `MODO_CRUDO = true` | Forma de onda centrada, para el Serial Plotter |

La amplitud va **cruda**: la normalización a 0–1 para `feedEMG()` vive del lado
del navegador, igual que la gravedad del acelerómetro o el pico del guante, para
poder recalibrar el rango según la persona y la ubicación de los electrodos.
Mientras hay un electrodo suelto, y durante 500 ms después de reconectarlo, se
emite `E:0`.

## Procesamiento en la placa

1. **Muestreo a 1 kHz fijo**, con `micros()` y sin `delay()`.
2. **Referencia de reposo por pasaaltos IIR** (α = 1/256, corte ~0,6 Hz, en
   punto fijo). No se asume 512: el reposo real depende del contacto de los
   electrodos y deriva con el sudor. Al reconectar un electrodo se re-siembra
   con la lectura actual en vez de esperar ~1 s a que se recupere del riel.
3. **Rectificación y media por ventana de 20 muestras.** Esto sí se hace en la
   placa y no en la web, a diferencia del resto de las correcciones: mandar
   muestras sueltas a 50 Hz sería submuestrear la señal (aliasing). La MAV es el
   resumen que sí sobrevive a esa tasa. La envolvente suave y la detección de
   contracción quedan en el navegador, que ya las implementa dentro de
   `feedEMG()` en los prototipos.

## Trampas conocidas

- **El AD8232 es un front-end de ECG, no de EMG.** El breakout de SparkFun
  filtra ~0,5–40 Hz, y la energía del EMG de superficie está en 20–450 Hz: la
  mayor parte de la señal queda atenuada. Con un músculo grande como el gemelo
  la contracción se ve igual, pero con poca amplitud. Si no alcanza, las
  opciones son modificar los componentes del filtro del breakout o pasar a un
  módulo de EMG (MyoWare), que ya entrega la envolvente.
- **Los artefactos de movimiento caen dentro de la banda del filtro.** Caminar,
  golpear el cable o apoyar el pie producen picos de 1–10 Hz que la placa no
  puede distinguir de una contracción. Fijar el cable a la prenda cerca de los
  electrodos. Antes de llamarle actividad a algo, comparar contra la pierna
  inmóvil y relajada.
- **`LO+`/`LO-` sólo detectan electrodo suelto, no mal contacto.** Un electrodo
  seco o despegado a medias no los dispara, pero sube el ruido de reposo: mirar
  la amplitud en reposo en la línea legible (debería quedar en un dígito).

## Estado actual / pendiente

- **Primera sesión en hardware**, capturada del Monitor Serial en
  [`salida.txt`](salida.txt) (~30 s). Lo que mostró:
  - **El contacto es el problema principal.** Un tercio del tiempo hay algún
    electrodo suelto (`L:1`), y casi cada movimiento termina soltándolo: la
    `E:` sube 3-6 lecturas hacia el riel y llega `L:1`. Además `L:` alterna
    0/1 decenas de veces seguidas (electrodo rozando). Es lo primero a
    mejorar: electrodos de gel, cable fijado a la prenda cerca de los
    electrodos, referencia sobre hueso.
  - **Reposo en ~60 cuentas** con contacto, no en un dígito: confirma un
    contacto pobre (ver la trampa de `LO+`/`LO-` arriba). Los movimientos van
    de ~150 a ~850.
  - **Tras reconectar, el asentamiento de 500 ms no alcanza**: después de las
    `E:0` llega una cola que cae en exponencial (~100 → ~20 en ~0,5 s), que es
    el pasaaltos re-sembrado con una lectura todavía fuera de lugar. La página
    la descarta; si se quiere resolver acá, re-sembrar con la media de varias
    lecturas o alargar `ASENTAMIENTO_MS`.
- La página que lo consume es
  `entorno-digital/prototipo_emg_acumulacion_v4_dispositivo.html`
  (cuadriláteros superpuestos; el lector serie es el de la v3, ver
  `entorno-digital/prototipos/cambios_emg_acumulacion_v3.md`, sección
  "Calibración con la primera sesión real"). Se recalibró contra
  `salida.txt` con `entorno-digital/tools/harness_emg.js`; falta volver a
  probarla con la placa.
- **Si se cambia el formato de las líneas `E:` o `L:`, hay que actualizar el
  lector de la página que las consuma.**
