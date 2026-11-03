// SYSTEM-Reihe: optionale Einführung in kleinen echten Handlungen (Planung/QUESTS_SYSTEM.md, Kapitel 1–3).
// Läuft neben der normalen Auftragskette, blockiert nichts und lässt sich jederzeit überspringen, pausieren
// und fortsetzen. Zustand im Profil: profile.system = { mode, idx, progress, done[], skipped[] }.
//   mode: 'guided' (Karte führt aktiv) | 'direct' (Reihe liegt bereit, nichts wird eingeblendet) | null (noch nicht gewählt)

export const SYSTEM_CHAPTERS = { 1: 'Fliegen', 2: 'Zielen und Angreifen', 3: 'Munition 1–6', 4: 'Raketen', 5: 'Schnellleiste', 6: 'Extras und Minen', 7: 'Techs', 8: 'Konfigurationen', 9: 'Beute', 10: 'Erz', 11: 'Station', 12: 'Reparatur und Formation', 13: 'Sprung', 14: 'Gegnertypen', 15: 'Elite und Alpha', 16: 'Ehre und Rang', 17: 'Hub', 18: 'Abschluss' };

// Ziele: fly {meters, camera?}, brake {fromSpeed}, camera {target}, reach {dx, dz, r} (relativ zur Station),
// target {}, attack {}, kill {target?, count}, shoot {ammo, count}, rocket {rocket, count}, arsenal {},
// bar {bar} (Leiste umschalten), place {bar, count} (Plätze neu belegt), extra {id, hits?|combat?|strike?},
// mine {ids, count}
// key: Tastenschild in der Karte; keys werden in der Anzeige aus der Belegung gelesen, soweit vorhanden.
export const SYSTEM_QUESTS = [
  { id: 'sys01', ch: 1, title: 'Signal empfangen', text: 'Station hier, wir hören dich. {steer} gibt Schub, bis zum vollen Tempo dauert es ein paar Sekunden.', goal: { type: 'fly', meters: 300 }, key: 'W', k2: 'steer', t3: 'Station hier, wir hören dich. {thrustHow}, bis zum vollen Tempo dauert es ein paar Sekunden. Zielen und lenken macht {aimDev}.', k3: 'fwd', reward: { credits: 500, xp: 200 } },
  { id: 'sys02', ch: 1, title: 'Die Maus lenkt', text: 'Im Verfolger folgt die Nase dem Mauszeiger. Halt die Maustaste oder W und flieg eine weite Kurve.', goal: { type: 'fly', meters: 1500, camera: 'chase', turn: 270 }, key: 'MAUS', t3: 'Im 3D-Flug zielt {aimDev}: das Fadenkreuz folgt sofort, das Schiff dreht hinterher. Gib mit {fwd} Schub und flieg Kurven, auch nach oben und unten, bis die Bahn sich um 270° gedreht hat.', k3: 'MAUS', reward: { credits: 500, xp: 300 } },
  { id: 'sys03', ch: 1, title: 'Vollbremsung', text: 'S bremst. Erst auf Tempo kommen, dann aus voller Fahrt anhalten.', goal: { type: 'brake', fromSpeed: 150 }, key: 'S', t3: '{stopHow} Erst auf Tempo kommen, dann anhalten.', k3: 'brake', reward: { credits: 500, xp: 300 } },
  { id: 'sys04', ch: 1, title: 'Von oben', text: '{camera} schaltet auf die taktische Ansicht. Von oben fliegst du {tacFly}.', goal: { type: 'camera', target: 'tactical' }, key: 'V', k2: 'camera', t3: '{camera} wechselt die Ansicht: erst ins Cockpit, beim zweiten Mal in die taktische Ansicht von oben, den Nebenmodus. Von oben fliegst du {tacFly}.', k3: 'camera', reward: { credits: 500, xp: 300 } },
  { id: 'sys05', ch: 1, title: 'Klick und weg', text: '{tacGo}, den Rest macht der Autopilot. Richtung und Entfernung stehen hier in der Karte.', goal: { type: 'reach', dx: 1200, dz: 600, r: 180 }, key: 'KLICK', k2: 'KLICK', reward: { credits: 800, xp: 400 } },
  { id: 'sys06', ch: 1, title: 'Zurück hinters Schiff', text: '{camera} noch einmal, du sitzt wieder hinter dem Schiff.', goal: { type: 'camera', target: 'chase' }, key: 'V', k2: 'camera', reward: { credits: 500, xp: 300 } },
  { id: 'sys07', ch: 1, title: 'Weiter draußen', text: 'Der nächste Wegpunkt liegt außerhalb der sicheren Zone. Unten rechts auf der Karte siehst du, wo du bist.', goal: { type: 'reach', dx: -1800, dz: -1400, r: 220 }, key: 'KARTE', reward: { credits: 1000, xp: 500 } },
  { id: 'sys08', ch: 2, title: 'Ziel erfassen', text: 'Kontakt. Tab erfasst den nächsten Gegner, ein Klick auf ihn geht auch. Hülle und Schild stehen im Fenster ZIEL.', goal: { type: 'target' }, key: 'TAB', t3: 'Kontakt. {targetHow} Hülle und Schild stehen im Fenster ZIEL.', k3: 'next', reward: { credits: 800, xp: 400 } },
  { id: 'sys09', ch: 2, title: 'Feuer frei', text: 'Strg startet den Angriff, noch einmal stoppt ihn. Ein Doppelklick auf den Gegner geht auch. Die Laser feuern nur, wenn die Nase zum Ziel zeigt.', goal: { type: 'attack' }, key: 'STRG', t3: '{fireHow} Leg das Fadenkreuz auf die Raute vor dem Gegner, das ist der Vorhalt, dann treffen die Bolzen. {autoHint}', k3: 'fire', reward: { credits: 800, xp: 400 } },
  { id: 'sys10', ch: 2, title: 'Erster Abschuss', text: 'Erst fällt der Schild, dann die Hülle. Bring ihn runter.', goal: { type: 'kill', count: 1 }, reward: { credits: 1500, xp: 800, honor: 5 } },
  { id: 'sys11', ch: 2, title: 'Das Rudel', text: 'Raider jagen im Rudel und kommen von mehreren Seiten. Bleib in Bewegung und hol dir drei.', goal: { type: 'kill', target: 'raider', count: 3 }, reward: { credits: 2000, xp: 1000, honor: 10 } },
  { id: 'sys12', ch: 2, title: 'Die Brut', text: 'Larven bewachen die Felder. Wer näher als 300 Meter kommt, wird angesprungen. Räum vier weg.', goal: { type: 'kill', target: 'larva', count: 4 }, reward: { credits: 2000, xp: 1000, tritium: 5, honor: 10 } },
  { id: 'sys13', ch: 3, title: 'Standard', text: 'Taste 1 ist L1: billig, immer an Bord, einfacher Schaden. 20 Treffer.', goal: { type: 'shoot', ammo: 'L1', count: 20 }, key: '1', reward: { credits: 800, xp: 500 } },
  { id: 'sys14', ch: 3, title: 'Doppelt', text: 'Taste 2: L2 macht doppelten Schaden und kostet Credits. 20 Treffer.', goal: { type: 'shoot', ammo: 'L2', count: 20 }, key: '2', reward: { credits: 1000, xp: 600 } },
  { id: 'sys15', ch: 3, title: 'Tritium-Munition', text: 'L3 auf Taste 3, dreifacher Schaden, bezahlt mit Tritium. Nimm sie, wenn es zählt. 15 Treffer.', goal: { type: 'shoot', ammo: 'L3', count: 15 }, key: '3', reward: { credits: 1000, xp: 600, tritium: 15 } },
  { id: 'sys16', ch: 3, title: 'Schwere Ladung', text: 'L4 auf Taste 4, vierfacher Schaden. Teuer, also nur für harte Ziele. 10 Treffer.', goal: { type: 'shoot', ammo: 'L4', count: 10 }, key: '4', reward: { credits: 1000, xp: 700, tritium: 20 } },
  { id: 'sys17', ch: 3, title: 'Schildsauger', text: 'SAB auf Taste 5 trifft nur Schilde und füllt deinen eigenen. 10 Treffer.', goal: { type: 'shoot', ammo: 'SAB', count: 10 }, key: '5', reward: { credits: 1000, xp: 700, tritium: 15 } },
  { id: 'sys18', ch: 3, title: 'Ein Schuss, der sitzt', text: 'Taste 6 feuert SAL: sechsfacher Schaden mit eigener Ladezeit, danach läuft deine Munition weiter. 3 Treffer.', goal: { type: 'shoot', ammo: 'SAL', count: 3 }, key: '6', reward: { credits: 1500, xp: 800, tritium: 20 } },
  { id: 'sys19', ch: 4, title: 'Rakete los', text: 'Leertaste oder R schickt eine R1 aufs Ziel, danach lädt der Werfer 3 Sekunden. Weicht das Ziel aus oder steht ein Brocken dazwischen, geht sie vorbei. 3 Treffer.', goal: { type: 'rocket', rocket: 'R1', count: 3 }, key: 'LEER', t3: '{rocketHow} Danach lädt der Werfer 3 Sekunden. Weicht das Ziel aus oder steht ein Brocken dazwischen, geht sie vorbei. 3 Treffer.', k3: 'rocket', reward: { credits: 1500, xp: 800, honor: 5 } },
  { id: 'sys20', ch: 5, title: 'Arsenal', text: 'Rechts an der Schnellleiste liegt ARSENAL. Dort ist alles, was du an Bord hast. Mach es auf.', goal: { type: 'arsenal' }, key: 'ARSENAL', reward: { credits: 500, xp: 200 } },
  { id: 'sys21', ch: 5, title: 'Zweite Leiste', text: 'Alt+2 schaltet auf Leiste 2. Alt+1 bringt dich zurück.', goal: { type: 'bar', bar: 2 }, key: 'ALT+2', reward: { credits: 500, xp: 300 } },
  { id: 'sys22', ch: 5, title: 'Leiste belegen', text: 'Zieh vier Dinge aus dem Arsenal auf Leiste 2, zum Beispiel R3, SPM, BRM und TRN. Rechtsklick leert einen Platz wieder.', goal: { type: 'place', bar: 2, count: 4 }, key: 'ZIEHEN', reward: { credits: 800, xp: 400 } },
  { id: 'sys23', ch: 5, title: 'Schwere Rakete', text: 'R3 hat den vierfachen Schaden einer R1 und kostet Tritium. Zwei Treffer.', goal: { type: 'rocket', rocket: 'R3', count: 2 }, reward: { credits: 1000, xp: 600, tritium: 15 } },
  { id: 'sys24', ch: 6, title: 'Störfeuer', text: 'EMP stört alles in 700 Metern: Gegner verlieren dich, Getarnte werden sichtbar, Spezialangriffe brechen ab. Zünde ihn mit einem Gegner in Reichweite.', goal: { type: 'extra', id: 'EMP', hits: 1 }, key: 'EMP', reward: { credits: 1000, xp: 600, tritium: 20 } },
  { id: 'sys25', ch: 6, title: 'Sofortschild', text: 'SOS macht dich 3 Sekunden unverwundbar, schießen geht weiter. Setz ihn ein, während dich jemand angreift.', goal: { type: 'extra', id: 'SOS', combat: true }, key: 'SOS', reward: { credits: 1000, xp: 600, tritium: 20 } },
  { id: 'sys26', ch: 6, title: 'Bombe', text: 'Die Bombe trifft alles in 450 Metern. Warte, bis mindestens zwei nah dran sind.', goal: { type: 'extra', id: 'BMB', hits: 2 }, key: 'BMB', reward: { credits: 1500, xp: 800, tritium: 15, honor: 5 } },
  { id: 'sys27', ch: 6, title: 'Sprengmine', text: 'Minen fallen hinter dem Heck und sind nach einer Sekunde scharf. Zieh einen Verfolger drüber.', goal: { type: 'mine', ids: ['SPM'], count: 1 }, key: 'SPM', reward: { credits: 1000, xp: 600 } },
  { id: 'sys28', ch: 6, title: 'Bremsen und Stören', text: 'BRM bremst auf halbes Tempo, STM nimmt 4 Sekunden die Zielerfassung. Lass eine davon zünden.', goal: { type: 'mine', ids: ['BRM', 'STM'], count: 1 }, key: 'BRM', reward: { credits: 1000, xp: 600 } },
  { id: 'sys29', ch: 6, title: 'Aus dem Nichts', text: 'TRN geht erst nach 5 Sekunden ohne Kampf, dein erster Schuss deckt dich auf. Tarn dich und eröffne so den Angriff.', goal: { type: 'extra', id: 'TRN', strike: true }, key: 'TRN', reward: { credits: 1500, xp: 800, tritium: 25 } },
  { id: 'sys30', ch: 7, title: 'Kettenblitz', text: 'ARC springt von Ziel zu Ziel, bis zu fünf. Zünde ihn, wenn mindestens drei Gegner nah beieinander sind.', goal: { type: 'tech', id: 'ARC', hits: 3 }, key: 'ARC', reward: { credits: 2000, xp: 1000, honor: 5 } },
  { id: 'sys31', ch: 7, title: 'Zielsperre', text: 'Mit LCK trifft 15 Sekunden lang jede Rakete, auch ausweichende Ziele. Drei Raketentreffer unter Zielsperre.', goal: { type: 'rocket', lock: true, count: 3 }, key: 'LCK', reward: { credits: 1500, xp: 1000, tritium: 15 } },
  { id: 'sys32', ch: 7, title: 'Energie saugen', text: 'VMP: 10 Sekunden lang heilt ein Teil deines Laserschadens die Hülle. Nimm es mitten im Kampf.', goal: { type: 'tech', id: 'VMP', combat: true }, key: 'VMP', reward: { credits: 1500, xp: 800 } },
  { id: 'sys33', ch: 7, title: 'Reserveschild', text: 'RSV füllt den Schild sofort. Warte, bis er unter 30 Prozent ist.', goal: { type: 'tech', id: 'RSV', shieldBelow: 0.3 }, key: 'RSV', reward: { credits: 1500, xp: 800, tritium: 30 } },
  { id: 'sys34', ch: 8, title: 'Mehr Schild', text: 'Dein Schiff hat drei Konfigurationen. Konfiguration 2 fährt zwei Schildgeneratoren. Schalte um, im Arsenal unter KONFIGURATION.', goal: { type: 'config', n: 2 }, key: 'KONF 2', reward: { credits: 800, xp: 500 } },
  { id: 'sys35', ch: 8, title: 'Mehr Tempo', text: 'Konfiguration 3 fährt zwei Antriebe. Schalte um und flieg 2 Kilometer. Danach zurück auf 1, wenn du kämpfen willst.', goal: { type: 'fly', meters: 2000, config: 3 }, key: 'KONF 3', reward: { credits: 800, xp: 500 } },
  { id: 'sys36', ch: 9, title: 'Wracks', text: 'Jeder Abschuss hinterlässt ein Wrack mit Credits und etwas Tritium. Kurz gehört es nur dir. Flieg über drei.', goal: { type: 'wreck', count: 3 }, reward: { credits: 1000, xp: 600 } },
  { id: 'sys37', ch: 9, title: 'Frachtkisten', text: 'Frachtkisten treiben überall, der Inhalt ist Zufall. Manchmal ist es eine Piratenfalle. Sammle drei.', goal: { type: 'crate', count: 3 }, reward: { credits: 1000, xp: 600, tritium: 10 } },
  { id: 'sys38', ch: 10, title: 'Nickel', text: 'Die grauen Brocken sind Nickel. Flieg dicht ran, dann landet es im Laderaum. 20 Einheiten.', goal: { type: 'ore', ore: 'nickel', count: 20 }, reward: { credits: 1000, xp: 600 } },
  { id: 'sys39', ch: 10, title: 'Cobalt', text: 'Blau ist Cobalt und doppelt so viel wert. 10 Einheiten. Wie viel noch passt, steht im Fenster SCHIFF.', goal: { type: 'ore', ore: 'cobalt', count: 10 }, reward: { credits: 1500, xp: 600 } },
  { id: 'sys40', ch: 11, title: 'Andocken', text: 'Zurück zur Station. In der sicheren Zone dockst du mit E an. Dort heilt die Hülle von selbst.', goal: { type: 'dock' }, key: 'E', t3: 'Zurück zur Station. In der sicheren Zone dockst du mit {context} an. Dort heilt die Hülle von selbst.', k3: 'context', reward: { credits: 800, xp: 400 } },
  { id: 'sys41', ch: 11, title: 'Erz verkaufen', text: 'Reiter ERZ: verkauf deine Ladung.', goal: { type: 'sell' }, key: 'ERZ', reward: { credits: 500, xp: 300 } },
  { id: 'sys42', ch: 11, title: 'Nachschub', text: 'Im Shop gibt es Munition in Packungen. Hol dir eine Packung L2.', goal: { type: 'buy', id: 'L2' }, key: 'SHOP', reward: { credits: 800, xp: 300 } },
  { id: 'sys43', ch: 11, title: 'Ion Laser', text: 'Der Ion Laser macht mehr Schaden als der Pulse Laser. Kauf einen, er kommt auf einen freien oder den schwächsten Platz.', goal: { type: 'buy', id: 'ion' }, key: 'SHOP', reward: { credits: 3000, xp: 1200 } },
  { id: 'sys44', ch: 11, title: 'Umbau', text: 'Im Hangar baust du Laser und Generatoren um: mehr Schild oder mehr Tempo. Bau ein Teil um.', goal: { type: 'equip' }, key: 'HANGAR', reward: { credits: 1000, xp: 600 } },
  { id: 'sys45', ch: 11, title: 'Erste eigene Drohne', text: 'Drohnen fliegen mit dir und tragen je einen Laser oder Schildgenerator. Kauf eine Pioneer.', goal: { type: 'drone' }, key: 'SHOP', reward: { credits: 2000, xp: 800 } },
  { id: 'sys46', ch: 12, title: 'Kampfreparatur', text: 'Abdocken mit E. Fällt die Hülle unter 80 %, setz FIX ein: 10 Sekunden lang 5 % je Sekunde.', goal: { type: 'tech', id: 'FIX', hullBelow: 0.8 }, key: 'FIX', reward: { credits: 1500, xp: 800 } },
  { id: 'sys47', ch: 12, title: 'Ring', text: 'Formationen ordnen deine Drohnen. Ring kreist ums Schiff: mehr Schild, etwas langsamer. Schalte im Arsenal unter FORMATION auf Ring.', goal: { type: 'formation', id: 'ring' }, key: 'ARSENAL', reward: { credits: 800, xp: 500 } },
  { id: 'sys48', ch: 12, title: 'Swarm', text: 'Swarm ist gegen Piraten und Schwarm gebaut. Zerstöre vier Gegner mit Swarm.', goal: { type: 'kill', count: 4, formation: 'swarm' }, reward: { credits: 2000, xp: 1200, honor: 10 } },
  { id: 'sys49', ch: 13, title: 'Hinaus', text: 'Das Tor liegt am anderen Ende des Sektors. Bis auf 150 Meter ran, dann J. Drüben wird es härter.', goal: { type: 'jump', sector: 2 }, key: 'J', reward: { credits: 3000, xp: 1500 } },
  { id: 'sys50', ch: 14, title: 'Schakale', text: 'Jackals lauern getarnt und springen an, wenn du unter 70 % fällst. EMP holt sie raus. Zerstöre drei.', goal: { type: 'kill', target: 'jackal', count: 3 }, reward: { credits: 4000, xp: 2500, tritium: 20, honor: 15 } },
  { id: 'sys51', ch: 14, title: 'Salve', text: 'Leuchtet ein Gegner auf, lädt er einen Spezialangriff, die Bahn liegt am Boden. Kurs oder Tempo ändern, und die Salve geht vorbei. Zweimal.', goal: { type: 'dodge', kind: 'volley', count: 2 }, t3: 'Leuchtet ein Gegner auf, lädt er einen Spezialangriff, die Bahn leuchtet im Raum. Kurs, Höhe oder Tempo ändern, und die Salve geht vorbei. Zweimal.', reward: { credits: 2000, xp: 1500, honor: 10 } },
  { id: 'sys52', ch: 14, title: 'Rammangriff', text: 'Jackals rammen in gerader Linie. Raus zur Seite, sobald die Bahn erscheint.', goal: { type: 'dodge', kind: 'ram', count: 1 }, t3: 'Jackals rammen in gerader Linie. Raus zur Seite, nach oben oder unten, sobald die Bahn erscheint.', reward: { credits: 2000, xp: 1500, honor: 10 } },
  { id: 'sys53', ch: 14, title: 'Abgebrochen', text: 'Eine Rakete oder ein schwerer Treffer bricht das Aufladen ab. Stopp einen Angriff, bevor er kommt.', goal: { type: 'interrupt', count: 1 }, key: 'R', reward: { credits: 2500, xp: 1500, tritium: 10, honor: 10 } },
  { id: 'sys54', ch: 14, title: 'Tiefer', text: 'Weiter durch das zweite Tor. In Sektor 3 fliegt alles ab Stufe 6, bleib erst mal nah am Tor.', goal: { type: 'jump', sector: 3 }, key: 'J', reward: { credits: 3000, xp: 2000 } },
  { id: 'sys55', ch: 14, title: 'Säure', text: 'Spiker spucken Säure aus der Ferne. Raus aus dem grünen Kreis, bevor er sich schließt.', goal: { type: 'dodge', kind: 'acid', count: 1 }, reward: { credits: 2000, xp: 1500, honor: 10 } },
  { id: 'sys56', ch: 14, title: 'Spiker', text: 'Spiker halten Abstand und heilen hinter Asteroiden. Zerstöre zwei.', goal: { type: 'kill', target: 'spiker', count: 2 }, reward: { credits: 5000, xp: 3500, tritium: 30, honor: 20 } },
  { id: 'sys57', ch: 14, title: 'Plünderer', text: 'Vultures klauen Wracks, auch deine, und ziehen einen Schildwall hoch. Schnapp dir einen, bevor er abhaut.', goal: { type: 'kill', target: 'vulture', count: 1 }, reward: { credits: 5000, xp: 3500, tritium: 30, honor: 20 } },
  { id: 'sys58', ch: 14, title: 'Heimsprung', text: 'JMP bringt dich nach 8 Sekunden Ladezeit nach Hause, ganz ohne Tor. Leg JMP aus dem Arsenal auf die Leiste und spring.', goal: { type: 'extra', id: 'JMP', arrive: true }, key: 'JMP', reward: { credits: 1500, xp: 800, tritium: 25 } },
  { id: 'sys59', ch: 15, title: 'Elite', text: 'Ein Elite Raider ist in deiner Nähe gemeldet: dreimal so viel Leben, Schaden und Beute. Zerstöre ihn.', goal: { type: 'kill', rank: 'elite', count: 1 }, spawn: { type: 'raider', rank: 'elite', dist: 1500 }, reward: { credits: 4000, xp: 2500, tritium: 30, honor: 25 } },
  { id: 'sys60', ch: 15, title: 'Alpha', text: 'Alpha-Kontakt. Zehnfache Stärke und eine Sonderfähigkeit, lies sie im Fenster ZIEL, bevor du angreifst.', goal: { type: 'kill', rank: 'alpha', count: 1 }, spawn: { type: 'raider', rank: 'alpha', perk: 'summon', dist: 2000 }, reward: { credits: 8000, xp: 5000, tritium: 75, honor: 50 } },
  { id: 'sys61', ch: 16, title: 'Konvoi', text: 'Ein Frachter wird angegriffen. Halt ihn am Leben, das bringt Ehre.', goal: { type: 'event', target: 'convoy' }, reward: { credits: 3000, xp: 2000, tritium: 15, honor: 20 } },
  { id: 'sys62', ch: 16, title: 'Serie', text: 'Abschüsse kurz hintereinander geben Bonus auf Erfahrung, Ehre und Credits. Hol dir eine Serie von drei.', goal: { type: 'combo', count: 3 }, reward: { credits: 1500, xp: 1200, honor: 10 } },
  { id: 'sys63', ch: 16, title: 'Rang', text: 'Aus Ehre und Erfahrung werden Rangpunkte. Öffne PILOT und sieh nach, wo du stehst.', goal: { type: 'window', target: ['pilot'] }, key: 'PILOT', reward: { credits: 500, xp: 300 } },
  { id: 'sys64', ch: 17, title: 'Pilotenakte', text: 'Esc, dann ZUM HUB. In der Pilotenakte steht alles über dich.', goal: { type: 'window', target: ['hub:akte'] }, key: 'ESC', reward: { credits: 800, xp: 400 } },
  { id: 'sys65', ch: 17, title: 'Ruhmeshalle', text: 'Die Ruhmeshalle zeigt die Besten deiner Fraktion, nach Ehre, Erfahrung und mehr. Such deinen Platz.', goal: { type: 'window', target: ['hub:ruhm'] }, reward: { credits: 800, xp: 400 } },
  { id: 'sys66', ch: 17, title: 'Clan', text: 'Clans verbinden Piloten aus allen drei Fraktionen. Gründen und Beitreten geht ab Stufe 10, schau schon mal rein.', goal: { type: 'window', target: ['hub:clan'] }, reward: { credits: 800, xp: 400 } },
  { id: 'sys67', ch: 17, title: 'Funkprotokoll', text: 'Im Funkprotokoll steht jede Meldung, die du bekommen hast. Lies nach: im Hub unter FUNK oder im Flug im Fenster FUNK.', goal: { type: 'window', target: ['hub:funk', 'comms'] }, reward: { credits: 500, xp: 300 } },
  { id: 'sys68', ch: 17, title: 'Cockpit einstellen', text: 'Stell dir das Cockpit ein: Kamera, Kamerawackeln, Balken oder genaue Werte. Ändere eine Einstellung.', goal: { type: 'setting' }, reward: { credits: 800, xp: 400 } },
  { id: 'sys69', ch: 18, title: 'Signal steht', text: 'Ausbildung abgeschlossen, ab hier fliegst du deine eigenen Wege. Erreiche Stufe 5, dann wartet Schiff 2 im Shop.', goal: { type: 'level', level: 5 }, reward: { credits: 5000, tritium: 150, honor: 30 } },
];

