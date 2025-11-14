# Team Weather — Prototype (Commented)
This version adds concise, presentation‑ready comments to help you explain each part.

## How to Run
1) Open `app.js` and replace `YOUR_OPENWEATHER_API_KEY` with your key from OpenWeather.
2) Open `index.html` in a modern browser.
   - If geolocation is blocked on `file://`, run a simple server:
     - Python 3: `python -m http.server 8080` → visit http://localhost:8080

## What to Show in the Demo
- **Header:** unit toggle (°C/°F), “My Location,” and the search bar.
- **Search Flow:** type a city → geocoding → current weather + 5‑day forecast render.
- **Recent Chips:** click to quickly re‑load a previous city.
- **Code Tour:** `app.js` sections (API config → state → rendering → fetch flow → events).

## Files
- `index.html` — semantic structure + header/main layout
- `styles.css` — theme tokens and responsive grid/cards
- `app.js` — fetches data, renders UI, wires events (heavily commented)
