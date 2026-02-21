/**
 * Hi-DPI Text Patch
 *
 * Patches `Phaser.GameObjects.Text` so that text objects created
 * *without* an explicit `resolution` in their style automatically
 * render at `window.devicePixelRatio` instead of 1.  This makes
 * text crisp on Retina / HiDPI displays with zero changes to
 * existing `scene.add.text()` call-sites.
 *
 * **Usage** -- import this module (side-effect only) *before*
 * creating any `Phaser.Game` instance:
 *
 * ```ts
 * import '@ui/hiDpiText';   // side-effect: patches Text prototype
 * ```
 *
 * The patch is applied once at import time and is idempotent.
 */
import Phaser from 'phaser';

/** Device pixel ratio used for text rendering (clamped to >= 1). */
export const TEXT_DPR =
  typeof window !== 'undefined' ? Math.max(window.devicePixelRatio ?? 1, 1) : 1;

// ── Idempotency guard ──────────────────────────────────────
const PATCHED = Symbol.for('__TCE_TEXT_HI_DPI__');
const TextProto = Phaser.GameObjects.Text.prototype as unknown as Record<
  string | symbol,
  unknown
>;

if (!TextProto[PATCHED]) {
  /*
   * Phaser's Text constructor sets `this.style.resolution = 1` when
   * the caller didn't provide an explicit resolution (i.e. when the
   * style's resolution was 0 at that point).  After that it copies
   * the value to `this.frame.source.resolution`.
   *
   * We wrap `updateText()` -- the method that actually rasterises
   * the string into the internal canvas -- to ensure the resolution
   * is upgraded to DPR every time the text redraws.  This is safer
   * than patching the constructor because `updateText` is the single
   * choke-point for all rendering paths (constructor, setText,
   * setStyle, setFont, etc.).
   */
  const origUpdateText = Phaser.GameObjects.Text.prototype.updateText;

  Phaser.GameObjects.Text.prototype.updateText = function (
    this: Phaser.GameObjects.Text,
  ) {
    // Upgrade resolution only when it's still at the Phaser default.
    if (this.style.resolution === 1) {
      this.style.resolution = TEXT_DPR;
      if (this.frame?.source) {
        this.frame.source.resolution = TEXT_DPR;
      }
    }

    return origUpdateText.call(this);
  };

  TextProto[PATCHED] = true;
}
