
//  Lee un acelerómetro/giroscopio LSM6DSO32 por I2C y envía los tres ejes
//  de aceleración por Serial, para que bandada_prototipo_v5a_dispositivo.html
//  (o las versiones archivadas en prototipos/) los reciba via Web Serial y alimente
//  window.updateAccel(x, y, z). El LSM6DSO32 es un IMU de 6 ejes
//  (acelerómetro + giroscopio); acá solo se usa el canal de acelerómetro.
//
//  El sketch tiene DOS salidas a partir de la misma lectura:
//
//    1. la línea de texto por Serial, que no cambió nunca de formato y es lo
//       que consume el navegador;
//    2. una tira de 13 LEDs WS2812B sobre la prenda, que se enciende con el
//       movimiento: quieta la tira queda como una brasa ámbar apenas visible,
//       y con movimiento dinámico sube a amarillo cálido sin pasar nunca de
//       BRILLO_MAXIMO. Es un actuador, no un diagnóstico: el textil muestra
//       en el cuerpo la misma energía que mueve la bandada en la pantalla.
//
//  Pensado para una Adafruit Flora V3 (ATmega32u4, USB nativo, 3.3V): el
//  LSM6DSO32 se conecta por I2C usando los pads dedicados SCL y SDA de la
//  placa, así que no compite con el pad D6 que usa la tira.
//  Referencia de la placa: https://learn.adafruit.com/getting-started-with-flora
//
//  Cableado de la tira (ver README.md, sección Cableado de la tira, y sus
//  problemas conocidos). Con la placa desenchufada y en este orden:
//      GND de la tira  -> pad GND de la Flora   (conectar este primero)
//      +5V de la tira  -> pad VBATT de la Flora (no el pad de 3.3V)
//      DIN de la tira  -> pad D6 de la Flora
//
//  Protocolo de salida, una línea por lectura ("A:<x>,<y>,<z>"), en "g"
//  (1g = 9.80665 m/s^2). En reposo, el eje que apunta hacia abajo va a
//  marcar ~1.0 por la gravedad; eso es esperado, no un error de lectura. La
//  separación entre orientación y movimiento la hace el navegador; la tira
//  la hace por su cuenta (ver actualizarEnergia).

#include <Wire.h>
#include <Adafruit_LSM6DSO32.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_NeoPixel.h>

Adafruit_LSM6DSO32 dso32;

const unsigned long sendInterval = 30;   // ms entre lecturas (~33/s, igual que el FSR de dispositivo2)
unsigned long lastSend = 0;

// --- Tira de LEDs -----------------------------------------------------
// BRILLO_MAXIMO es un techo de corriente, no una preferencia estética: 13 LEDs
// en blanco pleno pedirían ~780 mA, bastante más de lo que da un puerto USB.
// Con ámbar a este techo el consumo queda en el orden de los 90 mA.
const uint8_t PIN_DATOS     = 6;    // pad D6 de la Flora (también rotulado A7)
const uint16_t CANTIDAD     = 13;   // LEDs de la tira
const uint8_t BRILLO_MAXIMO = 60;   // de 255: techo para no pasarse del presupuesto de corriente del USB

// NEO_GRB + NEO_KHZ800 es el orden de bytes y la velocidad de bit de los
// WS2812B. Si los colores salen permutados (rojo por verde, etc.) la tira
// es de otra variante: probar NEO_RGB o NEO_GRBW.
Adafruit_NeoPixel tira(CANTIDAD, PIN_DATOS, NEO_GRB + NEO_KHZ800);

const unsigned long PASO_LUZ = 40;   // ms entre cuadros de luz (~25/s)
unsigned long ultimoPasoLuz = 0;

// Acondicionamiento de la señal para la luz. Es la misma idea que usa el
// navegador (filtros exponenciales + referencia de reposo), reducida a lo
// que hace falta acá: un solo número de 0 a 1.
const float TAU_BASE    = 0.70;   // s: línea de base por eje. Absorbe la gravedad Y la postura,
                                  //    así que una inclinación mantenida deja de contar como movimiento.
