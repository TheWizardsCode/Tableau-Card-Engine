/**
 * MarketCardCheatOverlay — Dev-mode debug tool that lets testers replace
 * a random market card with any card from the Main Street pool.
 *
 * Groups all 5 families, provides type checkboxes + case-insensitive title
 * search (compose as type ∩ text), keyboard nav (arrows + Enter), mouse
 * click to select+confirm, and a market-replacement helper that routes
 * the displaced card to its family's discard pile and re-renders the row.
 *
 * @module @ui/debug/MarketCardCheatOverlay
 */

import type Phaser from 'phaser';
import type { DebugToolsEntry } from './DebugToolsRegistry';
import { createOverlayDialog, type OverlayDialogHandle } from '../Overlay';
import {
  getBusinessTemplates,
  getCommunitySpaceTemplates,
  getEventTemplates,
  getUpgradeTemplates,
  getStaffCardTemplates,
  type BusinessCard,
  type CommunitySpaceCard,
  type EventCard,
  type UpgradeCard,
  type StaffCard,
} from '../../../example-games/main-street/MainStreetCards';
import type { MainStreetState } from '../../../example-games/main-street/MainStreetState';
import { cheatReplaceMarketCard } from '../../../example-games/main-street/MainStreetMarket';

// ── Types ───────────────────────────────────────────────────

export interface CardEntry {
  label: string;
  family: string;
  template: BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard | StaffCard;
}

interface CheatPickerState {
  filterText: string;
  selectedFamilies: Set<string>;
  highlightedIndex: number;
  entries: CardEntry[];
  filterInput: HTMLInputElement | null;
}

let activeOverlay: OverlayDialogHandle | null = null;
let activeState: CheatPickerState | null = null;

// ── Constants ───────────────────────────────────────────────

const BOX_WIDTH = 720;
const BOX_HEIGHT = 520;
const HEADER_HEIGHT = 70;

const FAMILIES: { id: string; label: string }[] = [
  { id: 'business', label: 'Business' },
  { id: 'community-space', label: 'Community Space' },
  { id: 'event', label: 'Event' },
  { id: 'upgrade', label: 'Upgrade' },
  { id: 'staff', label: 'Staff' },
];

// ── Card collection helpers ─────────────────────────────────

function buildCardEntries(): CardEntry[] {
  const entries: CardEntry[] = [];
  for (const t of getBusinessTemplates()) {
    entries.push({ label: t.name, family: 'business', template: { ...t } as BusinessCard });
  }
  for (const t of getCommunitySpaceTemplates()) {
    entries.push({ label: t.name, family: 'community-space', template: { ...t } as CommunitySpaceCard });
  }
  for (const t of getEventTemplates()) {
    entries.push({ label: t.name, family: 'event', template: { ...t } as EventCard });
  }
  for (const t of getUpgradeTemplates()) {
    entries.push({ label: t.name, family: 'upgrade', template: { ...t } as UpgradeCard });
  }
  for (const t of getStaffCardTemplates()) {
    entries.push({ label: t.name, family: 'staff', template: { ...t } as StaffCard });
  }
  return entries;
}

export function filterEntries(
  allEntries: CardEntry[],
  filterText: string,
  selectedFamilies: Set<string>,
): CardEntry[] {
  const normalized = filterText.trim().toLowerCase();
  return allEntries.filter((entry) => {
    if (selectedFamilies.size > 0 && !selectedFamilies.has(entry.family)) return false;
    if (normalized && !entry.label.toLowerCase().includes(normalized)) return false;
    return true;
  });
}

// ── Market replacement (re-exported helper) ─────────────────

/**
 * Replace a uniformly-random slot from `state.market.cards` with a shallow
 * copy of the chosen template (unique id `${templateId}--cheat-${nonce}`),
 * push the displaced card to its family's discard pile, and return it.
 * Delegates to `cheatReplaceMarketCard` in MainStreetMarket for testability.
 */
