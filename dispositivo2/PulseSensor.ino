
//  Deteccion de latidos para el Pulse Sensor Amped.
//  Basado en el codigo de Joel Murphy y Yury Gitman (pulsesensor.com), el
//  mismo algoritmo que usa Meditation_Trainer-master/Interrupt.ino.
//
//  Timer1 se configura para leer el sensor cada 2ms (500Hz) en un
//  ATmega32U4 corriendo a 8MHz, que es el reloj de la LilyPad Arduino USB.

volatile int rate[10];                    // last 10 IBI values, used to smooth BPM
volatile unsigned long sampleCounter = 0; // time in ms since sampling started
volatile unsigned long lastBeatTime = 0;  // sampleCounter value at the last beat
volatile int P;                           // running peak of the pulse wave
volatile int T;                           // running trough of the pulse wave
volatile int thresh;                      // beat-detection threshold, self-adjusts
volatile int amp = 100;                   // amplitude of the pulse wave
volatile boolean firstBeat = true;        // used to seed rate[] with a real IBI
volatile boolean secondBeat = false;      // used to seed rate[] with a real IBI

int baseline;                             // resting sensor reading, measured at startup
const int threshMargin = 65;              // how far above baseline counts as a beat;
                                           // raise this if BPM reads unrealistically high
                                           // (noise crossing the threshold), lower it if
                                           // no beats are detected at all

// Prints the raw signal alongside the detector's internal state (threshold,
// running peak/trough), so noise crossing the threshold is visible on its own.
void printPulseStatus() {
  Serial.print("Status - signal: ");
  Serial.print(Signal);
  Serial.print(", thresh: ");
  Serial.print(thresh);
  Serial.print(", peak: ");
  Serial.print(P);
  Serial.print(", trough: ");
  Serial.println(T);
}

void pulseSensorSetup() {
  baseline = analogRead(pulsePin);        // idle level varies per sensor/board, so calibrate it
  P = baseline;
  T = baseline;
  thresh = baseline + threshMargin;
  interruptSetup();
}

void interruptSetup() {
  TCCR1A = 0x00;
  TCCR1B = 0x0C;  // prescaler = 256
  OCR1A = 0x3E;   // count to 62 -> interrupt every 2ms at 8MHz
  TIMSK1 = 0x02;
  sei();
}

// Runs every 2ms. Reads the sensor, tracks the peak/trough of the wave and
// decides when a heartbeat happened.
ISR(TIMER1_COMPA_vect) {
  cli();
  Signal = analogRead(pulsePin);
  sampleCounter += 2;
  int N = sampleCounter - lastBeatTime;

  if (Signal < thresh && N > (IBI / 5) * 3) {  // avoid dicrotic notch noise
    if (Signal < T) {
      T = Signal;
    }
  }

  if (Signal > thresh && Signal > P) {
    P = Signal;
  }

  if (N > 250) {                                 // avoid high frequency noise
    if ((Signal > thresh) && (Pulse == false) && (N > (IBI / 5) * 3)) {
      Pulse = true;
      IBI = sampleCounter - lastBeatTime;        // time between beats, in ms
      lastBeatTime = sampleCounter;

      if (secondBeat) {
        secondBeat = false;
        for (int i = 0; i <= 9; i++) {
          rate[i] = IBI;
        }
      }

      if (firstBeat) {
        firstBeat = false;
        secondBeat = true;
        sei();
        return;                                  // this IBI is not reliable yet
      }

      word runningTotal = 0;                     // average the last 10 IBI values
      for (int i = 0; i <= 8; i++) {
        rate[i] = rate[i + 1];
        runningTotal += rate[i];
      }
      rate[9] = IBI;
      runningTotal += rate[9];
      runningTotal /= 10;
      BPM = 60000 / runningTotal;                 // beats that fit in a minute
      QS = true;
    }
  }

  if (Signal < thresh && Pulse == true) {         // signal is falling, beat is over
    Pulse = false;
    amp = P - T;                                  // amplitude of this pulse wave
    thresh = amp / 2 + T;                         // re-center threshold at 50%
    P = thresh;
    T = thresh;
  }

  if (N > 2500) {                                 // 2.5s with no beat, e.g. finger removed
    thresh = baseline + threshMargin;
    P = baseline;
    T = baseline;
    lastBeatTime = sampleCounter;
    firstBeat = true;
    secondBeat = false;
  }

  sei();
}
