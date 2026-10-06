/**
 * Electron application-icon packaging contract
 * (CG-0MUTTXRWZ009NUB9 / CG-0MUU3Q4AM0090MHF).
 *
 * The packaged desktop app must show the tableau emblem instead of the default
 * Electron icon. That requires two pieces of wiring that are easy to lose:
 *   1. `electron-builder.yml` declares an icon for Windows, Linux, and macOS
 *      pointing at the generated `build/icon.png`, and the NSIS
 *      installer/uninstaller keys point at the generated `build/icon.ico`
 *      (NSIS rejects a PNG as an "invalid icon file"); and
 *   2. every `package*` npm script runs `npm run generate:icons` first, because
 *      `build/` is gitignored — the resource only exists after generation.
 *
 * These tests pin that observable contract (config wiring), not engine
 * behaviour, so a future edit that drops the icon or the generation step fails
 * loudly here rather than shipping a default-iconed installer.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BUILDER_YML = fs.readFileSync(path.join(REPO_ROOT, 'electron-builder.yml'), 'utf-8');
const PKG = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8'),
) as { scripts: Record<string, string> };

/**
 * Return the block of *key*'s indented body from the YAML text: the lines after
 * `key:` up to the next line at the same (or lower) indentation.
 */
function yamlBlock(yaml: string, key: string): string {
  const lines = yaml.split('\n');
  const headerRe = new RegExp(`^(\\s*)${key}:\\s*$`);
  for (let i = 0; i < lines.length; i += 1) {
    const m = headerRe.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() === '') {
        body.push(line);
        continue;
      }
      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent <= indent) break;
      body.push(line);
    }
    return body.join('\n');
  }
  return '';
}

/** Extract the scalar value of a `key:` line within a YAML block. */
function yamlScalar(block: string, key: string): string | undefined {
  const m = new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, 'm').exec(block);
  return m ? m[1].replace(/^['"]|['"]$/g, '') : undefined;
}

const GENERATED_ICON = 'build/icon.png';
const GENERATED_ICO = 'build/icon.ico';

describe('electron-builder icon configuration', () => {
  it.each([
    ['win', 'win'],
    ['linux', 'linux'],
    ['mac', 'mac'],
  ])('declares an application icon for %s', (_label, key) => {
    const block = yamlBlock(BUILDER_YML, key);
    expect(block, `${key}: section must exist`).not.toBe('');
    expect(yamlScalar(block, 'icon'), `${key}.icon must be declared`).toBe(GENERATED_ICON);
  });

  it('declares the NSIS installer and uninstaller icons as a real .ico (never a PNG)', () => {
    const nsis = yamlBlock(BUILDER_YML, 'nsis');
    expect(nsis, 'nsis: section must exist').not.toBe('');
    // NSIS rejects a PNG for these keys with `invalid icon file`, so a
    // regression that points them back at build/icon.png must fail here.
    expect(yamlScalar(nsis, 'installerIcon')).toBe(GENERATED_ICO);
    expect(yamlScalar(nsis, 'uninstallerIcon')).toBe(GENERATED_ICO);
  });

  it('points the icon base at the generated (gitignored) build resources dir', () => {
    // `directories.buildResources` must be `build` so the relative icon path
    // `build/icon.png` is also the path electron-builder resolves.
    const directories = yamlBlock(BUILDER_YML, 'directories');
    expect(yamlScalar(directories, 'buildResources')).toBe('build');
  });
});

describe('package scripts generate the icon resource first', () => {
  const PACKAGE_SCRIPTS = ['package', 'package:win', 'package:linux', 'package:mac', 'package:steam'];

  it('exposes a generate:icons script', () => {
    expect(PKG.scripts['generate:icons']).toBe('tsx scripts/generate-app-icons.ts');
  });

  it.each(PACKAGE_SCRIPTS)('%s runs the icon generation step', (script) => {
    const command = PKG.scripts[script];
    expect(command, `${script} must exist`).toBeTruthy();
    // Generation must run before electron-builder so build/icon.png exists.
    expect(command, `${script} must invoke generate:icons`).toContain('generate:icons');
    const iconStep = command.indexOf('generate:icons');
    const builderStep = command.indexOf('electron-builder');
    expect(builderStep, `${script} must invoke electron-builder`).toBeGreaterThan(-1);
    expect(iconStep, `${script} must generate icons before electron-builder`).toBeLessThan(builderStep);
  });
});
