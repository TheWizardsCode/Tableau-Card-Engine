/**
 * StateInspectorOverlay — Debug tool that displays the active scene's
 * game state as a collapsible tree view with text filter and manual refresh.
 *
 * @module @ui/debug/StateInspectorOverlay
 */

import type Phaser from 'phaser';
import { GAME_W, GAME_H } from '../constants';
import {
  createOverlayDialog,
  type OverlayDialogHandle,
} from '../Overlay';
import type { DebugToolsEntry } from './DebugToolsRegistry';

// ── Constants ───────────────────────────────────────────────

const TREE_INDENT = 20;
const LINE_HEIGHT = 22;
const HEADER_HEIGHT = 70;

const BOX_WIDTH = Math.min(GAME_W - 80, 720);
const BOX_HEIGHT = Math.min(GAME_H - 80, 560);

const COLOR_STRING = '#ce9178';
const COLOR_NUMBER = '#b5cea8';
const COLOR_BOOL = '#569cd6';
const COLOR_NULL = '#808080';
const COLOR_COLLAPSED = '#c0c0c0';
const COLOR_FILTERED_OUT = '#555555';

// ── Types ───────────────────────────────────────────────────

interface InspectorState {
  filterText: string;
  filterInput: HTMLInputElement | null;
  /** Persisted set of expanded node full-paths, survives re-renders. */
  expandedKeys: Set<string>;
}

/** Reference to the currently open overlay (if any). */
let activeOverlay: OverlayDialogHandle | null = null;

/** Reference to the current state. */
let activeState: InspectorState | null = null;

// ── State extraction ────────────────────────────────────────

/**
 * Try to extract a state object from the active scene.
 * Looks for common state patterns across game scenes.
 */
function extractState(scene: Phaser.Scene): Record<string, unknown> {
  const s = scene as unknown as Record<string, unknown>;
  const state: Record<string, unknown> = {};

  // Try standard patterns
  if (s.state && typeof s.state === 'object') {
    state['state'] = s.state;
  }
  if (s.gameState && typeof s.gameState === 'object') {
    state['gameState'] = s.gameState;
  }
  if (s.session && typeof s.session === 'object') {
    state['session'] = s.session;
  }
  if (s.recorder && typeof s.recorder === 'object') {
    const recorder = s.recorder as Record<string, unknown>;
    if (typeof recorder.getTranscript === 'function') {
      try {
        const transcript = (recorder.getTranscript as () => unknown)();
        state['transcript (current)'] = transcript;
      } catch {
        state['transcript (current)'] = { error: 'Could not read transcript' };
      }
    }
  }

  if (Object.keys(state).length === 0) {
    // Dump all scene properties (excluding Phaser internals)
    const allProps: Record<string, unknown> = {};
    for (const key of Object.getOwnPropertyNames(s)) {
      if (key.startsWith('_') || typeof s[key] === 'function') continue;
      if (key === 'scene' || key === 'events' || key === 'input' || key === 'sys') continue;
      try {
        const val = s[key];
        if (typeof val !== 'function' && val !== scene) {
          allProps[key] = val;
        }
      } catch {
        // Skip inaccessible properties
      }
    }
    state['(scene properties)'] = allProps;
  }

  return state;
}

// ── Rendering helpers ───────────────────────────────────────

function formatValue(val: unknown): string {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'string') return `"${val.length > 60 ? val.slice(0, 60) + '...' : val}"`;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return `Array(${val.length})`;
  if (typeof val === 'object') return '{...}';
  return String(val);
}

function valueColor(val: unknown): string {
  if (val === null || val === undefined) return COLOR_NULL;
  if (typeof val === 'string') return COLOR_STRING;
  if (typeof val === 'number') return COLOR_NUMBER;
  if (typeof val === 'boolean') return COLOR_BOOL;
  return COLOR_COLLAPSED;
}

// ── Main content rendering ──────────────────────────────────

