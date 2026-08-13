# Main Street Scene Animation Helpers

This folder uses reusable UI helpers from `src/ui`:

- `popTextOrIcon` for short HUD/event feedback pops
- `moveGameObject` for card transfer animations from market to street/hand
- `attachSelection` + `createSingleSelectionManager` for persistent card selection highlights
- `runSceneTransition` helper exists in `src/ui`, but scene fades are currently disabled in Main Street

## End-of-turn income collection

`MainStreetAnimator.animateIncomeCollection({ income, repSources })` animates
end-of-turn income: one coin icon per producing slot arcs to the HUD coins
counter (staggered `sfx-coin-pop`), rep-earning cards fly a pip to the rep
counter, and a final `+total` pop lands when collection completes. See
`MainStreetTurnController.endTurn()` for the trigger and
`docs/main-street/ux-visual-audio.md` for the design notes.

- Reduced motion: flights skipped; the HUD refresh shows the single final
  pop + income sound.
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

