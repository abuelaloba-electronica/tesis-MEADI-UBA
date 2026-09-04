
//  Lee un acelerómetro/giroscopio LSM6DSO32 por I2C y envía los tres ejes
//  de aceleración por Serial, para que bandada_prototipo_v3_dispositivo.html
//  los reciba via Web Serial y alimente window.updateAccel(x, y, z).
//  El LSM6DSO32 es un IMU de 6 ejes (acelerómetro + giroscopio); acá solo
//  se usa el canal de acelerómetro.
//
//  Pensado para una Adafruit Flora V3 (ATmega32u4, USB nativo, 3.3V): el
//  LSM6DSO32 se conecta por I2C usando los pads dedicados SCL y SDA de la
//  placa (no hace falta usar ninguno de los pines digitales numerados).
//  Referencia de la placa: https://learn.adafruit.com/getting-started-with-flora
//
//  Protocolo de salida, una línea por lectura ("A:<x>,<y>,<z>"), en "g"
//  (1g = 9.80665 m/s^2). En reposo, el eje que apunta hacia abajo va a
//  marcar ~1.0 por la gravedad; eso es esperado, no un error de lectura.

#include <Wire.h>
#include <Adafruit_LSM6DSO32.h>
#include <Adafruit_Sensor.h>

Adafruit_LSM6DSO32 dso32;

const unsigned long sendInterval = 30;   // ms entre lecturas (~33/s, igual que el FSR de dispositivo2)
unsigned long lastSend = 0;

void setup() {
  Serial.begin(9600);

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
  if (now - lastSend >= sendInterval) {
    lastSend = now;
    sendAccelReading();
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
}
