# LAST SIGNALS · Entwurf Flugmodell „volles 3D“

Stand 03.11.2026, Zweig `claude/flug` (Arbeitsbaum `wt-flug`). Entwurf, noch nicht umgesetzt, kein Code geändert.

Auftrag Toni: „Bisher macht das Spiel mit der Steuerung keinen Spaß – nur im DarkOrbit-typischen Modus, der soll aber am
Ende nur Nebensache sein.“ Verfolger- und Cockpitsicht werden der **Hauptmodus mit echtem 3D-Flug**. Maßstab für die
Grundbausteine ist der heutige Stand großer Weltraum-Simulationen (Systeme und Qualitätsanspruch, keine fremden Namen,
Grafiken oder Logos). Der taktische Draufsicht-Modus bleibt als Nebenmodus und darf nicht kaputtgehen. Der folgende
Meilenstein „Planetenlandung“ muss auf diesem Flugmodell aufsetzen können.

Grundlage: gelesener Code (`Code/src/sim/world.js`, `ai.js`, `combat.js`, `spatial.js`, `config.js`, `input.js`,
`input/padflight.js`, `render/camrig.js`, `render/cockpit.js`, `render/renderer.js`, `render/sky.js`,
`net/mp.js`, `net/mp-core.js`, `net/coop.js`, `core/data.js`, `sim/selftest.mjs`, `tools/playtest/*.mjs`) und die
Planungsdateien `ARCHITEKTUR-SANDBOX.md`, `FLUGGEFUEHL.md`, `CONTROLLER.md`, `ENGINE.md`, `UI_STIL.md`,
`KAMPF_UND_GEGNER.md`, `MOBIL.md`, `SCHIFFSQUALITAET.md`. Eine `Code/ENGINE.md` gibt es nicht; die Engine-Schicht steht
in `Planung/ENGINE.md`.

---

## 0. Kurzfassung

- **Ein 3D-Kern für alles.** Spieler, Gegner, Geschosse und Raketen bekommen `y`, eine Ausrichtung als Quaternion und
  eine Drehrate. Die Ebene `y = 0` bleibt Bezugsebene („Sektorebene“) für Station, Tore, Karte und Taktikmodus.
- **Flugrechner wie bei modernen Simulationen:** gekoppelt (der Rechner hält die gewünschte Geschwindigkeit und
  dämpft Seitendrift mit den Steuerdüsen) und entkoppelt (Schwung bleibt, Düsen wirken direkt). Schub auf allen sechs
  Achsen, Nicken/Gieren/Rollen, seitlich und vertikal schieben, Boost mit Vorrat, Raumbremse, Tempomat,
  Geschwindigkeitsbegrenzer (Mausrad), Reiseflug NAV und Kampfflug SCM, Landemodus mit Fahrwerk.
- **Maus-Zielen als Standard:** Das Fadenkreuz folgt der Maus sofort (Zeigersperre), das Schiff dreht mit Trägheit
  hinterher. Waffen konvergieren auf die Entfernung unter dem Fadenkreuz, eine Vorhalteanzeige (PIP) zeigt je Ziel, wo
  man hinzielen muss. Wer lieber den „virtuellen Stick“ (Zeigerausschlag = Drehrate) nutzt, stellt ihn um.
- **Controller (Xbox/PlayStation)** nach demselben Prinzip: rechter Stick zielt, linker Stick schiebt, Schultertasten
  rollen, sanfte Zielhilfe (Bremsen und Mitziehen nahe am Ziel, Kardan-Hilfe zum PIP), in PvP gedeckelt.
- **Touch** abgestuft: Handy startet taktisch, „Einfacher 3D-Flug“ wählbar (Lenkstick, Schubregler, Autofeuer);
  Tablet zusätzlich Feuerknopf und optional Kreisel-Zielen.
- **Gegner fliegen echte 3D-Manöver** (Zange aus mehreren Höhen, Durchflug und Wende, Hinterhalt aus dem toten
  Winkel, Abstand halten mit Höhe), behalten aber Regie, Persönlichkeit und angekündigte Spezialangriffe.
- **Taktikmodus** nutzt dieselbe 3D-Welt: Ebenenflug mit Höhenhaltung, Klick-Fliegen, Aufschaltung mit Autofeuer und
  Trefferchance wie heute, Höhen werden gestaucht und mit Höhenstielen gezeichnet; Gegner bleiben gegen einen Piloten im
  Taktikmodus in einem flachen Höhenband. Damit bleibt der Nebenmodus spielbar und in der Balance unverändert.
- **Umsetzung in 11 Etappen** hinter einem Schalter (`ls.flight.model`), jede Etappe mit headless prüfbaren
  Abnahmekriterien. Aufwand etwa **10–13 Wochen Vollzeit mit KI-Unterstützung** (nebenbei × 2,5).
- **Widerspruch zur Architektur:** `ARCHITEKTUR-SANDBOX.md` 2.1 hatte entschieden, dass der Shooter dauerhaft 2D bleibt
  und 3D erst im Universum kommt. Tonis neuer Auftrag kehrt das um. Dieser Entwurf löst es so: Der Flugkern
  (`sim/flight/`) wird **der** 6DOF-Kern, den später `src/world/sim3d.js` für Planeten übernimmt (siehe 3.2).

---

## 1. Ist-Stand und warum es keinen Spaß macht

Gemessen am Code, nicht am Gefühl:

| Stelle | Befund | Folge im Spiel |
|---|---|---|
| `input.js chaseUpdate` | Verfolger-Steuerung setzt alle 50 ms einen Zielpunkt 900 m voraus (`moveTo`) in Richtung des Mauszeigers über `renderer.steerHeading`. Es gibt nur einen Kurswinkel. | Lenken fühlt sich an wie „Zielpunkt auf einer Karte klicken“, nicht wie Fliegen. Kein Nicken, kein Rollen, kein Seitwärtsschieben. |
| `world._movePlayer` | Ein Tempo (`p.fs`), ein Kurs (`p.course`), Nase `p.rot`; Drehrate 2,6 → 1,5 rad/s je nach Tempo, Driftgriff 3,5/s. `bank`/`pitch` sind reine Anzeige (`_flightFeel`). | Schräglage ist Kosmetik, die Physik bleibt eine Ebene. |
| `world._updateLasers`, `hitChance` | Laser feuern nur im Angriffszustand (Strg) auf das aufgeschaltete Ziel, Treffer würfelt `hitChance` (85 % Grund, Abzüge für Entfernung und Querbewegung). Die Nase dreht im Angriff selbst zum Ziel (`AIM_TURN`). | Zielen spielt keine Rolle. Im Verfolger hat man nichts zu tun außer Kreisen. |
| `ai.js moveEnemy` | Geschwindigkeitslenkung in x/z (radial, tangential, Abstoßung, Brocken), Drehung um y. | Gegner kreisen flach um den Spieler. |
| `render/camrig.js chasePose` | Kamera dreht nur um y (`yaw`), Neigung ist fest je Klasse, im Kampf schwenkt sie zwischen Schiff und Ziel. | Gut für die Ebene, aber kein Bezug zu Nase oder Fadenkreuz. |
| `input/padflight.js` | Linker Stick = „Mausposition auf der Bildbreite“, RT = Zielpunkt-Abstand (`throttleDist`). | Controller erbt dieselbe Ebenen-Logik. |
| `net/mp-core.js packState` | `[x, z, rot, crs, spd, hull, shield, flags, tgt]`, 9 Hz, `Interp` linear mit 130 ms Verzögerung. | Für 3D fehlen `y`, Ausrichtung und Geschwindigkeitsvektor. |
| `render/sky.js` | Für die Verfolger-Kamera gibt es schon ein Rundumbild (Equirect, schrittweise gebacken). | Der Himmel trägt freie Blickrichtungen; an den Polen braucht es Pflege (Risiko 17). |
| `render/environment.js`, `fields.js`, `layers.js` | Kulissen liegen als Schichten nahe der Ebene, Station bei `y = −44`. | Von schräg unten oder oben sieht die Welt flach aus; Felder brauchen Tiefe nach oben und unten. |

Was trägt: feste Schrittweite 1/60 s, deterministischer Zufall (`rng.js`), keine Speicher-Neuanlage je Schritt,
Ereignisbus, `window.__ls`-Testzugang, Kamera-Federung und Stöße (`camrig.js`), Cockpit-Ebene mit eigener Kamera
(0,05–40 m), Controller-Schicht mit genau einem Besitzer je Bild, Prüfwerkzeuge mit Attrappen.

---

## 2. Referenz: Flugsteuerung moderner Weltraum-Simulationen (Recherche 03.11.2026)

Kurz recherchiert (Quellen am Ende). Übernommen werden **Systeme**, keine Namen. Wo die Quellen älter sind, steht es dabei.

| System | Stand der Referenz | Übernahme in LAST SIGNALS |
|---|---|---|
| Flugrechner (IFCS-artig) | Rechner übersetzt Eingaben in Düsenbefehle; Betriebsarten wechseln zwischen mehr Rechner- und mehr Handsteuerung. | `sim/flight/ifcs.js`, gleicher Kern für Spieler und (vereinfacht) Gegner. |
| Gekoppelt / entkoppelt | Gekoppelt: Rechner dämpft Drift, fliegt sich „wie ein Flugzeug im All“. Entkoppelt: Newton, Schwung bleibt. Umschalten Alt+C. Auch entkoppelt bremst der Rechner über der Kampfgrenze weich ab. | genau so, Alt+C, weiche Grenze auch entkoppelt. |
| Betriebsarten NAV / SCM | NAV: hohe Reisegeschwindigkeit, Waffen und Schilde aus; SCM: Kampfflug, Waffen an, begrenzte Geschwindigkeit (Jäger etwa 250–350 m/s, große Frachter 75–125 m/s), Umschalten mit Hochlaufzeit. Ende 2024 angekündigte Überarbeitung zu einem Kampf- und einem Reise-Modus mit weniger Einschränkungen; ob das inzwischen live ist, war aus den Quellen nicht sicher zu klären. | SCM (Kampf, Standard) und NAV (Reiseflug, Waffen aus, Schildaufladung ruht, 1,5 s Hochlauf). Bewusst die sanftere Variante: Schilde bleiben im NAV stehen, laden aber nicht nach. |
| Geschwindigkeitsbegrenzer | Mausrad stellt die Grenze, W/S schieben vor/zurück bis zur Grenze. | Mausrad, Stufen 5 % der SCM-Grenze, Marke auf dem Tempoband. |
| Tempomat | eigene Taste (C), hält den Schub. | C. |
| Boost | gehalten (Umschalt links), mehr Manövrierschub, Flugbahn näher an die Nase; ein zusätzlicher Nachbrenner schiebt über die SCM-Grenze, solange der Vorrat reicht, vorwärts stärker. | Ein Boost (Umschalt halten) mit Vorrat: +60 % Linearschub, +25 % Drehrate, Vorwärtsgrenze +40 %. Kein getrennter Nachbrenner, kein G-Schutz-Modell (kein Pilotenkörper). |
| Raumbremse | eigene Taste (X). | X, nutzt Boost-Vorrat, wenn vorhanden. |
| Zielen | Kardanwaffen folgen dem Mauszeiger („Gimbal Lock“/relativ), fest eingebaute Waffen mit Hilfe; Vorhalteanzeige als PIP je Waffe statt Vorhaltelinien am Ziel; PIP läuft dem Waffenkreuz nach. Option „PIP aufs Ziel einrasten“ (Hilfe für feste Waffen). | Maus-Zielen mit Fadenkreuz, Waffenkreuz und PIP je Ziel, Kardan-Hilfe bis 1,5° (Maus) bzw. 4° (Controller). |
| Stick-Präzision (ESP-artig) | Eingaben werden nahe am Ziel gedämpft, um Überschießen zu vermeiden; auch per Halte-Taste. | Zielhilfe „Bremsen“ für Controller, abschaltbar, in PvP gedeckelt. |
| Landemodus | eigene Taste (N): begrenzt Tempo und Drehrate stark, Fahrwerk, Senkrechtschub, automatisches Landen auf Halten. | N: Landemodus mit Fahrwerk und Schwebe-Ausgleich; Auto-Landen erst im Meilenstein „Planetenlandung“. |
| Freies Umsehen | Taste halten, Schiff hält Kurs. | Z halten oder mittlere Maustaste. |

