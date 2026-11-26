/**
 * GymTooltipScene -- Demonstrates the shared TooltipManager component.
 *
 * Features:
 *   - DOM-mode tooltip show/hide (HTML overlay)
 *   - Phaser-mode tooltip with game-object containers
 *   - Live tooltip positioning relative to interactive objects
 *   - Hover-intent delay (1500 ms dwell; 500 ms for a press-and-hold)
 *   - Toggle between modes at runtime
 *
 * Layout is managed declaratively via the Screen Layout Language (SLL).
 * Zone anchors define primary positions; secondary positions are derived
 * relative to those anchors.
 *
 * @module example-games/gym/scenes/GymTooltipScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_TOOLTIP_KEY } from '../GymRegistry';
import { GAME_W, GAME_H, FONT_FAMILY, TooltipManager, clampTooltipToBounds } from '../../../src/ui';
import { createHudText } from '../../../src/ui/Renderer';
import { anchorPoint } from '../../../src/ui/screen-layout';
import { parseScreenLayoutDocument } from '../../../src/ui/screen-layout-schema';
import { getTooltips, setTooltips } from '../../../src/ui/SettingsStore';
import gymTooltipLayoutJson from '../layouts/gym-tooltip.layout.json';
import {
  DEFAULT_VIEWPORT,
  TOOLTIP_MODE_LABEL_FONT_SIZE,
  TOOLTIP_STATUS_Y_OFFSET,
  TOOLTIP_SEPARATOR_Y_OFFSET,
  TOOLTIP_STATUS_FONT_SIZE,
  TOOLTIP_PROMPT_FONT_SIZE,
  TOOLTIP_LOG_HEADER_FONT_SIZE,
  TOOLTIP_CARD_NAME_FONT_SIZE,
  TOOLTIP_WORD_WRAP_WIDTH,
  TOOLTIP_BG_PADDING,
  TOOLTIP_BG_ALPHA,
  TOOLTIP_BORDER_WIDTH_NORMAL,
  TOOLTIP_BORDER_COLOR_DEFAULT,
  TOOLTIP_TEXT_ORIGIN,
  TOOLTIP_CONTAINER_DEPTH,
  TOOLTIP_CARD_BG_WIDTH,
  TOOLTIP_CARD_BG_HEIGHT,
  TOOLTIP_CARD_BG_ALPHA,
  TOOLTIP_CARD_BORDER_NORMAL,
  TOOLTIP_CARD_BORDER_COLOR,
  TOOLTIP_CARD_LABEL_FONT_SIZE,
  TOOLTIP_BORDER_WIDTH_HOVER,
  TOOLTIP_BORDER_COLOR_HOVER,
  TOOLTIP_HOVER_SCALE,
  TOOLTIP_CARD_X_OFFSET,
  TOOLTIP_LOG_MAX_LINES,
  TOOLTIP_LOG_FONT_SIZE,
  TOOLTIP_LOG_BASE_Y_OFFSET,
  TOOLTIP_LOG_LINE_HEIGHT,
  TOOLTIP_DEMO_HOVER_DELAY_MS,
  TOOLTIP_DEMO_TOUCH_DELAY_MS,
} from './GymConstants';

// Parse the shared Tooltip scene layout once at module load.
const TOOLTIP_LAYOUT: import('../../../src/ui/screen-layout-schema').ScreenLayoutDocument | null = (() => {
  const parsed = parseScreenLayoutDocument(gymTooltipLayoutJson);
  return parsed.valid ? parsed.layout : null;
})();

/**
 * Resolve a primary anchor position from the SLL layout.
 * Falls back to the default viewport if no layout is available.
 */
function resolveAnchor(
  zone: string,
  anchor: string,
  viewport?: { width: number; height: number },
): import('../../../src/ui/screen-layout-schema').PixelPoint {
  if (!TOOLTIP_LAYOUT) {
    return { x: 0, y: 0 };
  }
  const vp = viewport ?? DEFAULT_VIEWPORT;
  return anchorPoint(TOOLTIP_LAYOUT, zone, anchor, vp, 1);
}

export class GymTooltipScene extends GymSceneBase {
  private domTooltipManager!: TooltipManager;
  private phaserTooltipManager!: TooltipManager;

  // Demo objects
  private demoCards: Phaser.GameObjects.Container[] = [];
  private logTexts: Phaser.GameObjects.Text[] = [];
  private eventLog: string[] = [];

  // Mode toggle
  private useDomMode = true;

  // Tooltip enable/disable state (default: enabled, persisted to localStorage)
  private tooltipsEnabled = true;

