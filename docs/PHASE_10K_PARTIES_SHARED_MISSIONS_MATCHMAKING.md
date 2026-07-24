# Phase 10K — Parties, Shared Missions, Matchmaking & Anti-Boosting

Coordinated multiplayer foundation for RugTown. Builds on Phases 10G–10J without weakening reward, social, or moderation authority.

## Architecture

| Layer | Role |
|-------|------|
| Browser | Create/invite/leave, ready, party chat, contribution evidence submit, queue |
| RPCs | Membership, leadership, chat, missions, allocations, matchmaking |
| Ledger | In-game XP/REP claims only via `claim_party_reward` |
| Realtime | Delivery hints (`party:${userId}`) — not authorization |

## Trust boundaries

- Party membership and roles are **server-only** (no client INSERT policies).
- Blocks and social restrictions apply inside parties.
- Party chat reuses `rt_safety_check_message`; identity is `auth.uid()`.
- City presence coordinates remain on `rugtown:city` for rendering only — never returned from party/profile APIs.
- Party presence exposes district/activity only (preference-gated), not exact coordinates.
- Leaders cannot grant rewards or mark others ready.

## Party defaults

- Visibility: `private`
- Join policy: `invite_only`
- Max members: **4**
- One active membership per player
- One active leader per party

## Shared missions

Catalog: `party_mission_definitions` (separate from solo missions).

**TEST:** `test-town-tour-2026` — seeded **inactive**. Requires multi-member contributions; single-contributor completion → `under_review` / `reward_held`.

## Matchmaking

**TEST queue:** `test-party-activity-queue` — seeded **paused**. No rewards for queue entry. Processor: `process_party_matchmaking` (operator-gated).

## Presence boundaries

| Channel | Purpose | Coordinates |
|---------|---------|-------------|
| City presence | Nearby render | Yes (gameplay-scoped) |
| Social presence | Privacy-aware status | No |
| Party presence | Member activity | District only |
| Profile APIs | Public cards | No |

## Deployment

1. Apply `20260716_phase10k_parties_shared_missions_matchmaking.sql` after 10J.
2. Run `node scripts/validate-party-schema.mjs` and `node scripts/validate-party-membership-state-machine.mjs`.
3. Publish Realtime for `party_members`, `party_invitations`, `party_chat_messages` as needed.
4. Activate TEST mission: `UPDATE party_mission_definitions SET active=true WHERE id='test-town-tour-2026';`
5. Activate TEST queue: `UPDATE party_matchmaking_queues SET status='active' WHERE slug='test-party-activity-queue';`
6. Optional Edge Function stub: `supabase/functions/process-party-matchmaking` calling `process_party_matchmaking`.
7. Schedule `run_party_maintenance` for operators.

## Smoke test (multi-account)

1. Create party (P) → invite UUID → accept → party chat → ready → block conflict verify → TEST mission contributions → complete → claim → queue (if active) → maintenance.

## Rollback

Drop 10K party tables/functions only; do not roll back 10G–10J.

## Remaining risks

- City presence still client-authoritative for movement identity.
- Action receipts not yet required by all contributions (hash-based evidence accepted for TEST).
- Discoverable finder exists but default visibility is private.
- Live dual-account / Realtime / matchmaking tests not run in this environment.

## Next phase

**10L** — scheduled town events, cooperative event objectives, event lobbies, anti-collusion.
