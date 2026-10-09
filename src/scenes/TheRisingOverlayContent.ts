/**
 * TheRisingOverlayContent -- the conversation overlay for 1916: The Rising.
 *
 * Meeting a spirit opens this modal overlay. It presents the spirit's name and
 * introduction, the deterministic 2–3 question options from the conversation
 * economy ({@link ../TheRisingEconomy}), and — once a question is chosen — a
 * testimony reveal panel with the awarded Insight. The overlay is a pure
 * presentation helper: it never mutates game state, it forwards the player's
 * choices to the caller through callbacks so the turn controller stays the
 * single source of truth.
 *
 * Conventions follow the AGENTS.md UI best practices and the Main Street
 * reference implementation:
 *
 *   - {@link createOverlayBackground} / {@link createOverlayButton} from `@ui`;
 *   - every text/button is parented into `scene.hudContainer` (so it renders
 *     above the board and is never hidden behind the overlay box);
 *   - depth ordering: backdrop {@link CONVERSATION_BACKDROP_DEPTH} (199),
 *     box {@link CONVERSATION_BOX_DEPTH} (200), interactive content
 *     {@link CONVERSATION_CONTENT_DEPTH} (201);
 *   - every created object is pushed into the scene's `overlayObjects` array,
 *     which is reset when the overlay is dismissed.
 *
 * Positioning comes from the SLL layout ({@link TheRisingLayout}); no absolute
 * pixel coordinates are used for overlay content.
 *
 * @module src/scenes/TheRisingOverlayContent
 */

import Phaser from 'phaser';
import { createOverlayBackground, createOverlayButton, dismissOverlay } from '@ui';
import { FONT_FAMILY } from '@ui/constants';
import type { Spirit, Testimony } from '../TheRisingContent';
import type { ConversationOption } from '../TheRisingEconomy';
import type { TheRisingLayout } from './TheRisingLayoutAdapter';

/** Overlay depth for the semi-transparent backdrop. */
export const CONVERSATION_BACKDROP_DEPTH = 199;
/** Overlay depth for the visible modal box. */
export const CONVERSATION_BOX_DEPTH = 200;
/** Overlay depth for text and interactive buttons. */
export const CONVERSATION_CONTENT_DEPTH = 201;

/** The conversation overlay box width, in logical pixels. */
export const CONVERSATION_BOX_WIDTH = 620;
/** The conversation overlay box height, in logical pixels. */
export const CONVERSATION_BOX_HEIGHT = 380;
/** Vertical gap between successive question buttons, in logical pixels. */
export const CONVERSATION_OPTION_SPACING = 44;
/** Duration of the overlay entrance fade, in milliseconds. */
export const CONVERSATION_TRANSITION_MS = 160;

/** A scene that carries the shared overlay-object registry, when present. */
interface OverlayObjectHost {
  overlayObjects?: Phaser.GameObjects.GameObject[];
}

/** A game object that may support alpha (text, button, container). */
type AlphaObject = Phaser.GameObjects.GameObject & {
  setAlpha?: (alpha: number) => void;
};

/** The live handle for an open conversation overlay. */
export interface ConversationOverlayHandle {
  /** Every game object currently owned by the overlay (frame + content). */
  readonly objects: Phaser.GameObjects.GameObject[];
  /**
   * Swap the question view for the testimony reveal panel.
   *
   * @param testimony       The chosen testimony to display.
   * @param insightAwarded  The Insight awarded for the choice.
   * @param onConfirm       Invoked when the player clicks Continue.
   */
  reveal(testimony: Testimony, insightAwarded: number, onConfirm: () => void): void;
  /** Dismiss the overlay, destroying its objects and resetting the registry. */
  dismiss(): void;
  /** Whether the overlay is still open. */
  isOpen(): boolean;
}

