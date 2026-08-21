#!/usr/bin/env python3
"""Design + validate the 12-tier assignment for Main Street card-data.csv.

Goal (user request): fewer cards per tier than the 5-tier rebalance
(T1=27..T5=30). 12 tiers x ~10-15 cards = 142 total templates.

Constraints (all hard, enforced in main()):
- Every card gets a tier 1..12 (all 5 families).
- Tutorial pins: the tutorial scenario builds decks from
  `deriveUnlockedCardIds(['tier-1'])`, so the following cards MUST be in
  tier 1 (biz-bakery, biz-laundromat, biz-bookshop, cs-library,
  evt-festival, evt-award, evt-rainy).
- Upgrade tier >= target business/cs tier (an upgrade must not unlock before
  its target; same tier = fine, later = fine).
- No single family > 42% of any tier (event family is 39% of the catalog;
  with ~12 cards/tier a 5-event tier is 41.7%, the max allowed).
- Roughly equal total cards per tier (10-15).
- Cost ladder: cheaper cards earlier, expensive later (per family, advisory).
"""

import csv
import sys
from collections import defaultdict

TIERS = 12

# ── Proposed assignment: card_id -> tier ──────────────────────────────
# Business tiers (cost ladder: 3..16)
BIZ = {
    # T1 - starter businesses incl. tutorial-pinned biz-bakery/laundromat/bookshop
    'biz-bakery': 1, 'biz-diner': 1, 'biz-bookshop': 1, 'biz-laundromat': 1,
    # T2
    'biz-hardware': 2, 'biz-boutique': 2, 'biz-pawnshop': 2,
    # T3
    'biz-arcade': 3,
    # T4
    'biz-food-truck': 4, 'biz-barbershop': 4,
    # T5
    'biz-cinema': 5, 'biz-florist': 5, 'biz-juice-bar': 5,
    # T6
    'biz-tailor': 6, 'biz-toy-store': 6,
    # T7
    'biz-delicatessen': 7, 'biz-craft-shop': 7, 'biz-teahouse': 7,
    # T8
    'biz-cafe': 8, 'biz-pharmacy': 8,
    # T9
    'biz-yoga-studio': 9, 'biz-gym': 9,
    # T10
    'biz-music-store': 10, 'biz-clinic': 10,
    # T11
    'biz-physio': 11, 'biz-dentist': 11, 'biz-spa': 11,
    # T12
    'biz-gallery': 12, 'biz-private-clinic': 12, 'biz-hotel': 12,
}

# Community-space tiers (cost ladder: 3..8)
# cs-park + cs-library are both tutorial-pinned to T1.
CS = {
    'cs-park': 1,
    'cs-library': 1,
    'cs-playground': 3,
    'cs-community-garden': 4,
    'cs-fountain': 5,
    'cs-shelter': 6,
    'cs-health-kiosk': 8,
    'cs-public-art': 12,
}

