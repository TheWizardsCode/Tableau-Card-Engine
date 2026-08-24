# Main Street — Staff Specialization Skills: Balance Documentation

> Epic CG-0MT1CIWSD003VBPK · Tasks T1–T3 (tests), Implementation I1–I5, this doc (D1, CG-0MT4WXZPX0040SA4).
> Companion to the skill implementation in `example-games/main-street/MainStreetStaffSkills.ts`
> (catalog + assignment), `MainStreetStaffBuffs.ts` (pure buff math), and the wiring in
> `MainStreetAdjacency.ts` / `MainStreetEngine.ts` / `MainStreetMarket.ts`.

## Overview

Every staff applicant card carries **1–3 specialization skills**, randomized **once per game at
start** and **locked for the full game** (established by CG-0MSTOATDU006UGAX). Skills are drawn
from a global 16-skill pool, **disconnected from the staff member's nominal job** (a *Chef* can
hold the *Security* skill). The Town Gossip peek ability (CG-0MSXOW6GN008ZSMN) is included as a
fixed **baseline skill on every applicant**.

## Skill catalog & impact ranges (per category)

| Category | Skills | Impact range | Balance notes |
|---|---|---|---|
| **Income Boost** | Networker, Chef de Cuisine, DJ, Sales Champion, Tech Guru | **+0.2–0.5 coins/turn, or +20% of a business's income** (Food / Entertainment per-type) | Percent bonuses apply to the business's cached income at income phase; flat bonuses add coins. Adjacency-scoped (Networker +0.2/adjacent synergy, Tech Guru +1 synergy range for Entertainment) are kept out of the per-business income fold. |
| **Reputation Boost** | Town Gossip (baseline), Community Builder, Brand Ambassador, PR Strategist | **+0.1–0.15 rep/turn, or +50% rep gains** from incidents/investments | Community Builder is street-wide (all businesses); PR Strategist is Service-only; Brand Ambassador multi-*plies event-source rep gains* (incidents + investments), not per-turn rep. |
| **Cost Reduction** | Cost Cutter, Negotiator, Operations Manager | **−0.5–1 cost, −15% street-wide ongoing** | See the "street-wide flag" below for Cost Cutter. |
| **Incident Mitigation** | Quality Inspector, Risk Manager, Security Consultant, Compliance Officer | **−15% incident probability, −30% coin damage, −0.5 rep damage, theft immunity** | Probability and immunity are engine-modeled (see wiring notes). |

**Stacking constraint (AC3/AC4):** no single staff member may hold **more than 1 income-boost
skill AND more than 1 reputation-boost skill** simultaneously (beyond the fixed Town Gossip
baseline, which is exempt — it is an informational peek, not a stacking boost). This prevents
runaway compounding: a member can still stack e.g. one income buff + one cost reduction + one
incident mitigation. Cost-reduction and incident-mitigation skills stack freely.

## Street-wide effects — flagged for additional testing ⚠️

- **Cost Cutter (−15% street-wide ongoing costs)** is the only skill that scales with *every*
  earned card (staff salaries, community-space costs, and business hand/grid costs all deduct
  less). It is **flagged for extra balance testing**; the income/reputation per-business buffs are
  naturally bounded by the street's business count.
- **Risk Manager (−15% incident probability)** is modeled as a per-turn incident draw aversion
  (see wiring notes); its effect compounding with other mitigation skills should be exercise-tested
  via `staff-skill-buff-wiring.test.ts` (I4).

## Wiring notes (how buffs reach the engine)

- **Read-only buff folding** (I4, CG-0MT4WXV2J000M35M): `applyIncome` folds per-business income
  and reputation buffs over the **cached** `currentIncome` / `currentReputationPerTurn` values
  without mutating them — the adjacency caching contract (CG-0MSVYPEZ90085SHE) is preserved and
  hiring/editing staff never leaves stale caches.
- **Per-business formula:** `buffed = cachedIncome × (1 + percent) + flat`; per-turn
  reputation adds `flat` per placed business. Percent applies to the business's income including
  synergy; no interaction terms between skills (purely additive — T3 tests enforce no runaway
  compounding).
- **Cost reductions:** Cost Cutter applies to **all three** ongoing-cost families
  (staff/community-space/business) at end of turn; Operations Manager discounts **only its own
  member's** salary; Negotiator reduces `refreshMarketCost` in addition to legacy
  `refreshCostDiscount` staff abilities (Group F).
- **Incidents:** damage reductions and theft immunity apply to Incident-trigger events only;
  Brand Ambassador multiplies *positive* reputation deltas from both incidents and investments.
  Risk Manager averts a turn's incident draw with 15% probability (deterministic — consumes one
  main-RNG draw while employed; averted incidents stay in the deck).
- **Determinism (I3):** skill assignment uses a dedicated `createSeededRng(numericSeed ^ 0x5eed)`
  stream, leaving the main RNG stream (deck shuffles, market draws, challenges) untouched —
  same seed ⇒ same skills ⇒ same game.

## Serialization & compatibility

Skills persist as **stable id arrays** (`specializationSkillIds`) on staff cards; they survive
save → restore through `structuredClone`. `deserializeSkillIds` fails loudly on unknown ids
(SaveLoadStore versioning convention); engine buff gathering (`getEmployedSpecializationSkills`)
skips members with stale ids so a future save never breaks the income phase. Legacy saves
(members without the field) simply carry no skills.

## Related docs

- `card-catalog.md` — the 12 new staff applicant templates (I1) and full staff table.
- `balancing-methodology.md` — the general balance pass methodology.
- Town Gossip peek: CG-0MSXOW6GN008ZSMN; Group F staff abilities: CG-0MSQJ7VL9009JHF4;
  ongoing per-turn costs: CG-0MSVYPEZ90085SHE.