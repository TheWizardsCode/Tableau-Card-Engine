import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phaser dependency pin', () => {
  it('pins Phaser to 4.0.0-rc.7 in package.json', () => {
    const packageJsonPath = resolve(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.phaser).toBe('4.0.0-rc.7');
  });
});
