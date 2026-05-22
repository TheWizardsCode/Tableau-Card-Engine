/**
 * GymSllScene -- Demonstrates the Screen Layout Language (SLL) directly.
 *
 * This scene intentionally uses the SLL helpers end-to-end without any
 * legacy fallback adapter:
 *   - validateScreenLayoutDocument / parseScreenLayoutDocument
 *   - normalizedToPixels
 *   - composeResolvedLayouts
 *   - VisibilityOwnershipController for shell/shared/scene chrome
 *
 * It renders SLL zones and anchors as an optional debug overlay, and uses
 * anchor-derived positions for title/header text, a help button, an action
 * control, and a content area.
 *
 * @module example-games/gym/scenes/GymSllScene
 */

import Phaser from 'phaser';
import { GymSceneBase } from './GymSceneBase';
import { GYM_SLL_KEY } from '../GymRegistry';
import {
  VisibilityOwnershipController,
  type VisibilityMode,
  type VisibilityTarget,
} from '../../../src/core-engine/VisibilityOwnership';
import sceneOnlyLayoutJson from '../layouts/gym-scene.layout.json';
import pixelOverrideLayoutJson from '../layouts/gym-sll-pixel-override.layout.json';
import gymShellLayoutJson from '../layouts/gym-shell.layout.json';
import type {
  PixelPoint,
  PixelRect,
  ScreenLayoutDocument,
  ScreenLayoutParseResult,
} from '../../../src/ui/screen-layout-schema';
import { composeResolvedLayouts } from '../../../src/ui/screen-layout-compose';
import { normalizedToPixels } from '../../../src/ui/screen-layout';
import {
  parseScreenLayoutDocument,
  validateScreenLayoutDocument,
} from '../../../src/ui/screen-layout-schema';

interface LayoutProfile {
  id: string;
  label: string;
  viewport: { width: number; height: number };
  dpr: number;
}

interface PlacementMapping {
  title: { zone: string; anchor: string };
  help: { zone: string; anchor: string };
  action: { zone: string; anchor: string };
  content?: { zone: string; anchor: string };
}

interface DirectLayoutOption {
  kind: 'direct';
  name: string;
  layoutId: string;
  layout: ScreenLayoutDocument;
  placement: PlacementMapping;
  visibilityMode: VisibilityMode;
  showContent: boolean;
}

interface ComposedLayoutOption {
  kind: 'composed';
  name: string;
  layoutId: string;
  baseLayout: ScreenLayoutDocument;
  sceneLayout: ScreenLayoutDocument;
  composition: {
    baseLayoutId: string;
    sceneLayoutId: string;
    policy: 'sceneWins';
  };
  placement: PlacementMapping;
  visibilityMode: VisibilityMode;
  showContent: boolean;
}

type LayoutOption = DirectLayoutOption | ComposedLayoutOption;

type PlacementTarget = NonNullable<PlacementMapping[keyof PlacementMapping]>;

interface ReadyMarker {
  ready: boolean;
  sceneKey: string;
  layoutId: string;
  profile: {
    id: string;
    viewport: { width: number; height: number };
    dpr: number;
  };
  anchorsDisplay: {
    title: PixelPoint;
    help: PixelPoint;
    action: PixelPoint;
  };
  composition?: {
    baseLayoutId: string;
    sceneLayoutId: string;
    policy: 'sceneWins';
  };
}

const LAYOUT_PROFILES: LayoutProfile[] = [
  {
    id: 'desktop-1x',
    label: 'Desktop 1280x720 @1x',
    viewport: { width: 1280, height: 720 },
    dpr: 1,
  },
  {
    id: 'portrait-2x',
    label: 'Portrait 720x1280 @2x',
    viewport: { width: 720, height: 1280 },
    dpr: 2,
  },
  {
    id: 'desktop-2x',
    label: 'Desktop 1280x720 @2x',
    viewport: { width: 1280, height: 720 },
    dpr: 2,
  },
];