export function replaceMarketCard(
  state: MainStreetState,
  entry: CardEntry,
  rng?: () => number,
): BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard | StaffCard | null {
  return cheatReplaceMarketCard(state, entry.template as any, entry.family, rng);
}

// ── Rendering ───────────────────────────────────────────────

function getFamilyColor(family: string): string {
  switch (family) {
    case 'business': return '#8fbc8f';
    case 'community-space': return '#87ceeb';
    case 'event': return '#dda0dd';
    case 'upgrade': return '#f0c040';
    case 'staff': return '#cd853f';
    default: return '#aaaaaa';
  }
}

function showStatus(overlay: OverlayDialogHandle, message: string): void {
  const statusText = (overlay.scrollContainer as any)._statusText as Phaser.GameObjects.Text | undefined;
  if (statusText) statusText.setText(message);
}

function handleReplace(
  scene: Phaser.Scene,
  overlay: OverlayDialogHandle,
  state: CheatPickerState,
  filtered: CardEntry[],
): void {
  if (filtered.length === 0 || state.highlightedIndex < 0 || state.highlightedIndex >= filtered.length) {
    showStatus(overlay, 'No card selected.');
    return;
  }
  const entry = filtered[state.highlightedIndex];
  const msScene = scene as any;
  const mainStreetState: MainStreetState | undefined = msScene.state;
  if (!mainStreetState || !mainStreetState.market || !Array.isArray(mainStreetState.market.cards)) {
    showStatus(overlay, 'No Main Street state found on scene.');
    return;
  }
  if (mainStreetState.market.cards.length === 0) {
    showStatus(overlay, 'Market is empty — nothing to replace.');
    return;
  }
  const rng = mainStreetState.rng ?? undefined;
  const displaced = replaceMarketCard(mainStreetState, entry, rng);
  const displacedName = displaced ? (displaced as any).name ?? displaced.id : '(empty slot)';
  showStatus(overlay, `Replaced ${displacedName} with ${entry.label}.`);
  // Re-render the market row via existing renderer path
  try {
    if (typeof msScene.refreshMarket === 'function') msScene.refreshMarket();
    else if (msScene.msRenderer && typeof msScene.msRenderer.refreshMarket === 'function') msScene.msRenderer.refreshMarket();
    else if (typeof msScene.refreshAll === 'function') msScene.refreshAll();
  } catch { /* ignore */ }
}

