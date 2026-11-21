/**
 * GymLongErasureScene browser test.
 *
 * Boots the scene in a headless Phaser environment and plays it end to end,
 * asserting the observable UI surface rather than the scene's source:
 *
 * - a complete Act I → Act II → Act III → scored epilogue run on the cheap
 *   route (the reset ending), with the closing screen carrying the module's
 *   journey score and band;
 * - the resource-gated branch appearing only once goodwill has accumulated;
 * - the deliberate terminal "abandon the voyage" option;
 * - textual refusal feedback for a choice the run no longer offers;
 * - `COMMON_SFX_KEYS`-only SFX through the scene's SoundManager, suppressed
 *   under reduced motion;
 * - a clean restart.
 *
 * The narrative rules themselves are owned by `GymLongErasureGame.test.ts`;
 * this suite only proves the scene renders and forwards them.
 *
 * @module tests/gym/GymLongErasureScene.browser.test.ts
 */
import { afterEach, describe, expect, it } from 'vitest';
import Phaser from 'phaser';

import {
  GymLongErasureScene,
  NARRATIVE_PANEL_PAGE_CHARS,
  OPTION_ANCHORS,
  longErasureSceneContent,
  setLongErasureSceneContent,
} from '../../example-games/gym/scenes/GymLongErasureScene';
import { longErasureContentFromCsv } from '../../example-games/gym/GymLongErasureGame';
import { GYM_LONG_ERASURE_KEY } from '../../example-games/gym/GymRegistry';
import { COMMON_SFX_KEYS } from '../../src/core-engine';
import { waitForScene } from '../helpers/waitForScene';

/** The prose the injected fixture authors, used by the panel/outcome tests. */
const AUTHORED_CONTEXT =
  'The Ashlight holds station at the edge of an Unwriting, and the crew wait for your word.';
const AUTHORED_OUTCOME = 'You log it, and the charts go blank with it.';
const AUTHORED_EPILOGUE =
  'The timeline closes over the erasure like water. You are the only thing that remembers the room.';

/** Column shape of the Long Erasure content, with prose authored. */
const PROSE_HEADER =
  'id,name,effect,options,storylineId,storylineTitle,resources,act,clockCost,context,epilogue';

/**
 * Builds a small playable Long Erasure content file.
 *
 * Two choices reach the ending, so the prose surfaces (beat context, option
 * outcome, ending epilogue) are all reachable in one screen-flow test. The
 * fixture isolates the prose **surfaces**; the shipped content's own prose is
 * played for real in the full-voyage tests at the end of this suite.
 */
function proseCsv(options: {
  readonly context?: string;
  readonly outcome?: string;
  readonly epilogue?: string;
} = {}): string {
  const context = options.context ?? AUTHORED_CONTEXT;
  const outcome = options.outcome ?? AUTHORED_OUTCOME;
  const epilogue = options.epilogue ?? AUTHORED_EPILOGUE;
  const resources = '"hull,morale,stores,goodwill,charge"';

  return [
    PROSE_HEADER,
    `le-t-open,The First Unwriting,An opening happens.,"Log the erasure|le-t-log#says=${outcome};Rally the crew|le-t-rally#says=You raise your voice.",long-erasure,The Long Erasure,${resources},I,1,"${context}",`,
    `le-t-log,The Gauge,The gauge reads zero.,"Seal the hatch|le-t-end#says=The hatch seals behind you.",long-erasure,The Long Erasure,${resources},II,1,,"${epilogue}"`,
    `le-t-rally,The Rally,Voices in the dark.,"Follow them|le-t-end",long-erasure,The Long Erasure,${resources},II,1,,`,
    `le-t-end,Morning,The loom stops.,,long-erasure,The Long Erasure,${resources},Ending,1,,"${epilogue}"`,
  ].join('\n');
}