# Event tiers (4-5 per tier, mostly mild -> major narrative arc)
EVT = {
    # T1 - classics (4)
    'evt-festival': 1, 'evt-rainy': 1, 'evt-tax': 1, 'evt-award': 1,
    # T2 (5)
    'evt-inspection': 2, 'evt-grand-opening': 2, 'evt-community-garden': 2,
    'evt-graffiti': 2, 'evt-noise-complaint': 2,
    # T3 (5)
    'evt-graffiti-art': 3, 'evt-library-reading': 3, 'evt-street-cleaning': 3,
    'evt-wellness-fair': 3, 'evt-block-party': 3,
    # T4 (5)
    'evt-health-campaign': 4, 'evt-street-performer': 4, 'evt-tourist-bus': 4,
    'evt-water-main': 4, 'evt-parking-tickets': 4,
    # T5 (5)
    'evt-movie-premiere': 5, 'evt-health-screening': 5,
    'evt-farmers-market': 5, 'evt-neighborhood-watch': 5,
    'evt-charity-drive': 5,
    # T6 (5)
    'evt-food-critic': 6, 'evt-construction': 6, 'evt-protest': 6,
    'evt-power-surge': 6, 'evt-good-press': 6,
    # T7 (4)
    'evt-health-carnival': 7, 'evt-food-tasting': 7,
    'evt-art-sale': 7, 'evt-labor-shortage': 7,
    # T8 (5) - cultural-grant landed here (mid-game grants phase)
    'evt-shopping-spree': 8, 'evt-summer-fest': 8, 'evt-service-week': 8,
    'evt-power-outage': 8, 'evt-cultural-grant': 8,
    # T9 (4)
    'evt-pipe-burst': 9, 'evt-flu-outbreak': 9, 'evt-recession': 9,
    'evt-heatwave': 9,
    # T10 (4)
    'evt-pest-infestation': 10, 'evt-slow-season': 10,
    'evt-shoplifting': 10, 'evt-viral-review': 10,
    # T11 (5)
    'evt-vandalism': 11, 'evt-harvest-festival': 11, 'evt-bulk-purchase': 11,
    'evt-book-fair': 11, 'evt-volunteer-day': 11,
    # T12 - endgame (5)
    'evt-festival-season': 12, 'evt-supply-chain': 12, 'evt-strike': 12,
    'evt-tourist-season': 12, 'evt-community-renovation': 12,
}

# Upgrade tiers (each >= its target's tier) - 39 total
UPG = {
    # T1 (4)
    'upg-patisserie': 1, 'upg-bistro': 1, 'upg-readers-cafe': 1, 'upg-garden': 1,
    # T2 (3)
    'upg-bread-factory': 2, 'upg-fast-food': 2, 'upg-designer-store': 2,
    # T3 (4)
    'upg-dry-cleaners': 3, 'upg-gaming-lounge': 3, 'upg-vintage-shop': 3,
    'upg-home-improvement': 3,
    # T4 (3)
    'upg-salon': 4, 'upg-gourmet-truck': 4, 'upg-adventure-park': 4,
    # T5 (3)
    'upg-smoothie-bar': 5, 'upg-orchard': 5, 'upg-grand-fountain': 5,
    # T6 (3)
    'upg-bespoke-tailor': 6, 'upg-toy-warehouse': 6, 'upg-garden-center': 6,
    # T7 (2)
    'upg-tea-lounge': 7, 'upg-gourmet-deli': 7,
    # T8 (4)
    'upg-roastery': 8, 'upg-imax': 8, 'upg-drive-in': 8, 'upg-health-center': 8,
    # T9 (3)
    'upg-wellness-retreat': 9, 'upg-fitness-center': 9, 'upg-multiplex': 9,
    # T10 (3)
    'upg-medical-center': 10, 'upg-community-hub': 10, 'upg-restaurant': 10,
    # T11 (4)
    'upg-dental-clinic': 11, 'upg-resort-spa': 11, 'upg-wellness-center': 11,
    'upg-luxury-retreat': 11,
    # T12 (3)
    'upg-museum': 12, 'upg-private-medical-center': 12, 'upg-grand-bakehouse': 12,
}

# Staff tiers (cost ladder: 2..20) - 9 total
STAFF = {
    'staff-apprentice': 1,
    'staff-assistant': 2,
    'staff-manager': 3,
    'staff-socialite': 4,
    'staff-accountant': 6,
    'staff-lookout': 7,
    'staff-director': 9,
    'staff-executive': 10,
    'staff-general-manager': 12,
}

ASSIGNMENT = {**BIZ, **CS, **EVT, **UPG, **STAFF}

# Tutorial-pinned Tier-1 cards (the tutorial builds decks from tier-1 pool)
TUTORIAL_TIER1_PINS = {
    'biz-bakery', 'biz-laundromat', 'biz-bookshop',
    'cs-library', 'evt-festival', 'evt-award', 'evt-rainy',
}

FAMILY_CAP = 0.42