const fmt = (n) => Math.round(n).toLocaleString('de-DE');

/**
 * Text und Tastenschild eines Auftrags je Ansicht (Planung/FLUGMODELL.md 5.1): im 3D-Flug gilt t3/k3, Tastennamen
 * kommen aus input/bindings.js ({fwd}, {fire} … werden ersetzt, k3 ist eine Aktion oder ein fester Text).
 */
export function questView(q, flight3d, keyName) {
  if (!q) return { text: '', key: '' };
  // keyName(action, mode): Name je Gerät (Tastatur, Controller, Touch); {aktion} in text (Taktik) und t3 (3D-Flug)
  const fill = (t, mode) => (keyName && t ? t.replace(/\{(\w+)\}/g, (m, a) => keyName(a, mode)) : t);
  if (!flight3d || !q.t3) {
    const k = q.key || '';
    return { text: fill(q.text, 'tactic'), key: keyName && q.k2 ? keyName(q.k2, 'tactic') : k, act: q.k2 || '' };
  }
  const text = fill(q.t3, 'flight');
  const k = q.k3 || q.key || '';
  const act = /^[a-z]/.test(k) || k === 'MAUS' ? k : '';
  const key = keyName && act ? keyName(k, 'flight') : k;
  return { text, key, act };
}

export class SystemSeries {
  // cameraMode: Funktion, die 'chase' oder 'tactical' liefert (Grafik), damit die Simulation die Ansicht nicht kennt
  // opts: quests/chapters (eigene Reihe, z. B. Storykapitel), key (Stand in profile[key]), label (Funkzeile, Karte),
  //       mode (Startmodus für neue Stände, z. B. 'guided' ohne Wahl)
  constructor(world, bus, cameraMode = () => 'chase', opts = {}) {
    this.quests = opts.quests || SYSTEM_QUESTS;
    this.chapters = opts.chapters || SYSTEM_CHAPTERS;
    this.key = opts.key || 'system';
    this.label = opts.label || 'SYSTEM';
    this.world = world;
    this.bus = bus;
    this.cameraMode = cameraMode;
    this._brakeArmed = false;
    this._spawned = null; this._pend = null; this._jmpArmed = false;
    const pr = world.profile;
    if (!pr[this.key] || typeof pr[this.key] !== 'object') pr[this.key] = { mode: opts.mode || null, idx: 0, progress: 0, done: [], skipped: [] };
    const s = pr[this.key];
    if (!Array.isArray(s.done)) s.done = [];
    if (!Array.isArray(s.skipped)) s.skipped = [];
    s.idx = Math.max(0, Math.min(this.quests.length, s.idx | 0));
    // Erfahrene Spielstände: Reihe liegt bereit, führt aber nicht von selbst
    if (s.mode == null && ((pr.level || 1) > 1 || (pr.xp || 0) > 0)) s.mode = opts.mode || 'direct';
    this.offs = [
      bus.on('explode', (p) => {
        const e = world.entities.get(p.id);
        if (e && e.kind === 'enemy') this._count('kill', e.type, 1, e);
      }),
      bus.on('shot', (p) => {
        if (!p.hit || p.drone || !world.player || p.from !== world.player.id) return;
        this._count('shoot', p.ammo, 1);
      }),
      bus.on('rocketHit', (p) => {
        const q = this.current;
        if (q && q.goal.type === 'rocket' && q.goal.lock) { if (world.abilities?.LCK?.activeFor > 0) this._count('rocket', null, 1); }
        else this._count('rocket', p.rocket, 1);
      }),
      bus.on('docked', () => this._count('dock', null, 1)),
      // Wrack: Beute mit Credits ohne Erfahrung/Erz/Munition (Auftragsbelohnungen tragen Erfahrung)
      bus.on('loot', (p) => { if (p && p.credits > 0 && !p.xp && !p.ore && !p.ammo) this._count('wreck', null, 1); }),
      bus.on('ability', (a) => this._ability(a)),
      bus.on('formation', (f) => this._count('formation', f.id, 1)),
      bus.on('combo', (c) => { if (!c.ended) this._count('combo', null, c.count); }),
      bus.on('special', (sp) => this._special(sp)),
      bus.on('damage', (d) => { if (d.id === 'player' && d.special && this._pend && d.special === this._pend.kind) this._pend.hit = true; }),
      bus.on('sector', () => { if (this._jmpArmed) { this._jmpArmed = false; const g = this.current?.goal; if (g && g.type === 'extra' && g.arrive && this.state.mode === 'guided') this._add(1, 1); } }),
    ];
    // Oberfläche (HUD-Fenster, Einstellungen) meldet sich über Fensterereignisse; im Hub schreibt der Hub direkt in state.seen
    const onUi = (ev) => this.mark(ev.detail?.target);
    const onSet = () => this.mark('setting');
    const onSys = (ev) => { const a = ev.detail?.act; if (a === 'guide') this.choose('guided'); else if (a === 'direct') this.choose('direct'); else if (a === 'restart') this.restart(); };
    if (typeof window !== 'undefined' && this.key === 'system') {
      window.addEventListener('ls:quest', onUi); window.addEventListener('ls:settings', onSet); window.addEventListener('ls:system', onSys);
      this.offs.push(() => { window.removeEventListener('ls:quest', onUi); window.removeEventListener('ls:settings', onSet); window.removeEventListener('ls:system', onSys); });
    }
    this._config = 1;
    this._wrap(world);
  }