**Nicht übernommen:** G-Kräfte am Piloten mit Bewusstlosigkeit, getrennter Nachbrenner-Tank, Treibstoff,
Quantensprung (kommt im Universum), Energieverteilung auf Systeme (passt nicht zu Generatoren/Lasern aus `data.js`),
Kardan-Modi in drei Stufen (wir haben eine Hilfe-Stufe statt fest/auto/manuell).

---

## 3. Grundsatz

### 3.1 Ein 3D-Kern, drei Ansichten, zwei Bedienarten

- **Simulation:** immer 3D. Es gibt keine zweite 2D-Physik mehr, sobald die Umstellung fertig ist (Übergangsschalter
  siehe 15).
- **Ansichten:** Verfolger, Cockpit, Taktisch (Taste V wie heute).
- **Bedienarten:** *Flug* (Verfolger und Cockpit, Hauptmodus) mit direkter 6DOF-Steuerung und Handzielen; *Taktisch*
  (Draufsicht, Nebenmodus) mit Ebenenflug-Autopilot, Klick-Fliegen und Aufschaltung wie heute.
- **Befehle statt Direktzugriff:** Alle Eingabewege schreiben einen `FlightCmd` (Achsen, Modi) oder einen
  `world.command()`-Befehl. Das passt zu `ARCHITEKTUR-SANDBOX.md` 6.2 Schritt 3 und macht den Kern servertauglich.

### 3.2 Verhältnis zur Architektur (Revision von ARCHITEKTUR-SANDBOX 2.1)

- **Alt:** Shooter bleibt dauerhaft 2D, `src/world/sim3d.js` mit Rapier entsteht erst in Phase D.
- **Neu (Vorschlag):** Der Shooter wird 3D. Der Flugkern liegt in `Code/src/sim/flight/` als reine Logik ohne three.js
  und ohne DOM, läuft unter Node wie der restliche Kern. `sim3d.js` im Universum übernimmt ihn später unverändert und
  ergänzt nur Schwerkraft, Atmosphäre, Gelände und Rahmenwechsel über die Umgebungsschnittstelle (12.2). Rapier wird für
  Schiffe nicht gebraucht (Kugel- und Kapselprüfungen reichen); Rapier bleibt für Figuren und Innenräume (Phase D3).
- **Unverändert gültig:** Server in Node mit demselben Kern, Pose mit `frame`, kameranahes Zeichnen, Zonen, Netz mit
  `y` und Quaternion ab dem ersten Byte (2.5 dort fordert das schon). Was dort für „Universum“ steht, gilt ab jetzt auch
  für die Shooter-Sektoren.
- **Latenz:** Der alte Grund für 2D war, dass Klickflug 100–150 ms Latenz verträgt. Handzielen verträgt sie nicht so
  gut; deshalb rechnet der eigene Client sein Schiff und seine Treffer selbst (wie heute im Mehrspieler), der spätere
  Server braucht Lag-Kompensation (in 3.4 dort schon für Phase F vorgesehen, wird für PvP vorgezogen).

Die Entscheidung trifft Toni (Abschnitt 18, Frage 1). `ARCHITEKTUR-SANDBOX.md` wird erst nach seiner Freigabe angepasst.

---

## 4. Simulationsmodell

### 4.1 Koordinaten und Sektorraum

- Rechtshändig wie three.js: x rechts, **y oben**, z zum Betrachter. Körperachsen: rechts = +x, oben = +y,
  **vorn = −z** (passt zu `headingOf(dx, dz) = atan2(−dx, −dz)` und `fx = −sin(rot), fz = −cos(rot)` im heutigen Code).
- Sektor = Quader: x, z ∈ [−size, size] wie heute, **y ∈ [−H, H] mit H = 0,3 · size** (Sektor 1: 6.000 m → H = 1.800 m,
  Sektor 3: 8.000 m → H = 2.400 m). Außerhalb gilt der bestehende Schaden „außerhalb der Karte“.
- Station, Tore, sichere Zone und Werftbaken liegen auf `y = 0`. Die sichere Zone wird eine Kugel mit `SAFE_RADIUS`
  400 m plus ein flacher Zylinder bis ±250 m (damit man nicht „von oben“ in die Zone fällt, ohne es zu merken). Tore
  haben eine Sprungkugel mit `PORTAL_RADIUS` 150 m.
- Asteroiden-, Trümmer- und Nebelfelder bekommen eine Höhenverteilung: Brocken y ∈ ±(0,35 · Feldradius), höchstens
  ±600 m. Erz und Kisten y ∈ ±150 m um die Feldebene (im Taktikmodus noch erreichbar, siehe 10).
- Gegner-Rudel erscheinen mit gemeinsamer Rudelhöhe y ∈ ±600 m, Einzelgänger ±900 m.
- **Genauigkeit:** Positionen sind JS-`number` (64 Bit). Sektoren mit 8 km sind unkritisch. Für Planeten gilt
  kameranahes Zeichnen (12.4).

### 4.2 Zustand je Körper

Die Entitäten behalten ihre flachen Felder (`x`, `z`, `vx`, `vz`, `rot`), damit HUD, Karte, Ereignisse und
Taktikmodus weiterlaufen. Neu:

```js
// makeEntity ergänzt (alles Zahlen, keine Objekte je Schritt):
y: 0, vy: 0,                 // Höhe und Steiggeschwindigkeit
qx: 0, qy: 0, qz: 0, qw: 1,  // Ausrichtung Körper → Welt (normiert)
wx: 0, wy: 0, wz: 0,         // Drehrate im Körpersystem (rad/s): x = Nicken, y = Gieren, z = Rollen
py: 0, pqx: 0, pqy: 0, pqz: 0, pqw: 1,   // Stand vor dem Schritt (weiche Darstellung, wie px/pz/prot)
// abgeleitet nach jedem Schritt (für Altcode, HUD, Taktik):
rot,                         // Kurs = Gierwinkel der auf die Ebene projizierten Nase (wie heute)
pitchW, bankW,               // Nick- und Rollwinkel gegen die Sektorebene (Anzeige, Horizont)
speed,                       // |v| in 3D
// nur Spieler (und später jeder Pilot):
fl: FlightState              // siehe unten
```

```js
FlightState = {
  cls: 's1',                 // Parametersatz (4.7)
  mode: 'scm' | 'nav' | 'land',
  coupled: true,             // gekoppelt / entkoppelt
  limiter: 1,                // Geschwindigkeitsbegrenzer 0,05..1 (Anteil der Modusgrenze)
  cruise: false, cruiseV: 0, // Tempomat
  boost: 1, boostLock: 0,    // Vorrat 0..1, Sperrzeit nach Leerlauf (s)
  navSpool: 0,               // 0..1 Hochlauf NAV
  gear: false, gearK: 0,     // Fahrwerk (Ziel und Stellung 0..1)
  thrust: [0,0,0],           // tatsächliche Körperbeschleunigung / Höchstwert (−1..1) je Achse: Düsen-Grafik und Ton
  contact: 0,                // Fahrwerkskontakte (Landung)
}
FlightCmd = {                // Eingabe, je Schritt gelesen; Werte −1..1
  sx, sy, sz,                // seitlich, vertikal, vor (+) / zurück (−)
  pitch, yaw, roll,          // gewünschte Drehrate als Anteil der Höchstrate
  aim: null | {x,y,z},       // Maus-Zielen: gewünschte Nasenrichtung (Welt, normiert); ersetzt pitch/yaw
  rollHold: false,           // Q/E gerade gedrückt: Auto-Rollen pausiert
  boost, brake,              // gehalten
}
```

Gegner bekommen `y`, Quaternion und Drehrate, aber kein volles `FlightState` (vereinfachter Lenker, 8.2).
Geschosse (`Bolt`) und Raketen liegen in festen Ringpuffern mit typisierten Feldern (7.3).

### 4.3 Flugrechner (IFCS-artig)

Je Schritt (`dt = 1/60`), alles im Körpersystem, ohne Speicher-Neuanlage:

```
vb = q⁻¹ · v                                  // Geschwindigkeit im Körpersystem
Vcap = Modusgrenze (SCM: ship.speed, NAV: NAV_K · ship.speed · navSpool-Kurve, LAND: V_LAND) · limiter
       × (1 + BOOST_V · boostAktiv · nur vorwärts)

GEKOPPELT:
  vSoll = ( sx · V_LAT,  sy · V_VERT,  −vorSoll )
     vorSoll = Tempomat ? cruiseV : sz · Vcap    (sz < 0: rückwärts, höchstens V_BACK)
  e = vSoll − vb
  ab_i = clamp(K_V · e_i, −A_neg_i, +A_pos_i)   // je Achse und Richtung eigene Düsenstärke
  Raumbremse: vSoll = 0, K_V = 5, A × 1,5

ENTKOPPELT:
  ab_i = (u_i ≥ 0 ? A_pos_i : A_neg_i) · u_i     // u = (sx, sy, −sz)
  Raumbremse wie gekoppelt

Boost aktiv (gehalten, Vorrat > 0, nicht NAV): A × BOOST_A, Drehrate × BOOST_W, Vorrat −= BOOST_USE · dt
Vorrat lädt nach BOOST_DELAY s ohne Boost mit BOOST_REGEN je s; leer → 1 s gesperrt.

aW = q · ab + gUmgebung(p) − Widerstand(p, v)    // Umgebung im Shooter: 0 (12.2)
v += aW · dt

Weiche Grenze (auch entkoppelt): s = |v|; wenn s > Vcap_eff: v ← v · (1 − min(1, OVER_K · dt) · (s − Vcap_eff) / s)
   OVER_K = 1,5/s (Überschuss baut sich in ≈ 2 s ab; Stöße und Rammangriffe bleiben spürbar wie heute)
p += v · dt
```

**Drehung** (auch im Körpersystem):

```
ωSoll = (pitch · Ω_P, yaw · Ω_Y, roll · Ω_R) × (Boost ? BOOST_W : 1) × Modusfaktor (LAND 0,5, NAV 0,7)
α_i   = clamp(K_W · (ωSoll_i − ω_i), ±Α_i)       K_W = 8/s
ω    += α · dt
q     = normalize(q ⊗ exp(½ · ω · dt))           // Rechtsmultiplikation = Drehung im Körpersystem
```

**Maus-Zielen (Nasenregler):** Ist `cmd.aim` gesetzt, berechnet der Rechner `pitch` und `yaw` selbst:

```
d  = q⁻¹ · aim                       // Zielrichtung im Körpersystem
eP = atan2(d.y, −d.z)                 // Nickfehler (positiv = Ziel liegt oben)
eY = atan2(−d.x, −d.z)                // Gierfehler (positiv = Ziel liegt links)
je Achse: ωSoll = sign(e) · min(Ω, √(2 · 0,8 · Α · |e|), K_A · |e|)   // Bremsweg-Regler: kein Überschießen
   K_A = 6/s für kleine Fehler (ruhiges Nachführen beim Feinzielen)
Auto-Rollen (Standard an, abschaltbar):
   Fehler > 20°: Rollziel φ = atan2(eY, eP) so, dass die Kurve in die schnellere Nickachse fällt (Kurvenlage)
   Fehler < 8°:  Rollziel = Horizont (Körper-oben zur Sektor-Oberseite), nur wenn „Horizont halten“ an ist
   dazwischen weich überblendet; Q/E (rollHold) setzt das Auto-Rollen 0,8 s aus
```

