
//  Guante de percusion: dos piezos en las puntas de dos dedos detectan golpes
//  contra una superficie, y un FSR que se toca con la mano opuesta modula el
//  sonido del lado del navegador. Todo sale por Serial como lineas de texto.
//
//  Inspirado en https://learn.adafruit.com/midi-drum-glove, pero en vez del
//  umbral binario de ese proyecto (golpe si / golpe no) capturamos el PICO de
//  cada golpe, que es lo que le da intensidad a la nota.

const int piezoPins[2] = {A2, A3};       // piezo del dedo 0 y del dedo 1
const int fsrPin = A4;                   // FSR con pulldown de 10K a GND

// Cada piezo lleva su propio front-end RC en la punta del dedo:
//   piezo --+-- R_serie 10K --+-- A2/A3
//           |                 |
//        R_pd 100K          C 100nF
//           |                 |
//          GND               GND
// El capacitor forma un divisor con la capacidad del piezo (~20nF) y atenua el
// transitorio ~6 veces: sin el, con AREF = 3.3V, casi cualquier golpe satura en
// 1023 y se pierde justo la dinamica que queremos medir. Ademas el pasabajos
// resultante (~160Hz) elimina la resonancia mecanica del disco (3-6kHz), que
// este loop no alcanza a muestrear: sin filtrar, el pico caeria en una fase
// arbitraria del timbrado y variaria 20-40% entre golpes identicos.
// El pulldown es de 100K y no de 1M porque, con el capacitor, 1M daria una
// constante de tiempo de 120ms y bloquearia el retrigger casi 300ms.

// Deteccion de golpe. Los umbrales estan en cuentas del ADC por encima del
// reposo medido en setup(); hay que calibrarlos contra el guante real (el 40
// de Adafruit corresponde a otro front-end).
const int UMBRAL_ON = 20;                // ~65mV, bien por encima del ruido del ADC (+-3)
const int UMBRAL_OFF = UMBRAL_ON / 2;    // histeresis: evita re-disparar en la cola del golpe
const unsigned long VENTANA_PICO = 8;    // ms de escucha para quedarse con el maximo
const unsigned long BLOQUEO_MS = 60;     // ms de silencio tras emitir, para no contar el rebote

// Los dos piezos estan acoplados mecanicamente por el guante y por el hueso:
// golpear un dedo excita el piezo del otro. Cuando los dos pican en la misma
// ventana, se emite siempre el mayor, y el menor solo si llega a esta fraccion
// del mayor (o sea, si parece un golpe genuino y no diafonia). Medir el valor
// real golpeando un solo dedo y mirando que fraccion aparece en el otro canal.
const float FACTOR_DIAFONIA = 0.6;

const bool DIAGNOSTICO = false;          // true agrega una linea legible por golpe;
                                          // deja el print fuera del camino critico
                                          // de latencia cuando esta en false

enum EstadoPiezo { REPOSO, MIDIENDO_PICO, BLOQUEADO };

struct Piezo {
  EstadoPiezo estado;
  int base;                              // lectura de reposo, medida al arrancar
  int pico;                              // maximo de la ventana actual, ya sin la base
  unsigned long inicioVentana;
  unsigned long finGolpe;
};

Piezo piezos[2];

void setup() {
  Serial.begin(9600);

  // El reposo no se asume en 0: con el pulldown queda en ~0-5, pero medirlo no
  // cuesta nada y documenta el criterio (el mismo que hubo que aplicarle al
  // sensor de pulso, cuyo reposo real estaba muy lejos del valor asumido).
  for (int i = 0; i < 2; i++) {
    long suma = 0;
    for (int n = 0; n < 64; n++) {
      suma += analogRead(piezoPins[i]);
    }
    piezos[i].base = suma / 64;
    piezos[i].estado = REPOSO;
    piezos[i].pico = 0;
    piezos[i].inicioVentana = 0;
    piezos[i].finGolpe = 0;
  }
}

unsigned long lastStatusPrint = 0;
const unsigned long statusInterval = 3000;   // linea legible de estado cada 3 segundos

unsigned long lastForcePrint = 0;
const unsigned long forceInterval = 20;      // lectura cruda del FSR cada 20ms (50Hz):
                                              // sacar la interrupcion del sensor de pulso
                                              // libero el tiempo de CPU para subir de 30ms
                                              // a 20ms, lo que suaviza la distorsion y el
                                              // efecto global del canvas del lado de la web

