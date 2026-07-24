/**
 * Bitmap character creator panel — registry-driven live bitmap preview.
 * Draft edits are local until Save commits via CharacterAppearanceService
 * (guest localStorage or authenticated Supabase RPC).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterAppearanceV1 } from '../../game/characters/appearance/CharacterAppearanceDefaults';
import { getDefaultCharacterAppearance } from '../../game/characters/appearance/CharacterAppearanceDefaults';
import { encodeCharacterAppearance, normalizeCharacterAppearance } from '../../game/characters/appearance/CharacterAppearanceCodec';
import { listCreatorAssets, assetExists, getAssetById } from '../../game/characters/assets/CharacterAssetRegistry';
import { characterAppearanceService } from '../../game/characters/appearance/CharacterAppearanceService';
import { CharacterPreviewGame } from '../../game/CharacterPreviewGame';
import { loadCharacterRuntimeManifest } from '../../game/characters/assets/CharacterAssetRegistry';

export interface BitmapCharacterCreatorProps {
  open: boolean;
  isGuest: boolean;
  initial?: CharacterAppearanceV1 | null;
  onClose: () => void;
  onSaved?: (appearance: CharacterAppearanceV1) => void;
  onToast?: (text: string) => void;
}

type Cat = 'base' | 'outfit' | 'hair' | 'facial-hair' | 'headwear' | 'pants' | 'shoes' | 'accessories';

const CATS: { id: Cat; label: string }[] = [
  { id: 'base', label: 'Body' },
  { id: 'outfit', label: 'Outfit' },
  { id: 'hair', label: 'Hair' },
  { id: 'facial-hair', label: 'Facial' },
  { id: 'headwear', label: 'Hat' },
  { id: 'pants', label: 'Pants' },
  // shoes + most accessories are marked incompatible in the manifest
  { id: 'accessories', label: 'Extras' },
];

export function BitmapCharacterCreator({
  open, isGuest, initial, onClose, onSaved, onToast,
}: BitmapCharacterCreatorProps) {
  const [draft, setDraft] = useState<CharacterAppearanceV1>(() =>
    normalizeCharacterAppearance(initial ?? characterAppearanceService.getAppearance(), assetExists),
  );
  const [committed, setCommitted] = useState<CharacterAppearanceV1>(() =>
    normalizeCharacterAppearance(initial ?? characterAppearanceService.getAppearance(), assetExists),
  );
  const [cat, setCat] = useState<Cat>('base');
  const [visibleItems, setVisibleItems] = useState(24);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<'down' | 'left' | 'right'>('down');
  const hostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<CharacterPreviewGame | null>(null);

  useEffect(() => {
    if (!open) return;
    const current = normalizeCharacterAppearance(initial ?? characterAppearanceService.getAppearance(), assetExists);
    setDraft(current);
    setCommitted(current);
    setVisibleItems(24);
    let cancelled = false;
    void loadCharacterRuntimeManifest().then(() => {
      if (!cancelled) setReady(true);
    }).catch(() => {
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, [open, initial]);

  useEffect(() => {
    if (!open || !ready || !hostRef.current) return;
    const game = new CharacterPreviewGame(hostRef.current, draft);
    previewRef.current = game;
    game.setFacing(facing);
    return () => {
      game.destroy();
      previewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready]);

  // Phase 11C — removed a redundant `useEffect(() => previewRef.current
  // ?.setAppearance(draft), [draft])` here. Every call site that changes
  // `draft` (applySlot, Reset, Randomize) already calls
  // `previewRef.current?.setAppearance(...)` directly and synchronously
  // in the same event handler, which is what made the preview feel
  // instant. The effect fired a SECOND time on every selection (the
  // BitmapCharacter diff found nothing changed and did no-op work, but
  // it was still a wasted pass through normalizeCharacterAppearance +
  // the layer diff on every single click).

  useEffect(() => {
    previewRef.current?.setFacing(facing);
  }, [facing]);

  const assetsByCategory = useMemo<Record<Cat, ReturnType<typeof listCreatorAssets>>>(() => {
    const assets = {} as Record<Cat, ReturnType<typeof listCreatorAssets>>;
    for (const category of CATS) assets[category.id] = ready ? listCreatorAssets(category.id) : [];
    return assets;
  }, [ready]);
  const visibleCats = useMemo(
    () => CATS.filter((c) => c.id === 'base' || (assetsByCategory[c.id]?.length ?? 0) > 0),
    [assetsByCategory],
  );
  const items = assetsByCategory[cat] ?? [];
  const hasUnsavedChanges = encodeCharacterAppearance(draft) !== encodeCharacterAppearance(committed);

  const summary = useMemo(() => {
    const parts = [draft.baseId, draft.outfitId, draft.hairId, draft.pantsId, draft.shoesId, draft.headwearId].filter(Boolean);
    return parts.join(' · ');
  }, [draft]);

  const applySlot = useCallback((id: string | null) => {
    const next = { ...draft };
    if (cat === 'base' && id) next.baseId = id;
    else if (cat === 'outfit') next.outfitId = id;
    else if (cat === 'hair') next.hairId = id;
    else if (cat === 'facial-hair') next.facialHairId = id;
    else if (cat === 'headwear') next.headwearId = id;
    else if (cat === 'pants') next.pantsId = id;
    else if (cat === 'shoes') next.shoesId = id;
    else if (cat === 'accessories') {
      if (!id) next.accessoryIds = [];
      else {
        const set = new Set(next.accessoryIds);
        if (set.has(id)) set.delete(id);
        else if (set.size < 3) set.add(id);
        next.accessoryIds = [...set];
      }
    }
    const normalized = normalizeCharacterAppearance(next, assetExists);
    setDraft(normalized);
    // Preview is local and immediate; persistence happens only on Save.
    previewRef.current?.setAppearance(normalized);
  }, [cat, draft]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} data-ui-block-camera role="dialog" aria-modal="true" aria-label="Character Creator">
      <div className="modal-panel reward-centre character-creator" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-header__icon" aria-hidden>✦</span>
          <div className="modal-header__titles">
            <span className="modal-header__title">Character Creator</span>
            <span className="modal-header__sub">
              {isGuest ? 'Draft locally · Save to keep on this device' : 'Draft locally · Save commits via Supabase appearance RPC'}
            </span>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body reward-centre__body">
          <div
            ref={hostRef}
            className="character-creator__preview"
            style={{ width: '100%', height: 220, marginBottom: 10, background: 'rgba(8,12,16,0.85)', border: '1px solid rgba(200,144,42,0.22)' }}
            aria-label="Character preview"
          />
          <p className="reward-centre__meta">Facing: {facing}. Selected: {summary || 'default'}</p>
          {hasUnsavedChanges && <p className="reward-centre__meta">Unsaved changes</p>}
          <div className="social-hub__tabs">
            {(['down', 'left', 'right'] as const).map((d) => (
              <button key={d} type="button" className={`profile-action-btn${facing === d ? ' profile-action-btn--followed' : ''}`} onClick={() => setFacing(d)}>{d}</button>
            ))}
          </div>
          <div className="social-hub__tabs">
            {visibleCats.map((c) => (
              <button key={c.id} type="button" className={`profile-action-btn${cat === c.id ? ' profile-action-btn--primary' : ''}`} onClick={() => { setCat(c.id); setVisibleItems(24); }}>{c.label}</button>
            ))}
          </div>
          <ul className="reward-mission-list character-creator__grid">
            {cat !== 'base' && (
              <li>
                <button type="button" className="profile-action-btn" onClick={() => applySlot(null)}>None</button>
              </li>
            )}
            {items.length === 0 && <li className="profile-empty">No items in this category yet.</li>}
            {items.slice(0, visibleItems).map((a) => (
              <li key={a.id}>
                <div className="reward-mission-list__main">
                  <strong>{a.displayName ?? a.id}</strong>
                  <span className="reward-centre__meta">{a.id}</span>
                </div>
                <button type="button" className="profile-action-btn profile-action-btn--primary" onClick={() => applySlot(a.id)}>Select</button>
              </li>
            ))}
          </ul>
          {visibleItems < items.length && (
            <button type="button" className="profile-action-btn" onClick={() => setVisibleItems((count) => count + 24)}>
              More ({items.length - visibleItems} remaining)
            </button>
          )}
          <div className="dm-panel__composer">
            <button
              type="button"
              className="profile-action-btn"
              disabled={busy}
              onClick={() => {
                const next = getDefaultCharacterAppearance();
                setDraft(next);
                previewRef.current?.setAppearance(next);
              }}
            >
              Reset
            </button>
            <button
              type="button"
              className="profile-action-btn"
              disabled={busy}
              onClick={() => {
                const hair = listCreatorAssets('hair');
                const pants = listCreatorAssets('pants');
                const bases = listCreatorAssets('base');
                const hats = listCreatorAssets('headwear');
                const facial = listCreatorAssets('facial-hair');
                const outfits = listCreatorAssets('outfit');
                const next = normalizeCharacterAppearance({
                  version: 1,
                  baseId: bases[Math.floor(Math.random() * bases.length)]?.id,
                  hairId: hair[Math.floor(Math.random() * hair.length)]?.id ?? null,
                  outfitId: outfits.length ? outfits[Math.floor(Math.random() * outfits.length)]?.id ?? null : null,
                  pantsId: Math.random() > 0.35 ? pants[Math.floor(Math.random() * pants.length)]?.id ?? null : null,
                  shoesId: null,
                  facialHairId: Math.random() > 0.55 ? facial[Math.floor(Math.random() * facial.length)]?.id ?? null : null,
                  headwearId: Math.random() > 0.45 ? hats[Math.floor(Math.random() * hats.length)]?.id ?? null : null,
                  accessoryIds: [],
                }, assetExists);
                setDraft(next);
                previewRef.current?.setAppearance(next);
              }}
            >
              Randomize
            </button>
            <button
              type="button"
              className="profile-action-btn profile-action-btn--primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await characterAppearanceService.saveAuthenticated(draft);
                onToast?.(res.message);
                if (res.ok) {
                  const saved = characterAppearanceService.getAppearance();
                  setCommitted(saved);
                  onSaved?.(saved);
                }
                setBusy(false);
              }}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
          <p className="reward-centre__meta">
            Base texture: {getAssetById(draft.baseId)?.textureKey ?? draft.baseId}
          </p>
        </div>
      </div>
    </div>
  );
}