Damit hängt das Schiff sichtbar hinter dem Fadenkreuz her (Trägheit aus Α und Ω je Klasse), legt sich in Kurven und
richtet sich in ruhigen Momenten wieder auf. Das ist das Herzstück für das Gefühl „schwer, mächtig, schnell“ aus
`FLUGGEFUEHL.md`; die bisherigen Anzeigefelder `bank`/`pitch` entfallen als eigene Rechnung, sie sind jetzt echte Lage.

**Ebenenflug (Taktikmodus, Autopilot, Andockanflug):** Ein Wegpunkt `(x, y, z)` erzeugt `aim` (Richtung zum
Wegpunkt), Vorwärtssoll nach dem bisherigen Bremsweg-Gesetz aus `_movePlayer` (`√(2 · PLAYER_BRAKE · vmax · 0,45 · d)`),
Rollziel = Horizont. So fliegen Klickflug, Autopilot `H` und Beuteanflug weiter wie bisher, nur in 3D.

### 4.4 Integrator

- Feste Schrittweite 1/60 s, höchstens 8 Schritte je Bild (unverändert, `config.js`).
- Halb-implizites Euler-Verfahren (erst `v`, dann `p`; erst `ω`, dann `q`). Bei 60 Hz und den Werten aus 4.7 stabil
  (größtes `K · dt` = 8/60 ≈ 0,13).
- Quaternion-Exponential bei kleinen Winkeln über Taylor (`|ω|dt < 1e−4`), danach Normierung je Schritt (ein `sqrt`).
- Determinismus: keine `Math.random` im Kern, Reihenfolge der Körper fest, keine Abhängigkeit von der Bildrate. Ein
  Selbsttest vergleicht zwei Läufe mit gleichem Seed bitgenau (16.1).
- Darstellung: Renderer überblendet zwischen Stand vor und nach dem Schritt (`p*`, `pq*`) mit `alpha = acc / STEP`,
  Quaternion per `slerp` (heute `px/pz/prot`). Das Fadenkreuz selbst hängt nicht an der Simulation (5.1).

### 4.5 Kollisionen

- **Form je Körper:** Gegner Kugel mit `def.radius` (wie heute). Spielerschiffe **Kapsel** entlang der Längsachse,
  Maße aus `SCHIFFSQUALITAET.md` (4.7). Heute ist `PLAYER_RADIUS` für alle Klassen 20 m, Schiff 8 ist aber 189 m lang;
  mit Handzielen muss die Trefferform zum Modell passen.
- **Brocken:** Kugeln mit `x, y, z, radius`; sanftes Abstoßen wie heute in 3D (Eindringtiefe × 0,35, Normalanteil der
  Geschwindigkeit × 0,8 abbauen). Station: Kugel plus Zylinder für den Ring.
- **Raster:** `SpatialHash` bleibt 2D über x/z (die Höhe ist klein gegen die Fläche), die Höhe wird erst in der
  Feinprüfung verglichen. Kein Umbau von `spatial.js` nötig, nur `query` mit Höhenfilter im Aufrufer.
- **Deckung:** `segRock` wird `segRock3` (Strecke gegen Kugel mit Eintrittspunkt, gleiche Vorprüfung über das Hüllquader).

### 4.6 Rückmeldung (Grafik und Ton)

- `fl.thrust[3]` und die Drehbeschleunigung treiben Steuerdüsen-Puffs je Achse (heute „kleine Gasstöße an den Seiten“
  aus `FLUGGEFUEHL.md`), Hauptdüse und Retrodüsen getrennt, Boost mit eigener Flamme und Ton.
- Entkoppelt: leises Dauer-Summen der Lageregelung fällt weg (hörbar „frei“), HUD-Kennung ENTK.
- Kamera: Stöße, Zittern, Sichtfeld-Kick bleiben (`camrig.step`), jetzt mit 3D-Richtung.

### 4.7 Parameter je Schiffsklasse

SCM-Grenze = `SHIPS[id].speed` aus `data.js` (Balance bleibt). Die Klassen unterscheiden sich über Schub und
Wendigkeit; große Schiffe sind gleich schnell, aber spürbar träger. Werte sind Startwerte für die Abstimmung.

| Klasse | L × B (m) | Trefferkapsel r / L (m) | SCM (m/s) | Vor A+ (m/s²) | Retro A− | Seite | Vertikal | Ω Nicken / Gieren / Rollen (°/s) | Α Nicken / Gieren / Rollen (°/s²) | Boost-Vorrat (s) |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | 42 × 38 | 13 / 42 | 320 | 165 | 135 | 115 | 115 | 85 / 70 / 200 | 320 / 260 / 720 | 5,0 |
| S2 | 53 × 39 | 14 / 53 | 300 | 150 | 122 | 102 | 104 | 78 / 64 / 185 | 290 / 235 / 650 | 4,8 |
| S3 | 58 × 46 | 16 / 58 | 290 | 138 | 112 | 92 | 94 | 71 / 58 / 170 | 260 / 210 / 590 | 4,6 |
| S4 | 62 × 55 | 18 / 62 | 295 | 128 | 104 | 84 | 86 | 64 / 52 / 155 | 235 / 190 / 530 | 4,4 |
| S5 | 88 × 50 | 18 / 88 | 300 | 118 | 95 | 74 | 76 | 56 / 46 / 136 | 205 / 165 / 460 | 4,2 |
| S6 | 84 × 67 | 22 / 84 | 305 | 108 | 87 | 66 | 68 | 49 / 41 / 120 | 180 / 145 / 400 | 4,0 |
| S7 | 99 × 73 | 24 / 99 | 310 | 98 | 79 | 58 | 60 | 43 / 36 / 106 | 155 / 125 / 350 | 3,8 |
| S8 | 189 × 49 | 18 / 189 | 320 | 88 | 71 | 48 | 50 | 36 / 29 / 90 | 130 / 105 / 290 | 3,5 |

Gemeinsam für alle Klassen (in `sim/flight/params.js`, später je Schiff überschreibbar):

| Wert | Größe | Bedeutung |
|---|---|---|
| `V_LAT`, `V_VERT` | 0,45 · SCM | höchste Seiten- und Vertikalgeschwindigkeit gekoppelt |
| `V_BACK` | 0,4 · SCM | höchste Rückwärtsgeschwindigkeit |
| `K_V` | 3,0 /s | Geschwindigkeitsregler gekoppelt (≈ 1 s Einschwingen, begrenzt durch A) |
| `BOOST_A`, `BOOST_W`, `BOOST_V` | 1,6 / 1,25 / 0,4 | Boost: Schub, Drehrate, Vorwärtsgrenze |
| `BOOST_USE`, `BOOST_REGEN`, `BOOST_DELAY` | 1 / Vorrat · s, 0,16 /s, 1,2 s | Verbrauch (Vorrat in s Haltezeit), Nachladen (≈ 6 s voll), Pause |
| `NAV_K`, `NAV_SPOOL` | 2,6 / 1,5 s | Reiseflug-Grenze (S1: 832 m/s), Hochlauf |
| `NAV_A` | 1,4 | Vorwärtsschub im NAV; Seite und Vertikal × 0,6 |
| `V_LAND`, `V_LAND_VERT` | 50 / 20 m/s | Landemodus |
| `OVER_K` | 1,5 /s | weicher Abbau über der Grenze |

Prüfgrößen (Selbsttest 16.1): S1 von 0 auf 95 % SCM in 1,9–2,6 s (heute ≈ 2 s, `config.js` Kommentar), S8 in
3,4–4,4 s; gekoppelt nach 90°-Wende kein Seitendriften über 5 m/s nach 2 s bei S1 bzw. 3,5 s bei S8; 180°-Wende im
Stand S1 ≈ 2,3 s, S8 ≈ 5,3 s.

**Gegner** bekommen je Typ einen kleinen Block `flight` in `ENEMIES` (`data.js` bleibt sonst unverändert):
`{ acc, turn, roll, lat }`, abgeleitet aus Tempo und Radius. Startwerte: Raider `acc` 210 m/s², `turn` 2,8 rad/s;
Larva 230 / 3,4; Jackal 230 / 2,6; Spiker 120 / 1,6; Vulture 200 / 2,4; Mercs 150 / 2,0; Bosse 60–90 / 0,8–1,2.

---

## 5. Eingabe

### 5.1 Maus und Tastatur (Flug: Verfolger und Cockpit)

**Zielarten** (Einstellung `ls.flight.mouse`):

1. **Maus-Zielen (Standard).** Zeigersperre (`requestPointerLock`, in Chrome mit `unadjustedMovement: true` für rohe
   Mausdaten, Safari ohne). Mausweg dreht eine Zielrichtung `aimDir` in der Welt um die Kamera-Achsen, Empfindlichkeit
   0,05–0,4°/Pixel, optional Y umkehren. Das Fadenkreuz zeichnet `aimDir` **im selben Bild**, ohne auf die Simulation
   zu warten; die Simulation liest `aimDir` im nächsten Schritt als `cmd.aim`. Abstand Fadenkreuz–Nase höchstens 70°;
   darüber wird `aimDir` mitgezogen (man kann nicht „hinter sich“ zielen).
2. **Virtueller Stick.** Zeigerausschlag aus der Bildmitte = Drehrate (Totzone 3 % der Bildhöhe, Kurve Exponent 1,5,
   Rand = volle Rate). Für Spieler, die das von großen Simulationen gewohnt sind, und für Trackpads.

**Freier Zeiger:** Linke Alt-Taste halten (oder Taktikmodus) gibt den Zeiger frei, um HUD-Fenster zu bedienen; Kurs
wird gehalten. Esc löst die Zeigersperre (Browserregel) und öffnet wie heute das Bordmenü; der nächste Klick auf die
Spielfläche sperrt wieder. Ohne Zeigersperre (Recht verweigert, Vorschau) fällt die Eingabe auf „virtueller Stick“ zurück.

**Belegung Flug** (physische Tasten über `e.code`, Beschriftung je Tastatur-Layout über `navigator.keyboard
.getLayoutMap()` wo vorhanden; auf QWERTZ heißt `KeyZ` „Y“ – Anzeige muss das berücksichtigen):

| Taste | Wirkung | heute |
|---|---|---|
| Maus | Zielen (Fadenkreuz), Schiff folgt | lenkt in der Ebene |
| Linke Maustaste halten | Laser feuern (Handfeuer) | Ziel wählen / fliegen |
| Rechte Maustaste halten | Raketen-Aufschaltung, Loslassen feuert (sonst R) | – |
| Mittlere Maustaste halten, Z halten | Umsehen, Schiff hält Kurs | Cockpit umsehen |
| W / S | vor / zurück (bis zum Begrenzer) | Schub an / bremsen |
| A / D | seitlich schieben | zur Seite ziehen |
| Leertaste / Strg links | hoch / runter schieben | Rakete / Angriff |
| Q / E | rollen links / rechts | – / Andocken |
| Umschalt links halten | Boost | – |
| X | Raumbremse | – |
| C | Tempomat an/aus (hält aktuelles Vorwärtstempo) | – |
| Mausrad | Geschwindigkeitsbegrenzer ± 5 % | Zoom |
| Alt + Mausrad | Kameraabstand (Verfolger) | – |
| Alt + C | gekoppelt / entkoppelt | – |
| M | Reiseflug NAV / Kampfflug SCM | – |
| N | Landemodus (Fahrwerk) | – |
| F | Kontext: Andocken in der sicheren Zone, Springen am Tor, sonst nächste Beute anfliegen (wie Controller Y) | E / J |
| F halten | Autopilot zur Station | H |
| T | Ziel unter dem Fadenkreuz aufschalten (sonst nächstes in Blickrichtung) | – |
| T halten | Zielblick: Kamera schaut zum Ziel, solange gehalten | – |
| Tab / Umschalt+Tab | nächstes / voriges Ziel | Tab |
| Strg rechts | Autofeuer an/aus (Feuerleitrechner, 7.5) | Angriff |
| R | Rakete | R |
| 1–0, Alt+1–5, Umschalt+Zahl, B, G, H, J, P, V, Esc, F3 | wie heute (Schnellleiste, Leisten, Fenster, Fernhandel, Einführung, Autopilot, Sprung, Chat, Kamera, Menü, Leistung) | gleich |

