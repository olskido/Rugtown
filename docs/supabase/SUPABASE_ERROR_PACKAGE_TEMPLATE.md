# Supabase Error Package Template

Use this template when a RugTown migration fails. Fill in every section and paste back for diagnosis.

---

## Step 1 — Run diagnostics first

```sql
-- Paste entire contents of:
-- database/diagnostics/inspect_current_supabase_state.sql
```

Save **all** result sets.

---

## Step 2 — Fill this template

### Environment

- Supabase project URL: `____________________`
- New or existing project: `[ ] New  [ ] Existing`
- Previously applied any RugTown SQL: `[ ] Yes  [ ] No  [ ] Unknown`

### SQL file attempted

```
Exact file path: database/release/____________________.sql
```

### Prerequisites check result

From section `5_phase_presence` in diagnostics:

| Flag | Value |
|------|-------|
| phase_10g_player_progression | |
| phase_10g_reward_ledger | |
| phase_13_chapter_missions | |
| phase_13_curve_version_column | |

### Failing statement

Paste the exact SQL statement or function name that failed:

```sql

```

### Exact error text

```
(paste full Supabase error message)
```

### SQLSTATE (if shown)

```
e.g. 42710, 42P01, 42883
```

### Line number (if shown)

```
```

### Transaction rolled back?

`[ ] Yes  [ ] No  [ ] Unknown`

### Partial prior application?

`[ ] Yes — describe what was applied before failure`  
`[ ] No — first attempt`

---

## Step 3 — Paste diagnostic outputs

### Section 6 — Key function signatures

```
(paste rows)
```

### Section 3 — player_progression columns

```
(paste rows)
```

### Section 8 — RLS policies

```
(paste rows for failed table)
```

### Section 7 — Level curve check

```
level_at_455_xp: ___
v2_level_at_455_xp: ___
```

---

## Step 4 — What to run next

| Situation | Run this |
|-----------|----------|
| Unsure what's installed | `database/diagnostics/inspect_current_supabase_state.sql` |
| Have 10G+, need Chapter One only | `database/release/phase13_apply_existing_project.sql` |
| Brand-new empty project | `database/release/full_bootstrap_new_project.sql` |
| Prerequisites fail | Apply missing phase from `docs/supabase/CURRENT_MIGRATION_APPLY_ORDER.md` |

---

## Step 5 — On failure, send back

1. This completed template
2. Full error text + SQLSTATE
3. All diagnostic result sets
4. Which file you ran
5. Whether project had prior partial migrations

---

## Known issues (pre-filled)

| Issue | Symptom | Fix file |
|-------|---------|----------|
| Daily/weekly mission wrong XP | Always 40/120 XP regardless of mission | `20260722_phase13b_mission_reward_fix.sql` |
| Policy already exists | SQLSTATE 42710 on schema.sql rerun | Skip rerun; use incremental migrations |
| Function does not exist | SQLSTATE 42883 on Phase 13 | Apply Phase 10G first |
| chapter_mission_state missing | Phase 13 not applied | `phase13_apply_existing_project.sql` |
