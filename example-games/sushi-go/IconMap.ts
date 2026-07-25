import type { SushiGoCard } from './SushiGoCards';

/**
 * Return the canonical icon key and filename (relative to `assets/sushi-go/`) for a card.
 * Keys match the filenames without extension (e.g. `icon-nigiri-salmon`).
 */
export function getIconKeyForCard(card: SushiGoCard): { key: string; filename: string } | null {
  switch (card.type) {
    case 'nigiri':
      return { key: `icon-nigiri-${card.variant}`, filename: `icon-nigiri-${card.variant}.svg` };
    case 'maki':
      return { key: `icon-maki-${card.icons}`, filename: `icon-maki-${card.icons}.svg` };
    case 'tempura':
      return { key: 'icon-tempura', filename: 'icon-tempura.svg' };
    case 'sashimi':
      return { key: 'icon-sashimi', filename: 'icon-sashimi.svg' };
    case 'dumpling':
      return { key: 'icon-dumpling', filename: 'icon-dumpling.svg' };
    case 'wasabi':
      return { key: 'icon-wasabi', filename: 'icon-wasabi.svg' };
    case 'pudding':
      return { key: 'icon-pudding', filename: 'icon-pudding.svg' };
    case 'chopsticks':
      return { key: 'icon-chopsticks', filename: 'icon-chopsticks.svg' };
    default:
      return null;
  }
}