**Kollisionen mit der heutigen Belegung**, bewusst gelöst:

- *Leertaste* war Rakete, *Strg* war Angriff: im Flug werden sie Hoch/Runter wie in der Referenz. Rakete bleibt auf R
  und rechter Maustaste, Angriff wird Handfeuer (linke Maustaste) bzw. Autofeuer auf Strg rechts. Im **Taktikmodus
  bleibt die alte Belegung vollständig** (Leertaste Rakete, Strg Angriff, Klick fliegen, Mausrad Zoom).
- *E* war Andocken: wird im Flug Rollen. Andocken auf F (Kontext). E bleibt im Taktikmodus und **angedockt** (Abdocken)
  gültig. J bleibt Springen in allen Modi.
- Einführung (`hud-guide.js`), Flug-Coach (`hud-coach.js`), Tastenschilder und `pad-map.js` bekommen Texte je Modus.

### 5.2 Controller (Xbox · PlayStation)

Gleiches Prinzip wie Maus-Zielen: **rechter Stick zielt**, das Schiff folgt mit Trägheit. Die Belegung wird in
`Planung/CONTROLLER.md` als „Flug 3D“ ergänzt; der Taktikmodus behält die heutige Belegung.

| Controller | Wirkung (Flug 3D) | Hinweis |
|---|---|---|
| Rechter Stick | Zielen: Drehrate der Zielrichtung (Kurve Exponent 1,6 wie heute, Höchstrate je Empfindlichkeit 90–200°/s), Schiff folgt | heute Kamera |
| Linker Stick | ▴▾ vor/zurück (stufenlos bis zum Begrenzer), ◂▸ seitlich | heute lenken |
| L3 halten + linker Stick ▴▾ | hoch / runter statt vor / zurück | |
| L3 zweimal tippen | gekoppelt / entkoppelt | Rumpeln als Bestätigung |
| LB / RB · L1 / R1 | rollen links / rechts | heute Zielwahl |
| RT · R2 | Laser feuern | heute Schub |
| LT · L2 | halten: Raketen-Aufschaltung, Loslassen feuert | heute bremsen |
| A · × | Boost (halten) | heute Angriff |
| B · ○ tippen | Abbrechen: Autofeuer aus → Ziel lösen → Tempomat/Autopilot aus | wie heute |
| B · ○ halten | Raumbremse | |
| X · □ | Tempomat an/aus | heute Rakete |
| Y · △ | Kontext (Andocken/Springen/Beute), halten = Autopilot | wie heute |
| R3 tippen | Ziel im Fadenkreuz (sonst nächstes in Blickrichtung) | heute Kamera |
| R3 halten | Umsehen mit rechtem Stick, Schiff hält Kurs | |
| Steuerkreuz ◂ ▸ | Schnellleiste: Platz wählen | wie heute |
| Steuerkreuz ▴ | gewählten Platz auslösen | heute RB+A |
| Steuerkreuz ▾ | nächste Leiste | heute ▴▾ |
| VIEW tippen / halten | Kamera wechseln / Karte | heute Karte |
| MENU tippen / halten 0,5 s | Bordmenü / NAV ↔ SCM | |

Der Wegfall von „RB halten + A“ macht die Belegung akkordfrei; RB ist für Rollen nötig. Landemodus und Autofeuer
liegen im Schnellrad des Bordmenüs (selten gebraucht) und in der Schnellleiste belegbar.

**Zielhilfe** (Einstellung AUS / NIEDRIG / STANDARD / HOCH, Standard STANDARD; in PvP höchstens NIEDRIG):

| Baustein | Wirkung | STANDARD |
|---|---|---|
| Bremsen | Zielrate × (1 − k), solange das Fadenkreuz innerhalb von 3 Zielradien (Winkel) liegt | k = 0,4 |
| Mitziehen | Zielrichtung bekommt einen Anteil der Winkelgeschwindigkeit des PIP, solange innerhalb 4° | 0,25 |
| Kardan-Hilfe | Waffen schwenken auf den PIP, wenn das Fadenkreuz höchstens G° daneben liegt | 4° (Maus: 1,5°, fest) |
| Zielwahl | R3 nimmt das Ziel mit dem kleinsten Winkel·Entfernungs-Maß im 25°-Kegel | immer |

Keine Hilfe, die selbst zielt, kein Einrasten auf Ziele außerhalb des Kegels, nichts bei Zielen hinter Deckung.
Vibration wie heute (Treffer, Explosionen, Rakete) plus kurze Rückmeldung bei Boost-Leere und Moduswechsel.

### 5.3 Touch (abgestuft)

| Gerät | Start | 3D-Bedienung | Was bleibt |
|---|---|---|---|
| Handy (kurze Seite < 600 px) | Taktisch | „Einfacher 3D-Flug“ wählbar: linker Stick zielt (Drehrate, Auto-Rollen und Horizont halten immer an), rechts senkrechter Schubregler, Autofeuer mit Aufschaltung (7.5), Knöpfe Boost, Rakete, Kontext, Kamera | Joystick und Knöpfe aus `hud-touch.js`, Ziel antippen, Pinch-Zoom im Taktikmodus |
| Tablet | Verfolger (wie heute MITTEL-Qualität) | wie Handy, zusätzlich Feuerknopf (Handfeuer mit Kardan-Hilfe 4°) und optional Kreisel-Zielen (`DeviceOrientationEvent`, unter iOS mit Erlaubnis) | wie oben |
| Touch + Controller | wie Controller | Touch-Knöpfe verschwinden (heute schon über `html[data-input="pad"]`) | |

Ziel: Touch darf nicht kaputtgehen. Volle 6DOF-Bedienung per Touch ist ausdrücklich kein Ziel.

### 5.4 Einstellungen

Eigener Schlüssel `localStorage['ls.flight']` (wie `ls.pad`, weil der Hub `ls.settings` nur mit seinen Werten
neu schreibt): `model` ('3d' | '2d', nur Übergang), `mouse` ('aim' | 'vjoy'), `sens`, `invertY`, `autoRoll`,
`horizonHold`, `throttle` ('hold' wie in der Referenz: W halten, loslassen bremst gekoppelt auf 0 | 'lever'
Schubhebel: W/S stellen das Soll ein und es bleibt), `assist` (Controller), `camRoll` ('ship' | 'horizon'),
`hudScale`. Oberfläche: Mission Control → EINSTELLUNGEN → STEUERUNG (neuer Bereich FLUG) und Bordmenü.

---

## 6. Kamera

### 6.1 Verfolger

- Rahmung je Klasse aus `CHASE_FRAME` (Abstand `d`, Neigung `el`, Bildlage `y`) bleibt Grundlage; die Rahmung wird
  jetzt **im Körpersystem einer Kameraausrichtung** angewendet statt nur um y.
- Kameraausrichtung `qCam`: Maus-Zielen → folgt `aimDir` (die Kamera schaut, wohin man zielt; das Schiff dreht
  sichtbar hinterher). Virtueller Stick und Controller → folgt der Schiffsausrichtung. Federung: `slerp` mit 7/s,
  Position wie heute kritisch gedämpft (`spring`, 7,5/s).
- **Rollen der Kamera** (`camRoll`): Standard „mit dem Schiff“ (gedämpft 4/s, das Bild kippt beim Rollen mit); Option
  „Horizont“ (Kamera-oben bleibt Sektor-oben, das Schiff rollt im Bild) gegen Übelkeit. „Bewegung reduzieren“ erzwingt
  Horizont und halbiert Stöße (wie heute `motion = 0,35`).
- Der heutige **Kampfschwenk** (Kamera dreht zwischen Schiff und Ziel) entfällt im Flug, weil die Kamera beim
  Maus-Zielen schon dorthin schaut. Ersatz: T halten = Zielblick (Kamera-Ziel = Richtung zum Ziel, Schiff hält Kurs).
- Abstand: Alt+Mausrad (0,65–2,4 wie `zoomBy`), Tempo- und Beschleunigungs-Zuschlag wie heute.
- `tools/bilder/groessen.mjs` und `rahmung.mjs` müssen im Geradeausflug weiter bestehen (gleiche Rahmung bei
  waagerechter Lage).

### 6.2 Cockpit

- Kamera am Augpunkt im Schiffssystem, Weltkamera dreht vollständig mit `q` des Schiffs; die Cockpit-Ebene
  (`render/cockpit.js`, eigene Szene 0,05–40 m) bleibt, ihre Kamera bekommt nur den Blickversatz.
- Kopfbewegung: Beschleunigung schiebt den Kopf um höchstens 6 cm (Feder), Rollen neigt den Blick leicht nach; „Bewegung
  reduzieren“ schaltet es ab.
- Helm-HUD: dieselben Flugelemente wie im Verfolger (11), projiziert auf eine Ebene vor dem Auge; Konsolen-Bildschirme
  zeigen Tempo, Boost, Modus (Zeichenflächen höchstens 5 × je Sekunde, wie heute).
- Umsehen: ±150° Gieren, −60/+80° Nicken, federt beim Loslassen zurück (heute ±1,9 / −0,6…0,7 rad).

### 6.3 Übergänge

| Wechsel | Dauer | Ablauf |
|---|---|---|
| Verfolger ↔ Cockpit | 0,5 s | Kamera fährt entlang der Schiffsachse; beim Durchgang durch die Hülle 120 ms Abblenden statt Durchschneiden |
| Flug → Taktisch | 0,9 s (`BLEND_T`) | Kran nach oben; Flugrechner schaltet auf Ebenenflug: Rollen und Nicken in 1,5 s auf waagerecht, Höhe wird gehalten; Zeigersperre wird gelöst |
| Taktisch → Flug | 0,9 s | Kamera hinter das Schiff; `aimDir` = Schiffsnase; Zeigersperre beim nächsten Klick |
| Andocken, Sprung, Tod | wie heute | Kamera-Reset (`rig.reset`) |

### 6.4 Umsehen

Z halten oder mittlere Maustaste (Controller: R3 halten + rechter Stick). Im Verfolger kreist die Kamera um das Schiff
(±170°), im Cockpit dreht der Kopf. `aimDir` friert ein, das Schiff hält den Kurs. Loslassen federt in 0,3 s zurück.

---

## 7. Waffen und Zielen

### 7.1 Waffenkreuz und Konvergenz

- Laser sitzen an den Ankern des Modells (heute schon für die Einbauprüfung `tools/models/einbau.mjs` vorhanden). Ohne
  Anker: symmetrisch an den Flanken, 30 % der Breite.
- Jeder Laser darf um höchstens **5°** von der Schiffsnase abweichen (Kardan). Er zielt auf den
  **Konvergenzpunkt** = Fadenkreuzstrahl in Konvergenzentfernung `D`:
  - Ziel unter dem Fadenkreuz (Strahl trifft dessen Trefferkugel × 3): Entfernung zu diesem Ziel;
  - sonst Entfernung des aufgeschalteten Ziels, sonst 500 m; begrenzt auf 150 m bis `PLAYER_RANGE` (650 m).
- Liegt der Konvergenzpunkt außerhalb des 5°-Kegels, feuern die Laser entlang des Kegelrands; das **Waffenkreuz**
  (Bugmarker) zeigt, wohin die Schüsse wirklich gehen.

### 7.2 Vorhalt (PIP)

Für jedes Ziel innerhalb 1,5 × Reichweite und im Sichtfeld:

```
r = pZiel − pSchütze,  u = vZiel − vSchütze        // Bolzen erben die Schützengeschwindigkeit
(u·u − s²) t² + 2 (r·u) t + r·r = 0                // s = Bolzentempo; kleinste positive Lösung t
PIP = pSchütze + r + u · t                          // ohne Lösung: kein PIP (Ziel zu schnell)
```

Gegner-KI nutzt dieselbe Formel mit Fehler (8.4). Der PIP leuchtet in Fraktionsfarbe, wenn das Waffenkreuz ihn
überdeckt; Kardan-Hilfe (5.2) schwenkt die Laser innerhalb von G° auf den PIP.

