import type { PlayerId, TheMindSession } from './TheMindGameState';
import { playCard, isGameOver, getPileTopValue } from './TheMindGameState';
import type { MindAiPlayer } from './AiStrategy';
import { PROXIMITY_MIN_DELAY, PROXIMITY_THRESHOLD } from './AiStrategy';
import type { MindTranscript, MindTranscriptRecorder } from './GameTranscript';

export interface PendingPlay {
  readonly playerId: PlayerId;
  readonly cardValue: number;
  readonly fireTime: number;
}

export interface SimulationStats {
  totalPlays: number;
  totalPenalties: number;
  levelStartTime: number;
}

export interface HeadlessResultSnapshot {
  readonly totalPlays: number;
  readonly totalPenalties: number;
  readonly outcome: 'win' | 'loss';
  readonly finalLevel: number;
  readonly finalLives: number;
}

export function simulateGame(
  session: TheMindSession,
  aiPlayers: [MindAiPlayer, MindAiPlayer],
  recorder: MindTranscriptRecorder,
): SimulationStats {
  const stats: SimulationStats = {
    totalPlays: 0,
    totalPenalties: 0,
    levelStartTime: 0,
  };

  commitLevelDelays(session, aiPlayers);

  while (!isGameOver(session)) {
    const completed = runNextSimulationStep(session, aiPlayers, recorder, stats);
    if (completed) {
      break;
    }
  }

  return stats;
}

export function runNextSimulationStep(
  session: TheMindSession,
  aiPlayers: [MindAiPlayer, MindAiPlayer],
  recorder: MindTranscriptRecorder,
  stats: SimulationStats,
): boolean {
  const queue = buildPlayQueue(
    aiPlayers,
    stats.levelStartTime,
    getPileTopValue(session),
  );

  if (queue.length === 0) {
    return true;
  }

  const next = queue[0];
  const timestamp = next.fireTime - stats.levelStartTime;
  const result = playCard(session, next.playerId, next.cardValue);

  if (!result.success) {
    aiPlayers[next.playerId].removeCard(next.cardValue);
    return false;
  }

  recordSuccessfulPlay(
    session,
    aiPlayers,
    recorder,
    stats,
    next,
    timestamp,
    result,
  );

  if (result.levelComplete) {
    return handleLevelCompletion(
      session,
      aiPlayers,
      recorder,
      stats,
      next.fireTime,
      timestamp,
      result.bonusLifeAwarded,
    );
  }

  return isGameOver(session);
}

function recordSuccessfulPlay(
  session: TheMindSession,
  aiPlayers: [MindAiPlayer, MindAiPlayer],
  recorder: MindTranscriptRecorder,
  stats: SimulationStats,
  next: PendingPlay,
  timestamp: number,
  result: ReturnType<typeof playCard>,
): void {
  stats.totalPlays += 1;

  recorder.recordCardPlay(
    timestamp,
    next.playerId,
    next.cardValue,
    getPileTopValue(session),
    session.pile.size(),
  );

  aiPlayers[next.playerId].removeCard(next.cardValue);

  if (!result.lifeLost) {
    return;
  }

  stats.totalPenalties += 1;

  recorder.recordPenalty(
    timestamp,
    session.lives,
    result.penaltyCards.map((p) => ({
      playerId: p.playerId,
      cardValue: p.card.value,
    })),
  );

  for (const penaltyCard of result.penaltyCards) {
    aiPlayers[penaltyCard.playerId].removeCard(penaltyCard.card.value);
  }
}

function handleLevelCompletion(
  session: TheMindSession,
  aiPlayers: [MindAiPlayer, MindAiPlayer],
  recorder: MindTranscriptRecorder,
  stats: SimulationStats,
  fireTime: number,
  timestamp: number,
  bonusLifeAwarded: boolean,
): boolean {
  const completedLevel = session.outcome === 'win'
    ? session.currentLevel
    : session.currentLevel - 1;

  const handsDealt = isGameOver(session)
    ? undefined
    : [
        session.players[0].hand.map((c) => c.value),
        session.players[1].hand.map((c) => c.value),
      ] as [readonly number[], readonly number[]];

  recorder.recordLevelComplete(
    timestamp,
    completedLevel,
    bonusLifeAwarded,
    session.lives,
    handsDealt,
  );

  if (isGameOver(session)) {
    return true;
  }

  stats.levelStartTime = fireTime;
  commitLevelDelays(session, aiPlayers);
  return false;
}

export function commitLevelDelays(
  session: TheMindSession,
  aiPlayers: [MindAiPlayer, MindAiPlayer],
): void {
  aiPlayers[0].commitLevel(session.players[0].hand);
  aiPlayers[1].commitLevel(session.players[1].hand);
}

export function buildPlayQueue(
  aiPlayers: [MindAiPlayer, MindAiPlayer],
  levelStartTime: number,
  pileTopValue: number,
): PendingPlay[] {
  const queue: PendingPlay[] = [];

  for (let p = 0; p < 2; p++) {
    const playerId = p as PlayerId;
    const delays = aiPlayers[p].getCardDelays();

    for (const delayEntry of delays) {
      const fireTime = applyProximityDelay(
        levelStartTime,
        delayEntry.delay,
        delayEntry.card.value,
        pileTopValue,
      );

      queue.push({
        playerId,
        cardValue: delayEntry.card.value,
        fireTime,
      });
    }
  }

  queue.sort((a, b) => a.fireTime - b.fireTime || a.cardValue - b.cardValue);
  return queue;
}

function applyProximityDelay(
  levelStartTime: number,
  rawDelay: number,
  cardValue: number,
  pileTopValue: number,
): number {
  let fireTime = levelStartTime + Math.max(rawDelay, 0);

  if (
    pileTopValue > 0 &&
    cardValue - pileTopValue <= PROXIMITY_THRESHOLD
  ) {
    const minFireTime = levelStartTime + PROXIMITY_MIN_DELAY;
    if (fireTime < minFireTime) {
      fireTime = minFireTime;
    }
  }

  return fireTime;
}

export function buildResultSnapshot(
  stats: SimulationStats,
  session: TheMindSession,
): HeadlessResultSnapshot {
  return {
    totalPlays: stats.totalPlays,
    totalPenalties: stats.totalPenalties,
    outcome: session.outcome as 'win' | 'loss',
    finalLevel: session.currentLevel,
    finalLives: session.lives,
  };
}

export function finalizeTranscript(
  recorder: MindTranscriptRecorder,
  snapshot: HeadlessResultSnapshot,
): MindTranscript {
  return recorder.finalize(
    Date.now(),
    snapshot.outcome,
    snapshot.finalLevel,
    snapshot.finalLives,
  );
}