const float TAU_ATAQUE  = 0.12;   // s: la luz sube casi de inmediato con el movimiento
const float TAU_CAIDA   = 0.70;   // s: y baja despacio, para que cada gesto deje estela
const float ENERGIA_REF = 0.55;   // g de aceleración sin gravedad que corresponden a energia = 1
const float ZONA_MUERTA = 0.03;   // g: por debajo de esto no hay movimiento, es ruido del sensor.
                                  //    Sin esta zona muerta la brasa de reposo no queda quieta:
                                  //    el ruido propio del LSM6DSO32 la sube de ~3 a ~6 de 255 y la
                                  //    hace titilar. Es el mismo recurso que TILT_DEADBAND en las páginas.

// Escala de la luz. `valor` es el canal V del HSV, no el brillo global: el
// brillo global queda FIJO en BRILLO_MAXIMO (ver setup) y toda la modulación
// pasa por acá.
//
// El recorrido de matiz se queda ENTERO dentro del amarillo cálido: ámbar en
// reposo, amarillo en el pico, nunca rojo. El extremo bajo no puede bajar de
// ~38 grados por una razón de cuantización, no de gusto: a brillo de brasa
// quedan 2 o 3 valores útiles por canal, así que un matiz más rojo deja el
// canal verde en 0 y la tira se ve roja franca aunque el matiz nominal sea
// naranja. En 7000 el verde sobrevive al redondeo (relación verde/rojo >= 0.5
// en toda la escala).
const uint8_t VALOR_REPOSO  = 16;     // de 255, antes del techo: la brasa (efectivo ~3/255)
const uint16_t MATIZ_REPOSO = 7000;   // de 65536: ~38 grados, ámbar cálido
const uint16_t MATIZ_MAXIMO = 9600;   // de 65536: ~53 grados, amarillo cálido

// Exponente de la rampa de brillo. Va sobre `energia`, NO por canal: la
// gamma32() de la librería corrige cada canal por separado, y como el verde
// siempre vale menos que el rojo en un ámbar, lo hunde a 0 mucho antes —
// medido: en la mitad baja de la escala daba rojo puro, y en reposo apagaba
// la tira del todo. Corrigiendo la energía en cambio, la proporción entre
// canales (o sea el color) se mantiene en todo el recorrido.
const float CURVA_BRILLO = 2.2;

float baseX = 0, baseY = 0, baseZ = 0;
float energia = 0;
bool energiaLista = false;   // la primera lectura carga la línea de base en vez de encender la tira

void setup() {
  Serial.begin(9600);

  tira.begin();
  // setBrightness() una sola vez y nunca más: reescala el buffer de píxeles
  // en el momento de llamarlo, así que invocarlo en cada cuadro acumula
  // pérdida de precisión. Dejarlo clavado en el techo garantiza además que
  // ningún camino del código pueda pasarse del presupuesto de corriente.
  tira.setBrightness(BRILLO_MAXIMO);
  tira.clear();
  tira.show();   // arrancar apagada: si la tira queda encendida sola, el problema es de datos o de alimentación

  // Dirección I2C por defecto del breakout Adafruit: 0x6A. Sin
  // acelerómetro no hay nada que enviar.
  while (!dso32.begin_I2C()) {
    delay(200);
  }
  dso32.setAccelRange(LSM6DSO32_ACCEL_RANGE_4_G);   // margen suficiente para gestos de mano sin perder resolución
  dso32.setAccelDataRate(LSM6DS_RATE_104_HZ);
}

void loop() {
  unsigned long now = millis();

  // Dos temporizadores independientes y ningún delay(): la cadencia de la
  // línea serial no depende del refresco de la tira ni al revés.
  if (now - lastSend >= sendInterval) {
    lastSend = now;
    sendAccelReading();
  }

  if (now - ultimoPasoLuz >= PASO_LUZ) {
    ultimoPasoLuz = now;
    actualizarTira();
  }
}