### 7.3 Geschosse (Bolzen)

- **Tempo 1.800 m/s**, Lebensdauer `PLAYER_RANGE × 1,1 / 1.800` ≈ 0,4 s. Bei 300 m/s Zielquerfahrt sind das bis zu
  120 m Vorhalt: sichtbar, lernbar, nicht frustrierend.
- **Salve statt Einzelschuss:** Ein heutiger Laserschuss (1 je Sekunde und Laser, `LASER_INTERVAL`) wird im Handfeuer
  zu **3 Bolzen** im Abstand von 0,1 s mit je einem Drittel des Schadens; Munition: 1 Einheit je Salve (Verbrauch und
  Wirtschaft unverändert). Kritische Treffer würfeln je Bolzen (gleicher Erwartungswert). S1 mit 2 Lasern feuert so
  6 Bolzen je Sekunde, S8 mit 13 Lasern 39.
- **Trefferprüfung:** je Schritt Strecke Bolzen alt → neu **relativ zur Bewegung des Ziels** gegen Kugel bzw. Kapsel
  (kein Durchtunneln bei 30 m je Schritt gegen 12-m-Larven). Kandidaten aus dem Raster um den Streckenmittelpunkt.
  Brocken blocken (Einschlag am Brocken, Ereignis `shot` mit `blocked`).
- **Ringpuffer:** 512 Bolzen als typisierte Felder (`Float64Array` für Position, `Float32Array` für Rest), keine
  Objekte je Schuss. Grafik: ein instanzierter Zeichenaufruf (Lichtstrich 30 m, Farbe des Lasers aus `LASERS`).
- Ereignisse `shot` (beim Abfeuern, mit Richtung) und `damage` (beim Treffer, mit Trefferpunkt in 3D) bleiben, neue
  Felder `y`, `hy`, `dy`; alte Empfänger lesen weiter x/z.

### 7.4 Raketen

- Aufschaltung: rechte Maustaste bzw. LT halten, Ziel im 12°-Kegel um das Fadenkreuz, 0,8 s (Ring schließt sich im HUD,
  Ton). Loslassen oder R feuert; ohne Aufschaltung fliegt die Rakete geradeaus.
- Flug: 520 m/s Endtempo, Drehrate 3 rad/s, Annäherungszünder 30 m, Lebensdauer 2,5 s. Schaden und Abklingzeit aus
  `ROCKETS` unverändert. `rocketHits` (Ausweichchance) bleibt als Wurf beim Zünden, Tech LCK trifft immer.
- Gegner, die aufgeschaltet werden, bekommen ein Ereignis; der Spieler sieht anfliegende Raketen als Bedrohungsmarke.

### 7.5 Autofeuer (Feuerleitrechner) und Balance

- **Taktikmodus:** unverändert die heutige Aufschaltung: Ziel wählen, Angriff an, Laser feuern automatisch, Treffer per
  `hitChance` (jetzt mit 3D-Abstand und 3D-Querbewegung), Nase dreht zum Ziel.
- **Flug, Autofeuer (Strg rechts / Schnellrad / Touch):** Laser feuern automatisch, wenn das aufgeschaltete Ziel im
  30°-Kegel der Nase und in Reichweite ist, Treffer per `hitChance × AUTO_K` mit **`AUTO_K = 0,8`**. Bolzen fliegen sichtbar
  zum gewürfelten Treffer- oder Fehlpunkt. Damit lohnt sich Handzielen (bis ≈ 100 % möglich), Autofeuer bleibt für
  Einsteiger, Touch und Barrierefreiheit.
- **Abstimmung:** Ziel ist, dass ein durchschnittlicher Handschütze (Bot-Modell 16.6: Zielfehler 0,6°, Reaktion
  150 ms) etwa dieselbe Schadensrate erreicht wie heute die Aufschaltung (≈ 80 % der Schüsse). Stellgröße ist der
  Trefferzuschlag `HIT_PAD` (Trefferkugel × 1,0–1,25), nicht der Schaden.

### 7.6 Gegnerfeuer

- **Etappe 1:** Gegner würfeln weiter mit `hitChance` (3D), die Bolzen fliegen sichtbar zum gewürfelten Punkt. Keine
  Balance-Änderung, Ausweichen zählt über die 3D-Querbewegung (`HIT_CROSS_LOSS`).
- **Etappe 2 (Schalter `enemyBolts`):** echte Bolzen mit KI-Vorhalt und Fehler je Typ (8.4), Trefferprüfung gegen die
  Kapsel des Spielers. Erst nach Abstimmung mit dem Balance-Werkzeug einschalten (Ziel: Schaden je Minute gegen ein
  kreisendes Bot-Schiff ±10 % zu heute).

---

## 8. KI in 3D

### 8.1 Was bleibt

Persönlichkeit je Typ (`ai.style`: pack, swarm, ambush, kite, thief, guard), Kampf-Regie `directCombat` (3–4 aktive
Angreifer, Rest wartet, Wechsel nach `TOKEN_ROTATE`), Rückzug und Heilen, Deckung, Hilferuf, angekündigte
Spezialangriffe mit Aufladen (`charge`), Ausweichen (`jink`), Denktakt 4 × je Sekunde, versetzt.

### 8.2 Bewegung

`moveEnemy` bleibt eine **Geschwindigkeitslenkung**, jetzt mit drei Komponenten (`MV.tx, ty, tz`), mit Beschleunigungs-
und Drehgrenzen aus `flight` (4.7). Die Ausrichtung folgt über den Nasenregler aus 4.3 (vereinfachte Fassung ohne
Düsenachsen): Nase zur Geschwindigkeit, beim Feuern zum Vorhaltepunkt, Kurvenlage aus der Querbeschleunigung
(Körper-oben zeigt zur Kurvenmitte, 30 % zur Sektor-Oberseite gemischt). Das ergibt Rollen und Nicken ohne
eigene Anzeige-Rechnung.

Begründung gegen ein volles 6DOF für Gegner: Die heutige Lenkung ist abgestimmt (Rudel, Ringe, Abstand, Brocken), ein
voller Düsenregler je Gegner wäre teurer und schwerer zu steuern. Für den Spieler sieht beides gleich aus.

### 8.3 Manöver

| Manöver | Typen | Ablauf in 3D |
|---|---|---|
| Zange | Raider (pack) | Flankenwinkel auf einer **Kugel** um das Ziel: Azimut wie heute (`flankA`, Ring dreht mit `RING_SPIN`), dazu Höhenwinkel je Angreifer −40…+40°; Ringebene um bis zu 35° geneigt |
| Durchflug und Wende | Raider, Jackal, Mercs | Anflug frontal feuernd, Vorbeiflug mit 80–150 m Versatz, 600 m Auslauf, Wende nach oben (halber Looping mit Rolle) oder Kurve, Wiederanflug; höchstens zwei gleichzeitig |
| Kurvenkampf | Jackal, Bosse mit Begleitern | Verfolgung in die hintere Halbkugel des Ziels, Vorhalt-Verfolgung beim Feuern, Nachlauf-Verfolgung beim Aufholen |
| Hinterhalt | Jackal (ambush) | lauert getarnt 250–400 m über oder unter dem Spieler, Rammangriff aus dem toten Winkel (hinten oben bzw. hinten unten gegen die Blickrichtung der Kamera); Aufladen bleibt sichtbar und hörbar |
| Schwarm | Larva (swarm) | umzingeln auf einer Kugelschale, Sprung (`leap`) als Vorstoß aus beliebiger Richtung |
| Abstand halten | Spiker (kite) | Abstand wie heute, dazu Höhenwechsel, Säurewolke als Kugel |
| Flucht mit Beute | Vulture (thief) | flieht steil aus der Sektorebene, nutzt Brockenfelder |
| Schildwall | Mercs (guard) | wie heute, dreht die Schildseite zum Angreifer |
| Ausweichen | alle mit `dodge` | seitlich **senkrecht zur Schusslinie in zufälliger Richtung** (statt nur links/rechts) |

### 8.4 Zielen der Gegner (Etappe 2)

Vorhalt nach 7.2 mit Fehler: Winkelfehler σ je Stufe (Stufe 1: 2,5°, Sektor 4–5: 1,6°, Sektor 6–8 und Elite: 1,0°,
Alpha und Bosse: 0,7°), Reaktionszeit 180–300 ms (Zielgeschwindigkeit wird verzögert gelesen), Feuerkegel 34° wie
`ENEMY_FIRE_ARC`, jetzt als Kegel.

### 8.5 Fairness und Lesbarkeit

- Bedrohungsanzeige am Bildrand für Gegner, die auf einen zielen oder aufladen (rote Bögen), Raketenwarnung mit Ton.
- **Höhenband im Taktikmodus:** Greift ein Gegner einen Piloten an, der in der Taktikansicht fliegt, bleibt er in
  ±120 m um dessen Höhe, Ringe und Kugeln werden flach (Neigung 0, Höhenwinkel 0). Je Ziel, nicht global: im
  Mehrspieler kann ein Gegner gegen den einen flach und gegen den anderen räumlich kämpfen. Die Ansicht wird in
  `pilot.view` gemeldet (lokal sofort, im Netz über die Flags).
- Hindernisse: Brocken-Ausweichen, Abstand untereinander, sichere Zone meiden und Kartengrenze laufen in 3D (gleiche
  Gesetze, Abstand als Kugel).

### 8.6 Aufwand im Takt

Pro Gegner und Schritt zusätzlich: eine Quaternion-Aktualisierung, eine dritte Komponente in allen Lenkkräften, eine
Höhenprüfung im Raster. Geschätzt +30–40 % auf `moveEnemy` (heute zusammen mit dem ganzen Kern 1,4–3,6 ms CPU je
Sim-Sekunde und Sektor, also unter 0,1 ms je Schritt). Unkritisch.

---

## 9. Mehrspieler-Abgleich

### 9.1 Zustand (`mp-core.js packState`)

Das Feld wird **hinten erweitert**; alte Clients prüfen nur `length ≥ 8` und lesen die Stellen 0–8, sie sehen neue
Piloten flach (y wird ignoriert). Neue Stellen:

| Stelle | Inhalt | Kodierung |
|---|---|---|
| 0–8 | wie heute (x, z, rot, crs, spd, hull, shield, flags, tgt) | unverändert |
| 9 | y | ganze Dezimeter |
| 10–12 | Quaternion, „smallest three“ | drei ganze Zahlen ±32.767 plus Index in Stelle 13 |
| 13 | Index des weggelassenen Anteils (0–3) und Vorzeichen | 0–7 |
| 14–16 | Geschwindigkeit vx, vy, vz | ganze dm/s |
| 17 | Flugflags: Boost, NAV, entkoppelt, Landung, Fahrwerk, Handfeuer, Ansicht taktisch | Bitfeld |
| 18 | Flugmodell-Version `fm` | 3 |

Etwa 70–90 Byte JSON je Nachricht (heute ≈ 45).

### 9.2 Takt und Darstellung

- Senden: im Flug **12 Hz**, 20 Hz solange ein PvP-fähiger Pilot im Flug näher als 1,5 km ist, sonst 9 Hz wie heute;
  Keepalive unverändert. Nachrichtenkontingent von Supabase Realtime vor dem Einschalten prüfen (Risiko 9).
- `Interp`: **Hermite-Interpolation** der Position aus Position und Geschwindigkeit, Quaternion per `slerp`,
  Verzögerung 100 ms bei 12 Hz (heute 130 ms bei 9 Hz), Vorhersage höchstens 250 ms entlang `v` mit Drehung um die
  letzte Drehrate.

### 9.3 Treffer im PvP

- Heute entscheidet das Opfer (`pvpDamage`, Nachricht `hit`). Mit Handzielen gilt **„Schütze entscheidet, Opfer prüft“**:
  Der Schütze trifft das interpolierte Abbild und sendet `hit` mit Schusszeit; das Opfer prüft gegen den eigenen
  Verlauf der letzten 500 ms, ob es zu dieser Zeit innerhalb von 2 × Trefferkapsel am gemeldeten Punkt war.
  Ratenbegrenzung wie heute (40 je 2 s). Mit dem eigenen Server (Phase B) rechnet der Server mit Lag-Kompensation.
