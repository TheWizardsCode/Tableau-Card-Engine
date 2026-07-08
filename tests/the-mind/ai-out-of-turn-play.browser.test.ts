import { describe, it, expect, afterEach } from 'vitest';
import Phaser from 'phaser';
import { createTheMindGame } from '../../example-games/the-mind/createTheMindGame';
import { getCanonicalTextureKey, resolveTemplateId } from '../../example-games/the-mind/MindCardTextureAdapter';
import { CARD_W, CARD_H } from '../../example-games/the-mind/scenes/MindConstants';

describe('The Mind — AI out-of-turn play (browser integration)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    const el = document.getElementById('game-container');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    game = null;
  });

  it('plays an AI card without showing a missing-texture placeholder and registers the final DPR-aware texture', async () => {
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    // Create the game (TheMindScene will run its create() lifecycle)
    game = createTheMindGame({ type: Phaser.CANVAS, parent: 'game-container', width: 900, height: 700 });

    // Wait for the TheMindScene to be initialized and contain an AI hand.
    const scene = () => game?.scene.getScene('TheMindScene') as any | undefined;

    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const s = scene();
        if (s && s.session && s.mindAnimator && s.session.players && s.session.players[1] && s.session.players[1].hand && s.session.players[1].hand.length > 0) {
          resolve();
          return;
        }
        if (Date.now() - start > 10_000) {
          reject(new Error('TheMindScene did not initialize in time'));
          return;
        }
        setTimeout(check, 50);
      };
      check();
    });

    const s = scene() as any as Phaser.Scene & { session: any; mindAnimator: any };

    // Pick the first AI card value for the play
    const aiHand = s.session.players[1].hand;
    if (!aiHand || aiHand.length === 0) throw new Error('AI hand is empty');
    const aiValue = aiHand[0].value as number;

    // Compute the expected DPR-aware texture key used by the flip animation
    const templateId = resolveTemplateId(aiValue);
    const expectedKey = getCanonicalTextureKey(templateId, CARD_W, CARD_H);

    // Trigger the AI card play animation and wait for it to complete.
    await new Promise<void>((resolve, reject) => {
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        reject(new Error('AI play animation did not complete in time'));
      }, 10_000);

      try {
        s.mindAnimator.animateCardTowardsPile(1, aiValue, () => {
          if (timedOut) return;
          clearTimeout(timeout);
          resolve();
        });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });

    // Final assertions: DPR-aware key shape and texture registered in the scene.
    expect(/ms_card_mind-\d+_\d+x\d+@\d+/.test(expectedKey)).toBe(true);
    const textures = (game!.scene.getScene('TheMindScene') as any).textures as Phaser.Textures.TextureManager;
    expect(textures.exists(expectedKey)).toBe(true);
  }, 30_000);
});
