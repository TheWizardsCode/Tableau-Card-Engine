/**
 * GymLongErasureScene -- the playable face of *The Long Erasure*.
 *
 * A three-act branching narrative laid out entirely through the Screen Layout
 * Language (`layouts/gym-long-erasure.layout.json`, every position resolved via
 * `anchorPoint()`) and wired to the shared audio feedback stack.
 *
 * ## The scene is a renderer
 *
 * Every rule of the run — the pressure clock, act gating, affordability
 * filtering, successor drawing, the journal and the journey score — lives in
 * the Phaser-free `../GymLongErasureGame` module. This scene holds a
 * `LongErasureState`, draws it, and forwards the player's choice back to
 * `chooseOption()`. It never re-derives an outcome, so the headless unit suite
 * remains the sole owner of the narrative rules.
 *
 * ## Feedback contract
 *
 * Every state change is textual **and** animated/audible where appropriate:
 *
 * - A resolved choice rewrites the act/clock/resource/beat panels, appends the
 *   journal row and writes a "you chose …" feedback line, plays
 *   `COMMON_SFX_KEYS.CARD_SWAP` and (when the act turns over)
 *   `COMMON_SFX_KEYS.TURN_CHANGE`.
 * - Reaching an ending reveals the scored epilogue, plays
 *   `COMMON_SFX_KEYS.ROUND_END` + `COMMON_SFX_KEYS.SCORE_REVEAL` and pops the
 *   score above the ending title.
 * - A refused choice (a stale button, or a click after the run ended) writes
 *   the module's own refusal reason, plays `COMMON_SFX_KEYS.ILLEGAL_MOVE` and
 *   renders the shared reason toast via `shakeIllegalMove`.
 * - `[ Begin a new survey ]` resets and plays `COMMON_SFX_KEYS.UI_CLICK`.
 *
 * Reduced motion is honoured throughout: SFX are suppressed (the project-wide
 * reduced-motion contract), the score pop is instant, and no tween is created.
 * The textual channel is never suppressed, so nothing is feedback-free.
 *
 * ## IP
 *
 * The Long Erasure is an original setting. No third-party franchise character,
 * race, ship class, faction, technology name or episode title appears in the
 * content, and no plot beats, dialogue or character beats are lifted; the
 * history-editing-weapon trope is used at trope level only. The prohibited-term
 * constraint is checked mechanically (see `tests/gym/LongErasureContent.test.ts`)
 * and stated in the scene help text.
 *
 * @module example-games/gym/scenes/GymLongErasureScene
 */

import Phaser from 'phaser';
import { GymSceneBase } from './GymSceneBase';
import { GYM_LONG_ERASURE_KEY } from '../GymRegistry';
import { DEFAULT_VIEWPORT } from './GymConstants';
import { createHudText } from '../../../src/ui/Renderer';
import { GAME_W, GAME_H } from '../../../src/ui/constants';
import { anchorPoint } from '../../../src/ui/screen-layout';
import {
  parseScreenLayoutDocument,
  type PixelPoint,
  type ScreenLayoutDocument,
} from '../../../src/ui/screen-layout-schema';
import { shakeIllegalMove } from '../../../src/ui/shakeIllegalMove';
import { popTextOrIcon } from '../../../src/ui/popTextOrIcon';
import { COMMON_SFX_KEYS, SoundManager } from '../../../src/core-engine';
import type { CommonSfxKey, SoundPlayer } from '../../../src/core-engine';
import gymLongErasureLayoutJson from '../layouts/gym-long-erasure.layout.json';
import longErasureCsv from '../content/long-erasure.csv?raw';
import {
  LongErasureError,
  availableOptions,
  buildEpilogue,
  chooseOption,
  createLongErasureRun,
  isComplete,
  longErasureContentFromCsv,
  runJournal,
  LONG_ERASURE_ACTS,
  type LongErasureContent,
  type LongErasureEpilogue,
  type LongErasureOutcome,
  type LongErasureState,
} from '../GymLongErasureGame';

/** Deterministic seed used by every run started from this scene. */
export const LONG_ERASURE_SCENE_SEED = 20261119;

/** The layout anchors the option/epilogue area renders into, in order. */
export const OPTION_ANCHORS = ['option1', 'option2', 'option3', 'option4'] as const;