- PvP-Zielhilfe für Controller höchstens NIEDRIG, Kardan-Hilfe für alle gleich (1,5° Maus, 4° Controller → in PvP
  beide 2°).

### 9.4 Koop (`coop.js`)

Der Gastgeber rechnet die Gegner in 3D und sendet je Gegner zusätzlich `y` (m) und Gieren/Nicken/Rollen als ganze
Grad (8 × je Sekunde wie heute). Der Gast prüft seine Bolzen gegen diese Abbilder und schickt Trefferwünsche wie heute.

### 9.5 Mischbetrieb und Versionen

Presence-Metadaten bekommen `fm`. Piloten mit `fm < 3` bleiben sichtbar, aber nicht PvP-fähig gegen Piloten mit
`fm = 3` (unfaire Trefferformen); Koop nur bei gleicher Version (Hinweis im Koop-Dialog). Regel n / n−1 aus der
Architektur für Store-Apps gilt.

---

## 10. Taktikmodus als Nebenmodus

- **Simulation:** dieselbe 3D-Welt. Der Spieler fliegt im Ebenenflug (4.3): Klick auf die Ebene setzt einen Wegpunkt
  auf **der aktuellen Höhe des Spielers**, Klick auf ein Objekt fliegt zu dessen 3D-Position. WASD bildbezogen, Mausrad
  Zoom, Aufschaltung, Strg Angriff, Leertaste Rakete, E Andocken: alles wie heute.
- **Höhe bedienen (optional):** Umschalt + Mausrad ändert die Haltehöhe in 50-m-Schritten; ein kleiner Höhenregler im
  HUD zeigt sie. Nötig ist das nicht, weil Beute nahe der Ebene liegt und der Autopilot jede Höhe anfliegt.
- **Darstellung:** Höhen werden im Renderer auf **25 %** relativ zur Spielerhöhe gestaucht (die Simulation bleibt
  echt), jedes Objekt mit mehr als 50 m Höhenunterschied bekommt einen Höhenstiel (Haarlinie zur Spieler-Ebene) mit
  Fußpunkt-Ring und Höhenangabe „+320“/„−140“ in der Instrumentenschrift. Auswahl (`renderer.pick`) trifft die
  gestauchte Lage.
- **KI:** Höhenband ±120 m gegen Piloten im Taktikmodus (8.5). Beute: Aufheben in 3D mit den heutigen Radien;
  im Taktikmodus wird der Höhenunterschied bis 200 m vom Ebenenflug automatisch ausgeglichen.
- **Abnahme:** Der Test-Pilot (`tools/playtest/spielen.mjs`) und `npm run balance` laufen im Taktikmodus und liefern
  Kennzahlen innerhalb ±5 % des Standes vor der Umstellung (Abschüsse je Stunde, Schaden je Minute, Tode).
  `controller.mjs` besteht alle Taktik-Prüfungen unverändert.

---

## 11. HUD im Flug

Alle Elemente im UI-Stil (`UI_STIL.md`): Haarlinien 1 px, Eckmarken, Chamfer statt Rundung, DIN Condensed in Versalien,
Zahlen in `tabular-nums`, Farben mit Funktion (Fraktion, Warnung `#ffb020`, Feind `#ff3b30`). Flugelemente um das
Fadenkreuz sind eine feste **Helmanzeige** (nicht verschiebbar, skalierbar 80–130 %); die Werte zusätzlich im
verschiebbaren Fenster SCHIFF.

| Element | Ort | Inhalt |
|---|---|---|
| Fadenkreuz | Mitte (Maus) | kleines Kreuz mit Lücke, Haarlinie, weiß 90 % |
| Waffenkreuz | wohin die Laser zielen | Kreis 14 px mit Strich; deckt sich mit dem Fadenkreuz, solange im Kardan |
| Flugbahnmarker | Projektion von `v` | Ring mit Flügeln; rückwärts: Kreuz („Gegenkurs“); entkoppelt zusätzlich die Nasenrichtung |
| PIP | je Ziel | Raute 10 px, leuchtet in Fraktionsfarbe bei Deckung |
| Zielrahmen | um Gegner | Eckwinkel rot, Entfernung, Annäherungstempo (+/−), Hülle/Schild als `.ls-bar` |
| Randpfeil | Bildrand-Kreis | Richtung zum Ziel außerhalb des Bildes, mit Entfernung |
| Raketen-Aufschaltung | um das Ziel | sich schließender Segmentring, VERRIEGELT |
| Tempoband | links | senkrechte Skala in m/s, Zahl groß (DIN Alternate), Marke Begrenzer, Strich SCM-Grenze, schraffierter Boostbereich |
| Schub / Steigen | rechts | Schubsoll gegen Ist je Achse (drei kleine Balken), Steigrate, Höhe über Sektorebene (später über Grund) |
| Boost | unter der Mitte | segmentierter Balken (10 Segmente), Nachladen sichtbar, leer = Warnfarbe |
| Moduskennung | unter dem Boost | `SCM` · `NAV` · `KOPPL`/`ENTK` · `TEMPOMAT` · `LANDUNG` · `FAHRWERK` · `AUTOFEUER` · Zielhilfe-Stufe |
| Horizont | ganze Mitte, sehr leise | Nickleiter gegen die Sektorebene alle 10°, Horizontlinie, Rollmarke |
| Kursband | oben | Kompass 0–359° gegen Sektor-Nord, Marken für Station, Tor, Ziel |
| Bedrohungen | Bildrand | rote Bögen (Gegner zielt/lädt), Raketenwarnung |
| Minikarte | Fenster wie heute | Draufsicht, Höhe als ▴/▾ mit Zahl, Ziele über/unter der Ebene unterscheidbar |

Technik: Helmanzeige als **eine** 2D-Zeichenfläche über der Spielfläche in Pixeldichte des Geräts (kein DOM je
Element, keine Layout-Neuberechnung je Bild), Zahlenfelder höchstens 15 × je Sekunde neu. Ziel: ≤ 0,4 ms je Bild auf M5.
Glyphen ▴ ▾ wie in `CONTROLLER.md` (außerhalb der Emoji-Bereiche, `floskeln.mjs` bleibt sauber).

---

## 12. Vorbereitung Landemodus und Planetenlandung

### 12.1 Landemodus im Shooter (jetzt)

- Taste N / Schnellrad: Modus `land`, Grenzen 50 m/s vorwärts, 20 m/s vertikal, Drehrate × 0,5, Waffen aus, Fahrwerk
  fährt in 1,2 s aus (Grafik am Modell, Kontaktpunkte aus Ankern, sonst vier Punkte unter dem Rumpf).
- Landehilfe im HUD: Höhe über Grund, Sinkrate (rot über 4 m/s), Lagekreuz, Projektion des Landefelds.
- **Testgelände:** eine Landeplattform an jeder Heimatstation (Fläche mit `groundAt`, 12.2). Aufsetzen dort ist ein
  zweiter Weg zum Andocken (danach die heutige Andock-Ansicht). So lässt sich Landen vor den Planeten bauen und testen.

### 12.2 Umgebungsschnittstelle

```js
env = {
  frame: 'sec:sa-3',                 // Bezugsrahmen (ARCHITEKTUR-SANDBOX 4.1)
  gravityAt(p, out) {},              // m/s² (Shooter: 0; Plattform: 0)
  densityAt(p) {},                   // kg/m³ (Shooter: 0)
  groundAt(p, out) {},               // → { h, nx, ny, nz } oder null (Shooter: nur Landeplattformen)
}
```

Der Flugrechner nutzt sie schon jetzt:

- **Schweben:** `ab += q⁻¹ · (−gravityAt(p))` als Vorsteuerung, begrenzt durch die Düsen; reicht der Vertikalschub
  nicht (großes Schiff, starke Schwerkraft), sinkt das Schiff und das HUD warnt („SCHUB REICHT NICHT“). Daten dafür
  stehen schon in 4.7 (Vertikal-A je Klasse).
- **Luftwiderstand:** `Widerstand = ½ · ρ · Cd·A / m · |v| · v` mit Klassenwert `CdA_m`; im Shooter 0.
- **Fahrwerk:** je Kontaktpunkt Feder-Dämpfer gegen `groundAt` (Federweg 0,6 m, kritisch gedämpft), Reibung, Kontakt-
  zähler; „gelandet“, wenn alle Kontakte tragen und `|v| < 1 m/s` für 0,5 s. Aufsetzen über 4 m/s Sinkrate = Schaden.
- **Abheben:** Landemodus, Vertikalschub, ab 30 m Höhe Fahrwerk ein (oder Taste).

### 12.3 Aussteigen, zu Fuß, einsteigen (folgender Meilenstein)

Vorbereitet, nicht gebaut: Schiffszustand „geparkt“ (Simulation rechnet den Körper ruhend weiter, Kontakte fest),
Pilot verlässt den Körper (`pilot.vehicle = null`), Figur-Controller aus Phase D3 übernimmt; Einsteigen setzt
`pilot.vehicle` wieder. Eingaben laufen über denselben `FlightCmd`-/Befehlsweg, Kamera bekommt einen vierten Modus
„zu Fuß“.

### 12.4 Große Koordinaten (Floating Origin)

- Simulation in `number` (64 Bit), Positionen **relativ zum Bezugsrahmen** des Sektors bzw. später des Planeten.
- Zeichnen **kameranah**: der Renderer zieht vor dem Setzen der Matrizen die Kameraposition ab (`pos − cam` in 64 Bit,
  dann float32). Im Shooter (8 km) heute nicht nötig, wird aber in Etappe F4 schon so gebaut, damit Planeten keinen
  Umbau brauchen. Ein sichtbarer Ursprungssprung entfällt damit (Architektur 2.6).
- Selbsttest: derselbe Flug bei 1.000 km Versatz liefert dieselben Werte bis auf 1 mm und ruckelfreie Darstellungsdaten.

---

## 13. Leistungsbudget

### 13.1 Mac (Apple M5, Priorität 1)

Ziel: Browser 120 Hz auf ProMotion (8,3 ms), mindestens stabil 60 Hz; Mac-App (Electron) 120 Hz in HOCH. Ausgangslage
(`ENGINE.md`, Messung 02.11.2026): GPU 6–7,6 ms in HOCH (Retina, adaptive Auflösung), CPU 3,5–4,4 ms je Bild.

| Posten | Budget je Bild (CPU) | Begründung |
|---|---|---|
| Simulation 3D (1–2 Schritte) | ≤ 0,8 ms | Kern heute < 0,1 ms je Schritt, Flug +0,05 ms, Gegner +40 %, Bolzen 512 mit Rasterabfrage ≈ 0,1 ms |
| Eingabe, Zielen, PIP | ≤ 0,1 ms | wenige Vektoren, PIP nur für sichtbare Ziele (≤ 12) |
| Helm-HUD (Zeichenfläche) | ≤ 0,4 ms | ein Kontext, Linien, Zahlen gedrosselt |
| Mehrspieler-Interp | ≤ 0,05 ms | ≤ 10 Piloten |
| Renderer-Mehraufwand | ≤ 0,3 ms | Quaternion statt Gierwinkel, Höhenstiele (Taktik) |
| **Summe Mehraufwand CPU** | **≤ 1,6 ms** | |
| GPU-Mehraufwand | ≤ 0,6 ms | Bolzen 1 Zeichenaufruf instanziert; mehr sichtbare Kulisse beim Blick nach oben/unten (Felder in die Höhe), Frustum-Culling je Feld bleibt |

Regeln: keine Speicher-Neuanlage je Schritt oder Bild (wie heute), feste Puffer, keine `THREE.Vector3` im Kern,
Rohdaten-Maus (`unadjustedMovement`) in Chrome, Mausweg je `pointermove` sammeln und je Bild einmal anwenden.
Adaptive Auflösung und Qualitätsautomatik (`renderer.fpsFloor()`) bleiben die Absicherung.