void sendAccelReading() {
  sensors_event_t accelEvent, gyroEvent, tempEvent;
  dso32.getEvent(&accelEvent, &gyroEvent, &tempEvent);   // el giroscopio y la temperatura se leen pero no se usan

  const float G = 9.80665;   // accelEvent.acceleration.* viene en m/s^2
  float gx = accelEvent.acceleration.x / G;
  float gy = accelEvent.acceleration.y / G;
  float gz = accelEvent.acceleration.z / G;

  Serial.print("A:");
  Serial.print(gx, 2);
  Serial.print(",");
  Serial.print(gy, 2);
  Serial.print(",");
  Serial.println(gz, 2);

  // dt medido, no la constante sendInterval: si el lazo se atrasa, los
  // filtros de abajo no se desfasan.
  static unsigned long ultimaEnergia = 0;
  unsigned long ahora = millis();
  float dt = ultimaEnergia == 0 ? (sendInterval / 1000.0) : (ahora - ultimaEnergia) / 1000.0;
  ultimaEnergia = ahora;
  actualizarEnergia(gx, gy, gz, dt);
}

// De los tres ejes crudos a un solo número de 0 a 1 que representa "cuánto
// movimiento hay AHORA".
//
// El módulo crudo NO sirve para esto: incluye la gravedad, así que en reposo
// vale ~1.0 de forma permanente y la tira nunca se apagaría. Lo que se usa es
// el módulo de la aceleración MENOS una línea de base que persigue lentamente
// a la lectura (tau 1 s). Esa línea de base es la gravedad más la postura, y
// como se actualiza sola no hace falta saber cómo quedó orientado el textil al
// coserlo ni al ponérselo.
//
// La envolvente es asimétrica a propósito: sube en 0.12 s (el golpe se ve en
// el instante) y baja en 0.70 s (queda estela, la luz no parpadea con cada
// muestra).
void actualizarEnergia(float gx, float gy, float gz, float dt) {
  if (!energiaLista) {
    // Al enchufar, la gravedad aparece de golpe: si entrara como movimiento
    // la tira arrancaría con un fogonazo. Misma precaución que `signalPrimed`
    // del lado del navegador.
    energiaLista = true;
    baseX = gx; baseY = gy; baseZ = gz;
    energia = 0;
    return;
  }

  float kBase = 1.0 - exp(-dt / TAU_BASE);
  baseX += (gx - baseX) * kBase;
  baseY += (gy - baseY) * kBase;
  baseZ += (gz - baseZ) * kBase;

  float dx = gx - baseX, dy = gy - baseY, dz = gz - baseZ;
  float modulo = sqrt(dx * dx + dy * dy + dz * dz) - ZONA_MUERTA;
  if (modulo < 0) modulo = 0;
  float objetivo = modulo / ENERGIA_REF;
  if (objetivo > 1) objetivo = 1;

  float tau = objetivo > energia ? TAU_ATAQUE : TAU_CAIDA;
  energia += (objetivo - energia) * (1.0 - exp(-dt / tau));
}

// Un cuadro de luz: los 13 LEDs al mismo nivel. La variación se lee como una
// sola masa de luz que late con el cuerpo.
//
// La energía mueve dos cosas a la vez: el brillo (que es lo que se nota) y,
// más sutilmente, el matiz, de ámbar en reposo a amarillo en el máximo. La
// corrección perceptual de la rampa se aplica a la energía (CURVA_BRILLO) y
// no al color ya armado, para no desteñirlo; ver el comentario de la
// constante.
void actualizarTira() {
  float rampa = pow(energia, CURVA_BRILLO);
  uint8_t valor = VALOR_REPOSO + (uint8_t)(rampa * (255 - VALOR_REPOSO));
  uint16_t matiz = MATIZ_REPOSO + (uint16_t)(energia * (MATIZ_MAXIMO - MATIZ_REPOSO));
  uint32_t color = tira.ColorHSV(matiz, 255, valor);

  for (uint16_t i = 0; i < CANTIDAD; i++) {
    tira.setPixelColor(i, color);
  }
  tira.show();
}
