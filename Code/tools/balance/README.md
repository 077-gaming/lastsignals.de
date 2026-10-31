# Fortschritts-Bot (Wirtschafts-Balance)

`fortschritt.mjs` spielt die echte Simulation (`src/sim/world.js`) ohne Grafik wie ein zielstrebiger Spieler und misst,
nach wie viel **Spielzeit** welche Stufe, wie viele Drohnen und welches Schiff erreicht sind, woher die Credits kommen und
wofür sie ausgegeben werden.

```
npm run balance                                   # 12 Stunden, Seed 1, Saturn, kreisend
node tools/balance/fortschritt.mjs --stunden 14 --seed 7 --fraktion europa
node tools/balance/fortschritt.mjs --stunden 18 --seed 7 --kreisen 0   # Spieler, der im Kampf stehen bleibt
DBG=60 node tools/balance/fortschritt.mjs ...      # alle 60 s eine Zeile Zustand auf stderr
```

Ausgabe: stündlicher Fortschritt auf stderr, am Ende JSON auf stdout (`verlauf` je Stufe mit Einnahmequellen,
`kaeufe` mit Zeitpunkt und Stufe, `auftragsZeiten`, Zeitanteile Kampf/Heilen/Einkaufen).

**Was der Bot tut:** folgt der Auftragskette, wählt Sektor nach Auftrag und Stufe, fliegt über die Tore, kauft wie ein
vernünftiger Spieler (Auftragsziel, REP, Schiff 2 ab Stufe 5, Drohnen, Ion/Plasma), repariert Drohnen erst bei Warnung,
liest angekündigte Spezialangriffe und weicht aus, heilt unter 35 % Hülle (Station, Reparaturroboter, Heimflug),
meidet Alpha-Gegner und verlorene Kämpfe. `--kreisen 1` (Standard) umkreist das Ziel wie ein geübter Spieler.

**Einordnung:** Der kreisende Bot spielt wie ein sehr guter Spieler ohne Pausen und Menüs, der stehende wie ein
ungeübter. Menschen liegen dazwischen und brauchen zusätzlich Zeit für Menüs, Lesen und Erkunden.

Messung Wirtschaft v2 (31.10.2026), Ziel „Stufe 10 nach 10–12 h mit 8 Pioneer und Schiff 2“:

| Bot | Stufe 5 | Schiff 2 | Stufe 8 | 8. Drohne | Stufe 10 | Credits bei Stufe 10 |
|---|---|---|---|---|---|---|
| kreisend, Seed 3 | 0,8 h | 1,6 h (St. 6) | 2,9 h | 5,1 h (St. 9) | 6,9 h | 112.000 |
| kreisend, Seed 7 | 0,6 h | 1,9 h (St. 6) | 3,2 h | 5,9 h (St. 9) | 6,9 h | 104.000 |
| kreisend, Seed 11 | 0,8 h | 1,7 h (St. 6) | 3,5 h | 6,2 h (St. 9) | 7,0 h | 125.000 |
| stehend, Seed 7 | 0,8 h | 4,0 h (St. 6) | 5,7 h | 9,2 h (St. 9) | 11,2 h | 105.000 |
| stehend, Seed 11 | 0,7 h | 1,9 h (St. 6) | 4,1 h | 6,9 h (St. 9) | 7,8 h | 107.000 |

(Stehend-Läufe nach der Korrektur des Bots: Er verließ einen Sektor, obwohl das Auftragsziel dort lebte, und hing so
in einem früheren Lauf 6 Stunden bei „25 Larva“. Ein Spieler würde dort bleiben – der Bot jetzt auch.)
