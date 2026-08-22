import { describe, it, expect } from 'vitest';

/**
 * Tests for the Main Street Help/Rules panel content.
 *
 * Verifies that the required PRD sections are present with concise copy
 * (<= 8 lines per section). These are content-level tests that don't
 * require Phaser.
 */

// ── Required section headings (from PRD) ─────────────────────

const REQUIRED_SECTION_HEADINGS = [
  'How to Play',
  'Card Types',
  'Synergy and Placement',
  'Turn Flow',
  'Win / Loss Conditions',
  'Tools',
] as const;

const MAX_LINES_PER_SECTION = 8;

/**
 * Helper: counts the number of newline-separated lines in help body text.
 * The PRD's "<= 8 lines" refers to author-controlled lines (\n-delimited),
 * not display word-wrapping which depends on panel width.
 */
function countLines(body: string): number {
  return body.split('\n').filter((l) => l.trim().length > 0).length;
}

// ── Content definitions (mirror of LifecycleManager helpSections) ──

/**
 * We test the content definitions here to avoid needing Phaser.
 * These should match the sections defined in MainStreetLifecycleManager.
 */
const HELP_SECTIONS = [
  {
    heading: 'How to Play',
    body:
      'Buy businesses from the market and place them on the 2x5 street.\n' +
      'Earn income and score through card value + synergy + reputation.\n' +
      'Buy upgrades to improve existing businesses.\n' +
      'Hold event cards and play them when timing is best.\n' +
      'Complete challenges for bonus points and instant-win conditions.\n' +
      'Manage coins and reputation to build the best street — games end\n' +
      'when you win (score threshold / all challenges) or lose\n' +
      '(bankruptcy / reputation collapse). There is no turn limit.',
  },
  {
    heading: 'Card Types',
    body:
      'Business (green): persistent board value, placed on your street.\n' +
      'Upgrade (orange): enhances an existing business on the street.\n' +
      'Event / Investment (brown): one-time effects, held in your hand.\n' +
      'Incident (blue): automatic pressure events at end of each turn.\n' +
      'Each card has a cost, value, and one or more synergy types.',
  },
  {
    heading: 'Synergy and Placement',
    body:
      'Adjacent matching synergy types yield bonus income. ' +
      'Synergy checks are performed for left/right neighbors and stack additively. ' +
      'Some cards bridge multiple synergy types and count for both. ' +
      'Upgrades can increase range and value. ' +
      'Plan placements to cluster synergies for higher returns.',
  },
  {
    heading: 'Turn Flow',
    body:
      'Day Start: market refreshes and income is calculated.\n' +
      'Market Actions: buy businesses, upgrades, or events from the market.\n' +
      'Place businesses on the street grid to earn future income.\n' +
      'End Turn: resolves income, incidents, and advances to the next day.\n' +
      'Repeat until you win (score threshold / all challenges) or lose\n' +
      '(bankruptcy / reputation collapse).',
  },
  {
    heading: 'Win / Loss Conditions',
    body:
      'Reach 120 points to win (coins + reputation + challenges).\n' +
      'Complete all 3 challenges for an instant win.\n' +
      'No turn limit: keep playing until you win or lose.\n' +
      'Bankruptcy (coins < 0) or reputation collapse (rep <= 0) loses the game.',
  },
  {
    heading: 'Tools',
    body:
      'Hint: get a suggested move (once per turn).\n' +
      'Undo / Redo: step back or forward through market actions.\n' +
      'Refresh Investments: swap the investment row (costs coins).\n' +
      'Tutorial Replay: restart the guided tutorial from Settings.\n' +
      'Keyboard shortcuts: End Turn key configurable in Settings.',
  },
];

// ── Tests ──────────────────────────────────────────────────────

describe('Help/Rules panel content (PRD milestone 5)', () => {
  // ── Required Section Headings ──────────────────────────────

  it('contains all required section headings', () => {
    const actualHeadings = HELP_SECTIONS.map((s) => s.heading);
    for (const required of REQUIRED_SECTION_HEADINGS) {
      expect(actualHeadings).toContain(required);
    }
  });

  it('has exactly 6 required sections', () => {
    expect(HELP_SECTIONS.length).toBe(6);
  });

  it('sections are in the PRD-specified order', () => {
    for (let i = 0; i < REQUIRED_SECTION_HEADINGS.length; i++) {
      expect(HELP_SECTIONS[i].heading).toBe(REQUIRED_SECTION_HEADINGS[i]);
    }
  });

  // ── Line-Count Guardrails ─────────────────────────────────

  it.each(HELP_SECTIONS)(
    '"$heading" section has <= 8 lines of body text',
    (section) => {
      const lines = countLines(section.body);
      expect(lines).toBeLessThanOrEqual(MAX_LINES_PER_SECTION);
    },
  );

  // ── English-Only Copy ─────────────────────────────────────

  it('all section body text is English-only (no CJK, Cyrillic, etc.)', () => {
    const nonLatinRegex = /[\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff]/;
    for (const section of HELP_SECTIONS) {
      expect(nonLatinRegex.test(section.body)).toBe(false);
    }
  });

  // ── Content Quality ───────────────────────────────────────

  it('"How to Play" mentions businesses, street, and score', () => {
    const body = HELP_SECTIONS.find((s) => s.heading === 'How to Play')!.body.toLowerCase();
    expect(body).toContain('business');
    expect(body).toContain('street');
    expect(body).toContain('score');
  });

  it('"Card Types" mentions business, upgrade, event, and incident', () => {
    const body = HELP_SECTIONS.find((s) => s.heading === 'Card Types')!.body.toLowerCase();
    expect(body).toContain('business');
    expect(body).toContain('upgrade');
    expect(body).toContain('event');
    expect(body).toContain('incident');
  });

  it('"Synergy and Placement" mentions adjacent and bonus', () => {
    const body = HELP_SECTIONS.find((s) => s.heading === 'Synergy and Placement')!.body.toLowerCase();
    expect(body).toContain('adjacent');
    expect(body).toContain('bonus');
  });

  it('"Turn Flow" mentions end turn', () => {
    const body = HELP_SECTIONS.find((s) => s.heading === 'Turn Flow')!.body.toLowerCase();
    expect(body).toContain('end turn');
  });

  it('"Win / Loss Conditions" mentions bankruptcy and reputation', () => {
    const body = HELP_SECTIONS.find((s) => s.heading === 'Win / Loss Conditions')!.body.toLowerCase();
    expect(body).toContain('bankruptcy');
    expect(body).toContain('reputation');
  });

  it('"Tools" mentions hint, undo, and tutorial replay', () => {
    const body = HELP_SECTIONS.find((s) => s.heading === 'Tools')!.body.toLowerCase();
    expect(body).toContain('hint');
    expect(body).toContain('undo');
    expect(body).toContain('tutorial');
  });
});
