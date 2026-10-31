#!/bin/zsh
# Startet das Weltraumspiel lokal und öffnet den Browser.
cd "$(dirname "$0")"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
if [ ! -d node_modules ]; then npm install; fi
(sleep 2 && open "http://localhost:5173") &
npm run dev
