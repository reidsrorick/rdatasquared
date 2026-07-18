# CDL 2026 Analyzer

A static **HTML / CSS / JS** app for exploring the Call of Duty League 2026 data
scraped by the sibling `scraper-app`. No build step, no dependencies, no CDN —
just open it over http. GitHub Pages-ready.

## Features

- **Overview** — season KPIs, top players by BP rating & kills, standings.
- **Players** — full sortable/searchable stat leaderboard (season). Click a player
  for mode ratings and a per-event BP-rating trend.
- **Teams** — team stat leaderboard + records. Click a team for roster and splits.
- **Matches** — every match, filterable by event/team/status. Click for the
  per-map (per-game) breakdown.
- **Maps** — most-played maps, mode distribution, map pool with averages.
- **Events** — tournaments with dates/prize/location. Click for stat leaders.

## Use it

1. **Get the data.** Run the scraper (`../scraper-app/run.bat`), then double-click
   **`copy-data.bat`** here to copy its `output/*.json` into `data/`.
2. **Serve over http** (browsers block `fetch` of local files over `file://`):
   double-click **`serve.bat`**, or run `python -m http.server 8080`.
3. Open **http://127.0.0.1:8080**.

## Deploy to GitHub Pages

Commit this folder (including `data/`) to a repo and enable Pages, or push the
contents to a `gh-pages` branch. Because everything is static and self-contained,
it works as-is. Re-run `copy-data.bat` and commit `data/` to refresh the numbers.

## Structure

```
cdl-analyzer/
  index.html
  css/style.css
  js/
    charts.js   # dependency-free SVG bar/line/scatter
    data.js     # loads data/*.json, builds lookups + helpers
    app.js      # router, views, sortable tables, detail modals
  data/         # scraped JSON (populated by copy-data.bat)
```

## Data files consumed (from `data/`)

`players.json`, `teams.json`, `events.json`, `maps.json`, `modes.json`,
`matches.json`, `games.json`, `rosters.json`, `player_stats_season.json`,
`team_stats_season.json`, `player_stats_by_event.json`, `team_stats_by_event.json`.

Required to boot: players, teams, matches, player/team season stats. The rest
enrich individual views and degrade gracefully if absent.
