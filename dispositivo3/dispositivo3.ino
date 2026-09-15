
//  Pantorrilla EMG: un AD8232 con tres electrodos de superficie sobre la
//  pantorrilla mide la actividad electrica del gemelo mientras el usuario lo
//  contrae y relaja. El sketch muestrea la salida analogica a ritmo fijo, la
//  rectifica alrededor de su reposo y emite la amplitud media de cada ventana
//  por Serial como linea de texto.
//
//  Basado en el conexionado del breakout de SparkFun
//  (https://learn.sparkfun.com/tutorials/ad8232-heart-rate-monitor-hookup-guide),
//  pensado para ECG. Ver la advertencia sobre el filtro en README.md.

const int emgPin = A2;                   // OUTPUT del AD8232
const int loMasPin = 2;                  // LO+ : en alto si se solto el electrodo LA/+
const int loMenosPin = 3;                // LO- : en alto si se solto el electrodo RA/-
// SDN queda sin conectar: el breakout lo tiene en alto (encendido).
// Alimentacion 3.3V de la LilyPad, sin divisor: el AD8232 trabaja a 3.3V y su
// salida queda centrada en ~1.65V, o sea ~512 cuentas con AREF = 3.3V.

// Muestreo. El AD8232 del breakout ya pasabajea a ~40Hz, asi que 1kHz sobra
// para Nyquist, pero deja margen si se modifica el filtro para ver mas banda de
// EMG (20-450Hz). El ADC del 32u4 a 8MHz (prescaler 128) llega a ~4.8kHz.
const unsigned long PERIODO_US = 1000;   // 1 muestra por milisegundo
const int MUESTRAS_VENTANA = 20;         // 20ms por linea "E:" (50Hz, igual que el FSR del dispositivo2)

// Referencia de reposo. No se asume 512: se sigue con un pasaaltos IIR de primer
// orden (alfa = 1/256 a 1kHz, corte ~0.6Hz), que absorbe la deriva lenta del
// contacto piel-electrodo sin tocar la banda de la contraccion. Se guarda en
// punto fijo Q8 (x256) para no usar float dentro del camino de muestreo.
const int DESPLAZAMIENTO_BASE = 8;       // alfa = 1 / 2^8

// Tras reconectar un electrodo la salida tarda en volver del riel; durante este
// tiempo se emite E:0 para que la web no lea el transitorio como contraccion.
const unsigned long ASENTAMIENTO_MS = 500;

// true emite ademas cada muestra centrada ("S:<n>") a 1kHz, para mirar la forma
// de onda en el Serial Plotter mientras se ubican los electrodos. La web lo
// ignora, pero es mucho caudal: dejar en false para uso normal.
const bool MODO_CRUDO = false;

long baseQ8 = 512L << DESPLAZAMIENTO_BASE;
long sumaVentana = 0;                    // suma de |muestra - base| en la ventana
int muestrasEnVentana = 0;

bool electrodosSueltos = false;
unsigned long finAsentamiento = 0;
unsigned long ultimaMuestraUs = 0;

unsigned long lastStatusPrint = 0;
const unsigned long statusInterval = 3000;   // linea legible de estado cada 3 segundos
int ultimaAmplitud = 0;

void setup() {
  Serial.begin(9600);
  pinMode(loMasPin, INPUT);
  pinMode(loMenosPin, INPUT);

  // Mismo criterio que con los piezos del dispositivo2: el reposo se mide, no se
  // asume. Si los electrodos estan sueltos al arrancar, la media cae en un riel,
  // pero se corrige sola al reconectar (ver actualizarElectrodos()).
  sembrarBase();
  ultimaMuestraUs = micros();
}

void sembrarBase() {
  long suma = 0;
  for (int n = 0; n < 64; n++) {
    suma += analogRead(emgPin);
  }
  baseQ8 = (suma / 64) << DESPLAZAMIENTO_BASE;
}