/** Options accepted by {@link showConversationOverlay}. */
export interface ShowConversationOverlayOptions {
  /** The Phaser scene that owns the board. */
  readonly scene: Phaser.Scene;
  /** The resolved SLL layout (supplies every overlay anchor). */
  readonly layout: TheRisingLayout;
  /** The spirit being conversed with. */
  readonly spirit: Spirit;
  /** The deterministic questions offered by the spirit. */
  readonly questions: readonly ConversationOption[];
  /** HUD container used to parent overlay objects (optional). */
  readonly panel?: Phaser.GameObjects.Container | null;
  /** When true, the entrance fade is skipped (reduced-motion). */
  readonly reducedMotion?: boolean;
  /** Invoked with the presented index of the chosen question. */
  readonly onChoose: (optionIndex: number) => void;
  /** Invoked when the player cancels (Cancel button or Escape). */
  readonly onCancel: () => void;
}

/**
 * Open the conversation overlay for a freshly met spirit.
 *
 * The returned handle owns the overlay's lifecycle: call {@link
 * ConversationOverlayHandle.reveal} once a testimony has been chosen, and
 * {@link ConversationOverlayHandle.dismiss} to close it. The caller keeps the
 * game state authoritative — this function only renders.
 */
export function showConversationOverlay(
  options: ShowConversationOverlayOptions,
): ConversationOverlayHandle {
  const { scene, layout, spirit, questions, panel } = options;
  const reducedMotion = options.reducedMotion ?? false;
  const anchors = layout.conversationOverlay;

  const allObjects: Phaser.GameObjects.GameObject[] = [];
  let contentObjects: Phaser.GameObjects.GameObject[] = [];
  let open = true;

  // ── Registry helpers ───────────────────────────────────────

  const registry = (): Phaser.GameObjects.GameObject[] | null => {
    const host = scene as unknown as OverlayObjectHost;
    return Array.isArray(host.overlayObjects) ? host.overlayObjects : null;
  };

  const parentIntoPanel = (object: Phaser.GameObjects.GameObject): void => {
    if (!panel) return;
    try {
      panel.add(object);
    } catch {
      // The object may already be parented; z-ordering must never crash.
    }
  };

  /** Track an overlay object in every registry, parenting content into the HUD. */
  const track = (
    object: Phaser.GameObjects.GameObject,
    isContent: boolean,
  ): Phaser.GameObjects.GameObject => {
    allObjects.push(object);
    if (isContent) {
      contentObjects.push(object);
      parentIntoPanel(object);
    }
    registry()?.push(object);
    return object;
  };

  // ── Frame (backdrop 199 + box 200) ─────────────────────────

  const frame = createOverlayBackground(
    scene,
    { depth: CONVERSATION_BACKDROP_DEPTH, alpha: 0.6 },
    {
      width: CONVERSATION_BOX_WIDTH,
      height: CONVERSATION_BOX_HEIGHT,
      color: 0x141a26,
      alpha: 1,
      depth: CONVERSATION_BOX_DEPTH,
    },
  );
  for (const object of frame.objects) {
    allObjects.push(object);
    registry()?.push(object);
  }

  // ── Content factories ──────────────────────────────────────

  const addContentText = (
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text => {
    const label = scene.add
      .text(x, y, text, { fontFamily: FONT_FAMILY, ...style })
      .setOrigin(0.5)
      .setDepth(CONVERSATION_CONTENT_DEPTH);
    return track(label, true) as Phaser.GameObjects.Text;
  };

  const addContentButton = (
    x: number,
    y: number,
    text: string,
    config?: { fontSize?: string; color?: string; hoverColor?: string },
  ): Phaser.GameObjects.Text => {
    const button = createOverlayButton(
      scene,
      x,
      y,
      text,
      CONVERSATION_CONTENT_DEPTH,
      config,
    );
    return track(button, true) as Phaser.GameObjects.Text;
  };

  const applyEntrance = (objects: Phaser.GameObjects.GameObject[]): void => {
    if (objects.length === 0) return;
    const fadeable = objects as AlphaObject[];
    if (reducedMotion) {
      for (const object of fadeable) object.setAlpha?.(1);
      return;
    }
    for (const object of fadeable) object.setAlpha?.(0);
    scene.tweens.add({
      targets: objects as unknown as object[],
      alpha: 1,
      duration: CONVERSATION_TRANSITION_MS,
      ease: 'Sine.out',
    });
  };

  const clearContent = (): void => {
    if (contentObjects.length === 0) return;
    scene.tweens.killTweensOf(contentObjects as unknown as object[]);
    const dismissed = new Set(contentObjects);
    dismissOverlay(contentObjects);
    // Drop the destroyed content from the live-object registry.
    for (let i = allObjects.length - 1; i >= 0; i -= 1) {
      if (dismissed.has(allObjects[i])) allObjects.splice(i, 1);
    }
    const registered = registry();
    if (registered) {
      for (let i = registered.length - 1; i >= 0; i -= 1) {
        if (dismissed.has(registered[i])) registered.splice(i, 1);
      }
    }
    contentObjects = [];
  };

  // ── Question view ──────────────────────────────────────────

  const renderQuestionView = (): void => {
    clearContent();

    addContentText(anchors.title.x, anchors.title.y, spirit.name, {
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#f0c040',
    });

    addContentText(anchors.intro.x, anchors.intro.y, spirit.summary, {
      fontSize: '13px',
      color: '#c7cdd8',
      align: 'center',
      wordWrap: { width: CONVERSATION_BOX_WIDTH - 80 },
    });

    questions.forEach((option, index) => {
      const button = addContentButton(
        anchors.options.x,
        anchors.options.y + index * CONVERSATION_OPTION_SPACING,
        `[ ${option.question} ]`,
        { fontSize: '14px' },
      );
      button.on('pointerdown', () => options.onChoose(option.index));
    });

    const cancel = addContentButton(anchors.cancel.x, anchors.cancel.y, '[ Cancel ]', {
      color: '#d99',
      hoverColor: '#fbb',
    });
    cancel.on('pointerdown', () => options.onCancel());

    applyEntrance(contentObjects);
  };

  // ── Escape dismissal (AC4) ─────────────────────────────────

  const keyboard = scene.input?.keyboard ?? null;
  const escapeListener = (): void => {
    if (open) options.onCancel();
  };
  keyboard?.on('keydown-ESC', escapeListener);

  // ── Handle ─────────────────────────────────────────────────

  const handle: ConversationOverlayHandle = {
    objects: allObjects,
    isOpen: () => open,
    reveal(testimony, insightAwarded, onConfirm) {
      if (!open) return;
      clearContent();

      addContentText(anchors.question.x, anchors.question.y, testimony.question, {
        fontSize: '13px',
        color: '#9fb0c8',
        align: 'center',
        wordWrap: { width: CONVERSATION_BOX_WIDTH - 80 },
      });

      addContentText(anchors.testimony.x, anchors.testimony.y, `\u201c${testimony.answer}\u201d`, {
        fontSize: '15px',
        fontStyle: 'italic',
        color: '#e8e2d0',
        align: 'center',
        wordWrap: { width: CONVERSATION_BOX_WIDTH - 80 },
      });

      addContentText(anchors.insight.x, anchors.insight.y, `+${insightAwarded} Insight`, {
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#88ff88',
      });

      const continueButton = addContentButton(anchors.confirm.x, anchors.confirm.y, '[ Continue ]');
      continueButton.on('pointerdown', () => onConfirm());

      applyEntrance(contentObjects);
    },
    dismiss() {
      if (!open) return;
      open = false;
      keyboard?.off('keydown-ESC', escapeListener);
      scene.tweens.killTweensOf(allObjects as unknown as object[]);
      dismissOverlay(allObjects);
      const host = scene as unknown as OverlayObjectHost;
      if (Array.isArray(host.overlayObjects)) {
        host.overlayObjects = [];
      }
    },
  };

  renderQuestionView();
  return handle;
}
