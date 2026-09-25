/**
 * Main Street: Market / Incident Rendering
 *
 * Market row + cards, market slot centres, front incident card, and the
 * incident queue.
 *
 * Import graph: depends only on `MainStreetRendererContext` (type).
 *
 * @module
 */

import { DEFAULT_DRAG_DISTANCE_THRESHOLD, FONT_FAMILY, createSelectionState } from '@ui';
import { mainStreetRenderCardSvg } from '@ui/Renderer/adapters/MainStreetAdapter';
import type { BusinessCard, CommunitySpaceCard, EventCard, StaffCard, UpgradeCard } from '../MainStreetCards';
import { MARKET_TOTAL_SLOTS } from '../MainStreetCards';
import { buildCardTooltipInfo } from '../MainStreetFormatting';
import { canRefreshMarket, refreshMarketCost } from '../MainStreetMarket';
import type { SpecializationSkill } from '../MainStreetStaffSkills';
import { STAFF_SKILL_CHIP_COLORS, getSkill } from '../MainStreetStaffSkills';
import { BOX_FILL, BOX_RADIUS, BOX_STROKE, CARD_BACK_TEMPLATE } from './MainStreetConstants';
import type { MainStreetRendererContext } from './MainStreetRendererContext';
import { buildUpgradeOverlaySpec } from './UpgradeOverlaySpec';
import type { UpgradeOverlaySpec } from './UpgradeOverlaySpec';
import { createActionButton } from '@ui/Renderer';
import Phaser from 'phaser';

// Re-export for test imports
export { buildUpgradeOverlaySpec, type UpgradeOverlaySpec };


// markHudTransient and clearTransientHud are now imported from src/ui/Renderer

