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
  title: { zone: 'shared', anchor: 'title' },
  help: { zone: 'shell', anchor: 'help' },
  action: { zone: 'shared', anchor: 'action' },
  content: { zone: 'sceneOnly', anchor: 'center' },
};

export class GymSllScene extends GymSceneBase {
  private layouts: LayoutOption[] = [];
  private layoutIndex = 0;
  private overlayVisible = false;
  private shellVisible = true;

  private profileButton!: Phaser.GameObjects.Text;
  private overlayButton!: Phaser.GameObjects.Text;
  private shellToggleButton!: Phaser.GameObjects.Text;
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
        heading: 'Features',
        body: 'Demonstrates the Screen Layout Language (SLL) system for declarative UI positioning. Includes layout validation/parsing (validateScreenLayoutDocument, parseScreenLayoutDocument), pixel resolution (normalizedToPixels), composition (composeResolvedLayouts for merging shell + scene layouts), and the VisibilityOwnershipController for showing/hiding objects based on layout mode (shell-only, scene-only, composed). In a real card game, SLL lets designers define responsive layouts that adapt to different screen sizes and orientations without writing position code.'
      },
      {
        heading: 'Controls',
        body: '[ Profile ]: Cycle through layout examples — Composed Shell + Scene, Shell-only, Scene-only, and Pixel Override. Each profile repositions all demo objects according to the layout JSON.\n[ Overlay: OFF/ON ]: Toggle element position markers and legend overlay showing pixel coordinates of each placed element.\n[ Toggle Shell: ON/OFF ]: Show or hide the shared shell chrome (title, help button, profile button) without changing the selected layout. Demonstrates VisibilityOwnershipController group rules.\n[ Toggle Fill ]: Toggle the content panel fill colour between normal and highlighted state.'
      },
      {
        heading: 'Usage Example',
        body: 'A card game needs to support both landscape desktop (1280x720) and portrait tablet (720x1280) layouts. Using SLL, the designer defines zones and anchors in normalized coordinates, and the engine resolves them to pixel positions at runtime. The composed layout merges a shared shell (title bar, help button) with scene-specific content, so the shell stays consistent across all game scenes while the scene content adapts independently.'
      },
      {
        heading: 'Test Plan',
        body: '1. Press [ Profile ] to cycle through layouts — verify title, help button, action button, and content panel reposition correctly for each profile\n2. With composed profile active, press [ Toggle Shell: OFF ] → shell elements (title, profile button, overlay button) hide\n3. Press [ Toggle Shell: ON ] → shell elements reappear\n4. Press [ Overlay: OFF/ON ] → marker dots and legend panel appear/disappear\n5. Press [ Toggle Fill ] → content panel colour changes between states\n6. Cycle back to each profile and verify element positions update correctly\n7. Verify no overlapping or off-screen placement across all profiles'
      }
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
    const composedBaseLayout = this.requireValidParsedLayout('Composed Base', composedBaseParsed);
    const composedSceneLayout = this.requireValidParsedLayout('Composed Scene', composedSceneParsed);

    this.layouts.push({
      kind: 'composed',
      name: 'Composed Shell + Scene',
      layoutId: `${composedBaseLayout.id}+${composedSceneLayout.id}`,
      baseLayout: composedBaseLayout,
      sceneLayout: composedSceneLayout,
      composition: {
        baseLayoutId: composedBaseLayout.id,
        sceneLayoutId: composedSceneLayout.id,
        policy: 'sceneWins',
      },
      placement: COMPOSED_PLACEMENT,
      visibilityMode: 'composed',
      showContent: true,
    });

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
    const y1 = 58;
    const y2 = 82;
    this.profileButton = this.addButton(28, y1, '[ Profile ]', () => this.cycleProfile(), {
      fontSize: '13px',
      color: '#88ddff',
    });

    this.overlayButton = this.addButton(28, y2, '[ Overlay: OFF ]', () => this.toggleOverlay(), {
      fontSize: '13px',
      color: '#ffee99',
    });

    this.shellToggleButton = this.addButton(320, y2, `[ Toggle Shell: ${this.shellVisible ? 'ON' : 'OFF'} ]`, () => this.toggleShell(), {
      fontSize: '13px',
      color: '#ffcc88',
    });

    this.statusLine = this.addLabel(28, 106, '', { fontSize: '12px', color: '#b7d9e3' });
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
      .text(0, 0, '[ Toggle Fill ]', {
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

  private cycleProfile(): void {
    this.layoutIndex = (this.layoutIndex + 1) % this.layouts.length;
    this.applyLayout();
  }

  private toggleOverlay(): void {
    this.overlayVisible = !this.overlayVisible;
    this.overlayButton.setText(`[ Overlay: ${this.overlayVisible ? 'ON' : 'OFF'} ]`);
    this.applyLayout();
  }

  private toggleShell(): void {
    this.shellVisible = !this.shellVisible;
    this.shellToggleButton.setText(`[ Toggle Shell: ${this.shellVisible ? 'ON' : 'OFF'} ]`);
    this.visibilityController.setGroupRules('shell', this.shellVisible
      ? { 'shell-only': true, 'composed': true }
      : {});
  }

  private togglePulse(): void {
    this.pulseOn = !this.pulseOn;
    this.contentPanel.setFillStyle(this.pulseOn ? 0x2a5f33 : 0x133848, 0.82);
    this.contentLabel.setText(
      this.pulseOn
        ? 'SLL content area\nstate: FILL ON'
        : 'SLL content area\nstate: FILL OFF',
    );
  }

  private configureVisibility(): void {
    this.visibilityController = new VisibilityOwnershipController<VisibilityTarget>({
      groupRules: {
        shell: this.shellVisible
          ? { 'shell-only': true, composed: true }
          : {},
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

    this.visibilityController.register(this.profileButton, 'shell');
    this.visibilityController.register(this.overlayButton, 'shell');
    this.visibilityController.register(this.statusLine, 'shell');

    this.visibilityController.register(this.layoutTitle, 'scene');
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

  private applyLayout(): void {
    const currentLayout = this.layouts[this.layoutIndex]!;
    const currentProfile = LAYOUT_PROFILES[0]!;

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
      // Zones are position-only; panel dimensions use fixed defaults.
      const contentCenterPx = this.getAnchorPoint(resolved, contentPlacement);
      const contentCenterDisplay = toDisplayPoint(contentCenterPx);
      const panelWidth = 420;
      const panelHeight = 220;
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

    // Collect element positions for overlay visualization
    const elementColors = [0x66ddff, 0x66ff99, 0xffcc66, 0xff8899];
    const elementPositions: Array<{
      name: string;
      pixel: PixelPoint;
      display: PixelPoint;
      color: number;
    }> = [
      { name: 'Title', pixel: titleAnchorPx, display: titleAnchorDisplay, color: elementColors[0] },
      { name: 'Help', pixel: helpAnchorPx, display: helpAnchorDisplay, color: elementColors[1] },
      { name: 'Action', pixel: actionAnchorPx, display: actionAnchorDisplay, color: elementColors[2] },
    ];

    if (currentLayout.showContent && contentPlacement) {
      const contentPx = this.getAnchorPoint(resolved, contentPlacement);
      const contentDisplay = toDisplayPoint(contentPx);
      elementPositions.push({
        name: 'Content',
        pixel: contentPx,
        display: contentDisplay,
        color: elementColors[3],
      });
    }

    this.redrawOverlay(elementPositions);

    const layoutLabel = currentLayout.kind === 'composed' ? 'Shell+Scene' : currentLayout.name;
    this.profileButton.setText(`[ Profile: ${layoutLabel} ]`);
    this.statusLine.setText(
      `${layoutLabel} | ${currentProfile.label} | previewScale x${previewScaleX.toFixed(3)} y${previewScaleY.toFixed(3)}`,
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
    elementPositions: Array<{
      name: string;
      pixel: PixelPoint;
      display: PixelPoint;
      color: number;
    }>,
  ): void {
    this.overlayGraphics.clear();
    for (const label of this.overlayLabels) label.destroy();
    this.overlayLabels = [];

    if (!this.overlayVisible) {
      return;
    }

    const legendLines: string[] = ['Overlay legend'];
    const separator = '─'.repeat(36);

    for (const elem of elementPositions) {
      // Draw a dot at the element's display position
      this.overlayGraphics.fillStyle(elem.color, 0.95);
      this.overlayGraphics.fillCircle(elem.display.x, elem.display.y, 5);
      this.overlayGraphics.lineStyle(1.5, elem.color, 0.8);
      this.overlayGraphics.strokeCircle(elem.display.x, elem.display.y, 8);

      legendLines.push(
        `${elem.name}: (${elem.pixel.x.toFixed(0)}, ${elem.pixel.y.toFixed(0)})`,
      );
    }

    legendLines.push('');
    legendLines.push(separator);
    legendLines.push('Positions shown are the pixel');
    legendLines.push('coordinates of each placed element');
    legendLines.push('as determined by the current SLL');
    legendLines.push('layout and placement mapping.');

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
