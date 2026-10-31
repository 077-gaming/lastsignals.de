// Zentrale Liste der Kanäle von LAST SIGNALS.
// So trägt Toni einen Kanal ein: zwischen die Anführungszeichen bei url die volle https-Adresse setzen,
// zum Beispiel url: 'https://discord.gg/abc123'. Danach `npm run build` (im Dev-Server reicht Neuladen).
// Leere url = der Knopf zeigt "bald" und ist kein Link. Gesetzte url = echter Link (neuer Tab, rel noopener).
// handle ist optional (zum Beispiel '@last.signals.1') und erscheint unter dem Namen.

export const LINKS = {
  discord:   { name: 'Discord',   url: '', handle: '' }, // Einladungslink folgt
  instagram: { name: 'Instagram', url: 'https://www.instagram.com/last.signals.1/', handle: '@last.signals.1' },
  tiktok:    { name: 'TikTok',    url: 'https://www.tiktok.com/@last.signals1', handle: '@last.signals1' },
  youtube:   { name: 'YouTube',   url: '', handle: '' },
  x:         { name: 'X',         url: '', handle: '' },
  reddit:    { name: 'Reddit',    url: '', handle: '' },
  steam:     { name: 'Steam',     url: '', handle: '' },
};

// Reihenfolge der Knöpfe auf der Seite
export const LINK_ORDER = ['discord', 'tiktok', 'instagram', 'youtube', 'x', 'reddit', 'steam'];

// Nur echte https-Adressen zählen als gesetzt
export function linkUrl(id) {
  const u = ((LINKS[id] && LINKS[id].url) || '').trim();
  return /^https:\/\/[^\s"'<>]+$/.test(u) ? u : '';
}
