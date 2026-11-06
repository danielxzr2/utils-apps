#!/usr/bin/env bash
# Arranca Bitácora y abre el navegador.
cd "$(dirname "$0")" || exit 1
exec node server.js --open
