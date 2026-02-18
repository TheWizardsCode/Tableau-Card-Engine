import Phaser from 'phaser';

/**
 * HelloWorldScene - A minimal Phaser scene that renders a card sprite
 * on a colored background, proving the Vite + Phaser + TypeScript +
 * asset pipeline works end-to-end.
 */
export class HelloWorldScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HelloWorldScene' });
  }

  preload(): void {
    // Load card assets from public/assets/cards/
    this.load.svg('ace_of_spades', 'assets/cards/ace_of_spades.svg', {
      width: 140,
      height: 190,
    });
    this.load.svg('card_back', 'assets/cards/card_back.svg', {
      width: 140,
      height: 190,
    });
  }

  create(): void {
    // Set background color
    this.cameras.main.setBackgroundColor('#2d572c');

    // Add title text
    this.add
      .text(
        this.scale.width / 2,
        40,
        'Card Game Engine - Hello World',
        {
          fontSize: '24px',
          color: '#ffffff',
          fontFamily: 'Arial, sans-serif',
        }
      )
      .setOrigin(0.5);

    // Add subtitle
    this.add
      .text(
        this.scale.width / 2,
        70,
        'Phaser 3.x + Vite + TypeScript',
        {
          fontSize: '14px',
          color: '#aaccaa',
          fontFamily: 'Arial, sans-serif',
        }
      )
      .setOrigin(0.5);

    // Render the card back (slightly offset to the left)
    const cardBack = this.add.image(
      this.scale.width / 2 - 90,
      this.scale.height / 2 + 20,
      'card_back'
    );
    cardBack.setScale(1);

    // Render the ace of spades (slightly offset to the right)
    const aceOfSpades = this.add.image(
      this.scale.width / 2 + 90,
      this.scale.height / 2 + 20,
      'ace_of_spades'
    );
    aceOfSpades.setScale(1);

    // Add a subtle floating animation to the cards
    this.tweens.add({
      targets: cardBack,
      y: cardBack.y - 8,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.tweens.add({
      targets: aceOfSpades,
      y: aceOfSpades.y - 8,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 500,
    });

    // Add instruction text
    this.add
      .text(
        this.scale.width / 2,
        this.scale.height - 30,
        'Toolchain verification complete',
        {
          fontSize: '12px',
          color: '#88aa88',
          fontFamily: 'Arial, sans-serif',
        }
      )
      .setOrigin(0.5);
  }
}
