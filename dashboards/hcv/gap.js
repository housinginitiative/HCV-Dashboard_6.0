// ── Mapbox token ──────────────────────────────────────────────────────────────
mapboxgl.accessToken = 'pk.eyJ1Ijoib2luZHJpemEiLCJhIjoiY21sbzllaWcxMTI2YzNkb242NTJnbng1aCJ9.771NiwRe4c4CqePpL1LdEA';

// ── Color constants ───────────────────────────────────────────────────────────
const GAP_COLORS   = ['#ffffcc','#fed976','#fd8d3c','#e31a1c','#800026'];
const GAP_GRADIENT = 'linear-gradient(to right,#ffffcc,#fed976,#fd8d3c,#e31a1c,#800026)';
const NO_DATA_COLOR = '#d1d5db';
const FLAG_COLORS  = {
  'Suppressed (<11 families)': '#d8b4fe',
  'Not applicable':            '#6ee7b7',
  'Non-reporting (<50%)':      '#fcd34d',
  'Missing':                   '#94a3b8'
};
let currentStops = [[0,'#ffffcc'],[0.10,'#fed976'],[0.20,'#fd8d3c'],[0.30,'#e31a1c'],[0.50,'#800026']];

// ── App state ─────────────────────────────────────────────────────────────────
let currentWeight = 'renter';  // 'renter' | 'poverty' | 'race'
let currentAMI    = 30;        // 30 | 50 | 80
let currentGeo    = 'state';   // 'state' | 'county' | 'tract'

// ── Data stores ───────────────────────────────────────────────────────────────
let stateRenterData  = {};
let statePovertyData = {};
let stateRaceData    = {};
let countyRenterData  = {};
let countyPovertyData = {};
let countyRaceData    = {};
let tractRenterData  = null;  // nested: stateFips2 → geoid11 → record
let tractPovertyData = null;
let tractRaceData    = null;

// Atlas / geo features
let gapAtlas       = null;
let gapStateFeats  = null;
let gapCountyFeats = null;

// State name ↔ FIPS mapping (built from gap2022_state.json)
let stateLookup     = {};  // fips2 → {name, stateAb}
let stateNameToFips = {};  // name → fips2

// Hover / lock state
let gapHovId = null, gapLocId = null, gapLocFips = null;
let gapCtyHovId = null, gapCtyLocId = null, gapCtyLocFips = null;
let gapTractStateFips = null;
const TRACT_SOURCE    = 'gap-tracts';
const TRACT_LAYER_SRC = 'tracts';
const tractColorMap   = new Map();

// PHA
let phaOverlayLoaded  = false;
let phaOverlayVisible = false;
let phaStateLookup    = {};
let phaBBoxCache      = [];
let phaSizeData       = {};   // pha_code → {cat, total_units, pct_occupied}

// ── FIPS ↔ state abbreviation ─────────────────────────────────────────────────
const FIPS_TO_STATE = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC',
  '12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY',
  '22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT',
  '31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH',
  '40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT',
  '50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY','72':'PR','78':'VI'
};

// ── Map ───────────────────────────────────────────────────────────────────────
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [-98, 39],
  zoom: 3.5,
  minZoom: 2
});
map.addControl(new mapboxgl.NavigationControl(), 'top-right');
map.on('load', () => { init(); });

// ── CSV helpers ───────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const out = []; let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else { cur += ch; }
  }
  out.push(cur);
  return out;
}
function parseCSV(text) {
  if (!text) return [];
  const lines = text.trim().split('\n');
  const hdrs  = parseCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows  = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseCSVLine(lines[i]);
    const row  = {};
    hdrs.forEach((h, j) => { row[h] = (vals[j] || '').trim().replace(/^"|"$/g, ''); });
    rows.push(row);
  }
  return rows;
}
function toNum(s) {
  if (s == null || s === '' || s === 'NA') return null;
  const n = +s;
  return isFinite(n) ? n : null;
}
// Returns null for blank/"NA" flags, otherwise the flag string
function nullFlag(s) {
  const t = (s || '').trim();
  return (t === '' || t === 'NA') ? null : t;
}

