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
});