  // Spielaktionen ohne eigenes Ereignis: Weltfunktionen schlank umhüllen (nur Erfolg zählt)
  _wrap(world) {
    const ok = (r) => r && (typeof r === 'object' ? r.ok !== false : r !== false && r !== 0);
    const qp = world._questProgress.bind(world);
    world._questProgress = (t, target, n, ctx) => {
      qp(t, target, n, ctx);
      if (t === 'crate') this._count('crate', null, n || 1);
      if (t === 'ore' || t === 'jump' || t === 'event') this._count(t, target, n || 1);
    };
    const extra = world.useExtra.bind(world);
    world.useExtra = (id, arg) => { const r = extra(id, arg); if (r && id === 'JMP') this._jmpArmed = true; return r; };
    const buy = world.buy.bind(world);
    world.buy = (kind, id, n) => { const r = buy(kind, id, n); if (ok(r)) { this._count('buy', id, 1); if (kind === 'drone') this._count('drone', null, 1); } return r; };
    const sell = world.sellOre.bind(world);
    world.sellOre = () => { const r = sell(); if (r > 0) this._count('sell', null, 1); return r; };
    const equip = world.equip.bind(world);
    world.equip = (...a) => { const r = equip(...a); if (ok(r)) this._count('equip', null, 1); return r; };
    const cfg = world.setConfig.bind(world);
    world.setConfig = (n) => { const r = cfg(n); if (ok(r)) { this._config = n; this._count('config', n, 1); } return r; };
  }

