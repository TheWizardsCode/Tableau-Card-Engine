/**
 * Main Street: HUD Rendering
 *
 * Header, instructions, full/HUD refresh, challenge tracker, action buttons,
 * activity log, applicant panel, and upcoming-effect line.
 *
 * Import graph: depends only on `MainStreetRendererContext` (type).
 *
 * @module
 */

import { FONT_FAMILY, HintBar, clearTransientHud, markHudTransient } from '@ui';
import { attachHudTooltipZone, createMainStreetHintButton, mainStreetRenderCardSvg } from '@ui/Renderer/adapters/MainStreetAdapter';
import type { StaffCard } from '../MainStreetCards';
import { computeScore } from '../MainStreetEngine';
import { buildCardTooltipInfo, turnLabel, weekLabel } from '../MainStreetFormatting';
import { getAffordableBusinessCards, getAffordableUpgradeCards, getEmptySlots } from '../MainStreetMarket';
import type { SpecializationSkill } from '../MainStreetStaffSkills';
import { STAFF_SKILL_CHIP_COLORS, getSkill, hasPeekCapableStaff } from '../MainStreetStaffSkills';
import type { PendingApplicant } from '../MainStreetState';
import { BOX_STROKE, CHALLENGE_LINE_H, CHALLENGE_PAD, CHALLENGE_TITLE_H, HUD_BAR_HEIGHT_PX, LOG_COLORS, LOG_FONT_SIZE, LOG_LINE_H, LOG_PAD, LOG_TITLE_H } from './MainStreetConstants';
import { HUD_ARIA_LABELS, buildActionTooltip, buildCoinsToRepTooltip, buildCoinsTooltip, buildRepToCoinsTooltip, buildReputationTooltip, buildScoreTooltip } from './MainStreetHudTooltips';
import type { MainStreetRendererContext } from './MainStreetRendererContext';
import { buildUpgradeOverlaySpec } from './UpgradeOverlaySpec';
import type { UpgradeOverlaySpec } from './UpgradeOverlaySpec';
import { createActionButton, createSceneTitle } from '@ui/Renderer';
import Phaser from 'phaser';

// Re-export for test imports
export { buildUpgradeOverlaySpec, type UpgradeOverlaySpec };


// markHudTransient and clearTransientHud are now imported from src/ui/Renderer

export function createHeader(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    createSceneTitle(s, 'Main Street');
  
}

export function createInstructions(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    // Shared HintBar for hint/instruction display at bottom-center
    s.hintBar = new HintBar(s);

    // Keep legacy instructionText for backward compatibility (tests),
    // referencing the HintBar's underlying text object.
    s.instructionText = s.hintBar.textObject;
  
}

export function refreshAll(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    renderer.refreshHud();
    renderer.refreshStreetGrid();
    renderer.refreshMarket();
    renderer.refreshIncidentQueue();
    renderer.refreshPlayerHand();
    renderer.refreshActionButtons();
    renderer.refreshChallengeTracker();
    renderer.refreshLog();
    renderer.refreshApplicant();
    s.updateSvgDebugOverlay();
  
}

export function refreshAllExceptStreet(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    renderer.refreshHud();
    renderer.refreshMarket();
    renderer.refreshIncidentQueue();
    renderer.refreshPlayerHand();
    renderer.refreshActionButtons();
    renderer.refreshChallengeTracker();
    renderer.refreshLog();
    s.updateSvgDebugOverlay();
  
}

/**
 * Render the two Community Favour buttons inside the widened HUD strip
 * (CG-0MUFAITED0088AGN).
 *
 * The buttons live in `hudContainer` (so they render above the strip), are
 * `markHudTransient`-tagged (so `clearTransientHud` removes them on refresh),
 * and carry i18n tooltips + aria labels. They render only in the market /
 * applicant phases — the exchange is only legal in `MarketPhase`.
 */
