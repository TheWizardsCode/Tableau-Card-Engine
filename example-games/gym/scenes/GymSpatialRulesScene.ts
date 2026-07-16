/**
 * GymSpatialRulesScene -- Demonstrates the SpatialRules module:
 * Grid, neighbors(), shortestPath(), pathExists(), computeAdjacencyBonus().
 *
 * Features:
 *   - Configurable grid with adjustable width and height
 *   - Visual grid display with interactive click-to-select cell behaviour
 *   - neighbors() with configurable distance metric (Manhattan, Chebyshev, Euclidean)
 *   - shortestPath() between two selected cells with path highlighting
 *   - pathExists() connectivity checking
 *   - computeAdjacencyBonus() with configurable adjacency predicates
 *   - Event log for spatial query results
 *   - Toggle blocked cells for pathfinding obstacles
 *
 * @module example-games/gym/scenes/GymSpatialRulesScene
 */

import { GymSceneBase } from './GymSceneBase';
import { GYM_SPATIAL_RULES_KEY } from '../GymRegistry';
import {
  Grid,
  neighbors,
  shortestPath,
  pathExists,
  computeAdjacencyBonus,
  type Position,
  type DistanceMetric,
} from '../../../src/core-engine/SpatialRules';
import { createHudText } from '../../../src/ui/Renderer';
import { createEventLog } from '../../../src/ui/GymSceneUtils';
import type { EventLogResult } from '../../../src/ui/GymSceneUtils';

/** Default grid dimensions. */
const DEFAULT_GRID_W = 6;
const DEFAULT_GRID_H = 6;

/** Cell size in pixels for the grid visualisation. */
const CELL_SIZE = 56;
/** Gap between cells in pixels. */
const CELL_GAP = 3;

/** Start X/Y for the grid visual (top-left corner). */
const GRID_X = 40;
const GRID_Y = 220;

/** Maximum grid dimension allowed. */
const MAX_GRID_DIM = 10;

/** Cell value range for adjacency bonus demo. */
const CELL_VALUE_MIN = 1;
const CELL_VALUE_MAX = 5;

export class GymSpatialRulesScene extends GymSceneBase {
  // ── Grid model ──────────────────────────────────────────
  private grid!: Grid<number>;
  private gridWidth: number = DEFAULT_GRID_W;
  private gridHeight: number = DEFAULT_GRID_H;

  // ── Interaction state ──────────────────────────────────
  /** Position of the first selected cell (path start). */
  private selectedStart: Position | null = null;
  /** Position of the second selected cell (path goal). */
  private selectedGoal: Position | null = null;
  /** Distance metric for spatial queries. */
  private metric: DistanceMetric = 'manhattan';
  /** Whether diagonal moves are included in neighbor/path queries. */
  private includeDiagonals: boolean = true;

  // ── Visual elements ────────────────────────────────────
  /** Graphics layer for drawing the grid cells. */
  private gridGraphics!: Phaser.GameObjects.Graphics;
  /** Graphics layer for highlights (neighbors, path, etc.). */
  private highlightGraphics!: Phaser.GameObjects.Graphics;
  /** Array of cell-background rectangles for click detection. */
  private cellZones: Phaser.GameObjects.Zone[] = [];
  /** Labels showing cell values. */
  private cellLabels: Phaser.GameObjects.Text[] = [];

  // ── UI controls ────────────────────────────────────────
  private gridWidthText!: Phaser.GameObjects.Text;
  private gridHeightText!: Phaser.GameObjects.Text;
  private metricText!: Phaser.GameObjects.Text;
  private diagText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  // ── Event log ───────────────────────────────────────────
  private eventLog!: EventLogResult;
  private logLines: string[] = [];