### 13.2 Windows RTX 5080 (Priorität 2)

GPU unkritisch. Prüfen: 144/240 Hz (`fpsCap` 0) mit gleichem Zielgefühl (Zielen hängt nicht an der Simulationsrate),
Zeigersperre in Electron und Chrome, Xbox-Controller über XInput (Standard-Mapping), Edge.

### 13.3 Handy und Tablet (Priorität 3)

Nichts verschlechtern: Taktik als Start auf dem Handy, MITTEL-Qualität, Bolzen-Grafik halbiert, Helm-HUD nur im
„Einfachen 3D-Flug“. Prüfung über die Geräte-Emulation (16.7).

---

## 14. Betroffene Dateien

### 14.1 Neu

| Datei | Inhalt |
|---|---|
| `Code/src/sim/flight/math.js` | Vektor- und Quaternion-Rechnung auf Zahlen und typisierten Feldern, ohne Objekte |
| `Code/src/sim/flight/params.js` | Parameter je Klasse (4.7), Gegner-Flugwerte |
| `Code/src/sim/flight/ifcs.js` | Flugrechner: gekoppelt/entkoppelt, Boost, NAV, Landung, Bremse, Tempomat, Begrenzer, Nasenregler, Ebenenflug |
| `Code/src/sim/flight/body.js` | Integrator, Ableitung `rot/pitchW/bankW`, Kollision Kugel/Kapsel |
| `Code/src/sim/flight/env.js` | Umgebungsschnittstelle mit Shooter-Standard (0) und Landeplattform |
| `Code/src/sim/flight/gear.js` | Fahrwerk und Kontakte (Etappe F9) |
| `Code/src/sim/bolts.js` | Ringpuffer Bolzen, Trefferprüfung, Vorhalt (PIP) |
| `Code/src/input/flightinput.js` | Maus-Zielen, virtueller Stick, Zeigersperre, Tastenachsen, `FlightCmd` |
| `Code/src/render/bolts.js` | instanzierte Bolzen-Grafik |
| `Code/src/ui/hud-flight.js` (+ `.css`) | Helmanzeige als Zeichenfläche (11) |
| `Code/tools/playtest/flug3d.mjs` | headless Prüfung Flug, Zielen, Modi, Kamera (16.2) |
| `Code/tools/balance/zielen.mjs` | Handschützen-Modell, Abgleich Hand/Auto/alt (16.6) |
| `Planung/FLUG.md` | verbindliche Fassung nach Tonis Freigabe (ersetzt Teile von `FLUGGEFUEHL.md`) |

### 14.2 Geändert

| Datei | Änderung |
|---|---|
| `Code/src/sim/world.js` | `makeEntity` mit y/q/ω, `_movePlayer` → Flugrechner, `_updateLasers` Hand/Auto, `_fireLaser`, `hitChance` 3D, `enemyFire`, `segRock3`, Bereiche (`_updateZones`), Kartengrenze mit Höhe, Beute 3D, Raketen mit Flug, `command()` für Flug |
| `Code/src/sim/ai.js` | `moveEnemy` 3D, Manöver (8.3), Ausrichtung, Höhenband, Ausweichen 3D |
| `Code/src/sim/combat.js` | 3D-Hilfen (Richtung, Abstand), `headingOf` bleibt |
| `Code/src/sim/abilities.js`, `drones.js`, `events.js`, `spawn.js`, `system-quests.js` | Radien als Kugeln, Höhe beim Platzieren, Drohnenformation im Schiffssystem |
| `Code/src/sim/config.js` | neue Werte (Bolzen, Sektorhöhe, Autofeuer, Höhenband) |
| `Code/src/core/data.js` | nur `flight`-Block je Gegnertyp und Trefferkapsel je Schiff; keine Balance-Werte |
| `Code/src/sim/selftest.mjs` | Abschnitt „Flug 3D“ (16.1) |
| `Code/src/input.js` | Taktik bleibt; Flugzweig an `flightinput.js` abgeben; Befehle `attack/rocket/context/cancel` bleiben |
| `Code/src/input/padflight.js`, `gamepad.js` | Belegung Flug 3D, Zielhilfe, Akkord entfernt |
| `Code/src/input/padglyph.js`, `ui/pad-map.js` | Symbole und Übersicht je Modus |
| `Code/src/render/camrig.js` | Kameraausrichtung als Quaternion, Rollen, Zielblick, Umsehen 3D, Übergänge |
| `Code/src/render/renderer.js` | Entitäten mit y und Quaternion, Überblendung, Höhenstauchung und Stiele (Taktik), `pick` 3D, kameranahes Zeichnen |
| `Code/src/render/cockpit.js` | Kopfbewegung, Helm-HUD-Ebene, Konsolenwerte |
| `Code/src/render/effects.js` | Treffer, Explosionen, Düsen in 3D |
| `Code/src/render/fields.js`, `deco.js`, `layers.js`, `environment.js`, `sky.js` | Felder mit Höhe, Himmel ohne Pol-Fehler (Würfel statt Equirect, Risiko 17) |
| `Code/src/ui/hud.js`, `hud-combat.js`, `hud-mid.js`, `hud-map.js`, `hud-touch.js`, `hud-coach.js`, `hud-guide.js` | Werte im Fenster SCHIFF, Minikarte mit Höhe, Touch-„Einfacher 3D-Flug“, Texte je Modus |
| `Code/src/net/mp-core.js`, `mp.js`, `coop.js` | 9.1–9.5 |
| `Code/tools/playtest/controller.mjs`, `spielen.mjs`, `tief.mjs`, `pilot-im-browser.js`, `tools/mehrspieler/test.mjs`, `tools/bilder/*.mjs` | neue Prüfungen, **headless als Standard** (heute `tief.mjs` und andere mit `headless: false`) |
| `Planung/CONTROLLER.md`, `FLUGGEFUEHL.md`, `ARCHITEKTUR-SANDBOX.md`, `SCHNITTSTELLEN.md` | nach Freigabe nachziehen |

### 14.3 Nicht anfassen

Balance-Werte in `data.js` (Leben, Schaden, Preise, Tempo), Konto und Speicherstand-Format (neue Felder nur im
Flugzustand, nicht im Profil), Website, Modelle und Ton-Dateien, `public/play/` (kein Build ohne Freigabe).

---

## 15. Reihenfolge der Umsetzung

Alles hinter dem Schalter `ls.flight.model` (Standard `'2d'` bis F10, Entwicklung `?flug=3d`). Nach jeder Etappe:
`npm run check` grün, Taktik-Kennzahlen unverändert, ein Commit je Etappe auf `claude/flug`.

| Etappe | Inhalt | Abnahme (automatisch) | Aufwand |
|---|---|---|---|
| **F0 Messung und Gerüst** | Ausgangswerte festhalten (`npm run balance`, `controller.mjs`, `tief.mjs`, `spielen.mjs`, Bildzeit), Schalter, `sim/flight/math.js` mit Tests | Bericht `Planung/berichte/flug-f0.json` | 2–3 Tage |
| **F1 Flugkern** | `ifcs.js`, `body.js`, `params.js`; Spieler mit y/q/ω; Renderer zeigt Spielerlage; Gegner noch flach | Selbsttest 16.1 a–f | 1 W |
| **F2 Maus-Zielen und Kamera** | `flightinput.js`, Zeigersperre, Verfolger/Cockpit mit Quaternion, Übergänge, Kern-HUD (Fadenkreuz, Flugbahn, Tempo, Boost, Modus), Ebenenflug für Taktik | `flug3d.mjs` Teil A, `groessen.mjs` besteht | 1–1,5 W |
| **F3 Waffen** | Bolzen, Konvergenz, PIP, Kardan, Handfeuer, Autofeuer, Raketen mit Aufschaltung | Selbsttest g–h, `flug3d.mjs` Teil B | 1 W |
| **F4 Welt in 3D** | y für Gegner, Brocken, Beute, Bereiche, Kartengrenze, Fähigkeiten, Drohnen, Felder mit Höhe, Taktik-Darstellung mit Stiel und Stauchung, kameranahes Zeichnen | Selbsttest i, k; Taktik-Kennzahlen ±5 % | 1–1,5 W |
| **F5 KI 3D** | Bewegung, Ausrichtung, Manöver, Höhenband, Ausweichen; Gegnerfeuer Etappe 1 | Selbsttest j; `tief.mjs` Sektoren 4–8 ohne Abbruch | 1,5–2 W |
| **F6 Controller und Touch** | Belegung 5.2, Zielhilfe, Touch-Stufen | `controller.mjs` (≈ 95 Prüfungen), Touch-Emulation | 1 W |
| **F7 HUD vollständig, Texte** | alle Elemente aus 11, Einstellungen, Einführung/Coach je Modus, Bedrohungsanzeige | `flug3d.mjs` Teil C (HUD-Prüfpunkte), `floskeln.mjs` | 1 W |
| **F8 Mehrspieler und Koop** | 9.1–9.5 | `mehrspieler/test.mjs` erweitert | 1 W |
| **F9 Landemodus** | Fahrwerk, Landehilfe, Landeplattform, Umgebungsschnittstelle mit Schwerkraft im Test | Selbsttest l | 0,5–1 W |
| **F10 Feinschliff und Umschalten** | Abstimmung mit `zielen.mjs`, Gegnerfeuer Etappe 2 hinter Schalter, Vergleichsbilder, Leistung, Standard auf `'3d'`, alter Flugpfad entfernt, Planung nachgezogen | alle Prüfungen, Bildzeit-Bericht | 1–2 W |

Summe etwa **10–13 Wochen Vollzeit**. Die ersten spielbaren Eindrücke gibt es nach F2 (Fliegen) und F3 (Schießen);
dort sollte Toni zum ersten Mal selbst fliegen und das Gefühl freigeben, bevor F4–F5 den Rest der Welt umbauen.

---

## 16. Testplan (automatisch, ohne sichtbare Fenster)

Alle Browser-Prüfungen mit `playwright-core`, **headless**, Chrome-Kanal mit
`--use-angle=metal` (Mac) bzw. Standard-GPU, Rückfall `--use-angle=swiftshader`; ein `--sichtbar` gibt es nur als
ausdrückliche Option. Entwicklungsserver auf einem freien eigenen Port (nicht 5173), am Ende beendet.

### 16.1 Selbsttest (`npm test`, Node, ohne Browser)

| # | Prüfung | Grenze |
|---|---|---|
| a | Beschleunigung gekoppelt 0 → 95 % SCM | S1 1,9–2,6 s, S8 3,4–4,4 s |
| b | Loslassen (Halten-Schub) bremst auf < 1 m/s | S1 ≤ 3 s, S8 ≤ 5 s |
| c | Drift nach 90°-Wende gekoppelt | Querfahrt < 5 m/s nach 2 s (S1) bzw. 3,5 s (S8) |
| d | Entkoppelt: Schub aus, 10 s geradeaus, Drehen ändert `v` nicht | |v| ±0,5 %, Richtung ±0,1° |
| e | Grenzen: SCM gehalten; Boost ≤ +40 %; Vorrat leer nach Vorratszeit ±0,2 s; Nachladen voll ≤ 7 s; NAV-Hochlauf 1,5 s; Waffen im NAV gesperrt | wie angegeben |
| f | Quaternion-Norm nach 1 h Simulation; zwei Läufe gleicher Seed | Abweichung < 1e−9; Zustands-Prüfsumme gleich |
| g | Nasenregler: Sprung 90° | eingeschwungen ≤ 1,4 s (S1), Überschwingen < 2° |
| h | Vorhalt: 1.000 Zufallsfälle, Schuss auf PIP gegen Ziel mit fester Geschwindigkeit | ≥ 99 % Treffer; kein Durchtunneln bei 1.800 m/s gegen r = 12 m |
| i | Welt 3D, 120 s Bot-Kampf: kein Körper in Brocken/sicherer Zone, alle in der Sektorbox | 0 Verstöße |
| j | KI-Höhe: Spieler im Flug → Höhenstreuung der Angreifer σ_y > 80 m; Spieler taktisch → < 60 m | wie angegeben |
| k | Großer Versatz (1.000 km): gleicher Flug | Positionen ±1 mm |
| l | Landung mit `gravityAt` 3 m/s², flache Plattform: Schweben hält ±0,5 m; Aufsetzen < 4 m/s ohne Schaden, > 4 m/s mit Schaden; „gelandet“ nach 0,5 s | wie angegeben |
| m | `packState`/`unpackState`: neues Feld rundlaufend (Position 0,1 m, Quaternion < 0,1°), altes 9er-Feld weiter lesbar | |
| n | Alle bisherigen 268 Prüfungen | grün |

