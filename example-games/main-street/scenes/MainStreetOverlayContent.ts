import { sellBusinessCommand, closeBusinessCommand, letGoStaffCommand } from '../MainStreetCommands';
import { canCloseBusiness } from '../MainStreetMarket';
import { addLog } from '../MainStreetState';
import type { EventCard, StaffCard } from '../MainStreetCards';
import { SFX_KEYS } from './MainStreetConstants';
import { DIFFICULTY_NAMES } from '../MainStreetDifficulty';
import type { TurnResult } from '../MainStreetEngine';
import { FONT_FAMILY, createOverlayBackground, createOverlayButton, dismissOverlay } from '../../../src/ui';
import { COMMON_SFX_KEYS, safePlaySound } from '../../../src/core-engine/SoundManager';
import { TIER_DEFINITIONS, ORDERED_TIER_DEFINITIONS, highestUnlockedTier } from '../MainStreetTiers';
import {
  isBuyAndPlacePremiumDialogDismissed,
  setBuyAndPlacePremiumDialogDismissed,
} from '../MainStreetPrefs';

export class MainStreetOverlayContent {
  constructor(private readonly scene: any) {}

  public showGameOverOverlay(
    result: TurnResult,
    newlyUnlockedTiers: string[] = [],
  ): void {
    const s = this.scene;
    s.uiPhase = 'game-over';
    s.refreshAll();

    const isWin = result.gameResult === 'win';
    const title = isWin ? 'You Win!' : 'Game Over';
    const color = isWin ? '#44ff44' : '#ff4444';

    // Per-challenge breakdown lines (rendered below score breakdown)
    const activeChallenges = s.state.activeChallenges;
    const challengeLineCount = activeChallenges.length;
    // Extra height: section header + one line per challenge
    const challengeExtraH = challengeLineCount > 0 ? 24 + challengeLineCount * 20 : 0;

    // ── Meta-progression section heights ──
    // Tier unlock notifications (conditional)
    let tierUnlockH = 0;
    if (newlyUnlockedTiers.length > 0) {
      tierUnlockH += 26; // section header
      tierUnlockH += newlyUnlockedTiers.length * 36; // tier name line + count line + spacing per tier
      tierUnlockH += 8; // bottom padding
    }
    // Current tier + campaign stats (always shown when campaign exists)
    const campaignH = s.campaign ? 80 : 0; // tier indicator + 3 stat lines + spacing

    const panelH = 360 + challengeExtraH + tierUnlockH + campaignH;

    // Overlay background & box (created by createOverlayBackground).
    const boxConfig = {
      width: 500,
      height: panelH,
      color: 0x000000,
      alpha: 1.0,
      depth: 100,
    };
    const overlay = createOverlayBackground(
      s,
      { depth: 100, alpha: 0.75 },
      boxConfig,
    );
    if (overlay.box) {
      const panelTop = s.layout.gameH / 2 - panelH / 2;
      // Position box center at panel top + panel height / 2
      overlay.box.y = panelTop + panelH / 2;
    }
    s.overlayObjects.push(...overlay.objects);

    // Game-over feedback (AGENTS.md rule 8): win → confetti burst + victory
    // fanfare; loss → low sting + brief board dim pulse. Non-blocking; the
    // animator skips itself in replay/headless mode and plays sound only
    // under reduced motion.
    s.msAnimator?.animateGameOver({
      win: isWin,
      width: s.layout.gameW,
      height: s.layout.gameH,
    });

    // Vertical anchor: centre of the panel
    const panelTop = s.layout.gameH / 2 - panelH / 2;

    // Title
    const titleText = s.add.text(s.layout.gameW / 2, panelTop + 30, title, {
      fontSize: '36px', fontStyle: 'bold', color, fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(101);
    if (s.hudContainer) s.hudContainer.add(titleText);
    s.overlayObjects.push(titleText);

    // End reason
    const reason = s.state.endReason ?? 'unknown';
    const reasonText = s.add.text(
      s.layout.gameW / 2, panelTop + 72,
      reason.replace(/_/g, ' '),
      { fontSize: '18px', color: '#ccbbaa', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5).setDepth(101);
    if (s.hudContainer) s.hudContainer.add(reasonText);
    s.overlayObjects.push(reasonText);

    // Score breakdown
    const { coins, reputation } = s.state.resourceBank;
    const challenges = s.state.challengesCompleted.length;
    const cfg = s.state.config;
    const lines = [
      // Integer economy — whole-number display (CG-0MTIO1M15001E9Y6).
      `Coins: ${Math.round(coins)}`,
      `Reputation: ${Math.round(reputation)}`,
      `Challenges: ${challenges} (x${cfg.challengeBonusPoints} = ${challenges * cfg.challengeBonusPoints})`,
      `Final Score: ${Math.round(result.finalScore)}`,
    ];
    const breakdownY = panelTop + 110;
    const breakdown = s.add.text(s.layout.gameW / 2, breakdownY, lines.join('\n'), {
      fontSize: '16px', color: '#ddccbb', fontFamily: FONT_FAMILY,
      align: 'center', lineSpacing: 6,
    }).setOrigin(0.5, 0).setDepth(101);
    if (s.hudContainer) s.hudContainer.add(breakdown);
    s.overlayObjects.push(breakdown);

    // Per-challenge breakdown (below score breakdown)
    let cursorY = breakdownY + 100; // approximate height of score breakdown text
    if (challengeLineCount > 0) {
      const sectionTitle = s.add.text(
        s.layout.gameW / 2, cursorY,
        'Challenge Details:',
        { fontSize: '14px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5, 0).setDepth(101);
      if (s.hudContainer) s.hudContainer.add(sectionTitle);
      s.overlayObjects.push(sectionTitle);
      cursorY += 22;

      for (const ac of activeChallenges) {
        const done = ac.completed;
        const icon = done ? '\u2713' : '\u2717'; // checkmark or cross
        const lineColor = done ? '#44ff44' : '#ff6666';
        const challengeLine = s.add.text(
          s.layout.gameW / 2, cursorY,
          `${icon}  ${ac.challenge.title}`,
          { fontSize: '13px', color: lineColor, fontFamily: FONT_FAMILY },
        ).setOrigin(0.5, 0).setDepth(101);
        if (s.hudContainer) s.hudContainer.add(challengeLine);
        s.overlayObjects.push(challengeLine);
        cursorY += 20;
      }
    }

    // ── Meta-progression: Tier Unlock Notifications ──
    if (newlyUnlockedTiers.length > 0) {
      cursorY += 8;
      const unlockHeader = s.add.text(
        s.layout.gameW / 2, cursorY,
        'Tier Unlocked!',
        { fontSize: '14px', fontStyle: 'bold', color: '#44ff44', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5, 0).setDepth(101);
      if (s.hudContainer) s.hudContainer.add(unlockHeader);
      s.overlayObjects.push(unlockHeader);
      cursorY += 22;

      for (const tierId of newlyUnlockedTiers) {
        const def = TIER_DEFINITIONS[tierId];
        if (!def) continue;

        // Find the milestone record to determine the trigger type
        const milestone = s.campaign?.milestoneHistory.find(
          (m: any) => m.tierId === tierId,
        );
        const triggerLabel = milestone?.triggerType === 'challenge'
          ? '(via challenges)' : '(via reputation)';

        const tierLine = s.add.text(
          s.layout.gameW / 2, cursorY,
          `NEW: Tier ${def.order} - ${def.name} ${triggerLabel}`,
          { fontSize: '13px', color: '#88ff88', fontFamily: FONT_FAMILY },
        ).setOrigin(0.5, 0).setDepth(101);
        if (s.hudContainer) s.hudContainer.add(tierLine);
        s.overlayObjects.push(tierLine);
        cursorY += 20;

        // Show count of new cards added by this tier
        const cardCount = def.newCardIds.length;
        const countLine = s.add.text(
          s.layout.gameW / 2, cursorY,
          `  + ${cardCount} new card${cardCount === 1 ? '' : 's'}`,
          { fontSize: '12px', color: '#aaddaa', fontFamily: FONT_FAMILY },
        ).setOrigin(0.5, 0).setDepth(101);
        if (s.hudContainer) s.hudContainer.add(countLine);
        s.overlayObjects.push(countLine);
        cursorY += 16;
      }
    }

    // ── Meta-progression: Current Tier + Campaign Stats ──
    if (s.campaign) {
      cursorY += 8;
      const highest = highestUnlockedTier(s.campaign.unlockedTiers);
      const tierCount = ORDERED_TIER_DEFINITIONS.length;
      const tierLabel = highest
        ? `Current Tier: ${highest.order} / ${tierCount} - ${highest.name}`
        : 'Current Tier: --';
      const tierIndicator = s.add.text(
        s.layout.gameW / 2, cursorY, tierLabel,
        { fontSize: '14px', fontStyle: 'bold', color: '#ddbb88', fontFamily: FONT_FAMILY },
      ).setOrigin(0.5, 0).setDepth(101);
      if (s.hudContainer) s.hudContainer.add(tierIndicator);
      s.overlayObjects.push(tierIndicator);
      cursorY += 22;

      const winRate = s.campaign.totalRuns > 0
        ? Math.round((s.campaign.totalWins / s.campaign.totalRuns) * 100)
        : 0;
      const statsLines = [
        `Runs: ${s.campaign.totalRuns}  |  Wins: ${s.campaign.totalWins}  (${winRate}%)`,
        `High Score: ${Math.round(s.campaign.highestScore)}  |  Best Rep: ${s.campaign.persistentReputation}`,
      ];
      const statsText = s.add.text(
        s.layout.gameW / 2, cursorY, statsLines.join('\n'),
        { fontSize: '13px', color: '#bbaa99', fontFamily: FONT_FAMILY, align: 'center', lineSpacing: 4 },
      ).setOrigin(0.5, 0).setDepth(101);
      if (s.hudContainer) s.hudContainer.add(statsText);
      s.overlayObjects.push(statsText);
    }

    // Difficulty selector
    const diffY = panelTop + panelH - 80;
    const diffLabel = s.add.text(
      s.layout.gameW / 2 - 80, diffY,
      `Difficulty: ${s.selectedDifficulty}`,
      { fontSize: '14px', color: '#ccbbaa', fontFamily: FONT_FAMILY },
    ).setOrigin(0, 0.5).setDepth(101);
    if (s.hudContainer) s.hudContainer.add(diffLabel);
    s.overlayObjects.push(diffLabel);

    const cycleBtn = s.add.text(
      s.layout.gameW / 2 + 90, diffY,
      '[ Change ]',
      { fontSize: '14px', color: '#ffdd88', fontFamily: FONT_FAMILY },
    ).setOrigin(0, 0.5).setDepth(101).setInteractive({ useHandCursor: true });
    cycleBtn.on('pointerdown', () => {
      const idx = DIFFICULTY_NAMES.indexOf(s.selectedDifficulty);
      s.selectedDifficulty = DIFFICULTY_NAMES[(idx + 1) % DIFFICULTY_NAMES.length];
      diffLabel.setText(`Difficulty: ${s.selectedDifficulty}`);
    });
    if (s.hudContainer) s.hudContainer.add(cycleBtn);
    s.overlayObjects.push(cycleBtn);

    // Buttons (positioned relative to panel bottom)
    const btnY = panelTop + panelH - 40;
    const playAgainBtn = createOverlayButton(
      s, s.layout.gameW / 2 - 110, btnY,
      '[ Play Again ]', 101,
    );
    playAgainBtn.on('pointerdown', () => {
      dismissOverlay(s.overlayObjects);
      s.overlayObjects = [];
      s.scene.restart();
    });
    if (s.hudContainer) s.hudContainer.add(playAgainBtn);
    s.overlayObjects.push(playAgainBtn);

    const menuBtn = createOverlayButton(
      s, s.layout.gameW / 2 + 110, btnY,
      '[ Menu ]', 101,
    );
    menuBtn.on('pointerdown', () => {
      dismissOverlay(s.overlayObjects);
      s.overlayObjects = [];
      s.scene.start('GameSelectorScene');
    });
    if (s.hudContainer) s.hudContainer.add(menuBtn);
    s.overlayObjects.push(menuBtn);
  }

  /**
   * Shows the Manage Card overlay for a card on the street grid.
   *
   * Presents card info, the sell refund, and [Sell] [Close] [Cancel] buttons.
   * Sell keeps its existing free/refund behaviour (the card stays on the grid
   * as an inert sold marker). Close spends exactly one daily action, grants no
   * coins, and removes the card from the street entirely so the slot becomes
   * placeable again — the action cost is charged by `closeBusinessCommand`
   * through the shared `consumeAction` enforcement point.
   *
   * All text/buttons are parented into `hudContainer` and use the overlay
   * depth convention (backdrop 199, box 200, interactive 201).
   *
   * When the card employs staff (job applicants, CG-0MSTOATDU006UGAX) the
   * dialog also lists them and offers `[ Lay off ]`, which charges 1 turn's
   * salary (clamped at 0 coins) + 1 reputation through `letGoStaffCommand`.
   *
   * @param slotIndex The grid slot index of the card to manage.
   * @param cardName  Display name of the card.
   * @param refund    Calculated sell refund amount in coins (Sell only).
   * @param info      Detailed card info text for display.
   */
  public showSellConfirmation(
    slotIndex: number,
    cardName: string,
    refund: number,
    info: string,
  ): void {
    const s = this.scene;

    // Staff employed at this street card (CG-0MSTOATDU006UGAX): surfaced here
    // so the player can actually let a member go. Their index in
    // `state.staffCards` is what `letGoStaffCommand` expects.
    const allStaff: StaffCard[] = (s.state.staffCards ?? []) as StaffCard[];
    const employedStaff = allStaff
      .map((member, index) => ({ member, index }))
      .filter(({ member }) => member.employedAtSlot === slotIndex);

    const panelW = 480;
    // Extra height for the employed-staff row when it is present.
    const panelH = employedStaff.length > 0 ? 410 : 360;
    const panelY = s.layout.gameH / 2 - panelH / 2;
    const centerX = s.layout.gameW / 2;

    // Overlay background with semi-transparent backdrop
    const boxConfig = {
      width: panelW,
      height: panelH,
      color: 0x000000,
      alpha: 1.0,
      depth: 200,
    };
    const overlay = createOverlayBackground(
      s,
      { depth: 199, alpha: 0.6 },
      boxConfig,
    );
    s.overlayObjects.push(...overlay.objects);

    // Title
    const titleText = s.add.text(centerX, panelY + 24, 'Manage Card', {
      fontSize: '22px', fontStyle: 'bold', color: '#ffcc44', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(201);
    if (s.hudContainer) s.hudContainer.add(titleText);
    s.overlayObjects.push(titleText);

    // Card info text
    const infoText = s.add.text(centerX, panelY + 58, info, {
      fontSize: '13px',
      color: '#ddccbb',
      fontFamily: FONT_FAMILY,
      align: 'center',
      lineSpacing: 4,
    }).setOrigin(0.5, 0).setDepth(201);
    if (s.hudContainer) s.hudContainer.add(infoText);
    s.overlayObjects.push(infoText);

    // Sell refund highlight (Sell only — Close grants no coins)
    const refundText = s.add.text(centerX, panelY + 186, `Sell refund: +€${refund}`, {
      fontSize: '20px', fontStyle: 'bold', color: '#44ff44', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(201);
    if (s.hudContainer) s.hudContainer.add(refundText);
    s.overlayObjects.push(refundText);

    // Close cost line — makes the 1-action / no-coins cost explicit
    const closeCostText = s.add.text(
      centerX, panelY + 214,
      'Close: costs 1 action, no refund — removes the card and frees the slot.',
      { fontSize: '12px', color: '#ffcc88', fontFamily: FONT_FAMILY, align: 'center' },
    ).setOrigin(0.5).setDepth(201);
    if (s.hudContainer) s.hudContainer.add(closeCostText);
    s.overlayObjects.push(closeCostText);

    // Sell button — existing free/refund behaviour, unchanged
    const sellBtn = createOverlayButton(
      s, centerX - 150, panelY + 265,
      '[ Sell ]', 201,
    );
    if (s.hudContainer) s.hudContainer.add(sellBtn);
    sellBtn.on('pointerdown', () => {
      // Execute the sell
      let sold = false;
      try {
        const cmd = sellBusinessCommand(s.state, slotIndex);
        // Execute via undo manager if available, otherwise direct
        if (s.undoManager) {
          s.undoManager.execute(cmd);
        } else {
          cmd.execute();
        }
        addLog(s.state, `Sold ${cardName} from slot ${slotIndex} for +${refund} coins`, 'gain');
        s.instructionText?.setText(`Sold ${cardName} for +€${refund}`);
        sold = true;
      } catch (e) {
        console.error('[Sell] Failed:', e);
        s.instructionText?.setText(`Error selling: ${(e as Error).message}`);
      }

      // Dismiss the overlay
      dismissOverlay(s.overlayObjects);
      s.overlayObjects = [];
      s.refreshAll();
      // Sell demolition + refund coin fly when the sale succeeded
      // (presentation-only; the dimmed SOLD state renders synchronously
      // above and the animator's snapshot reveals it after the demolition).
      if (sold) {
        const soldCard = s.state.streetGrid[slotIndex];
        try {
          void s.msAnimator.animateSell({
            slotIndex,
            refund,
            cardId: soldCard?.id ?? '',
            family: soldCard?.family === 'community-space' ? 'community-space' : 'business',
          });
        } catch (_) {
          // presentation-only — ignore
        }
      }
    });
    s.overlayObjects.push(sellBtn);

    // Close button — 1 action, no coins, removes the card from the street
    const closeBtn = createOverlayButton(
      s, centerX, panelY + 265,
      '[ Close ]', 201,
    );
    if (s.hudContainer) s.hudContainer.add(closeBtn);
    closeBtn.on('pointerdown', () => {
      let closed = false;
      let failureReason = 'unknown';
      let closedCardId = '';
      let closedFamily: 'business' | 'community-space' = 'business';
      try {
        const legality = canCloseBusiness(s.state, slotIndex, false);
        if (!legality.legal) {
          failureReason = legality.reason ?? 'unknown';
        } else {
          // Capture identity before the card is removed from the grid.
          const cardNow = s.state.streetGrid[slotIndex];
          closedCardId = cardNow?.id ?? '';
          closedFamily = cardNow?.family === 'community-space' ? 'community-space' : 'business';

          const cmd = closeBusinessCommand(s.state, slotIndex);
          if (s.undoManager) {
            s.undoManager.execute(cmd);
          } else {
            cmd.execute();
          }
          s.instructionText?.setText(`Closed ${cardName} (−1 action)`);
          closed = true;
        }
      } catch (e) {
        console.error('[Close] Failed:', e);
        failureReason = (e as Error).message;
      }

      // Dismiss the overlay
      dismissOverlay(s.overlayObjects);
      s.overlayObjects = [];
      s.refreshAll();

      if (closed) {
        // Demolition (card to discard) — no refund coin fly for a close.
        try {
          void s.msAnimator.animateClose({
            slotIndex,
            cardId: closedCardId,
            family: closedFamily,
          });
        } catch (_) {
          // presentation-only — ignore
        }
      } else {
        // Illegal close (no actions, sold, empty, wrong phase): auditable
        // feedback with no state mutation.
        safePlaySound(s, COMMON_SFX_KEYS.ILLEGAL_MOVE);
        s.instructionText?.setText(`Cannot close: ${failureReason}`);
      }
    });
    s.overlayObjects.push(closeBtn);

    // Cancel button
    const cancelBtn = createOverlayButton(
      s, centerX + 150, panelY + 265,
      '[ Cancel ]', 201,
    );
    if (s.hudContainer) s.hudContainer.add(cancelBtn);
    cancelBtn.on('pointerdown', () => {
      dismissOverlay(s.overlayObjects);
      s.overlayObjects = [];
      s.instructionText?.setText('Cancelled.');
    });
    s.overlayObjects.push(cancelBtn);

    // ── Employed staff / lay-off (CG-0MSTOATDU006UGAX) ──────────────
    // Only rendered when somebody is actually employed here — no empty row
    // and no button otherwise. Laying off the most recently hired member
    // costs 1 turn's salary (clamped at 0 coins) + 1 reputation.
    if (employedStaff.length > 0) {
      const names = employedStaff.map(({ member }) => member.name).join(', ');
      const staffLine = s.add.text(
        centerX, panelY + 305,
        `Employed here: ${names}\nLay off: costs 1 turn's salary + 1 reputation.`,
        { fontSize: '12px', color: '#ffcc88', fontFamily: FONT_FAMILY, align: 'center' },
      ).setOrigin(0.5).setDepth(201);
      if (s.hudContainer) s.hudContainer.add(staffLine);
      s.overlayObjects.push(staffLine);

      const layOffBtn = createOverlayButton(s, centerX, panelY + 352, '[ Lay off ]', 201);
      if (s.hudContainer) s.hudContainer.add(layOffBtn);
      layOffBtn.on('pointerdown', () => {
        const target = employedStaff[employedStaff.length - 1];
        let laidOff = false;
        try {
          const cmd = letGoStaffCommand(s.state, target.index);
          if (s.undoManager) {
            s.undoManager.execute(cmd);
          } else {
            cmd.execute();
          }
          addLog(
            s.state,
            `Laid off ${target.member.name} (−1 salary, −1 reputation)`,
            'loss',
          );
          s.instructionText?.setText(`Laid off ${target.member.name} (−1 reputation)`);
          laidOff = true;
        } catch (e) {
          console.error('[LayOff] Failed:', e);
          s.instructionText?.setText(`Error laying off: ${(e as Error).message}`);
        }

        dismissOverlay(s.overlayObjects);
        s.overlayObjects = [];
        s.refreshAll();

        // The member leaves the business: discard SFX, illegal-move feedback
        // on failure. Presentation-only — state is already committed above.
        safePlaySound(s, laidOff ? SFX_KEYS.DISCARD : COMMON_SFX_KEYS.ILLEGAL_MOVE);
      });
      s.overlayObjects.push(layOffBtn);
    }
  }

  /**
   * Shows the buy-and-play premium explainer dialog.
   *
   * Fires when a same-turn buy-and-play (click composite or drag) will incur
   * the +50% premium because no action is available (CG-0MT24X0SX007RLHN).
   * Explains the rule, offers Proceed / Cancel, and a persisted "Don't show
   * this again" checkbox (localStorage, mirroring SettingsStore patterns).
   *
   * @param cardName Display name of the card being placed.
   * @param onProceed Callback invoked when the player proceeds (placement
   *                  continues at the premium price).
   * @param onCancel  Callback invoked when the player cancels (placement
   *                  aborts, no coins deducted).
   */
  public showBuyAndPlacePremiumDialog(
    cardName: string,
    onProceed: () => void,
    onCancel: () => void,
  ): void {
    const s = this.scene;
    if (isBuyAndPlacePremiumDialogDismissed()) {
      // Preference persisted: dialog does not fire, placement proceeds.
      onProceed();
      return;
    }

    const panelW = 440;
    const panelH = 250;
    const panelY = s.layout.gameH / 2 - panelH / 2;

    // Overlay background with semi-transparent backdrop (depth 199 backdrop,
    // 200 box, 201 elements — UI Best Practices, AGENTS.md).
    const boxConfig = {
      width: panelW,
      height: panelH,
      color: 0x000000,
      alpha: 1.0,
      depth: 200,
    };
    const overlay = createOverlayBackground(
      s,
      { depth: 199, alpha: 0.6 },
      boxConfig,
    );
    s.overlayObjects.push(...overlay.objects);

    // Title
    const titleText = s.add.text(s.layout.gameW / 2, panelY + 25, 'Buy & Place Premium', {
      fontSize: '20px', fontStyle: 'bold', color: '#ffcc44', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(201);
    if (s.hudContainer) s.hudContainer.add(titleText);
    s.overlayObjects.push(titleText);

    // Explanation body
    const bodyText = s.add.text(s.layout.gameW / 2, panelY + 75,
      `Placing "${cardName}" in the same turn costs 50% more because you have no actions left.`,
      {
        fontSize: '14px',
        color: '#ddccbb',
        fontFamily: FONT_FAMILY,
        align: 'center',
        lineSpacing: 4,
        wordWrap: { width: panelW - 60 },
      },
    ).setOrigin(0.5, 0).setDepth(201);
    if (s.hudContainer) s.hudContainer.add(bodyText);
    s.overlayObjects.push(bodyText);

    // "Don't show this again" checkbox (toggleable text button)
    let dontShowAgain = false;
    const checkLabel = s.add.text(
      s.layout.gameW / 2, panelY + 145,
      '[ ] Don\'t show this again',
      { fontSize: '14px', color: '#ccbbaa', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5).setDepth(201).setInteractive({ useHandCursor: true });
    if (s.hudContainer) s.hudContainer.add(checkLabel);
    checkLabel.on('pointerdown', () => {
      dontShowAgain = !dontShowAgain;
      checkLabel.setText(dontShowAgain ? '[x] Don\'t show this again' : '[ ] Don\'t show this again');
    });
    s.overlayObjects.push(checkLabel);

    // Proceed button
    const proceedBtn = createOverlayButton(
      s, s.layout.gameW / 2 - 110, panelY + 195,
      '[ Proceed ]', 201,
    );
    if (s.hudContainer) s.hudContainer.add(proceedBtn);
    proceedBtn.on('pointerdown', () => {
      if (dontShowAgain) setBuyAndPlacePremiumDialogDismissed(true);
      dismissOverlay(s.overlayObjects);
      s.overlayObjects = [];
      onProceed();
    });
    s.overlayObjects.push(proceedBtn);

    // Cancel button
    const cancelBtn = createOverlayButton(
      s, s.layout.gameW / 2 + 40, panelY + 195,
      '[ Cancel ]', 201,
    );
    if (s.hudContainer) s.hudContainer.add(cancelBtn);
    cancelBtn.on('pointerdown', () => {
      if (dontShowAgain) setBuyAndPlacePremiumDialogDismissed(true);
      dismissOverlay(s.overlayObjects);
      s.overlayObjects = [];
      onCancel();
    });
    s.overlayObjects.push(cancelBtn);
  }

  /**
   * Shows the dual-choice incident dialog (CG-0MTSHG8RP008E128).
   *
   * Presented when `processEndOfTurn` pauses with `choicePending` after a
   * `hasChoices` incident was drawn (IncidentPhase). The player decides
   * whether to Accept (the event's stated consequence applies) or Reject
   * (the consequence is refused; an unknown escalation card is added to the
   * incident deck). No preview of the escalation is shown — only the two
   * buttons (AC13). Accepting or rejecting an incident is FREE (no action
   * cost) — the player is forced to respond, not choosing to engage.
   *
   * Overlay pattern compliance (AGENTS.md UI Best Practices):
   * createOverlayBackground + createOverlayButton from @ui; ALL elements are
   * parented into `s.hudContainer`; depths 199 (backdrop) / 200 (box) /
   * 201 (elements). Dialog appears instantly (no fade-in — reduced-motion
   * safe); button SFX plays through safePlaySound (respects mute/volume).
   * Cleanup on dismissal resets `s.overlayObjects`.
   *
   * @param event    The pending choice event (effect deferred).
   * @param onAccept Called when the player accepts the consequence.
   * @param onReject Called when the player refuses the consequence.
   */
  public showEventChoiceDialog(
    event: EventCard,
    onAccept: () => void,
    onReject: () => void,
  ): void {
    const s = this.scene;
    if (s.replayMode) return; // headless/replay: never present UI

    const panelW = 500;
    const panelH = 240;
    const panelY = s.layout.gameH / 2 - panelH / 2;

    // Overlay background with semi-transparent backdrop (199 / 200 / 201).
    const boxConfig = {
      width: panelW,
      height: panelH,
      color: 0x000000,
      alpha: 1.0,
      depth: 200,
    };
    const overlay = createOverlayBackground(
      s,
      { depth: 199, alpha: 0.6 },
      boxConfig,
    );
    s.overlayObjects.push(...overlay.objects);

    // Title: the event name (a decision is required).
    const titleText = s.add.text(s.layout.gameW / 2, panelY + 28, event.name, {
      fontSize: '21px', fontStyle: 'bold', color: '#ffcc44', fontFamily: FONT_FAMILY,
      align: 'center',
      wordWrap: { width: panelW - 60 },
    }).setOrigin(0.5).setDepth(201);
    if (s.hudContainer) s.hudContainer.add(titleText);
    s.overlayObjects.push(titleText);

    // Body: what Accept does (the card's stated effect). No preview of the
    // escalation either way — rejecting keeps the consequence unknown.
    const bodyText = s.add.text(
      s.layout.gameW / 2, panelY + 92,
      `An incident has occurred.\nAccept: ${event.effect}\nReject: refuse this consequence — a different event will replace it.`,
      {
        fontSize: '13px',
        color: '#ddccbb',
        fontFamily: FONT_FAMILY,
        align: 'center',
        lineSpacing: 4,
        wordWrap: { width: panelW - 70 },
      },
    ).setOrigin(0.5, 0).setDepth(201);
    if (s.hudContainer) s.hudContainer.add(bodyText);
    s.overlayObjects.push(bodyText);

    // Accept button — label carries the event name per AC14: "Service Workers
    // Strike (Accept)". Accepting is the safe path (no escalation).
    const acceptBtn = createOverlayButton(
      s, s.layout.gameW / 2 - 145, panelY + panelH - 45,
      `${event.name} (Accept)`, 201,
      { fontSize: '13px', color: '#88ff88', hoverColor: '#aaffaa' },
    );
    if (s.hudContainer) s.hudContainer.add(acceptBtn);
    acceptBtn.on('pointerdown', () => {
      // Button SFX always plays (reduced motion keeps sound).
      safePlaySound(s, COMMON_SFX_KEYS.UI_CLICK);
      dismissOverlay(s.overlayObjects);
      s.overlayObjects = [];
      onAccept();
    });
    s.overlayObjects.push(acceptBtn);

    // Reject button — bare "Reject": the player accepts an unknown
    // consequence may follow (AC15).
    const rejectBtn = createOverlayButton(
      s, s.layout.gameW / 2 + 145, panelY + panelH - 45,
      'Reject', 201,
      { fontSize: '13px', color: '#ffaa88', hoverColor: '#ffccaa' },
    );
    if (s.hudContainer) s.hudContainer.add(rejectBtn);
    rejectBtn.on('pointerdown', () => {
      safePlaySound(s, COMMON_SFX_KEYS.UI_CLICK);
      dismissOverlay(s.overlayObjects);
      s.overlayObjects = [];
      onReject();
    });
    s.overlayObjects.push(rejectBtn);
  }
}
