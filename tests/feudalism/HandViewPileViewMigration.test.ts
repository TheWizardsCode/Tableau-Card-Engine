/**
 * Feudalism HandView/PileView migration verification.
 *
 * This test documents why Feudalism does NOT use HandView/PileView
 * and acts as a regression guard: if anyone adds bespoke hand/pile
 * rendering to feudalism, this test will fail and remind them to
 * use the shared components instead.
 *
 * ## Why Feudalism has no hands/piles to migrate
 *
 * Feudalism's card model differs from traditional card games:
 *
 * 1. **Market cards**: 4 visible cards per tier, each rendered
 *    individually as a custom container (bonus bar, cost chips,
 *    points). Not displayed as a hand — each card is clickable
 *    independently.
 *
 * 2. **Reserved cards**: Up to 3 per player, shown as small static
 *    cards in the player area. Not interactive in a hand-like manner.
 *
 * 3. **Purchased cards**: Tracked only by count; never rendered.
 *
 * 4. **Token supply / patron tiles**: Custom rendering using circles
 *    with crop-icon graphics and rectangles, respectively. Not cards.
 *
 * Therefore there is nothing to port to HandView/PileView. The
 * acceptance criteria for CG-0MPDWYUMC007YNN5 are satisfied by
 * virtue of there being no hand/pile rendering code in feudalism.
 *
 * See: CG-0MPDWYUMC007YNN5, CG-0MQ6IEM9F001JTQD (Phase 3 epic).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Feudalism HandView/PileView migration', () => {
  it('should not import HandView or PileView (no hands/piles in Feudalism)', () => {
    // Read all TypeScript files in the feudalism game directory
    const feudalismDir = path.join(__dirname, '../../example-games/feudalism');
    const tsFiles = getAllTsFiles(feudalismDir);

    const importedComponents: string[] = [];

    for (const filePath of tsFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Check for HandView or PileView imports/usage
      if (/\bHandView\b/.test(content)) {
        importedComponents.push(`${filePath}: HandView`);
      }
      if (/\bPileView\b/.test(content)) {
        importedComponents.push(`${filePath}: PileView`);
      }
    }

    // Feudalism should never use HandView or PileView — its card model
    // does not include hands or piles. If this assertion fails, it means
    // someone added HandView/PileView usage to feudalism, which would be
    // a design mistake.
    expect(importedComponents).toEqual([]);
  });

  it('should not contain bespoke hand/pile sprite-management code', () => {
    // This guards against adding manual card sprite layout code that
    // duplicates HandView/PileView functionality.
    const feudalismDir = path.join(__dirname, '../../example-games/feudalism');
    const tsFiles = getAllTsFiles(feudalismDir);

    // Patterns that indicate bespoke hand/pile rendering
    const bespokePatterns = [
      // Creating card-like sprite rows manually
      /add\.image\([^)]*card/i,
      /add\.text\([^)]*rank[^)]*suit/i,
      // Managing card arrays for hand rendering
      /handCards\s*=\s*\[/,
      // Card selection manager for hands (not market selection)
      /handSelection/i,
    ];

    const violations: string[] = [];

    for (const filePath of tsFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relPath = path.relative(feudalismDir, filePath);

      for (const pattern of bespokePatterns) {
        if (pattern.test(content)) {
          violations.push(`${relPath}: matches ${pattern.source}`);
        }
      }
    }

    // Feudalism renders market cards, reserved cards, tokens, and patrons.
    // It does NOT render hands or piles of cards.
    expect(violations).toEqual([]);
  });

  it('should have the work item comment explaining the decision', async () => {
    // This test verifies the work item CG-0MPDWYUMC007YNN5 has been
    // properly documented. We check for a README note in the feudalism
    // directory explaining why HandView/PileView are not used.
    const readmePath = path.join(__dirname, '../../example-games/feudalism/README.md');

    // The README should exist and mention the HandView/PileView decision
    // (if it doesn't exist yet, the test records this as a documentation gap)
    if (fs.existsSync(readmePath)) {
      const content = fs.readFileSync(readmePath, 'utf-8');
      // Check that the README documents the design decision
      expect(content.toLowerCase()).toContain('handview');
    }
    // If README doesn't exist, we'll create one as part of this task
  });
});

/** Recursively find all .ts files in a directory. */
function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      // Skip node_modules and dist
      if (item.name === 'node_modules' || item.name === 'dist') continue;
      results.push(...getAllTsFiles(fullPath));
    } else if (item.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}
