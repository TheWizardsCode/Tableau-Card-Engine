// ── Custom ESLint rule: no-direct-sound-play ──────────────
//
// Flags direct scene.sound.play() calls that are NOT inside a try/catch
// block. These calls bypass the namespaced SoundManager and can crash
// the Phaser game loop when audio keys are missing from the cache.
//
// Allowed patterns:
//   try { scene.sound.play?.(key); } catch { /* ignore */ }
//   safePlaySound(scene, key);  // preferred utility
//   typeof scene.sound.play === 'function'  // type check, not a play call
//   soundManager.play(key);  // correct namespace-aware usage

const noDirectSoundPlayRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct scene.sound.play() calls without try/catch ' +
        'protection to prevent game-loop crashes from missing audio keys.',
    },
    schema: [],
    messages: {
      unprotectedCall:
        'Direct scene.sound.play() call must be wrapped in try/catch or ' +
        'use safePlaySound() to prevent game-loop crashes. ' +
        'See docs/SFX_CONVENTION.md for details.',
    },
  },
  create(context) {
    /**
     * Check if a node is inside a try/catch block by traversing parent nodes.
     */
    function isInsideTryCatch(node) {
      let current = node;
      while (current) {
        if (current.type === 'TryStatement') {
          return true;
        }
        current = current.parent;
      }
      return false;
    }

    /**
     * Extract the member expression chain as an array of name strings.
     * e.g. this.scene.sound.play -> ['this', 'scene', 'sound', 'play']
     * Returns null if the chain cannot be extracted.
     */
    function extractMemberChain(node) {
      const parts = [];
      let current = node;
      while (current.type === 'MemberExpression') {
        if (current.computed) return null; // Skip computed properties like foo[bar]
        if (current.property.type !== 'Identifier') return null;
        parts.unshift(current.property.name);
        current = current.object;
      }
      if (current.type === 'Identifier') {
        parts.unshift(current.name);
      } else if (current.type === 'ThisExpression') {
        parts.unshift('this');
      } else {
        return null; // Unsupported expression type
      }
      return parts;
    }

    return {
      CallExpression(node) {
        const callee = node.callee;

        // Must be a member expression call (something.play())
        if (callee.type !== 'MemberExpression') return;

        // Extract the member chain
        const chain = extractMemberChain(callee);
        if (!chain) return;

        // Must end with '.play'
        const methodName = chain[chain.length - 1];
        if (methodName !== 'play') return;

        // Must have a 'sound' member in the chain (e.g. scene.sound.play)
        // but NOT at the root (i.e. a variable named 'sound' calling .play)
        const soundIndex = chain.lastIndexOf('sound');
        if (soundIndex < 0) return;       // No 'sound' in chain
        if (soundIndex === 0) return;      // Root 'sound' variable — not our concern

        // Must have at least something before 'sound' (e.g. scene.sound)
        if (soundIndex < 1) return;

        // Check if this call is inside a try/catch block
        if (isInsideTryCatch(node)) return;

        // Report the violation
        context.report({
          node,
          messageId: 'unprotectedCall',
        });
      },
    };
  },
};

module.exports = [
  // Ignore patterns (replaces .eslintignore)
  {
    ignores: ['node_modules/**', 'dist/**', 'tmp/**', '.tmp/**', 'public/assets/**', '**/*.d.ts'],
  },
  // Typescript files
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'example-games/**/*.ts', 'example-games/**/*.tsx', 'tests/**/*.ts', 'tests/**/*.tsx', 'scripts/**/*.ts', 'tools/**/*.ts'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
      local: {
        rules: {
          'no-direct-sound-play': noDirectSoundPlayRule,
        },
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'local/no-direct-sound-play': 'error',
    },
  },
  // Allow console uses in scripts/tools
  {
    files: ['scripts/**/*.ts', 'tools/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];
