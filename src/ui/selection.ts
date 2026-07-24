export interface SelectionState {
  selected: boolean;
  hovered: boolean;
}

export interface SelectionController {
  select(): void;
  deselect(): void;
  toggle(): void;
  isSelected(): boolean;
  isHovered(): boolean;
  setHovered(hovered: boolean): void;
}

export interface AttachSelectionOptions {
  onStateChange?: (state: SelectionState) => void;
}

export interface SingleSelectionManager {
  select(controller: SelectionController): void;
  clear(): void;
  getSelected(): SelectionController | null;
  registerTarget(target: Phaser.GameObjects.GameObject): void;
  clearTargets(): void;
  destroy(): void;
}

/**
 * Attaches lightweight selected/hovered state management to a game object.
 * Visuals are delegated to the caller via `onStateChange`.
 */
export function attachSelection(
  _target: Phaser.GameObjects.GameObject,
  options: AttachSelectionOptions = {},
): SelectionController {
  let selected = false;
  let hovered = false;

  const emitState = (): void => {
    options.onStateChange?.({ selected, hovered });
  };

  const controller: SelectionController = {
    select(): void {
      if (selected) return;
      selected = true;
      emitState();
    },

    deselect(): void {
      if (!selected) return;
      selected = false;
      emitState();
    },

    toggle(): void {
      selected ? controller.deselect() : controller.select();
    },

    isSelected(): boolean {
      return selected;
    },

    isHovered(): boolean {
      return hovered;
    },

    setHovered(nextHovered: boolean): void {
      if (hovered === nextHovered) return;
      hovered = nextHovered;
      emitState();
    },
  };

  emitState();
  return controller;
}

/**
 * Scene-level helper for "single selected card" behaviour.
 *
 * - Keeps at most one selected controller active at once.
 * - Clears selection when a pointerdown occurs outside registered targets.
 */
export function createSingleSelectionManager(scene: Phaser.Scene): SingleSelectionManager {
  let selected: SelectionController | null = null;
  const targets = new Set<Phaser.GameObjects.GameObject>();

  const handlePointerDown = (
    _pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[] = [],
  ): void => {
    const clickedSelectable = currentlyOver.some((obj) => targets.has(obj));
    if (!clickedSelectable) {
      if (selected) {
        selected.deselect();
        selected = null;
      }
    }
  };

  scene.input.on('pointerdown', handlePointerDown);

  return {
    select(controller: SelectionController): void {
      if (selected && selected !== controller) {
        selected.deselect();
      }
      selected = controller;
      selected.select();
    },

    clear(): void {
      if (!selected) return;
      selected.deselect();
      selected = null;
    },

    getSelected(): SelectionController | null {
      return selected;
    },

    registerTarget(target: Phaser.GameObjects.GameObject): void {
      targets.add(target);
    },

    clearTargets(): void {
      targets.clear();
    },

    destroy(): void {
      scene.input.off('pointerdown', handlePointerDown);
      targets.clear();
      selected = null;
    },
  };
}
