# Main Street Scene Animation Helpers

This folder uses two reusable UI helpers from `src/ui`:

- `popTextOrIcon` for short HUD/event feedback pops
- `runSceneTransition` for simple enter/exit transitions

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
  duration: 420,
  riseY: 22,
  scale: 1.2,
  reducedMotion: this.settingsPanel?.reducedMotion,
});
```

## Scene transition

```ts
void runSceneTransition({
  scene: this,
  mode: 'enter',
  type: 'fade',
  duration: 280,
  reducedMotion: this.settingsPanel?.reducedMotion,
});
```