  get state() { return this.world.profile[this.key]; }
  get current() { return this.quests[this.state.idx] || null; }
  get finished() { return this.state.idx >= this.quests.length; }
  get active() { return this.state.mode === 'guided' && !this.finished; }

  choose(mode) { this.state.mode = mode; this.world.save?.(); this.bus.emit('system', { kind: 'mode', mode }); }

  // Ziel des aktuellen Wegpunkts (Weltkoordinaten), sonst null
  waypoint() {
    const q = this.current, st = this.world.sector?.station;
    if (!q || q.goal.type !== 'reach' || !st) return null;
    return { x: st.x + q.goal.dx, z: st.z + q.goal.dz, r: q.goal.r };
  }

  update(dt) {
    const q = this.current;
    if (!q || this.state.mode !== 'guided') return;
    const w = this.world, p = w.player, g = q.goal;
    if (p && p.shieldMax) this._shieldFrac = (p.shield || 0) / p.shieldMax;
    if (p && p.hpMax) this._hullFrac = (p.hp || 0) / p.hpMax;
    const seen = this.state.seen || [];
    if (g.type === 'level' && (w.profile.level || 1) >= g.level) { this._add(1, 1); return; }
    if (g.type === 'window' && g.target.some((t) => seen.includes(t))) { this._add(1, 1); return; }
    if (g.type === 'setting' && seen.includes('setting')) { this._add(1, 1); return; }
    if (!p || w.docked || w.playerDead) return;
    this._t = (this._t || 0) + dt;
    if (g.type === 'jump' && (w.sector?.index || 1) >= g.sector) { this._add(1, 1); return; }
    if (q.spawn) this._spawnFor(q);
    if (g.type === 'event' && this._evQuest !== q.id && this._t > (this._evRetry || 0)) {
      if (w.startEvent(g.target)) this._evQuest = q.id; else this._evRetry = this._t + 5;
    }
    if (this._pend && this._t > this._pend.until) { const ok = !this._pend.hit; this._pend = null; if (ok && g.type === 'dodge') this._add(1, g.count); }
    const speed = p.speed || Math.hypot(p.vx || 0, p.vz || 0);
    switch (g.type) {
      case 'fly':
        if (g.camera && this.cameraMode() !== g.camera) return;
        if (g.config && this._config !== g.config) return;
        if (g.turn && w.flight3d) {
          // 3D-Flug (Runde 3): „weite Kurve“ heißt wirklich kurven – gezählt wird die Drehung der Flugbahn in Grad
          // (vorher reichten 1.500 m geradeaus mit W, ohne die Maus zu bewegen)
          const vx = p.vx || 0, vy = p.vy || 0, vz = p.vz || 0, v = Math.hypot(vx, vy, vz), l = this._lastV;
          if (v > 40 && l) { const c = (vx * l[0] + vy * l[1] + vz * l[2]) / v; this._add(Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI, g.turn); }
          this._lastV = v > 40 ? [vx / v, vy / v, vz / v] : null;
          break;
        }
        this._add(speed * dt, g.meters);
        break;
      case 'brake':
        if (speed >= g.fromSpeed) this._brakeArmed = true;
        if (this._brakeArmed && speed < 6) this._add(1, 1);
        break;
      case 'camera': if (this.cameraMode() === g.target) this._add(1, 1); break;
      case 'reach': {
        const wp = this.waypoint();
        if (wp && Math.hypot(p.x - wp.x, p.z - wp.z) < wp.r) this._add(1, 1);
        break;
      }
      case 'target': if (p.targetId) this._add(1, 1); break;
      case 'attack': if ((p.attacking || (w.flight3d && w.aimInfo && w.aimInfo.fire)) && p.targetId) this._add(1, 1); break;
      default: break;
    }
  }