  constructor() {
    super({ key: GYM_SPATIAL_RULES_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a2a1a');
    this.initHeader('Spatial Rules: Grid & Pathfinding');
    this.addDivider();
    this.initReducedMotion();

    // Prevent browser context menu on right-click
    this.input.mouse?.disableContextMenu();

    // ── Initialise grid ──────────────────────────────────
    this.grid = this.createFreshGrid(this.gridWidth, this.gridHeight);

    // ── Graphics layers ──────────────────────────────────
    this.gridGraphics = this.add.graphics();
    this.highlightGraphics = this.add.graphics().setDepth(10);

    // ── Controls row 1: Grid configuration ──────────────────
    let cx = 60;
    const ry = 100;

    this.addLabel(cx, ry, 'Grid:');
    cx += 50;
    this.addButton(cx, ry, '[ -W ]', () => this.adjustGridWidth(-1));
    cx += 65;
    this.gridWidthText = createHudText(this, cx, ry, `W=${this.gridWidth}`, '#ffffff', { fontSize: '14px' });
    cx += 70;
    this.addButton(cx, ry, '[ +W ]', () => this.adjustGridWidth(1));
    cx += 65;
    this.addButton(cx, ry, '[ -H ]', () => this.adjustGridHeight(-1));
    cx += 65;
    this.gridHeightText = createHudText(this, cx, ry, `H=${this.gridHeight}`, '#ffffff', { fontSize: '14px' });
    cx += 70;
    this.addButton(cx, ry, '[ +H ]', () => this.adjustGridHeight(1));
    cx += 65;
    this.addButton(cx, ry, '[ Randomise ]', () => this.randomiseGrid());

    // Controls row 2: Spatial query controls
    cx = 60;
    const ry2 = ry + 28;

    this.addButton(cx, ry2, '[ Metric: ]', () => this.cycleMetric());
    cx += 85;
    this.metricText = createHudText(this, cx, ry2, this.metric.toUpperCase(), '#ffff88', { fontSize: '14px' });
    cx += 110;
    this.addButton(cx, ry2, '[ Toggle Diag ]', () => this.toggleDiagonals());
    cx += 130;
    this.diagText = createHudText(this, cx, ry2, `Diag: ${this.includeDiagonals ? 'ON' : 'OFF'}`, '#88ff88', { fontSize: '14px' });
    cx += 120;
    this.addButton(cx, ry2, '[ Neighbors ]', () => this.demoNeighbors());
    cx += 120;
    this.addButton(cx, ry2, '[ Shortest Path ]', () => this.demoShortestPath());
    cx += 135;
    this.addButton(cx, ry2, '[ Path Exists ]', () => this.demoPathExists());
    cx += 120;
    this.addButton(cx, ry2, '[ Adj Bonus ]', () => this.demoAdjacencyBonus());

    // Controls row 3: Clear / status
    cx = 60;
    const ry3 = ry2 + 28;
    this.addButton(cx, ry3, '[ Clear Sel ]', () => this.clearSelection());
    cx += 110;
    this.addButton(cx, ry3, '[ Clear Path ]', () => this.clearHighlight());
    cx += 120;
    this.addButton(cx, ry3, '[ Reset Grid ]', () => this.resetGrid());
    cx += 120;
    this.statusText = createHudText(this, cx, ry3, 'Click a cell to select it', '#88ff88', { fontSize: '13px' });

    // ── Help panel ────────────────────────────────────────
    this.initHelp([
      {
        heading: 'Features',
        body: 'Demonstrates the SpatialRules module (Grid, neighbors(), shortestPath(), pathExists(), computeAdjacencyBonus()). Each grid cell holds a random numeric value (1–5) used by the adjacency bonus predicate. Cells can be toggled as blocked (click to toggle) to create obstacles for pathfinding.',
      },
      {
        heading: 'Controls',
        body: '[ -W ] / [ +W ]: Decrease or increase grid width (min 3, max 10).\n[ -H ] / [ +H ]: Decrease or increase grid height (min 3, max 10).\n[ Randomise ]: Randomise all cell values.\n[ Metric: ]: Cycle distance metric (Manhattan → Chebyshev → Euclidean).\n[ Toggle Diag ]: Toggle diagonal inclusion for neighbors/pathfinding.\n[ Neighbors ]: Show neighbors of the selected cell (highlighted in yellow).\n[ Shortest Path ]: Show shortest path between start (green) and goal (red) cells.\n[ Path Exists ]: Report whether a path exists between start and goal cells.\n[ Adj Bonus ]: Compute adjacency bonus for the selected cell (values matching origin get a bonus point).\n[ Clear Sel ]: Clear the selected start/goal cells.\n[ Clear Path ]: Clear all highlights.\n[ Reset Grid ]: Reset all cells to random values and clear selections.\nClick a cell: Toggle it as blocked (obstacle). Right-click a cell: Select as start (green). Ctrl+Click a cell: Select as goal (red).',
      },
      {
        heading: 'Usage Example',
        body: 'In a tableau card game like Main Street, grid-based positioning determines adjacency bonuses for cards placed next to each other. This scene validates that the SpatialRules module correctly computes neighbors, pathfinding, and adjacency bonuses for any grid configuration.'
      },
      {
        heading: 'Test Plan',
        body: '1. Click [ +W ] → grid width increases by 1\n2. Click [ -H ] → grid height decreases by 1\n3. Right-click a cell → it becomes the start cell (green highlight)\n4. Ctrl+click another cell → it becomes the goal cell (red highlight)\n5. Click [ Shortest Path ] → path is highlighted (blue) and length is logged\n6. Click a cell → it becomes blocked (dark / cross-hatched)\n7. Click [ Path Exists ] → reports whether a path is still possible\n8. Click [ Metric: ] → cycles through Manhattan, Chebyshev, Euclidean\n9. Click [ Neighbors ] → neighbor cells highlighted (yellow)\n10. Click [ Clear Path ] → all highlights removed'
      },
    ]);

    // ── Event log ──────────────────────────────────────────
    this.eventLog = createEventLog(this, 190, {
      headerText: '── Event Log ──',
      maxLines: 12,
      lineX: 420,
      lineHeight: 15,
      fontSize: '11px',
    });

    // ── Render initial grid ───────────────────────────────
    this.renderGrid();
    this.logEvent('Scene ready — click cells to interact');
  }

  // ── Grid management ──────────────────────────────────────

  /**
   * Create a fresh grid with the given dimensions, filled with random
   * values in the range [CELL_VALUE_MIN, CELL_VALUE_MAX].
   */
  private createFreshGrid(w: number, h: number): Grid<number> {
    return new Grid<number>(w, h, () =>
      Math.floor(Math.random() * (CELL_VALUE_MAX - CELL_VALUE_MIN + 1)) + CELL_VALUE_MIN,
    );
  }

  /**
   * Adjust grid width by the given delta, clamping between 3 and MAX_GRID_DIM.
   * Rebuilds the grid preserving values where possible.
   */
  private adjustGridWidth(delta: number): void {
    const newWidth = Math.max(3, Math.min(MAX_GRID_DIM, this.gridWidth + delta));
    if (newWidth === this.gridWidth) return;

    this.gridWidth = newWidth;
    this.gridWidthText.setText(`W=${this.gridWidth}`);
    this.resizeGrid();
    this.logEvent(`Grid width changed to ${this.gridWidth}`);
  }

  /**
   * Adjust grid height by the given delta, clamping between 3 and MAX_GRID_DIM.
   * Rebuilds the grid preserving values where possible.
   */
  private adjustGridHeight(delta: number): void {
    const newHeight = Math.max(3, Math.min(MAX_GRID_DIM, this.gridHeight + delta));
    if (newHeight === this.gridHeight) return;

    this.gridHeight = newHeight;
    this.gridHeightText.setText(`H=${this.gridHeight}`);
    this.resizeGrid();
    this.logEvent(`Grid height changed to ${this.gridHeight}`);
  }

  /**
   * Rebuild the grid preserving existing values within the new bounds,
   * or filling new cells with random values.
   */
  private resizeGrid(): void {
    const oldGrid = this.grid;
    this.grid = new Grid<number>(this.gridWidth, this.gridHeight, () =>
      Math.floor(Math.random() * (CELL_VALUE_MAX - CELL_VALUE_MIN + 1)) + CELL_VALUE_MIN,
    );

    // Copy existing values where possible
    for (let y = 0; y < Math.min(oldGrid.height, this.gridHeight); y++) {
      for (let x = 0; x < Math.min(oldGrid.width, this.gridWidth); x++) {
        const pos: Position = { x, y };
        const oldVal = oldGrid.get(pos);
        if (oldVal !== undefined) {
          this.grid.set(pos, oldVal);
        }
      }
    }

    this.clearSelection();
    this.renderGrid();
  }

  /** Randomise all cell values. */
  private randomiseGrid(): void {
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        const pos: Position = { x, y };
        this.grid.set(
          pos,
          Math.floor(Math.random() * (CELL_VALUE_MAX - CELL_VALUE_MIN + 1)) + CELL_VALUE_MIN,
        );
      }
    }

    this.renderGrid();
    this.logEvent('Cell values randomised');
  }