  /** Reference to the toggle button for dynamic label updates. */
  private toggleBtnRef: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: GYM_TOOLTIP_KEY });
    // Load persisted tooltip preference (default: enabled)
    this.tooltipsEnabled = getTooltips();
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a1a2e');
    this.initHeader('Tooltip Demo');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'Features',
        body: 'Demonstrates the shared TooltipManager component in two rendering modes: DOM overlay (HTML div) and Phaser GameObject (in-scene containers). Tooltips provide contextual information when hovering over interactive elements, such as card ability descriptions, rule explanations, or score previews. In a real card game, tooltips let players quickly understand card effects without cluttering the main UI. Both modes keep the tooltip fully on-screen: the DOM overlay is clamped to the browser viewport (it uses fixed positioning, so it never extends the page or causes scrollbars), and the Phaser GameObject is clamped to the game canvas. Both managers also opt into a hover-intent delay (' + TOOLTIP_DEMO_HOVER_DELAY_MS + ' ms for a mouse dwell, ' + TOOLTIP_DEMO_TOUCH_DELAY_MS + ' ms for a press-and-hold), so a pointer merely sweeping across a card no longer flashes overlay text — the tooltip only appears once the pointer has dwelled on a target. The engine default is 0 ms (immediate), so games that do not opt in behave exactly as before.'
      },
      {
        heading: 'Controls',
        body: '[ DOM Mode ]: Switch tooltip rendering to DOM overlay mode (HTML div on top of canvas).\n[ Phaser Mode ]: Switch tooltip rendering to Phaser GameObject mode (in-scene containers with custom styling).\n[ Show Demo ]: Schedule a demo tooltip at the centre of the screen (it appears after the configured dwell).\n[ Disable/Enable ]: Toggle all tooltips on or off. When disabled, tooltips do not appear on hover or demo.\nHover over coloured cards (Red, Blue, Green) below the controls and hold the pointer still for ' + TOOLTIP_DEMO_HOVER_DELAY_MS + ' ms to see contextual tooltips describing each card\'s ability. Moving the pointer within a card keeps the pending show alive and refreshes its anchor — the delay does not restart.'
      },
      {
        heading: 'Usage Example',
        body: 'In a card game like Lost Cities, hovering over a card in your hand shows its value, colour, and any special abilities in a tooltip. DOM mode works well for simple text tooltips above the canvas, while Phaser mode allows fully styled in-game tooltips with borders, backgrounds, and animations that integrate with the game world.'
      },
      {
        heading: 'Test Plan',
        body: '1. Press [ DOM Mode ] → mode label updates to "Mode: DOM overlay"\n2. Sweep the pointer quickly across the red card and away → no tooltip appears (the ' + TOOLTIP_DEMO_HOVER_DELAY_MS + ' ms dwell was not reached)\n3. Rest the pointer on the red card → after about ' + TOOLTIP_DEMO_HOVER_DELAY_MS + ' ms a tooltip appears showing the "Red Card" description\n4. Move the pointer within the card → the pending/visible tooltip follows the pointer position\n5. Move pointer away from card → the pending show is cancelled and any visible tooltip disappears\n6. Move the pointer to the right or bottom edge of the canvas → the DOM tooltip stays fully visible and the page does not gain a scrollbar\n7. Press [ Phaser Mode ] → mode label updates\n8. Rest the pointer on the blue card → after the dwell a Phaser GameObject tooltip appears with border styling\n9. Move the pointer to the canvas edge → the Phaser tooltip stays inside the game canvas\n10. Press [ Show Demo ] → the demo tooltip appears at centre after the dwell\n11. Press [ Disable ] → tooltips stop appearing (including a show that is already pending); button shows "[ Enable ]"\n12. Press [ Enable ] → tooltips reappear on hover'
      }
    ]);

    const headerAnchor = resolveAnchor('header', 'center');
    const labelAnchor = resolveAnchor('label', 'center');
    const contentAnchor = resolveAnchor('content', 'center');
    const logAnchor = resolveAnchor('log', 'center');

    // Mode toggle buttons — centred horizontally on header anchor, offset ±180/20/200/380
    this.initButtonBar(headerAnchor.y);
    this.buttonBar!.addButton('[ DOM Mode ]', () => this.setMode(true), { zone: 'center' });
    this.buttonBar!.addButton('[ Phaser Mode ]', () => this.setMode(false), { zone: 'center' });
    this.buttonBar!.addButton('[ Show Demo ]', () => this.showDemoTooltip(), { zone: 'center' });
    this.toggleBtnRef = this.buttonBar!.addButton(
      this.tooltipsEnabled ? '[ Disable ]' : '[ Enable ]',
      () => this.toggleTooltips(),
      { zone: 'center' },
    );

    // Mode label — at label anchor y
    const modeLabel = createHudText(this, labelAnchor.x, labelAnchor.y, 'Mode: DOM overlay', '#88ccff', { fontSize: TOOLTIP_MODE_LABEL_FONT_SIZE });
    modeLabel.setOrigin(0.5);
    modeLabel.setName('modeLabel');

    // Tooltip status label — below mode label
    const tooltipLabel = createHudText(
      this, labelAnchor.x, labelAnchor.y + TOOLTIP_STATUS_Y_OFFSET,
      `Tooltips: ${this.tooltipsEnabled ? 'Enabled' : 'Disabled'}`,
      this.tooltipsEnabled ? '#88ff88' : '#ff8888',
      { fontSize: TOOLTIP_STATUS_FONT_SIZE },
    );
    tooltipLabel.setOrigin(0.5);
    tooltipLabel.setName('tooltipLabel');

    // Hover prompt — 50 px below label
    createHudText(this, labelAnchor.x, labelAnchor.y + TOOLTIP_SEPARATOR_Y_OFFSET, '── Hover over the cards below ──', '#6699aa', { fontSize: TOOLTIP_PROMPT_FONT_SIZE }).setOrigin(0.5);

    // Create interactive demo cards — at content anchor y
    this.createDemoCards(contentAnchor.y);

    // Event log header — at log anchor y
    createHudText(this, logAnchor.x, logAnchor.y, '── Event Log ──', '#6699aa', { fontSize: TOOLTIP_LOG_HEADER_FONT_SIZE }).setOrigin(0.5);

    // Create tooltip managers. Both opt into a hover-intent delay so the
    // demo can be checked by hand: a quick pointer sweep shows nothing, a
    // deliberate dwell shows the overlay (engine default is 0 = immediate).
    this.domTooltipManager = new TooltipManager(this, undefined, {
      delayMs: TOOLTIP_DEMO_HOVER_DELAY_MS,
      touchDelayMs: TOOLTIP_DEMO_TOUCH_DELAY_MS,
    });

    this.phaserTooltipManager = new TooltipManager(this, undefined, {
      delayMs: TOOLTIP_DEMO_HOVER_DELAY_MS,
      touchDelayMs: TOOLTIP_DEMO_TOUCH_DELAY_MS,
      phaserRender: (container, scene, _hideTooltip, ctx) => {
        const cardName = ctx.cardName as string | undefined;
        if (!cardName) return container;

        const text = scene.add.text(0, 0, cardName, {
          fontSize: TOOLTIP_CARD_NAME_FONT_SIZE,
          color: '#ffffff',
          fontFamily: FONT_FAMILY,
          wordWrap: { width: TOOLTIP_WORD_WRAP_WIDTH },
        }).setOrigin(0, 0);

        const bg = scene.add.rectangle(0, 0, text.width + TOOLTIP_BG_PADDING, text.height + TOOLTIP_BG_PADDING, 0x000000, TOOLTIP_BG_ALPHA).setOrigin(0, 0);
        bg.setStrokeStyle(TOOLTIP_BORDER_WIDTH_NORMAL, (ctx.borderColor as number) ?? TOOLTIP_BORDER_COLOR_DEFAULT);

        text.setPosition(TOOLTIP_TEXT_ORIGIN, TOOLTIP_TEXT_ORIGIN);
        container.add([bg, text]);

        // Keep the tooltip fully inside the game canvas (shared helper –
        // matches the Lost Cities / Sushi Go in-canvas clamp precedent).
        const boxW = text.width + TOOLTIP_BG_PADDING;
        const boxH = text.height + TOOLTIP_BG_PADDING;
        const position = clampTooltipToBounds(
          ctx.x ?? 0,
          ctx.y ?? 0,
          boxW,
          boxH,
          GAME_W,
          GAME_H,
        );
        container.setPosition(position.x, position.y);
        container.setDepth(TOOLTIP_CONTAINER_DEPTH);
        return container;
      },
    });
  }

  private createDemoCards(startY: number): void {
    const cardData = [
      { name: '🔴 Red Card — Attack: Deal 3 damage', color: 0xcc3333, x: GAME_W / 2 - TOOLTIP_CARD_X_OFFSET },
      { name: '🔵 Blue Card — Shield: Block 2 damage', color: 0x3366cc, x: GAME_W / 2 },
      { name: '🟢 Green Card — Heal: Restore 2 HP', color: 0x33aa33, x: GAME_W / 2 + TOOLTIP_CARD_X_OFFSET },
    ];

    for (const data of cardData) {
      const card = this.add.container(data.x, startY);
      const bg = this.add.rectangle(0, 0, TOOLTIP_CARD_BG_WIDTH, TOOLTIP_CARD_BG_HEIGHT, data.color, TOOLTIP_CARD_BG_ALPHA);
      bg.setStrokeStyle(TOOLTIP_CARD_BORDER_NORMAL, TOOLTIP_CARD_BORDER_COLOR);
      const label = createHudText(this, 0, 0, data.name.split(' — ')[0], '#ffffff', { fontSize: TOOLTIP_CARD_LABEL_FONT_SIZE }).setOrigin(0.5);

      card.add([bg, label]);
      // Set hit area on the background rectangle for interactivity
      bg.setInteractive({ useHandCursor: true });

      bg.on('pointerover', () => {
        bg.setStrokeStyle(TOOLTIP_BORDER_WIDTH_HOVER, TOOLTIP_BORDER_COLOR_HOVER);
        card.setScale(TOOLTIP_HOVER_SCALE);
        this.showCardTooltip(data.name, data.x, startY, data.color);
      });

      bg.on('pointerout', () => {
        bg.setStrokeStyle(TOOLTIP_CARD_BORDER_NORMAL, TOOLTIP_CARD_BORDER_COLOR);
        card.setScale(1.0);
        this.hideTooltip();
      });

      bg.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        this.showCardTooltip(data.name, pointer.x, pointer.y, data.color);
      });

      this.demoCards.push(card);
    }
  }

  private setMode(domMode: boolean): void {
    this.useDomMode = domMode;
    const label = this.children.getByName('modeLabel') as Phaser.GameObjects.Text | undefined;
    if (label) {
      label.setText(domMode ? 'Mode: DOM overlay' : 'Mode: Phaser GameObject');
    }
    this.logEvent(`Switched to ${domMode ? 'DOM' : 'Phaser'} mode`);
    this.hideTooltip();
  }

  /** Toggle tooltips on/off and update the toggle button and status label. */
  private toggleTooltips(): void {
    this.tooltipsEnabled = !this.tooltipsEnabled;
    setTooltips(this.tooltipsEnabled);

    // Update the toggle button text
    const toggleText = this.tooltipsEnabled ? '[ Disable ]' : '[ Enable ]';
    if (this.toggleBtnRef) {
      this.toggleBtnRef.setText(toggleText);
    }

    // Update the status label
    const label = this.children.getByName('tooltipLabel') as Phaser.GameObjects.Text | undefined;
    if (label) {
      label.setText(`Tooltips: ${this.tooltipsEnabled ? 'Enabled' : 'Disabled'}`);
      label.setColor(this.tooltipsEnabled ? '#88ff88' : '#ff8888');
    }

    // Hide any active tooltips when disabling
    if (!this.tooltipsEnabled) {
      this.hideTooltip();
    }

    this.logEvent(`Tooltips ${this.tooltipsEnabled ? 'enabled' : 'disabled'}`);
  }

  private showCardTooltip(content: string, x: number, y: number, color: number): void {
    if (!this.tooltipsEnabled) return;

    if (this.useDomMode) {
      this.domTooltipManager.show(content, x, y);
    } else {
      this.phaserTooltipManager.show('', x, y, {
        cardName: content,
        borderColor: color,
      });
    }
  }

  private showDemoTooltip(): void {
    if (!this.tooltipsEnabled) return;

    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    if (this.useDomMode) {
      this.domTooltipManager.show(
        'Demo Tooltip\nThis is a DOM-based overlay tooltip.\nIt uses an HTML div element.',
        cx, cy,
      );
    } else {
      this.phaserTooltipManager.show('', cx, cy, {
        cardName: 'Demo Tooltip\nThis is a Phaser-based tooltip.\nIt uses GameObject containers.',
        borderColor: 0xffaa00,
      });
    }
    this.logEvent('Demo tooltip scheduled (dwell ' + TOOLTIP_DEMO_HOVER_DELAY_MS + ' ms)');
  }

  private hideTooltip(): void {
    this.domTooltipManager.hide();
    this.phaserTooltipManager.hide();
  }

  private logEvent(msg: string): void {
    this.eventLog.push(msg);
    if (this.eventLog.length > TOOLTIP_LOG_MAX_LINES) this.eventLog.shift();
    for (const t of this.logTexts) t.destroy();
    this.logTexts = [];
    const logAnchor = resolveAnchor('log', 'center');
    // Event log entries start below the log header anchor
    const baseY = logAnchor.y + TOOLTIP_LOG_BASE_Y_OFFSET;
    for (let i = 0; i < this.eventLog.length; i++) {
      const txt = createHudText(this, GAME_W / 2, baseY + i * TOOLTIP_LOG_LINE_HEIGHT, this.eventLog[i], '#aabbcc', { fontSize: TOOLTIP_LOG_FONT_SIZE }).setOrigin(0.5);
      this.logTexts.push(txt);
    }
  }

  shutdown(): void {
    this.domTooltipManager.destroy();
    this.phaserTooltipManager.destroy();
  }
}