/** SFX keys this scene drives through `SoundManager`. */
export const LONG_ERASURE_SFX_KEYS: readonly CommonSfxKey[] = [
  COMMON_SFX_KEYS.UI_CLICK,
  COMMON_SFX_KEYS.CARD_SWAP,
  COMMON_SFX_KEYS.TURN_CHANGE,
  COMMON_SFX_KEYS.ILLEGAL_MOVE,
  COMMON_SFX_KEYS.ROUND_END,
  COMMON_SFX_KEYS.SCORE_REVEAL,
];

/** Journal rows shown while playing, and on the closing screen. */
const JOURNAL_PLAY_ROWS = 5;
const JOURNAL_CLOSING_ROWS = 6;

/** Parsed SLL document for this scene's layout (parsed once at module load). */
const LONG_ERASURE_LAYOUT: ScreenLayoutDocument | null = (() => {
  const parsed = parseScreenLayoutDocument(gymLongErasureLayoutJson);
  return parsed.valid ? parsed.layout : null;
})();

/**
 * Resolve an SLL anchor to pixels.
 *
 * The layout is committed and pinned by `tests/gym/GymLongErasureLayout.test.ts`,
 * so the centre fallback is defensive only (it never positions chrome in a
 * working build; it exists so a corrupt layout degrades instead of throwing).
 */
function resolveAnchor(zone: string, anchor: string): PixelPoint {
  if (!LONG_ERASURE_LAYOUT) return { x: GAME_W / 2, y: GAME_H / 2 };
  return anchorPoint(LONG_ERASURE_LAYOUT, zone, anchor, DEFAULT_VIEWPORT, 1);
}

/** The authored content, parsed once from the committed CSV. */
let cachedContent: LongErasureContent | null = null;

/**
 * The content this scene plays (parsed from `content/long-erasure.csv`, the
 * same file the content toolchain validates).
 */
export function longErasureSceneContent(): LongErasureContent {
  if (cachedContent === null) {
    cachedContent = longErasureContentFromCsv(longErasureCsv);
  }
  return cachedContent;
}

/** Capitalise a declared resource key for display (`goodwill` → `Goodwill`). */
function resourceLabel(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** The signed cost / benefit hint rendered beside an option label. */
function optionHint(
  cost: Readonly<Partial<Record<string, number>>> | undefined,
  extra: Readonly<Partial<Record<string, number>>> | undefined,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(cost ?? {})) {
    if (typeof value === 'number' && value !== 0) parts.push(`${key} −${value}`);
  }
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (typeof value === 'number' && value !== 0) {
      parts.push(`${key} ${value > 0 ? '+' : '−'}${Math.abs(value)}`);
    }
  }
  return parts.length > 0 ? `  (${parts.join(', ')})` : '';
}

/** The player-facing framing line for a run's outcome. */
function outcomeFraming(outcome: LongErasureOutcome | null): string {
  switch (outcome) {
    case 'reset':
      return 'The timeline was unwound. This record is the voyage that survives.';
    case 'expired':
      return 'The clock ran out before the next beat could be played.';
    case 'closed':
      return 'The voyage ended where you left it.';
    default:
      return 'The voyage is still under way.';
  }
}

export class GymLongErasureScene extends GymSceneBase {
  /** The run currently on screen (owned by the Phaser-free module). */
  private run!: LongErasureState;

  /** Audio backend wrapper (null in a headless environment with no sound). */
  private soundManager: SoundManager | null = null;

  /** SFX keys the scene has played, oldest first (observable for tests). */
  private readonly playedSfxKeys: string[] = [];

  /** Option / epilogue line objects for the current beat (rebuilt each render). */
  private optionTexts: Phaser.GameObjects.Text[] = [];