  /** Reset grid to fresh random values and clear all state. */
  private resetGrid(): void {
    this.grid = this.createFreshGrid(this.gridWidth, this.gridHeight);
    this.clearSelection();
    this.renderGrid();
    this.logEvent('Grid reset to fresh random values');
  }

  // ── Selection management ─────────────────────────────────

  /** Clear start/goal selection and all highlights. */
  private clearSelection(): void {
    this.selectedStart = null;
    this.selectedGoal = null;
    this.statusText.setText('Click a cell to select it');
    this.renderGrid();
  }

  /** Clear all highlights only, keeping selection. */
  private clearHighlight(): void {
    this.highlightGraphics.clear();
    this.renderGrid();
    this.logEvent('Highlights cleared');
  }

  // ── Metric / diagonal toggles ────────────────────────────

  /** Cycle through distance metrics: manhattan → chebyshev → euclidean. */
  private cycleMetric(): void {
    const metrics: DistanceMetric[] = ['manhattan', 'chebyshev', 'euclidean'];
    const idx = metrics.indexOf(this.metric);
    this.metric = metrics[(idx + 1) % metrics.length];
    this.metricText.setText(this.metric.toUpperCase());
    this.logEvent(`Distance metric changed to ${this.metric}`);
  }

  /** Toggle diagonal inclusion for neighbor/path queries. */
  private toggleDiagonals(): void {
    this.includeDiagonals = !this.includeDiagonals;
    this.diagText.setText(`Diag: ${this.includeDiagonals ? 'ON' : 'OFF'}`);
    this.logEvent(`Diagonals ${this.includeDiagonals ? 'enabled' : 'disabled'}`);
  }

