import { describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { ENGINE_VERSION } from '../src/core-engine';
import { GymRouterScene } from '../example-games/gym/scenes/GymRouterScene';

describe('Phaser v4 smoke coverage', () => {
  it('exports a core engine symbol', () => {
    expect(ENGINE_VERSION).toBeTruthy();
  });

  it('keeps GymRouterScene wired as a Phaser scene', () => {
    expect(Object.getPrototypeOf(GymRouterScene.prototype)).toBe(Phaser.Scene.prototype);
  });
});