function renderInspector(
  scene: Phaser.Scene,
  overlay: OverlayDialogHandle,
  state: InspectorState,
  boxWidth: number,
): void {
  // Remove previous tree content from the scroll container
  overlay.scrollContainer.removeAll(true);

  // Fresh state extraction
  const extractedState = extractState(scene);

  const contentWidth = overlay.contentWidth;

  // Build flat tree for rendering
  const flatNodes: Array<{
    key: string;
    depth: number;
    display: string;
    color: string;
    expanded: boolean;
    fullPath: string;
    nodeKey: string;
  }> = [];

  function flatten(obj: Record<string, unknown>, depth: number, parentPath: string): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = parentPath ? `${parentPath}.${key}` : key;
      const isExpandable = value !== null && typeof value === 'object';
      const isExpanded = state.expandedKeys.has(fullPath);

      // Filter check
      const matchesFilter = !state.filterText ||
        key.toLowerCase().includes(state.filterText.toLowerCase()) ||
        (typeof value === 'string' && value.toLowerCase().includes(state.filterText.toLowerCase()));

      // For expandable objects, check if any child matches
      let childMatch = false;
      if (isExpandable && value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        childMatch = entries.some(([k, v]) =>
          k.toLowerCase().includes(state.filterText.toLowerCase()) ||
          (typeof v === 'string' && v.toLowerCase().includes(state.filterText.toLowerCase()))
        );
      }

      if (!matchesFilter && !childMatch && state.filterText) {
        // Still add as filtered-out entry to maintain tree structure
        flatNodes.push({
          key,
          depth,
          display: `${key}: ${formatValue(value)}`,
          color: COLOR_FILTERED_OUT,
          expanded: isExpanded,
          fullPath,
          nodeKey: key,
        });
        continue;
      }

      const valColor = valueColor(value);
      const toggleSymbol = isExpandable ? (isExpanded ? '▼ ' : '▶ ') : '  ';
      flatNodes.push({
        key,
        depth,
        display: `${toggleSymbol}${key}: ${formatValue(value)}`,
        color: valColor,
        expanded: isExpanded,
        fullPath,
        nodeKey: key,
      });

      if (isExpandable && isExpanded && value && typeof value === 'object') {
        flatten(value as Record<string, unknown>, depth + 1, fullPath);
      }
    }
  }

  flatten(extractedState, 0, '');

  // Render tree as text objects into the overlay's scroll container
  const totalContentHeight = flatNodes.length * LINE_HEIGHT + 10;

  for (let i = 0; i < flatNodes.length; i++) {
    const node = flatNodes[i];
    const y = i * LINE_HEIGHT;
    const x = node.depth * TREE_INDENT;

    const textObj = scene.add.text(x, y, node.display, {
      fontSize: '13px',
      color: node.color,
      fontFamily: overlay.monoFont,
      wordWrap: { width: contentWidth - node.depth * TREE_INDENT },
    });
    textObj.setDepth(overlay.depthBase + 2);
    overlay.scrollContainer.add(textObj);

    // Click to toggle expand/collapse for expandable nodes
    if (typeof node.expanded !== 'undefined') {
      textObj.setInteractive({ useHandCursor: true });
      textObj.on('pointerdown', () => {
        if (state.expandedKeys.has(node.fullPath)) {
          state.expandedKeys.delete(node.fullPath);
        } else {
          state.expandedKeys.add(node.fullPath);
        }
        renderInspector(scene, overlay, state, boxWidth);
      });
    }
  }

  // Let the overlay re-clamp scroll and apply mask
  overlay.refresh(totalContentHeight);
}

// ── Factory ─────────────────────────────────────────────────

/**
 * Create a debug tool entry for the State Inspector overlay.
 *
 * @returns A DebugToolsEntry that opens the state inspector when activated.
 */
export function createStateInspectorTool(): DebugToolsEntry {
  return {
    label: 'State Inspector',
    description: 'Inspect game state as collapsible tree with filter',
    activate: (scene: Phaser.Scene) => {
      // Close existing inspector if open
      if (activeOverlay) {
        activeOverlay.close();
        if (activeState?.filterInput) {
          activeState.filterInput.remove();
        }
        activeOverlay = null;
        activeState = null;
      }

      const state: InspectorState = {
        filterText: '',
        filterInput: null,
        expandedKeys: new Set<string>(),
      };
      activeState = state;

      // ── Create the scrollable overlay (dialog-style) ──
      const overlay = createOverlayDialog(scene, {
        title: 'State Inspector',
        width: BOX_WIDTH,
        height: BOX_HEIGHT,
        headerHeight: HEADER_HEIGHT,
        boxColor: 0x1a1a2e,
        onClose: () => {
          if (state.filterInput) {
            state.filterInput.remove();
          }
          activeOverlay = null;
          activeState = null;
        },
      });
      activeOverlay = overlay;

      // ── Filter input (DOM) ─────────────────────────────────
      const filterInput = document.createElement('input');
      filterInput.type = 'text';
      filterInput.placeholder = 'Filter fields...';
      filterInput.style.position = 'absolute';
      filterInput.style.left = `${overlay.boxX + 10}px`;
      filterInput.style.top = `${overlay.boxY + 44}px`;
      filterInput.style.width = `${overlay.boxWidth - 80}px`;
      filterInput.style.height = '24px';
      filterInput.style.fontSize = '13px';
      filterInput.style.padding = '2px 8px';
      filterInput.style.border = '1px solid #88ccff';
      filterInput.style.borderRadius = '4px';
      filterInput.style.backgroundColor = '#2a2a3e';
      filterInput.style.color = '#dddddd';
      filterInput.style.fontFamily = overlay.monoFont;
      filterInput.style.outline = 'none';
      document.body.appendChild(filterInput);
      state.filterInput = filterInput;
      filterInput.focus();

      filterInput.addEventListener('input', () => {
        state.filterText = filterInput.value;
        renderInspector(scene, overlay, state, overlay.boxWidth);
      });

      // ── Refresh button ─────────────────────────────────────
      const refreshBtn = scene.add.text(
        overlay.boxX + overlay.boxWidth - 90,
        overlay.boxY + 44,
        '[ Refresh ]',
        {
          fontSize: '13px',
          color: '#88ccff',
          fontFamily: 'Arial, sans-serif',
        },
      );
      refreshBtn.setDepth(overlay.depthBase + 2);
      refreshBtn.setInteractive({ useHandCursor: true });
      refreshBtn.on('pointerdown', () => {
        renderInspector(scene, overlay, state, overlay.boxWidth);
      });
      refreshBtn.on('pointerover', () => refreshBtn.setColor('#aaddff'));
      refreshBtn.on('pointerout', () => refreshBtn.setColor('#88ccff'));
      overlay.objects.push(refreshBtn);
      try {
        const hud = (scene as any).hudContainer;
        if (hud && typeof hud.add === 'function') hud.add(refreshBtn);
      } catch { /* ignore */ }

      // ── Render the initial tree ────────────────────────────
      renderInspector(scene, overlay, state, overlay.boxWidth);
    },
  };
}