// ── Color helpers ─────────────────────────────────────────────────────────────
function computeStops(values) {
  const valid = values.filter(v => v != null && isFinite(v) && v >= 0);
  if (!valid.length) return currentStops;
  const mn = Math.min(...valid);
  const mx = Math.max(...valid);
  if (mn === mx) return [[mn, '#fd8d3c']];
  const step = (mx - mn) / (GAP_COLORS.length - 1);
  return GAP_COLORS.map((c, i) => [mn + step * i, c]);
}
function interpColor(stops, value) {
  if (value <= stops[0][0]) return stops[0][1];
  if (value >= stops[stops.length-1][0]) return stops[stops.length-1][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [v0,c0] = stops[i], [v1,c1] = stops[i+1];
    if (value >= v0 && value <= v1) return lerpHex(c0, c1, (value-v0)/(v1-v0));
  }
  return stops[stops.length-1][1];
}
function lerpHex(c0, c1, t) {
  const r0=parseInt(c0.slice(1,3),16),g0=parseInt(c0.slice(3,5),16),b0=parseInt(c0.slice(5,7),16);
  const r1=parseInt(c1.slice(1,3),16),g1=parseInt(c1.slice(3,5),16),b1=parseInt(c1.slice(5,7),16);
  const r=Math.round(r0+(r1-r0)*t),g=Math.round(g0+(g1-g0)*t),b=Math.round(b0+(b1-b0)*t);
  return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function fmtPct(v)  { return v != null ? (v*100).toFixed(1)+'%' : 'N/A'; }
function fmtN(v)    { if (v == null) return 'N/A'; return (+v).toLocaleString(); }

// ── Data access ───────────────────────────────────────────────────────────────
function getCurrentValue(rec) {
  if (!rec) return null;
  if (currentWeight === 'renter') {
    if (nullFlag(rec.total_units_flag)) return null;
    return toNum(rec[`vg_${currentAMI}`]);
  }
  if (currentWeight === 'poverty') {
    if (nullFlag(rec.total_units_flag)) return null;
    return toNum(rec.poverty_gap);
  }
  if (currentWeight === 'race') {
    if (nullFlag(rec.pct_flag)) return null;
    const v = toNum(rec[`gap_under${currentAMI}`]);
    if (v == null) return null;
    return Math.max(0, v);
  }
  return null;
}
function getFlag(rec) {
  if (!rec) return null;
  if (currentWeight === 'race') return nullFlag(rec.pct_flag);
  return nullFlag(rec.total_units_flag);
}
function getFillColor(rec) {
  if (!rec) return NO_DATA_COLOR;
  const flag = getFlag(rec);
  if (flag && FLAG_COLORS[flag]) return FLAG_COLORS[flag];
  const v = getCurrentValue(rec);
  if (v == null) return NO_DATA_COLOR;
  return interpColor(currentStops, v);
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  document.getElementById('gap-loading').classList.remove('hidden');
  try {
    const [_atlas, _stateJson, rstText, pstText, rctText, pctText, rstRaceText, rctRaceText] = await Promise.all([
      fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json').then(r => r.json()),
      fetch('data/gap2022_state.json').then(r => r.json()),
      fetch('data/voucher_gap_renter_state.csv').then(r => r.text()),
      fetch('data/voucher_gap_poverty_state.csv').then(r => r.text()),
      fetch('data/voucher_gap_renter_county.csv').then(r => r.text()),
      fetch('data/voucher_gap_poverty_county.csv').then(r => r.text()),
      fetch('data/voucher_gap_race_state.csv').then(r => r.text()),
      fetch('data/voucher_gap_race_county.csv').then(r => r.text()),
    ]);

    gapAtlas       = _atlas;
    gapStateFeats  = topojson.feature(gapAtlas, gapAtlas.objects.states).features;
    gapCountyFeats = topojson.feature(gapAtlas, gapAtlas.objects.counties).features;

    // Build state FIPS ↔ name mapping from gap2022_state.json
    for (const [fips, s] of Object.entries(_stateJson)) {
      stateLookup[fips]       = { name: s.name, stateAb: s.stateAb };
      stateNameToFips[s.name] = fips;
    }

    // ── Renter state ──
    parseCSV(rstText).forEach(row => {
      const fips = stateNameToFips[row.state_name];
      if (!fips) return;
      stateRenterData[fips] = {
        total_units:      toNum(row.total_units),
        total_units_flag: nullFlag(row.total_units_flag),
        under_30: toNum(row.under_30),
        under_50: toNum(row.under_50),
        under_80: toNum(row.under_80),
        vg_30: toNum(row.vg_30),
        vg_50: toNum(row.vg_50),
        vg_80: toNum(row.vg_80),
      };
    });

    // ── Poverty state ──
    parseCSV(pstText).forEach(row => {
      const fips = stateNameToFips[row.state_name];
      if (!fips) return;
      statePovertyData[fips] = {
        total_units:              toNum(row.total_units),
        households_below_poverty: toNum(row.households_below_poverty),
        voucher_poverty:          toNum(row.voucher_poverty),
        poverty_gap:              toNum(row.poverty_gap),
        total_units_flag:         nullFlag(row.total_units_flag),
      };
    });

    // ── Race state (geoid "0400000US01" → 2-digit FIPS) ──
    parseCSV(rstRaceText).forEach(row => {
      const fips = String((row.geoid || '').replace('0400000US', '')).padStart(2, '0');
      if (!fips || fips === '00') return;
      stateRaceData[fips] = {
        poc_hh:      toNum(row.poc_hh),
        poc_under30: toNum(row.poc_under30),
        poc_under50: toNum(row.poc_under50),
        poc_under80: toNum(row.poc_under80),
        gap_under30: toNum(row.gap_under30),
        gap_under50: toNum(row.gap_under50),
        gap_under80: toNum(row.gap_under80),
      };
    });

    // ── Renter county ──
    parseCSV(rctText).forEach(row => {
      const fips5 = String(row.fips || '').padStart(5, '0');
      countyRenterData[fips5] = {
        name:             (row['name.x'] || '').trim(),
        total_units:      toNum(row.total_units),
        total_units_flag: nullFlag(row.total_units_flag),
        under_30: toNum(row.under_30),
        under_50: toNum(row.under_50),
        under_80: toNum(row.under_80),
        vg_30: toNum(row.vg_30),
        vg_50: toNum(row.vg_50),
        vg_80: toNum(row.vg_80),
        stateFips: fips5.slice(0, 2),
      };
    });

    // ── Poverty county ──
    parseCSV(pctText).forEach(row => {
      const fips5 = String(row.fips || '').padStart(5, '0');
      countyPovertyData[fips5] = {
        name:                     (row.name || '').trim(),
        states:                   (row.states || '').trim(),
        total_units:              toNum(row.total_units),
        households_below_poverty: toNum(row.households_below_poverty),
        voucher_poverty:          toNum(row.voucher_poverty),
        poverty_gap:              toNum(row.poverty_gap),
        total_units_flag:         nullFlag(row.total_units_flag),
        stateFips: fips5.slice(0, 2),
      };
    });

    // ── Race county ──
    parseCSV(rctRaceText).forEach(row => {
      const fips5 = String(row.code || '').padStart(5, '0');
      countyRaceData[fips5] = {
        name:        (row['name.x'] || '').trim(),
        states:      (row.states || '').trim(),
        poc_hh:      toNum(row.poc_hh),
        poc_under30: toNum(row.poc_under30),
        poc_under50: toNum(row.poc_under50),
        poc_under80: toNum(row.poc_under80),
        pct_flag:    nullFlag(row.pct_flag),
        gap_under30: toNum(row.gap_under30),
        gap_under50: toNum(row.gap_under50),
        gap_under80: toNum(row.gap_under80),
        stateFips: fips5.slice(0, 2),
      };
    });

    // ── Map sources + layers ──
    map.addSource('gap-states', {
      type: 'geojson',
      data: topojson.feature(gapAtlas, gapAtlas.objects.states)
    });
    map.addLayer({ id:'gap-state-fill', type:'fill', source:'gap-states',
      paint:{'fill-color': NO_DATA_COLOR, 'fill-opacity':0.85} });
    map.addLayer({ id:'gap-state-line', type:'line', source:'gap-states',
      paint:{'line-color':'#2a2f40','line-width':0.7} });
    map.addLayer({ id:'gap-state-hover', type:'line', source:'gap-states',
      paint:{'line-color':'#ffffff',
        'line-width':['case',['boolean',['feature-state','hovered'],false],2,0],'line-opacity':0.9} });
    map.addLayer({ id:'gap-state-selected', type:'line', source:'gap-states',
      paint:{'line-color':'#5b8dee',
        'line-width':['case',['boolean',['feature-state','selected'],false],2.5,0]} });

    map.addSource('gap-counties', {
      type: 'geojson',
      data: topojson.feature(gapAtlas, gapAtlas.objects.counties)
    });
    map.addLayer({ id:'gap-county-fill', type:'fill', source:'gap-counties',
      layout:{visibility:'none'}, paint:{'fill-color': NO_DATA_COLOR,'fill-opacity':0.85} });
    map.addLayer({ id:'gap-county-line', type:'line', source:'gap-counties',
      layout:{visibility:'none'}, paint:{'line-color':'#1a1d26','line-width':0.3} });
    map.addLayer({ id:'gap-county-hover', type:'line', source:'gap-counties',
      layout:{visibility:'none'},
      paint:{'line-color':'#ffffff',
        'line-width':['case',['boolean',['feature-state','hovered'],false],1.5,0],'line-opacity':0.9} });
    map.addLayer({ id:'gap-county-selected', type:'line', source:'gap-counties',
      layout:{visibility:'none'},
      paint:{'line-color':'#5b8dee',
        'line-width':['case',['boolean',['feature-state','selected'],false],2,0]} });

    // Mapbox vector tileset for census tracts
    map.addSource(TRACT_SOURCE, {
      type: 'vector',
      url: 'mapbox://oindriza.7n39jfbi',
      promoteId: { [TRACT_LAYER_SRC]: 'GEOID' }
    });
    map.addLayer({ id:'gap-tract-fill', type:'fill', source:TRACT_SOURCE,
      'source-layer': TRACT_LAYER_SRC,
      layout:{visibility:'none'},
      paint:{
        'fill-color': ['coalesce', ['feature-state','gap_color'], NO_DATA_COLOR],
        'fill-opacity': 0.85
      }
    });
    map.addLayer({ id:'gap-tract-line', type:'line', source:TRACT_SOURCE,
      'source-layer': TRACT_LAYER_SRC,
      layout:{visibility:'none'},
      paint:{'line-color':'#555566','line-width':0.4}
    });

    map.on('mousemove', 'gap-tract-fill', e => {
      if (!e.features.length) return;
      map.getCanvas().style.cursor = 'pointer';
      const geoid = String(e.features[0].properties?.GEOID ?? '').padStart(11, '0');
      renderTractSidebar(geoid);
    });
    map.on('mouseleave', 'gap-tract-fill', () => {
      map.getCanvas().style.cursor = '';
      showDefaultPanel();
    });

    map.on('moveend', () => { if (currentGeo === 'tract') applyTractColors(); });
    map.on('zoomend', () => { if (currentGeo === 'tract') applyTractColors(); });

    setupInteractions();
    populateTractStateSelect();

  } catch (err) {
    console.error('Init error:', err);
    document.getElementById('gap-loading').textContent = 'Failed to load data.';
    return;
  }
  document.getElementById('gap-loading').classList.add('hidden');
  paintStates();
  updateLegend();
}

// ── Layer visibility ──────────────────────────────────────────────────────────
const STATE_LAYERS  = ['gap-state-fill','gap-state-line','gap-state-hover','gap-state-selected'];
const COUNTY_LAYERS = ['gap-county-fill','gap-county-line','gap-county-hover','gap-county-selected'];
const TRACT_LAYERS  = ['gap-tract-fill','gap-tract-line'];

function showStateLayers() {
  COUNTY_LAYERS.concat(TRACT_LAYERS).forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id,'visibility','none');
  });
  STATE_LAYERS.forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id,'visibility','visible');
  });
  map.setPaintProperty('gap-state-fill','fill-opacity',0.85);
}
function showCountyLayers() {
  STATE_LAYERS.concat(TRACT_LAYERS).forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id,'visibility','none');
  });
  COUNTY_LAYERS.forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id,'visibility','visible');
  });
}
function showTractLayers() {
  COUNTY_LAYERS.forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id,'visibility','none');
  });
  ['gap-state-hover','gap-state-selected'].forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id,'visibility','none');
  });
  ['gap-state-fill','gap-state-line'].forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id,'visibility','visible');
  });
  map.setPaintProperty('gap-state-fill','fill-opacity',0.01);
  map.setLayoutProperty('gap-tract-fill','visibility','visible');
  map.setLayoutProperty('gap-tract-line','visibility','visible');
}