function renderFavourButtons(s: MainStreetRendererContext['scene']): void {
  if (s.uiPhase !== 'market' && s.uiPhase !== 'applicant') return;

  const {
    favourCoinsToRepX, favourRepToCoinsX, favourButtonW, favourButtonH, hudY,
  } = s.layout;
  const favourY = hudY - favourButtonH / 2;

  const favourGone = s.state.favourUsedThisTurn;
  const coinsToRepCost = s.state.config.favourCoinsToRepCost;
  const repToCoinsRepCost = s.state.config.favourRepToCoinsRepCost;
  const repToCoinsCoinGain = s.state.config.favourRepToCoinsCoinGain;
  const coinsToRepDisabled = favourGone || s.state.resourceBank.coins < coinsToRepCost;
  const repToCoinsDisabled = favourGone || s.state.resourceBank.reputation < repToCoinsRepCost;

  const coinsToRepBtn = markHudTransient(createActionButton(
    s, favourCoinsToRepX, favourY, favourButtonW,
    `${coinsToRepCost}c → 1r`,
    () => s.onCommunityFavourClick('coins-to-rep'),
    {
      height: favourButtonH,
      fillColor: coinsToRepDisabled ? 0x2a2a2a : 0x442244,
      fillAlpha: 0.8,
      strokeColor: coinsToRepDisabled ? 0x444444 : 0xaa44aa,
      textColor: coinsToRepDisabled ? '#666666' : '#ff88ff',
      fontSize: '13px',
      disabled: coinsToRepDisabled,
    },
  ));
  s.hudContainer.add(coinsToRepBtn);

  const repToCoinsBtn = markHudTransient(createActionButton(
    s, favourRepToCoinsX, favourY, favourButtonW,
    `${repToCoinsRepCost}r → ${repToCoinsCoinGain}c`,
    () => s.onCommunityFavourClick('rep-to-coins'),
    {
      height: favourButtonH,
      fillColor: repToCoinsDisabled ? 0x2a2a2a : 0x224422,
      fillAlpha: 0.8,
      strokeColor: repToCoinsDisabled ? 0x444444 : 0x44aa44,
      textColor: repToCoinsDisabled ? '#666666' : '#88ff88',
      fontSize: '13px',
      disabled: repToCoinsDisabled,
    },
  ));
  s.hudContainer.add(repToCoinsBtn);

  if (!s.replayMode) {
    // Attach hover tooltips to the already-interactive button backgrounds
    // (`list[0]` is the background rectangle created by createActionButton).
    // `tapToggle: false` keeps the button's click action independent of the
    // tooltip; `alreadyInteractive: true` preserves the existing hit area.
    attachHudTooltipZone(
      s,
      coinsToRepBtn.list[0] as Phaser.GameObjects.Rectangle,
      HUD_ARIA_LABELS.favourCoinsToRep,
      () => buildCoinsToRepTooltip(s.state),
      { tapToggle: false, alreadyInteractive: true },
    );
    attachHudTooltipZone(
      s,
      repToCoinsBtn.list[0] as Phaser.GameObjects.Rectangle,
      HUD_ARIA_LABELS.favourRepToCoins,
      () => buildRepToCoinsTooltip(s.state),
      { tapToggle: false, alreadyInteractive: true },
    );
  }
}