  _ability(a) {
    const q = this.current;
    if (!q || this.state.mode !== 'guided') return;
    const g = q.goal;
    if (g.type === 'mine' && a.kind === 'mine' && a.phase === 'fire' && g.ids.includes(a.id)) this._add(1, g.count);
    if (g.type === 'tech' && a.kind === 'tech' && a.id === g.id) {
      if (g.hits && a.phase === 'fire' && (a.hits || 0) >= g.hits) this._add(1, 1);
      else if (g.combat && a.phase === 'use' && this._underAttack()) this._add(1, 1);
      else if (g.shieldBelow && a.phase === 'use' && (this._shieldFrac ?? 1) < g.shieldBelow) this._add(1, 1);
      else if (g.hullBelow && a.phase === 'use' && (this._hullFrac ?? 1) < g.hullBelow) this._add(1, 1);
      return;
    }
    if (g.type !== 'extra' || a.id !== g.id) return;
    if (g.hits && a.phase === 'fire' && (a.hits || 0) >= g.hits) this._add(1, 1);
    else if (g.combat && a.phase === 'use' && this._underAttack()) this._add(1, 1);
    else if (g.strike && a.phase === 'end' && a.reason === 'Angriff') this._add(1, 1);
  }

  // Spezialangriff eines Gegners auf den Spieler: abgebrochen zählt für interrupt, ausgeführt und ohne Treffer für dodge
  _special(sp) {
    const q = this.current, w = this.world, p = w.player;
    if (!q || this.state.mode !== 'guided' || sp.own || !p) return;
    const e = w.entities.get(sp.id);
    if (!e || e.kind !== 'enemy' || (e.targetId && e.targetId !== p.id)) return;
    if (sp.cancelled) { this._count('interrupt', null, 1); return; }
    if (q.goal.type === 'dodge' && sp.kind === q.goal.kind && !this._pend) this._pend = { kind: sp.kind, hit: false, until: (this._t || 0) + Math.max(0.6, sp.duration || 0) + 0.6 };
  }

