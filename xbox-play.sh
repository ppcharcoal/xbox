#!/bin/sh
# Launcher for Xbox Play. Extra Chromium/Electron flags can go in
# ~/.config/xbox-play-flags.conf (one per line, lines starting with # are ignored).

flags_file="${XDG_CONFIG_HOME:-$HOME/.config}/xbox-play-flags.conf"
extra_flags=""
if [ -r "$flags_file" ]; then
    extra_flags="$(grep -v '^[[:space:]]*#' "$flags_file" | tr '\n' ' ')"
fi

# shellcheck disable=SC2086
exec electron /usr/lib/xbox-play \
    --ozone-platform-hint=auto \
    --enable-wayland-ime \
    $extra_flags "$@"
