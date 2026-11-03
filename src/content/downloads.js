// Download-Seite: EINE Stelle für Version, Release-Tag, Dateinamen und Dateigrößen.
// Die Dateien liegen als Anhänge eines GitHub-Releases im öffentlichen Repository:
//   https://github.com/<repo>/releases/download/<tag>/<datei>
// Neue Version: tag/version hier ändern, Dateien mit genau diesen Namen ans Release hängen,
// danach `node Apps/download-groessen.mjs` (überträgt die Größen aus ~/LAST-SIGNALS-Uebergabe/downloads) und `npm run build`.
// Texte der Seite stehen in text.js (download), die Symbole in icons.js (pf*).

import { SITE } from '../site.js';

// Eine Versionsnummer für Website, Fußzeile, Download-Seite und Browser-Kachel: SITE.version (site.js).
export const RELEASE = {
  repo: '077-gaming/lastsignals.de',
  tag: `v${SITE.version}-test`,
  version: SITE.version, // so steht es auf der Seite
  test: true, // Testversion: unsigniert, nicht im App Store / bei Google Play
  // true = Knöpfe zeigen auf das GitHub-Release v<version>-test. Das Release MUSS mit genau diesen Dateinamen
  // veröffentlicht sein, bevor die Website live geht (sonst führen die Knöpfe auf 404). Notfalls auf false setzen:
  // dann zeigt die Seite die Dateien ehrlich als „bald verfügbar“.
  published: true,
};

// Dateien des Releases. bytes = exakte Größe (für die Anzeige „149 MB“).
export const FILES = {
  macArm: { file: 'LAST-SIGNALS-mac-arm64.dmg', bytes: 174460674 },
  macArmZip: { file: 'LAST-SIGNALS-mac-arm64.zip', bytes: 163970709 },
  macUni: { file: 'LAST-SIGNALS-mac-universal.dmg', bytes: 287433104 },
  macUniZip: { file: 'LAST-SIGNALS-mac-universal.zip', bytes: 267752625 },
  winSetup: { file: 'LAST-SIGNALS-windows-x64-setup.exe', bytes: 156625033 },
  winZip: { file: 'LAST-SIGNALS-windows-x64.zip', bytes: 203709271 },
  ipa: { file: 'LAST-SIGNALS-ios-unsigniert.ipa', bytes: 46159115 },
  apk: { file: 'LAST-SIGNALS-android-debug.apk', bytes: 51100960 },
};

// Kacheln in dieser Reihenfolge. main = Hauptknopf, alt = weitere Dateien (kleiner), web = Web-App-Weg statt Datei.
export const PLATFORMS = [
  { id: 'mac', icon: 'pfMac', main: 'macArm', alt: ['macUni', 'macArmZip', 'macUniZip'] },
  { id: 'windows', icon: 'pfWindows', main: 'winSetup', alt: ['winZip'] },
  { id: 'iphone', icon: 'pfPhone', web: true, alt: ['ipa'] },
  { id: 'ipad', icon: 'pfTablet', web: true, alt: ['ipa'] },
  { id: 'android', icon: 'pfAndroid', main: 'apk', alt: [] },
  { id: 'browser', icon: 'pfBrowser', web: true, alt: [] },
];

export const releaseUrl = (key) => `https://github.com/${RELEASE.repo}/releases/download/${RELEASE.tag}/${FILES[key].file}`;
export const releasePage = () => `https://github.com/${RELEASE.repo}/releases/tag/${RELEASE.tag}`;

// Größe für Menschen: 1 MB = 1024 × 1024 Byte (so zeigt es auch Windows an)
export function fileSize(key, lang) {
  const b = FILES[key].bytes;
  if (!b) return '';
  const mb = b / 1048576;
  return `${mb.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`;
}
