# Main Street Scene Animation Helpers

This folder uses reusable UI helpers from `src/ui`:

- `popTextOrIcon` for short HUD/event feedback pops
- `moveGameObject` for card transfer animations from market to street/hand
- `attachSelection` + `createSingleSelectionManager` for persistent card selection highlights
- `runSceneTransition` helper exists in `src/ui`, but scene fades are currently disabled in Main Street
- `MainStreetAnimator.animateMarketDealIn` for the market deal-in animation
  (day-start refill and Discover/Research row swaps: incoming cards deal in
  with a staggered deal SFX; outgoing row cards fade/shrink out).
  Triggered by `MainStreetTurnController` after the final market render.
- `MainStreetAnimator.animateMarketDealIn` for the market deal-in animation
  (day-start refill and Discover/Research row swaps: incoming cards deal in
  with a staggered deal SFX; outgoing row cards fade/shrink out).
  Triggered by `MainStreetTurnController` after the final market render.

## End-of-turn income collection

`MainStreetAnimator.animateIncomeCollection({ income, repSources })` animates
end-of-turn income: one coin icon per producing slot arcs to the HUD coins
counter (staggered `sfx-coin-pop`), rep-earning cards fly a pip to the rep
counter, and a final `+total` pop lands when collection completes. See
`MainStreetTurnController.endTurn()` for the trigger and
`docs/main-street/ux-visual-audio.md` for the design notes.

- Reduced motion: flights skipped; the HUD refresh shows the single final
  pop + income sound.

## Incident reveal presentation

`MainStreetAnimator.animateIncidentReveal({ cardId, incidentName, coinChange,
repChange, from })` animates an end-of-turn incident resolution: a snapshot
card visual flies from the Upcoming queue to the board centre, a brief red
flash pulses, the warning sting plays (`sfx-income-negative`), the incident's
coin/rep losses pop on the HUD, and the ⚠ active-effects indicator pulses
once. The resource deltas come from `TurnResult.incidentCoinChange` /
`incidentRepChange` (surfaced by `processEndOfTurn`). Triggered by
`MainStreetTurnController.endTurn()`; see
`docs/main-street/ux-visual-audio.md` for the design notes.

- Reduced motion: sting + HUD loss pops retained; flight, flash, and
  indicator pulse skipped.

## Synergy link formation

`MainStreetAnimator.animateSynergyFormation({ fromIndex, toIndex,
sharedSynergy })` animates a newly-formed synergy link: the line fades in,
a spark expands at the midpoint, the paired cards pulse, a "Synergy!" pop
appears, and a chime plays (`sfx-income-positive`). The placement paths in
`MainStreetTurnController` diff `computeSynergyPairs()` before/after the
placement (`diffNewSynergyPairs`) so ONLY new pairs animate. See
`docs/main-street/ux-visual-audio.md` for the design notes.

- Reduced motion: chime + minimal "Synergy!" pop retained; line, spark, and
  pulse skipped.
- Replay/headless: returns immediately (documented exemption, AGENTS.md
  rule 8) — presentation-only, never mutates state or transcript.

## Resource delta pop

```ts
const text = this.add.text(x, y, '+2', {
  fontSize: '16px',
  fontStyle: 'bold',
  color: '#ffdd66',
  fontFamily: FONT_FAMILY,
}).setOrigin(0.5);

void popTextOrIcon({
  scene: this,
  target: text,
  duration: 1500,
  riseY: 22,
  scale: 1.2,
  reducedMotion: this.settingsPanel?.reducedMotion,
});
```


## Upgrade level-up burst

`MainStreetAnimator.animateLevelUp({ slotIndex, level })` fires when an
upgrade lands on a business: a gold sparkle burst on the card plus a
"Level N" pop text. Triggered by `MainStreetTurnController.onUpgradeCardClick()`
in the transfer's `afterTransfer` hook (only when the upgrade command
succeeded). The arrival chime is the transfer's existing end SFX
(`sfx-upgrade-end`) — not replayed, so no double sound. See
`docs/main-street/ux-visual-audio.md` for the design notes.

- Reduced motion: "Level N" pop retained; sparkle burst skipped.

## Sell demolition + refund coin fly

`MainStreetAnimator.animateSell({ slotIndex, refund, cardId, family })`
plays when a sale is confirmed: a brief demolition on the sold card (a
pre-sold card snapshot shrinks/fades over ~380ms, revealing the dimmed SOLD
state after), then a refund coin flies from the sold slot to the HUD coins
counter with `sfx-coin-pop` and a "+€refund" pop lands at the counter.
Triggered by `MainStreetOverlayContent.showSellConfirmation()`'s Sell button
(only when the sell command succeeded). See
`docs/main-street/ux-visual-audio.md` for the design notes.

- Reduced motion: single "+€refund" pop + coin SFX retained; demolition and
  coin flight skipped.

## Day transition banner

`MainStreetAnimator.animateDayBanner({ day })` plays at each day start: a
non-interactive "Day N" banner fades in at the board centre (~250ms), holds,
and fades out (~800ms total) with a day-chime SFX (reused `sfx-click`).
Triggered by `MainStreetTurnController.startDayPhase()` (including day 1);
skipped while the tutorial is active and on checkpoint resume. It never
intercepts pointer events, never shifts layout, and leaves the market fully
interactive. See `docs/main-street/ux-visual-audio.md` for the design notes.

- Reduced motion: skipped entirely (instruction text remains the cue).

## Held-event play burst

`MainStreetAnimator.animateEventPlayed({ x, y, eventName })` plays when a
held event card is played from the hand: an 8-spark event-coloured burst at
the card's position as it leaves the hand plus an event-name pop with
`sfx-event-cheer`. Triggered by `MainStreetTurnController.onPlayHeldEvent()`
(only when the play command succeeded; the card's hand position is captured
before the hand re-renders). See `docs/main-street/ux-visual-audio.md` for
the design notes.

- Reduced motion: pop + cheer SFX retained; spark burst skipped.
