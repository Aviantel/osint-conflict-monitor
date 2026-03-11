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
  if (!value) return '-';
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleString();
}

function severityLabel(hotspot) {
  if (hotspot >= 60) return 'CRITICAL';
  if (hotspot >= 35) return 'HIGH';
  if (hotspot >= 18) return 'ELEVATED';
  return 'WATCH';
}

function renderRegionList() {
  els.regionList.innerHTML = '';
  state.regions.forEach(region => {
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
    btn.onclick = () => selectRegion(region.id);
    els.regionList.appendChild(btn);
  });
}

function renderGlobe() {
  els.globe.innerHTML = '<div class="glow"></div>';
window.addEventListener('resize', renderTrendChart);