// ── Paint helpers ─────────────────────────────────────────────────────────────
function paintStates() {
  if (!gapStateFeats || !map.getSource('gap-states')) return;
  const data = currentWeight === 'race' ? stateRaceData
             : currentWeight === 'poverty' ? statePovertyData : stateRenterData;
  const vals = Object.values(data).map(r => getCurrentValue(r)).filter(v => v != null);
  currentStops = computeStops(vals);
  const features = gapStateFeats.map(f => {
    const fips  = String(f.id).padStart(2,'0');
    const rec   = data[fips] || null;
    return { ...f, properties: { ...f.properties, fill_color: getFillColor(rec) }};
  });
  map.getSource('gap-states').setData({ type:'FeatureCollection', features });
  map.setPaintProperty('gap-state-fill','fill-color',['get','fill_color']);
  updateLegend();
  if (gapLocFips) renderSidebar('state', gapLocFips, true);
}

function paintCounties() {
  if (!gapCountyFeats || !map.getSource('gap-counties')) return;
  const data = currentWeight === 'race' ? countyRaceData
             : currentWeight === 'poverty' ? countyPovertyData : countyRenterData;
  const vals = Object.values(data).map(r => getCurrentValue(r)).filter(v => v != null);
  currentStops = computeStops(vals);
  const features = gapCountyFeats.map(f => {
    const fips5 = String(f.id).padStart(5,'0');
    const rec   = data[fips5] || null;
    return { ...f, properties: { ...f.properties, fill_color: getFillColor(rec) }};
  });
  map.getSource('gap-counties').setData({ type:'FeatureCollection', features });
  map.setPaintProperty('gap-county-fill','fill-color',['get','fill_color']);
  updateLegend();
  if (gapCtyLocFips) renderSidebar('county', gapCtyLocFips, true);
}

