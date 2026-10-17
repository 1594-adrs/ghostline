# Contributing

## Setup (Windows 11)

- Node ≥ 24.15 (see `.nvmrc`), Rust stable (rustup), Visual Studio Build Tools with the C++ workload, and WebView2 (preinstalled on Windows 11).
- `npm ci`
- `npm run fetch:vosk`: downloads libvosk into `src-tauri/vendor/` and checks its SHA-256. The folder is gitignored.
- `npm run tauri dev`: runs the app.
- `npx ng serve`, then open `http://localhost:4200/?view=overlay&demo=1` or `?view=settings`: browser preview with no native features.

## Before opening a PR

```
npm run lint && npm run format:check && npm test && npx ng build
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

For changes to windows, hotkeys, capture or voice, also run the relevant items in [docs/manual-qa.md](docs/manual-qa.md).

## Conventions

- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Branches: `feature/*`, `fix/*` and `refactor/*` off `develop`. `main` only receives releases.
- IPC types live in two places that must stay in sync: `src/app/core/contracts.ts` (TS) and `src-tauri/src/ipc.rs` (Rust, serde camelCase).
- Never render script content with `innerHTML`. See [ADR-0002](docs/adr/0002-script-format.md).
- Architectural decisions go in `docs/adr/` as a new numbered ADR.
