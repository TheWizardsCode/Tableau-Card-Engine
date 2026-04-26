# Main Street: UX, Visual, Animation, and Audio Notes

## Scope

This document captures the current implementation-level guidance for Main Street UI feedback polish in Milestone 4.

## Event Feedback Animations

### Resource pop feedback (coins / reputation)

- Trigger: whenever HUD coin or reputation value changes.
- Helper: `popTextOrIcon()` from `src/ui/popTextOrIcon.ts`.
- Timing target: ~420ms (within the 300–600ms target range).
- Motion: upward rise + fade + scale pop.
- Non-blocking: animation runs asynchronously and does not block game logic flow.

Example:

```ts
void popTextOrIcon({
  scene: this,
  target: deltaText,
  duration: 420,
  riseY: 22,
  scale: 1.2,
  reducedMotion: this.settingsPanel?.reducedMotion,
});
```

## Scene Transitions

### Enter / Exit transitions

- Helper: `runSceneTransition()` from `src/ui/sceneTransition.ts`.
- Enter transition: fade-in on scene create.
- Exit transition: fade-out on Play Again before scene restart.
- Transitions are short and deterministic (default 220–300ms in Main Street).

Example:

```ts
void runSceneTransition({
  scene: this,
  mode: 'enter',
  type: 'fade',
  duration: 280,
  reducedMotion: this.settingsPanel?.reducedMotion,
});
```

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