// ── Tract layer ───────────────────────────────────────────────────────────────
function paintTractFeatureState() {
  const store = currentWeight === 'race' ? tractRaceData
              : currentWeight === 'poverty' ? tractPovertyData : tractRenterData;
  if (!store) return;
  const allValues = [];
  for (const sd of Object.values(store))
    for (const rec of Object.values(sd)) {
      const v = getCurrentValue(rec);
      if (v != null) allValues.push(v);
    }
  currentStops = computeStops(allValues);
  tractColorMap.clear();
  for (const [, sd] of Object.entries(store)) {
    for (const [geoid, rec] of Object.entries(sd)) {
      tractColorMap.set(geoid, getFillColor(rec));
    }
  }
  applyTractColors();
  updateLegend();
}

function applyTractColors() {
  if (!tractColorMap.size) return;
  const rendered = map.queryRenderedFeatures({ layers: ['gap-tract-fill'] });
  if (!rendered.length) return;
  for (const f of rendered) {
    const geoid = String(f.properties?.GEOID ?? '').padStart(11, '0');
    const color = tractColorMap.get(geoid) ?? NO_DATA_COLOR;
    if (f.id != null) {
      map.setFeatureState(
        { source: TRACT_SOURCE, sourceLayer: TRACT_LAYER_SRC, id: f.id },
        { gap_color: color }
      );
    }
  }
}

async function loadTractLayer(stateFips, stateGeom) {
  const loadEl = document.getElementById('tract-loading');
  gapTractStateFips = stateFips;
  const sel = document.getElementById('tract-state-select');
  if (sel) sel.value = stateFips;
  const geomSrc = stateGeom || gapStateFeats?.find(f => String(f.id).padStart(2,'0') === stateFips)?.geometry;
  if (geomSrc) {
    const b = getBounds(geomSrc);
    if (b) map.fitBounds(b, {padding:60, maxZoom:9, duration:600});
  }
  showTractLayers();

  // Lazy-load all three tract datasets on first access
  const needRenter  = !tractRenterData;
  const needPoverty = !tractPovertyData;
  const needRace    = !tractRaceData;
  const fetches = [];
  if (needRenter)  fetches.push(fetch('data/voucher_gap_renter_tract.csv').then(r => r.text()));
  if (needPoverty) fetches.push(fetch('data/voucher_gap_poverty_tract.csv').then(r => r.text()));
  if (needRace)    fetches.push(fetch('data/voucher_gap_race_tract.csv').then(r => r.text()));

  if (fetches.length) {
    loadEl.textContent = 'Loading tract data (this may take a moment)…';
    loadEl.classList.remove('hidden');
    try {
      const results = await Promise.all(fetches);
      let ri = 0;
      if (needRenter)  { parseTractCSV(results[ri++], 'renter');  }
      if (needPoverty) { parseTractCSV(results[ri++], 'poverty'); }
      if (needRace)    { parseTractCSV(results[ri++], 'race');    }
    } catch (e) {
      console.error('Tract data load failed:', e);
      loadEl.textContent = `Tract data load failed: ${e.message}`;
      setTimeout(() => loadEl.classList.add('hidden'), 5000);
      return;
    }
    loadEl.classList.add('hidden');
  }

  paintTractFeatureState();
  map.once('idle', () => { paintTractFeatureState(); });
}

function parseTractCSV(text, kind) {
  const rows = parseCSV(text);
  const store = {};
  rows.forEach(row => {
    const geoid = String(row.code || '').padStart(11, '0');
    const sfips = geoid.slice(0, 2);
    if (!store[sfips]) store[sfips] = {};
    if (kind === 'renter') {
      store[sfips][geoid] = {
        name:             (row['name.x'] || '').trim(),
        total_units:      toNum(row.total_units),
        total_units_flag: nullFlag(row.total_units_flag),
        under_30: toNum(row.under_30),
        under_50: toNum(row.under_50),
        under_80: toNum(row.under_80),
        vg_30: toNum(row.vg_30),
        vg_50: toNum(row.vg_50),
        vg_80: toNum(row.vg_80),
        stateFips: sfips,
      };
    } else if (kind === 'poverty') {
      store[sfips][geoid] = {
        name:                     (row.name || '').trim(),
        states:                   (row.states || '').trim(),
        total_units:              toNum(row.total_units),
        households_below_poverty: toNum(row.households_below_poverty),
        voucher_poverty:          toNum(row.voucher_poverty),
        poverty_gap:              toNum(row.poverty_gap),
        total_units_flag:         nullFlag(row.total_units_flag),
        stateFips: sfips,
      };
    } else if (kind === 'race') {
      store[sfips][geoid] = {
        name:        (row['name.x'] || '').trim(),
        states:      (row.states || '').trim(),
        poc_hh:      toNum(row.poc_hh),
        poc_under30: toNum(row.poc_under30),
        poc_under50: toNum(row.poc_under50),
        poc_under80: toNum(row.poc_under80),
        pct_flag:    nullFlag(row.pct_flag),
        gap_under30: toNum(row.gap_under30),
        gap_under50: toNum(row.gap_under50),
        gap_under80: toNum(row.gap_under80),
        stateFips: sfips,
      };
    }
  });
  if (kind === 'renter')  tractRenterData  = store;
  if (kind === 'poverty') tractPovertyData = store;
  if (kind === 'race')    tractRaceData    = store;
}

