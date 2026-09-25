/**
 * Main Street: Undo Challenge Warning Dialog (CG-0MU8MYQ0H002IHNQ)
 *
 * Verifies the undo-challenge warning dialog copy/callbacks and the
 * `performUndo` wiring: the warning is shown only when the command being
 * undone completed a challenge; "Keep Completed" aborts the undo entirely;
 * "Undo Anyway" proceeds and revokes the completion.
 *
 * @module
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Records overlay buttons created by the mocked helper so tests can emit
// their pointerdown handlers. Hoisted so it is available to the mock factory.
const overlay = vi.hoisted(() => {
  const buttons: Array<{
    label: string;
    depth: number;
    handlers: Record<string, Array<() => void>>;
    emit: (event: string) => void;
  }> = [];
  return { buttons };
});

vi.mock('@ui', () => {
  return {
    FONT_FAMILY: 'Arial',
    createOverlayBackground: vi.fn(() => ({ objects: [] })),
    createOverlayButton: vi.fn((_s: unknown, _x: number, _y: number, label: string, depth: number) => {
      const handlers: Record<string, Array<() => void>> = {};
      const obj = {
        label,
        depth,
        handlers,
        on: (event: string, cb: () => void) => {
          (handlers[event] ??= []).push(cb);
          return obj;
        },
        emit: (event: string) => handlers[event]?.forEach(cb => cb()),
      };
      overlay.buttons.push(obj);
      return obj;
    }),
    dismissOverlay: vi.fn(),
  };
});

import { createOverlayButton, dismissOverlay } from '@ui';
import { MainStreetOverlayContent } from '../../example-games/main-street/scenes/MainStreetOverlayContent';
import { performUndo } from '../../example-games/main-street/scenes/MainStreetTurnControllerTurnFlow';
import {
  UNDO_CHALLENGE_I18N_KEYS,
  UNDO_CHALLENGE_EN_STRINGS,
} from '../../example-games/main-street/i18n/undo-challenge-en';
import { t } from '@core-engine/I18n';
import { UndoRedoManager, type Command } from '@core-engine/UndoRedoManager';

// ── Mock scene ──────────────────────────────────────────────

interface TextMock {
  text: string;
  depth: number | null;
  setOrigin: () => TextMock;
  setDepth: (d: number) => TextMock;
  setInteractive: () => TextMock;
  setText: (s: string) => TextMock;
  on: (event: string, cb: () => void) => TextMock;
}

function makeText(text = ''): TextMock {
  const obj: TextMock = {
    text,
    depth: null,
    setOrigin: () => obj,
    setDepth: (d: number) => { obj.depth = d; return obj; },
    setInteractive: () => obj,
    setText: (s: string) => { obj.text = s; return obj; },
    on: () => obj,
  };
  return obj;
}

/** Minimal scene mock backed by a real overlay-content instance. */
function makeDialogScene() {
  const texts: TextMock[] = [];
  const hudAdded: unknown[] = [];
  const scene: any = {
    layout: { gameW: 900, gameH: 700 },
    overlayObjects: [],
    uiPhase: 'market',
    hudContainer: { add: vi.fn((o: unknown) => hudAdded.push(o)) },
    add: {
      text: vi.fn((_x: number, _y: number, text: string) => {
        const obj = makeText(text);
        texts.push(obj);
        return obj;
      }),
    },
  };
  return { scene, texts, hudAdded };
}

function buttonByLabel(label: string) {
  return overlay.buttons.find(b => b.label.includes(label));
}

// ── i18n ────────────────────────────────────────────────────

describe('undo-challenge i18n bundle', () => {
  it('resolves the English dialog copy via t()', () => {
    expect(t(UNDO_CHALLENGE_I18N_KEYS.title)).toBe(UNDO_CHALLENGE_EN_STRINGS.title);
    expect(t(UNDO_CHALLENGE_I18N_KEYS.body)).toBe(UNDO_CHALLENGE_EN_STRINGS.body);
    expect(t(UNDO_CHALLENGE_I18N_KEYS.confirm)).toBe(UNDO_CHALLENGE_EN_STRINGS.confirm);
    expect(t(UNDO_CHALLENGE_I18N_KEYS.keep)).toBe(UNDO_CHALLENGE_EN_STRINGS.keep);
    expect(t(UNDO_CHALLENGE_I18N_KEYS.item, { title: 'Foodie Row' })).toBe('• Foodie Row');
  });
});

// ── Dialog ──────────────────────────────────────────────────