// Linea legible por golpe ("G:<dedo>,<pico>") que consume el lector de Web Serial
// de las paginas prototipo_percusion_guante_*.html. El pico va crudo (0-1023, ya
// restada la base): la normalizacion vive del lado del navegador, donde se puede
// recalibrar el rango con sliders mientras se toca.
void printGolpe(int dedo, int pico) {
  Serial.print("G:");
  Serial.print(dedo);
  Serial.print(",");
  Serial.println(pico);
}

// Linea legible ("F:<0-1023>") consumida por el mismo lector; se mantiene sin
// cambios respecto de la version anterior del sketch, asi que las paginas viejas
// que solo miran el FSR siguen funcionando con este firmware.
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

// Avanza la maquina de estados de un piezo. Devuelve true si su ventana de pico
// acaba de vencer, es decir, si hay un golpe candidato esperando arbitraje.
bool actualizarPiezo(int i, unsigned long ahora) {
  Piezo &p = piezos[i];
  int v = analogRead(piezoPins[i]) - p.base;
  if (v < 0) v = 0;

  switch (p.estado) {
    case REPOSO:
      if (v > UMBRAL_ON) {
        p.estado = MIDIENDO_PICO;
        p.pico = v;
        p.inicioVentana = ahora;
      }
      break;

    case MIDIENDO_PICO:
      if (v > p.pico) p.pico = v;
      if (ahora - p.inicioVentana >= VENTANA_PICO) {
        return true;                     // el arbitro decide si se emite
      }
      break;

    case BLOQUEADO:
      if (ahora - p.finGolpe >= BLOQUEO_MS && v < UMBRAL_OFF) {
        p.estado = REPOSO;
        p.pico = 0;
      }
      break;
  }
  return false;
}

// Emite el golpe de un dedo y lo pasa a bloqueo.
void emitirGolpe(int i, unsigned long ahora) {
  printGolpe(i, piezos[i].pico);
  if (DIAGNOSTICO) {
    Serial.print("Golpe dedo ");
    Serial.print(i);
    Serial.print(" - pico ");
    Serial.println(piezos[i].pico);
  }
  piezos[i].estado = BLOQUEADO;
  piezos[i].finGolpe = ahora;
}

// Descarta el golpe de un dedo (diafonia del otro) sin emitirlo, pero igual lo
// manda a bloqueo: la vibracion sigue ahi y no queremos que dispare de nuevo.
void descartarGolpe(int i, unsigned long ahora) {
  piezos[i].estado = BLOQUEADO;
  piezos[i].finGolpe = ahora;
}

void loop() {
  unsigned long ahora = millis();

  bool vencio0 = actualizarPiezo(0, ahora);
  bool vencio1 = actualizarPiezo(1, ahora);

  if (vencio0 || vencio1) {
    // Si el otro dedo tambien esta midiendo su pico, los dos golpes pertenecen a
    // la misma ventana y hay que compararlos entre si antes de emitir. Al dedo
    // que arranco despues se lo evalua con la ventana 1-2ms corta, pero para ese
    // entonces su pico ya paso: es la diferencia entre los dos lo que importa.
    bool midiendo0 = (piezos[0].estado == MIDIENDO_PICO);
    bool midiendo1 = (piezos[1].estado == MIDIENDO_PICO);

    if (midiendo0 && midiendo1) {
      int mayor = (piezos[0].pico >= piezos[1].pico) ? 0 : 1;
      int menor = 1 - mayor;
      emitirGolpe(mayor, ahora);
      if (piezos[menor].pico > FACTOR_DIAFONIA * piezos[mayor].pico) {
        emitirGolpe(menor, ahora);       // golpe genuino simultaneo
      } else {
        descartarGolpe(menor, ahora);    // diafonia mecanica del dedo mayor
      }
    } else if (vencio0) {
      emitirGolpe(0, ahora);
    } else {
      emitirGolpe(1, ahora);
    }
  }

  if (ahora - lastForcePrint >= forceInterval) {
    lastForcePrint = ahora;
    printForceReading();
  }

  if (ahora - lastStatusPrint >= statusInterval) {
    lastStatusPrint = ahora;
    printFsrReading();
  }
}
