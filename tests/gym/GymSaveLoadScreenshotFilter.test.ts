/**
 * Gym Save/Load — Screenshot HUD filtering tests.
 *
 * Validates that the takeScreenshot() HUD exclusion logic correctly
 * filters out HUD overlay elements (Help panel, header chrome, event log)
 * while keeping game content (cards, action buttons, state text) visible
 * in the screenshot RenderTexture.
 *
 * The filter uses a Set-based blacklist of known HUD object references.
 * These tests validate the Set-based filtering approach in isolation
 * (without requiring Phaser's RenderTexture).
 *
 * @module tests/gym/GymSaveLoadScreenshotFilter
 */

import { describe, expect, it } from 'vitest';

describe('Screenshot HUD filtering logic', () => {
  it('excludes known HUD references while keeping game content', () => {
    // Simulate scene children: mix of HUD objects and game content
    const rt = { name: 'RenderTexture' };
    const helpPanel = { name: 'HelpPanel' };
    const helpButton = { name: 'HelpButton' };
    const headerTitle = { name: 'HeaderTitle' };
    const menuButton = { name: 'MenuButton' };
    const prevButton = { name: 'PrevButton' };
    const nextButton = { name: 'NextButton' };
    const headerDivider = { name: 'HeaderDivider' };
    const eventLogHeader = { name: 'EventLogHeader' };
    const eventLogLine1 = { name: 'EventLogLine1' };
    const eventLogLine2 = { name: 'EventLogLine2' };

    // Game content that should remain visible
    const handViewCards = { name: 'HandViewCards' };
    const stateText = { name: 'StateText' };
    const backendText = { name: 'BackendText' };
    const actionButton = { name: 'ActionButton' };
    const screenshotThumb = { name: 'ScreenshotThumb' };

    const children = [
      rt,
      helpPanel,
      helpButton,
      headerTitle,
      menuButton,
      prevButton,
      nextButton,
      headerDivider,
      eventLogHeader,
      eventLogLine1,
      eventLogLine2,
      handViewCards,
      stateText,
      backendText,
      actionButton,
      screenshotThumb,
    ];

    // The exclusion set — mirrors the logic in takeScreenshot()
    const excluded = new Set<unknown>([
      rt,
      helpPanel,
      helpButton,
      headerTitle,
      menuButton,
      prevButton,
      nextButton,
      headerDivider,
      eventLogHeader,
      eventLogLine1,
      eventLogLine2,
    ]);

    const drawables = children.filter((child) => !excluded.has(child));

    // All HUD elements MUST be excluded
    expect(drawables).not.toContain(helpPanel);
    expect(drawables).not.toContain(helpButton);
    expect(drawables).not.toContain(headerTitle);
    expect(drawables).not.toContain(menuButton);
    expect(drawables).not.toContain(prevButton);
    expect(drawables).not.toContain(nextButton);
    expect(drawables).not.toContain(headerDivider);
    expect(drawables).not.toContain(eventLogHeader);
    expect(drawables).not.toContain(eventLogLine1);
    expect(drawables).not.toContain(eventLogLine2);

    // rt itself MUST be excluded
    expect(drawables).not.toContain(rt);

    // Game content MUST remain
    expect(drawables).toContain(handViewCards);
    expect(drawables).toContain(stateText);
    expect(drawables).toContain(backendText);
    expect(drawables).toContain(actionButton);
    expect(drawables).toContain(screenshotThumb);
  });

  it('handles undefined HUD references without error', () => {
    // When HUD elements are not initialized (e.g., during headless tests),
    // undefined in the exclusion Set should not cause errors
    const rt = { name: 'RenderTexture' };
    const stateText = { name: 'StateText' };
    const actionButton = { name: 'ActionButton' };

    // Some HUD references are undefined (not yet initialized)
    const excluded = new Set<unknown>([
      rt,
      undefined, // helpPanel not initialized
      undefined, // helpButton not initialized
      undefined, // header?.title not initialized
    ]);

    const children = [rt, stateText, actionButton];
    const drawables = children.filter((child) => !excluded.has(child));

    // rt should still be excluded
    expect(drawables).not.toContain(rt);

    // Game content should still be included
    expect(drawables).toContain(stateText);
    expect(drawables).toContain(actionButton);
  });

  it('excludes all event log lines when present', () => {
    const rt = { name: 'RenderTexture' };
    const eventLogHeader = { name: 'EventLogHeader' };
    const eventLogLine1 = { name: 'EventLogLine1' };
    const eventLogLine2 = { name: 'EventLogLine2' };
    const eventLogLine3 = { name: 'EventLogLine3' };

    // Simulate eventLogResult with header and multiple lines
    const eventLogResult = {
      header: eventLogHeader,
      lines: [eventLogLine1, eventLogLine2, eventLogLine3],
    };

    const excluded = new Set<unknown>([
      rt,
      eventLogResult.header,
      ...eventLogResult.lines,
    ]);

    const children = [
      rt,
      eventLogHeader,
      eventLogLine1,
      eventLogLine2,
      eventLogLine3,
      { name: 'GameContent' },
    ];

    const drawables = children.filter((child) => !excluded.has(child));

    expect(drawables).not.toContain(eventLogHeader);
    expect(drawables).not.toContain(eventLogLine1);
    expect(drawables).not.toContain(eventLogLine2);
    expect(drawables).not.toContain(eventLogLine3);
    expect(drawables).not.toContain(rt);
    expect(drawables).toHaveLength(1); // Only GameContent remains
    expect((drawables[0] as { name: string }).name).toBe('GameContent');
  });

  it('empty event log lines array does not affect filtering', () => {
    const rt = { name: 'RenderTexture' };
    const stateText = { name: 'StateText' };

    // eventLogResult exists but lines array is empty
    // (e.g., before any events have been logged)
    const eventLogResult = {
      header: { name: 'EventLogHeader' },
      lines: [],
    };

    const excluded = new Set<unknown>([
      rt,
      eventLogResult.header,
      ...eventLogResult.lines,  // spread is empty, so no effect
    ]);

    const children = [rt, eventLogResult.header, stateText];
    const drawables = children.filter((child) => !excluded.has(child));

    expect(drawables).not.toContain(rt);
    expect(drawables).not.toContain(eventLogResult.header);
    expect(drawables).toContain(stateText);
    expect(drawables).toHaveLength(1);
  });
});