function renderPicker(
  scene: Phaser.Scene,
  overlay: OverlayDialogHandle,
  state: CheatPickerState,
): void {
  overlay.scrollContainer.removeAll(true);

  const filtered = filterEntries(state.entries, state.filterText, state.selectedFamilies);
  // Clamp highlight
  if (filtered.length === 0) state.highlightedIndex = -1;
  else state.highlightedIndex = Math.max(0, Math.min(state.highlightedIndex, filtered.length - 1));

  const contentWidth = overlay.contentWidth;

  // ── Family checkboxes row ──────────────────────────────
  let familyX = 0;
  for (let i = 0; i < FAMILIES.length; i++) {
    const fam = FAMILIES[i];
    const isActive = state.selectedFamilies.has(fam.id);
    const box = isActive ? '[x]' : '[ ]';
    const color = isActive ? '#f0c040' : '#aaaaaa';
    const familyText = scene.add.text(familyX, 0, `${box} ${fam.label}`, {
      fontSize: '12px',
      color,
      fontFamily: 'Arial, sans-serif',
      fontStyle: isActive ? 'bold' : 'normal',
    });
    familyText.setDepth(overlay.depthBase + 2);
    familyText.setInteractive({ useHandCursor: true });
    familyText.on('pointerdown', () => {
      if (state.selectedFamilies.has(fam.id)) state.selectedFamilies.delete(fam.id);
      else state.selectedFamilies.add(fam.id);
      state.highlightedIndex = 0;
      renderPicker(scene, overlay, state);
    });
    overlay.scrollContainer.add(familyText);
    familyX += (familyText.width as number) + 10;
    // Wrap if overflow
    if (familyX > contentWidth - 80 && i < FAMILIES.length - 1) {
      // Simple wrap not needed for 5 families at 720px, but keep safe
    }
  }

  // ── Divider line ───────────────────────────────────────
  const divider = scene.add.rectangle(contentWidth / 2, 20, contentWidth - 10, 1, 0x444444);
  divider.setDepth(overlay.depthBase + 2);
  overlay.scrollContainer.add(divider);

  // ── Card list ──────────────────────────────────────────
  let listY = 28;
  if (filtered.length === 0) {
    const empty = scene.add.text(10, listY, '(no cards match filters)', {
      fontSize: '13px',
      color: '#888888',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'italic',
    });
    empty.setDepth(overlay.depthBase + 2);
    overlay.scrollContainer.add(empty);
    listY += 22;
  } else {
    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i];
      const isHighlighted = i === state.highlightedIndex;
      const prefix = isHighlighted ? '▶ ' : '  ';
      const cardText = scene.add.text(10, listY, `${prefix}${entry.label}`, {
        fontSize: '13px',
        color: isHighlighted ? '#f0c040' : '#dddddd',
        fontFamily: overlay.monoFont,
      });
      cardText.setDepth(overlay.depthBase + 2);
      cardText.setInteractive({ useHandCursor: true });
      cardText.on('pointerdown', () => {
        state.highlightedIndex = i;
        // Click selects AND confirms per AC
        handleReplace(scene, overlay, state, filtered);
        // Re-render to reflect highlight + status update
        renderPicker(scene, overlay, state);
        // Restore status after re-render (which clears it)
        // handleReplace already set status; re-apply after render
        const entry2 = filtered[i];
        showStatus(overlay, `Replaced with ${entry2.label}.`);
      });
      overlay.scrollContainer.add(cardText);

      const badge = scene.add.text(contentWidth - 6, listY, entry.family.toUpperCase(), {
        fontSize: '10px',
        color: getFamilyColor(entry.family),
        fontFamily: 'Arial, sans-serif',
      });
      badge.setOrigin(1, 0);
      badge.setDepth(overlay.depthBase + 2);
      overlay.scrollContainer.add(badge);

      listY += 20;
    }
  }

  // ── Replace button ─────────────────────────────────────
  const btnY = listY + 10;
  const replaceBtn = scene.add.text(contentWidth / 2, btnY, '[ Replace Market Slot ]', {
    fontSize: '14px',
    color: filtered.length === 0 ? '#555555' : '#88ccff',
    fontFamily: 'Arial, sans-serif',
  });
  replaceBtn.setOrigin(0.5, 0);
  replaceBtn.setDepth(overlay.depthBase + 2);
  if (filtered.length > 0) {
    replaceBtn.setInteractive({ useHandCursor: true });
    replaceBtn.on('pointerdown', () => {
      handleReplace(scene, overlay, state, filtered);
      renderPicker(scene, overlay, state);
    });
    replaceBtn.on('pointerover', () => replaceBtn.setColor('#aaddff'));
    replaceBtn.on('pointerout', () => replaceBtn.setColor('#88ccff'));
  }
  overlay.scrollContainer.add(replaceBtn);

  // ── Status text ────────────────────────────────────────
  const statusText = scene.add.text(10, btnY + 26, '', {
    fontSize: '12px',
    color: '#aaaaaa',
    fontFamily: 'Arial, sans-serif',
  });
  statusText.setDepth(overlay.depthBase + 2);
  overlay.scrollContainer.add(statusText);
  (overlay.scrollContainer as any)._statusText = statusText;

  const totalHeight = btnY + 50;
  overlay.refresh(totalHeight);
}

// ── DOM filter input ───────────────────────────────────────

