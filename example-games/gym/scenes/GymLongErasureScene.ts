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
 * - The narrative panel shows the beat's authored `context` above the options,
 *   wrapped and positioned from SLL anchors only. Prose longer than the panel's
 *   display budget is **paged**, never clipped: a visible `[ more… ]`
 *   affordance reveals the remainder (`paginateProse()`).
 * - A resolved choice narrates the chosen option's authored outcome prose
 *   (`#says=`) through the shared `revealNarration()` helper, which plays a
 *   `COMMON_SFX_KEYS` sound and respects reduced motion; the full text is on
 *   screen when the reveal completes or the player skips it.
 * - The closing screen shows the ending card's authored `epilogue`; when the
 *   content authors none, the screen falls back to the pre-prose rendering
 *   (the outcome framing line) byte-for-byte.
 * - A resolved choice rewrites the act/clock/resource/beat panels, appends the
 *   journal row (the authored outcome prose, truncated to one display line by
 *   the shared helper) and writes a "you chose …" feedback line, plays
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
 * reduced-motion contract), the score pop is instant, the narration reveal is
 * applied synchronously and no tween is created. The textual channel is never
 * suppressed, so nothing is feedback-free — and with audio muted the prose is
 * still on screen.
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
import {
  paginateProse,
  revealNarration,
  DEFAULT_PROSE_PAGE_CHARS,
  type NarrationRevealHandle,
} from '../../../src/ui';
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

/**
 * Characters one narrative-panel page may show.
 *
 * Derived from the panel's SLL window (about three wrapped lines at 14 px over
 * `GAME_W - 160` px). Prose beyond it is paged behind the `[ more… ]`
 * affordance rather than clipped.
 */
export const NARRATIVE_PANEL_PAGE_CHARS = DEFAULT_PROSE_PAGE_CHARS;

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

/** Optional content override (tests / alternate authored content). */
let contentOverride: LongErasureContent | null = null;

/**
 * Override the content this scene plays (`null` restores the shipped CSV).
 *
 * The shipped content authors no prose yet (that is a sibling content item), so
 * the browser suite injects a prose-bearing fixture through this seam. It is
 * also the seam a content pack or an alternate authored file would use.
 *
 * @internal
 */
export function setLongErasureSceneContent(
  content: LongErasureContent | null,
): void {
  contentOverride = content;
}

/**
 * The content this scene plays (parsed from `content/long-erasure.csv`, the
 * same file the content toolchain validates).
 */
