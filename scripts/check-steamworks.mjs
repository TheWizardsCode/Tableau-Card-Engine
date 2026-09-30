/**
 * Pre-flight check for a Steam build of the TCE launcher (F3,
 * CG-0MSMAJQQT004SDCC).
 *
 * `steamworks.js` is a normal package.json dependency (it ships prebuilt
 * binaries with no install-time build hook). This pre-flight still guards a
 * Steam distribution build, since the module may be absent from a pruned
 * install:
 *
 *   npm install
 *   npm run package:steam
 *
 * Exits 0 when the module resolves, non-zero with actionable guidance when it
 * does not, so `package:steam` fails early instead of shipping a launcher
 * without Steam support.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

try {
  const resolved = require.resolve('steamworks.js');
  console.log(`[steam] steamworks.js found: ${resolved}`);
} catch {
  console.error(
    '[steam] steamworks.js is not installed.\n' +
      '        A Steam build requires the module:\n\n' +
      '            npm install\n' +
      '            npm run package:steam\n\n' +
      '        For a non-Steam build use `npm run package`; the launcher builds\n' +
      '        and runs without Steam (the follow feature degrades gracefully).',
  );
  process.exit(1);
}
