#!/bin/zsh
# Startet die feste Testversion von LAST SIGNALS (unabhängig von laufenden Umbauten) und öffnet den Browser.
cd "$(dirname "$0")/Code"
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
(sleep 2 && open "http://localhost:4173") &
npx vite preview --outDir ../Testversion --port 4173
