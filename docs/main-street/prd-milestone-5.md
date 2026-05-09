# Main Street PRD Milestone 5: Tutorial, Onboarding, and Game Selector Integration

**Work Item:** CG-0MM4RFN5N0KTUR66  
**Parent Epic:** Main Street (CG-0MM4R9UJF1DGI0ZF)  
**Author:** opencode  
**Date:** 2026-05-09  
**Status:** DRAFT -- Awaiting Producer Review

---

## 1. Goal and Success Criteria

### Goal

Deliver a first-time-player experience for Main Street that:

1. Teaches the core loop through a guided tutorial.
2. Integrates Main Street cleanly into the shared Tableau Card Engine Game Selector flow.
3. Provides persistent, in-game help and rules reference.
4. Optionally tracks lightweight player statistics across runs.

### Success Criteria

| ID | Criterion | Measurement |
|---|---|---|
| SC-1 | New players can complete a guided first run without external docs | Playtest: first-time players complete tutorial with no blocker in <= 15 minutes |
| SC-2 | Tutorial is available at first launch and replayable on demand | Manual test + persistence test of tutorial completion flag |
| SC-3 | Main Street appears in Game Selector with complete metadata and launches correctly | Selector card is visible; clicking Play starts `MainStreetScene` |
| SC-4 | In-game Help/Rules content covers core loop, card types, synergies, and win/loss conditions | Help panel content review passes checklist |
| SC-5 | All user stories have testable acceptance criteria and implementation validation steps | PR checklist + test plan completion |

---

## 2. Scope Boundaries

### In Scope

- Tutorial step script for first run (guided overlays + interaction gates).
- Onboarding flow from Game Selector -> Main Street -> tutorial offer/start.
- Selector metadata and integration requirements for Main Street.
- In-game Help/Rules information architecture and baseline copy.
- Optional statistics persistence design (`localStorage`) and display.
- Test plan for tutorial logic, selector integration, persistence, and UX behavior.

### Out of Scope

- New card mechanics or economy rebalance (covered by earlier milestones).
- Visual art/audio overhaul beyond onboarding UX needs.
- Online profiles/cloud sync for statistics.
- Full localization system (copy authored in English only for now).

---

## 3. User Stories and Acceptance Criteria

### US-1: First-Time Tutorial Offer

As a first-time player, I want Main Street to offer a guided tutorial the first time I launch the game, so I can learn without reading external documentation.

**Acceptance Criteria**
- AC-1.1: On first launch of Main Street, a modal prompt appears before turn interactions begin.
- AC-1.2: Prompt options include: `Start Tutorial`, `Skip for Now`.
- AC-1.3: Selecting `Start Tutorial` begins the scripted tutorial flow.
- AC-1.4: Selecting `Skip for Now` starts normal gameplay and marks tutorial as skipped (not completed).
- AC-1.5: The prompt is not auto-shown again once tutorial is completed.

### US-2: Guided Tutorial Flow

As a new player, I want a step-by-step tutorial with required actions, so I can understand the gameplay loop and controls.

**Acceptance Criteria**
- AC-2.1: Tutorial contains a fixed ordered sequence of steps (defined in Section 4).
- AC-2.2: Each step blocks progression until required player action is completed.
- AC-2.3: Tutorial overlays clearly identify relevant UI elements (market rows, grid slots, hand, end turn).
- AC-2.4: Tutorial can be exited at any time via `Exit Tutorial` and resumes normal play.
- AC-2.5: Tutorial completion sets persistent completion flag.

### US-3: Replay Tutorial and Access Help

As a returning player, I want to replay the tutorial and open help/rules on demand, so I can refresh mechanics when needed.

**Acceptance Criteria**
- AC-3.1: Main menu/settings include `Replay Tutorial`.
- AC-3.2: Replay starts the same scripted tutorial in a new run context.
- AC-3.3: Help panel is accessible from MainStreetScene at all times during gameplay.
- AC-3.4: Help content includes rules summary, card types, synergy explanation, and win/loss conditions.

### US-4: Game Selector Integration

As a player, I want Main Street to be discoverable from the shared game landing page, so I can start it like any other example game.

**Acceptance Criteria**
- AC-4.1: GameSelector lists Main Street with title, one-paragraph description, and thumbnail key.
- AC-4.2: Selector card launches `MainStreetScene` successfully.
- AC-4.3: Returning to selector from Main Street keeps catalog intact (registry-based source of truth).
- AC-4.4: Metadata copy is consistent with game identity and difficulty expectations.

### US-5: Optional Statistics Tracking

As a player, I want lightweight local stats (games played, wins, best score), so I can see my improvement over time.

**Acceptance Criteria**
- AC-5.1: Stats are recorded at end of each run and persisted in `localStorage`.
- AC-5.2: Stats include at minimum: `gamesPlayed`, `wins`, `bestScore`, `lastPlayedAt`.
- AC-5.3: Stats view is available in Main Street menu/help/settings area.
- AC-5.4: Stats can be reset with confirmation.