/** The same playable shape with **no** prose authored (the parity path). */
function bareCsv(): string {
  const resources = '"hull,morale,stores,goodwill,charge"';
  return [
    PROSE_HEADER,
    `le-t-open,The First Unwriting,An opening happens.,"Log the erasure|le-t-log;Rally the crew|le-t-rally",long-erasure,The Long Erasure,${resources},I,1,,`,
    `le-t-log,The Gauge,The gauge reads zero.,"Seal the hatch|le-t-end",long-erasure,The Long Erasure,${resources},II,1,,`,
    `le-t-rally,The Rally,Voices in the dark.,"Follow them|le-t-end",long-erasure,The Long Erasure,${resources},II,1,,`,
    `le-t-end,Morning,The loom stops.,,long-erasure,The Long Erasure,${resources},Ending,1,,`,
  ].join('\n');
}

/** The cheapest authored route: it reaches the Loom's core and resets. */
const RESET_ROUTE = [
  'Log the erasure',
  'Stay silent',
  'Shelter in the dead zone',
  'Ration the stores',
  'Refuse him',
  'Side with the captain',
  'Finish the weave',
] as const;

/** The reset route with its last choice swapped for the quiet ending. */
const QUIET_ROUTE = [...RESET_ROUTE.slice(0, -1), 'Unwrite the Loom'] as const;

/** The reset route with its last choice swapped for the ramming ending. */
const RAM_ROUTE = [...RESET_ROUTE.slice(0, -1), 'Ram the core'] as const;

/** A route that arrives at The Archivist's Offer's successor with goodwill 2. */
const GOODWILL_TWO_ROUTE = [
  'Log the erasure',
  'Transmit the warning',
  'Shelter in the dead zone',
  'Ration the stores',
  'Bargain in bad faith',
] as const;

/** A route that accumulates goodwill 3 by sharing the salvaged berth. */
const GOODWILL_THREE_ROUTE = [
  'Log the erasure',
  'Transmit the warning',
  'Shelter in the dead zone',
  'Strip the derelict',
  'Share the berth',
  'Bargain in bad faith',
] as const;

/** The deliberate terminal abandon option, reached from The Archivist's Offer. */
const ABANDON_ROUTE = [
  'Log the erasure',
  'Stay silent',
  'Shelter in the dead zone',
  'Ration the stores',
  'Abandon the voyage',
] as const;