  // ── Rendered chrome (all positioned through SLL anchors) ──
  private actText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private resourcesText!: Phaser.GameObjects.Text;
  private beatText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private effectText!: Phaser.GameObjects.Text;
  private feedbackText!: Phaser.GameObjects.Text;
  private journalHeading!: Phaser.GameObjects.Text;
  private journalBody!: Phaser.GameObjects.Text;
  private restartButton!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: GYM_LONG_ERASURE_KEY });
  }

  preload(): void {
    // `sfx-<name>` maps to `public/assets/audio/default/<name>.wav`.
    for (const key of LONG_ERASURE_SFX_KEYS) {
      this.load.audio(key, `assets/audio/default/${key.replace(/^sfx-/, '')}.wav`);
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#141a24');
    this.initHeader('The Long Erasure');
    this.addDivider();
    this.initReducedMotion();

    this.initHelp([
      {
        heading: 'Features',
        body: 'A complete three-act branching narrative played through the generic @story-line engine. Every rule — the pressure clock, act gating, affordability filtering, successor drawing, the journal and the journey score — lives in the Phaser-free GymLongErasureGame module; this scene only renders that state and forwards your choice back to it.',
      },
      {
        heading: 'The story',
        body: 'The deep-survey vessel Ashlight witnesses an Unwriting: a volume of space, and everyone descended from it, ceases to have happened. The agent is the Revision Loom, commanded by Archivist Vane, who is reweaving cause and effect to restore one drowned homeland — his own. Each revision takes something from the Ashlight: a system, a berth, an ally. Act I The First Unwriting: log the phenomenon and decide whether to transmit a warning that reveals your position. Act II Attrition: shelter in a dead zone, bargain with the Archivist, or refuse him. Act III The Core: finish the weave, unwrite the Loom, or ram the core. Reaching the Loom resets the timeline; the closing screen scores the voyage you actually made.',
      },
      {
        heading: 'Pressure clock and state gates',
        body: 'Every beat costs clock. A beat that exactly equals the remaining clock is playable (the last tick); a beat that exceeds it expires the run immediately, so slow routes are genuinely punished. Some options are gated on accumulated resources — for example, Sabotage the Loom only appears once goodwill has reached 3, which can only be earned by earlier choices. Options you cannot afford are not offered; the gated branch shows up when your journey has earned it.',
      },
      {
        heading: 'Controls',
        body: 'Click an option label to take it. The act, clock, resources, beat and journal panels update on every choice, and a feedback line names what you just did. [ Begin a new survey ] starts the same deterministic run again from the first beat. The help panel (this slide-out) documents the rules and the IP statement.',
      },
      {
        heading: 'Original setting — no third-party IP',
        body: 'The Long Erasure is an original science-fiction setting written for this demo. It carries no third-party intellectual property: no franchise character, race, ship class, faction, technology name or episode title is used, and no plot beats, dialogue or character beats are lifted — the history-editing-weapon trope is used at trope level only. The prohibited-term constraint is enforced mechanically: a forbidden-term list is scanned over the authored content and its generated artefacts by the content test suite, so a prohibited term cannot ship unnoticed.',
      },
      {
        heading: 'Test Plan',
        body: '1. Beat 1 offers Log the erasure / Rally the survey crew; either choice advances the clock and writes a journal row.\n2. The Act I warning choice adds goodwill; at The Archivist\'s Offer the goodwill-gated Sabotage the Loom option appears only once goodwill reaches 3.\n3. Abandon the voyage ends the run terminally with the voyage-ended framing.\n4. A cheap route reaches the Loom\'s core and the reset ending, where the closing screen shows the journey score, the band label and the surviving journal.\n5. Begin a new survey returns to beat 1 with the starting resources and clock.',
      },
    ]);

    this.soundManager = this.createSoundManager();
    this.buildChrome();
    this.startRun();
  }

  // ── Public testing helpers ───────────────────────────────────

  /** The current run state. @internal Exposed for tests. */
  getRunState(): LongErasureState {
    return this.run;
  }

  /** The closing-screen view model, or `null` while the run is playing. @internal */
  getEpilogue(): LongErasureEpilogue | null {
    return isComplete(this.run) ? buildEpilogue(this.run) : null;
  }

  /** The option labels currently offered to the player. @internal */
  getAvailableOptionLabels(): string[] {
    return availableOptions(this.run).map((option) => option.label);
  }

  /** The feedback line currently on screen. @internal */
  getFeedbackText(): string {
    return this.feedbackText.text;
  }

  /** The journal rows currently on screen, newest first. @internal */
  getJournalLines(): string[] {
    const text = this.journalBody.text;
    return text === '' ? [] : text.split('\n');
  }

  /** SFX keys played so far (oldest first). @internal */
  getPlayedSfxKeys(): readonly string[] {
    return [...this.playedSfxKeys];
  }

  /** Every text currently rendered in the option/epilogue area. @internal */
  getOptionAreaTexts(): string[] {
    return this.optionTexts.map((text) => text.text);
  }

  /** Take a choice exactly as clicking its label would. @internal */
  chooseByLabel(label: string): void {
    this.applyChoice(label);
  }

  /** Restart the run, exactly as clicking [ Begin a new survey ] would. @internal */
  beginNewSurvey(): void {
    this.playSfx(COMMON_SFX_KEYS.UI_CLICK);
    this.startRun();
  }

  // ── Chrome construction ─────────────────────────────────────

  /** Create the persistent chrome, every position resolved through SLL. */
  private buildChrome(): void {
    const act = resolveAnchor('statusBar', 'act');
    const clock = resolveAnchor('statusBar', 'clock');
    const resources = resolveAnchor('statusBar', 'resources');
    const beat = resolveAnchor('narrative', 'beat');
    const title = resolveAnchor('narrative', 'title');
    const effect = resolveAnchor('narrative', 'effect');
    const feedback = resolveAnchor('feedback', 'center');
    const journalHeading = resolveAnchor('journal', 'heading');
    const journalBody = resolveAnchor('journal', 'body');
    const restart = resolveAnchor('controls', 'center');

    this.actText = createHudText(this, act.x, act.y, '', '#88bbdd', {
      fontSize: '15px',
    }).setOrigin(0, 0.5);

    this.clockText = createHudText(this, clock.x, clock.y, '', '#ffcc88', {
      fontSize: '15px',
    }).setOrigin(0, 0.5);

    this.resourcesText = createHudText(this, resources.x, resources.y, '', '#aaccaa', {
      fontSize: '14px',
    }).setOrigin(1, 0.5);

    this.beatText = createHudText(this, beat.x, beat.y, '', '#7799bb', {
      fontSize: '14px',
    }).setOrigin(0.5);

    this.titleText = createHudText(this, title.x, title.y, '', '#ffdd99', {
      fontSize: '26px',
    }).setOrigin(0.5);

    this.effectText = createHudText(this, effect.x, effect.y, '', '#ccd8e8', {
      fontSize: '15px',
    })
      .setOrigin(0.5, 0)
      .setAlign('center')
      .setWordWrapWidth(GAME_W - 160);

    this.feedbackText = createHudText(this, feedback.x, feedback.y, '', '#ffff99', {
      fontSize: '14px',
    }).setOrigin(0.5);

    this.journalHeading = createHudText(
      this,
      journalHeading.x,
      journalHeading.y,
      '── Journal ──',
      '#88bb88',
      { fontSize: '13px' },
    ).setOrigin(0, 0.5);

    this.journalBody = createHudText(
      this,
      journalBody.x,
      journalBody.y,
      '',
      '#99cc99',
      { fontSize: '13px' },
    )
      .setOrigin(0, 0)
      .setAlign('left');

    this.restartButton = createHudText(
      this,
      restart.x,
      restart.y,
      '[ Begin a new survey ]',
      '#ffffff',
      { fontSize: '15px' },
    ).setOrigin(0.5);
    this.restartButton.setInteractive({ useHandCursor: true });
    this.restartButton.on('pointerdown', () => this.beginNewSurvey());
    this.restartButton.on('pointerover', () => this.restartButton.setColor('#88ff88'));
    this.restartButton.on('pointerout', () => this.restartButton.setColor('#ffffff'));
  }

  /** Build the scene's `SoundManager` (null when there is no audio backend). */
  private createSoundManager(): SoundManager | null {
    if (!this.sound || typeof this.sound.play !== 'function') return null;
    const phaserSound = this.sound;
    const player: SoundPlayer = {
      play: (key: string) => {
        try { phaserSound.play(key); } catch (_) { /* ignore missing assets */ }
      },
      stop: (key: string) => {
        try { (phaserSound as unknown as { stopByKey?: (k: string) => void }).stopByKey?.(key); } catch (_) { /* ignore */ }
      },
      setVolume: (v: number) => {
        try { (phaserSound as unknown as { volume: number }).volume = v; } catch (_) { /* ignore */ }
      },
      setMute: (m: boolean) => {
        try { (phaserSound as unknown as { mute: boolean }).mute = m; } catch (_) { /* ignore */ }
      },
    };
    const manager = new SoundManager(player, { storage: null });
    for (const key of LONG_ERASURE_SFX_KEYS) manager.register(key);
    return manager;
  }

  // ── Run lifecycle ───────────────────────────────────────────

  /** Start a fresh deterministic run and render it. */
  private startRun(): void {
    this.run = createLongErasureRun(LONG_ERASURE_SCENE_SEED, longErasureSceneContent());
    this.feedbackText.setColor('#ffff99');
    this.feedbackText.setText('A survey begins beyond the charted volume.');
    this.render();
  }

  /**
   * Forward a choice to the Phaser-free module and render the result.
   *
   * Every refusal comes from the module (a stale option, a click after the run
   * ended), so the scene never invents a rule — it only presents the reason.
   */
  private applyChoice(label: string): void {
    if (isComplete(this.run)) {
      this.refuse('This voyage has ended — begin a new survey to play again.');
      return;
    }

    const before = this.run;
    try {
      const next = chooseOption(before, label);
      this.run = next;
      this.playSfx(COMMON_SFX_KEYS.CARD_SWAP);

      const actTurned = next.act !== before.act;
      if (actTurned && next.act !== 'Ending') {
        this.playSfx(COMMON_SFX_KEYS.TURN_CHANGE);
        this.announce(`Act ${next.act} begins — you chose "${label}".`, '#88ddff');
      } else if (isComplete(next) && next.outcome === 'expired') {
        this.announce('The clock runs out — the beat could not be played.', '#ffaa66');
      } else {
        this.announce(`You chose "${label}".`, '#ffff99');
      }

      this.render();

      if (isComplete(next)) this.announceEnding();
    } catch (error) {
      this.refuse(
        error instanceof LongErasureError
          ? error.message
          : 'That choice is no longer available.',
      );
    }
  }

  /** Show a refused choice: textual reason + reason toast + illegal SFX. */
  private refuse(reason: string): void {
    this.announce(reason, '#ff8866');
    this.playSfx(COMMON_SFX_KEYS.ILLEGAL_MOVE);
    // The reason toast is the textual channel; `soundKey: ''` keeps the sound
    // on the SoundManager path (played above) instead of `safePlaySound`.
    shakeIllegalMove({
      scene: this,
      target: null,
      reason,
      soundKey: '',
      reducedMotion: this.reducedMotion,
    });
  }

  /** Announce the run's ending audibly and visually. */
  private announceEnding(): void {
    const epilogue = buildEpilogue(this.run);
    this.playSfx(COMMON_SFX_KEYS.ROUND_END);
    this.playSfx(COMMON_SFX_KEYS.SCORE_REVEAL);

    const titleAnchor = resolveAnchor('narrative', 'title');
    void popTextOrIcon({
      scene: this,
      x: titleAnchor.x + GAME_W * 0.22,
      y: titleAnchor.y,
      label: `Score ${epilogue.score.total}`,
      reducedMotion: this.reducedMotion,
      style: { fontSize: '20px', color: '#ffdd99' },
    });
  }

  /** Write the feedback line (the always-available textual channel). */
  private announce(text: string, colour: string): void {
    this.feedbackText.setColor(colour);
    this.feedbackText.setText(text);
  }

  /** Play an SFX through the SoundManager, respecting reduced motion. */
  private playSfx(key: CommonSfxKey): void {
    // Project-wide reduced-motion contract: the preference suppresses SFX as
    // well as animation; the textual feedback above still carries the change.
    if (this.reducedMotion) return;
    this.playedSfxKeys.push(key);
    if (this.playedSfxKeys.length > 40) this.playedSfxKeys.shift();
    this.soundManager?.play(key);
  }

  // ── Rendering ───────────────────────────────────────────────

  /** Render the whole view from `this.run` (the module owns every value). */
  private render(): void {
    this.actText.setText(this.run.act === 'Ending' ? 'Ending' : `Act ${this.run.act}`);
    this.clockText.setText(`Clock ${this.run.clock}/${this.run.clockMax}`);
    this.resourcesText.setText(this.resourcesLine(this.run.resources));

    this.clearOptionArea();
    if (isComplete(this.run)) {
      this.renderEpilogue(buildEpilogue(this.run));
    } else {
      this.renderBeat();
    }
    this.renderJournal();
  }

  /** Render the current playable beat and its offered options. */
  private renderBeat(): void {
    const story = this.run.currentCard.storylineTitle ?? 'The Long Erasure';
    this.beatText.setText(`Beat ${this.run.beat} — ${story}`);
    this.titleText.setText(this.run.currentCard.name);
    this.effectText.setText(this.run.currentCard.effect ?? '');

    const options = availableOptions(this.run);
    options.slice(0, OPTION_ANCHORS.length).forEach((option, index) => {
      const point = resolveAnchor('options', OPTION_ANCHORS[index]);
      const button = createHudText(
        this,
        point.x,
        point.y,
        `[ ${option.label} ]${optionHint(option.cost, option.extraEffect)}`,
        '#aaddff',
        { fontSize: '17px' },
      ).setOrigin(0.5);
      button.setInteractive({ useHandCursor: true });
      button.on('pointerdown', () => this.applyChoice(option.label));
      button.on('pointerover', () => button.setColor('#ddffff'));
      button.on('pointerout', () => button.setColor('#aaddff'));
      this.optionTexts.push(button);
    });
  }

  /** Render the scored closing screen (the voyage the player made). */
  private renderEpilogue(epilogue: LongErasureEpilogue): void {
    const score = epilogue.score;
    const acts = score.actsCompleted.length > 0 ? score.actsCompleted.join(' · ') : 'none';

    this.beatText.setText(
      `The voyage ends — ${score.actsCompleted.length} of ${LONG_ERASURE_ACTS.length} acts reached`,
    );
    this.titleText.setText(epilogue.endingName ?? 'The voyage ends here');
    this.effectText.setText(outcomeFraming(epilogue.outcome));

    const lines = [
      `Journey score: ${score.total} / 100 — ${score.label}`,
      `Acts: ${acts}    Choices: ${score.choiceCount}    Cost paid: ${score.costPaid}`,
      `Left when the timeline closed: ${this.resourcesLine(score.resourcesLeft)}`,
    ];

    lines.slice(0, OPTION_ANCHORS.length - 1).forEach((line, index) => {
      const point = resolveAnchor('options', OPTION_ANCHORS[index]);
      this.optionTexts.push(
        createHudText(this, point.x, point.y, line, '#ccd8e8', {
          fontSize: '15px',
        }).setOrigin(0.5),
      );
    });

    const restartPoint = resolveAnchor('options', OPTION_ANCHORS[OPTION_ANCHORS.length - 1]);
    const restart = createHudText(
      this,
      restartPoint.x,
      restartPoint.y,
      '[ Begin a new survey ]',
      '#88ff88',
      { fontSize: '17px' },
    ).setOrigin(0.5);
    restart.setInteractive({ useHandCursor: true });
    restart.on('pointerdown', () => this.beginNewSurvey());
    this.optionTexts.push(restart);
  }

  /** Render the journal (newest choice first) from the run's activity log. */
  private renderJournal(): void {
    const closing = isComplete(this.run);
    const limit = closing ? JOURNAL_CLOSING_ROWS : JOURNAL_PLAY_ROWS;
    const entries = runJournal(this.run).slice(0, limit);
    const lines = entries.map((entry) => `• ${entry.storyline} — ${entry.outcome}`);

    this.journalHeading.setText(
      closing ? '── The record that survives ──' : '── Journal ──',
    );
    this.journalBody.setText(lines.length > 0 ? lines.join('\n') : '(no choices yet)');
  }

  /** Destroy the option/epilogue objects from the previous render. */
  private clearOptionArea(): void {
    for (const text of this.optionTexts) text.destroy();
    this.optionTexts = [];
  }

  /** One-line resource summary in the content's declared key order. */
  private resourcesLine(resources: Readonly<Record<string, number>>): string {
    return this.run.content.resources
      .map((key) => `${resourceLabel(key)} ${resources[key] ?? 0}`)
      .join(' · ');
  }
}