describe('MainStreetOverlayContent.showUndoChallengeWarningDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overlay.buttons.length = 0;
  });

  it('renders the title, body and each challenge title parented into hudContainer', () => {
    const { scene, texts, hudAdded } = makeDialogScene();
    const content = new MainStreetOverlayContent(scene);

    content.showUndoChallengeWarningDialog(['Foodie Row', 'Deep Pockets'], vi.fn(), vi.fn());

    const rendered = texts.map(x => x.text);
    expect(rendered).toContain(UNDO_CHALLENGE_EN_STRINGS.title);
    expect(rendered).toContain(UNDO_CHALLENGE_EN_STRINGS.body);
    expect(rendered).toContain('• Foodie Row');
    expect(rendered).toContain('• Deep Pockets');
    // Every text is parented into hudContainer (AGENTS.md UI rule).
    for (const textObj of texts) expect(hudAdded).toContain(textObj);
    // All text depth 201.
    for (const textObj of texts) expect(textObj.depth).toBe(201);
  });

  it('"Keep Completed" aborts the undo (calls onCancel, not onConfirm)', () => {
    const { scene } = makeDialogScene();
    const content = new MainStreetOverlayContent(scene);
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    content.showUndoChallengeWarningDialog(['Foodie Row'], onConfirm, onCancel);

    const keepBtn = buttonByLabel(UNDO_CHALLENGE_EN_STRINGS.keep);
    expect(keepBtn).toBeDefined();
    keepBtn!.emit('pointerdown');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(dismissOverlay).toHaveBeenCalled();
  });

  it('"Undo Anyway" proceeds with the undo (calls onConfirm)', () => {
    const { scene } = makeDialogScene();
    const content = new MainStreetOverlayContent(scene);
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    content.showUndoChallengeWarningDialog(['Foodie Row'], onConfirm, onCancel);

    const confirmBtn = buttonByLabel(UNDO_CHALLENGE_EN_STRINGS.confirm);
    expect(confirmBtn).toBeDefined();
    confirmBtn!.emit('pointerdown');

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('creates one button per action (two overlay buttons at depth 201)', () => {
    const { scene } = makeDialogScene();
    const content = new MainStreetOverlayContent(scene);
    content.showUndoChallengeWarningDialog(['Foodie Row'], vi.fn(), vi.fn());
    expect(createOverlayButton).toHaveBeenCalledTimes(2);
    expect(overlay.buttons.every(b => b.depth === 201)).toBe(true);
  });
});

// ── performUndo wiring ──────────────────────────────────────

describe('performUndo · challenge completion warning', () => {
  function makeTurnControllerScene(challengeCompleted = true) {
    let undone = false;
    const cmd: Command = {
      execute: vi.fn(),
      undo: vi.fn(() => { undone = true; }),
      description: 'BuyBusiness x',
      completedChallengeIds: challengeCompleted ? ['ch-foodie-row'] : [],
    };
    const undoManager = new UndoRedoManager();
    undoManager.execute(cmd);

    const dialogCalls: Array<{ titles: string[]; onConfirm: () => void; onCancel: () => void }> = [];
    const scene: any = {
      uiPhase: 'market',
      undoManager,
      state: {
        turn: 1,
        activityLog: [],
        activeChallenges: [
          { challenge: { id: 'ch-foodie-row', title: 'Foodie Row' }, completed: true },
        ],
      },
      justMovedHandCardId: 'x',
      showUndoChallengeWarningDialog: vi.fn((titles: string[], onConfirm: () => void, onCancel: () => void) => {
        dialogCalls.push({ titles, onConfirm, onCancel });
      }),
      refreshUndoRedoButtons: vi.fn(),
      refreshAll: vi.fn(),
      msAnimator: { animateUndoRedo: vi.fn() },
    };
    const tcCtx: any = { scene };
    return { scene, tcCtx, undoManager, dialogCalls, isUndone: () => undone };
  }

  it('shows the warning with challenge titles when the command completed a challenge', () => {
    const { tcCtx, dialogCalls, isUndone } = makeTurnControllerScene(true);
    performUndo(tcCtx);

    expect(dialogCalls).toHaveLength(1);
    expect(dialogCalls[0].titles).toEqual(['Foodie Row']);
    // Undo has NOT been applied yet — the player must choose.
    expect(isUndone()).toBe(false);
  });

  it('"Undo Anyway" applies the undo', () => {
    const { tcCtx, dialogCalls, isUndone } = makeTurnControllerScene(true);
    performUndo(tcCtx);
    dialogCalls[0].onConfirm();
    expect(isUndone()).toBe(true);
  });

  it('"Keep Completed" aborts the undo entirely', () => {
    const { tcCtx, dialogCalls, isUndone } = makeTurnControllerScene(true);
    performUndo(tcCtx);
    dialogCalls[0].onCancel();
    expect(isUndone()).toBe(false);
    expect(dialogCalls).toHaveLength(1);
  });

  it('undoes directly (no dialog) when the command completed no challenge', () => {
    const { tcCtx, dialogCalls, isUndone } = makeTurnControllerScene(false);
    performUndo(tcCtx);
    expect(dialogCalls).toHaveLength(0);
    expect(isUndone()).toBe(true);
  });
});