describe('GymLongErasureScene browser test', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
    setLongErasureSceneContent(null);
  });

  async function bootScene(csv?: string): Promise<GymLongErasureScene> {
    setLongErasureSceneContent(
      csv === undefined ? null : longErasureContentFromCsv(csv),
    );

    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#141a24',
      scene: [GymLongErasureScene],
    });

    await waitForScene(game, GYM_LONG_ERASURE_KEY);
    const scene = game.scene.getScene(GYM_LONG_ERASURE_KEY) as GymLongErasureScene;
    expect(scene).toBeTruthy();
    return scene;
  }

  /** Play a route, asserting every step was actually offered. */
  function playRoute(scene: GymLongErasureScene, route: readonly string[]): void {
    for (const label of route) {
      expect(scene.getAvailableOptionLabels()).toContain(label);
      scene.chooseByLabel(label);
    }
  }

  it('boots on the first beat with the starting clock and resources', async () => {
    const scene = await bootScene();
    const run = scene.getRunState();

    expect(run.beat).toBe(1);
    expect(run.act).toBe('I');
    expect(run.currentCard.id).toBe('le-i-open');
    // The entry beat is entered immediately, so its clock cost is already paid.
    expect(run.clock).toBe(run.clockMax - run.currentCard.clockCost);
    expect(scene.getAvailableOptionLabels()).toEqual([
      'Log the erasure',
      'Rally the survey crew',
    ]);
    // Beat 1 is rendered, and the journal starts empty.
    expect(scene.getOptionAreaTexts().length).toBe(2);
    expect(scene.getJournalLines()).toEqual(['(no choices yet)']);
    expect(scene.getEpilogue()).toBeNull();
  });

  it('plays Act I → Act II → Act III → scored reset epilogue (AC7)', async () => {
    const scene = await bootScene();

    playRoute(scene, RESET_ROUTE);

    const epilogue = scene.getEpilogue();
    expect(epilogue).not.toBeNull();
    expect(epilogue?.outcome).toBe('reset');
    expect(epilogue?.reset).toBe(true);
    expect(epilogue?.endingName).toBe('The Long Erasure');
    expect(epilogue?.actsCompleted).toEqual(['I', 'II', 'III']);
    expect(epilogue?.journal.length).toBe(RESET_ROUTE.length);

    // The closing screen renders the score and band the phaser-free module
    // derived (the scene owns no scoring rule of its own).
    const score = epilogue!.score;
    const rendered = scene.getOptionAreaTexts().join('\n');
    expect(rendered).toContain(`Journey score: ${score.total} / 100 — ${score.label}`);
    expect(rendered).toContain(`Choices: ${score.choiceCount}`);
    expect(rendered).toContain('[ Begin a new survey ]');

    // The journey is scored, not won/lost: the band label is the module's.
    expect(score.total).toBeGreaterThan(0);
    expect(score.total).toBeLessThanOrEqual(100);

    // The closing screen leaves no option buttons behind.
    expect(scene.getAvailableOptionLabels()).toEqual([]);
    // The surviving journal is rendered.
    expect(scene.getJournalLines().length).toBeGreaterThan(0);
    expect(scene.getJournalLines()[0]).toMatch(/^• /);
  });

  it('hides the state-gated branch below the goodwill gate (AC7)', async () => {
    const scene = await bootScene();
    playRoute(scene, GOODWILL_TWO_ROUTE);
    expect(scene.getRunState().currentCard.id).toBe('le-ii-bargain');
    expect(scene.getRunState().resources.goodwill).toBe(2);
    expect(scene.getAvailableOptionLabels()).not.toContain('Sabotage the Loom');
    expect(scene.getAvailableOptionLabels()).toEqual(['Keep the bargain']);
  });

  it('reveals the state-gated branch once goodwill reaches 3 (AC7)', async () => {
    const scene = await bootScene();
    playRoute(scene, GOODWILL_THREE_ROUTE);
    expect(scene.getRunState().currentCard.id).toBe('le-ii-bargain');
    expect(scene.getRunState().resources.goodwill).toBe(3);
    expect(scene.getAvailableOptionLabels()).toContain('Sabotage the Loom');
  });

  it('honours the deliberate terminal "abandon the voyage" option (AC7)', async () => {
    const scene = await bootScene();

    playRoute(scene, ABANDON_ROUTE);

    const epilogue = scene.getEpilogue();
    expect(epilogue?.outcome).toBe('closed');
    expect(epilogue?.reset).toBe(false);
    expect(epilogue?.endingName).toBe('The Voyage Abandoned');
    // The arc is credited per act played: this Act II exit earns Acts I–II only
    // (CG-0MWNSR376002QBY9), not the full arc for entering an Ending card.
    expect(epilogue?.actsCompleted).toEqual(['I', 'II']);
    expect(epilogue?.score.components.arc).toBe(35);
    expect(scene.getAvailableOptionLabels()).toEqual([]);
  });

  it('explains a refused choice in text and via the shared reason toast', async () => {
    const scene = await bootScene();
    playRoute(scene, RESET_ROUTE);

    // Any further choice is refused by the module, not by the scene.
    scene.chooseByLabel('Finish the weave');

    expect(scene.getFeedbackText()).toMatch(/ended/i);
    expect(scene.getPlayedSfxKeys()).toContain(COMMON_SFX_KEYS.ILLEGAL_MOVE);
  });

  it('plays only COMMON_SFX_KEYS and suppresses them under reduced motion (AC9)', async () => {
    const scene = await bootScene();
    scene.setReducedMotionProperty(false);

    scene.chooseByLabel('Log the erasure');
    const played = scene.getPlayedSfxKeys();
    expect(played).toContain(COMMON_SFX_KEYS.CARD_SWAP);
    const allowed = new Set<string>(Object.values(COMMON_SFX_KEYS));
    for (const key of played) {
      expect(allowed.has(key), `unexpected SFX key "${key}"`).toBe(true);
    }

    // Reduced motion keeps the textual feedback but stops the SFX.
    scene.setReducedMotionProperty(true);
    const before = scene.getPlayedSfxKeys().length;
    scene.chooseByLabel('Stay silent');
    scene.beginNewSurvey();
    expect(scene.getPlayedSfxKeys().length).toBe(before);
    expect(scene.getFeedbackText()).not.toBe('');
  });

  it('writes a journal row and feedback line for every choice (AC9)', async () => {
    const scene = await bootScene();

    scene.chooseByLabel('Log the erasure');
    expect(scene.getFeedbackText()).toBe('You chose "Log the erasure".');
    expect(scene.getJournalLines().length).toBe(1);
    expect(scene.getJournalLines()[0]).toMatch(/^• /);
    expect(scene.getJournalLines()[0]).not.toContain('You chose');
    expect(scene.getJournalLines()[0]).toContain('You spend a store of paper');

    scene.chooseByLabel('Stay silent');
    expect(scene.getFeedbackText()).toBe('You chose "Stay silent".');
    expect(scene.getJournalLines().length).toBe(2);
  });

  it('restarts the run from a clean deterministic state', async () => {
    const scene = await bootScene();
    playRoute(scene, GOODWILL_TWO_ROUTE);
    expect(scene.getRunState().beat).toBeGreaterThan(1);

    scene.beginNewSurvey();

    const run = scene.getRunState();
    expect(run.beat).toBe(1);
    expect(run.currentCard.id).toBe('le-i-open');
    expect(run.clock).toBe(run.clockMax - run.currentCard.clockCost);
    expect(run.history).toEqual([]);
    expect(scene.getEpilogue()).toBeNull();
    expect(scene.getJournalLines()).toEqual(['(no choices yet)']);
    // Deterministic: the same seed reproduces the same option set.
    expect(scene.getAvailableOptionLabels()).toEqual([
      'Log the erasure',
      'Rally the survey crew',
    ]);
  });

  it('exposes the four SLL option anchors the layout provides', () => {
    expect(OPTION_ANCHORS).toEqual(['option1', 'option2', 'option3', 'option4']);
  });

  // ── Authored prose on screen (AC2, AC3, AC4, AC5, AC6) ──

  it('renders the authored context paragraph above the option list (AC2)', async () => {
    const scene = await bootScene(proseCsv());

    expect(scene.getNarrativePanelText()).toBe(AUTHORED_CONTEXT);
    expect(scene.getMoreAffordanceText()).toBe('');
    // The situation does not replace the beat chrome.
    expect(scene.getEffectText()).toBe('An opening happens.');
    expect(scene.getAvailableOptionLabels()).toEqual([
      'Log the erasure',
      'Rally the crew',
    ]);
  });

  it('narrates the chosen option’s authored outcome (AC3, AC6)', async () => {
    const scene = await bootScene(proseCsv());
    scene.setReducedMotionProperty(false);

    scene.chooseByLabel('Log the erasure');

    // The reveal starts progressively: the full prose is not on screen yet…
    expect(scene.getNarrativePanelText()).not.toBe(AUTHORED_OUTCOME);

    // …and the first pointer input skips it, leaving the full prose present.
    scene.input.emit('pointerdown');
    expect(scene.getNarrativePanelText()).toBe(AUTHORED_OUTCOME);
    expect(scene.getPlayedSfxKeys()).toContain(COMMON_SFX_KEYS.CARD_SWAP);

    // AC7: the journal row is the authored consequence, not a label paraphrase.
    expect(scene.getJournalLines()[0]).toContain(AUTHORED_OUTCOME);
    expect(scene.getJournalLines()[0]).not.toContain('You chose');
  });

  it('skips straight to the full outcome under reduced motion (AC3, AC8)', async () => {
    const scene = await bootScene(proseCsv());
    scene.setReducedMotionProperty(true);

    scene.chooseByLabel('Log the erasure');

    // Instant, textual, and silent: the prose never depends on animation/audio.
    expect(scene.getNarrativePanelText()).toBe(AUTHORED_OUTCOME);
    expect(scene.getPlayedSfxKeys()).toEqual([]);
  });

  it('shows the authored epilogue on the closing screen (AC4, AC6)', async () => {
    const scene = await bootScene(proseCsv());
    scene.setReducedMotionProperty(true);

    playRoute(scene, ['Log the erasure', 'Seal the hatch']);

    expect(scene.getEpilogue()?.epilogueProse).toBe(AUTHORED_EPILOGUE);
    expect(scene.getNarrativePanelText()).toContain(AUTHORED_EPILOGUE);
    const rendered = scene.getOptionAreaTexts().join('\n');
    expect(rendered).toContain(
      `Journey score: ${scene.getEpilogue()!.score.total} / 100`,
    );
  });

  it('falls back to today’s effect/framing when no epilogue is authored (AC4)', async () => {
    const scene = await bootScene(bareCsv());
    scene.setReducedMotionProperty(true);

    playRoute(scene, ['Log the erasure', 'Seal the hatch']);

    // Byte-for-byte parity with the pre-prose closing screen: the framing line
    // in the effect slot, no prose panel, no prose affordance.
    expect(scene.getEpilogue()?.epilogueProse ?? null).toBeNull();
    expect(scene.getEffectText()).toBe(
      'The voyage ended where you left it.',
    );
    expect(scene.getNarrativePanelText()).toBe('');
    expect(scene.getMoreAffordanceText()).toBe('');
  });

  it('pages over-long prose behind a visible [ more… ] affordance (AC5)', async () => {
    const longContext = `${'The crew wait in silence at the edge of the Unwriting. '.repeat(
      12,
    )}THE LAST WORD.`;
    expect(longContext.length).toBeGreaterThan(NARRATIVE_PANEL_PAGE_CHARS);

    const scene = await bootScene(proseCsv({ context: longContext }));

    // Page one is shown, nothing is clipped silently: the affordance names the
    // remaining pages and the tail of the prose is not on screen yet.
    expect(scene.getMoreAffordanceText()).toMatch(/more…/);
    expect(scene.getMoreAffordanceText()).toMatch(/1\/\d+/);
    expect(scene.getNarrativePanelText()).not.toContain('THE LAST WORD.');

    const firstPage = scene.getNarrativePanelText();
    scene.showNextPanelPage();
    const secondPage = scene.getNarrativePanelText();

    expect(secondPage).toContain('THE LAST WORD.');
    // Every character survives across the pages.
    expect(`${firstPage} ${secondPage}`.replace(/\s+/g, ' ')).toContain(
      longContext.replace(/\s+/g, ' '),
    );
  });
});