  // Quest-Gegner (Elite/Alpha) in Reichweite bereitstellen; verschwindet er (Sektorwechsel), kommt ein neuer
  _spawnFor(q) {
    const w = this.world, p = w.player, sp = q.spawn;
    if (this._spawned && w.entities.has(this._spawned)) return;
    if (this._t < (this._spawnAt || 0)) return;
    this._spawnAt = this._t + 3;
    const a = Math.random() * Math.PI * 2;
    const e = w.spawnTemp(sp.type, p.x + Math.cos(a) * sp.dist, p.z + Math.sin(a) * sp.dist);
    w.applyRank(e, sp.rank, sp.perk || null);
    if (sp.rank === 'alpha') e.perk = sp.perk || e.perk;
    this._spawned = e.id;
    w._msg?.(`SYSTEM · ${e.name} gemeldet, ${Math.round(sp.dist)} m entfernt.`, 'warn');
  }

  // Oberflächen-Signal (Fenster geöffnet, Hub-Bereich, Einstellung) merken; zählt sofort oder beim nächsten Flug
  mark(tag) {
    if (!tag) return;
    const s = this.state;
    if (!Array.isArray(s.seen)) s.seen = [];
    if (!s.seen.includes(tag)) s.seen.push(tag);
  }

  _underAttack() {
    const p = this.world.player;
    for (const e of this.world.entities.values()) if (e.kind === 'enemy' && e.alive !== false && e.attacking && e.targetId === p.id) return true;
    return false;
  }