---

## 4. Tutorial Script (Step-by-Step)

This script is the canonical onboarding sequence. Steps are intentionally short and action-gated.

### Tutorial Setup Assumptions

- Tutorial starts at turn 1 in a deterministic seed/template state.
- Required cards/slots for teaching are guaranteed available.
- Non-essential UI actions are disabled while a step is active.

### Step List

| Step | Title | Teaching Objective | UI Focus | Required Player Action | Gate Condition |
|---|---|---|---|---|---|
| T1 | Welcome to Main Street | Explain goal: build score via businesses, reputation, and challenges | Center modal | Click `Continue` | Player confirms intro |
| T2 | Resource HUD | Teach Coins, Reputation, Score at top HUD | HUD strip | Click highlighted HUD area | HUD acknowledged |
| T3 | Market Rows | Explain Business vs Investments rows | Market panel | Click highlighted business card | Business card selected |
| T4 | Place a Business | Teach grid placement and adjacency potential | Street grid | Place selected business in highlighted valid slot | Purchase succeeds + slot populated |
| T5 | End Turn | Teach turn lifecycle and end-turn progression | End Turn button | Click `End Turn` | Turn advances to next day |
| T6 | Incident Queue | Teach upcoming incidents and planning ahead | Incident queue | Click highlighted incident card/queue | Queue acknowledged |
| T7 | Held Event Card | Teach event purchase + hand slot usage | Investments row + hand slot | Buy an event and keep/play as prompted | Held event exists or played |
| T8 | Upgrade Concept | Teach upgrade path and value | Investments row + target business | Purchase/apply highlighted upgrade | Upgrade applied |
| T9 | Help + Hint Tools | Teach where to get help and strategic hint | Help + Hint buttons | Open Help panel and close it | Help opened once |
| T10 | Tutorial Complete | Reinforce win/loss conditions and next steps | Completion modal | Click `Start Full Game` | Completion flag persisted |

### Step Overlay Copy (Baseline)

- T1: "Welcome! Build the best Main Street in 20 turns. I’ll guide your first few actions."
- T2: "Track Coins, Reputation, and Score here. Running out of reputation or coins can end your run."
- T3: "Businesses go on your street. Investments are upgrades and events that shape your strategy."
- T4: "Place this business in a highlighted slot. Adjacent matching types create synergy bonuses."
- T5: "End Turn resolves income and incidents, then starts a new market day."
- T6: "Incidents are upcoming events. Watch this queue to plan ahead."
- T7: "You can hold one event card and play it when timing is best."
- T8: "Upgrades improve an existing business. Strong upgrades compound over remaining turns."
- T9: "Need a refresher? Open Help anytime. Hint suggests one strong move per turn."
- T10: "Great job! You’re ready for a full run. Tutorial can be replayed from menu/settings."

### Gating Rules

- Only relevant controls are interactive per step.
- Invalid actions show brief message: "Complete the highlighted step first."
- If state diverges (e.g., edge-case fail to satisfy gate), tutorial can soft-reset to current step checkpoint.

---

## 5. Onboarding Flow (Game Selector -> First Game)

### Entry Journey

1. Player opens app and sees `GameSelectorScene`.
2. Player chooses Main Street card.
3. `MainStreetScene` starts.
4. Game checks tutorial state:
   - `not_seen` / `skipped`: show tutorial offer modal.
   - `completed`: start normal run.
5. Player either completes tutorial or starts regular play.

### Selector Card Content (Main Street)

- **Title:** Main Street
- **Description:** Single-player tableau builder. Purchase businesses, place them along a 10-slot street for synergy bonuses, manage coins and reputation, and build the highest-scoring Main Street in 20 turns.
- **Thumbnail key:** `games/main-street/thumbnail`
- **Scene key:** `MainStreetScene`
- **Category (doc-level taxonomy):** Strategy / Tableau Builder

### Transition Requirements

- Use existing scene transition conventions from shared UI.
- Ensure no loss of registry game catalog when returning to selector.
- Preserve existing replay mode behavior (`mode=replay`) without tutorial interruptions.

---

## 6. Help/Rules Screen Content Definition

Help content should be concise, scannable, and aligned with existing panel sections.

### Required Sections

1. **How to Play**
   - Buy businesses and place them on the 2x5 street.
   - Earn income and score through card value + synergy + reputation.
2. **Card Types**
   - Business (persistent board value)
   - Upgrade (enhances an existing business)
   - Event / Investment (timed one-off effects)
   - Incident (automatic pressure events)
3. **Synergy and Placement**
   - Adjacent matching categories yield bonuses.
   - Upgrades can increase range/value.
4. **Turn Flow**
   - Day start -> market actions -> end turn resolution.
5. **Win / Loss Conditions**
   - Win threshold / challenge completion paths.
   - Bankruptcy / reputation collapse / turn exhaustion loss states.
