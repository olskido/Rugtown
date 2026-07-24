# Phase 10J — Social Identity, Messaging, Presence Privacy & Moderation

Production-safe player identity and social foundation for RugTown.

## Architecture

| Layer | Responsibility |
|-------|----------------|
| Browser | Edit allowed profile fields, send friend requests, accept/reject, block, send allowed DMs, report, change privacy, select showcase items |
| Supabase RPCs | Authoritative friendship, block, messaging, rate limits, safety decisions, moderation actions |
| Realtime | Delivery hints for DMs / friend requests — **not** authorization |
| City chat (`rugtown:city`) | Ephemeral broadcast; client sanitization; separate from DMs |

## Trust boundaries

- Friendship, blocks, message permission, suspension, and rate limits are **server-only**.
- `rt_notify` is **not** callable by clients (PUBLIC execute revoked).
- Public profile RPCs never return email, wallet, auth provider, IP, moderation history, or exact last-active timestamps.
- City chat sender labels are best-effort; DMs bind to `auth.uid()`.

## Chat safety behavior (chosen)

For DMs (`rt_safety_check_message`):

1. Reject seed-phrase / private-key / dangerous URL schemes / clear scam language **before send**.
2. Hold suspicious short-link patterns for review (`held`).
3. Soft-delete retains `original_body` for moderation evidence.

City chat uses `sanitizeCityChat` on send and receive; it remains ephemeral and is not a DM substitute.

## Profile privacy defaults

- Profile visibility: `public` (searchable fields still gated)
- Friend requests: `everyone`
- Messages: **`friends_only`**
- Presence: **`friends`**
- Exact last-active: **off**

## Message retention (Phase 10J)

- Messages kept unless soft-deleted.
- Reported / moderated content retained as evidence.
- No promise of permanent storage; no automatic purge of safety evidence.
- Soft-deleted content shows a placeholder to ordinary users.

## Guest behavior

Guests may play, see city chat / nearby players, and view limited public cards.
Guests may **not** send friend requests, persistent DMs, blocks, reports, or personal Realtime social subscriptions.

## Deployment

1. Apply `database/migrations/20260716_phase10j_social_identity_moderation.sql` after 10G–10I.
2. Run validators:
   - `node scripts/validate-social-schema.mjs`
   - `node scripts/validate-friendship-state-machine.mjs`
   - `node scripts/validate-direct-messaging.mjs`
   - `node scripts/validate-social-rls.mjs`
   - `node scripts/validate-moderation-permissions.mjs`
   - `node scripts/validate-presence-privacy.mjs`
3. Insert social operators into `social_operators` (not `reward_operators`) for moderation access.
4. Configure Realtime publication for `direct_messages`, `friend_requests`, `friendships` as needed for client refresh.
5. Schedule `run_social_maintenance` via an operator-authenticated cron / Edge Function (function is moderator-gated).

### Environment

| Variable | Scope |
|----------|--------|
| `VITE_SUPABASE_URL` / anon key | Browser |
| Service role / moderation secrets | Server only — never in Vite |
| Rate-limit / link-safety tuning | SQL defaults / future Edge config |

## Operator walkthrough

1. Apply migration
2. Validate schema scripts
3. Create two authenticated test accounts
4. Configure privacy in Social → Privacy
5. Send friend request (Search or player card)
6. Accept on the other account
7. Open Social → Messages or Message on card
8. Send / receive DMs
9. Test message requests (set recipient policy to `requests`)
10. Block player → verify messaging denied
11. Unblock → friendship **not** restored
12. Report a message
13. Open moderation console (social operator)
14. Issue temporary DM restriction
15. Verify restriction blocks send
16. Reverse / expire via maintenance or new action
17. Test presence visibility = nobody (appears offline)
18. Confirm Realtime refresh of conversations (if published)
19. Run `reconcile_friendship_state` / `run_social_maintenance` as operator

## Rollback

Drop Phase 10J functions/tables only if no production social data must be retained.
Do **not** roll back 10G–10I reward tables when reverting social features.

## Remaining risks

- City chat is still client-broadcast (spoofable display names); identity for social systems uses auth UUIDs.
- Showcase ownership RPCs are table-ready; UI showcase editor is minimal.
- Live dual-account / Realtime / moderation tests require a deployed Supabase project.
- Reactions catalog exists in schema; UI reactions deferred.
- Structured achievement shares deferred to a follow-up.

## Recommended next phase

**Phase 10K** — parties, party chat, shared missions, group presence, anti-boosting, group moderation.