export function refreshHud(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;

    // Remove only elements tagged as transient HUD items so that persistent overlay
    // objects (helpPanel, settingsPanel, buttons) that also reside in hudContainer are
    // not destroyed on each refresh.  Using removeAll(true) would destroy those persistent
    // children, breaking their parentContainer reference and causing the SidebarOverlay test
    // (and the live game) to lose the panels after the first refresh.
    clearTransientHud(s.hudContainer);

    const score = computeScore(s.state);
    // Deferred-mutation window (CG-0MTR72P14000VO6Q): while the end-of-turn
    // animations run (income collection and/or incident reveal), the HUD must
    // show the PRE-animation values captured at endTurn() start, not the post-
    // delta state — the numbers change only when the feedback lands. Falls
    // back to the current state outside the window (or when no pre-values
    // were captured, e.g. reduced-motion / replay paths).
    const deferredWindow = s.incomeCollectionActive === true || s.incidentRevealActive === true;
    const coins = deferredWindow && s.previousCoins !== null
      ? s.previousCoins
      : s.state.resourceBank.coins;
    const reputation = deferredWindow && s.previousReputation !== null
      ? s.previousReputation
      : s.state.resourceBank.reputation;
    const { hudLeft, hudRight, hudWidth, favourBandRight, hudY } = s.layout;

    // Background strip — market-aligned to `hudLeft`..`hudRight` (AC2,
    // CG-0MUFAISSZ002TE1B). `setOrigin(0, 0.5)` makes x the left edge, so the
    // strip spans exactly [hudLeft, hudLeft + hudWidth] with no half-width maths.
    const strip = markHudTransient(
      s.add.rectangle(hudLeft, hudY, hudWidth, HUD_BAR_HEIGHT_PX, 0x1a1408, 0.6),
    );
    strip.setOrigin(0, 0.5);
    strip.setStrokeStyle(1, BOX_STROKE, 0.5);
    s.hudContainer.add(strip);

    // Coins - left-aligned at the strip's left edge
    // Integer economy — HUD shows whole numbers (CG-0MTIO1M15001E9Y6).
    const coinText = markHudTransient(s.add.text(hudLeft + 10, hudY, `Coins: ${Math.round(coins)}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ffcc44', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5));
    s.hudContainer.add(coinText);

    // Reputation — left-aligned right of the reserved Community Favour band so
    // the two never overlap once the buttons move into the strip
    // (CG-0MUFAITED0088AGN).
    const repText = markHudTransient(s.add.text(favourBandRight + 40, hudY, `Reputation: ${Math.round(reputation)}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#88bbff', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5));
    s.hudContainer.add(repText);
    // Centre of the reputation text — used for the +/- delta pop position.
    const repX = repText.x + repText.width / 2;

    // Score - right-aligned at the strip's right edge (shows x / y where y is the win threshold)
    const scoreText = markHudTransient(s.add.text(hudRight - 10, hudY, `Score: ${Math.round(score)}/${s.state.config.winThreshold}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ff8844', fontFamily: FONT_FAMILY,
    }).setOrigin(1, 0.5));
    s.hudContainer.add(scoreText);

    // Week/year label — small text under the Score at the strip's right edge (CG-0MTT0K9RX0004QTE).
    const weekText = markHudTransient(s.add.text(
      hudRight - 10,
      hudY + 18,
      weekLabel(s.state.week, s.state.year),
      {
        fontSize: '12px',
        fontStyle: 'italic',
        color: '#aaaacc',
        fontFamily: FONT_FAMILY,
      }
    ).setOrigin(1, 0));
    s.hudContainer.add(weekText);

    // Community Favour buttons — inside the widened strip, between Coins and
    // Reputation (CG-0MUFAITED0088AGN).
    renderFavourButtons(s);

    // NOTE: the actions-remaining counter is intentionally NOT rendered in the
    // HUD strip. It lives in the action cluster above the End Turn button
    // (CG-0MUFAITX70081W41) so the player sees the action budget next to the
    // control it gates. Its tooltip moves with it (see `refreshActionButtons`).

    // HUD tooltip zones (desktop: pointer hover, mobile: tap toggle)
    if (!s.replayMode) {
      attachHudTooltipZone(s, coinText, HUD_ARIA_LABELS.coins, () => buildCoinsTooltip(s.state));
      attachHudTooltipZone(s, repText, HUD_ARIA_LABELS.rep, () => buildReputationTooltip(s.state));
      attachHudTooltipZone(s, scoreText, HUD_ARIA_LABELS.score, () => buildScoreTooltip(s.state, s.campaign));
    }

    s.animateHudValueChanges({
      coins,
      reputation,
      coinX: hudLeft + 70,
      repX,
      hudY,
    });
  
}

export function refreshChallengeTracker(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    s.challengeContainer.removeAll(true);

    const challenges = s.state.activeChallenges;
    if (challenges.length === 0) return;

    // Dynamic height based on number of challenges
    const panelH = CHALLENGE_TITLE_H + challenges.length * CHALLENGE_LINE_H + CHALLENGE_PAD * 2;
    const challengeW = s.layout.challengeW;

    // Panel background
    const bg = s.add.graphics();
    bg.fillStyle(0x1a1408, 0.85);
    bg.fillRoundedRect(0, 0, challengeW, panelH, 4);
    bg.lineStyle(1, BOX_STROKE, 0.5);
    bg.strokeRoundedRect(0, 0, challengeW, panelH, 4);
    s.challengeContainer.add(bg);

    // Title bar
    const titleBg = s.add.graphics();
    titleBg.fillStyle(0x332816, 0.9);
    titleBg.fillRoundedRect(0, 0, challengeW, CHALLENGE_TITLE_H, { tl: 4, tr: 4, bl: 0, br: 0 });
    s.challengeContainer.add(titleBg);

    const completedCount = challenges.filter((ac: any) => ac.completed).length;
    const titleText = s.add.text(
      challengeW / 2, CHALLENGE_TITLE_H / 2,
      `Challenges (${completedCount}/${challenges.length})`,
      { fontSize: '11px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY },
    ).setOrigin(0.5);
    s.challengeContainer.add(titleText);

    // Challenge list -- compact single-line rows: indicator + title + description
    let yOff = CHALLENGE_TITLE_H + CHALLENGE_PAD;
    for (const ac of challenges) {
      const isComplete = ac.completed;
      const indicator = isComplete ? '\u2713' : '\u2022';  // checkmark or bullet
      const color = isComplete ? '#44ff44' : '#ccbbaa';
      const nameColor = isComplete ? '#66aa66' : '#ddccbb';

      // Indicator
      const indicatorText = s.add.text(CHALLENGE_PAD, yOff, indicator, {
        fontSize: '13px', fontStyle: 'bold', color, fontFamily: FONT_FAMILY,
      }).setOrigin(0, 0);
      s.challengeContainer.add(indicatorText);

      // Challenge title
      const challengeText = s.add.text(
        CHALLENGE_PAD + 16, yOff,
        ac.challenge.title,
        {
          fontSize: '11px',
          fontStyle: isComplete ? 'italic' : 'normal',
          color: nameColor,
          fontFamily: FONT_FAMILY,
        },
      ).setOrigin(0, 0);
      s.challengeContainer.add(challengeText);

      // Description (right portion of the row)
      const descText = s.add.text(
        challengeW * 0.42, yOff,
        ac.challenge.description,
        {
          fontSize: '10px',
          color: isComplete ? '#558855' : '#998877',
          fontFamily: FONT_FAMILY,
          wordWrap: { width: challengeW * 0.56 },
        },
      ).setOrigin(0, 0);
      s.challengeContainer.add(descText);

      yOff += CHALLENGE_LINE_H;
    }
  
}

/**
 * Render the actions-remaining counter right-aligned above the action cluster's
 * button row, with the shared action tooltip attached (CG-0MUFAITX70081W41).
 *
 * The counter lives in `actionContainer` (never the HUD strip) so it sits next
 * to the End Turn / Cancel button it gates. `actionContainer.removeAll(true)`
 * on each refresh cleans it up — no transient tagging needed.
 */
function renderActionCounter(
  s: MainStreetRendererContext['scene'],
  rightX: number,
  by: number,
): Phaser.GameObjects.Text {
  const banked = s.state.bankedActions ?? 0;
  const actionLabel = `${s.state.actionsRemaining} action${s.state.actionsRemaining !== 1 ? 's' : ''} left`
    + (banked > 0 ? ` (${banked} banked)` : '');
  const actionText = s.add.text(rightX, by - 22, actionLabel, {
    fontSize: '14px', fontStyle: 'bold',
    color: s.state.actionsRemaining > 0 ? '#aaffaa' : '#ff6666',
    fontFamily: FONT_FAMILY,
  }).setOrigin(1, 1);
  s.actionContainer.add(actionText);
  if (!s.replayMode) {
    attachHudTooltipZone(s, actionText, HUD_ARIA_LABELS.action, () => buildActionTooltip(s.state));
  }
  return actionText;
}

export function refreshActionButtons(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    s.actionContainer.removeAll(true);

    // The applicant phase (CG-0MSTOATDU006UGAX) deliberately shares the
    // market action bar so End Turn stays reachable — ending the turn
    // auto-declines an unresolved applicant instead of stranding the player.
    if (s.uiPhase === 'market' || s.uiPhase === 'applicant') {
      const rightX = s.layout.gameW - 24;
      const by = s.layout.actionY;

      // Affordable summary
      const affordable = getAffordableBusinessCards(s.state);
      const upgradeable = getAffordableUpgradeCards(s.state);
      const emptySlots = getEmptySlots(s.state);

      const summaryParts: string[] = [];
      if (affordable.length > 0 && emptySlots.length > 0) {
        summaryParts.push(`${affordable.length} businesses`);
      }
      if (upgradeable.length > 0) {
        summaryParts.push(`${upgradeable.length} upgrades`);
      }
      const summaryStr = summaryParts.length > 0
        ? `Can buy: ${summaryParts.join(', ')}`
        : 'No affordable cards';

      const summary = s.add.text(rightX, by - 4, summaryStr, {
        fontSize: '12px', color: '#887766', fontFamily: FONT_FAMILY,
      }).setOrigin(1, 1);
      s.actionContainer.add(summary);

      // Actions-remaining counter — right-aligned, stacked above the summary
      // line and the End Turn button (CG-0MUFAITX70081W41).
      renderActionCounter(s, rightX, by);

      // End Turn button (right-aligned)
      const btnW = s.layout.actionButtonW;
      const hintBtnW = s.layout.hintButtonW;

      const endBtn = createActionButton(s, rightX - btnW, by + 4, btnW, 'End Turn', () => {
        s.endTurn();
      });
      s.actionContainer.add(endBtn);

      // Hint button (to the left of End Turn)
      const hintBtn = createMainStreetHintButton(
        s, rightX - btnW - 12 - hintBtnW, by + 4, hintBtnW, s.layout.actionButtonH,
        s.hintUsedThisTurn, () => s.onHintClick(),
      );
      s.actionContainer.add(hintBtn);

      // Peek button (staff peek skill, CG-0MSXOW6GN008ZSMN) — to the left of
      // the Hint button. Only offered while a peek-capable staff member is
      // employed; disabled once the once-per-turn gate is spent, when no
      // daily actions remain, or when the incident deck is empty.
      const hasPeekStaff = hasPeekCapableStaff(s.state);
      if (hasPeekStaff) {
        const peekDisabled = s.state.peekUsedThisTurn || s.state.actionsRemaining <= 0 || s.state.incidentDeck.length === 0;
        const peekBtn = createActionButton(
          s, rightX - btnW - 12 - hintBtnW - 12 - btnW, by + 4, btnW,
          peekDisabled ? 'Peek \u2713' : 'Peek',
          () => s.onPeekClick(),
          {
            height: s.layout.actionButtonH,
            fillColor: peekDisabled ? 0x2a2a2a : 0x224422,
            fillAlpha: 0.8,
            strokeColor: peekDisabled ? 0x444444 : 0x44aa44,
            textColor: peekDisabled ? '#666666' : '#88ff88',
            fontSize: '14px',
            disabled: peekDisabled,
          },
        );
        s.actionContainer.add(peekBtn);
      }

    } else if (s.uiPhase === 'placing-from-hand') {
      const rightX = s.layout.gameW - 24;
      const by = s.layout.actionY;

      const hand = s.state.hand ?? [];
      const handCount = hand.length;
      const selected = s.pendingHandIndex !== null ? hand[s.pendingHandIndex] : undefined;
      s.hintBar.setText(`Card in hand (${handCount}) — click an empty slot to place`);

      // Keep the action budget visible while placing from hand.
      renderActionCounter(s, rightX, by);

      const btnW = s.layout.actionButtonW;

      // Discard button — occupies the End Turn slot (rightmost action-bar
      // position), the same slot Cancel used to take alone. Discards the
      // selected hand card for reputation equal to its coin cost
      // (CG-0MTQ7KUVF009ELQK); no confirmation dialog.
      const repCost = selected?.cost ?? 0;
      const discardBtn = createActionButton(
        s, rightX - btnW, by + 4, btnW,
        repCost > 0 ? `Discard (-${repCost} rep)` : 'Discard',
        () => s.onDiscardHandCard(s.pendingHandIndex),
        {
          height: s.layout.actionButtonH,
          fillColor: 0x442222,
          fillAlpha: 0.8,
          strokeColor: 0xaa4444,
          textColor: '#ff8888',
          fontSize: '13px',
        },
      );
      s.actionContainer.add(discardBtn);

      // Cancel button (shifted left of Discard) — returns to market, card stays in hand
      const cancelBtn = createActionButton(s, rightX - 2 * btnW - 12, by + 4, btnW, 'Cancel', () => {
        s.pendingHandIndex = null;
        s.pendingHandJustMoved = false;
        s.justMovedHandCardId = null;
        s.clearMarketSelection();
        s.uiPhase = 'market';
        renderer.refreshAll();
        // Reset the HintBar to the standard market instruction (AC3).
        // s.instructionText is the same text object as s.hintBar.textObject,
        // so route the reset through HintBar explicitly for consistency.
        s.hintBar.setText(
          `${turnLabel(s.state.config, s.state.turn)} (${weekLabel(s.state.week, s.state.year)}) -- Buy cards from the market or End Turn`,
        );
      });
      s.actionContainer.add(cancelBtn);

    } else if (s.uiPhase === 'event-selected') {
      // Select-then-act for held event cards (CG-0MUEQ1BF000770B3): the
      // action bar offers [Play] (preserving the one-click play-event
      // behaviour) and [Discard] (in the End Turn slot, CG-0MTQ7KUVF009ELQK).
      const rightX = s.layout.gameW - 24;
      const by = s.layout.actionY;
      const btnW = s.layout.actionButtonW;

      const hand = s.state.hand ?? [];
      const selected = s.pendingHandIndex !== null ? hand[s.pendingHandIndex] : undefined;
      s.hintBar.setText('Event selected — Play it or Discard it');

      // Discard (rightmost — the End Turn slot).
      const repCost = selected?.cost ?? 0;
      const discardBtn = createActionButton(
        s, rightX - btnW, by + 4, btnW,
        repCost > 0 ? `Discard (-${repCost} rep)` : 'Discard',
        () => s.onDiscardHandCard(s.pendingHandIndex),
        {
          height: s.layout.actionButtonH,
          fillColor: 0x442222,
          fillAlpha: 0.8,
          strokeColor: 0xaa4444,
          textColor: '#ff8888',
          fontSize: '13px',
        },
      );
      s.actionContainer.add(discardBtn);

      // Play (left of Discard) — the existing one-click play-event path.
      const playBtn = createActionButton(
        s, rightX - 2 * btnW - 12, by + 4, btnW, 'Play',
        () => s.onPlayHeldEvent(s.pendingHandIndex ?? undefined),
        {
          height: s.layout.actionButtonH,
          fillColor: 0x224422,
          fillAlpha: 0.8,
          strokeColor: 0x44aa44,
          textColor: '#88ff88',
          fontSize: '13px',
        },
      );
      s.actionContainer.add(playBtn);

      // Cancel (left of Play) — clears the selection and returns to market.
      const cancelBtn = createActionButton(s, rightX - 3 * btnW - 24, by + 4, btnW, 'Cancel', () => {
        s.pendingHandIndex = null;
        s.clearMarketSelection();
        s.uiPhase = 'market';
        renderer.refreshAll();
      });
      s.actionContainer.add(cancelBtn);

    } else if (s.uiPhase === 'placing-business') {
      const rightX = s.layout.gameW - 24;
      const by = s.layout.actionY;

      const cardName = s.pendingBusinessCard?.name ?? '???';
      s.hintBar.setText(`Place "${cardName}" -- click an empty slot`);

      // Keep the action budget visible while placing a business.
      renderActionCounter(s, rightX, by);

      // Cancel button (right-aligned)
      const btnW = s.layout.actionButtonW;
      const cancelBtn = createActionButton(s, rightX - btnW, by + 4, btnW, 'Cancel', () => {
        s.pendingBusinessCard = null;
        s.pendingBusinessSourceIndex = null;
        s.clearMarketSelection();
        s.uiPhase = 'market';
        renderer.refreshAll();
        // Reset the HintBar to the standard market instruction (AC3).
        // s.instructionText is the same text object as s.hintBar.textObject,
        // so route the reset through HintBar explicitly for consistency.
        s.hintBar.setText(
          `${turnLabel(s.state.config, s.state.turn)} (${weekLabel(s.state.week, s.state.year)}) -- Buy cards from the market or End Turn`,
        );
      });
      s.actionContainer.add(cancelBtn);
    }

    // Staff applicant phase (CG-0MSTOATDU006UGAX): the market action bar
    // above stays available (Hire/Decline live on the applicant overlay
    // itself) so the player can resolve the applicant or End Turn to skip.
    if (s.uiPhase === 'applicant') {
      const applicantCard = s.pendingApplicant?.card;
      const name = applicantCard?.name ?? 'Staff Applicant';
      const salary = applicantCard?.ongoingCost ?? 0;
      s.hintBar.setText(
        `${name} — Hire (free, salary ${salary}/turn) or Decline; End Turn to skip`,
      );
    }
  
}

export function refreshLog(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    const entries = s.state.activityLog;
    const newCount = entries.length;

    // Visible area inside the panel (below title bar, above bottom edge)
    const visibleH = Math.max(1, s.layout.logH - LOG_TITLE_H - 4);

    // ── Re-render only if the entry count changed ────────────────
    if (newCount !== s.logPrevEntryCount) {
      s.logPrevEntryCount = newCount;

      // Render ALL entries to compute the true total content height.
      // Per-entry visibility (applied below) hides off-screen entries.
      s.logContentContainer.removeAll(true);

      const contentW = s.layout.logW - LOG_PAD * 2;
      let yOff = 0;

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry) continue;

        const color = LOG_COLORS[entry.type] ?? LOG_COLORS.neutral;
        const isTurnHeader = entry.type === 'turn-header';

        if (isTurnHeader) {
          // Subtle background bar for turn headers.
          // Use setPosition(0, yOff) so that barBg.y correctly reflects
          // the entry position, enabling per-entry visibility checks.
          const barBg = s.add.graphics();
          barBg.fillStyle(0x443311, 0.5);
          barBg.fillRect(0, 0, s.layout.logW, LOG_LINE_H);
          barBg.setPosition(0, yOff);
          s.logContentContainer.add(barBg);
        }

        const txt = s.add.text(LOG_PAD, yOff, entry.text, {
          fontSize: `${LOG_FONT_SIZE}px`,
          fontStyle: isTurnHeader ? 'bold' : 'normal',
          color,
          fontFamily: FONT_FAMILY,
          wordWrap: { width: contentW },
        });
        s.logContentContainer.add(txt);

        // Use actual rendered height to handle word-wrapped lines
        yOff += Math.max(LOG_LINE_H, txt.height + 2);
      }

      s.logTotalContentH = yOff;
    }

    // ── Compute scroll bounds using actual total content height ──
    if (s.logTotalContentH <= visibleH) {
      s.logMaxScroll = 0;
      s.logScrollOffset = 0;
    } else {
      s.logMaxScroll = s.logTotalContentH - visibleH;

      if (s.logAutoScroll) {
        s.logScrollOffset = s.logMaxScroll;
      } else {
        s.logScrollOffset = Phaser.Math.Clamp(s.logScrollOffset, 0, s.logMaxScroll);
      }

      const atBottom = s.logScrollOffset >= s.logMaxScroll - 4;
      s.logAutoScroll = atBottom;
    }

    // Apply scroll by shifting the content container upward.
    s.logContentContainer.setY(LOG_TITLE_H + 2 - s.logScrollOffset);

    // ── Per-entry visibility safety net ────────────────
    // Phaser 4 RC7's GeometryMask clip is unreliable. As a safety net,
    // explicitly hide any child whose local Y falls outside the visible
    // window [scrollOffset, scrollOffset + visibleH).
    // This ensures no content renders above the title bar or below the
    // panel bottom, regardless of whether the mask clips.
    const visibleStart = s.logScrollOffset;
    const visibleEnd = s.logScrollOffset + visibleH;
    for (const child of s.logContentContainer.list) {
      const localY = (child as any).y;
      if (localY >= visibleStart && localY < visibleEnd) {
        child.setVisible(true);
      } else {
        child.setVisible(false);
      }
    }

    s.updateLogMask();
  
}

export function refreshApplicant(renderer: MainStreetRendererContext): boolean {

    const s = renderer.scene as any;
    const pending = s.pendingApplicant as PendingApplicant | null;
    const isApplicantPhase = s.uiPhase === 'applicant';

    // ── Not presenting: tear down any stale overlay ──
    // Skip the teardown while an exit tween is mid-flight, otherwise the
    // tween would be animating a destroyed container.
    if (!isApplicantPhase || !pending) {
      if (!s.applicantAnimating) {
        (s as { clearApplicantOverlay?: () => void }).clearApplicantOverlay?.();
      }
      return false;
    }

    const card = pending.card as StaffCard;

    // ── Already rendered this applicant → leave it alone (no re-animate) ──
    if (s.applicantOverlayContainer && s.applicantRenderedId === card.id) {
      return true;
    }

    // New/changed applicant: rebuild from scratch.
    (s as { clearApplicantOverlay?: () => void }).clearApplicantOverlay?.();

    const container: Phaser.GameObjects.Container = s.add.container(0, 0);
    container.setName('applicantOverlay');
    // Above the action bar / hint bar (depth 100 within hudContainer) but
    // below modal overlays (199-201), so the applicant reads as a prominent
    // in-play decision without covering dialogs.
    container.setDepth(120);
    if (s.hudContainer) s.hudContainer.add(container);
    s.applicantOverlayContainer = container;
    s.applicantRenderedId = card.id;

    const cardW = s.layout.handCardW ?? 120;
    const cardH = s.layout.handCardH ?? 170;

    // ── Card face (local origin 0,0 = card centre) ──
    const cardImg = mainStreetRenderCardSvg(s, container, card.id, cardW, cardH);
    cardImg.setOrigin(0.5, 0.5).setDepth(10);

    // ── Skill-chip badges (same pattern as market-rendered staff cards) ──
    const skillIds = Array.isArray(card.specializationSkillIds)
      ? card.specializationSkillIds
      : [];
    const skills: SpecializationSkill[] = [];
    for (const id of skillIds) {
      try { skills.push(getSkill(id)); } catch { /* forward-compat */ }
    }
    let chipY = Math.round(cardH / 2 - 8);
    for (const skill of skills) {
      const chipBg = STAFF_SKILL_CHIP_COLORS[skill.category] ?? '#444455';
      const chip = s.add.text(0, chipY, skill.name, {
        fontSize: '8px',
        fontStyle: 'bold',
        color: '#ffffff',
        fontFamily: FONT_FAMILY,
        align: 'center',
        backgroundColor: chipBg,
        padding: { x: 3, y: 1 },
      });
      chip.setOrigin(0.5, 1);
      chip.setName(`applicantSkillBadge-${skill.id}`);
      chip.setDepth(11);
      container.add(chip);
      chipY -= 12;
    }

    // ── Business-type hint (CG-0MU3BTRGY0086CM9): the walk-on gate only
    // offers staff whose allowedBusinessTypes match a deployed business.
    // Surface the served types so the player sees why this applicant arrived.
    const types = Array.isArray(card.allowedBusinessTypes) && card.allowedBusinessTypes.length > 0
      ? card.allowedBusinessTypes.join('/')
      : 'Generalist';
    const typeHint = s.add.text(0, chipY, `Works: ${types}`, {
      fontSize: '8px',
      fontStyle: 'bold',
      color: '#ddeeff',
      fontFamily: FONT_FAMILY,
      align: 'center',
      backgroundColor: '#1a2f55',
      padding: { x: 3, y: 1 },
    });
    typeHint.setOrigin(0.5, 1);
    typeHint.setDepth(11);
    container.add(typeHint);

    // ── Interactive hover overlay (tooltip + pointer feedback) ──
    if (!s.replayMode) {
      const hover = s.add.rectangle(0, 0, cardW, cardH, 0x000000, 0.001);
      hover.setInteractive({ useHandCursor: true, cursor: 'pointer' });
      hover.on('pointerover', () => {
        const info = buildCardTooltipInfo(card, s.state.config);
        s.tooltipManager?.show(info, container.x, container.y);
      });
      hover.on('pointerout', () => s.tooltipManager?.hide());
      hover.setDepth(12);
      container.add(hover);
    }

    // ── Hire / Decline buttons, below the card (container-local coords) ──
    const btnW = Math.round(cardW * 0.62);
    const btnH = 30;
    const btnY = cardH / 2 + 12;
    const hireBtn = createActionButton(
      s, -cardW / 2, btnY, btnW, 'Hire',
      () => { s.onHireApplicant(); },
      {
        height: btnH,
        fillColor: 0x224422,
        fillAlpha: 0.9,
        strokeColor: 0x44aa44,
        textColor: '#88ff88',
        fontSize: '13px',
      },
    );
    hireBtn.setDepth(15);
    container.add(hireBtn);

    const declineBtn = createActionButton(
      s, 0, btnY, btnW, 'Decline',
      () => { s.onDeclineApplicant(); },
      {
        height: btnH,
        fillColor: 0x442222,
        fillAlpha: 0.9,
        strokeColor: 0xaa4444,
        textColor: '#ff8888',
        fontSize: '13px',
      },
    );
    declineBtn.setDepth(15);
    container.add(declineBtn);

    // ── Title + salary, above the card (container-local coords) ──
    const hint = s.add.text(0, -cardH / 2 - 30, `Staff Applicant: ${card.name || 'Unknown'}`, {
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ffdd88',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 0.5).setDepth(13);
    container.add(hint);

    const salaryText = s.add.text(0, -cardH / 2 - 12, `Salary: ${card.ongoingCost ?? 0}/turn`, {
      fontSize: '11px',
      color: '#ccaa66',
      fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 0.5).setDepth(14);
    container.add(salaryText);

    // ── Position from the SLL applicantOverlay zone, then walk on ──
    // The container position must be set before the walk-on tween: the
    // animator reads `container.x` as the destination.
    const centerX = s.layout.applicantCenterX ?? Math.round(s.layout.gameW / 2);
    const centerY = s.layout.applicantCenterY ?? Math.round(s.layout.gameH * 0.4);
    container.setPosition(centerX, centerY);

    if (s.msAnimator && !s.replayMode) {
      s.msAnimator.animateApplicantWalkOn(container, cardW, cardH, s.settingsPanel?.reducedMotion);
    }

    return true;
  
}

export function animateUpcomingEffectLine(renderer: MainStreetRendererContext, 
    effect: { sourceEventId: string; description: string },
    rowIndex: number,
  ): Phaser.GameObjects.Text[] {

    const s = renderer.scene;
    // Mirror drawUpcomingPanel's layout math so the animated line lands in
    // the same row the static effect lines use.
    const { logX, queueTop } = s.layout;
    const panelX = logX;
    const pad = 8;
    const titleH = 22;
    const contentX = panelX + pad;
    const rowStartY = queueTop + titleH + pad + s.layout.queueCardH + 6 + 18;
    const lineY = rowStartY + 16 * rowIndex;

    const warnIcon = String.fromCodePoint(0x26A0);
    const dash = String.fromCodePoint(0x2014);
    const text = warnIcon + ' ' + effect.description + ' ' + dash + ' New';

    const chars: Phaser.GameObjects.Text[] = [];
    for (let i = 0; i < text.length; i++) {
      const char = s.add.text(contentX + i * 7, lineY, text[i], {
        fontSize: '10px',
        color: '#ff6644',
        fontFamily: FONT_FAMILY,
      }).setOrigin(0, 0).setScale(0);
      s.incidentQueueContainer.add(char);
      chars.push(char);

      // Grow in (one-letter reveal): scale 0 → 1 with a Back overshoot.
      s.time.delayedCall(i * 40, () => {
        try {
          s.tweens.add({
            targets: char,
            scaleX: 1,
            scaleY: 1,
            duration: 180,
            ease: 'Back.easeOut',
          });
        } catch { /* ignore */ }
      });

      // Shrink settle for new effects: a quick scale pulse after the grow.
      s.time.delayedCall(i * 40 + 260, () => {
        try {
          s.tweens.add({
            targets: char,
            scaleX: 0.92,
            scaleY: 0.92,
            duration: 120,
            yoyo: true,
          });
        } catch { /* ignore */ }
      });
    }
    return chars;
  
}
