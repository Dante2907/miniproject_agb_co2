/* ════════════════════════════════════════════════════════
   Chiang Mai Forest Atlas — main.js
   ════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────
const state = {
  year: '2019',          // '2019' | '2023' | 'compare'
  basemap: 'carto',
  opacity: 0.75,
  metric: 'forest_2023_ha',
  comparePct: 0.5,       // 0..1, position of compare slider
  sort: { key: 'forest_2023_ha', dir: 'desc' },
  selectedAmphoe: null,  // AP_EN of clicked district
  lastFocus: null,       // restore focus after info-panel closes
  layers: {
    province: true,
    amphoe: true,
    'amphoe-choropleth': false,
    agb: false,
    co2: false,
    forestmap: true,
    change: false,
    'forest-vector': false,
    points: false
  },
  data: { stats: null, bounds: null, amphoeGeo: null }
};

// ── Number formatters ───────────────────────────────────
const fmt = {
  int: n => (n == null || isNaN(n)) ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n),
  ha:  n => (n == null || isNaN(n)) ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) + ' ha',
  mg:  n => (n == null || isNaN(n)) ? '—' : (n / 1e6).toFixed(2) + ' Mt',
  pct: n => (n == null || isNaN(n)) ? '—' : n.toFixed(1) + '%',
  dec: (n, d = 2) => (n == null || isNaN(n)) ? '—' : n.toFixed(d)
};

// ── Init on load ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadCoreData();
    initMap();
    initControls();
    renderHeroStats();
    renderBigNumbers();
    renderDistrictsTable();
    renderCharts();
    renderMetrics();
  } catch (err) {
    console.error('Init error:', err);
    const hero = document.getElementById('hero-stats');
    if (hero) hero.innerHTML = '<div class="stat-loading">Data could not be loaded. Check console.</div>';
  }
});

// ── Load JSON data ──────────────────────────────────────
async function loadCoreData() {
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
let map, basemapLayers = {}, currentBasemap;
const overlayLayers = {};        // cache key -> L.imageOverlay
const geojsonLayers = {};        // key -> L.layer
const geojsonLoadPromises = {};  // key -> Promise (for lazy load dedup)
let initialView = null;
let pendingOverlays = 0;         // counter for loading indicator
let compareClip = null;          // current clip CSS for "right" overlay (2023)

function initMap() {
  const c = state.data.bounds.center;
  initialView = { center: [c.lat, c.lng], zoom: 9 };

  map = L.map('leaflet-map', {
    center: initialView.center,
    zoom: initialView.zoom,
    zoomControl: false,
    attributionControl: true
  });

  L.control.zoom({ position: 'topright' }).addTo(map);

  // ── Reset Map control ─────────────────────────────────
  const ResetCtrl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function () {
      const btn = L.DomUtil.create('a', 'leaflet-bar leaflet-control map-reset-btn');
      btn.href = '#';
      btn.title = 'คืนมุมมองแผนที่เริ่มต้น (Reset view)';
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', 'Reset map view');
      btn.innerHTML = `
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <path d="M4 10a6 6 0 1 1 1.76 4.24" fill="none" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round"/>
          <path d="M4 5.5V10h4.5" fill="none" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.on(btn, 'click', function (e) {
        L.DomEvent.preventDefault(e);
        map.flyTo(initialView.center, initialView.zoom, { duration: 0.6 });
      });
      return btn;
    }
  });
  new ResetCtrl().addTo(map);

  // ── Basemap layers ────────────────────────────────────
  basemapLayers.carto = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO', subdomains: 'abcd', maxZoom: 19
  });
  basemapLayers.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO', subdomains: 'abcd', maxZoom: 19
  });
  basemapLayers.sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri', maxZoom: 19
  });
  basemapLayers.topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenTopoMap (CC-BY-SA)', subdomains: 'abc', maxZoom: 17
  });
  currentBasemap = basemapLayers.carto;
  currentBasemap.addTo(map);

  // Mouse meta
  const metaLat = document.getElementById('meta-lat');
  const metaLng = document.getElementById('meta-lng');
  const metaZoom = document.getElementById('meta-zoom');
  map.on('mousemove', e => {
    metaLat.textContent = e.latlng.lat.toFixed(4);
    metaLng.textContent = e.latlng.lng.toFixed(4);
  });
  map.on('zoomend', () => { metaZoom.textContent = map.getZoom(); });
  metaZoom.textContent = map.getZoom();

  // Province boundary frame
  const b = state.data.bounds.chiangmai_bounds;
  L.rectangle([[b.south, b.west], [b.north, b.east]], {
    color: '#355a28', weight: 1, fillOpacity: 0, dashArray: '4,4', interactive: false
  }).addTo(map);

  // Eagerly load amphoe + province (small files, needed for default view)
  ensureGeoJSON('province');
  ensureGeoJSON('amphoe');

  // Compare slider drag setup (handle is hidden until user picks 'compare')
  initCompareHandle();

  applyLayers();
  updateLegend();
}

// ── Lazy-load GeoJSON layers on demand ──────────────────
function ensureGeoJSON(key) {
  if (geojsonLayers[key]) return Promise.resolve(geojsonLayers[key]);
  if (geojsonLoadPromises[key]) return geojsonLoadPromises[key];

  const builders = {
    province: () => fetch('data/geojson/province.geojson').then(r => r.json()).then(geo => {
      return L.geoJSON(geo, {
        style: { color: '#25431a', weight: 2.5, fillOpacity: 0, dashArray: '6,4', interactive: false }
      });
    }),
    amphoe: () => fetch('data/geojson/amphoe.geojson').then(r => r.json()).then(geo => {
      state.data.amphoeGeo = geo;
      return L.geoJSON(geo, {
        style: feat => amphoeStyle(feat),
        onEachFeature: (feat, layer) => {
          const p = feat.properties;
          layer.bindTooltip(
            `<strong>${p.AP_EN}</strong><br><span style="opacity:.75">${p.AP_TN || ''}</span>`,
            { sticky: true, direction: 'top', className: 'amphoe-tooltip' }
          );
          layer.on('mouseover', e => {
            if (state.selectedAmphoe === p.AP_EN) return;
            e.target.setStyle({ weight: 2.5, color: '#0d1c09' });
            e.target.bringToFront();
          });
          layer.on('mouseout', e => {
            if (state.selectedAmphoe === p.AP_EN) return;
            geojsonLayers.amphoe.resetStyle(e.target);
          });
          layer.on('click', () => selectAmphoe(p.AP_EN));
        }
      });
    }),
    'forest-vector': () => fetch('data/geojson/forest_dissolved.geojson').then(r => r.json()).then(geo => {
      return L.geoJSON(geo, {
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
            showInfoPanel('Forest Group', (p.Group3 || '').replace(/_/g, ' '), [
              ['Type', (p.Group3 || '').replace(/_/g, ' ')],
              ['Total area (km²)', fmt.dec(p.km2, 2)]
            ]);
          });
        }
      });
    }),
    points: () => Promise.all([
      fetch('data/geojson/point_forest.geojson').then(r => r.json()),
      fetch('data/geojson/point_non_forest.geojson').then(r => r.json())
    ]).then(([fwd, nfwd]) => {
      const ptStyle = { radius: 2.5, weight: 0.5, color: '#fff', fillOpacity: 0.85 };
      const fL  = L.geoJSON(fwd,  { pointToLayer: (f, ll) => L.circleMarker(ll, { ...ptStyle, fillColor: '#2c6e8f' }) });
      const nfL = L.geoJSON(nfwd, { pointToLayer: (f, ll) => L.circleMarker(ll, { ...ptStyle, fillColor: '#b85432' }) });
      return L.layerGroup([fL, nfL]);
    })
  };

  if (!builders[key]) return Promise.resolve(null);

  geojsonLoadPromises[key] = builders[key]()
    .then(layer => {
      geojsonLayers[key] = layer;
      return layer;
    })
    .catch(err => {
      console.warn(`geojson "${key}" load failed`, err);
      return null;
    });

  return geojsonLoadPromises[key];
}

// ── Raster overlays (PNG) ───────────────────────────────
function getOverlayURL(layerKey, year) {
  const fileMap = {
    'agb':       `AGB_${year}.png`,
    'co2':       `CO2_${year}.png`,
    'forestmap': `ForestMap_${year}.png`,
    'change':    'Change.png'
  };
  const file = fileMap[layerKey];
  return file ? `data/overlays/${file}` : null;
}

function getOrCreateRasterOverlay(layerKey, yearOverride) {
  // year: change is fixed; otherwise use override (for compare) or state.year
  const year = layerKey === 'change' ? '2023' : (yearOverride || state.year);
  const cacheKey = `${layerKey}-${year}`;
  if (overlayLayers[cacheKey]) return overlayLayers[cacheKey];

  const url = getOverlayURL(layerKey, year);
  if (!url) return null;

  const b = state.data.bounds.chiangmai_bounds;
  const bounds = [[b.south, b.west], [b.north, b.east]];

  pendingOverlays++;
  toggleMapLoading(true);

  const overlay = L.imageOverlay(url, bounds, {
    opacity: state.opacity,
    interactive: false,
    className: `raster-overlay raster-${layerKey} raster-year-${year}`
  });
  overlay.on('load', () => {
    pendingOverlays = Math.max(0, pendingOverlays - 1);
    toggleMapLoading(pendingOverlays > 0);
  });
  overlay.on('error', () => {
    pendingOverlays = Math.max(0, pendingOverlays - 1);
    toggleMapLoading(pendingOverlays > 0);
    console.warn(`overlay missing: ${url}`);
  });
  overlayLayers[cacheKey] = overlay;
  return overlay;
}

function toggleMapLoading(show) {
  const el = document.getElementById('map-loading');
  if (el) el.hidden = !show;
}

// ── Apply layers based on state ─────────────────────────
function applyLayers() {
  // Remove all raster overlays first
  Object.values(overlayLayers).forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });

  const isCompare = state.year === 'compare';

  // For raster overlays
  ['forestmap', 'agb', 'co2'].forEach(key => {
    if (!state.layers[key]) return;
    if (isCompare) {
      // add BOTH years; clip applied via CSS
      const o19 = getOrCreateRasterOverlay(key, '2019');
      const o23 = getOrCreateRasterOverlay(key, '2023');
      if (o19) o19.setOpacity(state.opacity).addTo(map);
      if (o23) o23.setOpacity(state.opacity).addTo(map);
    } else {
      const overlay = getOrCreateRasterOverlay(key);
      if (overlay) overlay.setOpacity(state.opacity).addTo(map);
    }
  });

  // change layer ignores compare (single layer)
  if (state.layers.change) {
    const overlay = getOrCreateRasterOverlay('change');
    if (overlay) overlay.setOpacity(state.opacity).addTo(map);
  }

  // Compare clip
  applyCompareClip();
  document.getElementById('compare-handle').hidden = !isCompare;

  // Vector layers (lazy load)
  ['province', 'amphoe', 'forest-vector', 'points'].forEach(key => {
    const wantedByLayer  = !!state.layers[key];
    // amphoe is required when choropleth is on too
    const wantedByExtra  = (key === 'amphoe') && state.layers['amphoe-choropleth'];
    const wanted = wantedByLayer || wantedByExtra;

    if (wanted) {
      ensureGeoJSON(key).then(layer => {
        if (!layer) return;
        // re-check state after async load
        const stillWanted = !!state.layers[key] || ((key === 'amphoe') && state.layers['amphoe-choropleth']);
        if (stillWanted && !map.hasLayer(layer)) layer.addTo(map);
      });
    } else if (geojsonLayers[key] && map.hasLayer(geojsonLayers[key])) {
      map.removeLayer(geojsonLayers[key]);
    }
  });
}

// ── Compare slider ──────────────────────────────────────
function initCompareHandle() {
  const handle = document.getElementById('compare-handle');
  if (!handle) return;
  const wrap = document.querySelector('.map-canvas-wrap');

  let dragging = false;
  const onDown = (e) => {
    dragging = true;
    document.body.style.userSelect = 'none';
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!dragging) return;
    const rect = wrap.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    state.comparePct = Math.max(0, Math.min(1, x / rect.width));
    handle.style.left = (state.comparePct * 100) + '%';
    applyCompareClip();
  };
  const onUp = () => { dragging = false; document.body.style.userSelect = ''; };

  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);

  // initial position
  handle.style.left = (state.comparePct * 100) + '%';
}

function applyCompareClip() {
  // Clip the 2023 ("right") overlays so only the right portion shows.
  // Done by injecting/updating a <style> with calculated clip-paths.
  const styleId = 'compare-clip-style';
  let styleEl = document.getElementById(styleId);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  if (state.year !== 'compare') {
    styleEl.textContent = '';
    return;
  }
  const pct = (state.comparePct * 100).toFixed(2);
  // Right side (2023): show only x > pct
  // Left side (2019): show only x < pct
  styleEl.textContent = `
    .raster-year-2023 { clip-path: inset(0 0 0 ${pct}%); -webkit-clip-path: inset(0 0 0 ${pct}%); }
    .raster-year-2019 { clip-path: inset(0 ${100 - pct}% 0 0); -webkit-clip-path: inset(0 ${100 - pct}% 0 0); }
  `;
}

// ── Legend ──────────────────────────────────────────────
function updateLegend() {
  const el = document.getElementById('legend-content');
  const active = Object.keys(state.layers).filter(k => state.layers[k]);
  // Filter out items that have no meaningful legend
  const meaningful = active.filter(k => !['province', 'amphoe'].includes(k));
  if (meaningful.length === 0) {
    el.innerHTML = '<div class="legend-empty">เลือกชั้นข้อมูลเพื่อแสดงคำอธิบายสัญลักษณ์</div>';
    return;
  }
  const legends = meaningful.map(key => {
    if (key === 'agb') return legendGradient('AGB (Mg/ha)', '#fff7d1', '#d97706', '0', '300+');
    if (key === 'co2') return legendGradient('CO₂ (Mg/ha)', '#e0e7ff', '#4338ca', '0', '500+');
    if (key === 'forestmap') return legendCategorical('Forest Classification', [
      ['#1f5a1a', 'Evergreen'], ['#7a9a3d', 'Deciduous'], ['#c8b070', 'Non-forest']
    ]);
    if (key === 'change') return legendCategorical('Change · พ.ศ. 2562 → 2566', [
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
        'forest_2023_ha':      'Forest area · 2566 (ha)',
        'mean_agb_2023_Mg_ha': 'Mean AGB · 2566 (Mg/ha)',
        'mean_co2_2023_Mg_ha': 'Mean CO₂ · 2566 (Mg/ha)',
        'delta_forest_pct':    'Δ Forest 2562 → 2566 (%)'
      };
      const r = getMetricRange(state.metric);
      if (!r) return '';
      const [lo, hi] = r;
      if (state.metric.startsWith('delta_')) {
        const m = Math.max(Math.abs(lo), Math.abs(hi));
        return legendGradient(labels[state.metric] || state.metric,
          '#b85432', '#25431a', `−${m.toFixed(1)}`, `+${m.toFixed(1)}`, '#fdfcf7');
      }
      return legendGradient(labels[state.metric] || state.metric,
        '#f3f7f2', '#0d1c09', fmt.int(lo), fmt.int(hi));
    }
    return '';
  }).filter(Boolean);
  el.innerHTML = legends.join('<div style="height:10px"></div>') ||
    '<div class="legend-empty">No legend</div>';
}

function legendGradient(title, c1, c2, lo, hi, midColor) {
  const gradient = midColor
    ? `linear-gradient(to right, ${c1}, ${midColor}, ${c2})`
    : `linear-gradient(to right, ${c1}, ${c2})`;
  return `
    <div>
      <div class="legend-title">${title}</div>
      <div class="legend-gradient" style="background:${gradient}"></div>
      <div class="legend-scale"><span>${lo}</span><span>${hi}</span></div>
    </div>`;
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
    </div>`;
}

// ════════════════════════════════════════════════════════
// CONTROLS
// ════════════════════════════════════════════════════════
function initControls() {
  // Year toggle
  document.querySelectorAll('#year-seg button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#year-seg button').forEach(b => {
        b.classList.remove('seg-on');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('seg-on');
      btn.setAttribute('aria-pressed', 'true');
      state.year = btn.dataset.year;
      applyLayers();
    });
  });

  // Layer toggles
  document.querySelectorAll('#layer-list input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const layerKey = cb.dataset.layer;
      state.layers[layerKey] = cb.checked;

      if (layerKey === 'amphoe-choropleth') {
        document.getElementById('choropleth-ctrl').hidden = !cb.checked;
      }

      applyLayers();
      // restyle amphoe to switch between plain border / choropleth
      if (geojsonLayers.amphoe) geojsonLayers.amphoe.setStyle(amphoeStyle);
      // re-apply selected highlight (resetStyle wipes it)
      if (state.selectedAmphoe) highlightSelectedAmphoe();
      updateLegend();
    });
  });

  // Metric picker (choropleth)
  document.querySelectorAll('#metric-seg button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#metric-seg button').forEach(b => {
        b.classList.remove('seg-on');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('seg-on');
      btn.setAttribute('aria-pressed', 'true');
      state.metric = btn.dataset.metric;
      if (geojsonLayers.amphoe) geojsonLayers.amphoe.setStyle(amphoeStyle);
      if (state.selectedAmphoe) highlightSelectedAmphoe();
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
      document.querySelectorAll('#basemap-seg button').forEach(b => {
        b.classList.remove('seg-on');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('seg-on');
      btn.setAttribute('aria-pressed', 'true');
      const key = btn.dataset.basemap;
      if (currentBasemap) map.removeLayer(currentBasemap);
      currentBasemap = basemapLayers[key];
      currentBasemap.addTo(map);
    });
  });

  // Info panel close
  const infoClose = document.getElementById('info-close');
  infoClose.addEventListener('click', closeInfoPanel);
  // ESC closes info panel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('info-panel').hidden) {
      closeInfoPanel();
    }
  });
}

function showInfoPanel(eyebrow, title, rows) {
  state.lastFocus = document.activeElement;
  document.getElementById('info-eyebrow').textContent = eyebrow;
  document.getElementById('info-title').textContent = title;
  document.getElementById('info-body').innerHTML = rows.map(([k, v]) => `
    <div class="info-row">
      <span class="info-label">${k}</span>
      <span class="info-value">${v}</span>
    </div>`).join('');
  const panel = document.getElementById('info-panel');
  panel.hidden = false;
  document.getElementById('info-close').focus();
}
function closeInfoPanel() {
  document.getElementById('info-panel').hidden = true;
  // clear amphoe highlight
  if (state.selectedAmphoe && geojsonLayers.amphoe) {
    geojsonLayers.amphoe.eachLayer(l => {
      if (l.feature && l.feature.properties.AP_EN === state.selectedAmphoe) {
        geojsonLayers.amphoe.resetStyle(l);
      }
    });
    state.selectedAmphoe = null;
  }
  // restore focus
  if (state.lastFocus && typeof state.lastFocus.focus === 'function') {
    try { state.lastFocus.focus(); } catch (e) { /* ignore */ }
  }
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
  const deltaAgbPct = ((s.mean_agb_2023_Mg_ha - s.mean_agb_2019_Mg_ha) / s.mean_agb_2019_Mg_ha) * 100;

  const cards = [
    { label: 'Province area',     value: fmt.int(s.total_area_ha / 1000),       unit: 'k hectares' },
    { label: 'Forest cover 2566', value: fmt.int(s.forest_area_2023_ha / 1000), unit: 'k hectares',
      delta: { val: deltaForestPct, dir: deltaForest >= 0 ? 'up' : 'down', label: 'since 2562' } },
    { label: 'Mean AGB 2566',     value: fmt.dec(s.mean_agb_2023_Mg_ha, 1),     unit: 'Mg / hectare',
      delta: { val: deltaAgbPct, dir: deltaAgbPct >= 0 ? 'up' : 'down', label: 'vs 2562' } },
    { label: 'Total CO₂ stored',  value: fmt.dec(s.total_co2_2023_Mg / 1e6, 1), unit: 'megatonnes',
      delta: { val: deltaCO2Pct, dir: deltaCO2Pct >= 0 ? 'up' : 'down', label: 'vs 2562' } }
  ];

  const wrap = document.getElementById('hero-stats');
  wrap.setAttribute('aria-busy', 'false');
  wrap.innerHTML = cards.map(c => `
    <div class="hero-stat">
      <div class="hero-stat-label">${c.label}</div>
      <div class="hero-stat-value">${c.value}</div>
      <div class="hero-stat-unit">${c.unit}</div>
      ${c.delta ? `
        <div class="hero-stat-delta ${c.delta.dir === 'up' ? 'delta-up' : 'delta-down'}">
          <span>${c.delta.dir === 'up' ? '↑' : '↓'}</span>
          <span>${Math.abs(c.delta.val).toFixed(1)}% ${c.delta.label}</span>
        </div>` : ''}
    </div>`).join('');
}