// Linea que consume el lector de Web Serial ("E:<amplitud>"). La amplitud es la
// media del valor absoluto de la senal centrada (MAV) en la ventana, en cuentas
// del ADC: 0 en reposo, crece con la contraccion, techo teorico ~512. Va cruda:
// la normalizacion a 0-1 para window.feedEMG() vive del lado del navegador,
// donde se puede recalibrar el rango segun la persona y la ubicacion.
// Se rectifica y promedia aca y no en la web porque mandar muestras sueltas a
// 50Hz seria submuestrear la senal (aliasing); la MAV es el resumen correcto.
void printAmplitud(int amplitud) {
  Serial.print("E:");
  Serial.println(amplitud);
}

// Linea de estado de electrodos ("L:<0|1>"), 1 = alguno suelto. Se emite solo
// cuando cambia, y de nuevo en cada linea de estado legible por si la pagina se
// conecto despues del cambio.
void printElectrodos() {
  Serial.print("L:");
  Serial.println(electrodosSueltos ? 1 : 0);
}

void printEstadoLegible() {
  Serial.print("EMG base = ");
  Serial.print(baseQ8 >> DESPLAZAMIENTO_BASE);
  Serial.print(" - amplitud = ");
  Serial.print(ultimaAmplitud);
  if (electrodosSueltos) {
    Serial.println(" - electrodos sueltos");
  } else if (ultimaAmplitud < 5) {
    Serial.println(" - reposo");
  } else {
    Serial.println(" - actividad");
  }
}

void actualizarElectrodos(unsigned long ahora) {
  bool sueltos = digitalRead(loMasPin) == HIGH || digitalRead(loMenosPin) == HIGH;
  if (sueltos == electrodosSueltos) return;

  electrodosSueltos = sueltos;
  if (!sueltos) {
    // Al volver el contacto la base vieja quedo pegada al riel; con alfa = 1/256
    // tardaria ~1s en recuperarse, asi que se re-siembra con la lectura actual.
    baseQ8 = (long)analogRead(emgPin) << DESPLAZAMIENTO_BASE;
    finAsentamiento = ahora + ASENTAMIENTO_MS;
  }
  sumaVentana = 0;
  muestrasEnVentana = 0;
  printElectrodos();
}

void muestrear(unsigned long ahora) {
  int x = analogRead(emgPin);

  // Pasaaltos: la base sigue a la senal con constante de tiempo ~256ms.
  baseQ8 += (((long)x << DESPLAZAMIENTO_BASE) - baseQ8) >> DESPLAZAMIENTO_BASE;
  int centrada = x - (int)(baseQ8 >> DESPLAZAMIENTO_BASE);

  if (MODO_CRUDO) {
    Serial.print("S:");
    Serial.println(centrada);
  }

  sumaVentana += (centrada < 0) ? -centrada : centrada;
  muestrasEnVentana++;

  if (muestrasEnVentana >= MUESTRAS_VENTANA) {
    bool valida = !electrodosSueltos && ahora >= finAsentamiento;
    ultimaAmplitud = valida ? (int)(sumaVentana / muestrasEnVentana) : 0;
    printAmplitud(ultimaAmplitud);
    sumaVentana = 0;
    muestrasEnVentana = 0;
  }
}

void loop() {
  unsigned long ahora = millis();

  actualizarElectrodos(ahora);

  // Muestreo a ritmo fijo sin delay(): se ponen al dia las muestras vencidas.
  // Si el loop se atraso mucho (por ejemplo, el host dejo de leer el puerto y
  // Serial bloqueo), se descarta el atraso en vez de muestrear en rafaga.
  unsigned long ahoraUs = micros();
  if (ahoraUs - ultimaMuestraUs >= 50 * PERIODO_US) {
    ultimaMuestraUs = ahoraUs - PERIODO_US;
  }
  // El tope de iteraciones evita quedar atrapado aca si una muestra llegara a
  // costar mas de 1ms (por ejemplo con MODO_CRUDO y el puerto lento).
  int pendientes = 0;
  while (micros() - ultimaMuestraUs >= PERIODO_US && pendientes++ < 50) {
    ultimaMuestraUs += PERIODO_US;
    muestrear(ahora);
  }

  if (ahora - lastStatusPrint >= statusInterval) {
    lastStatusPrint = ahora;
    printElectrodos();
    printEstadoLegible();
  }
}
