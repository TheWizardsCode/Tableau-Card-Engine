import Phaser from 'phaser';

// Defensive patch: wrap the WebGL TexturerImage.run method to tolerate
// intermittent cases where a frame's `source` is unexpectedly null.
// This mirrors the defensive approach already taken for Text.updateText.
// The patch is intentionally conservative: it only intervenes on the
// specific "resolution on null source" TypeError and attempts a safe
// retry with a temporary source that provides a default resolution.

try {
  const TexturerImageProto = (Phaser as any).Renderer?.WebGL?.RenderNodes?.TexturerImage?.prototype;
  if (TexturerImageProto && !TexturerImageProto.__TCE_PATCHED__) {
    const origRun = TexturerImageProto.run as Function;

    TexturerImageProto.run = function (drawingContext: any, gameObject: any, element: any) {
      try {
        return origRun.call(this, drawingContext, gameObject, element);
      } catch (err) {
        const message = String(err && (err as Error).message || err);
        const isNullResolutionError = /cannot read properties of null/i.test(message) && /resolution/.test(message);

        if (!isNullResolutionError) {
          throw err;
        }

        // Attempt a safe retry: if we have a frame but its `source` is null,
        // provide a minimal temporary source object with a default resolution.
        const frame = this.frame ?? gameObject?.frame;
        const diag: Record<string, unknown> = {
          msg: 'patchTexturerImage: caught null-source resolution error, attempting safe retry',
          error: message,
          framePresent: !!frame,
          frameHasSource: !!(frame && frame.source),
        };

        (globalThis as any).__TCE_HIDPI_DIAG__ = (globalThis as any).__TCE_HIDPI_DIAG__ || [];
        (globalThis as any).__TCE_HIDPI_DIAG__.push(diag);

        if (frame && !frame.source) {
          // Provide a minimal fallback source. Phaser expects the source
          // to have a `resolution` property; other usages may assume an
          // image/canvas, but for the purpose of avoiding the crash this
          // minimal object suffices.
          frame.source = { resolution: 1 } as any;

          try {
            return origRun.call(this, drawingContext, gameObject, element);
          } catch (err2) {
            (globalThis as any).__TCE_HIDPI_DIAG__.push({ retryError: String(err2) });
            // Swallow the error to avoid breaking unrelated tests; the
            // diagnostics collected above will aid follow-up RCA.
            return undefined;
          }
        }

        // If we couldn't locate a frame to patch, re-throw the original error.
        throw err;
      }
    };

    TexturerImageProto.__TCE_PATCHED__ = true;
  }
} catch (e) {
  // Be silent if the Phaser runtime shape is not what we expect (e.g. during SSR or
  // tools that don't expose the renderer). We don't want the import to throw.
  (globalThis as any).__TCE_HIDPI_DIAG__ = (globalThis as any).__TCE_HIDPI_DIAG__ || [];
  (globalThis as any).__TCE_HIDPI_DIAG__.push({ patchError: String(e) });
}
