import type { Adjustment, FamilySummary } from './algorithm';
import { rationaleLabel } from './rationale';

export function formatSummaryTable(
  adjustments: Adjustment[],
  summaries: FamilySummary[],
  totalCards: number,
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═'.repeat(80));
  lines.push('  BALANCING PASS SUMMARY');
  lines.push('═'.repeat(80));
  lines.push('');

  lines.push('─── Per-Family Summary ───');
  lines.push('');

  const familyHeader =
    'Family'.padEnd(18) +
    'Tot/Adj'.padEnd(10) +
    'Cost Range (old)'.padEnd(22) +
    'Cost Range (new)'.padEnd(22) +
    'Reward Range (old)'.padEnd(20) +
    'Reward Range (new)';
  lines.push(familyHeader);
  lines.push('─'.repeat(familyHeader.length));

  for (const s of summaries) {
    const row =
      s.family.padEnd(18) +
      `${s.totalCards}/${s.cardsAdjusted}`.padEnd(10) +
      `[${s.oldCostMin}-${s.oldCostMax}]`.padEnd(22) +
      `[${s.newCostMin}-${s.newCostMax}]`.padEnd(22) +
      `[${s.oldRewardMin}-${s.oldRewardMax}]`.padEnd(20) +
      `[${s.newRewardMin}-${s.newRewardMax}]`;
    lines.push(row);
  }

  lines.push('');
  lines.push(`Total cards processed: ${totalCards}`);
  const realAdjustments = adjustments.filter(a => a.oldValue !== a.newValue && a.rationale !== 'INCIDENT_FREE');
  lines.push(`Total adjustments: ${realAdjustments.length}`);
  lines.push('');

  if (realAdjustments.length > 0) {
    lines.push('─── Detailed Adjustments ───');
    lines.push('');

    const detailHeader =
      'Card'.padEnd(24) +
      'Family'.padEnd(16) +
      'Field'.padEnd(18) +
      'Old'.padEnd(10) +
      'New'.padEnd(10) +
      'Rationale';
    lines.push(detailHeader);
    lines.push('─'.repeat(detailHeader.length));

    const byCard = new Map<string, Adjustment[]>();
    for (const a of realAdjustments) {
      if (!byCard.has(a.cardId)) byCard.set(a.cardId, []);
      byCard.get(a.cardId)!.push(a);
    }

    for (const [_cardId, cardAdj] of byCard) {
      const first = cardAdj[0];
      for (let i = 0; i < cardAdj.length; i++) {
        const a = cardAdj[i];
        const prefix = i > 0 ? ' '.repeat(24 + 16) : `${first.cardName} (${a.cardId})`.padEnd(24) + first.family.padEnd(16);
        const rationale = rationaleLabel(a.rationale).split(' ').slice(0, 4).join(' ');
        lines.push(prefix + a.field.padEnd(18) + String(a.oldValue).padEnd(10) + String(a.newValue).padEnd(10) + rationale);
      }
    }

    lines.push('');
  }

  lines.push('─── Rationale Codes ───');
  lines.push('');
  const usedCodes = new Set(realAdjustments.map(a => a.rationale));
  for (const code of usedCodes) {
    lines.push(`  ${code}: ${rationaleLabel(code)}`);
  }
  lines.push('');

  return lines.join('\n');
}
