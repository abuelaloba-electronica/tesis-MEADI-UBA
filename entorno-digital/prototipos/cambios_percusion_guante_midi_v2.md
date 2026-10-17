# Cambios del guante (a) con Helm → v2: el FSR como disco azul

Archivo nuevo: `entorno-digital/prototipo_percusion_guante_a_midi_v2_dispositivo.html`.
`prototipo_percusion_guante_a_midi_dispositivo.html` queda intacta para
comparar. El sketch de `dispositivo2` no cambia, y **el sonido tampoco**: los
golpes siguen siendo noteOn por tramo de escala y el FSR sigue saliendo como
CC1 hacia Helm, con el mismo filtro de repetidos y el mismo pánico.

El pedido, en una frase: que los dos piezos dibujen anillos huecos en dos
tonos de amarillo, y que el FSR se vea como el disco azul relleno que antes
era del dedo 0.

---

## 1 · Los dos dedos son anillos, separados por tono

**Qué cambió.** `dibujarGolpe()` ya no distingue la forma por dedo: siempre
traza un anillo de grosor `0.35·r`. El dedo 0 es amarillo `#FFDE21` y el dedo
1 naranja `#FF8C1A`. El selector de color pasó a ofrecer sólo pares de
amarillos (amarillo + naranja, amarillo + rojo anaranjado, amarillo fluo +
naranja). Las barras del panel usan los mismos colores que el dibujo.

**Por qué.** La forma pasa a codificar **qué sensor** produjo la marca (anillo
= golpe, disco = presión) y el tono, **qué dedo**. Antes la forma separaba los
dedos y el FSR no tenía marca propia. Los tonos se eligieron vecinos a
propósito: los dos dedos son el mismo gesto, y con `multiply` un amarillo
sobre un naranja sigue leyéndose como "familia amarilla", nunca como azul.

## 2 · El FSR dibuja un disco por presión

**Qué cambió.** `feedForce()` sigue mandando el CC1 y además detecta el
comienzo y el fin de cada presión. Al empezar (`fuerza > 0,06`) se elige una
posición al azar; mientras dura, el disco vive en el overlay; al terminar
(`fuerza < 0,03`) se estampa en `#acum`.

**Por qué un evento y no una señal continua.** Un FSR apretado durante
segundos, dibujado frame a frame, sería una mancha que se espesa sin límite,
o un disco que late y no deja registro. Tratando cada presión como un gesto,
el lienzo acumula presiones igual que acumula golpes, y el disco se puede
comparar con los anillos: los dos son "una cosa que pasó".

**Por qué la histéresis 0,06 / 0,03.** El FSR en reposo no marca 0 exacto; sin
umbral el ruido dibujaría discos solos. Sin histéresis, una presión floja que
ronda el umbral se partiría en una ráfaga de discos chicos. Son estimaciones:
hay que confirmarlas con el reposo real del sensor cosido.

## 3 · El disco sigue el pico, no la fuerza actual

**Primer borrador.** El radio del disco vivo seguía `fuerzaSuave` y al soltar
se estampaba con el pico. Al aflojar, el disco vivo se achicaba y el estampado
reaparecía grande: un salto visible justo en el momento de soltar.

**Qué cambió.** El disco vivo usa el pico acumulado de `fuerzaSuave` desde que
empezó la presión: crece, nunca se achica, y lo estampado coincide con lo
último que se vio. La prueba de abajo lo confirma (mismo radio vivo y
estampado).

**Radio** de `0,05` a `0,14 · min(W,H)`, más amplio que los anillos
(`0,08`–`0,10`): una presión es lenta y su tamaño es lo único que la distingue
de otra. **Opacidad** con la misma ley que los golpes (`ALPHA_MIN = 0,08`).

## 4 · `mix-blend-mode: multiply` en el overlay

**Por qué.** El disco vivo está en `#over` y el estampado en `#acum` con
`multiply`. Si el overlay compusiera normal, el disco vivo taparía lo que
tiene abajo y, al estamparse, cambiaría de golpe a verse "a través". Con el
overlay también en `multiply`, los dos se ven igual. Efecto lateral: los
anillos de impacto (200 ms) también componen así; el cambio es apenas
visible.

## 5 · Se quitó el efecto global del FSR

**Qué se fue.** El filtro CSS (`blur` + `contrast` + `saturate`) sobre
`#acum` y la tinta violeta acumulada con `fillRect`.

**Por qué.** Con el FSR como marca propia, el desenfoque global borronearía
justamente el disco azul que lo representa. La tinta, además, se sumaba por
frame y no por tiempo: en un monitor de 120 Hz oscurecía el doble de rápido, y
con presión sostenida dejaba el lienzo oscuro en pocos segundos. El efecto
global sigue disponible en la versión anterior para comparar.

## 6 · La tecla F es una rampa

**Qué cambió.** Mantener **F** ya no fija la presión en 0,68: la hace subir de
0 a 1 en `FSR_RAMPA = 1,5 s`, desde `draw()`, entrando por `feedForce` como
cualquier lectura.

**Por qué.** Con un valor fijo, sin la placa todos los discos salían del mismo
tamaño y Helm recibía un único CC (86). Con la rampa se ven discos de distinto
tamaño según cuánto se mantenga la tecla, y en Helm se escucha el barrido
completo del parámetro asignado a la rueda de modulación.

## 7 · Desconectar estampa la presión en curso

`disconnectSerial()` llama a `feedForce(0)` después de `silenciarTodo()`. Sin
eso, si el cable se corta con el FSR apretado, el disco quedaría vivo en el
overlay para siempre. Como `silenciarTodo()` ya dejó el CC en 0, no se manda
un CC repetido.

---

## Validación

- `node --check` sobre el `<script>` extraído: sin errores.
- `harness_midi.js` sin cambios: **todo pasa** (puertos, notas colgadas,
  retrigger, escala, CC, pánico). El costo de dibujo da ~2,8 arcos por frame
  contra ~1,8 de la anterior: es el disco vivo, porque la prueba de pánico
  deja el FSR en 0,8. Sigue sin crecer con el historial.
- Prueba aparte en Node (no incorporada al harness), con **F** simulada:
  - a 0,5 s el disco vivo tiene radio 63 px y opacidad 0,37; a 2 s, 112 px y
    opacidad 1;
  - al soltar se estampa en `#acum` con radio 112, igual al vivo, y el overlay
    queda sin disco;
  - una lectura de 0,04 (ruido bajo el umbral) no dibuja nada.

**Lo que no se probó**: verlo en Chrome con el FSR real, ni el envío a Helm.
