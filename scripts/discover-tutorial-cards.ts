/**
 * Script to discover which cards appear in the market when using the TUTORIAL_SEED.
 * Run with: npx tsx scripts/discover-tutorial-cards.ts
 */
import { setupMainStreetGame } from '../example-games/main-street/MainStreetState';

const state = setupMainStreetGame({
  seed: 'tutorial-seed',
  difficulty: 'Easy',
});

console.log('=== Business Cards in Market ===');
state.market.business.forEach((card, i) => {
  console.log(`[${i}] ${card.name} (id: ${card.id}, cost: ${card.cost}, income: ${card.baseIncome})`);
});

console.log('\n=== Investment Cards in Market ===');
state.market.investments.forEach((card, i) => {
  console.log(`[${i}] ${card.name} (id: ${card.id}, family: ${card.family}, cost: ${card.cost})`);
});

console.log('\n=== Player Resources ===');
console.log(`Coins: ${state.resourceBank.coins}`);
console.log(`Reputation: ${state.resourceBank.reputation}`);
console.log(`Turn: ${state.turn}`);