  // ── Spatial query demos ──────────────────────────────────

  /** Demonstrate neighbors() for the selected start cell. */
  private demoNeighbors(): void {
    if (!this.selectedStart) {
      this.logEvent('Select a cell first (left-click a cell to select as start)');
      return;
    }

    const neighborPositions = neighbors(this.grid, this.selectedStart, {
      metric: this.metric,
      includeDiagonals: this.includeDiagonals,
      range: 1,
    });

    this.renderGrid();
    this.highlightGraphics.clear();

    // Draw neighbor highlights in yellow
    for (const pos of neighborPositions) {
      this.highlightNeighborCell(pos, 0xffff44, 0.5);
    }

    // Also highlight the origin cell in green
    this.highlightOriginCell(this.selectedStart, 0x44ff44, 0.4);

    this.logEvent(
      `Neighbors of (${this.selectedStart.x},${this.selectedStart.y})` +
      ` [${this.metric}, diag=${this.includeDiagonals}]: ${neighborPositions.length} cells found`,
    );
  }

  /** Demonstrate shortestPath() between start and goal cells. */
  private demoShortestPath(): void {
    if (!this.selectedStart || !this.selectedGoal) {
      this.logEvent('Select start and goal cells (right-click start, Ctrl+click goal)');
      return;
    }

    const path = shortestPath(this.grid, this.selectedStart, this.selectedGoal, {
      metric: this.metric,
      includeDiagonals: this.includeDiagonals,
      blocked: (pos) => {
        const val = this.grid.get(pos);
        return val !== undefined && val < 0;
      },
    });

    this.highlightGraphics.clear();
    this.renderGrid();

    if (path) {
      // Highlight path in blue
      for (const pos of path) {
        // Skip start and goal (they get different colors)
        if (
          (pos.x === this.selectedStart.x && pos.y === this.selectedStart.y) ||
          (pos.x === this.selectedGoal.x && pos.y === this.selectedGoal.y)
        ) {
          continue;
        }
        this.highlightNeighborCell(pos, 0x4488ff, 0.6);
      }

      // Highlight start in green, goal in red
      this.highlightOriginCell(this.selectedStart, 0x44ff44, 0.5);
      this.highlightOriginCell(this.selectedGoal, 0xff4444, 0.5);

      this.logEvent(
        `Shortest path from (${this.selectedStart.x},${this.selectedStart.y})` +
        ` to (${this.selectedGoal.x},${this.selectedGoal.y}): ${path.length} steps`,
      );
    } else {
      this.logEvent(
        `No path found from (${this.selectedStart.x},${this.selectedStart.y})` +
        ` to (${this.selectedGoal.x},${this.selectedGoal.y})`,
      );
    }
  }

