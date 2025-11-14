// ===============================
// Team Weather — App Logic (JS)
// "Detailed but readable" comments for demo/explaining
// ===============================

// ---- API CONFIG ----
// Replace with your own OpenWeather API key to run live.
const OPENWEATHER_API_KEY = "5366dc45f22bf64a638edfda4f8debb0";

// Small helpers to build the OpenWeather endpoints.
const GEO_URL  = (q)=>`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1&appid=${OPENWEATHER_API_KEY}`;
const CURR_URL = (lat,lon,unit)=>`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${unit}&appid=${OPENWEATHER_API_KEY}`;
const FORE_URL = (lat,lon,unit)=>`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${unit}&appid=${OPENWEATHER_API_KEY}`;

// ---- APP STATE ----
// Persist unit and recent searches in localStorage so the app remembers user preferences.
const state = {
  unit: localStorage.getItem('unit') || 'metric',              // 'metric' (°C) or 'imperial' (°F)
  lastCity: localStorage.getItem('lastCity') || 'New York',    // initial city to load
  recent: JSON.parse(localStorage.getItem('recentCities')||'[]')
};

// ---- DOM SHORTCUTS & UTILITIES ----
const $ = sel => document.querySelector(sel);                  // quick query helper
const fmtTemp = t => t!=null ? `${Math.round(t)}°` : '—';      // format temperatures
const iconUrl = code => `https://openweathermap.org/img/wn/${code}@2x.png`; // weather icon URL
const toLocalDate = (ts, tz) => new Date((ts + tz) * 1000);    // convert Unix+offset → JS Date

// ---- UNIT TOGGLE ----
function setUnit(unit){
  state.unit = unit;
  localStorage.setItem('unit', unit);

  // Visual toggle feedback
  [...document.querySelectorAll('#unitToggle button')].forEach(b=>{
    const active = b.dataset.unit===unit;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active);
  });

  // If we already have coordinates, refresh the data in the chosen unit
  if(state.__coords){ loadAll(state.__coords); }
}

// ---- RECENT CITY CHIPS ----
function saveRecent(name){
  // Keep unique, newest-first, max 6.
  const set = new Set(state.recent);
  set.delete(name);
  state.recent = [name, ...[...set]].slice(0,6);
  localStorage.setItem('recentCities', JSON.stringify(state.recent));
  renderRecent();
}

function renderRecent(){
  const box = $('#recent');
  box.innerHTML = '';
  state.recent.forEach(city=>{
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = city;
    chip.onclick = ()=> searchCity(city);  // clicking chip re-runs the search
    box.appendChild(chip);
  });
}

// ---- RENDER: CURRENT CONDITIONS ----
function renderCurrent(data){
  const { name, sys, main, weather, wind, coord } = data;
  const w = weather?.[0] || {};

  // Left side: icon, temperature, short stats (humidity/wind/pressure)
  const left = document.createElement('div');
  left.innerHTML = `
    <div class="row">
      <img src="${iconUrl(w.icon||'01d')}" alt="${w.description||''}" width="80" height="80" />
      <div>
        <div class="big-temp">${fmtTemp(main?.temp)}</div>
        <div class="sub">Feels like ${fmtTemp(main?.feels_like)} • ${w.main||''}</div>
      </div>
    </div>
    <div class="row" style="margin-top:8px">
      <span class="pill">Humidity: ${Math.round(main?.humidity ?? 0)}%</span>
      <span class="pill">Wind: ${Math.round(wind?.speed ?? 0)} ${state.unit==='metric'?'m/s':'mph'}</span>
      <span class="pill">Pressure: ${Math.round(main?.pressure ?? 0)} hPa</span>
    </div>`;

  // Right side: city name, timestamp, and lat/lon
  const right = document.createElement('div');
  const d = toLocalDate(data.dt, data.timezone || 0);
  right.innerHTML = `
    <h2 style="margin:0 0 8px">${name||''}${sys?.country?`, ${sys.country}`:''}</h2>
    <div class="muted">Updated ${d.toLocaleString()}</div>
    <div style="margin-top:10px" class="row">
      <span class="pill">Lat: ${coord?.lat?.toFixed(2)}</span>
      <span class="pill">Lon: ${coord?.lon?.toFixed(2)}</span>
      <span class="pill">Unit: ${state.unit==='metric'?'Celsius':'Fahrenheit'}</span>
    </div>`;

  // Replace placeholders with real content
  const cur = $('#current'); cur.innerHTML = ''; cur.appendChild(left); cur.appendChild(right);
  $('#curMeta').textContent = `Source: OpenWeather • ${new Date().toLocaleTimeString()}`;
}

