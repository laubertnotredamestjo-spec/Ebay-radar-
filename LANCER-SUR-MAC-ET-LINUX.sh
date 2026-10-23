#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ doit etre installe depuis https://nodejs.org/"
  exit 1
fi
echo "Ouvre http://localhost:3000 dans ton navigateur."
exec node server.js