const OVERLAY_COLORS = [0x66ddff, 0x66ff99, 0xffcc66, 0xff8899, 0xd9a5ff, 0x99ffdd];

const SHELL_ONLY_PLACEMENT: PlacementMapping = {
  title: { zone: 'shell', anchor: 'title' },
  help: { zone: 'shell', anchor: 'help' },
  action: { zone: 'shared', anchor: 'action' },
};

const SCENE_ONLY_PLACEMENT: PlacementMapping = {
  title: { zone: 'shared', anchor: 'title' },
  help: { zone: 'shared', anchor: 'help' },
  action: { zone: 'shared', anchor: 'action' },
  content: { zone: 'sceneOnly', anchor: 'center' },
};

const PIXEL_OVERRIDE_PLACEMENT: PlacementMapping = {
  title: { zone: 'header', anchor: 'title' },
  help: { zone: 'menu', anchor: 'help' },
  action: { zone: 'controls', anchor: 'action' },
  content: { zone: 'content', anchor: 'center' },
};

const COMPOSED_PLACEMENT: PlacementMapping = {
  title: { zone: 'shell', anchor: 'title' },
  help: { zone: 'shell', anchor: 'help' },
  action: { zone: 'shared', anchor: 'action' },
  content: { zone: 'sceneOnly', anchor: 'center' },
};

export class GymSllScene extends GymSceneBase {
  private layouts: LayoutOption[] = [];
  private layoutIndex = 0;
  private profileIndex = 0;
  private overlayVisible = false;

  private layoutButton!: Phaser.GameObjects.Text;
  private profileButton!: Phaser.GameObjects.Text;
  private overlayButton!: Phaser.GameObjects.Text;
  private statusLine!: Phaser.GameObjects.Text;

  private layoutTitle!: Phaser.GameObjects.Text;
  private actionButton!: Phaser.GameObjects.Text;
  private contentPanel!: Phaser.GameObjects.Rectangle;
  private contentLabel!: Phaser.GameObjects.Text;

  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private overlayLabels: Phaser.GameObjects.Text[] = [];
  private pulseOn = false;
  private visibilityController!: VisibilityOwnershipController<VisibilityTarget>;

  constructor() {
    super({ key: GYM_SLL_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#14252d');
    this.initHeader('Screen Layout Language (SLL)');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'Overview',
        body:
          'This scene demonstrates SLL directly and in composed form. It validates and parses layout JSON, maps zones/anchors to pixels, and positions UI using composeResolvedLayouts + normalizedToPixels.',
      },
      {
        heading: 'Controls',
        body:
          '[ Layout ] cycles between the shell-only example, the scene-only layout, the pixel override layout, and the composed shell + scene example. [ Profile ] simulates viewport + DPR combinations. [ Overlay ] toggles zone and anchor debug visualization.',
      },
      {
        heading: 'Notes',
        body:
          'The shell-only example uses the shared shell layout by itself. The composed sample uses a shared shell layout plus a scene layout. The overlay shows merged zones and anchors so collision handling and namespacing are easy to inspect.',
      },
    ]);

    this.bootstrapLayouts();
    this.createControlRow();
    this.createDemoObjects();
    this.configureVisibility();

    this.overlayGraphics = this.add.graphics();
    this.overlayGraphics.setDepth(70);

    this.applyLayout();