// ---- RENDER: 5‑DAY FORECAST ----
function renderForecast(list, tz){
  const box = $('#forecast'); box.innerHTML='';

  // OpenWeather 5‑day endpoint gives data every 3 hours.
  // We pick ~one entry per day near noon for a clean summary.
  const byDay = {};
  list.forEach(item=>{
    const local = toLocalDate(item.dt, tz);
    const key = local.toISOString().slice(0,10);     // YYYY‑MM‑DD
    const hour = local.getUTCHours();                // use hour to measure closeness to noon
    const cand = byDay[key];
    const score = Math.abs(12 - hour);               // smaller = closer to noon
    if(!cand || score < cand.score){ byDay[key] = { item, score }; }
  });

  Object.keys(byDay).sort().slice(0,5).forEach(key=>{
    const it = byDay[key].item;
    const d = toLocalDate(it.dt, tz);
    const el = document.createElement('div');
    el.className = 'tile';
    el.innerHTML = `
      <h4>${d.toLocaleDateString(undefined,{ weekday:'short', month:'short', day:'numeric' })}</h4>
      <img src="${iconUrl(it.weather?.[0]?.icon||'01d')}" alt="" width="60" height="60" />
      <div style="font-weight:700">${fmtTemp(it.main?.temp)}</div>
      <div class="muted" style="font-size:.9rem">${it.weather?.[0]?.main||''}</div>`;
    box.appendChild(el);
  });
}

// ---- ERROR HANDLING ----
function showError(msg){
  $('#current').innerHTML = `<div class='err'>${msg}</div>`;
  $('#forecast').innerHTML = '';
  $('#curMeta').textContent = '';
}

// ---- SEARCH FLOW ----
// 1) Geocode the user input to get lat/lon.
// 2) Fetch current weather + forecast for those coordinates.
// 3) Update UI and recent city list.
async function searchCity(q){
  if(!q) return;
  // Show loading placeholders
  $('#current').innerHTML = `<div class='skeleton' style='height:140px; border-radius:14px'></div>`;
  $('#forecast').innerHTML = `<div class='skeleton' style='height:120px; border-radius:12px'></div>`;

  try{
    const g = await fetch(GEO_URL(q));
    if(!g.ok) throw new Error('Geocoding failed');
    const places = await g.json();
    if(!places.length) return showError('No matching city found. Try "Paris" or "Tokyo".');

    const { lat, lon, name, country, state:st } = places[0];
    state.lastCity = [name, st, country].filter(Boolean).join(', ');
    localStorage.setItem('lastCity', state.lastCity);
    saveRecent(state.lastCity);

    await loadAll({ lat, lon });
  }catch(err){
    console.error(err);
    showError('Something went wrong. Check your API key and network.');
  }
}

// ---- FETCH BOTH PANELS ----
async function loadAll({lat,lon}){
  state.__coords = {lat,lon};
  try{
    // Fetch current weather + forecast at the same time
    const [curRes, foreRes] = await Promise.all([
      fetch(CURR_URL(lat,lon,state.unit)),
      fetch(FORE_URL(lat,lon,state.unit))
    ]);
    if(!curRes.ok) throw new Error('Current weather error');
    if(!foreRes.ok) throw new Error('Forecast error');

    const cur = await curRes.json();
    const fore = await foreRes.json();

    renderCurrent(cur);
    renderForecast(fore.list || [], cur.timezone || 0);
  }catch(err){
    console.error(err);
    showError('Failed to load weather data.');
  }
}

// ---- BROWSER GEOLOCATION ----
function useMyLocation(){
  if(!('geolocation' in navigator)) return alert('Geolocation not supported by your browser.');
  navigator.geolocation.getCurrentPosition(async pos=>{
    const { latitude:lat, longitude:lon } = pos.coords;
    await loadAll({ lat, lon });

    // Attempt a reverse geocode to get a friendly city label
    try{
      const rev = await fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${OPENWEATHER_API_KEY}`);
      const arr = await rev.json();
      const label = arr?.[0] ? [arr[0].name, arr[0].state, arr[0].country].filter(Boolean).join(', ') : `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      state.lastCity = label;
      localStorage.setItem('lastCity', label);
      saveRecent(label);
    }catch{
      /* non‑critical: still shows data even if reverse lookup fails */
    }
  }, ()=> alert('Could not get your location.'));
}

// ---- EVENT WIRING ----
document.addEventListener('DOMContentLoaded', ()=>{
  // Search by clicking the button or pressing Enter
  $('#go').addEventListener('click', ()=> searchCity($('#q').value.trim()));
  $('#q').addEventListener('keydown', (e)=>{ if(e.key==='Enter') searchCity($('#q').value.trim()) });

  // Geolocation button
  $('#geoBtn').addEventListener('click', useMyLocation);

  // Unit toggle buttons
  document.querySelectorAll('#unitToggle button').forEach(b=> b.addEventListener('click', ()=> setUnit(b.dataset.unit)));

  // Initialize UI state and load the last city
  setUnit(state.unit);
  renderRecent();
  searchCity(state.lastCity);
});