function createFilterInput(
  scene: Phaser.Scene,
  overlay: OverlayDialogHandle,
  state: CheatPickerState,
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Filter by title...';
  input.setAttribute('aria-label', 'Filter cards by title');
  input.style.position = 'absolute';
  input.style.left = `${overlay.boxX + 10}px`;
  input.style.top = `${overlay.boxY + 46}px`;
  input.style.width = `${overlay.boxWidth - 180}px`;
  input.style.height = '24px';
  input.style.fontSize = '13px';
  input.style.padding = '2px 8px';
  input.style.border = '1px solid #88ccff';
  input.style.borderRadius = '4px';
  input.style.backgroundColor = '#2a2a3e';
  input.style.color = '#dddddd';
  input.style.fontFamily = 'Arial, sans-serif';
  input.style.outline = 'none';
  input.style.zIndex = '10000';
  document.body.appendChild(input);

  input.addEventListener('input', () => {
    state.filterText = input.value;
    state.highlightedIndex = 0;
    renderPicker(scene, overlay, state);
  });

  input.addEventListener('keydown', (ev: KeyboardEvent) => {
    const filtered = filterEntries(state.entries, state.filterText, state.selectedFamilies);
    switch (ev.key) {
      case 'ArrowDown':
        ev.preventDefault();
        if (filtered.length > 0) {
          state.highlightedIndex = Math.min(state.highlightedIndex + 1, filtered.length - 1);
          if (state.highlightedIndex < 0) state.highlightedIndex = 0;
          renderPicker(scene, overlay, state);
        }
        break;
      case 'ArrowUp':
        ev.preventDefault();
        if (filtered.length > 0) {
          state.highlightedIndex = Math.max(state.highlightedIndex - 1, 0);
          renderPicker(scene, overlay, state);
        }
        break;
      case 'Enter':
        ev.preventDefault();
        if (state.highlightedIndex >= 0 && state.highlightedIndex < filtered.length) {
          handleReplace(scene, overlay, state, filtered);
          renderPicker(scene, overlay, state);
        }
        break;
      case 'Escape':
        ev.preventDefault();
        closeActiveOverlay();
        break;
    }
  });

  return input;
}

// ── Overlay lifecycle ───────────────────────────────────────

function closeActiveOverlay(): void {
  if (activeOverlay) {
    activeOverlay.close();
    if (activeState?.filterInput) {
      try { activeState.filterInput.remove(); } catch { /* ignore */ }
    }
    activeOverlay = null;
    activeState = null;
  }
}

// ── Factory ─────────────────────────────────────────────────

/**
 * Create a debug tool entry for the Market Card Cheat picker.
 * Label/description must match AC exactly.
 */
export function createMarketCardCheatTool(): DebugToolsEntry {
  return {
    label: 'Market Card Cheat',
    description: 'Replace a random market card with any card from the pool',
    activate: (scene: Phaser.Scene) => {
      closeActiveOverlay();

      const allEntries = buildCardEntries();

      const state: CheatPickerState = {
        filterText: '',
        selectedFamilies: new Set<string>(),
        highlightedIndex: 0,
        entries: allEntries,
        filterInput: null,
      };
      activeState = state;

      const overlay = createOverlayDialog(scene, {
        title: 'Market Card Cheat',
        width: BOX_WIDTH,
        height: BOX_HEIGHT,
        headerHeight: HEADER_HEIGHT,
        boxColor: 0x1a1a2e,
        onClose: () => {
          if (state.filterInput) {
            try { state.filterInput.remove(); } catch { /* ignore */ }
          }
          activeOverlay = null;
          activeState = null;
        },
      });
      activeOverlay = overlay;

      const filterInput = createFilterInput(scene, overlay, state);
      state.filterInput = filterInput;
      // Focus after layout
      setTimeout(() => { try { filterInput.focus(); } catch { /* ignore */ } }, 0);

      renderPicker(scene, overlay, state);
    },
  };
}
