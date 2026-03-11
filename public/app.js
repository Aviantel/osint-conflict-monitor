const state = {
  regions: [],
  articles: [],
  selectedRegionId: null,
  updatedAt: null,
  globe: null
};

const els = {
  regionList: document.getElementById('regionList'),
  regionBrief: document.getElementById('regionBrief'),
  articleFeed: document.getElementById('articleFeed'),
  updatedPill: document.getElementById('updatedPill'),
  countPill: document.getElementById('countPill'),
  heroRegionCount: document.getElementById('heroRegionCount'),
  heroArticleCount: document.getElementById('heroArticleCount'),
  heroTopRegion: document.getElementById('heroTopRegion'),
  ticker: document.getElementById('ticker'),
  globeEl: document.getElementById('globe')
};

function fmtTime(value) {
  if (!value) return '--';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function severityLabel(hotspot) {
  if (hotspot >= 40) return 'CRITICAL';
  if (hotspot >= 26) return 'HIGH';
  if (hotspot >= 12) return 'ELEVATED';
  return 'WATCH';
}

function buildTicker() {
  if (!state.articles.length) {
    els.ticker.innerHTML = '<div class="ticker-track"><span class="ticker-item">No signals loaded.</span></div>';
    return;
  }

  const items = state.articles.slice(0, 14).map((a) => {
    return `<span class="ticker-item"><b>${a.regionLabel}</b>${a.title}</span>`;
  }).join('');

  els.ticker.innerHTML = `<div class="ticker-track">${items}${items}</div>`;
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
        <span class="swatch" style="background:${region.color}; color:${region.color}"></span>
        <span class="region-name">${region.label}</span>
        <span class="severity sev-${severityLabel(region.hotspot).toLowerCase()}">${severityLabel(region.hotspot)}</span>
      </div>
      <div class="region-stats">
        <div><span>Hotspot</span><strong>${region.hotspot}</strong></div>
        <div><span>Articles</span><strong>${region.articleCount}</strong></div>
      </div>
    `;

    btn.addEventListener('click', () => selectRegion(region.id));
    els.regionList.appendChild(btn);
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
          ? regionArticles.map((a) => `<a href="${a.url}" target="_blank" rel="noreferrer">${a.title}</a>`).join('')
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
        <span class="swatch" style="background:${article.color}; color:${article.color}"></span>
        <span class="article-region">${article.regionLabel}</span>
        <span class="article-score">Score ${article.score}</span>
      </div>
      <a class="article-title" href="${article.url}" target="_blank" rel="noreferrer">${article.title}</a>
      <div class="article-meta">${article.source} · ${fmtTime(article.seenAt)}</div>
    `;
    els.articleFeed.appendChild(card);
  });
}

function initOrUpdateGlobe() {
  if (!els.globeEl || typeof Globe === 'undefined') return;

  const points = state.regions.map((r) => ({
    lat: r.lat,
    lng: r.lon,
    size: Math.max(0.18, r.hotspot / 180),
    color: r.color,
    label: `
      <div style="
        padding:10px 12px;
        background:rgba(6,18,28,.92);
        border:1px solid rgba(86,214,255,.22);
        border-radius:12px;
        color:#ecf7ff;
        font-family:Inter,sans-serif;
        font-size:12px;
      ">
        <strong style="display:block; margin-bottom:4px;">${r.label}</strong>
        Hotspot ${r.hotspot}<br/>
        Articles ${r.articleCount}
      </div>
    `
  }));

  if (!state.globe) {
    els.globeEl.innerHTML = '';

    state.globe = Globe()(els.globeEl)
      .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true)
      .atmosphereColor('#59dcff')
      .atmosphereAltitude(0.14)
      .width(els.globeEl.clientWidth)
      .height(els.globeEl.clientHeight);

    state.globe.controls().autoRotate = true;
    state.globe.controls().autoRotateSpeed = 0.45;
  }

  state.globe
    .pointsData(points)
    .pointAltitude('size')
    .pointColor('color')
    .pointRadius(0.42)
    .pointLabel('label')
    .onPointClick((point) => {
      const region = state.regions.find((r) => r.lat === point.lat && r.lon === point.lng);
      if (region) selectRegion(region.id);
    });

  if (state.regions.length >= 1) {
    const top = state.regions[0];
    state.globe.pointOfView({ lat: top.lat, lng: top.lon, altitude: 1.8 }, 900);
  }
}

function updateHero() {
  els.heroRegionCount.textContent = String(state.regions.length);
  els.heroArticleCount.textContent = String(state.articles.length);
  els.heroTopRegion.textContent = state.regions[0]?.label || '--';
}

function selectRegion(id) {
  state.selectedRegionId = id;
  renderRegionList();
  renderRegionBrief();
  renderArticleFeed();

  const region = state.regions.find((r) => r.id === id);
  if (region && state.globe) {
    state.globe.pointOfView({ lat: region.lat, lng: region.lon, altitude: 1.55 }, 900);
  }
}

async function loadAll() {
  try {
    const res = await fetch('/api/regions');
    if (!res.ok) throw new Error(`API failed: ${res.status}`);

    const data = await res.json();

    state.regions = Array.isArray(data.regions) ? data.regions : [];
    state.articles = Array.isArray(data.articles) ? data.articles : [];
    state.updatedAt = data.updatedAt || null;

    if (!state.selectedRegionId && state.regions.length) {
      state.selectedRegionId = state.regions[0].id;
    }

    els.updatedPill.textContent = `UPDATED: ${fmtTime(state.updatedAt)}`;
    els.countPill.textContent = `REGIONS: ${state.regions.length}`;

    updateHero();
    renderRegionList();
    renderRegionBrief();
    renderArticleFeed();
    buildTicker();
    initOrUpdateGlobe();
  } catch (err) {
    console.error('loadAll failed:', err);
    els.regionList.innerHTML = `<div class="empty padded">Failed to load regions: ${err.message}</div>`;
    els.articleFeed.innerHTML = `<div class="empty padded">Failed to load headlines.</div>`;
    els.regionBrief.innerHTML = `<div class="empty padded">Frontend error: ${err.message}</div>`;
  }
}

loadAll();
setInterval(loadAll, 5 * 60 * 1000);

window.addEventListener('resize', () => {
  if (state.globe && els.globeEl) {
    state.globe.width(els.globeEl.clientWidth);
    state.globe.height(els.globeEl.clientHeight);
  }
});
