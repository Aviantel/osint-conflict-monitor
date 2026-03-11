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
    query:
      '(Ukraine OR Kyiv OR Kharkiv OR Donetsk OR Zaporizhzhia OR Crimea) AND (war OR strike OR missile OR drone OR offensive OR frontline OR attack)',
    color: '#ff6b6b'
  },
  {
    id: 'gaza',
    label: 'Gaza / Israel',
    lat: 31.4,
    lon: 34.4,
    query:
      '(Gaza OR Israel OR West Bank OR Rafah OR Tel Aviv OR Jerusalem) AND (airstrike OR rocket OR offensive OR ceasefire OR attack OR conflict)',
    color: '#ffd166'
  },
  {
    id: 'redsea',
    label: 'Red Sea',
    lat: 15.5,
    lon: 42.5,
    query:
      '(Red Sea OR Yemen OR Houthis OR Houthi OR Bab el-Mandeb) AND (ship OR shipping OR missile OR drone OR naval OR attack)',
    color: '#67e8ff'
  },
  {
    id: 'syria',
    label: 'Syria',
    lat: 35.0,
    lon: 38.5,
    query:
      '(Syria OR Damascus OR Aleppo OR Idlib) AND (strike OR militia OR attack OR conflict OR offensive)',
    color: '#76ffb2'
  },
  {
    id: 'iran',
    label: 'Iran Region',
    lat: 32.0,
    lon: 53.0,
    query:
      '(Iran OR Tehran OR Persian Gulf OR Hormuz) AND (military OR strike OR sanctions OR missile OR nuclear OR conflict)',
    color: '#ff9f68'
  },
  {
    id: 'taiwan',
    label: 'Taiwan Strait',
    lat: 23.7,
    lon: 121.0,
    query:
      '(Taiwan OR Taipei OR Taiwan Strait OR China PLA) AND (military OR incursion OR drill OR ship OR aircraft OR exercise OR tension)',
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
  if (hit && Date.now() - hit.time < CACHE_MS) {
    return hit.data;
  }
  const data = await fetcher();
  cache.set(key, { time: Date.now(), data });
  return data;
}

function scoreArticle(title = '', source = '') {
  const text = `${title} ${source}`.toLowerCase();
  let score = 1;
  const high = ['missile', 'airstrike', 'drone', 'offensive', 'incursion', 'naval', 'frontline', 'attack', 'explosion'];
  const med = ['troops', 'military', 'ceasefire', 'sanctions', 'exercise', 'tension', 'warning'];

  high.forEach((w) => {
    if (text.includes(w)) score += 3;
  });
  med.forEach((w) => {
    if (text.includes(w)) score += 1;
  });

  return score;
}

async function fetchRegion(region) {
  const encodedQuery = encodeURIComponent(region.query);
  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodedQuery}` +
    `&mode=ArtList&maxrecords=50&format=json&timespan=72h&sort=DateDesc`;

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`GDELT failed for ${region.id}: ${resp.status}`);
  }

  const data = await resp.json();
  const articles = (data.articles || []).map((a, idx) => ({
    id: `${region.id}-${idx}`,
    regionId: region.id,
    regionLabel: region.label,
    title: a.title || 'Untitled',
    source: a.domain || a.sourcecountry || 'Unknown source',
    url: a.url || '#',
    image: a.socialimage || '',
    seenAt: a.seendate || '',
    language: a.language || '',
    score: scoreArticle(a.title, a.domain),
    color: region.color
  }));

  const total = articles.length;
  const hotspot = articles.reduce((sum, a) => sum + a.score, 0);
  const top = articles.slice(0, 12);

  return {
    region: {
      id: region.id,
      label: region.label,
      lat: region.lat,
      lon: region.lon,
      color: region.color,
      articleCount: total,
      hotspot,
      query: region.query
    },
    articles: top
  };
}

async function fetchAllRegions() {
  const results = await Promise.all(
    WATCHLIST.map((r) => fetchWithCache(`region:${r.id}`, () => fetchRegion(r)))
  );

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
        articles: []
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

  let filePath = path.join(publicDir, url.pathname === '/' ? 'index.html' : url.pathname);

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
