const state = {
  regions: [],
  articles: [],
  selectedRegionId: null,
  updatedAt: null
};

const els = {
  regionList: document.getElementById('regionList'),
  globe: document.getElementById('globe'),
  regionBrief: document.getElementById('regionBrief'),
  articleFeed: document.getElementById('articleFeed'),
  updatedPill: document.getElementById('updatedPill'),
  countPill: document.getElementById('countPill'),
  trendCanvas: document.getElementById('trendCanvas')
};

function xFromLon(lon) {
  return ((lon + 180) / 360) * 100;
}

function yFromLat(lat) {
  return ((90 - lat) / 180) * 100;
}

function fmtTime(value) {
  if (!value) return '--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function severityLabel(hotspot) {
  if (hotspot >= 45) return 'CRITICAL';
  if (hotspot >= 28) return 'HIGH';
  if (hotspot >= 12) return 'ELEVATED';
  return 'WATCH';
}

function renderRegionList() {
  els.regionList.innerHTML = '';

  if (!state.regions.length) {
    els.regionList.innerHTML = '<div class="empty padded">No hotspot regions loaded.</div>';
    return;
  }

  state.regions.forEach((region) => {
    const btn = document.createElement('button');
    btn.className = `region-card ${state.selectedRegionId === region.id ? 'active' : ''}`;

    btn.innerHTML = `
      <div class="region-top">
        <span class="swatch" style="background:${region.color}"></span>
        <span class="region-name">${region.label}</span>
        <span class="severity sev-${severityLabel(region.hotspot).toLowerCase()}">${severityLabel(region.hotspot)}</span>
      </div>
      <div class="region-stats">
        <div><span>Hotspot</span><strong>${region.hotspot}</strong></div>
        <div><span>Articles</span><strong>${region.articleCount}</strong></div>
      </div>
    `;

    btn.addEventListener('click', () => {
      selectRegion(region.id);
    });

    els.regionList.appendChild(btn);
  });
}

function renderGlobe() {
  els.globe.innerHTML = '<div class="glow"></div>';

  if (!state.regions.length) return;

  state.regions.forEach((region) => {
    const marker = document.createElement('button');
    marker.className = 'globe-marker';
    marker.title = `${region.label} · hotspot ${region.hotspot}`;
    marker.style.left = `${xFromLon(region.lon)}%`;
    marker.style.top = `${yFromLat(region.lat)}%`;
    marker.style.setProperty('--marker-color', region.color);

    const size = Math.max(10, Math.min(28, 10 + region.hotspot * 0.22));
    marker.style.width = `${size}px`;
    marker.style.height = `${size}px`;

    marker.addEventListener('click', () => {
      selectRegion(region.id);
    });

    els.globe.appendChild(marker);
  });
}

function renderRegionBrief() {
  const region = state.regions.find((r) => r.id === state.selectedRegionId);

  if (!region) {
    els.regionBrief.className = 'region-brief empty';
    els.regionBrief.innerHTML = 'Select a region from the watchlist.';
    return;
  }

  const regionArticles = state.articles.filter((a) => a.regionId === region.id).slice(0, 5);

  els.regionBrief.className = 'region-brief';
  els.regionBrief.innerHTML = `
    <div class="brief-title-row">
      <div>
        <h3>${region.label}</h3>
        <p class="muted">Last update: ${fmtTime(state.updatedAt)}</p>
      </div>
      <span class="severity sev-${severityLabel(region.hotspot).toLowerCase()}">${severityLabel(region.hotspot)}</span>
    </div>

    <div class="brief-grid">
      <div class="brief-card"><span>Hotspot Score</span><strong>${region.hotspot}</strong></div>
      <div class="brief-card"><span>Article Count</span><strong>${region.articleCount}</strong></div>
      <div class="brief-card"><span>Status</span><strong>${region.status || 'ok'}</strong></div>
      <div class="brief-card"><span>Coordinates</span><strong>${region.lat}, ${region.lon}</strong></div>
    </div>

    <p class="brief-copy">
      This region is being monitored through open-source headline signals. The hotspot score reflects weighted language intensity and article volume across the latest feed results.
    </p>

    <div class="brief-links">
      ${
        regionArticles.length
          ? regionArticles
              .map(
                (a) =>
                  `<a href="${a.url}" target="_blank" rel="noreferrer">${a.title}</a>`
              )
              .join('')
          : '<span class="muted">No linked articles available.</span>'
      }
    </div>
  `;
}