  // Zustand der Oberfläche (Arsenal offen, aktive Leiste, belegte Plätze je Leiste), gemeldet von der HUD-Schicht
  reportUi(ui) {
    const q = this.current;
    if (!q || this.state.mode !== 'guided') return;
    const g = q.goal;
    if (g.type === 'arsenal' && ui.arsenalOpen) this._add(1, 1);
    else if (g.type === 'bar' && ui.bar === g.bar) this._add(1, 1);
    else if (g.type === 'place') {
      const n = ui.filled[g.bar - 1] || 0;
      if (this._placeBase == null || this._placeQuest !== q.id) { this._placeBase = n; this._placeQuest = q.id; }
      const got = Math.max(0, n - this._placeBase);
      if (got > (this.state.progress || 0)) this._add(got - (this.state.progress || 0), g.count);
    }
  }

  _count(type, what, n, ent = null) {
    const q = this.current;
    if (!q || this.state.mode !== 'guided' || q.goal.type !== type) return;
    const g = q.goal;
    if (type === 'kill' && g.target && g.target !== what) return;
    if (type === 'kill' && g.rank && (!ent || ent.rank !== g.rank)) return;
    if (type === 'kill' && g.formation && this.world.formation !== g.formation) return;
    if (type === 'jump' && what < g.sector) return;
    if (type === 'event' && g.target !== what) return;
    if (type === 'formation' && g.id !== what) return;
    if (type === 'combo') { if (n >= g.count) this._add(1, 1); return; }
    if (type === 'shoot' && g.ammo !== what) return;
    if (type === 'rocket' && !g.lock && g.rocket !== what) return;
    if (type === 'ore' && g.ore !== what) return;
    if (type === 'buy' && g.id !== what) return;
    if (type === 'config' && g.n !== what) return;
    // Einmalige Handlungen (Andocken, Verkaufen, Kaufen, Umbau, Drohne, Konfiguration): erledigt beim ersten Mal
    if (['dock', 'sell', 'equip', 'drone', 'config', 'buy', 'jump', 'event', 'formation'].includes(type)) { this._add(1, 1); return; }
    this._add(n, g.count);
  }