// ── PHA spatial lookups ───────────────────────────────────────────────────────
function bbox4(geom) {
  const cs = flattenCoords(geom);
  if (!cs.length) return null;
  const lngs = cs.map(c => c[0]), lats = cs.map(c => c[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}
function bboxIntersects(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}
function buildPhaLookups(features) {
  phaStateLookup = {};
  phaBBoxCache   = [];
  for (const f of features) {
    const p    = f.properties || {};
    const code = String(p.pha_code || p.PARTICIPAN || p.PHA_CODE || '').trim().toUpperCase();
    const name = (p.pha_name || p.AGENCY_NAME || p.NAME || '').trim();
    if (!name) continue;
    const stAb = code.slice(0, 2);
    if (stAb) {
      if (!phaStateLookup[stAb]) phaStateLookup[stAb] = [];
      phaStateLookup[stAb].push(name);
    }
    const bbox = bbox4(f.geometry);
    if (bbox) phaBBoxCache.push({ bbox, name, code });
  }
}
function getPhasForState(fips2) {
  const stAb = FIPS_TO_STATE[fips2];
  return stAb ? (phaStateLookup[stAb] || []) : [];
}
function getPhasForCounty(fips5) {
  const feat = gapCountyFeats?.find(f => String(f.id).padStart(5,'0') === fips5);
  if (!feat) return [];
  const cb = bbox4(feat.geometry);
  if (!cb) return [];
  return phaBBoxCache.filter(p => bboxIntersects(cb, p.bbox)).map(p => p.name);
}
function phaListHTML(names, label) {
  if (!names.length) return '';
  const CAP   = 7;
  const shown = names.slice(0, CAP);
  const more  = names.length > CAP ? `<div class="gap-popup-more">+${names.length - CAP} more</div>` : '';
  return `
    <div class="gap-popup-divider"></div>
    <div class="gap-popup-pha-label">${label}</div>
    <div class="gap-popup-pha-list">${shown.map(n=>`<div class="gap-popup-pha-item">${n}</div>`).join('')}${more}</div>`;
}

// ── Hover popup ───────────────────────────────────────────────────────────────
const gapHoverPopup = new mapboxgl.Popup({
  closeButton: false, closeOnClick: false,
  className: 'gap-hover-popup', maxWidth: '300px', offset: 12
});

function buildPopupRow(label, val) {
  return `<div class="gap-popup-row"><span class="gap-popup-label">${label}</span><span class="gap-popup-val">${val}</span></div>`;
}

function getGapRatioLabel() {
  if (currentWeight === 'renter')  return `Gap Ratio · Renter Households (<${currentAMI}% AMI)`;
  if (currentWeight === 'poverty') return 'Gap Ratio · Poverty Households';
  return `Gap Ratio · Households of Color (<${currentAMI}% AMI)`;
}

function buildStatePopupHTML(fips2) {
  const sl   = stateLookup[fips2];
  if (!sl) return '';
  const data = currentWeight === 'race' ? stateRaceData
             : currentWeight === 'poverty' ? statePovertyData : stateRenterData;
  const rec  = data[fips2];
  const gapV = rec ? getCurrentValue(rec) : null;
  const flag = rec ? getFlag(rec) : null;

  let secondRow;
  if (currentWeight === 'race') {
    const pocQual = rec ? toNum(rec[`poc_under${currentAMI}`]) : null;
    secondRow = buildPopupRow(`Qualified Households of Color (<${currentAMI}% AMI)`, fmtN(pocQual));
  } else if (currentWeight === 'renter') {
    secondRow = buildPopupRow('Total Number of Universal Vouchers Available', rec ? fmtN(rec.total_units) : 'N/A');
  } else {
    secondRow = buildPopupRow('Total Number of Universal Vouchers Available', rec ? fmtN(rec.total_units) : 'N/A');
  }

  return `
    <div class="gap-popup-name">${sl.name}</div>
    ${buildPopupRow(getGapRatioLabel(), flag ? flag : fmtPct(gapV))}
    ${secondRow}`;
}

function buildCountyPopupHTML(fips5) {
  const data = currentWeight === 'race' ? countyRaceData
             : currentWeight === 'poverty' ? countyPovertyData : countyRenterData;
  const rec  = data[fips5];
  if (!rec) return '';
  const gapV = getCurrentValue(rec);
  const flag = getFlag(rec);
  const sfips = fips5.slice(0, 2);
  const stName = stateLookup[sfips]?.stateAb || '';

  let secondRow;
  if (currentWeight === 'race') {
    const pocQual = toNum(rec[`poc_under${currentAMI}`]);
    secondRow = buildPopupRow(`Qualified Households of Color (<${currentAMI}% AMI)`, fmtN(pocQual));
  } else if (currentWeight === 'renter') {
    secondRow = buildPopupRow('Total Number of Universal Vouchers Available', fmtN(rec.total_units));
  } else {
    secondRow = buildPopupRow('Total Number of Universal Vouchers Available', fmtN(rec.total_units));
  }

  return `
    <div class="gap-popup-name">${rec.name || fips5}</div>
    ${buildPopupRow('State', stName)}
    ${buildPopupRow(getGapRatioLabel(), flag ? flag : fmtPct(gapV))}
    ${secondRow}`;
}

// ── Interactions ──────────────────────────────────────────────────────────────
function setupInteractions() {
  // State hover
  map.on('mousemove','gap-state-fill', e => {
    if (!e.features.length) return;
    map.getCanvas().style.cursor = 'pointer';
    const feat = e.features[0], fips2 = String(feat.id).padStart(2,'0');
    if (currentGeo === 'tract') {
      document.getElementById('hint-primary').textContent =
        `Click ${stateLookup[fips2]?.name || 'state'} to load tracts.`;
      return;
    }
    if (gapHovId !== null && gapHovId !== feat.id)
      map.setFeatureState({source:'gap-states',id:gapHovId},{hovered:false});
    gapHovId = feat.id;
    map.setFeatureState({source:'gap-states',id:gapHovId},{hovered:true});
    if (phaOverlayVisible) return;  // PHA mode: suppress state popup/sidebar
    const html = buildStatePopupHTML(fips2);
    if (html) gapHoverPopup.setLngLat(e.lngLat).setHTML(html).addTo(map);
    if (!gapLocId) renderSidebar('state', fips2, false);
  });
  map.on('mouseleave','gap-state-fill', () => {
    map.getCanvas().style.cursor = '';
    gapHoverPopup.remove();
    if (currentGeo === 'tract') return;
    if (gapHovId !== null) { map.setFeatureState({source:'gap-states',id:gapHovId},{hovered:false}); gapHovId=null; }
    if (!gapLocId) showDefaultPanel();
  });
  map.on('click','gap-state-fill', e => {
    if (!e.features.length) return;
    const feat = e.features[0], fips2 = String(feat.id).padStart(2,'0');
    if (currentGeo === 'tract') { loadTractLayer(fips2, feat.geometry); return; }
    if (gapLocId === feat.id) {
      map.setFeatureState({source:'gap-states',id:feat.id},{selected:false});
      gapLocId = null; gapLocFips = null; showDefaultPanel();
    } else {
      if (gapLocId !== null) map.setFeatureState({source:'gap-states',id:gapLocId},{selected:false});
      gapLocId = feat.id; gapLocFips = fips2;
      map.setFeatureState({source:'gap-states',id:feat.id},{selected:true});
      renderSidebar('state', fips2, true);
      const b = getBounds(feat.geometry); if (b) map.fitBounds(b,{padding:80,maxZoom:8,duration:800});
    }
  });

  // County hover
  map.on('mousemove','gap-county-fill', e => {
    if (!e.features.length) return;
    map.getCanvas().style.cursor = 'pointer';
    const feat = e.features[0], fips5 = String(feat.id).padStart(5,'0');
    if (gapCtyHovId !== null && gapCtyHovId !== feat.id)
      map.setFeatureState({source:'gap-counties',id:gapCtyHovId},{hovered:false});
    gapCtyHovId = feat.id;
    map.setFeatureState({source:'gap-counties',id:gapCtyHovId},{hovered:true});
    if (phaOverlayVisible) return;  // PHA mode: suppress county popup/sidebar
    const html = buildCountyPopupHTML(fips5);
    if (html) gapHoverPopup.setLngLat(e.lngLat).setHTML(html).addTo(map);
    if (!gapCtyLocId) renderSidebar('county', fips5, false);
  });
  map.on('mouseleave','gap-county-fill', () => {
    map.getCanvas().style.cursor = '';
    gapHoverPopup.remove();
    if (gapCtyHovId !== null) { map.setFeatureState({source:'gap-counties',id:gapCtyHovId},{hovered:false}); gapCtyHovId=null; }
    if (!gapCtyLocId) showDefaultPanel();
  });
  map.on('click','gap-county-fill', e => {
    if (!e.features.length) return;
    const feat = e.features[0], fips5 = String(feat.id).padStart(5,'0');
    if (gapCtyLocId === feat.id) {
      map.setFeatureState({source:'gap-counties',id:feat.id},{selected:false});
      gapCtyLocId = null; gapCtyLocFips = null; showDefaultPanel();
    } else {
      if (gapCtyLocId !== null) map.setFeatureState({source:'gap-counties',id:gapCtyLocId},{selected:false});
      gapCtyLocId = feat.id; gapCtyLocFips = fips5;
      map.setFeatureState({source:'gap-counties',id:feat.id},{selected:true});
      renderSidebar('county', fips5, true);
      const b = getBounds(feat.geometry); if (b) map.fitBounds(b,{padding:80,maxZoom:12,duration:800});
    }
  });

  // Click-away
  map.on('click', e => {
    const layers = currentGeo==='state' ? ['gap-state-fill']
                 : currentGeo==='county' ? ['gap-county-fill']
                 : ['gap-tract-fill','gap-state-fill'];
    if (map.queryRenderedFeatures(e.point,{layers}).length) return;
    if (gapLocId !== null)    { map.setFeatureState({source:'gap-states',id:gapLocId},{selected:false});   gapLocId=null;    gapLocFips=null;    }
    if (gapCtyLocId !== null) { map.setFeatureState({source:'gap-counties',id:gapCtyLocId},{selected:false}); gapCtyLocId=null; gapCtyLocFips=null; }
    showDefaultPanel();
  });
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function showDefaultPanel() {
  document.getElementById('gap-info-default').classList.remove('hidden');
  document.getElementById('gap-info-content').classList.add('hidden');
}
function showDetailPanel() {
  document.getElementById('gap-info-default').classList.add('hidden');
  document.getElementById('gap-info-content').classList.remove('hidden');
}

function renderSidebar(geoType, fips, locked) {
  const data = geoType === 'state'
    ? (currentWeight === 'race' ? stateRaceData : currentWeight === 'poverty' ? statePovertyData : stateRenterData)
    : (currentWeight === 'race' ? countyRaceData : currentWeight === 'poverty' ? countyPovertyData : countyRenterData);
  const rec = data[fips];
  if (!rec && geoType === 'county') { showDefaultPanel(); return; }

  showDetailPanel();

  const name = rec?.name || (geoType === 'state' ? stateLookup[fips]?.name : '') || fips;
  const sub  = geoType === 'state'
    ? ((stateLookup[fips]?.stateAb || '') + (locked ? '  ·  Locked' : ''))
    : ((stateLookup[rec?.stateFips]?.stateAb || '') + (locked ? '  ·  Locked' : ''));

  document.getElementById('gap-geo-name').textContent = name;
  document.getElementById('gap-geo-sub').textContent  = sub;
  document.getElementById('gap-metrics').innerHTML    = buildMetricsHTML(rec, fips);
}

function renderTractSidebar(fips11) {
  const sfips = fips11.slice(0, 2);
  const store = currentWeight === 'race' ? tractRaceData
              : currentWeight === 'poverty' ? tractPovertyData : tractRenterData;
  const rec  = store?.[sfips]?.[fips11] || null;
  const stAb = FIPS_TO_STATE[sfips] || sfips;

  showDetailPanel();
  document.getElementById('gap-geo-name').textContent = 'Tract ' + fips11.slice(5);
  document.getElementById('gap-geo-sub').textContent  = stAb;
  document.getElementById('gap-metrics').innerHTML    = buildMetricsHTML(rec, fips11);
}

function buildMetricsHTML(rec, fips) {
  const flag = getFlag(rec);

  // ── Flagged record ──
  if (flag) {
    const flagColor = FLAG_COLORS[flag] || '#94a3b8';
    return `
      <div class="metric-card span-2" style="border-color:${flagColor};background:${flagColor}22">
        <div class="metric-label">Data Status</div>
        <div class="metric-value na">${flag}</div>
      </div>
      ${rec?.total_units != null ? `
      <div class="metric-card">
        <div class="metric-label">${currentWeight === 'renter' ? 'Total Number of Universal Vouchers Available' : 'Total Vouchers Available for Use'}</div>
        <div class="metric-value">${fmtN(rec.total_units)}</div>
      </div>` : ''}`;
  }

  if (!rec) {
    return `<div class="metric-card span-2"><div class="metric-label">No Data</div><div class="metric-value na">—</div></div>`;
  }

  const gapV = getCurrentValue(rec);
  const gapStr = fmtPct(gapV);

  // ── Renter mode ──
  if (currentWeight === 'renter') {
    const eli = toNum(rec[`under_${currentAMI}`]);
    const surplus = gapV != null && gapV <= 0;
    return `
      <div class="metric-card highlighted span-2${surplus ? ' expansion-hi' : ''}">
        <div class="metric-label">Voucher Gap Ratio (under ${currentAMI}% AMI) Weighted by Renter Households</div>
        <div class="metric-value${gapV == null ? ' na' : ''}">${surplus ? '(surplus) ' : ''}${gapStr}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Number of Renter Households Qualifying Under (&lt;${currentAMI}% AMI)</div>
        <div class="metric-value">${fmtN(eli)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Number of Universal Vouchers Available</div>
        <div class="metric-value">${fmtN(rec.total_units)}</div>
      </div>`;
  }

  // ── Poverty mode ──
  if (currentWeight === 'poverty') {
    const surplus = gapV != null && gapV <= 0;
    return `
      <div class="metric-card highlighted span-2${surplus ? ' expansion-hi' : ''}">
        <div class="metric-label">Voucher Gap Ratio Weighted by Households Under Poverty Level</div>
        <div class="metric-value${gapV == null ? ' na' : ''}">${surplus ? '(surplus) ' : ''}${gapStr}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Number of Qualifying Households Under Poverty Level</div>
        <div class="metric-value">${fmtN(rec.households_below_poverty)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Number of Universal Vouchers Available</div>
        <div class="metric-value">${fmtN(rec.total_units)}</div>
      </div>`;
  }

  // ── Race mode ──
  if (currentWeight === 'race') {
    const pocQual   = toNum(rec[`poc_under${currentAMI}`]);
    const pocUsing  = rec.poc_hh;
    const surplus = gapV != null && gapV <= 0;
    return `
      <div class="metric-card highlighted span-2${surplus ? ' expansion-hi' : ''}">
        <div class="metric-label">Voucher Gap Ratio (under ${currentAMI}% AMI) Weighted by Households of Color</div>
        <div class="metric-value${gapV == null ? ' na' : ''}">${surplus ? '(surplus) ' : ''}${gapStr}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Number of Qualified Households of Color under ${currentAMI}% AMI</div>
        <div class="metric-value">${fmtN(pocQual)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Number of Households of Color Currently Using a Voucher</div>
        <div class="metric-value">${fmtN(pocUsing)}</div>
      </div>`;
  }

  return '';
}

// ── Legend ────────────────────────────────────────────────────────────────────
function updateLegend() {
  const title = currentWeight === 'race'
    ? `Gap Ratio (under ${currentAMI}% AMI) · Households of Color`
    : currentWeight === 'renter'
    ? `Gap Ratio (under ${currentAMI}% AMI) · Renter Households`
    : 'Gap Ratio · Households Under Poverty Level';
  document.getElementById('legend-title').textContent = title;
  document.getElementById('legend-gradient').style.background = GAP_GRADIENT;
  const mn  = currentStops[0][0];
  const mx  = currentStops[currentStops.length-1][0];
  const mid = (mn + mx) / 2;
  document.getElementById('legend-min').textContent = fmtPct(mn);
  document.getElementById('legend-mid').textContent = fmtPct(mid);
  document.getElementById('legend-max').textContent = fmtPct(mx);
}

// ── Tract state dropdown ──────────────────────────────────────────────────────
function populateTractStateSelect() {
  const sel = document.getElementById('tract-state-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">— click map or select —</option>';
  Object.entries(stateLookup)
    .filter(([,s]) => s.stateAb)
    .sort((a,b) => a[1].stateAb.localeCompare(b[1].stateAb))
    .forEach(([fips,s]) => {
      const o = document.createElement('option');
      o.value = fips; o.textContent = `${s.stateAb} – ${s.name}`;
      sel.appendChild(o);
    });
  sel.addEventListener('change', () => { if (sel.value) loadTractLayer(sel.value, null); });
}

// ── Geometry helpers ──────────────────────────────────────────────────────────
function getBounds(geom) {
  try {
    const cs = flattenCoords(geom); if (!cs.length) return null;
    const lngs=cs.map(c=>c[0]),lats=cs.map(c=>c[1]);
    return [[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]];
  } catch { return null; }
}
function flattenCoords(g) {
  if (!g) return [];
  if (g.type==='Point')           return [g.coordinates];
  if (g.type==='LineString')      return g.coordinates;
  if (g.type==='Polygon')         return g.coordinates.flat();
  if (g.type==='MultiPolygon')    return g.coordinates.flat(2);
  if (g.type==='MultiLineString') return g.coordinates.flat();
  return [];
}

// ── Control event listeners ───────────────────────────────────────────────────

// Weight toggle
document.querySelectorAll('#weight-toggle .tog-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#weight-toggle .tog-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentWeight = btn.dataset.weight;
    // Show AMI toggle for renter and race; hide for poverty
    const amiGroup = document.getElementById('ami-ctrl-group');
    if (amiGroup) amiGroup.classList.toggle('hidden', currentWeight === 'poverty');
    if      (currentGeo === 'state')  paintStates();
    else if (currentGeo === 'county') paintCounties();
    else if (currentGeo === 'tract')  paintTractFeatureState();
    updateLegend();
  });
});

// AMI toggle
document.querySelectorAll('#ami-toggle .tog-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#ami-toggle .tog-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentAMI = +btn.dataset.ami;
    if      (currentGeo === 'state')  paintStates();
    else if (currentGeo === 'county') paintCounties();
    else if (currentGeo === 'tract')  paintTractFeatureState();
    updateLegend();
  });
});

