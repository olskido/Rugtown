# Character Atlas Format (Phase 10M)

Logical frame: **48×72**, origin **bottom-center**, directions in rows: S, N, E, W.

## Required animation states (initial)

idle, walk, wave, celebrate, dance, sit, afk, typing, coffee, laugh, think, clap

## Future-ready

run, fishing, crafting, carrying, reading, phone, sleeping, cheering, pointing, facepalm, shrug

## Sheet naming

`{slug}_{state}_{version}.png` or atlas JSON under `public/assets/characters/manifests/`.

## Validation checks

- consistent frame size
- no absolute URLs
- direction count = 4
- foot anchor stable
- missing frames → procedural fallback

Bitmap sheets are **not shipped** in this phase; procedural fallback remains production.