function renderBigNumbers() {
  const s = state.data.stats.summary;
  const cards = [
    { label: 'Forest area · 2562',  value: fmt.int(s.forest_area_2019_ha), unit: 'hectares' },
    { label: 'Forest area · 2566',  value: fmt.int(s.forest_area_2023_ha), unit: 'hectares',
      delta: ((s.forest_area_2023_ha - s.forest_area_2019_ha) / s.forest_area_2019_ha) * 100 },
    { label: 'Total AGB · 2566',    value: fmt.dec(s.total_agb_2023_Mg / 1e6, 2), unit: 'million Mg',
      delta: ((s.total_agb_2023_Mg - s.total_agb_2019_Mg) / s.total_agb_2019_Mg) * 100 },
    { label: 'Total CO₂ · 2566',    value: fmt.dec(s.total_co2_2023_Mg / 1e6, 2), unit: 'million Mg CO₂',
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
          <span>${Math.abs(c.delta).toFixed(2)}% since 2562</span>
        </div>` : ''}
    </div>`).join('');
}

// ── Districts table (with sort + debounced search) ──────
function getDistrictsWithDeltas() {
  return state.data.stats.districts.map(d => ({
    ...d,
    delta_forest_ha: d.forest_2023_ha - d.forest_2019_ha,
    delta_forest_pct: ((d.forest_2023_ha - d.forest_2019_ha) / d.forest_2019_ha) * 100
  }));
}

let searchFilter = '';
function renderDistrictsTable() {
  const tbody = document.querySelector('#districts-table tbody');
  const data = getDistrictsWithDeltas();

  const renderRows = () => {
    const list = data
      .filter(d => d.AP_EN.toLowerCase().includes(searchFilter.toLowerCase()))
      .sort((a, b) => {
        const k = state.sort.key;
        const av = a[k], bv = b[k];
        if (typeof av === 'string') {
          return state.sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        return state.sort.dir === 'asc' ? (av - bv) : (bv - av);
      });

    tbody.innerHTML = list.map((d, i) => {
      const dPct = d.delta_forest_pct;
      return `
        <tr data-name="${d.AP_EN}">
          <td>${i + 1}</td>
          <td><strong>${d.AP_EN}</strong></td>
          <td class="num">${fmt.int(d.total_area_ha)}</td>
          <td class="num">${fmt.int(d.forest_2019_ha)}</td>
          <td class="num">${fmt.int(d.forest_2023_ha)}</td>
          <td class="num ${dPct >= 0 ? 'delta-pos' : 'delta-neg'}">${dPct >= 0 ? '+' : ''}${dPct.toFixed(1)}%</td>
          <td class="num">${fmt.int(d.total_co2_2023_Mg)}</td>
        </tr>`;
    }).join('');

    // Update sort indicators
    document.querySelectorAll('#districts-table th.sortable').forEach(th => {
      th.classList.remove('active', 'asc', 'desc');
      const ind = th.querySelector('.sort-ind');
      if (ind) ind.textContent = '';
      if (th.dataset.sort === state.sort.key) {
        th.classList.add('active', state.sort.dir);
        if (ind) ind.textContent = state.sort.dir === 'asc' ? '▴' : '▾';
      }
    });
  };

  // Sortable headers
  document.querySelectorAll('#districts-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sort.key === key) {
        state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort.key = key;
        // default direction: text asc, number desc
        state.sort.dir = (key === 'AP_EN') ? 'asc' : 'desc';
      }
      renderRows();
    });
  });

  // Debounced search
  let searchTimer = null;
  document.getElementById('district-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const val = e.target.value;
    searchTimer = setTimeout(() => {
      searchFilter = val;
      renderRows();
    }, 150);
  });

  renderRows();
}

