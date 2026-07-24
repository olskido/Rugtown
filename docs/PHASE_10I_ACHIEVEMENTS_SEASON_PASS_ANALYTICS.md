# Phase 10I — Achievements, Titles, Season Pass, Analytics & Monitoring

Server-authoritative engagement layer built on Phase 10F–10H. Does not weaken fail-closed reward authority, settlement controls, or the append-only ledger.

---

## Architecture

```
Gameplay / rewards (10G/10H)
        │
        ▼
enqueue_achievement_evaluation / evaluate_player_achievements
        │
        ├─ player_achievement_progress (never decreases except admin)
        ├─ player_achievements (unique unlocks)
        ├─ reward_ledger (idempotent XP/REP/etc.)
        ├─ player_titles + notifications + progression history
        └─ analytics events

Season pass (separate points from season leaderboard)
        │
        ├─ grant_season_pass_points (idempotent)
        ├─ evaluate_season_pass_progress → tier
        └─ claim_season_pass_reward (free; premium gated + disabled by default)
```

### Trust boundaries

| Actor | May | Must not |
|---|---|---|
| Browser | Display, request evaluation, equip owned title, claim eligible free rewards | Decide unlocks, thresholds, premium, amounts |
| SECURITY DEFINER RPCs | Evaluate, grant, claim | Accept executable rule code |
| Operators | Dashboard, corrections, test entitlements | Silent balance overwrites |
| Guests | Local ProgressionService preview | Server ledger / premium / SOL |

---

## Point relationship

| Balance | Purpose |
|---|---|
| XP | Lifetime level curve |
| REP | Reputation |
| Rug Points | In-game campaign currency (not SOL) |
| Season points | Season leaderboard score |
| **Season-pass points** | **Separate** track for pass tiers |

Season-pass points are **not** identical to season points.

---

## Achievement lifecycle

1. Definitions + versioned rules seeded server-side (`achievement_definitions`, `achievement_rule_versions`).
2. Trusted events enqueue or call `evaluate_player_achievements`.
3. Progress upserted (monotonic).
4. On threshold: insert unlock → ledger grant → optional title → notify → history → analytics.
5. All grants use idempotency keys (`achievement:<id>:xp` / `:rep`).

Secret achievements (`is_secret`) are excluded from the public catalog and rule SELECT policies.

---

## Title lifecycle

Titles are separate from ranks and holder tiers.

- Unlock via achievement / operator grant
- Equip via `equip_player_title` (ownership required)
- One equipped title at a time
- Equipping does not change XP/REP
- Public view: `get_public_player_title`

---

## Season pass

- `season_passes` linked to existing seasons
- Free track default; `premium_enabled = false` by default
- TEST pass: `test-pass-2026` (draft, 10 tiers, in-game rewards only)
- Claims: one per player+reward; premium requires entitlement + enabled flag

### Activate TEST pass (manual)

```sql
UPDATE public.season_passes
SET status = 'active', starts_at = now(), ends_at = now() + interval '14 days'
WHERE id = 'test-pass-2026' AND is_test = true;
```

Never auto-activated.

### Grant pass points (server)

```sql
SELECT public.grant_season_pass_points(
  '<player_uuid>', 'test-pass-2026', 50,
  'test:daily:2026-07-16', 'mission'
);
```

---

## Evaluation queue

`achievement_evaluation_queue` + `process_achievement_evaluation_queue`.

Edge Function: `process-achievement-queue` (service-role).

Also: `run_progression_maintenance()` processes queue, snapshots, and raises alerts.

---

## Analytics & alerts

- `reward_analytics_events` — product events (not a second ledger)
- `economy_daily_snapshots` — server aggregates
- `operational_alerts` — operator-only
- `analytics_job_runs` — job history

Players cannot insert aggregates or create alerts.

---

## Operator tools

- `get_progression_ops_dashboard`
- `list_operational_alerts` / `acknowledge_operational_alert`
- `reconcile_player_achievement`
- `operator_grant_title` / `operator_revoke_title` (reason required)
- `grant_test_entitlement`

All gated by `reward_operators`.

---

## Player UI

- **Achievement Centre** — filters, progress, refresh/evaluate, secret-safe
- **Title Locker** — equip/unequip owned titles
- **Season Pass** — tiers, free claims, premium-disabled messaging, TEST badge
- **Reward Operations** — progression health + maintenance

Guests see previews; server unlocks require auth.

---

## Deployment steps

1. Apply Phase 10G + 10H migrations.
2. Apply `20260716_phase10i_achievements_season_pass_analytics.sql`.
3. Validate:

```bash
node scripts/validate-achievement-system.mjs
node scripts/validate-season-pass-system.mjs
node scripts/validate-progression-analytics.mjs
node scripts/validate-phase10i-rls.mjs
```

4. Deploy Edge Function `process-achievement-queue`.
5. Schedule `run_progression_maintenance` (pg_cron or Edge cron).
6. Confirm catalog: `SELECT get_achievement_catalog();`
7. Optionally activate TEST pass (SQL above).
8. Authenticated player: open Achievement Centre → Refresh / evaluate.
9. Equip a title via Title Locker.
10. Grant TEST pass points → claim free reward.
11. Operator: open Reward Operations → progression health.
12. Generate snapshot: `SELECT generate_economy_daily_snapshot();`
13. Reconcile if needed: `SELECT reconcile_player_achievement('<player>','<ach_id>');`

---

## Rollback

Additive. Safe rollback: leave tables; stop queue worker; set season passes to `paused`/`cancelled`. Do not delete unlock or ledger history.

---

## Remaining risks

- Client-reported discoveries/statistics still feed some rule values until full attestation consumption lands.
- Guest→account achievement migration trust risk remains.
- Premium / payment providers not implemented (by design).
- Live Realtime / dual-account / production jobs not verified in this phase.

---

## Recommended next phase (10J)

Player identity and social systems: friends, DMs, block/report, presence privacy, moderation logs, chat safety, profile showcases.
