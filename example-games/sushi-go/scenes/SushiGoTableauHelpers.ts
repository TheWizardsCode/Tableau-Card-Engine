import type { SushiGoCard, SushiGoCardType } from '../SushiGoCards';

export interface TableauLayoutItem {
  type: SushiGoCardType;
  cards: SushiGoCard[];
  startX: number;
  width: number;
}

export interface WasabiPairing {
  readonly wasabiToNigiri: Map<number, number>;
  readonly nigiriToWasabi: Map<number, number>;
}

export function computeEncounterOrder(tableau: SushiGoCard[]): SushiGoCardType[] {
  const seen = new Set<SushiGoCardType>();
  const order: SushiGoCardType[] = [];

  for (const card of tableau) {
    if (seen.has(card.type)) {
      continue;
    }
    seen.add(card.type);
    order.push(card.type);
  }

  return order;
}

export function pairWasabiNigiri(tableau: SushiGoCard[]): WasabiPairing {
  const wasabiToNigiri = new Map<number, number>();
  const nigiriToWasabi = new Map<number, number>();
  const queue: number[] = [];

  for (const card of tableau) {
    if (card.type === 'wasabi') {
      queue.push(card.id);
      continue;
    }

    if (card.type !== 'nigiri' || queue.length === 0) {
      continue;
    }

    const wasabiId = queue.shift()!;
    wasabiToNigiri.set(wasabiId, card.id);
    nigiriToWasabi.set(card.id, wasabiId);
  }

  return { wasabiToNigiri, nigiriToWasabi };
}

export function computeTableauLayout(
  order: SushiGoCardType[],
  groups: Map<SushiGoCardType, SushiGoCard[]>,
  gameWidth: number,
  cardWidth: number,
  cardGap: number,
  groupGap: number,
): TableauLayoutItem[] {
  const prepared = order
    .map((type) => {
      const cards = groups.get(type) ?? [];
      if (cards.length === 0) {
        return null;
      }

      const width = cards.length * (cardWidth + cardGap) - cardGap;
      return { type, cards, width };
    })
    .filter((item): item is { type: SushiGoCardType; cards: SushiGoCard[]; width: number } => item !== null);

  const totalWidth = prepared.reduce((sum, item) => sum + item.width, 0)
    + Math.max(0, prepared.length - 1) * groupGap;

  let cursorX = (gameWidth - totalWidth) / 2;

  return prepared.map((item) => {
    const layoutItem: TableauLayoutItem = {
      type: item.type,
      cards: item.cards,
      startX: cursorX,
      width: item.width,
    };
    cursorX += item.width + groupGap;
    return layoutItem;
  });
}