  /** Demonstrate pathExists() between start and goal cells. */
  private demoPathExists(): void {
    if (!this.selectedStart || !this.selectedGoal) {
      this.logEvent('Select start and goal cells first');
      return;
    }

    const exists = pathExists(this.grid, this.selectedStart, this.selectedGoal, {
      metric: this.metric,
      includeDiagonals: this.includeDiagonals,
      blocked: (pos) => {
        const val = this.grid.get(pos);
        return val !== undefined && val < 0;
      },
    });

    this.logEvent(
      `pathExists from (${this.selectedStart.x},${this.selectedStart.y})` +
      ` to (${this.selectedGoal.x},${this.selectedGoal.y}): ${exists}`,
    );

    this.statusText.setText(`Path exists: ${exists}`);
    this.statusText.setColor(exists ? '#88ff88' : '#ff8888');
  }

  /** Demonstrate computeAdjacencyBonus() for the selected cell. */
  private demoAdjacencyBonus(): void {
    if (!this.selectedStart) {
      this.logEvent('Select a cell first');
      return;
    }

    const bonus = computeAdjacencyBonus(
      this.grid,
      this.selectedStart,
      (originVal, neighborVal) => {
        // Simple predicate: bonus when neighbor value >= origin value
        return originVal !== undefined && neighborVal !== undefined && neighborVal >= originVal;
      },
      {
        metric: this.metric,
        includeDiagonals: this.includeDiagonals,
        bonusPerMatch: 1,
      },
    );

    const originVal = this.grid.get(this.selectedStart);
    this.logEvent(
      `Adjacency bonus at (${this.selectedStart.x},${this.selectedStart.y})` +
      ` [value=${originVal}]: ${bonus} neighbors with value >= ${originVal}`,
    );

    // Highlight adjacent cells that contributed
    this.renderGrid();
    this.highlightGraphics.clear();

    const neighborPositions = neighbors(this.grid, this.selectedStart, {
      metric: this.metric,
      includeDiagonals: this.includeDiagonals,
      range: 1,
    });

    for (const pos of neighborPositions) {
      const nVal = this.grid.get(pos);
      if (nVal !== undefined && originVal !== undefined && nVal >= originVal) {
        this.highlightNeighborCell(pos, 0x44ff88, 0.5);
      } else {
        this.highlightNeighborCell(pos, 0x888888, 0.3);
      }
    }

    this.highlightOriginCell(this.selectedStart, 0xffff44, 0.5);
  }

  // ── Rendering ────────────────────────────────────────────

