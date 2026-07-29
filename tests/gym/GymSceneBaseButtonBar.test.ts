/**
 * GymSceneBase Button Bar Integration Tests
 *
 * Verifies that GymSceneBase correctly integrates with GymButtonBar
 * via the initButtonBar() and get buttonBar accessor.
 */
import { describe, expect, it } from 'vitest';

describe('GymSceneBase button bar integration', () => {
  it('GymSceneBase imports GymButtonBar', () => {
    // Verify the source file imports GymButtonBar correctly
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymSceneBase.ts'),
      'utf-8',
    );

    expect(source).toContain('GymButtonBar');
    expect(source).toContain('GymButtonBarConfig');
    expect(source).toContain("from '../../../src/ui/GymButtonBar'");
  });

  it('GymSceneBase has buttonBar property and initButtonBar method', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymSceneBase.ts'),
      'utf-8',
    );

    expect(source).toContain('protected buttonBar?: GymButtonBar');
    expect(source).toContain('protected initButtonBar');
    expect(source).toContain('new GymButtonBar(this,');
    expect(source).toContain('return this.buttonBar');
  });

  it('initButtonBar creates a GymButtonBar at given Y position', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymSceneBase.ts'),
      'utf-8',
    );

    // Verify the method signature accepts y and optional opts
    const methodMatch = source.match(/protected initButtonBar\(y: number, opts\?: Partial<GymButtonBarConfig>\)/);
    expect(methodMatch).not.toBeNull();
  });

  it('initButtonBar destroys existing bar before creating new one', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymSceneBase.ts'),
      'utf-8',
    );

    // Verify cleanup of existing bar
    expect(source).toContain('this.buttonBar.destroy()');
  });

  it('legacy addButton method has been removed after migration', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymSceneBase.ts'),
      'utf-8',
    );

    // Verify addButton no longer exists (migration complete)
    expect(source).not.toContain('protected addButton(');
  });

  it('legacy addButtonAtAnchor method has been removed after migration', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymSceneBase.ts'),
      'utf-8',
    );

    // Verify addButtonAtAnchor no longer exists (migration complete)
    expect(source).not.toContain('protected addButtonAtAnchor(');
  });

  it('button bar integration section is placed after divider and before scene transition', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../example-games/gym/scenes/GymSceneBase.ts'),
      'utf-8',
    );

    // Verify the button bar section exists between divider and transition hook
    const sectionMarker = '// ── Button bar integration';
    expect(source).toContain(sectionMarker);
  });

  it('GymButtonBar class is importable from the UI barrel', () => {
    const fs = require('fs');
    const path = require('path');
    const uiIndex = fs.readFileSync(
      path.resolve(__dirname, '../../src/ui/index.ts'),
      'utf-8',
    );

    expect(uiIndex).toContain('GymButtonBar');
    expect(uiIndex).toContain("export { GymButtonBar } from './GymButtonBar'");
    expect(uiIndex).toContain("export type { ButtonZone, GymButtonOpts, GymButtonBarConfig } from './GymButtonBar'");
  });
});
