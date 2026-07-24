# Homepage Visual Refresh (Phase 10M)

## Asset

Homepage uses the **same** playable world art as Phaser:

- URL: `/assets/world/main_rugtown.png`
- Config: `src/config/homepageVisual.ts`

Do **not** point the homepage at legacy `rugtown-city.png`.

## Swap artwork later

1. Replace `public/assets/world/main_rugtown.png` (also updates the game), **or**
2. Change `HOMEPAGE_VISUAL.backgroundUrl` only if the homepage should diverge.

## Features

- Full-viewport cover
- Focal positions for desktop / tablet / mobile
- Dark + gold readability wash
- Parallax drift disabled under `prefers-reduced-motion` and on small mobile
- Loading screen uses the same world image
