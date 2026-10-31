// Feste Regelwerte der Simulation, die (noch) nicht in data.js stehen.
// Alles in Metern, Sekunden, Anteilen (0.05 = 5 %).

export const STEP = 1 / 60;               // feste Schrittweite
export const MAX_STEPS_PER_UPDATE = 8;    // nach Rucklern nicht endlos nachrechnen

// Spieler
export const PLAYER_RADIUS = 20;
// Trägheit: Schub fährt weich hoch (Spool), Beschleunigung läuft oben sanft aus → ca. 3,5 s von 0 auf Höchsttempo.
export const PLAYER_SPOOL = 1.8;          // wie schnell der Schub dem Steuerbefehl folgt (1/s)
export const PLAYER_ACCEL = 0.45;         // × Höchsttempo pro Sekunde bei vollem Schub
export const PLAYER_ACCEL_TAPER = 0.35;   // im obersten Drittel des Tempos läuft die Beschleunigung weich aus
export const PLAYER_BRAKE = 0.9;          // × Höchsttempo pro Sekunde beim Bremsen (≈ 1,8 s bis Stillstand, unten weich)
export const PLAYER_TURN = 2.6;           // Drehrate in Radiant/s im Stand …
export const PLAYER_TURN_FAST = 1.5;      // … und bei Höchsttempo (Kurven fliegen statt auf der Stelle drehen)
export const PLAYER_GRIP = 3.5;           // wie schnell die Flugrichtung der Nase folgt (leichtes Driften)
export const ARRIVE_SNAP = 25;            // so nah am Ziel wird der Flugbefehl beendet (dann weich ausrollen)

// Kampf
export const PLAYER_RANGE = 650;
export const HIT_CHANCE = 0.85;
export const DAMAGE_SPREAD = 0.1;         // Zufall 0.9 – 1.1
export const SHIELD_ABSORB = 0.8;         // Schild fängt 80 % ab, solange vorhanden
export const LASER_INTERVAL = 1.0;        // ein Schuss pro Sekunde und Laser
export const LASER_STAGGER = 0.12;        // Laser leicht versetzt
export const LASER_JITTER = 0.06;         // ± 6 % Zufall je Schuss, damit Salven nie im Gleichtakt laufen
export const SAL_STAGGER = 0.07;          // SAL-Salve: Laser feuern nacheinander im Abstand von 70 ms
export const HIT_KNOCK = 70;              // Stoß bei Treffer in m/s (bei großem Schaden relativ zum Leben)
export const STAGGER_DECAY = 2.5;         // Taumeln klingt pro Sekunde so stark ab
export const DODGE_CHANCE = 0.22;         // Gegner weicht nach Treffer seitlich aus
export const DODGE_COOLDOWN = [2.5, 4.5];
export const ROCKET_RANGE = 650;
export const ROCKET_FLIGHT = 0.6;         // Treffer nach 0,6 s
export const COMBAT_TIMEOUT = 5;          // so lange gilt man nach Kampfhandlung als „im Kampf“
export const SHIELD_REGEN_DELAY = 5;
export const SHIELD_REGEN = 0.05;         // 5 % pro Sekunde
export const SAFE_HULL_REGEN = 0.02;      // 2 % pro Sekunde in der sicheren Zone
export const OUT_OF_MAP_DAMAGE = 0.02;    // 2 % Leben pro Sekunde
export const INVULN_AFTER_REPAIR = 5;

// Orte
export const SAFE_RADIUS = 400;
export const PORTAL_RADIUS = 150;
export const JUMP_TIME = 3;
export const JUMP_ARRIVE_OFFSET = 120;
export const SPAWN_MIN_STATION = 1200;
export const SPAWN_MIN_PORTAL = 700;
export const ITEM_MIN_STATION = 600;
export const GROUP_MIN_DIST = 1100;       // Mindestabstand zwischen Rudel-Mittelpunkten (Poisson-Verteilung)
export const LONER_SHARE = 0.2;           // Anteil Einzelgänger bei Rudel-Typen
export const PACK_SIZE = [2, 4];
export const RESPAWN_MIN_PLAYER = 1800;   // Gegner erscheinen nie in Sichtweite neu
export const ROUTE_SPREAD = 1000;         // so weit neben der Route liegen Piraten-Rudel
export const ROCK_PER_M = 1 / 125;        // große Brocken je Meter Feldradius
export const ROCK_RADIUS = [40, 150];
export const ORE_IN_FIELDS = 0.6;         // Anteil Erz, das in Asteroidenfeldern liegt

// Beute
export const WRECK_PICKUP = 40;
export const WRECK_PROTECT = 10;
export const WRECK_LIFETIME = 60;
export const WRECK_STEAL_GRACE = 25;       // Diebe: so viele Sekunden nach Ende des Beuteschutzes, solange der Spieler nah ist
export const WRECK_STEAL_PLAYER_DIST = 800; // Spieler weiter weg: Diebe dürfen gleich nach dem Beuteschutz
export const RANGE_MSG_REPEAT = 5;        // „Ziel zu weit weg“: je Ziel einmal, bei erneutem Tastendruck höchstens alle 5 s
export const CRATE_PICKUP = 35;
export const CRATE_RESPAWN = 30;
export const ORE_PICKUP = 35;
export const ORE_RESPAWN = 45;
export const ORE_CHUNK = [5, 12];