function renderArticleFeed() {
  els.articleFeed.innerHTML = '';

  let articles = state.articles;
  if (state.selectedRegionId) {
    articles = articles.filter((a) => a.regionId === state.selectedRegionId);
  }

  if (!articles.length) {
    els.articleFeed.innerHTML = '<div class="empty padded">No headlines available.</div>';
    return;
  }

  articles.slice(0, 14).forEach((article) => {
    const card = document.createElement('article');
    card.className = 'article-card';
    card.innerHTML = `
      <div class="article-top">
        <span class="swatch" style="background:${article.color}"></span>
        <span class="article-region">${article.regionLabel}</span>
        <span class="article-score">Score ${article.score}</span>
      </div>
      <a class="article-title" href="${article.url}" target="_blank" rel="noreferrer">${article.title}</a>
      <div class="article-meta">${article.source} · ${fmtTime(article.seenAt)}</div>
    `;
    els.articleFeed.appendChild(card);
  });
}

function renderTrendChart() {
  const canvas = els.trendCanvas;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const regions = state.regions.slice(0, 6);
  if (!regions.length) return;

  const padding = 24;
  const chartW = canvas.width - padding * 2;
  const chartH = canvas.height - padding * 2;
  const maxValue = Math.max(10, ...regions.map((r) => r.hotspot));

  ctx.strokeStyle = 'rgba(103,232,255,0.12)';
  ctx.lineWidth = 1;

  for (let i = 0; i < 4; i++) {
    const y = padding + (chartH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(canvas.width - padding, y);
    ctx.stroke();
  }

  const stepX = regions.length > 1 ? chartW / (regions.length - 1) : chartW / 2;

  ctx.beginPath();
  regions.forEach((region, i) => {
    const x = padding + stepX * i;
    const y = canvas.height - padding - (region.hotspot / maxValue) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.strokeStyle = '#67e8ff';
  ctx.lineWidth = 3;
  ctx.stroke();

  regions.forEach((region, i) => {
    const x = padding + stepX * i;
    const y = canvas.height - padding - (region.hotspot / maxValue) * chartH;

    ctx.fillStyle = region.color;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#dff7ff';
    ctx.font = '12px sans-serif';
    ctx.fillText(region.label, Math.max(6, x - 26), canvas.height - 6);
  });
}

function selectRegion(id) {
  state.selectedRegionId = id;
  renderRegionList();
  renderRegionBrief();
  renderArticleFeed();
}

async function loadAll() {
  try {
    const res = await fetch('/api/regions');
    if (!res.ok) {
      throw new Error(`API failed: ${res.status}`);
    }

    const data = await res.json();

    state.regions = Array.isArray(data.regions) ? data.regions : [];
    state.articles = Array.isArray(data.articles) ? data.articles : [];
    state.updatedAt = data.updatedAt || null;

    if (!state.selectedRegionId && state.regions.length) {
      state.selectedRegionId = state.regions[0].id;
    }

    els.updatedPill.textContent = `UPDATED: ${fmtTime(state.updatedAt)}`;
    els.countPill.textContent = `REGIONS: ${state.regions.length}`;

    renderRegionList();
    renderGlobe();
    renderRegionBrief();
    renderArticleFeed();
    renderTrendChart();
  } catch (err) {
    console.error('loadAll failed:', err);
    els.regionList.innerHTML = `<div class="empty padded">Failed to load regions: ${err.message}</div>`;
    els.articleFeed.innerHTML = `<div class="empty padded">Failed to load headlines.</div>`;
    els.regionBrief.innerHTML = `<div class="empty padded">Frontend error: ${err.message}</div>`;
  }
}

loadAll();
setInterval(loadAll, 5 * 60 * 1000);
window.addEventListener('resize', renderTrendChart);

function initRealGlobe() {
  const globeEl = document.getElementById('globe');
  if (!globeEl || typeof Globe === 'undefined') return;

  globeEl.innerHTML = '';

  const globe = Globe()(globeEl)
    .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
    .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
    .showAtmosphere(true)
    .atmosphereColor('#67e8ff')
    .atmosphereAltitude(0.18);

  const points = state.regions.map((r) => ({
    lat: r.lat,
    lng: r.lon,
    size: Math.max(0.18, r.hotspot / 180),
    color: r.color,
    label: `${r.label} • hotspot ${r.hotspot}`
  }));

  globe
    .pointsData(points)
    .pointAltitude('size')
    .pointColor('color')
    .pointRadius(0.45)
    .onPointClick((point) => {
      const region = state.regions.find(
        (r) => r.lat === point.lat && r.lon === point.lng
      );
      if (region) selectRegion(region.id);
    });

  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.5;
}

const originalLoadAll = loadAll;
loadAll = async function () {
  await originalLoadAll();
  initRealGlobe();
};
