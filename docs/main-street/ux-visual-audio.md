# Main Street: UX, Visual, Animation, and Audio Notes

## Scope

This document captures the current implementation-level guidance for Main Street UI feedback polish in Milestone 4.

## Event Feedback Animations

### Card transfer feedback (market -> destination)

- Trigger: when buying cards from the market.
- Behavior:
  - Businesses animate from the market row to the selected street slot.
  - Investment events animate from the market row to the player hand.
  - Upgrades animate from the market row to the upgraded street slot.
- Accessibility: transfer animation is skipped when Reduced Motion is enabled.

### Resource pop feedback (coins / reputation)

- Trigger: whenever HUD coin or reputation value changes.
- Helper: `popTextOrIcon()` from `src/ui/popTextOrIcon.ts`.
- Timing target: ~1500ms (~1.5 seconds).
- Motion: upward rise + fade + scale pop.
- Non-blocking: animation runs asynchronously and does not block game logic flow.

Example:

```ts
void popTextOrIcon({
  scene: this,
  target: deltaText,
  duration: 1500,
  riseY: 22,
  scale: 1.2,
  reducedMotion: this.settingsPanel?.reducedMotion,
});
```

### End-of-turn income collection (coin fly-to-HUD)

- Trigger: `MainStreetTurnController.endTurn()` after `processEndOfTurn()`
  resolves with `income.total > 0` (CG-0MSRGTUSK003GDGE).
- Helper: `MainStreetAnimator.animateIncomeCollection()` — launches one coin
  icon per producing street slot (from `IncomeResult.breakdown`) that arcs to
  the HUD coins counter, plus one reputation pip per rep-earning card to the
  reputation HUD value.
- SFX: staggered `SFX_KEYS.COIN_POP` (`sfx-coin-pop`) per flight, played via
  the scene `SoundManager` through `moveGameObject`'s `sfx.start`.
- Landing: when every flight completes, a final `+total` pop
  (`popTextOrIcon`) lands at the coin counter. While collection is running
  (`scene.incomeCollectionActive === true`) the immediate HUD delta pop is
  suppressed so the final pop is the single landing feedback — the income
  sound/event routing (`income-gained` → `sfx-income-positive`) still runs.
- Timing budget: flights run inside the existing 400ms → 800ms turn-advance
  window (600ms flight, 50ms stagger — ≤1050ms for a full 10-slot street),
  so turn timing is unchanged and the effect is non-blocking.
- Accessibility (reduced motion): flights are skipped entirely; the HUD
  refresh path still provides the single final pop + income sound.
- Headless/replay exemption (AGENTS.md rule 8): presentation-only — never
  mutates state or transcript; returns immediately in replay/headless mode
  (`scene.replayMode`), no rendering or audio.
- Reuse: `moveGameObject` + `SoundManager` + `popTextOrIcon`, `SFX_KEYS`
  (`COMMON_SFX_KEYS` convention); no new SFX keys or engine infrastructure.

### Market deal-in (day-start refill / Discover / Research swap)

- Helper: `MainStreetAnimator.animateMarketDealIn()`.
- Trigger points (`MainStreetTurnController`):
  - `startDayPhase()` — after the final (post-prewarm) market render, both
    the development and investments rows deal in. Skipped on checkpoint
    resume (`skipMarketRefill`), where the saved market is preserved.
  - `onRefreshDevelopmentClick()` / `onRefreshInvestmentsClick()` — after a
    successful Discover/Research, the outgoing row cards fade/shrink out from
    their old slot positions (snapshot visuals via `createTransferCardVisual`)
    while the incoming row deals in.
- Behavior:
  - Incoming cards enter a "dealt" state synchronously in the same frame as
    the draw (scale 0.6, alpha 0.35, raised 24px — no flicker), then tween
    to full size/opacity with a staggered 80ms launch per card.
  - Each incoming card plays the shared deal SFX (`SFX_KEYS.DEAL`) via the
    scene `SoundManager` at launch.
  - Outgoing snapshots launch first (60ms stagger) and fade/shrink out over
    300ms, then are destroyed.
- Source positions: `MainStreetRenderer.getMarketSlotCenter()` mirrors
  `drawMarketRow`'s layout math; the rendered cards themselves come from
  `MainStreetRenderer.getMarketRowCards()` (rebuilt every `refreshMarket`).
- Accessibility: animation is skipped when Reduced Motion is enabled (cards
  appear instantly).
- Headless/replay exemption: returns immediately in replay/headless mode
  (`replayMode`) — presentation-only, never mutates game state or the
  transcript, and never blocks the turn flow.
### Incident reveal (dramatic sting + damage feedback)

- Helper: `MainStreetAnimator.animateIncidentReveal()`.
- Trigger: `MainStreetTurnController.endTurn()` when `TurnResult.incident` is
  non-null (after the final render, inside the existing turn-advance window).
- Resource deltas: `processEndOfTurn` now surfaces the incident's own coin /
  reputation deltas on `TurnResult` (`incidentCoinChange` /
  `incidentRepChange`), captured around `resolveIncident()`.
