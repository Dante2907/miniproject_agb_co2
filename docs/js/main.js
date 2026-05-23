/* ════════════════════════════════════════════════════════
   Chiang Mai Forest Atlas — main.js
   ════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────
const state = {
  year: '2019',
  basemap: 'carto',
  opacity: 0.75,
  metric: 'forest_2023_ha',          // ← เพิ่มบรรทัดนี้
  layers: {
    province: true,                  // ← เพิ่ม
    amphoe: true,                    // ← เพิ่ม
    'amphoe-choropleth': false,      // ← เพิ่ม
    agb: false,
    co2: false,
    forestmap: true,
    change: false,
    'forest-vector': false,
    points: false
  },
  data: { stats: null, bounds: null }
};

// ── Number formatters ───────────────────────────────────
const fmt = {
  int: n => (n == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)),
  ha: n => (n == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) + ' ha'),
  mg: n => (n == null ? '—' : (n / 1e6).toFixed(2) + ' Mt'),
  pct: n => (n == null ? '—' : n.toFixed(1) + '%'),
  dec: (n, d = 2) => (n == null ? '—' : n.toFixed(d))
};

// ── Init on load ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadData();
    initMap();
    initControls();
    renderHeroStats();
    renderBigNumbers();
    renderDistrictsTable();
    renderCharts();
    renderMetrics();
  } catch (err) {
    console.error('Init error:', err);
  }
});

// ── Load JSON data ──────────────────────────────────────
async function loadData() {
  const [stats, bounds] = await Promise.all([
    fetch('data/stats.json').then(r => r.json()),
    fetch('data/geojson/bounds.json').then(r => r.json())
  ]);
  state.data.stats = stats;
  state.data.bounds = bounds;
}

// ════════════════════════════════════════════════════════
// MAP
// ════════════════════════════════════════════════════════
let map, basemapLayers = {}, currentBasemap, overlayLayers = {}, geojsonLayers = {};

function initMap() {
  const c = state.data.bounds.center;
  map = L.map('leaflet-map', {
    center: [c.lat, c.lng],
    zoom: 9,
    zoomControl: false,
    attributionControl: true
  });

  L.control.zoom({ position: 'topright' }).addTo(map);

  // Basemap layers
  basemapLayers.carto = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO',
    subdomains: 'abcd', maxZoom: 19
  });
  basemapLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO',
    subdomains: 'abcd', maxZoom: 19
  });
  basemapLayers.sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri', maxZoom: 19
  });
  basemapLayers.topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenTopoMap (CC-BY-SA)',
    subdomains: 'abc', maxZoom: 17
  });
  currentBasemap = basemapLayers.carto;
  currentBasemap.addTo(map);

  // Mouse move metadata
  const metaLat = document.getElementById('meta-lat');
  const metaLng = document.getElementById('meta-lng');
  const metaZoom = document.getElementById('meta-zoom');
  map.on('mousemove', e => {
    metaLat.textContent = e.latlng.lat.toFixed(4);
    metaLng.textContent = e.latlng.lng.toFixed(4);
  });
  map.on('zoomend', () => { metaZoom.textContent = map.getZoom(); });
  metaZoom.textContent = map.getZoom();

  // Province boundary box (subtle visual frame)
  const b = state.data.bounds.chiangmai_bounds;
  L.rectangle([[b.south, b.west], [b.north, b.east]], {
    color: '#355a28', weight: 1, fillOpacity: 0, dashArray: '4,4', interactive: false
  }).addTo(map);

  // Load GeoJSON layers (lazy - only init objects, fetch on demand)
  initGeoJSONLayers();

  // Apply initial layer state
  applyLayers();
  updateLegend();
}

function initGeoJSONLayers() {
  // Province boundary
  fetch('data/geojson/province.geojson')
    .then(r => r.json())
    .then(geo => {
      geojsonLayers.province = L.geoJSON(geo, {
        style: { color: '#25431a', weight: 2.5, fillOpacity: 0, dashArray: '6,4', interactive: false }
      });
      if (state.layers.province) geojsonLayers.province.addTo(map);
    })
    .catch(err => console.warn('province.geojson load failed', err));

  // District (amphoe) boundary + interactivity
  fetch('data/geojson/amphoe.geojson')
    .then(r => r.json())
    .then(geo => {
      geojsonLayers.amphoe = L.geoJSON(geo, {
        style: feat => amphoeStyle(feat),
        onEachFeature: (feat, layer) => {
          const p = feat.properties;
          // Hover tooltip — ชื่ออำเภอ
          layer.bindTooltip(
            `<strong>${p.AP_EN}</strong><br><span style="opacity:.7">${p.AP_TN || ''}</span>`,
            { sticky: true, direction: 'top', className: 'amphoe-tooltip' }
          );
          // Hover highlight
          layer.on('mouseover', e => {
            e.target.setStyle({ weight: 2.5, color: '#0d1c09' });
            e.target.bringToFront();
          });
          layer.on('mouseout', e => {
            geojsonLayers.amphoe.resetStyle(e.target);
          });
          // Click → info panel
          layer.on('click', () => showAmphoeInfo(p));
        }
      });
      if (state.layers.amphoe) geojsonLayers.amphoe.addTo(map);
    })
    .catch(err => console.warn('amphoe.geojson load failed', err));

  // Forest vector polygons - dissolved
  fetch('data/geojson/forest_dissolved.geojson')
    .then(r => r.json())
    .then(geo => {
      geojsonLayers['forest-vector'] = L.geoJSON(geo, {
        style: feat => {
          const g = feat.properties.Group3;
          const colors = {
            'Evergreen_Forest': '#1f5a1a',
            'Deciduous_Forest': '#7a9a3d',
            'Non_Forest':       '#c8b070'
          };
          return {
            color: colors[g] || '#666',
            weight: 0.5,
            fillColor: colors[g] || '#999',
            fillOpacity: 0.55
          };
        },
        onEachFeature: (feat, layer) => {
          const p = feat.properties;
          layer.on('click', () => {
            showInfoPanel('Forest Group', p.Group3.replace('_', ' '), [
              ['Type', p.Group3.replace('_', ' ')],
              ['Total area (km²)', fmt.dec(p.km2, 2)]
            ]);
          });
        }
      });
      if (state.layers['forest-vector']) geojsonLayers['forest-vector'].addTo(map);
    })
    .catch(err => console.warn('forest_dissolved.geojson load failed', err));

  // Sample points
  Promise.all([
    fetch('data/geojson/point_forest.geojson').then(r => r.json()),
    fetch('data/geojson/point_non_forest.geojson').then(r => r.json())
  ]).then(([fwd, nfwd]) => {
    const pointStyle = {
      radius: 2.5, weight: 0.5, color: '#fff', fillOpacity: 0.85
    };
    const forestPts = L.geoJSON(fwd, {
      pointToLayer: (f, latlng) => L.circleMarker(latlng, { ...pointStyle, fillColor: '#2c6e8f' })
    });
    const nonForestPts = L.geoJSON(nfwd, {
      pointToLayer: (f, latlng) => L.circleMarker(latlng, { ...pointStyle, fillColor: '#b85432' })
    });
    geojsonLayers.points = L.layerGroup([forestPts, nonForestPts]);
    if (state.layers.points) geojsonLayers.points.addTo(map);
  }).catch(err => console.warn('points load failed', err));
}

// ── Raster overlays (PNG) ───────────────────────────────
function getOverlayURL(layerKey, year) {
  const map = {
    'agb': `AGB_${year}.png`,
    'co2': `CO2_${year}.png`,
    'forestmap': `ForestMap_${year}.png`,
    'change': 'Change.png'
  };
  const file = map[layerKey];
  return file ? `data/overlays/${file}` : null;
}

function getOrCreateRasterOverlay(layerKey) {
  const year = layerKey === 'change' ? '2023' : state.year;
  const cacheKey = `${layerKey}-${year}`;
  if (overlayLayers[cacheKey]) return overlayLayers[cacheKey];

  const url = getOverlayURL(layerKey, year);
  if (!url) return null;
  const b = state.data.bounds.chiangmai_bounds;
  const bounds = [[b.south, b.west], [b.north, b.east]];
  const overlay = L.imageOverlay(url, bounds, {
    opacity: state.opacity,
    errorOverlayUrl: '',
    interactive: false
  });
  overlay.on('error', () => {
    console.warn(`overlay missing: ${url}`);
  });
  overlayLayers[cacheKey] = overlay;
  return overlay;
}

function applyLayers() {
  // Remove all overlays first
  Object.values(overlayLayers).forEach(l => map.removeLayer(l));

  // Apply raster overlays based on state
  ['forestmap', 'agb', 'co2', 'change'].forEach(key => {
    if (state.layers[key]) {
      const overlay = getOrCreateRasterOverlay(key);
      if (overlay) overlay.setOpacity(state.opacity).addTo(map);
    }
  });

  // Vector layers
  ['province', 'amphoe', 'forest-vector', 'points'].forEach(key => {
    const layer = geojsonLayers[key];
    if (!layer) return;
    if (state.layers[key] || (key === 'amphoe' && state.layers['amphoe-choropleth'])) {
      if (!map.hasLayer(layer)) layer.addTo(map);
    } else {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
  });
}

function updateLegend() {
  const el = document.getElementById('legend-content');
  const active = Object.keys(state.layers).filter(k => state.layers[k]);
  if (active.length === 0) {
    el.innerHTML = '<div class="legend-empty">เลือกชั้นข้อมูลเพื่อแสดงคำอธิบายสัญลักษณ์</div>';
    return;
  }
  const legends = active.map(key => {
    if (key === 'agb') return legendGradient('AGB (Mg/ha)', '#fff7d1', '#d97706', '0', '300+');
    if (key === 'co2') return legendGradient('CO₂ (Mg/ha)', '#e0e7ff', '#4338ca', '0', '500+');
    if (key === 'forestmap') return legendCategorical('Forest Classification', [
      ['#1f5a1a', 'Evergreen'], ['#7a9a3d', 'Deciduous'], ['#c8b070', 'Non-forest']
    ]);
    if (key === 'change') return legendCategorical('Change 2019→2023', [
      ['#b85432', 'Forest loss'], ['#4a7339', 'Forest gain'], ['#8a8a7f', 'No change']
    ]);
    if (key === 'forest-vector') return legendCategorical('Forest Type', [
      ['#1f5a1a', 'Evergreen'], ['#7a9a3d', 'Deciduous'], ['#c8b070', 'Non-forest']
    ]);
    if (key === 'points') return legendCategorical('Sample Points', [
      ['#2c6e8f', 'Forest'], ['#b85432', 'Non-forest']
    ]);
    if (key === 'amphoe-choropleth') {
      const labels = {
        'forest_2023_ha':       'Forest area 2023 (ha)',
        'mean_agb_2023_Mg_ha':  'Mean AGB 2023 (Mg/ha)',
        'mean_co2_2023_Mg_ha':  'Mean CO₂ 2023 (Mg/ha)',
        'delta_forest_pct':     'ΔForest 2019→2023 (%)'
      };
      const [lo, hi] = getMetricRange(state.metric);
      if (state.metric.startsWith('delta_')) {
        const m = Math.max(Math.abs(lo), Math.abs(hi));
        return legendGradient(labels[state.metric], '#b85432', '#25431a',
          `−${m.toFixed(1)}`, `+${m.toFixed(1)}`);
      }
      return legendGradient(labels[state.metric], '#f3f7f2', '#0d1c09',
        fmt.int(lo), fmt.int(hi));
    }
    if (key === 'province' || key === 'amphoe') return ''; // เส้นขอบเปล่าๆ ไม่ต้องมี legend
    return '';
  }).filter(Boolean);
  el.innerHTML = legends.join('<div style="height:8px"></div>');
}

function legendGradient(title, c1, c2, lo, hi) {
  return `
    <div>
      <div class="legend-title">${title}</div>
      <div class="legend-gradient" style="background:linear-gradient(to right, ${c1}, ${c2})"></div>
      <div class="legend-scale"><span>${lo}</span><span>${hi}</span></div>
    </div>
  `;
}
function legendCategorical(title, items) {
  return `
    <div>
      <div class="legend-title">${title}</div>
      ${items.map(([c, l]) => `
        <div class="legend-item">
          <div style="width:14px;height:14px;background:${c};border-radius:2px;flex-shrink:0"></div>
          <div>${l}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ════════════════════════════════════════════════════════
// CONTROLS
// ════════════════════════════════════════════════════════
function initControls() {
  // Year toggle
  document.querySelectorAll('#year-seg button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#year-seg button').forEach(b => b.classList.remove('seg-on'));
      btn.classList.add('seg-on');
      state.year = btn.dataset.year;
      applyLayers();
    });
  });

  // Layer toggles
  document.querySelectorAll('#layer-list input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      state.layers[cb.dataset.layer] = cb.checked;

      // โชว์/ซ่อน metric picker เมื่อเปิด choropleth
      if (cb.dataset.layer === 'amphoe-choropleth') {
        document.getElementById('choropleth-ctrl').hidden = !cb.checked;
        // ถ้าเปิด choropleth ต้องเปิด amphoe layer ด้วย
        if (cb.checked) {
          state.layers.amphoe = true;
          const ampCb = document.querySelector('#layer-list input[data-layer="amphoe"]');
          if (ampCb) ampCb.checked = true;
        }
      }

      applyLayers();
      if (geojsonLayers.amphoe) geojsonLayers.amphoe.setStyle(amphoeStyle);
      updateLegend();
    });
  });

  // Metric picker
  document.querySelectorAll('#metric-seg button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#metric-seg button').forEach(b => b.classList.remove('seg-on'));
      btn.classList.add('seg-on');
      state.metric = btn.dataset.metric;
      if (geojsonLayers.amphoe) geojsonLayers.amphoe.setStyle(amphoeStyle);
      updateLegend();
    });
  });

  // Opacity
  const opSlider = document.getElementById('opacity-slider');
  const opVal = document.getElementById('opacity-val');
  opSlider.addEventListener('input', () => {
    state.opacity = opSlider.value / 100;
    opVal.textContent = opSlider.value;
    Object.values(overlayLayers).forEach(l => { if (map.hasLayer(l)) l.setOpacity(state.opacity); });
  });

  // Basemap
  document.querySelectorAll('#basemap-seg button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#basemap-seg button').forEach(b => b.classList.remove('seg-on'));
      btn.classList.add('seg-on');
      const key = btn.dataset.basemap;
      if (currentBasemap) map.removeLayer(currentBasemap);
      currentBasemap = basemapLayers[key];
      currentBasemap.addTo(map);
    });
  });

  // Info panel close
  document.getElementById('info-close').addEventListener('click', () => {
    document.getElementById('info-panel').hidden = true;
  });
}

function showInfoPanel(eyebrow, title, rows) {
  document.getElementById('info-eyebrow').textContent = eyebrow;
  document.getElementById('info-title').textContent = title;
  document.getElementById('info-body').innerHTML = rows.map(([k, v]) => `
    <div class="info-row">
      <span class="info-label">${k}</span>
      <span class="info-value">${v}</span>
    </div>
  `).join('');
  document.getElementById('info-panel').hidden = false;
}

// ════════════════════════════════════════════════════════
// STATS RENDERING
// ════════════════════════════════════════════════════════
function renderHeroStats() {
  const s = state.data.stats.summary;
  const deltaForest = s.forest_area_2023_ha - s.forest_area_2019_ha;
  const deltaForestPct = (deltaForest / s.forest_area_2019_ha) * 100;
  const deltaCO2 = s.total_co2_2023_Mg - s.total_co2_2019_Mg;
  const deltaCO2Pct = (deltaCO2 / s.total_co2_2019_Mg) * 100;

  const cards = [
    {
      label: 'Province area',
      value: fmt.int(s.total_area_ha / 1000),
      unit: 'k hectares',
      delta: null
    },
    {
      label: 'Forest cover 2023',
      value: fmt.int(s.forest_area_2023_ha / 1000),
      unit: 'k hectares',
      delta: { val: deltaForestPct, dir: deltaForest >= 0 ? 'up' : 'down', label: 'since 2019' }
    },
    {
      label: 'Mean AGB 2023',
      value: fmt.dec(s.mean_agb_2023_Mg_ha, 1),
      unit: 'Mg / hectare',
      delta: { val: ((s.mean_agb_2023_Mg_ha - s.mean_agb_2019_Mg_ha) / s.mean_agb_2019_Mg_ha) * 100, dir: 'up', label: 'vs 2019' }
    },
    {
      label: 'Total CO₂ stored',
      value: fmt.dec(s.total_co2_2023_Mg / 1e6, 1),
      unit: 'megatonnes',
      delta: { val: deltaCO2Pct, dir: 'up', label: 'vs 2019' }
    }
  ];

  document.getElementById('hero-stats').innerHTML = cards.map(c => `
    <div class="hero-stat">
      <div class="hero-stat-label">${c.label}</div>
      <div class="hero-stat-value">${c.value}</div>
      <div class="hero-stat-unit">${c.unit}</div>
      ${c.delta ? `
        <div class="hero-stat-delta ${c.delta.dir === 'up' ? 'delta-up' : 'delta-down'}">
          <span>${c.delta.dir === 'up' ? '↑' : '↓'}</span>
          <span>${Math.abs(c.delta.val).toFixed(1)}% ${c.delta.label}</span>
        </div>
      ` : ''}
    </div>
  `).join('');
}

function renderBigNumbers() {
  const s = state.data.stats.summary;
  const cards = [
    { label: 'Forest area · 2019',  value: fmt.int(s.forest_area_2019_ha), unit: 'hectares' },
    { label: 'Forest area · 2023',  value: fmt.int(s.forest_area_2023_ha), unit: 'hectares',
      delta: ((s.forest_area_2023_ha - s.forest_area_2019_ha) / s.forest_area_2019_ha) * 100 },
    { label: 'Total AGB · 2023',    value: fmt.dec(s.total_agb_2023_Mg / 1e6, 2), unit: 'million Mg',
      delta: ((s.total_agb_2023_Mg - s.total_agb_2019_Mg) / s.total_agb_2019_Mg) * 100 },
    { label: 'Total CO₂ · 2023',    value: fmt.dec(s.total_co2_2023_Mg / 1e6, 2), unit: 'million Mg CO₂',
      delta: ((s.total_co2_2023_Mg - s.total_co2_2019_Mg) / s.total_co2_2019_Mg) * 100 }
  ];

  document.getElementById('big-numbers').innerHTML = cards.map(c => `
    <div class="big-stat">
      <div class="big-stat-label">${c.label}</div>
      <div class="big-stat-value">${c.value}</div>
      <div class="big-stat-unit">${c.unit}</div>
      ${c.delta != null ? `
        <div class="big-stat-delta ${c.delta >= 0 ? 'delta-up' : 'delta-down'}">
          <span>${c.delta >= 0 ? '↑' : '↓'}</span>
          <span>${Math.abs(c.delta).toFixed(2)}% change since 2019</span>
        </div>
      ` : ''}
    </div>
  `).join('');
}

function renderDistrictsTable() {
  const districts = [...state.data.stats.districts].sort((a, b) => b.forest_2023_ha - a.forest_2023_ha);
  const tbody = document.querySelector('#districts-table tbody');
  const renderRows = (filter = '') => {
    const list = districts.filter(d => d.AP_EN.toLowerCase().includes(filter.toLowerCase()));
    tbody.innerHTML = list.map((d, i) => {
      const delta = d.forest_2023_ha - d.forest_2019_ha;
      const deltaPct = (delta / d.forest_2019_ha) * 100;
      return `
        <tr data-name="${d.AP_EN}">
          <td>${i + 1}</td>
          <td><strong>${d.AP_EN}</strong></td>
          <td class="num">${fmt.int(d.total_area_ha)}</td>
          <td class="num">${fmt.int(d.forest_2019_ha)}</td>
          <td class="num">${fmt.int(d.forest_2023_ha)}</td>
          <td class="num ${delta >= 0 ? 'delta-pos' : 'delta-neg'}">${delta >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%</td>
          <td class="num">${fmt.int(d.total_co2_2023_Mg)}</td>
        </tr>
      `;
    }).join('');
  };
  renderRows();
  document.getElementById('district-search').addEventListener('input', e => renderRows(e.target.value));
}

// ════════════════════════════════════════════════════════
// CHARTS (Chart.js)
// ════════════════════════════════════════════════════════
const chartColors = {
  green: '#4a7339',
  greenLight: '#98b48a',
  amber: '#d7942b',
  azure: '#2c6e8f',
  rust: '#b85432',
  olive: '#a8b54a'
};

Chart.defaults.font.family = '"IBM Plex Sans", "IBM Plex Sans Thai", sans-serif';
Chart.defaults.font.size = 12;
Chart.defaults.color = '#4a4a3f';
Chart.defaults.borderColor = '#e8e4d2';

function renderCharts() {
  // 1) Forest area by type (2019 vs 2023)
  const ft = state.data.stats.forest_types;
  new Chart(document.getElementById('chart-forest-type'), {
    type: 'bar',
    data: {
      labels: ft.map(d => d.forest_type),
      datasets: [
        { label: '2019', data: ft.map(d => d.forest_area_2019_ha), backgroundColor: chartColors.greenLight },
        { label: '2023', data: ft.map(d => d.forest_area_2023_ha), backgroundColor: chartColors.green }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, padding: 14 } } },
      scales: {
        y: { ticks: { callback: v => (v / 1000).toFixed(0) + 'k ha' } }
      }
    }
  });

  // 2) AGB by forest type
  new Chart(document.getElementById('chart-agb-type'), {
    type: 'bar',
    data: {
      labels: ft.map(d => d.forest_type),
      datasets: [
        { label: '2019', data: ft.map(d => d.mean_agb_2019_Mg_ha), backgroundColor: chartColors.amber, borderRadius: 2 },
        { label: '2023', data: ft.map(d => d.mean_agb_2023_Mg_ha), backgroundColor: chartColors.rust, borderRadius: 2 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, padding: 14 } } },
      scales: {
        y: { ticks: { callback: v => v + ' Mg/ha' } }
      }
    }
  });

  // 3) Feature importance regressor (horizontal bar)
  const feat = state.data.stats.feature_importance_regressor;
  new Chart(document.getElementById('chart-feat-reg'), {
    type: 'bar',
    data: {
      labels: feat.map(d => d.band),
      datasets: [{
        label: 'Importance (%)',
        data: feat.map(d => d.importance_pct),
        backgroundColor: feat.map((_, i) => {
          const t = i / (feat.length - 1);
          return `rgb(${Math.round(53 + (216 - 53) * t)}, ${Math.round(90 + (148 - 90) * t)}, ${Math.round(40 + (43 - 40) * t)})`;
        }),
        borderRadius: 3
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { callback: v => v + '%' } }
      }
    }
  });
}

function renderMetrics() {
  // Validation regression metrics
  const v = state.data.stats.validation_regression[0];
  const u = state.data.stats.uncertainty;
  const agb19 = u.find(x => x.variable === 'AGB_2019_Mg_ha');
  const agb23 = u.find(x => x.variable === 'AGB_2023_Mg_ha');

  document.getElementById('metric-grid').innerHTML = [
    { label: 'R²', value: v ? v.R2.toFixed(3) : '—', unit: 'goodness of fit' },
    { label: 'RMSE', value: v ? v.RMSE_Mg_ha.toFixed(1) : '—', unit: 'Mg/ha' },
    { label: 'MAE', value: v ? v.MAE_Mg_ha.toFixed(1) : '—', unit: 'Mg/ha' },
    { label: 'n samples', value: v ? fmt.int(v.n_train + v.n_test) : '—', unit: 'train + test' }
  ].map(m => `
    <div class="metric-cell">
      <div class="metric-cell-label">${m.label}</div>
      <div class="metric-cell-value">${m.value}</div>
      <div class="metric-cell-unit">${m.unit}</div>
    </div>
  `).join('');

  // Accuracy
  const acc = state.data.stats.accuracy_by_forest_type;
  document.getElementById('accuracy-grid').innerHTML = acc.map(a => `
    <div class="metric-cell">
      <div class="metric-cell-label">${a.forest_type.replace('_', ' ')}</div>
      <div class="metric-cell-value">${(a.detection_rate * 100).toFixed(1)}%</div>
      <div class="metric-cell-unit">detection rate</div>
    </div>
  `).join('');
}

// ════════════════════════════════════════════════════════
// NEW FUNCTIONS: AMPHOE CHOROPLETH & INFO
// ════════════════════════════════════════════════════════

// ── Amphoe styling (choropleth or plain) ──────────────
function amphoeStyle(feat) {
  if (state.layers['amphoe-choropleth']) {
    const v = feat.properties[state.metric];
    return {
      color: '#4a7339',
      weight: 0.8,
      fillColor: choroplethColor(v),
      fillOpacity: 0.78
    };
  }
  return {
    color: '#4a7339',
    weight: 1,
    fillColor: '#98b48a',
    fillOpacity: 0.08    // โปร่งเกือบสุด เห็นแค่เส้นขอบ
  };
}

// ── Color ramp for choropleth ─────────────────────────
function choroplethColor(value) {
  if (value == null || isNaN(value)) return '#e8e4d2';
  const range = getMetricRange(state.metric);
  const ramp = state.metric.startsWith('delta_')
    ? ['#b85432', '#d7942b', '#fdfcf7', '#98b48a', '#25431a']   // diverging
    : ['#f3f7f2', '#c6d6bc', '#6a9059', '#355a28', '#0d1c09'];  // sequential green

  let t;
  if (state.metric.startsWith('delta_')) {
    const m = Math.max(Math.abs(range[0]), Math.abs(range[1]));
    t = (value + m) / (2 * m);
  } else {
    t = (value - range[0]) / (range[1] - range[0]);
  }
  t = Math.max(0, Math.min(1, t));
  const seg = t * (ramp.length - 1);
  const i = Math.floor(seg);
  if (i >= ramp.length - 1) return ramp[ramp.length - 1];
  return lerpHex(ramp[i], ramp[i + 1], seg - i);
}

function lerpHex(a, b, t) {
  const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
  const ar = ah >> 16, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
  const br = bh >> 16, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
  return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
}

function getMetricRange(metric) {
  const vals = state.data.stats.districts
    .map(d => d[metric])
    .filter(v => v != null && !isNaN(v));
  return [Math.min(...vals), Math.max(...vals)];
}

// ── Click an amphoe → fill info panel ─────────────────
function showAmphoeInfo(p) {
  const dPct = p.delta_forest_pct;
  const dSign = dPct >= 0 ? '+' : '';
  showInfoPanel('District · อำเภอ', `${p.AP_EN}`, [
    ['Thai name',        p.AP_TN || '—'],
    ['Total area',       fmt.ha(p.total_area_ha)],
    ['Forest 2019',      fmt.ha(p.forest_2019_ha)],
    ['Forest 2023',      fmt.ha(p.forest_2023_ha)],
    ['ΔForest',          `${dSign}${dPct.toFixed(1)}%`],
    ['Mean AGB 2023',    `${p.mean_agb_2023_Mg_ha.toFixed(1)} Mg/ha`],
    ['Mean CO₂ 2023',    `${p.mean_co2_2023_Mg_ha.toFixed(1)} Mg/ha`],
    ['Total CO₂ 2023',   fmt.mg(p.total_co2_2023_Mg)]
  ]);
}