// Geography toggle
document.querySelectorAll('#geo-toggle .tog-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#geo-toggle .tog-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const prev = currentGeo;
    currentGeo = btn.dataset.geo;
    if (prev !== currentGeo) {
      if (gapLocId !== null)    { map.setFeatureState({source:'gap-states',id:gapLocId},{selected:false});     gapLocId=null;    gapLocFips=null;    }
      if (gapCtyLocId !== null) { map.setFeatureState({source:'gap-counties',id:gapCtyLocId},{selected:false}); gapCtyLocId=null; gapCtyLocFips=null; }
      showDefaultPanel();
    }
    const hints = {
      state:  ['Hover over a state to see the voucher gap.',  'Click to lock the selection.'],
      county: ['Hover over a county to see the voucher gap.', 'Click to lock the selection.'],
      tract:  ['Click a state to load its census tracts.',    'Select from the dropdown or click the map.']
    };
    document.getElementById('hint-primary').textContent   = hints[currentGeo][0];
    document.getElementById('hint-secondary').textContent = hints[currentGeo][1];
    document.getElementById('tract-state-group').classList.toggle('hidden', currentGeo !== 'tract');

    if      (currentGeo === 'state')  { showStateLayers();  paintStates();   }
    else if (currentGeo === 'county') { showCountyLayers(); paintCounties(); }
    else {
      showTractLayers();
      const hasData = tractRenterData || tractPovertyData || tractRaceData;
      if (hasData) paintTractFeatureState();
    }
  });
});

