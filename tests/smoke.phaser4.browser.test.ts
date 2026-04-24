import { describe, expect, it } from 'vitest';
import Phaser from 'phaser';
import { ENGINE_VERSION } from '../src/core-engine';
import { HelloWorldScene } from '../example-games/hello-world/scenes/HelloWorldScene';

describe('Phaser v4 smoke coverage', () => {
  it('exports a core engine symbol', () => {
    expect(ENGINE_VERSION).toBeTruthy();
  });

  it('keeps hello-world scene wired as a Phaser scene', () => {
    expect(Object.getPrototypeOf(HelloWorldScene.prototype)).toBe(Phaser.Scene.prototype);
  });
});
