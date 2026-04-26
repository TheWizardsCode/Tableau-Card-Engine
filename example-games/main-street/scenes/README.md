# Main Street Scene Animation Helpers

This folder uses two reusable UI helpers from `src/ui`:

- `popTextOrIcon` for short HUD/event feedback pops
- `runSceneTransition` helper exists in `src/ui`, but scene fades are currently disabled in Main Street

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