def main() -> None:
    csv_path = 'example-games/main-street/card-data.csv'
    rows = list(csv.DictReader(open(csv_path)))
    by_id = {r['id']: r for r in rows}
    errors = []

    # 0. Tutorial pins
    for pinned in TUTORIAL_TIER1_PINS:
        if by_id.get(pinned) and ASSIGNMENT.get(pinned) != 1:
            errors.append(
                f'tutorial-pinned card {pinned} must be tier 1, '
                f'assigned T{ASSIGNMENT.get(pinned)}')
    print(f'Tutorial Tier-1 pins: {len(TUTORIAL_TIER1_PINS)} required cards')

    # 1. Completeness
    csv_ids = set(by_id)
    missing = csv_ids - set(ASSIGNMENT)
    extra = set(ASSIGNMENT) - csv_ids
    if missing:
        errors.append(f'MISSING assignment for: {sorted(missing)}')
    if extra:
        errors.append(f'Assignment for unknown ids: {sorted(extra)}')

    # 2. Upgrade >= target tier
    for r in rows:
        if r['family'] != 'upgrade':
            continue
        upg = ASSIGNMENT.get(r['id'])
        if upg is None:
            continue
        target_name = r.get('targetBusiness') or r.get('target') or ''
        if not target_name:
            continue
        trow = next(
            (x for x in rows if (x['name'] == target_name or
                                 x.get('upgradePath') == target_name)), None)
        if trow is None:
            errors.append(f'upg {r["id"]}: cannot find target row for {target_name!r}')
            continue
        target_tier = int(ASSIGNMENT.get(trow['id'], 0))
        if upg < target_tier:
            errors.append(
                f'upg {r["id"]} (T{upg}) before target {trow["id"]} (T{target_tier})')

    # 3. Per-tier composition
    comp = defaultdict(lambda: defaultdict(int))
    for cid, tier in ASSIGNMENT.items():
        if cid in extra:
            continue
        fam = by_id[cid]['family']
        comp[tier][fam] += 1
    totals = {}
    maxshare = {}
    print('=== Per-tier composition (new cards per tier) ===')
    for t in range(1, TIERS + 1):
        c = comp[t]
        total = sum(c.values())
        totals[t] = total
        if total == 0:
            errors.append(f'tier {t} empty')
            continue
        worst = max(c.values()) / total
        maxshare[t] = worst
        fam_str = ' '.join(f'{k}={c[k]}' for k in sorted(c))
        flag = f'  <-- >{FAMILY_CAP:.0%} family' if worst > FAMILY_CAP else ''
        print(f'T{t:2d}: total={total:2d}  {fam_str}{flag}')
        if worst > FAMILY_CAP:
            errors.append(
                f'tier {t}: family share {worst:.1%} exceeds {FAMILY_CAP:.0%}')
        share_min = total < 10 or total > 15
        if share_min:
            errors.append(f'tier {t}: total {total} outside 10-15 range')
    grand = sum(totals.values())
    print(f'\nGrand total assigned: {grand} (expect 142)')
    if grand != 142:
        errors.append(f'grand total {grand} != 142')

    # 4. Family totals preserved
    fam_totals = defaultdict(int)
    for cid, tier in ASSIGNMENT.items():
        if cid not in extra:
            fam_totals[by_id[cid]['family']] += 1
    for fam, n in fam_totals.items():
        expected = sum(1 for r in rows if r['family'] == fam)
        if n != expected:
            errors.append(f'{fam}: assigned {n} expected {expected}')

    print('\n=== Cost ladder sanity (max cost per tier, per family) ===')
    for fam in ('business', 'community-space', 'staff', 'upgrade'):
        costs = defaultdict(list)
        for cid, tier in ASSIGNMENT.items():
            r = by_id.get(cid)
            if r and r['family'] == fam:
                costs[tier].append(int(r['cost']))
        for t in range(1, TIERS + 1):
            if costs[t]:
                mx = max(costs[t])
                mn = min(costs[t])
            else:
                mx = mn = 0
            print(f'  {fam:18s} T{t:2d}: costs {mn}-{mx}')

    print('\n=== RESULTS ===')
    if errors:
        for e in errors:
            print('FAIL:', e)
        sys.exit(1)
    print('ALL CONSTRAINTS PASS')


if __name__ == '__main__':
    main()