// Gegner
export const ENEMY_RESPAWN = [25, 45];
export const PACK_RADIUS = 700;
export const FLEE_HP = 0.15;
export const FLEE_DONE_DIST = 1300;
export const ORBIT_FACTOR = 0.7;          // kreist auf ~70 % der eigenen Reichweite
export const LEASH_PROVOKED = 1700;       // so weit wird ein angegriffener Gegner verfolgen
export const WANDER_RADIUS = 900;         // Wegpunkte von Einzelgängern im freien Raum
export const WANDER_SPEED = 0.4;
export const ENEMY_STEER = 2.2;           // wie schnell Gegner ihre Geschwindigkeit anpassen (1/s) …
export const ENEMY_ACCEL = 1.0;           // … höchstens × Tempo pro Sekunde (Trägheit, ca. 1 s auf Höchsttempo)
export const ENEMY_TURN = 3.0;
export const SEP_QUERY = 160;             // Suchradius für Abstand zu anderen Gegnern
export const SEP_GAP = 40;                // Mindestlücke zusätzlich zu 1,6 × Radien
export const FORMATION_GAP = 2.4;         // Formationsabstand in Gegner-Radien
export const THINK_INTERVAL = 0.25;       // KI denkt 4× pro Sekunde (versetzt)
export const THIEF_RANGE = 1600;
export const TRAP_COUNT = 3;
export const ELITE_NOTICE = 1400;         // so nah wird ein Elite-/Alpha-Gegner im Funk gemeldet

// Kampf-Regie (ai.js directCombat): wenige aktive Angreifer, die anderen warten im Kreis
export const ATTACK_BUDGET = [3, 4];      // höchstens so viele aktive Angreifer (Spieler unter / über 50 % Leben+Schild)
export const TOKEN_ROTATE = 14;           // nach so vielen Sekunden macht ein Angreifer Platz für einen wartenden
export const HOLD_RING = 650;             // Mindestradius des Warterings (m)
export const RING_SPIN = 0.22;            // so schnell dreht sich der Angreiferring um den Spieler (rad/s)
export const SPECIAL_GAP = 1.4;           // zwischen zwei Spezialangriffen (ganzer Sektor) mindestens so viele Sekunden
export const DASH_ACCEL = 2.9;            // Beschleunigung beim Ramm-/Sprungangriff (× Tempo pro Sekunde)
export const JINK_TIME = 0.55;            // Ausweichmanöver: so lange seitlich wegziehen
export const JINK_HIT = 0.6;              // Trefferchance des Spielers auf einen ausweichenden Gegner
export const RETREAT_MAX = 14;            // Rückzug dauert höchstens so lange
export const RETREAT_HEAL_TO = 0.5;       // beim Rückzug heilt die Hülle bis höchstens 50 %
export const RETREAT_SHIELD_REGEN = 0.08; // 8 % Schild je Sekunde in Sicherheit (Deckung oder > 900 m)
export const RETREAT_HULL_REGEN = 0.03;   // 3 % Hülle je Sekunde in Sicherheit
export const CALL_RANGE = 2600;           // Verstärkung: ruhiges Rudel derselben Gruppe in diesem Umkreis
export const CALL_COOLDOWN = 45;          // je Rudel höchstens alle 45 s
export const CALL_GAP = 25;               // im Sektor höchstens alle 25 s ein Hilferuf
export const AMBUSH_RANGE = 1300;         // Jackal: lauert getarnt, wenn du so nah bist …
export const AMBUSH_LEASH = 2400;         // … aber höchstens so weit von seinem Revier weg
export const AMBUSH_DIST = 600;           // Abstand beim Belauern
export const COVER_SEARCH = 1100;         // Deckung: Asteroiden in diesem Umkreis
export const LASER_ARC = 1.3;             // Spieler-Laser feuern nur, wenn das Ziel höchstens ~75° neben der Nase liegt

// Fluggefühl (Anzeige-Felder bank/pitch des Spielers)
export const BANK_MAX = 0.52;             // Schräglage höchstens 30°
export const PITCH_MAX = 0.12;            // Nicken höchstens ~7°
export const AIM_TURN = 0.9;              // im Angriff dreht die Nase mit 90 % der Drehrate zum Ziel
export const STRAFE_MIN = 0.72;           // Seit-/Rückwärtsflug im Angriff mit mindestens 72 % Tempo

// Ereignisse
export const EVENT_SPAWN_DIST = [1500, 3000]; // Abstand des Ereignisorts zum Spieler
export const EVENT_CLEANUP_DIST = 1500;   // übrig gebliebene Ereignis-Gegner verschwinden außer Sicht

// Speicher
export const AUTOSAVE_INTERVAL = 30;
export const PROFILE_EVENT_MIN = 0.5;     // 'profile' wegen Munitionsverbrauch höchstens 2× pro Sekunde