6. **Tools**
   - Hint usage behavior.
   - Undo/Redo behavior.
   - Tutorial replay and settings toggles.

### Content UX Rules

- Keep each section to <= 8 lines where possible.
- Prefer short sentences and explicit verbs.
- Use color-coding terminology consistent with in-game UI.

---

## 7. Technical Design

### 7.1 Game Selector Registration

Main Street integration follows existing selector architecture:

- Register Main Street entry in `GAMES` catalogue used by unified `main.ts` boot file.
- Ensure `GameSelectorScene` receives game list via `REGISTRY_KEY_GAMES`.
- Thumbnail loading path remains `assets/${thumbnail}.png` convention.

**Current expected metadata object**

```ts
{
  sceneKey: 'MainStreetScene',
  title: 'Main Street',
  description: 'Single-player tableau builder. Purchase businesses, place them along a 10-slot street for synergy bonuses, manage coins and reputation, and build the highest-scoring Main Street in 20 turns.',
  thumbnail: 'games/main-street/thumbnail'
}
```

### 7.2 Tutorial State Persistence

Use local storage through shared save/load conventions.

**Suggested keys**

- `tce-main-street-tutorial-state`
- `tce-main-street-stats`

**Tutorial state schema (v1)**

```ts
interface MainStreetTutorialStateV1 {
  schemaVersion: 1;
  status: 'not_seen' | 'skipped' | 'completed';
  completedAt: string | null;
  lastStepId: string | null;
}
```

### 7.3 Optional Statistics Schema

```ts
interface MainStreetStatsV1 {
  schemaVersion: 1;
  gamesPlayed: number;
  wins: number;
  bestScore: number;
  lastPlayedAt: string | null;
}
```

### 7.4 Scene/Flow Hooks

- Tutorial gate should run during scene initialization before free-form market actions.
- Replay mode and automated tests should be able to disable tutorial gate via explicit config/query flag.
- Help panel remains always accessible outside forced tutorial step locks.

### 7.5 Accessibility and UX Constraints

- Respect reduced-motion setting during tutorial overlays/transitions.
- Keep tutorial text readable on 1280x720 and narrow-width layouts.
- Ensure keyboard/controller navigation remains possible for modal prompts where applicable.

---

## 8. Test Plan

### Unit Tests

- Tutorial state serialization/deserialization.
- Tutorial progression reducer: next-step gating and completion.
- Stats update reducer at run-end.
- Tutorial eligibility logic (`first launch`, `skipped`, `completed`, replay).

### Integration/Scene Tests

- Main Street launches from Game Selector and returns correctly.
- First launch shows tutorial prompt.
- Completion prevents auto-prompt on next launch.
- Replay Tutorial menu option starts tutorial regardless of completion state.
- Help panel opens during normal run and after tutorial.

### Manual QA Scenarios

1. Fresh browser profile: verify tutorial offer appears.
2. Complete tutorial, restart app: verify no auto-offer.
3. Trigger replay tutorial manually.
4. Use skip path, verify gameplay remains available and replay option visible.
5. Validate selector thumbnail and description rendering.
6. Validate stats increment across win/loss runs and reset behavior.

### Regression Gates

- `npm test`
- `npm run build`
- Existing Main Street browser tests remain green.

---

## 9. Estimated Effort

| Workstream | Estimate |
|---|---|
| Tutorial scripting + overlay UX | 2-3 days |
| Tutorial gating/state persistence | 1-2 days |
| Selector/onboarding integration polish | 0.5-1 day |
| Help/rules content finalization | 0.5 day |
| Optional stats tracking + screen | 1 day |
| Testing and bug-fix pass | 1-2 days |
| **Total** | **6-9 engineering days** |

---

## 10. Dependencies and Risks

### Dependencies

- Main Street baseline gameplay loop and UI scaffold (existing milestones).
- Main Street AI/Hint and Undo/Redo behavior from prior milestone docs and implementations.
- Game Selector architecture in `src/ui/GameSelectorScene.ts` and root `main.ts`.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tutorial becomes too long/friction-heavy | Medium | Medium | Keep to 10 focused steps; allow exit/replay |
| Tutorial gates conflict with replay/test harnesses | Medium | High | Add explicit disable flag for replay/test mode |
| Help content drifts from actual mechanics after balance changes | Medium | Medium | Add content review checklist in milestone exit criteria |
| Stats schema changes break older local data | Low | Medium | Include schemaVersion and migration defaulting |

---

## 11. Milestone Exit Checklist

- [ ] Tutorial script implemented according to Section 4.
- [ ] First-time onboarding prompt and replay flow implemented.
- [ ] Main Street selector metadata confirmed and validated.
- [ ] Help/rules sections complete and reviewed.
- [ ] Optional stats feature either implemented or explicitly deferred with child work item.
- [ ] All automated tests and build pass.
- [ ] Producer review completed and approved.