    this.events.once('shutdown', () => this.clearReadyMarker());
    this.events.once('destroy', () => this.clearReadyMarker());
  }

  private bootstrapLayouts(): void {
    const composedBaseValidation = validateScreenLayoutDocument(gymShellLayoutJson);
    if (!composedBaseValidation.valid) {
      const firstError = composedBaseValidation.errors[0];
      throw new Error(
        `Invalid composed base layout: ${firstError?.path ?? '/'} ${firstError?.message ?? 'unknown validation error'}`,
      );
    }

    const composedSceneValidation = validateScreenLayoutDocument(sceneOnlyLayoutJson);
    if (!composedSceneValidation.valid) {
      const firstError = composedSceneValidation.errors[0];
      throw new Error(
        `Invalid composed scene layout: ${firstError?.path ?? '/'} ${firstError?.message ?? 'unknown validation error'}`,
      );
    }

    const composedBaseParsed = parseScreenLayoutDocument(gymShellLayoutJson);
    const composedSceneParsed = parseScreenLayoutDocument(sceneOnlyLayoutJson);
    const shellOnlyLayout = this.requireValidParsedLayout('Shell-only', composedBaseParsed);
    this.layouts.push({
      kind: 'direct',
      name: 'Shell-only',
      layoutId: shellOnlyLayout.id,
      layout: shellOnlyLayout,
      placement: SHELL_ONLY_PLACEMENT,
      visibilityMode: 'shell-only',
      showContent: false,
    });

    const candidates: Array<{
      name: string;
      source: unknown;
      placement: PlacementMapping;
      visibilityMode: VisibilityMode;
      showContent: boolean;
    }> = [
      {
        name: 'Scene-only',
        source: sceneOnlyLayoutJson,
        placement: SCENE_ONLY_PLACEMENT,
        visibilityMode: 'scene-only',
        showContent: true,
      },
      {
        name: 'Pixel Override',
        source: pixelOverrideLayoutJson,
        placement: PIXEL_OVERRIDE_PLACEMENT,
        visibilityMode: 'composed',
        showContent: true,
      },
    ];

    for (const candidate of candidates) {
      const validation = validateScreenLayoutDocument(candidate.source);
      if (!validation.valid) {
        const firstError = validation.errors[0];
        throw new Error(
          `Invalid SLL layout "${candidate.name}": ${firstError?.path ?? '/'} ${firstError?.message ?? 'unknown validation error'}`,
        );
      }

      const parsed = parseScreenLayoutDocument(candidate.source);
      const layout = this.requireValidParsedLayout(candidate.name, parsed);
      this.layouts.push({
        kind: 'direct',
        name: candidate.name,
        layoutId: layout.id,
        layout,
        placement: candidate.placement,
        visibilityMode: candidate.visibilityMode,
        showContent: candidate.showContent,
      });
    }

    this.layouts.push({
      kind: 'composed',
      name: 'Composed Shell + Scene',
      layoutId: `${this.requireValidParsedLayout('Composed Base', composedBaseParsed).id}+${this.requireValidParsedLayout('Composed Scene', composedSceneParsed).id}`,
      baseLayout: this.requireValidParsedLayout('Composed Base', composedBaseParsed),
      sceneLayout: this.requireValidParsedLayout('Composed Scene', composedSceneParsed),
      composition: {
        baseLayoutId: this.requireValidParsedLayout('Composed Base', composedBaseParsed).id,
        sceneLayoutId: this.requireValidParsedLayout('Composed Scene', composedSceneParsed).id,
        policy: 'sceneWins',
      },
      placement: COMPOSED_PLACEMENT,
      visibilityMode: 'composed',
      showContent: true,
    });
  }

  private requireValidParsedLayout(name: string, parsed: ScreenLayoutParseResult): ScreenLayoutDocument {
    if (!parsed.valid) {
      const firstError = parsed.errors[0];
      throw new Error(
        `Unable to parse SLL layout "${name}": ${firstError?.path ?? '/'} ${firstError?.message ?? 'unknown parse error'}`,
      );
    }
    return parsed.layout;
  }

  private createControlRow(): void {
    const y = 58;
    this.layoutButton = this.addButton(28, y, '[ Layout ]', () => this.cycleLayout(), {
      fontSize: '13px',
      color: '#88ffcc',
    });

    this.profileButton = this.addButton(320, y, '[ Profile ]', () => this.cycleProfile(), {
      fontSize: '13px',
      color: '#88ddff',
    });

    this.overlayButton = this.addButton(560, y, '[ Overlay: OFF ]', () => this.toggleOverlay(), {
      fontSize: '13px',
      color: '#ffee99',
    });

    this.statusLine = this.addLabel(28, 84, '', { fontSize: '12px', color: '#b7d9e3' });
  }

  private createDemoObjects(): void {
    this.layoutTitle = this.add
      .text(0, 0, 'SLL Title Anchor', {
        fontSize: '24px',
        color: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(40);

    this.actionButton = this.add
      .text(0, 0, '[ Toggle Pulse ]', {
        fontSize: '15px',
        color: '#88ff88',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(40)
      .setInteractive({ useHandCursor: true });

    this.actionButton.on('pointerdown', () => this.togglePulse());
    this.actionButton.on('pointerover', () => this.actionButton.setColor('#bbffbb'));
    this.actionButton.on('pointerout', () => this.actionButton.setColor('#88ff88'));

    this.contentPanel = this.add
      .rectangle(0, 0, 420, 220, 0x133848, 0.78)
      .setStrokeStyle(2, 0x66ddff, 0.95)
      .setOrigin(0.5)
      .setDepth(25);

    this.contentLabel = this.add
      .text(0, 0, 'SLL content area\n(anchor + zone driven)', {
        fontSize: '16px',
        color: '#ffffff',
        fontFamily: 'monospace',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(35);
  }

  private cycleLayout(): void {
    this.layoutIndex = (this.layoutIndex + 1) % this.layouts.length;
    this.applyLayout();
  }

  private cycleProfile(): void {
    this.profileIndex = (this.profileIndex + 1) % LAYOUT_PROFILES.length;
    this.applyLayout();
  }

  private toggleOverlay(): void {
    this.overlayVisible = !this.overlayVisible;
    this.overlayButton.setText(`[ Overlay: ${this.overlayVisible ? 'ON' : 'OFF'} ]`);
    this.applyLayout();
  }

  private togglePulse(): void {
    this.pulseOn = !this.pulseOn;
    this.contentPanel.setFillStyle(this.pulseOn ? 0x2a5f33 : 0x133848, 0.82);
    this.contentLabel.setText(
      this.pulseOn
        ? 'SLL content area\nstate: PULSE ON'
        : 'SLL content area\nstate: PULSE OFF',
    );
  }

  private configureVisibility(): void {
    this.visibilityController = new VisibilityOwnershipController<VisibilityTarget>({
      groupRules: {
        shell: {
          'shell-only': true,
          composed: true,
        },
        scene: {
          'scene-only': true,
          composed: true,
        },
        shared: {
          'shell-only': true,
          'scene-only': true,
          composed: true,
        },
      },
    });

    this.visibilityController.register(this.header.title, 'shell');
    this.visibilityController.register(this.header.menuButton, 'shell');
    if (this.headerDivider) {
      this.visibilityController.register(this.headerDivider, 'shell');
    }

    if (this.helpPanel) {
      this.visibilityController.register(this.helpPanel, 'shell');
    }
    if (this.helpButton) {
      this.visibilityController.register(this.helpButton, 'shell');
    }

    this.visibilityController.register(this.layoutButton, 'shell');
    this.visibilityController.register(this.profileButton, 'shell');
    this.visibilityController.register(this.overlayButton, 'shell');
    this.visibilityController.register(this.statusLine, 'shell');

    this.visibilityController.register(this.layoutTitle, 'shared');
    this.visibilityController.register(this.actionButton, 'scene');
    this.visibilityController.register(this.contentPanel, 'scene');
    this.visibilityController.register(this.contentLabel, 'scene');
  }

  private getAnchorPoint(
    resolved: ReturnType<typeof normalizedToPixels>,
    placement: PlacementTarget,
  ): PixelPoint {
    const zone = resolved.zones[placement.zone];
    if (!zone) {
      throw new Error(`Unknown resolved zone "${placement.zone}" in the current layout.`);
    }

    const anchor = zone.anchors[placement.anchor];
    if (!anchor) {
      throw new Error(`Unknown resolved anchor "${placement.anchor}" in zone "${placement.zone}".`);
    }

    return anchor;
  }

  private getZoneRect(
    resolved: ReturnType<typeof normalizedToPixels>,
    zoneName: string,
  ): PixelRect {
    const zone = resolved.zones[zoneName];
    if (!zone) {
      throw new Error(`Unknown resolved zone "${zoneName}" in the current layout.`);
    }

    return zone.rect;
  }

  private applyLayout(): void {
    const currentLayout = this.layouts[this.layoutIndex]!;
    const currentProfile = LAYOUT_PROFILES[this.profileIndex]!;

    const resolved =
      currentLayout.kind === 'direct'
        ? normalizedToPixels(currentLayout.layout, currentProfile.viewport, currentProfile.dpr)
        : composeResolvedLayouts(
            currentLayout.baseLayout,
            currentLayout.sceneLayout,
            currentProfile.viewport,
            currentProfile.dpr,
            {
              policy: currentLayout.composition.policy,
            },
          );

    const previewScaleX = this.scale.width / resolved.viewport.pixelWidth;
    const previewScaleY = this.scale.height / resolved.viewport.pixelHeight;

    const toDisplayPoint = (point: PixelPoint): PixelPoint => ({
      x: point.x * previewScaleX,
      y: point.y * previewScaleY,
    });

    const toDisplayRect = (rect: PixelRect): PixelRect => ({
      x: rect.x * previewScaleX,
      y: rect.y * previewScaleY,
      width: rect.width * previewScaleX,
      height: rect.height * previewScaleY,
    });

    const titleAnchorPx = this.getAnchorPoint(resolved, currentLayout.placement.title);
    const helpAnchorPx = this.getAnchorPoint(resolved, currentLayout.placement.help);
    const actionAnchorPx = this.getAnchorPoint(resolved, currentLayout.placement.action);

    const contentPlacement = currentLayout.placement.content;

    const titleAnchorDisplay = toDisplayPoint(titleAnchorPx);
    const helpAnchorDisplay = toDisplayPoint(helpAnchorPx);
    const actionAnchorDisplay = toDisplayPoint(actionAnchorPx);

    this.layoutTitle.setPosition(titleAnchorDisplay.x, titleAnchorDisplay.y);
    this.helpButton?.setPosition(helpAnchorDisplay.x, helpAnchorDisplay.y);
    this.actionButton.setPosition(actionAnchorDisplay.x, actionAnchorDisplay.y);
    this.visibilityController.setMode(currentLayout.visibilityMode);

    if (currentLayout.showContent && contentPlacement) {
      const contentRectPx = this.getZoneRect(resolved, contentPlacement.zone);
      const contentCenterPx = this.getAnchorPoint(resolved, contentPlacement);
      const contentRectDisplay = toDisplayRect(contentRectPx);
      const contentCenterDisplay = toDisplayPoint(contentCenterPx);
      const panelWidth = Math.min(420, contentRectDisplay.width * 0.85);
      const panelHeight = Math.min(220, contentRectDisplay.height * 0.85);
      this.contentPanel.setVisible(true);
      this.contentLabel.setVisible(true);
      this.contentPanel
        .setPosition(contentCenterDisplay.x, contentCenterDisplay.y)
        .setSize(panelWidth, panelHeight);
      this.contentLabel.setPosition(contentCenterDisplay.x, contentCenterDisplay.y);
    } else {
      this.contentPanel.setVisible(false);
      this.contentLabel.setVisible(false);
    }

    this.redrawOverlay(resolved, toDisplayRect, toDisplayPoint);

    this.layoutButton.setText(
      `[ Layout: ${currentLayout.kind === 'composed' ? 'Shell+Scene' : currentLayout.name} ]`,
    );
    this.profileButton.setText(`[ Profile: ${currentProfile.id} ]`);
    this.statusLine.setText(
      currentLayout.kind === 'composed'
        ? `Composed shell + scene | ${currentProfile.label} | previewScale x${previewScaleX.toFixed(3)} y${previewScaleY.toFixed(3)}`
        : `${currentLayout.name} | ${currentProfile.label} | previewScale x${previewScaleX.toFixed(3)} y${previewScaleY.toFixed(3)}`,
    );

    this.publishReadyMarker({
      ready: true,
      sceneKey: GYM_SLL_KEY,
      layoutId: currentLayout.layoutId,
      profile: {
        id: currentProfile.id,
        viewport: { ...currentProfile.viewport },
        dpr: currentProfile.dpr,
      },
      anchorsDisplay: {
        title: titleAnchorDisplay,
        help: helpAnchorDisplay,
        action: actionAnchorDisplay,
      },
      ...(currentLayout.kind === 'composed' ? { composition: currentLayout.composition } : {}),
    });
  }

  private redrawOverlay(
    resolved: ReturnType<typeof normalizedToPixels>,
    toDisplayRect: (rect: PixelRect) => PixelRect,
    toDisplayPoint: (point: PixelPoint) => PixelPoint,
  ): void {
    this.overlayGraphics.clear();
    for (const label of this.overlayLabels) label.destroy();
    this.overlayLabels = [];

    if (!this.overlayVisible) {
      return;
    }

    let colorIndex = 0;
    const legendLines: string[] = ['Overlay legend'];

    for (const [zoneName, zone] of Object.entries(resolved.zones)) {
      const color = OVERLAY_COLORS[colorIndex % OVERLAY_COLORS.length];
      colorIndex += 1;

      const pixelRect = zone.rect;
      const displayRect = toDisplayRect(pixelRect);

      this.overlayGraphics.lineStyle(2, color, 0.95);
      this.overlayGraphics.strokeRect(
        displayRect.x,
        displayRect.y,
        displayRect.width,
        displayRect.height,
      );

      legendLines.push(
        `${zoneName}: [${pixelRect.x.toFixed(0)}, ${pixelRect.y.toFixed(0)}, ${pixelRect.width.toFixed(0)}, ${pixelRect.height.toFixed(0)}]`,
      );

      for (const [anchorName, anchorPixel] of Object.entries(zone.anchors)) {
        const anchorDisplay = toDisplayPoint(anchorPixel);

        this.overlayGraphics.fillStyle(color, 0.95);
        this.overlayGraphics.fillCircle(anchorDisplay.x, anchorDisplay.y, 4);

        legendLines.push(
          `  ${anchorName}: (${anchorPixel.x.toFixed(0)}, ${anchorPixel.y.toFixed(0)})`,
        );
      }
    }

    const legendPanelX = 864;
    const legendPanelY = 122;
    const legendPanelWidth = 392;
    const legendPanelHeight = Math.min(520, 18 + legendLines.length * 12);

    this.overlayGraphics.fillStyle(0x09151b, 0.82);
    this.overlayGraphics.fillRect(
      legendPanelX,
      legendPanelY,
      legendPanelWidth,
      legendPanelHeight,
    );
    this.overlayGraphics.lineStyle(1, 0x66ddff, 0.9);
    this.overlayGraphics.strokeRect(
      legendPanelX,
      legendPanelY,
      legendPanelWidth,
      legendPanelHeight,
    );

    const legendLabel = this.add
      .text(legendPanelX + 10, legendPanelY + 8, legendLines.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#dff6ff',
        lineSpacing: 2,
      })
      .setDepth(75);
    this.overlayLabels.push(legendLabel);
  }

  private publishReadyMarker(marker: ReadyMarker): void {
    if (typeof window === 'undefined') {
      return;
    }
    (window as Window & { __gymSllSceneReady?: ReadyMarker }).__gymSllSceneReady = marker;
  }

  private clearReadyMarker(): void {
    if (typeof window === 'undefined') {
      return;
    }
    delete (window as Window & { __gymSllSceneReady?: ReadyMarker }).__gymSllSceneReady;
  }
}
