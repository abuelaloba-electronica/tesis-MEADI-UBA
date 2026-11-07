#!/usr/bin/env bash
# ---------------------------------------------------------------
# Ruteo de audio para grabar Helm desde la página del guante
# (ver prototipos/propuesta_sonido_composicion.md, punto 1).
#
# Crea en PipeWire:
#   maedi_helm      sink virtual (MAEDI-Helm): lo que entra acá se graba
#   maedi_helm_rec  fuente (MAEDI-Helm-grabacion) hecha del monitor de ese
#                   sink: es la única que la página acepta para grabar
# y enlaza la salida de Helm a ese sink ADEMÁS de a los parlantes: lo que
# oye la persona no pasa por ningún intermediario, así que no suma
# latencia a los golpes.
#
# La entrada por defecto del sistema no se toca: la página busca la fuente
# de Helm por su nombre, no pide "el micrófono" (ver
# tools/diagnostico_audio.html y la propuesta).
#
# Helm 0.9.0 en esta máquina sale por ALSA, y PipeWire lo muestra como el
# flujo `alsa_playback.helm`. Los enlaces se pierden al cerrar Helm, así que
# el script se corre con Helm ya abierto, una vez por sesión. Se puede
# correr de nuevo sin problema: lo que ya existe no se duplica.
#
#   tools/audio_helm.sh            arma el ruteo
#   tools/audio_helm.sh --estado   muestra qué está armado
#   tools/audio_helm.sh --quitar   lo desarma (los parlantes siguen igual)
#
# Verificación, sin navegador (tocar Helm mientras graba, Ctrl+C para
# terminar): sólo tiene que oírse Helm, nunca la sala.
#   pw-record --target maedi_helm_rec prueba.wav
# ---------------------------------------------------------------
set -euo pipefail

SINK=maedi_helm
FUENTE=maedi_helm_rec
HELM=alsa_playback.helm

existe_sink()   { pactl list short sinks   | awk '{print $2}' | grep -qx "$SINK"; }
existe_fuente() { pactl list short sources | awk '{print $2}' | grep -qx "$FUENTE"; }
helm_abierto()  { pw-link -o | grep -qx "$HELM:output_FL"; }

# Los enlaces que salen de un puerto de Helm, uno por línea.
enlaces_de() { pw-link -l | awk -v p="$1" '$0 == p {on=1; next} /^[^ |]/ {on=0} on && /\|->/ {print $2}'; }

estado() {
  echo "sink $SINK:          $(existe_sink && echo sí || echo no)"
  echo "fuente $FUENTE:  $(existe_fuente && echo sí || echo no)"
  if helm_abierto; then
    for c in FL FR; do
      echo "Helm $c -> $(enlaces_de "$HELM:output_$c" | paste -sd ' ' -)"
    done
  else
    echo "Helm: no está abierto"
  fi
}

quitar() {
  # Al descargar el sink, PipeWire borra también sus enlaces.
  pactl list short modules | awk -v s="$SINK" -v f="$FUENTE" \
    '$0 ~ "source_name="f || $0 ~ "sink_name="s {print $1}' |
    sort -rn | while read -r id; do pactl unload-module "$id"; done
  echo "Ruteo quitado."
}

armar() {
  if ! helm_abierto; then
    echo "No encuentro la salida de Helm ($HELM). Abrir Helm y volver a correr." >&2
    exit 1
  fi

  # Un sink y una fuente nuevos pueden quedar como salida o entrada por
  # defecto del sistema y dejar todo lo demás sonando en el vacío (o
  # grabando a Helm en una videollamada): se anotan antes y se restauran.
  local sink_def fuente_def
  sink_def=$(pactl get-default-sink)
  fuente_def=$(pactl get-default-source)

  if ! existe_sink; then
    pactl load-module module-null-sink sink_name="$SINK" \
      channel_map=front-left,front-right \
      sink_properties=device.description=MAEDI-Helm >/dev/null
  fi
  if ! existe_fuente; then
    pactl load-module module-remap-source master="$SINK.monitor" \
      source_name="$FUENTE" channel_map=front-left,front-right \
      source_properties=device.description=MAEDI-Helm-grabacion >/dev/null
  fi

  pactl set-default-sink "$sink_def"
  pactl set-default-source "$fuente_def"

  # El sink tarda un instante en publicar sus puertos.
  for _ in $(seq 20); do
    pw-link -i | grep -qx "$SINK:playback_FL" && break
    sleep 0.1
  done

  for c in FL FR; do
    if ! enlaces_de "$HELM:output_$c" | grep -qx "$SINK:playback_$c"; then
      pw-link "$HELM:output_$c" "$SINK:playback_$c"
    fi
  done

  estado
}

case "${1:-}" in
  --estado) estado ;;
  --quitar) quitar ;;
  "")       armar ;;
  *)        echo "Uso: $0 [--estado|--quitar]" >&2; exit 2 ;;
esac