### 16.2 `tools/playtest/flug3d.mjs --url <dev-url>` (neu)

Steuert über `window.__ls` und eine Test-Schnittstelle `input.flight.aimBy(dx, dy)` (Zeigersperre ist headless nicht
zuverlässig; der Mausweg wird über dieselbe Funktion eingespeist wie echte `pointermove`-Daten) und über
`page.keyboard`.

- **Teil A Flug:** W/S, A/D, Leertaste/Strg, Q/E, Umschalt, X, C, Mausrad, Alt+C, M, N wirken wie in 5.1 (Werte aus
  `world.player.fl`); Fadenkreuz bewegt sich im selben Bild wie `aimBy`; Nase folgt innerhalb der Grenzen aus 16.1 g;
  V durchläuft Verfolger → Cockpit → Taktisch → Verfolger ohne NaN in Kamera oder Lage; Taktik setzt Lage waagerecht
  in ≤ 1,6 s; Umsehen federt zurück.
- **Teil B Waffen:** Ziel-Attrappe mit fester Bahn, Handfeuer auf PIP trifft ≥ 90 %, ohne Vorhalt < 40 %; Autofeuer
  feuert nur im 30°-Kegel; Raketen-Aufschaltung braucht 0,8 s; sichere Zone sperrt Feuer.
- **Teil C HUD:** alle Elemente aus 11 gezeichnet (Prüfpunkte der Zeichenfläche über eine Test-Liste der Elemente),
  Moduskennungen wechseln, Bildschirmfotos je Ansicht nach `berichte/flug3d-<zeit>/`.
- **Immer:** 0 Konsolenfehler, Bildzeit p50/p95 im Kampf in `bericht.json` (headless nur als Vergleichswert).

### 16.3 `controller.mjs` (erweitert)

Neue Belegung Flug 3D (5.2), Rollen auf LB/RB, Schnellleiste ohne Akkord, VIEW tippen/halten, MENU halten,
L3-Doppeltipp, Zielhilfe: mit Rausch-Stick gegen bewegtes Ziel Trefferquote mit STANDARD > AUS um mindestens 15
Prozentpunkte, PvP-Deckel greift; Taktik-Belegung unverändert (alle bisherigen 73 Prüfungen, soweit sie den
Taktikmodus betreffen, plus angepasste Flug-Prüfungen).

### 16.4 `tools/mehrspieler/test.mjs` (erweitert)

Zwei headless Seiten im selben Sektor: 3D-Lage kommt an, Darstellungsfehler < 2 m bei 300 m/s und 12 Hz, Quaternion
< 2°; alter Client (Attrappe mit 9er-Feld) wird weiter angezeigt; PvP-Treffer „Schütze entscheidet, Opfer prüft“
nimmt echte Treffer an und lehnt einen um 50 m versetzten ab; Koop mit Gegnern in 3D.

### 16.5 Bilder (`tools/bilder`)

`ansichten.mjs` mit neuen Ansichten (Verfolger steil nach oben, Cockpit gerollt, Taktik mit Höhenstielen, Kampf mit
PIP), `groessen.mjs` und `rahmung.mjs` bestehen weiter, `kampf.mjs` mit HUD; alle headless.

### 16.6 Balance (`tools/balance/zielen.mjs`, neu)

Bot-Schütze mit Zielfehler (σ 0,6°/1,2°), Reaktionszeit 150 ms, Ziel-Folgen über den Nasenregler. Vergleicht je
Sektor 1–8: Schaden je Minute, Zeit bis zum Abschuss, erlittener Schaden für Hand, Autofeuer (0,8) und den alten
Stand. Abnahme: Hand (σ 0,6°) liegt bei 95–115 % des alten Stands, Autofeuer bei 75–85 %. `npm run balance` im
Taktikmodus ±5 % zum Stand aus F0.

### 16.7 Touch

Geräte-Emulation (iPhone- und iPad-Viewport, Touch-Ereignisse) headless: Taktik startet auf dem Handy, Joystick und
Knöpfe funktionieren, „Einfacher 3D-Flug“ lenkt, Autofeuer trifft, keine Elemente außerhalb des Bildes.

---

## 17. Risiken

| # | Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|---|
| 1 | Umbau berührt fast jede Datei mit x/z (≈ 700 Stellen, davon `world.js` 195, `ai.js` 84, `effects.js` 77, `renderer.js` 76) | lange Baustelle, Rückschritte | Etappen hinter Schalter, flache Felder bleiben gültig, Selbsttest und Taktik-Kennzahlen nach jeder Etappe |
| 2 | Fluggefühl trifft Tonis Erwartung nicht | Arbeit umsonst | Abnahme durch Toni nach F2/F3 vor dem Rest; alle Werte in `params.js`, Entwicklungs-Regler `?flugwerte=1` |
| 3 | Balance kippt durch Handzielen | zu leicht/zu schwer | `zielen.mjs`, Stellgröße Trefferzuschlag; Gegnerfeuer erst Etappe 1 (Würfel), Etappe 2 hinter Schalter |
| 4 | Taktikmodus wird unbemerkt schlechter | Nebenmodus kaputt | Höhenband, Ebenenflug, Höhenstauchung; Kennzahlen ±5 %; `controller.mjs`-Taktikteil unverändert |
| 5 | Orientierung in 3D verloren, Übelkeit | Spieler hören auf | Horizont, Kursband, Höhenangaben, „Horizont halten“, Kamera-Rollen „Horizont“, „Bewegung reduzieren“ |
| 6 | Zeigersperre im Browser (Esc, Fokusverlust, Safari, iframe) | Zielen fällt aus | Rückfall virtueller Stick, klare Anzeige „KLICKEN ZUM STEUERN“, Alt für freien Zeiger |
| 7 | Tastenumzug (Leertaste, Strg, E) verwirrt bisherige Piloten | Fehlbedienung | Taktik behält alles; Hinweis beim ersten Flug; Tastenschilder je Modus; Belegung frei änderbar als späterer Schritt |
| 8 | Controller-Belegung ändert sich stark | 73 Prüfungen und Doku veralten | Taktik-Belegung bleibt; neue Prüfungen; `CONTROLLER.md` nachziehen |
| 9 | Supabase-Realtime-Kontingent bei 12–20 Hz | Kanal schließt, Kosten | nur bei Bedarf 20 Hz, Messung vor Freigabe, Server (Phase B) löst es endgültig |
| 10 | PvP-Treffer per Schütze manipulierbar | Schummeln | Prüfung durch das Opfer, Ratenbegrenzung, PvP-Ehre erst mit Server werten (Architektur 3.4) |
| 11 | Gegner in 3D unlesbar | Chaos (Toni: „zu chaotisch“) | Regie bleibt (3–4 Angreifer), Bedrohungsanzeige, Randpfeile, Höhenband in Taktik |
| 12 | Kulissen sind für die Draufsicht gebaut (Schichten, Station bei y = −44) | Welt wirkt flach von der Seite | Felder mit Höhe in F4, Vergleichsbilder |
| 13 | Leistung auf älteren Laptops | Ruckeln | Budget 13.1, adaptive Auflösung, Bolzen-Grafik je Stufe |
| 14 | Trefferkapseln großer Schiffe (S8 189 m) | große Schiffe zu leicht zu treffen | Kapsel schmal (r 18 m), Schild/Hülle sind ohnehin hoch; mit `zielen.mjs` prüfen |
| 15 | Mischbetrieb alter/neuer Clients | merkwürdige Bilder, unfaires PvP | `fm` in Presence, PvP nur gleiche Version |
| 16 | Architektur-Entscheidung 2.1 wird umgeworfen | Doppelarbeit mit Universum | Flugkern ist der spätere `sim3d`-Kern (3.2), Umgebungsschnittstelle schon jetzt |
| 17 | Rundumbild des Himmels (Equirect) zeigt an den Polen Verzerrung, sobald man senkrecht schaut | sichtbarer Fehler | Himmel als Würfelbild backen (gleiche Shader, sechs Richtungen) oder Pol-Filterung |
| 18 | Headless-Browser rechnet WebGL anders (SwiftShader) | Bildzeiten nicht vergleichbar | Bildzeit headless nur relativ werten; harte Leistungsprüfung über `ansichten.mjs` mit GPU-Kanal |

---

## 18. Entscheidungen für Toni

1. **Shooter wird 3D, Architektur 2.1 wird revidiert** (Flugkern = späterer Universums-Kern). Empfehlung: ja.
2. **Schub-Standard:** „Halten“ wie in der Referenz (W halten, Loslassen bremst gekoppelt auf 0, C = Tempomat) oder
   „Schubhebel“ (W/S stellen ein, bleibt). Empfehlung: Halten, Schubhebel als Einstellung.
3. **Autofeuer im Flug mit 80 % Treffer-Faktor**, damit sich Handzielen lohnt. Empfehlung: ja.
4. **Tastenumzug im Flug:** Leertaste/Strg = hoch/runter, Q/E = rollen, F = Andocken/Kontext; Taktik behält alles.
   Empfehlung: ja.
5. **Reiseflug NAV** mit 2,6-facher Grenze, Waffen aus, Schilde laden nicht. Empfehlung: ja.
6. **Gegnerfeuer mit echten Bolzen** (Ausweichen wirklich möglich) erst nach Abstimmung (Etappe 2). Empfehlung: ja.
7. **Kamera rollt mit dem Schiff** (Standard) oder bleibt waagerecht. Empfehlung: rollt mit, Option waagerecht.
8. **Landeplattform an der Heimatstation** als erstes Landeziel vor den Planeten. Empfehlung: ja.

---

## Quellen (Recherche 03.11.2026)

- Star Citizen Wiki, Steuerungs-Leitfaden (Kopplung, Begrenzer, Boost, Nachbrenner, Raumbremse, Landemodus, ESP, PIP):
  https://starcitizen.tools/Guide:Controls
- Star Citizen Wiki, Tastenbelegung: https://starcitizen.tools/Keybinds
- Star Citizen Wiki, ESP: https://starcitizen.tools/ESP
- Star Citizen Wiki, Spieloptionen (PIP-Einrasten, Kardan-Sperre): https://starcitizen.tools/Game_Options
- Arena Commander 0.9.2, Patch-Notizen (PIP je Waffe statt Vorhaltelinien):
  https://robertsspaceindustries.com/comm-link/transmission/14258-Arena-Commander-092-Released
- Design Notes zum Flugmodell (Alpha 2.0): https://starcitizen.tools/Comm-Link:Design_Notes_-_Flight_Model_Changes_in_Star_Citizen_Alpha_2.0
- Gemeinschaftsbeiträge zu Master Modes (NAV/SCM, Grenzen, Hochlauf, angekündigte Überarbeitung Ende 2024):
  https://feddit.it/post/8029745, https://lemm.ee/post/5622827/2835331,
  https://simulationdaily.com/news/star-citizen-master-modes-750-million-dollars/

Hinweis: Die Quellen zu NAV/SCM stammen überwiegend aus 2023–2024. Ob die angekündigte Überarbeitung inzwischen live
ist, ließ sich nicht sicher klären; für LAST SIGNALS ist das unerheblich, weil nur das Prinzip übernommen wird.
