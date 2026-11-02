import { defineConfig, loadEnv } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderPage, PAGES } from './src/content/render.js';
import { SITE, canonical, pageById } from './src/site.js';

const root = dirname(fileURLToPath(import.meta.url));

// Welche Anmeldewege Supabase gerade anbietet (GET /auth/v1/settings, Header apikey). Ergebnis steuert
// die Google-/Discord-Knöpfe und die Abschnitte der Datenschutzerklärung. Ohne Server oder bei Fehler: keine.
async function fetchProviders(env) {
  const url = (env.VITE_SUPABASE_URL || '').trim(), key = (env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!/^https:\/\/[\w.-]+$/.test(url) || key.length < 20) return [];
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return [];
    const ext = (await r.json()).external || {};
    return ['google', 'discord'].filter((k) => ext[k] === true);
  } catch (e) { return []; }
}

// Jede HTML-Datei enthält nur <!--ls:page id-->; hier wird die fertige Seite eingesetzt.
// Produktions-Build: Links für die echten Domains (lastsignals.de / lastsignals.online).
// LS_LOCAL=1 npm run build baut mit lokalen Pfaden, zum Testen mit npm run preview.
function pages(flags) {
  let mode = 'dev';
  return {
    name: 'ls-pages',
    configResolved(c) { mode = c.command === 'build' && process.env.LS_LOCAL !== '1' ? 'domains' : 'dev'; },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const m = html.match(/<!--ls:page ([\w-]+)-->/);
        return m ? renderPage(m[1], { mode, ...flags }) : html;
      },
    },
  };
}

// sitemap.xml und robots.txt je Domain: lastsignals.de liefert dist/, lastsignals.online liefert dist/en/ (Rewrite in netlify.toml).
function seoFiles() {
  const day = new Date().toISOString().slice(0, 10);
  const map = (lang) => {
    const urls = PAGES.filter((p) => p.lang === lang && p.canon).map((p) => {
      const alt = p.alt ? pageById(p.alt) : null;
      const links = alt ? [p, alt].map((x) => `<xhtml:link rel="alternate" hreflang="${x.lang}" href="${canonical(x)}"/>`).join('') : '';
      return `<url><loc>${canonical(p)}</loc><lastmod>${day}</lastmod>${links}</url>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
  };
  const robots = (lang) => `User-agent: *\nAllow: /\n\nSitemap: ${SITE[lang]}/sitemap.xml\n`;
  return {
    name: 'ls-seo', apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: map('de') });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots('de') });
      this.emitFile({ type: 'asset', fileName: 'en/sitemap.xml', source: map('en') });
      this.emitFile({ type: 'asset', fileName: 'en/robots.txt', source: robots('en') });
    },
  };
}

// Nur im Dev-Server: Standbild der 3D-Szene speichern (?poster=wide|tall).
function posterSaver() {
  return {
    name: 'ls-poster-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__poster', (req, res) => {
        const name = new URL(req.url, 'http://x').searchParams.get('name') || '';
        if (req.method !== 'POST' || !/^[\w-]+\.(webp|jpg|png)$/.test(name)) { res.statusCode = 400; return res.end('bad'); }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          mkdirSync(resolve(root, 'public/img'), { recursive: true });
          writeFileSync(resolve(root, 'public/img', name), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, root, 'VITE_');
  const online = /^https:\/\/[\w.-]+$/.test((env.VITE_SUPABASE_URL || '').trim()) && (env.VITE_SUPABASE_ANON_KEY || '').trim().length > 20;
  const flags = {
    oauth: await fetchProviders(env),
    reservationOpen: online && String(env.VITE_RESERVATION_OPEN || '').trim() === 'true',
  };
  return {
  plugins: [pages(flags), posterSaver(), seoFiles()],
  define: { __LS_OAUTH__: JSON.stringify(flags.oauth) },
  server: { port: 5180, strictPort: true, hmr: process.env.LS_NOHMR ? false : undefined },
  preview: { port: 5181, strictPort: true },
  build: {
    target: 'es2020',
    assetsInlineLimit: 2048,
    rollupOptions: {
      input: Object.fromEntries(PAGES.map((p) => [p.id, resolve(root, p.file)])),
    },
  },
};
});
