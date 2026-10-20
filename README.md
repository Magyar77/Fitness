# Personal Fitness

An offline-first workout app for one person, installable on Android as a Progressive Web App.

- **Program:** a fixed weekly program (workouts A, B, C, E, D) kept exactly as written.
- **Logger:** pre-filled sets, rest timer and autosave. Works offline.
- **Automatic progression:** deterministic, tested rules decide when a weight goes up, holds or goes down. Each decision is explained in plain English, and anything beyond a routine step waits for approval.
- **Weekly planner:** you choose rest days, and the planner places the workouts around them with recovery in mind.
- **Custom workouts** that never modify the program.
- **Progress:** charts, body weight with weekly averages, and a pull-up milestone tracker.
- **Backups:** JSON backup and restore, plus CSV export.

All data stays on the device (IndexedDB). There is no account, server or tracking.

## Development

```bash
npm install
npm test          # engine, data and scheduling tests (Vitest)
npm run lint
npm run dev       # local dev server
npm run build     # production build in dist/
```

Code layout:

- `src/engine/`: pure training logic. It contains the program, the progression rules, the scheduler and the stats, and has no UI or database code.
- `src/data/`: the IndexedDB storage layer (Dexie), backup and import.
- `src/ui/`: React screens.
- `tests/`: unit and integration tests.

Personal data (training logs, coaching documents) is kept in git-ignored folders (`private/`, `docs/`). It is loaded onto the phone with the app's **More → Import data** feature and is never part of this repository.

## Deployment

Every push to `main` runs lint, the tests and the build, then publishes `dist/` to GitHub Pages (`.github/workflows/deploy.yml`). In the repository settings, set **Pages → Source** to **GitHub Actions**.