// ════════════════════════════════════════════════════════
// CHARTS (Chart.js)
// ════════════════════════════════════════════════════════
const chartColors = {
  green: '#4a7339', greenLight: '#98b48a',
  amber: '#d7942b', azure: '#2c6e8f',
  rust: '#b85432', olive: '#a8b54a'
};

Chart.defaults.font.family = '"IBM Plex Sans", "IBM Plex Sans Thai", sans-serif';
Chart.defaults.font.size = 12;
Chart.defaults.color = '#4a4a3f';
Chart.defaults.borderColor = '#e8e4d2';

function renderCharts() {
  const ft = state.data.stats.forest_types;

  new Chart(document.getElementById('chart-forest-type'), {
    type: 'bar',
    data: {
      labels: ft.map(d => d.forest_type),
      datasets: [
        { label: 'พ.ศ. 2562', data: ft.map(d => d.forest_area_2019_ha), backgroundColor: chartColors.greenLight },
        { label: 'พ.ศ. 2566', data: ft.map(d => d.forest_area_2023_ha), backgroundColor: chartColors.green }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, padding: 14 } } },
      scales: { y: { ticks: { callback: v => (v / 1000).toFixed(0) + 'k ha' } } }
    }
  });

  new Chart(document.getElementById('chart-agb-type'), {
    type: 'bar',
    data: {
      labels: ft.map(d => d.forest_type),
      datasets: [
        { label: 'พ.ศ. 2562', data: ft.map(d => d.mean_agb_2019_Mg_ha), backgroundColor: chartColors.amber, borderRadius: 2 },
        { label: 'พ.ศ. 2566', data: ft.map(d => d.mean_agb_2023_Mg_ha), backgroundColor: chartColors.rust,  borderRadius: 2 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, padding: 14 } } },
      scales: { y: { ticks: { callback: v => v + ' Mg/ha' } } }
    }
  });

  const feat = state.data.stats.feature_importance_regressor;
  new Chart(document.getElementById('chart-feat-reg'), {
    type: 'bar',
    data: {
      labels: feat.map(d => d.band),
      datasets: [{
        label: 'Importance (%)',
        data: feat.map(d => d.importance_pct),
        backgroundColor: feat.map((_, i) => {
          const t = i / (feat.length - 1 || 1);
          return `rgb(${Math.round(53 + (216 - 53) * t)}, ${Math.round(90 + (148 - 90) * t)}, ${Math.round(40 + (43 - 40) * t)})`;
        }),
        borderRadius: 3
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { callback: v => v + '%' } } }
    }
  });
}

