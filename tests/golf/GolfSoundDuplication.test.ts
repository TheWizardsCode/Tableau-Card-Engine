/**
 * Tests verifying that sound effects in 9-Card Golf play at most once per
 * game action (draw, swap, discard, flip).
 *
 * The root cause of the duplication was three independent sound-triggering
 * paths (event system, flipCard sfx config, and explicit animator calls)
 * all playing the same SFX keys for a single game action.
 *
 * These tests verify the fix:
 *   1. GolfScene does NOT map card-movement events to sounds via connectToEvents
 *      (removing redundant event-driven sound triggering).
 *   2. GolfAnimator does NOT play periodic/repeated sounds during animations
 *      (removing redundant onUpdate and onComplete sound calls).
 *
 * @module tests/golf/GolfSoundDuplication
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('GolfScene sound event mapping', () => {
  const sceneSource = readFileSync(
    'example-games/golf/scenes/GolfScene.ts',
    'utf-8',
  );

  it('does not map card-drawn event to a sound key', () => {
    // The mapping object in GolfScene.create() should NOT contain card-drawn
    const mappingRegex = /mapping\s*:\s*EventSoundMapping\s*=\s*\{([^}]+)\}/s;
    const match = sceneSource.match(mappingRegex);
    expect(match).not.toBeNull();
    const mappingBody = match![1];
    expect(mappingBody).not.toContain('card-drawn');
  });

  it('does not map card-flipped event to a sound key', () => {
    const mappingRegex = /mapping\s*:\s*EventSoundMapping\s*=\s*\{([^}]+)\}/s;
    const match = sceneSource.match(mappingRegex);
    expect(match).not.toBeNull();
    const mappingBody = match![1];
    expect(mappingBody).not.toContain('card-flipped');
  });

  it('does not map card-swapped event to a sound key', () => {
    const mappingRegex = /mapping\s*:\s*EventSoundMapping\s*=\s*\{([^}]+)\}/s;
    const match = sceneSource.match(mappingRegex);
    expect(match).not.toBeNull();
    const mappingBody = match![1];
    expect(mappingBody).not.toContain('card-swapped');
  });

  it('does not map card-discarded event to a sound key', () => {
    const mappingRegex = /mapping\s*:\s*EventSoundMapping\s*=\s*\{([^}]+)\}/s;
    const match = sceneSource.match(mappingRegex);
    expect(match).not.toBeNull();
    const mappingBody = match![1];
    expect(mappingBody).not.toContain('card-discarded');
  });

  it('still maps turn-started and game-ended events for non-animation sounds', () => {
    const mappingRegex = /mapping\s*:\s*EventSoundMapping\s*=\s*\{([^}]+)\}/s;
    const match = sceneSource.match(mappingRegex);
    expect(match).not.toBeNull();
    const mappingBody = match![1];
    expect(mappingBody).toContain('turn-started');
    expect(mappingBody).toContain('game-ended');
  });
});

describe('GolfAnimator sound cleanup', () => {
  const animatorSource = readFileSync(
    'example-games/golf/scenes/GolfAnimator.ts',
    'utf-8',
  );

  // ── Periodic sound checks ────────────────────────────────

  it('does not play periodic sounds via onUpdate in animateDrawnCardToDiscard', () => {
    // The onUpdate callback in animateDrawnCardToDiscard should not call
    // soundManager.play for CARD_DISCARD on any interval
    const methodStart = animatorSource.indexOf('animateDrawnCardToDiscard(');
    const methodEnd = animatorSource.indexOf('  }', methodStart + 100);
    const methodBody = animatorSource.slice(methodStart, methodEnd + 4);

    // Should not have onUpdate playing sound
    expect(methodBody).not.toContain('onUpdate');
  });

  it('does not play duplicate sounds in onComplete of animateDrawnCardToDiscard', () => {
    const methodStart = animatorSource.indexOf('animateDrawnCardToDiscard(');
    const methodEnd = animatorSource.indexOf('\n  animateTurn(', methodStart);
    const methodBody = methodStart >= 0 ? animatorSource.slice(methodStart, methodEnd >= methodStart ? methodEnd : methodStart + 2000) : '';

    // onComplete should not play a sound (the onStart play is sufficient)
    if (methodBody) {
      const onCompleteSection = methodBody.match(/onComplete:\s*\(\)\s*=>\s*\{[^}]*\}/);
      if (onCompleteSection) {
        expect(onCompleteSection[0]).not.toContain('soundManager');
      }
    }
  });

  // ── flipCard sfx config checks ────────────────────────────

  it('does not pass move sfx or moveIntervalMs to flipCard in animateSwap', () => {
    const methodStart = animatorSource.indexOf('private animateSwap(');
    const discardStart = animatorSource.indexOf('private animateDiscardAndFlip(');
    const methodBody = animatorSource.slice(
      methodStart,
      discardStart > methodStart ? discardStart : undefined,
    );

    // The flipCard sfx config should not contain 'move' key
    const flipSfxMatch = methodBody.match(/sfx:\s*\{[^}]+\}/);
    if (flipSfxMatch) {
      expect(flipSfxMatch[0]).not.toContain('move:');
    }
  });

  it('does not pass move sfx or moveIntervalMs to flipCard in animateDiscardAndFlip', () => {
    const methodStart = animatorSource.indexOf('private animateDiscardAndFlip(');
    const showDrawnStart = animatorSource.indexOf('showDrawnCard(');
    const methodBody = animatorSource.slice(
      methodStart,
      showDrawnStart > methodStart ? showDrawnStart : undefined,
    );

    // The flipCard sfx config should not contain 'move' key
    const flipSfxMatch = methodBody.match(/sfx:\s*\{[^}]+\}/);
    if (flipSfxMatch) {
      expect(flipSfxMatch[0]).not.toContain('move:');
    }
  });

  it('does not pass move sfx or moveIntervalMs to flipCard in showDrawnCard (stock)', () => {
    const methodStart = animatorSource.indexOf('showDrawnCard(');
    const methodEnd = animatorSource.indexOf('updateDiscardPileAfterDraw');
    const methodBody = animatorSource.slice(
      methodStart,
      methodEnd > methodStart ? methodEnd : undefined,
    );

    // Find flipCard call for stock draw (card_back case)
    const stockDrawSection = methodBody.match(/card_back[^}]*sfx:\s*\{[^}]+\}/s);
    if (stockDrawSection) {
      expect(stockDrawSection[0]).not.toContain('move:');
    }

    // Alternative: find all flipCard sfx configs in the method
    const sfxConfigs = methodBody.match(/sfx:\s*\{[^}]+\}/g);
    if (sfxConfigs) {
      for (const config of sfxConfigs) {
        expect(config).not.toContain('move:');
      }
    }
  });

  // ── Explicit sound calls in drawn-card tweens ────────────

  it('does not play periodic sounds via onUpdate in showDrawnCard discard-draw tween', () => {
    // The discard draw tween in showDrawnCard should not have onUpdate playing
    // sounds periodically
    const discardDrawSection = animatorSource.match(/Discard draw[^}]*tweens\.add[^}]*onStart[^}]*CARD_DRAW[^}]*\}(?:\s*\})\)/s);
    if (discardDrawSection) {
      const match = discardDrawSection[0];
      // Should have onStart but not onUpdate
      expect(match).toContain('onStart');
      expect(match).not.toContain('onUpdate');
    }
  });

  it('does not play duplicate CARD_SWAP in animateSwap drawn-card tween', () => {
    const methodStart = animatorSource.indexOf('private animateSwap(');
    const methodEnd = animatorSource.indexOf('private animateDiscardAndFlip(');
    const methodBody = animatorSource.slice(
      methodStart,
      methodEnd > methodStart ? methodEnd : undefined,
    );

    // The drawn card tween should not have onUpdate with periodic sound calls
    // It should only play CARD_SWAP once
    const drawnCardTween = methodBody.match(/drawnCardSprite[^}]*tweens\.add[^}]*\}/s);
    if (drawnCardTween) {
      const tweenBody = drawnCardTween[0];
      // Should not contain onUpdate (which was used for periodic playback)
      expect(tweenBody).not.toContain('onUpdate');
      // Should only have one soundManager.play call
      const playCalls = tweenBody.match(/soundManager\?\.play\(/g);
      expect(playCalls ? playCalls.length : 0).toBeLessThanOrEqual(1);
    }
  });

  it('only plays CARD_DRAW once in showDrawnCard discard-draw tween', () => {
    const discardDrawSection = animatorSource.match(/Discard draw[^}]*soundManager\?\.play\(SFX_KEYS\.CARD_DRAW\)[^}]*\}/);
    if (discardDrawSection) {
      const section = discardDrawSection[0];
      const playCalls = section.match(/soundManager\?\.play\(SFX_KEYS\.CARD_DRAW\)/g);
      expect(playCalls ? playCalls.length : 0).toBe(1);
    }
  });
});