  /**
   * Render the full grid with cell values, colors, and click zones.
   */
  private renderGrid(): void {
    this.gridGraphics.clear();
    this.destroyCellZones();
    this.cellZones = [];
    this.cellLabels = [];

    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        const pos: Position = { x, y };
        const value = this.grid.get(pos) ?? 0;
        const px = GRID_X + x * (CELL_SIZE + CELL_GAP);
        const py = GRID_Y + y * (CELL_SIZE + CELL_GAP);

        // Determine cell color based on value and block state
        const isBlocked = value < 0;
        const isStart = this.selectedStart && this.selectedStart.x === x && this.selectedStart.y === y;
        const isGoal = this.selectedGoal && this.selectedGoal.x === x && this.selectedGoal.y === y;

        let fillColor: number;
        if (isBlocked) {
          fillColor = 0x553333;
        } else if (isStart) {
          fillColor = 0x336633;
        } else if (isGoal) {
          fillColor = 0x663333;
        } else {
          // Gradient based on value
          const intensity = 0.3 + (value / CELL_VALUE_MAX) * 0.5;
          const r = Math.floor(30 * intensity);
          const g = Math.floor(100 * intensity);
          const b = Math.floor(60 * intensity);
          fillColor = (r << 16) | (g << 8) | b;
        }

        // Draw cell background
        this.gridGraphics.fillStyle(fillColor, 1);
        this.gridGraphics.fillRoundedRect(px, py, CELL_SIZE, CELL_SIZE, 4);

        // Draw cell border
        const borderColor = isStart ? 0x44ff44 : isGoal ? 0xff4444 : 0x445544;
        this.gridGraphics.lineStyle(isStart || isGoal ? 3 : 1, borderColor, 0.8);
        this.gridGraphics.strokeRoundedRect(px, py, CELL_SIZE, CELL_SIZE, 4);

        // Draw X for blocked cells
        if (isBlocked) {
          this.gridGraphics.lineStyle(2, 0xff6666, 0.8);
          this.gridGraphics.beginPath();
          this.gridGraphics.moveTo(px + 6, py + 6);
          this.gridGraphics.lineTo(px + CELL_SIZE - 6, py + CELL_SIZE - 6);
          this.gridGraphics.strokePath();
          this.gridGraphics.beginPath();
          this.gridGraphics.moveTo(px + CELL_SIZE - 6, py + 6);
          this.gridGraphics.lineTo(px + 6, py + CELL_SIZE - 6);
          this.gridGraphics.strokePath();
        }

        // Cell value label
        const label = createHudText(
          this,
          px + CELL_SIZE / 2,
          py + CELL_SIZE / 2,
          String(value),
          isBlocked ? '#ff8888' : '#ccffcc',
          { fontSize: '16px' },
        ).setOrigin(0.5);
        this.cellLabels.push(label);

        // Click zone for interaction
        const zone = this.add.zone(px + CELL_SIZE / 2, py + CELL_SIZE / 2, CELL_SIZE, CELL_SIZE)
          .setInteractive({ useHandCursor: true });

        zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          if (pointer.rightButtonDown()) {
            // Right-click: set as start
            this.handleCellRightClick(x, y);
          } else if (pointer.leftButtonDown() && pointer.event?.shiftKey) {
            // Shift+click: set as goal
            this.setGoal(x, y);
          } else if (pointer.leftButtonDown()) {
            // Left-click: toggle blocked state
            this.handleCellClick(x, y);
          }
        });

        this.cellZones.push(zone);
      }
    }
  }

  /**
   * Apply right-click context: set start cell.
   */
  private handleCellRightClick(x: number, y: number): void {
    this.selectedStart = { x, y };
    this.renderGrid();
    this.highlightGraphics.clear();
    this.logEvent(`Start cell set to (${x},${y}) — value=${this.grid.get({ x, y })}`);
    this.statusText.setText(`Start: (${x},${y}) — now select goal (Shift+click) or run a query`);
  }

  /**
   * Handle left-click on a cell: toggle blocked state.
   */
  private handleCellClick(x: number, y: number): void {
    const pos: Position = { x, y };
    const currentVal = this.grid.get(pos);

    if (currentVal === undefined) return;

    if (currentVal < 0) {
      // Unblock: restore a random positive value
      this.grid.set(pos, Math.floor(Math.random() * (CELL_VALUE_MAX - CELL_VALUE_MIN + 1)) + CELL_VALUE_MIN);
      this.logEvent(`Cell (${x},${y}) unblocked`);
    } else {
      // Block: set negative value
      this.grid.set(pos, -1);
      this.logEvent(`Cell (${x},${y}) blocked — obstacles created for pathfinding`);
    }

    this.renderGrid();
    this.highlightGraphics.clear();
  }

  /**
   * Set the goal cell at the given position.
   */
  private setGoal(x: number, y: number): void {
    this.selectedGoal = { x, y };
    this.renderGrid();
    this.highlightGraphics.clear();
    this.logEvent(`Goal cell set to (${x},${y}) — value=${this.grid.get({ x, y })}`);
    this.statusText.setText(`Goal: (${x},${y}) — run Shortest Path or Path Exists`);
  }

  // ── Highlight helpers ────────────────────────────────────

  /**
   * Draw a semi-transparent highlight on a neighbor cell.
   */
  private highlightNeighborCell(pos: Position, color: number, alpha: number): void {
    const px = GRID_X + pos.x * (CELL_SIZE + CELL_GAP);
    const py = GRID_Y + pos.y * (CELL_SIZE + CELL_GAP);
    this.highlightGraphics.fillStyle(color, alpha);
    this.highlightGraphics.fillRoundedRect(px, py, CELL_SIZE, CELL_SIZE, 4);
  }

  /**
   * Draw an origin cell highlight (brighter, with a border glow).
   */
  private highlightOriginCell(pos: Position, color: number, alpha: number): void {
    const px = GRID_X + pos.x * (CELL_SIZE + CELL_GAP);
    const py = GRID_Y + pos.y * (CELL_SIZE + CELL_GAP);
    this.highlightGraphics.fillStyle(color, alpha);
    this.highlightGraphics.fillRoundedRect(px, py, CELL_SIZE, CELL_SIZE, 4);
    this.highlightGraphics.lineStyle(3, color, 0.9);
    this.highlightGraphics.strokeRoundedRect(px, py, CELL_SIZE, CELL_SIZE, 4);
  }

  // ── Lifecycle ─────────────────────────────────────────────

  /**
   * Destroy all cell zone and label objects.
   */
  private destroyCellZones(): void {
    for (const zone of this.cellZones) {
      try { zone.destroy(); } catch (_) { /* ignore */ }
    }
    this.cellZones = [];

    for (const label of this.cellLabels) {
      try { label.destroy(); } catch (_) { /* ignore */ }
    }
    this.cellLabels = [];
  }

  /**
   * Clean up all scene-created objects.
   */
  shutdown(): void {
    this.destroyCellZones();
    try { this.gridGraphics?.destroy(); } catch (_) { /* ignore */ }
    try { this.highlightGraphics?.destroy(); } catch (_) { /* ignore */ }
    try { this.eventLog?.destroy(); } catch (_) { /* ignore */ }

    // Clear text references
    this.gridWidthText = undefined as unknown as Phaser.GameObjects.Text;
    this.gridHeightText = undefined as unknown as Phaser.GameObjects.Text;
    this.metricText = undefined as unknown as Phaser.GameObjects.Text;
    this.diagText = undefined as unknown as Phaser.GameObjects.Text;
    this.statusText = undefined as unknown as Phaser.GameObjects.Text;
    this.logLines = [];

    this.events.off('shutdown', this.shutdown, this);
  }

  // ── Event log ─────────────────────────────────────────────

  /**
   * Add a message to the event log and re-render.
   */
  private logEvent(msg: string): void {
    this.logLines.push(msg);
    if (this.logLines.length > 50) {
      this.logLines.splice(0, this.logLines.length - 50);
    }
    this.eventLog.render(this.logLines);
  }
}
