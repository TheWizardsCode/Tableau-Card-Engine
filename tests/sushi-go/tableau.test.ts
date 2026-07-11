import { describe, expect, it } from 'vitest';

import {
  computeEncounterOrder,
  computeTableauLayout,
  pairWasabiNigiri,
} from '../../example-games/sushi-go/scenes/SushiGoTableauHelpers';
import type { SushiGoCard } from '../../example-games/sushi-go/SushiGoCards';

function card(id: number, type: SushiGoCard['type'], icons: 1 | 2 | 3 = 1): SushiGoCard {
  switch (type) {
    case 'maki':
      return { id, type: 'maki', icons };
    case 'nigiri':
      return { id, type: 'nigiri', variant: 'salmon' };
    case 'tempura':
      return { id, type: 'tempura' };
    case 'sashimi':
      return { id, type: 'sashimi' };
    case 'dumpling':
      return { id, type: 'dumpling' };
    case 'wasabi':
      return { id, type: 'wasabi' };
    case 'pudding':
      return { id, type: 'pudding' };
    case 'chopsticks':
      return { id, type: 'chopsticks' };
  }
}

describe('SushiGoTableauHelpers', () => {
  it('computes encounter order without duplicates', () => {
    const tableau = [
      card(1, 'tempura'),
      card(2, 'nigiri'),
      card(3, 'tempura'),
      card(4, 'maki', 2),
    ];

    expect(computeEncounterOrder(tableau)).toEqual(['tempura', 'nigiri', 'maki']);
  });

  it('pairs wasabi with subsequent nigiri in play order', () => {
    const tableau = [
      card(1, 'wasabi'),
      card(2, 'tempura'),
      card(3, 'nigiri'),
      card(4, 'wasabi'),
      card(5, 'nigiri'),
    ];

    const { wasabiToNigiri, nigiriToWasabi } = pairWasabiNigiri(tableau);

    expect(wasabiToNigiri.get(1)).toBe(3);
    expect(wasabiToNigiri.get(4)).toBe(5);
    expect(nigiriToWasabi.get(3)).toBe(1);
    expect(nigiriToWasabi.get(5)).toBe(4);
  });

  it('computes centered group layout with progressive x offsets', () => {
    const groups = new Map([
      ['tempura', [card(1, 'tempura'), card(2, 'tempura')]],
      ['nigiri', [card(3, 'nigiri')]],
    ] as const);

    const layout = computeTableauLayout(
      ['tempura', 'nigiri'],
      groups as never,
      800,
      80,
      10,
      20,
    );

    expect(layout).toHaveLength(2);
    expect(layout[0].type).toBe('tempura');
    expect(layout[1].type).toBe('nigiri');
    expect(layout[0].startX).toBeLessThan(layout[1].startX);
    expect(layout[0].width).toBe(170); // 2 * (80 + 10) - 10
    expect(layout[1].width).toBe(80);  // 1 * (80 + 10) - 10
  });
});
