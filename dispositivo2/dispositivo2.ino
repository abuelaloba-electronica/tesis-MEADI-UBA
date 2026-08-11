
//  Lee el sensor de pulso y muestra el ritmo cardiaco (BPM) por el puerto
//  serial cada vez que se detecta un nuevo latido. La logica de deteccion de
//  latidos vive en PulseSensor.ino para mantener este archivo simple.

const int pulsePin = A5;                 // Pulse Sensor purple wire connected to pin 5 (analog-capable on LilyPad USB / ATmega32U4)

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

void loop() {
  if (QS) {                       // a new beat was detected and BPM was updated
    Serial.print("BPM: ");
    Serial.println(BPM);
    QS = false;                   // clear the flag until the next beat
  }

  unsigned long now = millis();
  if (now - lastStatusPrint >= statusInterval) {
    lastStatusPrint = now;
    printPulseStatus();
  }
}