function renderMetrics() {
  const v = state.data.stats.validation_regression[0];

  document.getElementById('metric-grid').innerHTML = [
    { label: 'R²',         value: v ? v.R2.toFixed(3) : '—',         unit: 'goodness of fit' },
    { label: 'RMSE',       value: v ? v.RMSE_Mg_ha.toFixed(1) : '—', unit: 'Mg/ha' },
    { label: 'MAE',        value: v ? v.MAE_Mg_ha.toFixed(1) : '—',  unit: 'Mg/ha' },
    { label: 'n samples',  value: v ? fmt.int(v.n_train + v.n_test) : '—', unit: 'train + test' }
  ].map(m => `
    <div class="metric-cell">
      <div class="metric-cell-label">${m.label}</div>
      <div class="metric-cell-value">${m.value}</div>
      <div class="metric-cell-unit">${m.unit}</div>
    </div>`).join('');

  const acc = state.data.stats.accuracy_by_forest_type;
  document.getElementById('accuracy-grid').innerHTML = acc.map(a => `
    <div class="metric-cell">
      <div class="metric-cell-label">${a.forest_type.replace(/_/g, ' ')}</div>
      <div class="metric-cell-value">${(a.detection_rate * 100).toFixed(1)}%</div>
      <div class="metric-cell-unit">detection rate</div>
    </div>`).join('');
}