// ── PHA Boundary Overlay ──────────────────────────────────────────────────────
async function loadPhaOverlay() {
  const btn = document.getElementById('pha-overlay-btn');
  btn.textContent = 'Loading…';
  btn.disabled = true;
  try {
    // Load geojson boundaries
    const geojson = await fetch('data/pha_master_latest.geojson').then(r => r.json());
    buildPhaLookups(geojson.features);

    // Load CSV for size/units data
    const csvText = await fetch('data/pha_2024_hcv.csv').then(r => r.text());
    const csvRows = parseCSV(csvText);
    const hdrs    = Object.keys(csvRows[0] || {});
    const catIdx  = hdrs.indexOf('ha_size_category');
    const unitsIdx= hdrs.indexOf('total_units');
    const pctIdx  = hdrs.indexOf('pct_occupied');
    csvRows.forEach(row => {
      const code = (row.code || '').trim().toUpperCase();
      if (!code) return;
      phaSizeData[code] = {
        cat:          row.ha_size_category || null,
        total_units:  row.total_units      || null,
        pct_occupied: row.pct_occupied     || null,
      };
    });

    map.addSource('pha-overlay', { type:'geojson', data: geojson });
    map.addLayer({ id:'pha-overlay-fill', type:'fill', source:'pha-overlay',
      paint:{'fill-color':'#000000','fill-opacity':0} });
    map.addLayer({ id:'pha-overlay-line', type:'line', source:'pha-overlay',
      paint:{'line-color':'#1d4ed8','line-width':2,'line-opacity':0.85} });

    // PHA hover popup + sidebar
    map.on('mousemove','pha-overlay-fill', e => {
      if (!e.features.length) return;
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features[0];
      const code = String(f.properties?.pha_code || f.properties?.PARTICIPAN || f.properties?.PHA_CODE || '').trim().toUpperCase();
      const html = buildPhaPopupHTML(f.properties, code);
      if (html) gapHoverPopup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      renderPhaSidebar(f.properties, code);
    });
    map.on('mouseleave','pha-overlay-fill', () => {
      map.getCanvas().style.cursor = '';
      gapHoverPopup.remove();
      showDefaultPanel();
    });

    phaOverlayLoaded = true;
  } catch (err) {
    console.error('PHA overlay load failed:', err);
    btn.textContent = 'PHA Boundaries';
    btn.disabled = false;
    return;
  }
  btn.textContent = 'PHA Boundaries';
  btn.disabled = false;
}