export function longErasureSceneContent(): LongErasureContent {
  if (contentOverride !== null) return contentOverride;
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

  /** The narrative panel: the beat's context / the choice's consequence. */
  private proseText!: Phaser.GameObjects.Text;

  /** The visible `[ more… ]` continuation control for over-long prose. */
  private moreText!: Phaser.GameObjects.Text;

  /** The paged prose of the current panel (empty when nothing is authored). */
  private panelPages: string[] = [];

  /** Index of the page currently shown in the panel. */
  private panelPageIndex = 0;

  /** The in-flight narration reveal, released before the panel is rewritten. */
  private revealHandle: NarrationRevealHandle | null = null;

  /** The outcome prose of the choice just taken, narrated on this render only. */
  private pendingOutcomeProse: string | null = null;

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
        body: 'A complete three-act branching narrative played through the generic @story-line engine. Every rule — the pressure clock, act gating, affordability filtering, successor drawing, the journal and the journey score — lives in the Phaser-free GymLongErasureGame module; this scene only renders that state and forwards your choice back to it. The narrative panel above the options shows the beat’s authored context paragraph; the consequence of your choice is narrated into that panel (a shared reveal helper with a common sound, instant under reduced motion), and the closing screen carries the ending’s authored epilogue. Prose longer than the panel is never cut silently: a [ more… ] control reveals the remainder.',
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
        body: 'Click an option label to take it. The act, clock, resources, beat, narrative and journal panels update on every choice, and a feedback line names what you just did. [ more… ] pages over-long prose (first pointer input also skips the reveal). [ Begin a new survey ] starts the same deterministic run again from the first beat. The help panel (this slide-out) documents the rules and the IP statement.',
      },
      {
        heading: 'Original setting — no third-party IP',
        body: 'The Long Erasure is an original science-fiction setting written for this demo. It carries no third-party intellectual property: no franchise character, race, ship class, faction, technology name or episode title is used, and no plot beats, dialogue or character beats are lifted — the history-editing-weapon trope is used at trope level only. The prohibited-term constraint is enforced mechanically: a forbidden-term list is scanned over the authored content and its generated artefacts by the content test suite, so a prohibited term cannot ship unnoticed.',
      },
      {
        heading: 'Test Plan',
        body: '1. Beat 1 shows its context paragraph above Log the erasure / Rally the survey crew; either choice narrates the option’s authored outcome and writes a journal row carrying that prose.\n2. The Act I warning choice adds goodwill; at The Archivist\'s Offer the goodwill-gated Sabotage the Loom option appears only once goodwill reaches 3.\n3. Abandon the voyage ends the run terminally with the voyage-ended framing.\n4. A cheap route reaches the Loom\'s core and the reset ending, where the closing screen shows the authored epilogue, the journey score, the band label and the surviving journal.\n5. Begin a new survey returns to beat 1 with the starting resources and clock.\n6. Prose beyond the panel budget shows [ more… ]; activating it reveals the remainder (nothing is clipped).',
      },
    ]);

    this.soundManager = this.createSoundManager();
    this.buildChrome();
    this.startRun();

    // A reveal in flight owns a timer and input listeners; release both when
    // the scene shuts down so nothing writes into a destroyed scene.
    this.events.once('shutdown', () => this.destroyReveal());
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

  /** The narrative panel's current page (the visible prose). @internal */
  getNarrativePanelText(): string {
    return this.proseText.text;
  }

  /** The beat/outcome effect line currently on screen. @internal */
  getEffectText(): string {
    return this.effectText.text;
  }

  /** The `[ more… ]` affordance text, or `''` when the panel fits. @internal */
  getMoreAffordanceText(): string {
    return this.moreText.visible ? this.moreText.text : '';
  }

  /** Reveal the panel's next page, exactly as clicking `[ more… ]` would. @internal */
  showNextPanelPage(): void {
    this.advancePanelPage();
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
    const context = resolveAnchor('narrative', 'context');
    const contextMore = resolveAnchor('narrative', 'contextMore');
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

    this.proseText = createHudText(this, context.x, context.y, '', '#b9c8da', {
      fontSize: '14px',
      lineSpacing: 4,
      align: 'center',
    })
      .setOrigin(0.5, 0)
      .setWordWrapWidth(GAME_W - 160);

    this.moreText = createHudText(
      this,
      contextMore.x,
      contextMore.y,
      '',
      '#88bbdd',
      { fontSize: '13px' },
    ).setOrigin(0.5);
    this.moreText.setInteractive({ useHandCursor: true });
    this.moreText.on('pointerdown', () => {
      this.playSfx(COMMON_SFX_KEYS.UI_CLICK);
      this.advancePanelPage();
    });
    this.moreText.on('pointerover', () => this.moreText.setColor('#ddffff'));
    this.moreText.on('pointerout', () => this.moreText.setColor('#88bbdd'));
    this.moreText.setVisible(false);

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
    this.destroyReveal();
    this.pendingOutcomeProse = null;
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

      // The consequence, as authored for the option the player took. It is
      // composed with the successor beat's context and narrated on this render;
      // the next choice replaces it with that choice's own consequence.
      const lastEntry = next.history[next.history.length - 1];
      this.pendingOutcomeProse =
        next.history.length > before.history.length
          ? lastEntry?.outcomeProse ?? null
          : null;

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
    this.renderPanel();
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

  /**
   * Render the narrative panel: the situation, or the choice's consequence.
   *
   * The panel holds the beat's authored `context`; a choice adds the chosen
   * option's authored outcome prose above it, so the consequence reads as a
   * story beat followed by the new situation. The prose is paged when it
   * exceeds the panel's budget (`[ more… ]` reveals the remainder) — it is
   * never silently clipped, and the reveal is released before any rewrite.
   */
  private renderPanel(): void {
    this.destroyReveal();

    const narrate = this.pendingOutcomeProse !== null;
    const prose = this.composePanelProse();
    const pagination = paginateProse(prose ?? '', NARRATIVE_PANEL_PAGE_CHARS);

    this.panelPages = [...pagination.pages];
    this.panelPageIndex = 0;

    if (pagination.pageCount === 0) {
      this.proseText.setText('');
      this.moreText.setText('');
      this.moreText.setVisible(false);
    } else {
      this.showPanelPage(0, narrate);
    }

    this.pendingOutcomeProse = null;
  }

  /** The prose the panel shows for the current state (or `null`). */
  private composePanelProse(): string | null {
    const paragraphs: string[] = [];
    if (this.pendingOutcomeProse !== null) {
      paragraphs.push(this.pendingOutcomeProse);
    }
    if (isComplete(this.run)) {
      const epilogue = buildEpilogue(this.run);
      if (epilogue.epilogueProse !== null) paragraphs.push(epilogue.epilogueProse);
    } else if (this.run.currentCard.context !== null) {
      paragraphs.push(this.run.currentCard.context);
    }
    return paragraphs.length > 0 ? paragraphs.join('\n\n') : null;
  }

  /** Show one page of the panel, narrating it when a choice just resolved. */
  private showPanelPage(index: number, narrate: boolean): void {
    const page = this.panelPages[index] ?? '';
    const hasMorePages = index < this.panelPages.length - 1;

    this.moreText.setText(
      hasMorePages ? `[ more… ] (${index + 1}/${this.panelPages.length})` : '',
    );
    this.moreText.setVisible(hasMorePages);

    if (!narrate) {
      this.proseText.setText(page);
      return;
    }

    // The shared helper owns the pacing, the `COMMON_SFX_KEYS` sound and the
    // reduced-motion instant path; the textual channel never waits on audio.
    this.revealHandle = revealNarration({
      scene: this,
      target: this.proseText,
      prose: page,
      reducedMotion: this.reducedMotion,
      soundManager: this.soundManager,
      onComplete: () => {
        this.revealHandle = null;
      },
    });
  }

  /** Advance to the panel's next page (the `[ more… ]` action). */
  private advancePanelPage(): void {
    if (this.panelPageIndex >= this.panelPages.length - 1) return;
    this.panelPageIndex += 1;
    this.showPanelPage(this.panelPageIndex, false);
  }

  /** Release the in-flight reveal (idempotent; leaves the text as it stands). */
  private destroyReveal(): void {
    this.revealHandle?.destroy();
    this.revealHandle = null;
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
