# Manual cleanup

The asset installer marks assets rejected when their pipeline metadata requires review or QA reports them as duplicate textures. Review those entries in `asset-audit.json` before making source-art decisions.

To refresh derived files after a source-art correction:

1. Update the character pipeline atlas/metadata inputs.
2. Run `npm run assets:characters`.
3. Run `npm run validate:characters`.
4. Run `npm run test:character-appearance` and `npm run build`.

Do not hand-edit `character_runtime_manifest.json`, `asset-audit.json`, or the generated TypeScript manifest; regenerate them through the installer.
