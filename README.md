# Personal Fitness

An offline-first workout app, installable on Android and iPhone as a Progressive Web App.

- **Getting started:** a short welcome asks for your goals and kg or lb. Then you pick a ready-made program (beginner 3-day, intermediate 4-day or expert 5-day full body), build your own, or just log workouts. You can also load a backup from another phone.
- **Programs:** editable. Every change is saved as a new version, so past workouts always keep the version they used.
- **Logger:** pre-filled sets, rest timer and autosave. Works offline. Each exercise has photos and a how-to, and you can swap it for one workout (machine taken, no equipment, pain) without touching its targets.
- **Automatic progression:** deterministic, tested rules decide when a weight goes up, holds or goes down. Each decision is explained in plain English, and anything beyond a routine step waits for approval.
- **Weekly planner:** you choose rest days, and the planner places the workouts around them with recovery in mind.
- **Exercise library:** over 900 gym, street-workout, bodyweight and band exercises, grouped by body part, equipment and type, with photos and instructions. You can add your own.
- **Workout builder:** pick a focus (full, upper, lower, push, pull, arms, core or chosen body parts), equipment, time and level. The app assembles the workout: big lifts first, then smaller muscles. Swap, shuffle and save.
- **Custom workouts** that never modify the program.
- **Progress:** charts (heaviest weight or estimated 1-rep max), automatic personal records, and body weight with weekly averages. A pull-up milestone tracker is included if "first pull-up" is one of your goals.
- **Bring your history:** import CSV from Strong, Hevy or a spreadsheet. For anything else (screenshots, notes, PDFs), a copyable prompt lets any AI chat convert it. A preview comes first, and nothing is ever overwritten.
- **Units:** kg or lb. Weights are stored in kg and converted everywhere they are shown or entered.
- **Backups:** saved through the phone's share sheet (Google Drive, Files, iCloud), with reminders. Restore and CSV export are included.

Exercise photos and instructions come from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain). `scripts/build-catalog.mjs` regenerates `src/engine/library/catalog.json` from it.

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
