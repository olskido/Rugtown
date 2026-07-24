# Drop zone for new character art

Put transparent PNGs directly in the matching folder, then run:

```
npm run ingest:character-art
npm run assets:characters
npm run qa:character-compose
```

The first command packs whatever you dropped in into atlases and
registers it. The second installs it into the game. The third generates
screenshot-style contact sheets under `docs/character-system/qa/` so you
can check alignment before opening the game.

## Folders

- `base/` — full body sprites. One per skin tone. **512×768 transparent
  PNG**, front-facing, feet flat, arms slightly away from the body.
  Filename becomes the skin tone id — `fair.png` → `base_skin_fair.png`
  (or name it that directly).
- `outfit/` — clothing, drawn on a canvas that **exactly matches the
  base body canvas** (512×768, same pose/proportions) so it lines up
  with zero manual offset. This is a separate layer over a bare-skin
  base — not baked onto the body.
- `hair/`, `headwear/`, `facial-hair/`, `accessories/` — 512×512
  transparent PNG, generous padding is fine.
- `pants/`, `shoes/` — currently de-prioritized (shoes are disabled in
  the creator; ask before generating).

## Rules

- Transparent background, no baked shadow, no baked ground.
- **One pose/view per file.** Don't pack a front view and a side view
  into the same image — this broke 8 existing assets and had to be
  fixed by excluding them (see `docs/character-system/phase11c-notes.md`).
- Front-facing ("down") only for now — the renderer doesn't yet use true
  left/right/up art (it approximates via mirroring where safe). If you
  can generate a 4-direction turnaround anyway, keep each direction as a
  separate file (`hair_buzzcut_down.png`, `_left.png`, etc.) — future
  work can wire those in without regenerating anything.
- Re-running the ingest script re-packs everything currently in these
  folders. It never touches the original 340 existing assets — those
  live in separate atlas files.