// ════════════════════════════════════════════════════════
// AMPHOE: choropleth + click info
// ════════════════════════════════════════════════════════
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
    fillOpacity: 0.08
  };
}

function choroplethColor(value) {
  if (value == null || isNaN(value)) return '#e8e4d2';
  const r = getMetricRange(state.metric);
  if (!r) return '#e8e4d2';
  const [lo, hi] = r;
  const ramp = state.metric.startsWith('delta_')
    ? ['#b85432', '#d7942b', '#fdfcf7', '#98b48a', '#25431a']   // diverging
    : ['#f3f7f2', '#c6d6bc', '#6a9059', '#355a28', '#0d1c09'];  // sequential green

  let t;
  if (state.metric.startsWith('delta_')) {
    const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
    t = (value + m) / (2 * m);
  } else {
    const span = hi - lo || 1;
    t = (value - lo) / span;
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
  if (!state.data.amphoeGeo) return null;
  const vals = state.data.amphoeGeo.features
    .map(f => f.properties[metric])
    .filter(v => v != null && !isNaN(v));
  if (vals.length === 0) return null;
  return [Math.min(...vals), Math.max(...vals)];
}

function selectAmphoe(apEn) {
  state.selectedAmphoe = apEn;
  highlightSelectedAmphoe();
  // build info
  const feat = state.data.amphoeGeo.features.find(f => f.properties.AP_EN === apEn);
  if (!feat) return;
  const p = feat.properties;
  const dPct = p.delta_forest_pct;
  const dSign = dPct >= 0 ? '+' : '';
  showInfoPanel('District · อำเภอ', p.AP_EN, [
    ['Thai name',      p.AP_TN || '—'],
    ['Total area',     fmt.ha(p.total_area_ha)],
    ['Forest 2562',    fmt.ha(p.forest_2019_ha)],
    ['Forest 2566',    fmt.ha(p.forest_2023_ha)],
    ['Δ Forest',       `${dSign}${dPct.toFixed(1)}%`],
    ['Mean AGB 2566',  `${p.mean_agb_2023_Mg_ha.toFixed(1)} Mg/ha`],
    ['Mean CO₂ 2566',  `${p.mean_co2_2023_Mg_ha.toFixed(1)} Mg/ha`],
    ['Total CO₂ 2566', fmt.mg(p.total_co2_2023_Mg)]
  ]);
}

function highlightSelectedAmphoe() {
  if (!geojsonLayers.amphoe || !state.selectedAmphoe) return;
  geojsonLayers.amphoe.eachLayer(l => {
    if (!l.feature) return;
    if (l.feature.properties.AP_EN === state.selectedAmphoe) {
      l.setStyle({ weight: 3, color: '#0d1c09', dashArray: null });
      l.bringToFront();
    } else {
      geojsonLayers.amphoe.resetStyle(l);
    }
  });
}