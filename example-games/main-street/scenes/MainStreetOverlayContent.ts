import { sellBusinessCommand } from '../MainStreetCommands';
import { addLog } from '../MainStreetState';
import { DIFFICULTY_NAMES } from '../MainStreetDifficulty';
import { CARD_TEMPLATE_NAMES } from '../MainStreetCards';
import type { TurnResult } from '../MainStreetEngine';
import { FONT_FAMILY, createOverlayBackground, createOverlayButton, dismissOverlay } from '../../../src/ui';
import { TIER_DEFINITIONS, ORDERED_TIER_DEFINITIONS, highestUnlockedTier } from '../MainStreetTiers';

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
      for (const tierId of newlyUnlockedTiers) {
        tierUnlockH += 20; // tier name line
        const def = TIER_DEFINITIONS[tierId];
        if (def) tierUnlockH += def.newCardIds.length * 16; // card list
      }
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
      `Coins: ${coins}`,
      `Reputation: ${reputation} (x${cfg.reputationScoreMultiplier} = ${reputation * cfg.reputationScoreMultiplier})`,
      `Challenges: ${challenges} (x${cfg.challengeBonusPoints} = ${challenges * cfg.challengeBonusPoints})`,
      `Final Score: ${result.finalScore}`,
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

        // List the new cards added by this tier
        for (const cardId of def.newCardIds) {
          const cardName = CARD_TEMPLATE_NAMES.get(cardId) ?? cardId;
          const cardLine = s.add.text(
            s.layout.gameW / 2, cursorY,
            `  + ${cardName}`,
            { fontSize: '12px', color: '#aaddaa', fontFamily: FONT_FAMILY },
          ).setOrigin(0.5, 0).setDepth(101);
          if (s.hudContainer) s.hudContainer.add(cardLine);
          s.overlayObjects.push(cardLine);
          cursorY += 16;
        }
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
        `High Score: ${s.campaign.highestScore}  |  Best Rep: ${s.campaign.persistentReputation}`,
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
   * Shows a sell confirmation overlay for a card on the street grid.
   * Presents card info, refund amount, and Sell / Cancel buttons.
   *
   * @param slotIndex The grid slot index of the card to sell.
   * @param cardName  Display name of the card.
   * @param refund    Calculated refund amount in coins.
   * @param info      Detailed card info text for display.
   */
  public showSellConfirmation(
    slotIndex: number,
    cardName: string,
    refund: number,
    info: string,
  ): void {
    const s = this.scene;

    const panelW = 360;
    const panelH = 260;
    const panelY = s.layout.gameH / 2 - panelH / 2;

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
    const titleText = s.add.text(s.layout.gameW / 2, panelY + 25, 'Sell Card', {
      fontSize: '22px', fontStyle: 'bold', color: '#ffcc44', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(201);
    s.overlayObjects.push(titleText);

    // Card info text
    const infoText = s.add.text(s.layout.gameW / 2, panelY + 65, info, {
      fontSize: '13px',
      color: '#ddccbb',
      fontFamily: FONT_FAMILY,
      align: 'center',
      lineSpacing: 4,
    }).setOrigin(0.5, 0).setDepth(201);
    s.overlayObjects.push(infoText);

    // Refund highlight
    const refundText = s.add.text(s.layout.gameW / 2, panelY + 155, `Refund: +€${refund}`, {
      fontSize: '20px', fontStyle: 'bold', color: '#44ff44', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5).setDepth(201);
    s.overlayObjects.push(refundText);

    // Sell button
    const sellBtn = createOverlayButton(
      s, s.layout.gameW / 2 - 100, panelY + 190,
      '[ Sell ]', 201,
    );
    sellBtn.on('pointerdown', () => {
      // Execute the sell
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
      } catch (e) {
        console.error('[Sell] Failed:', e);
        s.instructionText?.setText(`Error selling: ${(e as Error).message}`);
      }

      // Dismiss the overlay
      dismissOverlay(s.overlayObjects);
      s.overlayObjects = [];
      s.refreshAll();
    });
    s.overlayObjects.push(sellBtn);

    // Cancel button
    const cancelBtn = createOverlayButton(
      s, s.layout.gameW / 2 + 30, panelY + 190,
      '[ Cancel ]', 201,
    );
    cancelBtn.on('pointerdown', () => {
      dismissOverlay(s.overlayObjects);
      s.overlayObjects = [];
      s.instructionText?.setText('Sale cancelled.');
    });
    s.overlayObjects.push(cancelBtn);
  }
}
