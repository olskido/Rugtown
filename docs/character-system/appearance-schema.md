# Appearance schema

Version 1 appearance stores registry IDs only:

```ts
{
  version: 1,
  baseId: string,
  hairId: string | null,
  facialHairId: string | null,
  headwearId: string | null,
  pantsId: string | null,
  shoesId: string | null,
  accessoryIds: string[] // maximum 3
}
```

`normalizeCharacterAppearance` accepts safe IDs (`[a-z0-9][a-z0-9_-]{0,79}`), rejects URL and path-like values, removes duplicate accessories, caps accessories at three, and ignores unknown fields. An optional registry resolver replaces unknown asset IDs with slot defaults or `null`.

Presence uses the compact JSON form: `v`, `b`, `h`, `f`, `w`, `p`, `s`, and `a`. `decodeCharacterAppearance` accepts compact or full objects. Legacy creator objects that contain `hairstyle` without `baseId` migrate to the bitmap default.
