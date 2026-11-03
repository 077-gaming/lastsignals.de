// Eine Versionsnummer für alle App-Pakete: Apps/package.json ("version") ist die Quelle.
// Dieses Skript überträgt sie auf iOS (MARKETING_VERSION, CURRENT_PROJECT_VERSION), Android (versionName, versionCode)
// und package-lock.json. Mac und Windows lesen package.json beim Packen selbst.
//   node version.mjs            → angleichen (bauen.sh ruft das zuerst auf)
//   node version.mjs --pruefen  → nur prüfen, bei Abweichung Exit 1 (ändert nichts)
//   node version.mjs --zeigen   → nur die Versionsnummer ausgeben
// Versionscode/Build-Nummer: major*10000 + minor*100 + patch (0.9.0 → 900, 1.2.3 → 10203), steigt mit jeder Version.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APPS = path.dirname(fileURLToPath(import.meta.url));
const pkgFile = path.join(APPS, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
if (!m) { console.error(`Ungültige Version in package.json: ${pkg.version} (erwartet x.y.z)`); process.exit(2); }
const VERSION = pkg.version;
const BUILD = Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
if (process.argv.includes('--zeigen')) { console.log(VERSION); process.exit(0); }
const NUR_PRUEFEN = process.argv.includes('--pruefen');

const ziele = [
  { datei: 'ios/App/App.xcodeproj/project.pbxproj', ersetze: [[/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${VERSION};`], [/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${BUILD};`]] },
  { datei: 'android/app/build.gradle', ersetze: [[/versionCode \d+/, `versionCode ${BUILD}`], [/versionName "[^"]+"/, `versionName "${VERSION}"`]] },
];
let abweichung = 0;
for (const z of ziele) {
  const p = path.join(APPS, z.datei);
  let s = fs.readFileSync(p, 'utf8');
  const alt = s;
  for (const [re, neu] of z.ersetze) {
    if (!re.test(s)) { console.error(`Muster fehlt in ${z.datei}: ${re}`); process.exit(2); }
    re.lastIndex = 0;
    s = s.replace(re, neu);
  }
  if (s !== alt) { abweichung++; console.log(`${NUR_PRUEFEN ? 'weicht ab' : 'angepasst'}: ${z.datei}`); if (!NUR_PRUEFEN) fs.writeFileSync(p, s); }
}
const lockFile = path.join(APPS, 'package-lock.json');
if (fs.existsSync(lockFile)) {
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  if (lock.version !== VERSION || (lock.packages && lock.packages[''] && lock.packages[''].version !== VERSION)) {
    abweichung++;
    console.log(`${NUR_PRUEFEN ? 'weicht ab' : 'angepasst'}: package-lock.json`);
    if (!NUR_PRUEFEN) {
      lock.version = VERSION;
      if (lock.packages && lock.packages['']) lock.packages[''].version = VERSION;
      fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
    }
  }
}
console.log(`Version ${VERSION} (Build ${BUILD})${abweichung ? '' : ': alles einheitlich'}`);
process.exit(NUR_PRUEFEN && abweichung ? 1 : 0);