  _add(n, max) {
    const s = this.state;
    s.progress = Math.min(max, (s.progress || 0) + n);
    this.bus.emit('system', { kind: 'progress', quest: this.current, progress: s.progress, max });
    if (s.progress >= max) this._complete();
  }

  _complete() {
    const w = this.world, pr = w.profile, q = this.current, r = q.reward || {};
    const parts = [];
    if (r.credits) { pr.credits += r.credits; parts.push(`${fmt(r.credits)} Credits`); }
    if (r.tritium) { pr.tritium += r.tritium; parts.push(`${fmt(r.tritium)} Tritium`); }
    if (r.honor) { pr.honor += r.honor; parts.push(`${fmt(r.honor)} Ehre`); }
    if (r.xp) parts.push(`${fmt(r.xp)} Erfahrung`);
    if (r.xp && w._addXp) w._addXp(r.xp);
    this.state.done.push(q.id);
    this._next();
    w._msg?.(`${this.label} · ${q.title} erledigt. ${parts.join(', ')}.`, 'quest');
    if (q.after) w._msg?.(q.after, 'info');
    w._emitProfile?.();
    w.save?.();
    this.bus.emit('system', { kind: 'done', quest: q });
  }

  skip() {
    const q = this.current;
    if (!q) return;
    this.state.skipped.push(q.id); // übersprungen: ohne Belohnung (Entscheidung offen, siehe Vault)
    this._next();
    this.world.save?.();
    this.bus.emit('system', { kind: 'skip', quest: q });
  }

  // Ganze Reihe von vorn (über die Hilfe); Belohnungen gibt es nur einmal je Quest
  restart() {
    Object.assign(this.state, { idx: -1, progress: 0, mode: 'guided' });
    this._next();
    this.bus.emit('system', { kind: 'restart' });
  }

  _next() {
    const s = this.state;
    s.idx++;
    s.progress = 0;
    this._brakeArmed = false;
    // Bereits erledigte Quests (nach Neustart der Reihe) überspringen, damit es keine doppelten Belohnungen gibt
    while (s.idx < this.quests.length && s.done.includes(this.quests[s.idx].id)) s.idx++;
  }

  dispose() { for (const off of this.offs) off(); }
}
