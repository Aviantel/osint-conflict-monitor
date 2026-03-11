import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const PORT = 3000;

const WATCHLIST = [
  {
    id: 'ukraine',
    label: 'Ukraine',
    lat: 49.0,
    lon: 31.0,
    search: 'Ukraine war Kyiv Kharkiv Donetsk Zaporizhzhia Crimea missile drone attack',
    color: '#ff6b6b'
  },
  {
    id: 'gaza',
    label: 'Gaza / Israel',
    lat: 31.4,
    lon: 34.4,
    search: 'Gaza Israel conflict Rafah Tel Aviv Jerusalem airstrike rocket attack',
    color: '#ffd166'
  },
  {
    id: 'redsea',
    label: 'Red Sea',
    lat: 15.5,
    lon: 42.5,
    search: 'Red Sea Yemen Houthis Houthi Bab el-Mandeb ship missile drone naval attack',
    color: '#67e8ff'
  },
  {
    id: 'syria',
    label: 'Syria',
    lat: 35.0,
    lon: 38.5,
    search: 'Syria Damascus Aleppo Idlib strike militia attack offensive',
    color: '#76ffb2'
  },
  {
    id: 'iran',
    label: 'Iran Region',
    lat: 32.0,
    lon: 53.0,
    search: 'Iran Tehran Persian Gulf Hormuz missile military nuclear conflict',
    color: '#ff9f68'
  },
  {
    id: 'taiwan',
    label: 'Taiwan Strait',
    lat: 23.7,
    lon: 121.0,
    search: 'Taiwan Strait Taipei China PLA military incursion drill ship aircraft tension',
    color: '#d68cff'
  }
];

const cache = new Map();
const CACHE_MS = 5 * 60 * 1000;

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  };
  const type = types[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

async function fetchWithCache(key, fetcher) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_MS) return hit.data;
  const data = await fetcher();
  cache.set(key, { time: Date.now(), data });
  return data;
}

function scoreArticle(title = '', source = '') {
  const text = `${title} ${source}`.toLowerCase();
  let score = 1;
  const high = ['missile', 'airstrike', 'drone', 'offensive', 'incursion', 'naval', 'frontline', 'attack', 'explosion', 'strike'];
  const med = ['troops', 'military', 'ceasefire', 'sanctions', 'exercise', 'tension', 'warning', 'ship'];

  for (const word of high) if (text.includes(word)) score += 3;
  for (const word of med) if (text.includes(word)) score += 1;

  return score;
}

function decodeXml(str = '') {
  return str
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function getTag(block, tag) {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = block.indexOf(open);
  if (start === -1) return '';
  const end = block.indexOf(close, start + open.length);
  if (end === -1) return '';
  return decodeXml(block.slice(start + open.length, end).trim());
}

function parseRssItems(xml) {
  const items = [];
  const parts = xml.split('<item>');
  for (let i = 1; i < parts.length; i++) {
    const end = parts[i].indexOf('</item>');
    if (end === -1) continue;
    const block = parts[i].slice(0, end);

    items.push({
      title: getTag(block, 'title'),
      link: getTag(block, 'link'),
      pubDate: getTag(block, 'pubDate'),
      description: getTag(block, 'description'),
      source: getTag(block, 'source') || 'Google News'
    });
  }
  return items;
}

async function fetchGoogleNews(region) {
  const query = encodeURIComponent(region.search);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });

  if (!resp.ok) {
    throw new Error(`Google News RSS failed: ${resp.status}`);
  }

  const xml = await resp.text();
  const items = parseRssItems(xml).slice(0, 12);

  const articles = items.map((item, idx) => ({
    id: `${region.id}-${idx}`,
    regionId: region.id,
    regionLabel: region.label,
    title: item.title || 'Untitled',
    source: item.source || 'Google News',
    url: item.link || '#',
    image: '',
    seenAt: item.pubDate || '',
    language: 'en',
    score: scoreArticle(item.title, item.source),
    color: region.color
  }));

  const hotspot = articles.reduce((sum, a) => sum + a.score, 0);

  return {
    region: {
      id: region.id,
      label: region.label,
      lat: region.lat,
      lon: region.lon,
      color: region.color,
      articleCount: articles.length,
      hotspot,
      query: region.search,
      status: 'ok'
    },
    articles
  };
}

async function fetchRegion(region) {
  try {
    return await fetchGoogleNews(region);
  } catch (err) {
    return {
      region: {
        id: region.id,
        label: region.label,
        lat: region.lat,
        lon: region.lon,
        color: region.color,
        articleCount: 0,
        hotspot: 0,
        query: region.search,
        status: 'degraded',
        error: err.message
      },
      articles: []
    };
  }
}

async function fetchAllRegions() {
  const results = [];
  for (const region of WATCHLIST) {
    const data = await fetchWithCache(`region:${region.id}`, () => fetchRegion(region));
    results.push(data);
  }

  const regions = results
    .map((r) => r.region)
    .sort((a, b) => b.hotspot - a.hotspot);

  const articles = results
    .flatMap((r) => r.articles)
    .sort((a, b) => b.score - a.score || String(b.seenAt).localeCompare(String(a.seenAt)));

  return {
    regions,
    articles,
    updatedAt: new Date().toISOString()
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, now: new Date().toISOString() });
    return;
  }

  if (url.pathname === '/api/regions') {
    try {
      const data = await fetchAllRegions();
      sendJson(res, 200, data);
    } catch (err) {
      sendJson(res, 500, {
        error: err.message,
        regions: [],
        articles: [],
        updatedAt: new Date().toISOString()
      });
    }
    return;
  }

  if (url.pathname.startsWith('/api/region/')) {
    const id = url.pathname.split('/').pop();
    const region = WATCHLIST.find((r) => r.id === id);

    if (!region) {
      sendJson(res, 404, { error: 'Region not found' });
      return;
    }

    try {
      const data = await fetchWithCache(`region:${region.id}`, () => fetchRegion(region));
      sendJson(res, 200, data);
    } catch (err) {
      sendJson(res, 500, {
        error: err.message,
        region: null,
        articles: []
      });
    }
    return;
  }

  const filePath = path.join(publicDir, url.pathname === '/' ? 'index.html' : url.pathname);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      sendFile(res, filePath);
    } else {
      sendFile(res, path.join(publicDir, 'index.html'));
    }
  });
});

server.listen(PORT, () => {
  console.log(`OSINT Conflict Monitor running at http://localhost:${PORT}`);
});
