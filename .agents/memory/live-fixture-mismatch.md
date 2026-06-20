---
name: Live bet fixture mismatch fix
description: How auto-resolve handles cases where the wrong API-Football fixture ID was stored in a live bet.
---

# Live Bet Fixture Mismatch Fix

## The rule
`POST /api/admin/bets/:id/auto-resolve` uses a `fidRemap` map to translate the stored fixture ID (which may be wrong) to the correct fixture ID before fetching any stats.

## Why
The admin panel lets the admin activate a live game by fixture ID. If the wrong ID was stored (e.g., leftover test fixture 1520716 instead of correct 1489393), the auto-resolve would fetch stats from the wrong game and resolve bets incorrectly. Confirmed incident: bilhete with Germany vs Ivory Coast resolved against an Operario-PR vs Juventude fixture (7 corners, not 11).

## How to apply
In the fixture-fetching loop (`for (const fid of fixtureIds)`):
1. Fetch fixture for `fid` from API-Football
2. Compare `fix.teams.home.name` / `fix.teams.away.name` with `sel.homeTeam` / `sel.awayTeam` using `teamsMatch()` (which handles PT↔EN translations via `NATIONAL_TEAM_PT`)
3. If mismatch: search `GET /fixtures?date=DATE&search=FIRST_WORD_OF_HOME_TEAM` on API-Football, find candidate whose teams match, set `resolvedFid` to that fixture's ID
4. Store in `fidRemap`: `fidRemap.set(originalFid, resolvedFid)`
5. Store stats in `fixtureResults` keyed by `resolvedFid`

In the selections loop, always do `const resolvedFid = fidRemap.get(fid) ?? fid` before any cache lookups (corners, cards, first goal, red cards).

All stats caches (`arCornerCache`, `arCardHomeCache`, `arFirstGoalCache`, `arRedCardCache`, `arRedCard1HCache`) use `resolvedFid` as the key, not the original `fid`.