function buildPhaPopupHTML(props, code) {
  const name = (props?.pha_name || props?.AGENCY_NAME || props?.NAME || code || '').trim();
  if (!name) return '';
  const size = phaSizeData[code] || {};
  const rows = [
    buildPopupRow('Agency Size', size.cat || 'N/A'),
    buildPopupRow('Total Available Vouchers', size.total_units ? fmtN(+size.total_units) : 'N/A'),
    buildPopupRow('% Occupied', size.pct_occupied ? (+size.pct_occupied).toFixed(1) + '%' : 'N/A'),
  ].join('');
  return `<div class="gap-popup-name">${name}</div>${rows}`;
}

function renderPhaSidebar(props, code) {
  const name = (props?.pha_name || props?.AGENCY_NAME || props?.NAME || code || '').trim();
  if (!name) return;
  const size = phaSizeData[code] || {};
  showDetailPanel();
  document.getElementById('gap-geo-name').textContent = name;
  document.getElementById('gap-geo-sub').textContent  = code || '';
  document.getElementById('gap-metrics').innerHTML = `
    <div class="metric-card span-2">
      <div class="metric-label">Agency Size Category</div>
      <div class="metric-value${size.cat ? '' : ' na'}">${size.cat || 'N/A'}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Total Available Vouchers</div>
      <div class="metric-value">${size.total_units ? fmtN(+size.total_units) : 'N/A'}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">% Occupied</div>
      <div class="metric-value">${size.pct_occupied ? (+size.pct_occupied).toFixed(1) + '%' : 'N/A'}</div>
    </div>`;
}

document.getElementById('pha-overlay-btn').addEventListener('click', async () => {
  phaOverlayVisible = !phaOverlayVisible;
  document.getElementById('pha-overlay-btn').classList.toggle('active', phaOverlayVisible);
  if (phaOverlayVisible && !phaOverlayLoaded) await loadPhaOverlay();
  if (phaOverlayLoaded) {
    const vis = phaOverlayVisible ? 'visible' : 'none';
    map.setLayoutProperty('pha-overlay-fill','visibility',vis);
    map.setLayoutProperty('pha-overlay-line','visibility',vis);
  }
});

// ── Sidebar drag-to-resize ────────────────────────────────────────────────────
(function() {
  const sidebar = document.getElementById('sidebar');
  const handle  = document.createElement('div');
  handle.id = 'sidebar-resize-handle';
  sidebar.prepend(handle);
  let dragging = false, startX = 0, startW = 0;
  handle.addEventListener('mousedown', e => {
    dragging = true; startX = e.clientX; startW = sidebar.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newW = Math.min(Math.max(startW + (startX - e.clientX), 280), 680);
    sidebar.style.width    = newW + 'px';
    sidebar.style.minWidth = newW + 'px';
    sidebar.style.fontSize = (13 * newW / 400).toFixed(2) + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
})();
