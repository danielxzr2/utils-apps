#!/usr/bin/env bash
# Arranca Alcancía y abre el navegador.
cd "$(dirname "$0")" || exit 1
exec node server.js --open