/**
 * The shipped prose, played for real (CG-0MWO7CX0V000PR5K, AC7).
 *
 * These tests boot the scene on the **committed** content (no fixture) and walk
 * every ending, so the record of the playthrough is the suite itself: each
 * beat's authored context reaches the panel, every chosen option's consequence
 * is narrated, and each of the four endings shows its own epilogue. Paging is
 * exercised rather than bypassed — the helper reads every page, which is how a
 * player reaches prose longer than the panel.
 */
describe('GymLongErasureScene shipped prose: full playthrough (AC7)', () => {
  let game: Phaser.Game | null = null;

  afterEach(() => {
    if (game) game.destroy(true, false);
    game = null;
    const container = document.getElementById('game-container');
    if (container) container.remove();
    setLongErasureSceneContent(null);
  });

  /** Collapses whitespace exactly as the panel's paginator does. */
  function normaliseProse(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /** Every page of the current narrative panel, in reading order. */
  function panelPages(scene: GymLongErasureScene): string[] {
    const pages = [scene.getNarrativePanelText()];
    for (let guard = 0; guard < 20; guard += 1) {
      if (scene.getMoreAffordanceText() === '') break;
      scene.showNextPanelPage();
      pages.push(scene.getNarrativePanelText());
    }
    return pages;
  }

  /** The whole panel prose, across every revealed page. */
  function panelProse(scene: GymLongErasureScene): string {
    return normaliseProse(panelPages(scene).join(' '));
  }

  /** Boots the scene on the committed content, with prose applied instantly. */
  async function bootShippedContent(): Promise<GymLongErasureScene> {
    // No content override: the scene reads `content/long-erasure.csv` itself.
    setLongErasureSceneContent(null);
    const container = document.createElement('div');
    container.id = 'game-container';
    document.body.appendChild(container);

    game = new Phaser.Game({
      type: Phaser.CANVAS,
      width: 1280,
      height: 720,
      parent: 'game-container',
      backgroundColor: '#141a24',
      scene: [GymLongErasureScene],
    });

    await waitForScene(game, GYM_LONG_ERASURE_KEY);
    const scene = game.scene.getScene(GYM_LONG_ERASURE_KEY) as GymLongErasureScene;
    scene.setReducedMotionProperty(true);
    return scene;
  }

  /** The authored card behind the run's current beat. */
  function currentCard(scene: GymLongErasureScene) {
    const content = longErasureSceneContent();
    const card = content.cards.find(
      (entry) => entry.id === scene.getRunState().currentCard.id,
    );
    expect(card, `authored card "${scene.getRunState().currentCard.id}"`).toBeDefined();
    return card!;
  }

  it('narrates every beat and every choice of a full voyage without losing prose', async () => {
    const scene = await bootShippedContent();

    // Beat 1: the shipped context is on screen, complete across its pages.
    const entry = currentCard(scene);
    expect(entry.context).toBeTruthy();
    expect(panelProse(scene)).toBe(normaliseProse(entry.context!));

    for (const label of RESET_ROUTE) {
      const before = scene.getRunState();
      expect(scene.getAvailableOptionLabels()).toContain(label);

      scene.chooseByLabel(label);

      const after = scene.getRunState();
      const chosen = after.history[after.history.length - 1];
      expect(chosen.outcomeProse, `"${label}" narrates no consequence`).toBeTruthy();

      // Consequence first, then the new situation (or the ending's epilogue
      // once the voyage closes), exactly as composed — and nothing clipped:
      // the page budget is respected, never a silent cut.
      const closing = after.status === 'complete';
      const situation = closing
        ? scene.getEpilogue()?.epilogueProse
        : currentCard(scene).context;
      const expected = [chosen.outcomeProse, situation]
        .filter((part): part is string => typeof part === 'string')
        .join(' ');
      expect(panelProse(scene)).toBe(normaliseProse(expected));

      // No panel collision: the options remain rendered and offered after the
      // prose is read, on every beat.
      if (after.status === 'playing') {
        expect(scene.getOptionAreaTexts().length).toBe(
          scene.getAvailableOptionLabels().length,
        );
      }
      expect(before.beat).toBeLessThanOrEqual(after.beat);
    }

    // The voyage actually ended on the reset ending.
    expect(scene.getEpilogue()?.outcome).toBe('reset');
  });

  it('shows each ending its own authored epilogue', async () => {
    const routes: readonly {
      readonly name: string;
      readonly route: readonly string[];
      readonly endingId: string;
    }[] = [
      { name: 'abandon', route: ABANDON_ROUTE, endingId: 'le-end-abandon' },
      { name: 'reset', route: RESET_ROUTE, endingId: 'le-end-reset' },
      { name: 'quiet', route: QUIET_ROUTE, endingId: 'le-end-quiet' },
      { name: 'ram', route: RAM_ROUTE, endingId: 'le-end-ram' },
    ];
    const content = longErasureSceneContent();
    const seen = new Map<string, string>();

    for (const { name, route, endingId } of routes) {
      const scene = await bootShippedContent();
      for (const label of route) {
        expect(
          scene.getAvailableOptionLabels(),
          `${name} route: "${label}" was not offered`,
        ).toContain(label);
        scene.chooseByLabel(label);
      }

      const run = scene.getRunState();
      expect(run.currentCard.id, `${name} route reached the wrong ending`).toBe(endingId);
      expect(run.status, `${name} route did not end the run`).toBe('complete');

      const authored = content.cards.find((card) => card.id === endingId);
      expect(authored?.epilogue, `${endingId} authors no epilogue`).toBeTruthy();

      // The closing screen carries this ending's own prose, in full.
      expect(scene.getEpilogue()?.epilogueProse).toBe(authored!.epilogue);
      expect(panelProse(scene)).toContain(normaliseProse(authored!.epilogue!));

      // Distinct: no ending closes on another ending's words.
      const epilogue = normaliseProse(authored!.epilogue!);
      for (const [otherId, otherEpilogue] of seen) {
        expect(epilogue, `${endingId} reuses ${otherId}'s epilogue`).not.toBe(
          otherEpilogue,
        );
      }
      seen.set(endingId, epilogue);
    }

    expect(seen.size).toBe(4);
  });
});