- Behavior (reduced-motion OFF):
  1. A snapshot card visual (`createTransferCardVisual`, event family) flies
     from the front incident-queue card centre
     (`MainStreetRenderer.getFrontIncidentCardCenter()`) to the board centre.
  2. A brief, subtle red vignette flash pulses over the scene (depth 95,
     alpha 0.22 yoyo).
  3. The warning sting SFX plays — reused `SFX_KEYS.INCOME_NEGATIVE`
     (`sfx-income-negative`); no new SFX key (ToneForge pipeline untouched).
  4. The incident's coin/reputation losses pop explicitly on the HUD with
     negative-colour `popTextOrIcon` (visible even while the income-collection
     animation suppresses the generic HUD delta pop).
  5. The ⚠ active-effects warning indicator in the Upcoming panel pulses once.
- Accessibility (reduced motion): flight, flash, and indicator pulse are
  skipped; the warning sting SFX and the HUD loss pops are retained.
- Headless/replay exemption (AGENTS.md rule 8): presentation-only — returns
  immediately in replay/headless mode (`scene.replayMode`), never mutates
  state or transcript, never blocks the turn flow.
- Reuse: `createTransferCardVisual` + `SoundManager` + `popTextOrIcon`;
  no new engine infrastructure.

### Synergy link formation

- Helper: `MainStreetAnimator.animateSynergyFormation()`.
- Trigger: `MainStreetTurnController` placement paths (`onDragDropBusiness`,
  `onSlotClick` place-from-hand, and the legacy direct-buy path) — each
  captures `computeSynergyPairs()` before the placement command and animates
  `diffNewSynergyPairs(before, after)` — ONLY newly-formed pairs animate;
  pre-existing pairs never re-trigger on a plain refresh.
- Behavior (reduced-motion OFF):
  1. The new synergy line fades in (same geometry/colour as
     `MainStreetRenderer.drawSynergyLines()`, depth 10, alpha 0 → 0.7).
  2. A spark expands and fades at the pair midpoint.
  3. The two paired cards pulse (brief scale bounce) — street card
     containers are tagged with their slot index
     (`setData('streetSlotIndex', …)`) so the animator can find them.
  4. A "Synergy!" pop appears at the midpoint (`popTextOrIcon`).
  5. A chime SFX plays — reused `SFX_KEYS.INCOME_POSITIVE`
     (`sfx-income-positive`); no new SFX key (ToneForge pipeline untouched).
- Accessibility (reduced motion): the line draw-in, spark, and card pulse
  are skipped; the chime SFX and a minimal "Synergy!" pop are retained.
- Headless/replay exemption (AGENTS.md rule 8): presentation-only — returns
  immediately in replay/headless mode (`scene.replayMode`), never mutates
  state or transcript.
- Reuse: `synergyColor` + `SoundManager` + `popTextOrIcon`; no new engine
### Upgrade level-up burst

- Helper: `MainStreetAnimator.animateLevelUp()`.
- Trigger: `MainStreetTurnController.onUpgradeCardClick()` — the `afterTransfer`
  hook fires `animateLevelUp({ slotIndex: targetSlot, level })` only when the
  `buyUpgradeCommand` actually succeeded (upgraded flag), after the final
  `refreshAll` (the newly-rendered level badge is visible underneath).
- Behavior (reduced-motion OFF):
  1. A small gold sparkle burst (six fixed-direction sparks, `0xffd700`)
     tweens outward and fades on the upgraded business card — deterministic
     directions, no RNG, so tests and replays are stable.
  2. A "Level N" pop text appears over the card (`popTextOrIcon`, gold).
  3. Arrival chime: the upgrade transfer's existing end SFX
     (`SFX_KEYS.UPGRADE_END`, played by `animateTransferFromMarket` on
     landing) IS the arrival chime — `animateLevelUp` deliberately does NOT
     replay it, so there is no double sound and no new SFX key (ToneForge
     pipeline untouched).
- Accessibility (reduced motion): the sparkle burst is skipped; the
  "Level N" pop text is retained (spec AC2 — "skip the burst, keep the pop
  text").
- Headless/replay exemption (AGENTS.md rule 8): presentation-only — returns
  immediately in replay/headless mode (`scene.replayMode`), never mutates
  state or transcript.
- Reuse: `popTextOrIcon` + `getStreetSlotCenter`; no new engine
  infrastructure.

## Scene Transitions

- Main Street scene-level fade transitions are currently disabled.
- The reusable helper `runSceneTransition()` remains available in `src/ui/sceneTransition.ts` for future use once the fade issue is addressed.

## Accessibility

### Reduced motion

A `Reduced Motion` toggle is available in the Settings panel.

- Storage key: `tce-ui-reduced-motion`
- Behavior:
  - resource pop animations are skipped
  - scene transitions are skipped
- Helpers also respect OS `prefers-reduced-motion` when no explicit override is provided.

## Asset pipeline notes

- Current implementation uses existing SVG card placeholders.
- Animation helpers are asset-agnostic and will accept final art replacements without API changes.
