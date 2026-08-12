
//  Lee el sensor de pulso y muestra el ritmo cardiaco (BPM) por el puerto
//  serial cada vez que se detecta un nuevo latido. La logica de deteccion de
//  latidos vive en PulseSensor.ino para mantener este archivo simple.

const int pulsePin = A5;                 // Pulse Sensor purple wire connected to pin 5 (analog-capable on LilyPad USB / ATmega32U4)
const int fsrPin = A4;                   // FSR connected to pin A4, with a 10K pulldown resistor to GND

volatile int Signal;              // raw sensor reading, updated every 2ms by the ISR
volatile int IBI = 600;           // time between the last two beats, in ms
volatile boolean Pulse = false;   // true while a beat is in progress
volatile boolean QS = false;      // true once a new BPM value is ready to read
volatile int BPM;                 // beats per minute, updated on every beat

void setup() {
  Serial.begin(9600);
  pulseSensorSetup();
}

unsigned long lastStatusPrint = 0;
const unsigned long statusInterval = 3000;   // print a status line every 3 seconds

unsigned long lastForcePrint = 0;
const unsigned long forceInterval = 30;      // stream the raw FSR reading every 30ms,
                                              // frequent enough for the web prototype to
                                              // detect a 0.4-4s press and its peak force

// Machine-readable line ("F:<0-1023>") consumed by the Web Serial reader in
// prototipo_circulos_fuerza_pulso_dispositivo.html; kept separate from
// printFsrReading()'s human-readable line, which stays for Serial Monitor debugging.
void printForceReading() {
  Serial.print("F:");
  Serial.println(analogRead(fsrPin));
}

// FSR connected to pin A4, with a 10K pulldown resistor to GND
// Based on: https://learn.adafruit.com/force-sensitive-resistor-fsr/using-an-fsr
void printFsrReading() {
  int fsrReading = analogRead(fsrPin);

  Serial.print("FSR reading = ");
  Serial.print(fsrReading);

  if (fsrReading < 10) {
    Serial.println(" - No pressure");
  } else if (fsrReading < 200) {
    Serial.println(" - Light touch");
  } else if (fsrReading < 500) {
    Serial.println(" - Light squeeze");
  } else if (fsrReading < 800) {
    Serial.println(" - Medium squeeze");
  } else {
    Serial.println(" - Big squeeze");
  }
}

void loop() {
  if (QS) {                       // a new beat was detected and BPM was updated
    Serial.print("BPM: ");
    Serial.println(BPM);
    QS = false;                   // clear the flag until the next beat
  }

  unsigned long now = millis();
  if (now - lastForcePrint >= forceInterval) {
    lastForcePrint = now;
    printForceReading();
  }

  if (now - lastStatusPrint >= statusInterval) {
    lastStatusPrint = now;
    printPulseStatus();
    printFsrReading();
  }
}