export function refreshMarket(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    // Rebuild the per-row card registry for the deal-in animation.
    renderer.marketRowCards.clear();
    // Unregister market-card draggables before the containers are destroyed
    // so the drag-drop manager never holds stale game-object references.
    renderer.unregisterDragDraggables();
    s.marketContainer.removeAll(true);
    s.marketSelectionManager.clear();
    s.marketSelectionManager.clearTargets();
    s.marketSelectionByCardId.clear();
    s.selectedMarketCardId = null;

    const { marketTop, marketRowH, marketLeft, marketRight } = s.layout;

    // Wider section background — edges read from the single layout authority
    // (marketLeft/marketRight), never recomputed inline (CG-0MUFAIS8W0011LGQ).
    const bgLeft = marketLeft;
    const bgRight = marketRight;
    const totalH = marketRowH + 30;
    const bgBox = s.add.graphics();
    bgBox.fillStyle(BOX_FILL, 0.3);
    bgBox.fillRoundedRect(bgLeft, marketTop - 10, bgRight - bgLeft, totalH, BOX_RADIUS);
    bgBox.lineStyle(1, BOX_STROKE, 0.4);
    bgBox.strokeRoundedRect(bgLeft, marketTop - 10, bgRight - bgLeft, totalH, BOX_RADIUS);
    s.marketContainer.add(bgBox);

    // Section label centered over the wider box
    const sectionLabel = s.add.text((bgLeft + bgRight) / 2, marketTop - 4, 'Market', {
      fontSize: '13px', fontStyle: 'bold', color: '#887766', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5, 1);
    s.marketContainer.add(sectionLabel);

    // Single-row marketplace: exactly MARKET_TOTAL_SLOTS (3) cards, always
    // ≥1 business, random within 1–2B/0–1U/0–1E (CG-0MSTOATDT009BRX2).
    const { marketCardW, marketCardGap } = s.layout;
    const boxCenter = (bgLeft + bgRight) / 2;
    const totalCardsW = MARKET_TOTAL_SLOTS * marketCardW + (MARKET_TOTAL_SLOTS - 1) * marketCardGap;
    const startX = Math.round(boxCenter - totalCardsW / 2);

    renderer.drawMarketRow(
      marketTop + 6,
      'Market',
      'market',
      s.state.market.cards,
      MARKET_TOTAL_SLOTS,
      (card) => {
        if (card.family === 'business' || card.family === 'community-space') {
          s.onBusinessCardClick(card as BusinessCard);
        } else if (card.family === 'upgrade') {
          s.onUpgradeCardClick(card as UpgradeCard);
        } else if (card.family === 'staff') {
          // Staff cards are hired directly from the market row
          // (CG-0MT3KZOUX007GQ44) — never moved to the hand.
          s.onStaffCardClick(card as StaffCard);
        } else {
          s.onEventCardClick(card as EventCard);
        }
      },
      startX,
    );
  
}

export function drawMarketRow(renderer: MainStreetRendererContext, 
    y: number,
    rowLabel: string,
    rowKey: string,
    cards: readonly (BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard | StaffCard)[],
    maxSlots: number,
    onClick: (card: BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard | StaffCard) => void,
    alignmentStartX?: number,
  ): void {

    const s = renderer.scene;
    const { marketCardW, marketCardH, marketCardGap, marketLeft, marketRight } = s.layout;

    // Row label - also use for positioning deck count
    const label = s.add.text(40, y, rowLabel, {
      fontSize: '14px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0.5);
    s.marketContainer.add(label);

    // Determine card startX: an explicit alignmentStartX wins; otherwise
    // centre the row independently in the market box.
    const boxLeft = marketLeft;
    const boxRight = marketRight;
    const boxCenter = (boxLeft + boxRight) / 2;
    const totalCardsW = maxSlots * marketCardW + (maxSlots - 1) * marketCardGap;
    const startX = alignmentStartX ?? Math.round(boxCenter - totalCardsW / 2);

    for (let i = 0; i < maxSlots; i++) {
      const cx = startX + i * (marketCardW + marketCardGap);
      const card = cards[i];

      if (card && !s.hiddenTransferSourceCardIds.has(card.id)) {
        const cardObj = renderer.drawMarketCard(cx, y, card, onClick, rowKey, i);
        s.marketContainer.add(cardObj);
        const rowCards = renderer.marketRowCards.get(rowKey) ?? [];
        rowCards.push(cardObj);
        renderer.marketRowCards.set(rowKey, rowCards);
      } else {
        // Empty slot
        const empty = s.add.rectangle(
          cx + marketCardW / 2, y + marketCardH / 2,
          marketCardW, marketCardH, 0x222211, 0.3,
        );
        empty.setStrokeStyle(1, 0x333322);
        s.marketContainer.add(empty);
      }
    }

    // Deck info and re-roll button - immediately below the label.
    const deckY = y + 16;
    // Single row: show all deck counts + one Re-roll button.
    const bizCount = s.state.decks.business.length;
    const csCount = s.state.decks.communitySpace.length;
    const upgCount = s.state.decks.upgrade.length;
    const evtCount = s.state.decks.event.length;
    const deckText = s.add.text(40, deckY, `Biz: ${bizCount}  CS: ${csCount}  Upg: ${upgCount}  Evt: ${evtCount}`, {
      fontSize: '11px', color: '#776655', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0);
    s.marketContainer.add(deckText);

    // Re-roll button (single market refresh, Accountant discount applies).
    try {
      const refreshResult = canRefreshMarket(s.state);
      const canRefresh = refreshResult.legal;
      const refreshCost = refreshMarketCost(s.state);
      const btnW = Math.max(s.layout.smallButtonW, 110);
      const labelCenter = 40 + s.layout.marketLabelW / 2;
      const btnX = Math.round(labelCenter - btnW / 2);
      const btnY = deckY + 22;

      const labelText = `Re-roll (${refreshCost})`;

      const btn = createActionButton(s, btnX, btnY, btnW, labelText, canRefresh ? () => { s.onRefreshMarketClick(); } : () => {}, {
        disabled: !canRefresh,
        ...(canRefresh ? {} : { fillColor: 0x333333, fillAlpha: 0.6 }),
      });
      // Dim visual when not allowed, but keep interactive so tooltip can show
      try {
        const bg = (btn.list && btn.list[0]) as Phaser.GameObjects.Rectangle | undefined;
        if (bg) {
          if (!canRefresh && typeof bg.setFillStyle === 'function') {
            bg.setFillStyle(0x333333, 0.6);
          }

          // Tooltip for the Re-roll button
          const reasonSuffix = !canRefresh && refreshResult.reason ? `\n\n${refreshResult.reason}` : '';
          const info = `Pay €${refreshCost} to re-roll the market and replace all visible cards. Removed cards go to their discard piles. Available only during Market phase.${reasonSuffix}`;
          try {
            bg.on('pointerover', (pointer: any) => {
              if (s.tooltipManager) {
                s.tooltipManager.show(info, (pointer && pointer.worldX) || btn.x, (pointer && pointer.worldY) || btn.y);
                return;
              }
              try {
                if ((s as any)._tempRefreshMarketTooltip) {
                  (s as any)._tempRefreshMarketTooltip.destroy();
                  (s as any)._tempRefreshMarketTooltip = null;
                }
                const tt = s.add.text(btn.x, btn.y - s.layout.actionButtonH / 2 - 6, info, {
                  fontSize: '12px', color: '#ffffff', fontFamily: FONT_FAMILY, backgroundColor: 'rgba(0,0,0,0.85)', padding: { x: 6, y: 4 }, wordWrap: { width: 280 }, align: 'center'
                }).setOrigin(0.5, 1).setDepth(1000);
                (s as any)._tempRefreshMarketTooltip = tt;
              } catch (e) { /* ignore fallback errors */ }
            });
            bg.on('pointerout', () => {
              if (s.tooltipManager) {
                s.tooltipManager.hide();
                return;
              }
              try {
                if ((s as any)._tempRefreshMarketTooltip) {
                  (s as any)._tempRefreshMarketTooltip.destroy();
                  (s as any)._tempRefreshMarketTooltip = null;
                }
              } catch (_) { /* ignore */ }
            });
          } catch (_) { /* ignore */ }
        }
      } catch (_) { /* ignore tooltip attach errors in tests */ }

      s.marketContainer.add(btn);
    } catch (_) {
      // ignore UI errors in tests
    }
  
}

export function getMarketRowCards(renderer: MainStreetRendererContext, rowKey: 'market'): Phaser.GameObjects.Container[] {

    return renderer.marketRowCards.get(rowKey) ?? [];
  
}

export function getMarketSlotCenter(renderer: MainStreetRendererContext, 
    _rowKey: 'market',
    slotIndex: number,
  ): { x: number; y: number } {

    const s = renderer.scene;
    const { marketTop, marketLeft, marketRight, marketCardW, marketCardGap } = s.layout;
    const boxCenter = (marketLeft + marketRight) / 2;
    const totalCardsW = MARKET_TOTAL_SLOTS * marketCardW + (MARKET_TOTAL_SLOTS - 1) * marketCardGap;
    const startX = Math.round(boxCenter - totalCardsW / 2);
    const rowTop = marketTop + 6;
    return {
      x: startX + slotIndex * (marketCardW + marketCardGap) + marketCardW / 2,
      y: rowTop + s.layout.marketCardH / 2,
    };
  
}

export function drawMarketCard(renderer: MainStreetRendererContext, 
    x: number,
    y: number,
    card: BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard | StaffCard,
    onClick: (card: BusinessCard | CommunitySpaceCard | EventCard | UpgradeCard | StaffCard) => void,
    _rowKey: string,
    _slotIndex: number,
  ): Phaser.GameObjects.Container {

    const s = renderer.scene;
    const { marketCardW, marketCardH } = s.layout;
    const container = s.add.container(Math.round(x + marketCardW / 2), Math.round(y + marketCardH / 2));
    // Name every market card container up-front so it stays locatable
    // regardless of the interactive/action-budget gate below (click-only
    // cards such as upgrades would otherwise be unnamed once dimmed).
    container.setName(`ms-market-card-${card.id}`);

    // Determine if this is a non-purchasable Incident event
    const isIncidentEvent = card.family === 'event' && (card as EventCard).trigger === 'Incident';

    // Determine if this card is the hint recommendation
    const isHinted = s.hintedCardId !== null && card.id === s.hintedCardId;

    const renderW = Math.max(1, Math.round(marketCardW - 4));
    const renderH = Math.max(1, Math.round(marketCardH - 4));
    const baseStrokeColor = isHinted ? 0x44ffff : (isIncidentEvent ? 0x556688 : 0x888877);

    // Render card via shared adapter. Market business cards are always base
    // copies (never upgraded), so displayName is undefined for them; passing
    // it keeps the street renderer the primary display-name-aware site
    // (CG-0MT24MHGZ0025O20).
    mainStreetRenderCardSvg(s, container, card.id, renderW, renderH, (card as Partial<BusinessCard>).displayName);

    // For upgrade cards, add dynamic target text in the right column
    // (left-anchored at SVG TEXT_MIN_X 80 so it never bleeds into the
    // 64×64 graphic, x < 72 in SVG coords / -w/2+80 in container coords).
    if (card.family === 'upgrade') {
      const u = card as UpgradeCard;
      const targetLabel = `for ${u.targetBusiness}`;
      const rightColX = Math.round(-renderW / 2 + 80);
      const targetText = s.add.text(rightColX, Math.round(-renderH / 2 + 24), targetLabel, {
        fontSize: '9px',
        color: '#ddbb88',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        align: 'left',
      });
      targetText.setOrigin(0, 0);
      targetText.setName('upgradeTargetLabel');
      container.add(targetText);

      // Note: drag-and-drop premium cost text (e.g. "€600 (listed €400)")
      // was removed per producer audit — the badge conveyed no actionability
      // and was confusing to players. The premium pricing logic itself is
      // unchanged (see CG-0MSTOF1N5005PK2R / CG-0MT3IYSRL001VVUP).
    }

    // Apply income/reputation overlays for business and community-space cards
    if (card.family === 'business' || card.family === 'community-space') {
      renderer.applyUpgradeOverlays(container, card as BusinessCard | CommunitySpaceCard, renderW, renderH);

      // Note: drag-and-drop premium cost text was removed per producer audit
      // — the badge conveyed no actionability and was confusing to players.
      // The premium pricing logic itself is unchanged (CG-0MSTOF1N5005PK2R).
    }

    // Staff specialization skill badges (I5, CG-0MT4WXX1Q00860VP): each
    // applicant card shows its locked skill set (1-3 skills, I3) as
    // category-colored chips at the card bottom. Card-relative positioning
    // (same pattern as the premium label) — no absolute pixel coordinates.
    // Static text only, so reduced-motion preferences are inherently respected.
    if (card.family === 'staff') {
      const st = card as StaffCard;
      const skillIds = Array.isArray(st.specializationSkillIds) ? st.specializationSkillIds : [];
      const skills: SpecializationSkill[] = [];
      for (const id of skillIds) {
        try {
          skills.push(getSkill(id));
        } catch {
          // Unknown/stale id on a saved card — skip the chip (forward-compat).
        }
      }
      let chipY = Math.round(renderH / 2 - 8);
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
        chip.setName(`staffSkillBadge-${skill.id}`);
        chip.setDepth(1);
        container.add(chip);
        chipY -= 12;
      }
    }

    const selectionRing = s.add.rectangle(0, 0, marketCardW, marketCardH);
    selectionRing.setFillStyle(0x000000, 0);
    selectionRing.setStrokeStyle(2, 0x44ff66);
    selectionRing.setVisible(false);
    container.add(selectionRing);

    // Action economy gating (CG-0MSTOF1N5005PK2R): business/community-space
    // card purchases consume the daily action, so those cards are
    // non-interactive (dimmed) when the budget is spent. Staff hires also
    // consume an action (CG-0MT3KZOUX007GQ44), upgrades consume one when
    // moved to hand (CG-0MT3IYSRL001VVUP), and Investment events consume one
    // when taken to hand (CG-0MTFWBNL30043ZBM) — all gate on the budget.
    const noActions = s.state.actionsRemaining <= 0;
    const isBusinessLike = card.family === 'business' || card.family === 'community-space';
    const consumesAction =
      isBusinessLike || card.family === 'staff' || card.family === 'upgrade' || card.family === 'event';
    const interactiveEnabled =
      s.uiPhase === 'market' && !isIncidentEvent && !(consumesAction && noActions);
    const selection = createSelectionState({
      onStateChange: ({ selected, hovered }) => {
        if (selected) {
          s.selectedMarketCardId = card.id;
        } else if (s.selectedMarketCardId === card.id) {
          s.selectedMarketCardId = null;
        }

        if (hovered && interactiveEnabled) {
          selectionRing.setStrokeStyle(2, 0xffdd44);
          selectionRing.setVisible(true);
          container.setScale(1.05);
          return;
        }

        if (selected) {
          selectionRing.setStrokeStyle(2, 0x44ff66);
          selectionRing.setVisible(true);
          container.setScale(1.04);
          return;
        }

        selectionRing.setStrokeStyle(2, baseStrokeColor);
        selectionRing.setVisible(false);
        container.setScale(1.0);
      },
    });

    if (interactiveEnabled) {
      s.marketSelectionByCardId.set(card.id, selection);

      // Business, community-space AND upgrade cards in the Development row
      // are draggable. For business-like cards the gesture is drag-to-buy/
      // place onto an empty slot; for upgrades it is the same-turn
      // buy-and-play onto a matching business at the +50% premium
      // (CG-0MSTOF1N5005PK2R + CG-0MT3IYSRL001VVUP). Events stay click-only:
      // they are not part of the drag-drop row model (CG-0MSKSAREE007AYSZ +
      // operator decision A for the T13 Library drag support).
      const isUpgradeCard = card.family === 'upgrade';
      const isDraggableCard =
        (card.family === 'business' || card.family === 'community-space' || isUpgradeCard) &&
        !!s.dragDropManager && !s.replayMode;

      if (isDraggableCard) {
        // ── Draggable card (drag-to-buy/place) ────────────────
        // The container itself is the interactive object: the reusable
        // drag-drop module makes it draggable, and click-vs-drag
        // coexistence is preserved by firing the click path only when the
        // pointer did not move beyond the drag threshold (a pure click
        // still reaches onBusinessCardClick → buy-to-hand).
        const hitAreaRect = new Phaser.Geom.Rectangle(
          -marketCardW / 2, -marketCardH / 2, marketCardW, marketCardH,
        );
        s.dragDropManager.registerDraggable({
          gameObject: container,
          data: card.id,
          hitArea: hitAreaRect,
          canPickUp: () =>
            isUpgradeCard
              ? s.msTurnController.canPickUpUpgradeCard(card.id)
              : s.msTurnController.canPickUpBusinessCard(card.id),
          onDrop: (payload: any) =>
            isUpgradeCard
              ? s.msTurnController.onDragDropUpgrade(payload)
              : s.msTurnController.onDragDropBusiness(payload),
        });
        renderer.dragDropRegistered.add(container);
        container.setName(`ms-market-card-${card.id}`);

        const dragClickDistance =
          s.input?.dragDistanceThreshold ?? DEFAULT_DRAG_DISTANCE_THRESHOLD;
        container.on('pointerup', (pointer: Phaser.Input.Pointer) => {
          const moved = Phaser.Math.Distance.Between(
            pointer.downX, pointer.downY, pointer.x, pointer.y,
          );
          if (moved > dragClickDistance) return; // was a drag, not a click
          s.marketSelectionManager.select(selection);
          onClick(card);
        });
        container.on('pointerover', () => {
          selection.setHovered(true);
          const info = buildCardTooltipInfo(card, s.state.config, { includeEventDetail: true });
          s.tooltipManager?.show(info, container.x, container.y);
        });
        container.on('pointerout', () => {
          selection.setHovered(false);
          s.tooltipManager?.hide();
        });
        s.marketSelectionManager.registerTarget(container);
      } else {
        // ── Click-only card (event) ────────────────
        // Existing pointerdown-based path, unchanged. Upgrades take the
        // draggable branch above when the action budget allows.
        const hitArea = s.add.rectangle(0, 0, marketCardW, marketCardH, 0x000000, 0.001);
        hitArea.setInteractive({ useHandCursor: true });
        hitArea.on('pointerdown', () => {
          s.marketSelectionManager.select(selection);
          onClick(card);
        });
        hitArea.on('pointerover', () => {
          selection.setHovered(true);
          if (!s.replayMode) {
            const info = buildCardTooltipInfo(card, s.state.config, { includeEventDetail: true });
            s.tooltipManager?.show(info, container.x, container.y);
          }
        });
        hitArea.on('pointerout', () => {
          selection.setHovered(false);
          if (!s.replayMode) s.tooltipManager?.hide();
        });
        s.marketSelectionManager.registerTarget(hitArea);
        container.add(hitArea);
      }
    }

    // Dim visual feedback + tooltip for action-gaited cards (business /
    // community-space / staff hire / upgrades — CG-0MSTOF1N5005PK2R +
    // CG-0MT3KZOUX007GQ44 + CG-0MT3IYSRL001VVUP).
    // The card is dimmed so the player understands it is unavailable, but
    // hovering it still shows the FULL card tooltip (regardless of
    // remaining actions, CG-0MT24RFIV007NQMP) instead of a generic
    // "no actions" message.
    // NB: this MUST live OUTSIDE the `interactiveEnabled` gate above —
    // interactiveEnabled is false precisely when noActions is true, so an
    // in-gate block would be dead code (the original bug: tooltips were
    // suppressed entirely when actions were exhausted). We add a dedicated
    // tooltip-only hover rectangle (explicit hit area, unlike the
    // container-level setInteractive that previously suppressed pointer
    // events).
    if (consumesAction && noActions && !isIncidentEvent) {
      container.setAlpha(0.45);
      if (!s.replayMode) {
        const hover = s.add.rectangle(0, 0, marketCardW, marketCardH, 0x000000, 0.001);
        hover.setInteractive({ useHandCursor: false });
        hover.on('pointerover', () => {
          // Upgrades additionally state WHY they are unavailable: the full card
          // details stay (CG-0MT24RFIV007NQMP) and the blocking reason is added
          // alongside (CG-0MT3IYSRL001VVUP).
          const info = buildCardTooltipInfo(card, s.state.config, {
            includeEventDetail: true,
            noActionsRemaining: card.family === 'upgrade',
          });
          s.tooltipManager?.show(info, container.x, container.y);
        });
        hover.on('pointerout', () => s.tooltipManager?.hide());
        container.add(hover);
      }
    }

    return container;
  
}

export function getFrontIncidentCardCenter(renderer: MainStreetRendererContext): { x: number; y: number } {

    const s = renderer.scene;
    const { logX, logW, queueTop, queueCardH } = s.layout;
    const titleH = 22; // mirrors refreshIncidentQueue
    const pad = 8;     // mirrors refreshIncidentQueue
    return {
      x: logX + logW / 2,
      y: queueTop + titleH + pad + queueCardH / 2,
    };
  
}

export function refreshIncidentQueue(renderer: MainStreetRendererContext): void {

    const s = renderer.scene;
    s.incidentQueueContainer.removeAll(true);

    const deckRemaining = s.state.incidentDeck.length;
    const activeEffects = s.state.activeEffects;

    const { logX, logW, queueTop } = s.layout;

    // Same panel width and left-edge as the activity log
    const panelX = logX;
    const panelW = logW;
    const pad = 8;
    const titleH = 22;
    const contentX = panelX + pad;

    // Calculate dynamic height. The panel now shows a single face-down
    // incident-deck card back (CG-0MSXOWLHU0099QF6) plus the remaining-deck
    // count — incident content is never visible before its turn.
    const activeEffectLines = activeEffects.length;
    const extraH = activeEffectLines > 0 ? 16 + activeEffectLines * 16 : 0;
    const cardRenderW = s.layout.queueCardW;
    const cardRenderH = s.layout.queueCardH;
    const cardAreaH = cardRenderH + 6 + 12; // one face-down card + deck count
    const panelH = titleH + pad + cardAreaH + extraH + pad;

    // Panel background — same warm-dark style as activity log
    const bg = s.add.graphics();
    bg.fillStyle(0x1a1408, 0.85);
    bg.fillRoundedRect(panelX, queueTop, panelW, panelH, 4);
    bg.lineStyle(1, BOX_STROKE, 0.5);
    bg.strokeRoundedRect(panelX, queueTop, panelW, panelH, 4);
    s.incidentQueueContainer.add(bg);

    // Title bar — same style as activity log
    const titleBg = s.add.graphics();
    titleBg.fillStyle(0x332816, 0.9);
    titleBg.fillRoundedRect(panelX, queueTop, panelW, titleH, { tl: 4, tr: 4, bl: 0, br: 0 });
    s.incidentQueueContainer.add(titleBg);

    const titleText = s.add.text(panelX + panelW / 2, queueTop + titleH / 2, 'Upcoming', {
      fontSize: '12px', fontStyle: 'bold', color: '#aa9977', fontFamily: FONT_FAMILY,
    }).setOrigin(0.5);
    s.incidentQueueContainer.add(titleText);

    // Face-down deck stack — a single card back centred in the panel. The
    // top of the incident deck is intentionally NOT revealed: incident
    // content only appears when it resolves at end of turn (or via the
    // staff peek skill, CG-0MSXOW6GN008ZSMN).
    const cx = panelX + (panelW - cardRenderW) / 2;
    let cardY = queueTop + titleH + pad;

    const container = s.add.container(Math.round(cx + cardRenderW / 2), Math.round(cardY + cardRenderH / 2));
    mainStreetRenderCardSvg(s, container, CARD_BACK_TEMPLATE, cardRenderW, cardRenderH);
    s.incidentQueueContainer.add(container);
    cardY += cardRenderH + 6;

    // Deck count below the stack
    const deckText = s.add.text(contentX, cardY, 'Deck: ' + deckRemaining, {
      fontSize: '11px', color: '#776655', fontFamily: FONT_FAMILY,
    }).setOrigin(0, 0);
    s.incidentQueueContainer.add(deckText);
    cardY += 18;

    // Active Effects indicator
    if (activeEffectLines > 0) {
      for (let i = 0; i < activeEffects.length; i++) {
        const effect = activeEffects[i];
        const warnIcon = String.fromCodePoint(0x26A0);
        const dash = String.fromCodePoint(0x2014);
        const effectText = s.add.text(contentX, cardY, warnIcon + ' ' + effect.description + ' ' + dash + ' ' + effect.turnsRemaining + ' turn' + (effect.turnsRemaining !== 1 ? 's' : ''), {
          fontSize: '10px', color: '#ff6644', fontFamily: FONT_FAMILY,
        }).setOrigin(0, 0);
        s.incidentQueueContainer.add(effectText);

        if (!s.replayMode) {
          const hitArea = s.add.rectangle(
            panelX + panelW / 2, cardY + 8, panelW - 20, 14, 0x000000, 0.001,
          ).setInteractive({ useHandCursor: true });
          hitArea.on('pointerover', () => {
            s.tooltipManager?.show(
              'Active: ' + effect.description + '\n' + Math.round(effect.multiplier * 100) + '% modifier ' + dash + ' ' + effect.turnsRemaining + ' turn' + (effect.turnsRemaining !== 1 ? 's' : '') + ' remaining',
              hitArea.x, hitArea.y,
            );
          });
          hitArea.on('pointerout', () => s.tooltipManager?.hide());
          s.incidentQueueContainer.add(hitArea);
        }
        cardY += 16;
      }
    }
  
}
