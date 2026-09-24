import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config';

type PluginLike = { name: string };

function extractPluginNames(plugins: unknown): string[] {
  if (!Array.isArray(plugins)) {
    return [];
  }

  return plugins.flatMap((plugin) => {
    if (Array.isArray(plugin)) {
      return extractPluginNames(plugin);
    }

    if (plugin && typeof plugin === 'object' && 'name' in plugin) {
      return [(plugin as PluginLike).name];
    }

    return [];
  });
}

describe('vite config transcript plugin registration', () => {
  it('does not register transcript persistence plugin during Vitest runs', () => {
    const originalVitest = process.env.VITEST;
    try {
      process.env.VITEST = 'true';

      const config = viteConfig({ command: 'serve', mode: 'test' });
      const pluginNames = extractPluginNames(config.plugins);

      expect(pluginNames).not.toContain('transcript-persist');
    } finally {
      process.env.VITEST = originalVitest;
    }
  });

  it('registers transcript persistence plugin for normal dev server runs', () => {
    const originalVitest = process.env.VITEST;
    try {
      delete process.env.VITEST;

      const config = viteConfig({ command: 'serve', mode: 'development' });
      const pluginNames = extractPluginNames(config.plugins);

      expect(pluginNames).toContain('transcript-persist');
    } finally {
      process.env.VITEST = originalVitest;
    }
  });

  it('registers the config-driven game discovery plugin', () => {
    const config = viteConfig({ command: 'build', mode: 'production' });
    const pluginNames = extractPluginNames(config.plugins);
    expect(pluginNames).toContain('tce-game-discovery');
  });
});

describe('vite config core path aliases', () => {
  const ALIAS_KEYS = ['@core-engine', '@card-system', '@rule-engine', '@ui', '@ai'];

  it('points core aliases at this checkout by default', () => {
    const original = process.env.CORE_ROOT;
    try {
      delete process.env.CORE_ROOT;
      const config = viteConfig({ command: 'build', mode: 'production' });
      const alias = config.resolve?.alias as Record<string, string>;
      for (const key of ALIAS_KEYS) {
        expect(alias[key]).toBeTruthy();
        expect(alias[key]).toContain('/src/');
      }
    } finally {
      if (original === undefined) delete process.env.CORE_ROOT;
      else process.env.CORE_ROOT = original;
    }
  });

  it('honours CORE_ROOT so a game repo resolves the core submodule (AC5)', () => {
    const original = process.env.CORE_ROOT;
    try {
      process.env.CORE_ROOT = '/repo/tce-golf/core';
      const config = viteConfig({ command: 'build', mode: 'production' });
      const alias = config.resolve?.alias as Record<string, string>;
      expect(alias['@core-engine']).toBe('/repo/tce-golf/core/src/core-engine');
      expect(alias['@ui']).toBe('/repo/tce-golf/core/src/ui');
    } finally {
      if (original === undefined) delete process.env.CORE_ROOT;
      else process.env.CORE_ROOT = original;
    }
  });
});

// ── Preset-aware test profiles (core-only checkout) ───────────────────────

describe('smoke/dev test lists follow the selected preset', () => {
  interface ProjectLike {
    test?: { name?: string; include?: string[] };
  }

  function includeFor(config: unknown, name: string): string[] {
    const projects = (config as { test?: { projects?: ProjectLike[] } }).test?.projects ?? [];
    const project = projects.find((p) => p.test?.name === name);
    return project?.test?.include ?? [];
  }

  it('keeps game test paths when the games are selected', () => {
    const original = process.env.GAMES_CONFIG;
    try {
      process.env.GAMES_CONFIG = 'all';
      const smoke = includeFor(viteConfig({ command: 'build', mode: 'production' }), 'smoke');
      expect(smoke).toContain('tests/golf/GolfScene.browser.test.ts');
      expect(smoke).toContain('tests/gym/GymSceneSmoke.browser.test.ts');
    } finally {
      if (original === undefined) delete process.env.GAMES_CONFIG;
      else process.env.GAMES_CONFIG = original;
    }
  });

  it('drops game test paths in a core-only checkout, keeping core + Gym', () => {
    const original = process.env.GAMES_CONFIG;
    try {
      process.env.GAMES_CONFIG = 'core-only';
      const smoke = includeFor(viteConfig({ command: 'build', mode: 'production' }), 'smoke');
      // Game suites would not resolve in a core-only checkout — referencing
      // them makes Vitest fail with "no test files found".
      expect(smoke).not.toContain('tests/golf/GolfScene.browser.test.ts');
      expect(smoke).not.toContain('tests/main-street/MainStreetScene.browser.test.ts');
      // Core-owned suites stay.
      expect(smoke).toContain('tests/core-engine/SvgHelpers.browser.test.ts');
      expect(smoke).toContain('tests/ui/HelpPanel.browser.test.ts');
      expect(smoke).toContain('tests/gym/GymSceneSmoke.browser.test.ts');
    } finally {
      if (original === undefined) delete process.env.GAMES_CONFIG;
      else process.env.GAMES_CONFIG = original;
    }
  });

  it('keeps only the sample preset games for a partial checkout', () => {
    const original = process.env.GAMES_CONFIG;
    try {
      process.env.GAMES_CONFIG = 'sample';
      const dev = includeFor(viteConfig({ command: 'build', mode: 'production' }), 'dev');
      expect(dev).toContain('tests/golf/GolfScene.browser.test.ts');
      expect(dev).toContain('tests/main-street/MainStreetScene.browser.test.ts');
      expect(dev).not.toContain('tests/coloretto/ColorettoScene.browser.test.ts');
      expect(dev).not.toContain('tests/sushi-go/SushiGoIcons.browser.test.ts');
    } finally {
      if (original === undefined) delete process.env.GAMES_CONFIG;
      else process.env.GAMES_CONFIG = original;
    }
  });
});
