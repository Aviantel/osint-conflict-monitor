import http from 'node:http';
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_MS) return hit.data;
  const data = await fetcher();
  cache.set(key, { time: Date.now(), data });
  return data;
}

function scoreArticle(title = '', source = '') {
  const text = `${title} ${source}`.toLowerCase();
  let score = 1;
  const high = ['missile', 'airstrike', 'drone', 'offensive', 'incursion', 'naval', 'frontline', 'attack', 'explosion'];
  const med = ['troops', 'military', 'ceasefire', 'sanctions', 'exercise', 'tension', 'warning'];
  high.forEach(w => { if (text.includes(w)) score += 3; });
  med.forEach(w => { if (text.includes(w)) score += 1; });
  return score;
}

async function fetchRegion(region) {
  const encodedQuery = encodeURIComponent(region.query);
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodedQuery}&mode=ArtList&maxrecords=50&format=json&timespan=72h&sort=DateDesc`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`GDELT failed for ${region.id}: ${resp.status}`);
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
  const results = await Promise.all(WATCHLIST.map(r => fetchWithCache(`region:${r.id}`, () => fetchRegion(r))));
  const regions = results.map(r => r.region).sort((a, b) => b.hotspot - a.hotspot);
  const articles = results.flatMap(r => r.articles).sort((a, b) => b.score - a.score || String(b.seenAt).localeCompare(String(a.seenAt)));
  return { regions, articles, updatedAt: new Date().toISOString() };
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
      sendJson(res, 500, { error: err.message, regions: [], articles: [] });
    }
    return;
  }

  if (url.pathname.startsWith('/api/region/')) {
    const id = url.pathname.split('/').pop();
    const region = WATCHLIST.find(r => r.id === id);
    if (!region) {
      sendJson(res, 404, { error: 'Region not found' });
      return;
    }
    try {
      const data = await fetchWithCache(`region:${region.id}`, () => fetchRegion(region));
      sendJson(res, 200, data);
    } catch (err) {
      sendJson(res, 500, { error: err.message, region: null, articles: [] });
    }
    return;
  }

  let filePath = path.join(publicDir, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) sendFile(res, filePath);
    else sendFile(res, path.join(publicDir, 'index.html'));
  });
});

server.listen(PORT, () => {
  console.log(`OSINT Conflict Monitor running at http://localhost:${PORT}`);
});
