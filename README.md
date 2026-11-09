# Liverbird News

Mobile-first hub for Liverpool FC (senior men): live news, stats by competition, squad, injuries with return windows, and club history.

**Live site:** https://apoe218.github.io/Liverbird-News/

## How it works
- Static site, no build step. `index.html`, `app.js`, `styles.css`.
- **News is live:** every load fetches BBC Sport and Google News feeds in the browser (via the public rss2json service, with allorigins as a fallback), caches the result, and falls back to `data/news.json`.
- **Stats, squad, injuries, history are hand-curated** in `data/*.json`. Edit those files to update them.
- A scheduled GitHub Action rebuilds the site every 3 hours so the bundled news snapshot stays fresh.

## Updating data
| File | Contents |
|---|---|
| `data/competitions.json` | Tables, results and summaries per competition |
| `data/meta.json` | Next match, fixtures, head coach |
| `data/squad.json` | Roster and summer departures |
| `data/injuries.json` | Injury list with return window and confidence |
| `data/history.json` | Honours, timeline, facts |

Local preview: `python3 -m http.server` then open http://localhost:8000.
