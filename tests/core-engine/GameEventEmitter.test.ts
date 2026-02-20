import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GameEventEmitter,
  type TurnStartedPayload,
  type TurnCompletedPayload,
  type AnimationCompletePayload,
  type StateSettledPayload,
  type GameEndedPayload,
  type CardDrawnPayload,
  type CardFlippedPayload,
  type CardSwappedPayload,
  type CardDiscardedPayload,
  type UIInteractionPayload,
  type CardToFoundationPayload,
  type CardToTableauPayload,
  type CardPickupPayload,
  type CardSnapBackPayload,
  type AutoCompleteStartPayload,
  type AutoCompleteCardPayload,
  type UndoPayload,
  type RedoPayload,
  type CardSelectedPayload,
  type CardDeselectedPayload,
  type DealCardPayload,
} from '../../src/core-engine/GameEventEmitter';

describe('GameEventEmitter', () => {
  let emitter: GameEventEmitter;

  beforeEach(() => {
    emitter = new GameEventEmitter();
  });

  // ── Basic emission & subscription ─────────────────────

  describe('on / emit', () => {
    it('should call listener when event is emitted', () => {
      const listener = vi.fn();
      emitter.on('turn-started', listener);

      const payload: TurnStartedPayload = {
        turnNumber: 0,
        playerIndex: 0,
        playerName: 'Alice',
        isAI: false,
      };
      emitter.emit('turn-started', payload);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should support multiple listeners for the same event', () => {
      const a = vi.fn();
      const b = vi.fn();
      emitter.on('turn-started', a);
      emitter.on('turn-started', b);

      const payload: TurnStartedPayload = {
        turnNumber: 1,
        playerIndex: 1,
        playerName: 'Bot',
        isAI: true,
      };
      emitter.emit('turn-started', payload);

      expect(a).toHaveBeenCalledOnce();
      expect(b).toHaveBeenCalledOnce();
    });

    it('should call listeners in registration order', () => {
      const order: number[] = [];
      emitter.on('state-settled', () => order.push(1));
      emitter.on('state-settled', () => order.push(2));
      emitter.on('state-settled', () => order.push(3));

      emitter.emit('state-settled', { turnNumber: 0, phase: 'playing' });
      expect(order).toEqual([1, 2, 3]);
    });

    it('should not call listeners for different events', () => {
      const listener = vi.fn();
      emitter.on('turn-started', listener);

      emitter.emit('turn-completed', {
        turnNumber: 0,
        playerIndex: 0,
        playerName: 'Alice',
        phase: 'playing',
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should not throw when emitting with no listeners', () => {
      expect(() => {
        emitter.emit('game-ended', {
          finalTurnNumber: 10,
          winnerIndex: 0,
        });
      }).not.toThrow();
    });
  });

  // ── All event types ───────────────────────────────────

  describe('event types', () => {
    it('should emit turn-started events', () => {
      const listener = vi.fn();
      emitter.on('turn-started', listener);

      const payload: TurnStartedPayload = {
        turnNumber: 5,
        playerIndex: 1,
        playerName: 'Bot',
        isAI: true,
      };
      emitter.emit('turn-started', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit turn-completed events', () => {
      const listener = vi.fn();
      emitter.on('turn-completed', listener);

      const payload: TurnCompletedPayload = {
        turnNumber: 5,
        playerIndex: 1,
        playerName: 'Bot',
        phase: 'playing',
      };
      emitter.emit('turn-completed', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit animation-complete events', () => {
      const listener = vi.fn();
      emitter.on('animation-complete', listener);

      const payload: AnimationCompletePayload = {
        turnNumber: 3,
        animationId: 'card-flip',
      };
      emitter.emit('animation-complete', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit animation-complete without optional animationId', () => {
      const listener = vi.fn();
      emitter.on('animation-complete', listener);

      const payload: AnimationCompletePayload = { turnNumber: 3 };
      emitter.emit('animation-complete', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit state-settled events', () => {
      const listener = vi.fn();
      emitter.on('state-settled', listener);

      const payload: StateSettledPayload = {
        turnNumber: 7,
        phase: 'playing',
      };
      emitter.emit('state-settled', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit game-ended events', () => {
      const listener = vi.fn();
      emitter.on('game-ended', listener);

      const payload: GameEndedPayload = {
        finalTurnNumber: 20,
        winnerIndex: 0,
        reason: 'Player 1 wins by 5 points',
      };
      emitter.emit('game-ended', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit game-ended without optional reason', () => {
      const listener = vi.fn();
      emitter.on('game-ended', listener);

      const payload: GameEndedPayload = {
        finalTurnNumber: 20,
        winnerIndex: -1,
      };
      emitter.emit('game-ended', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit card-drawn events', () => {
      const listener = vi.fn();
      emitter.on('card-drawn', listener);

      const payload: CardDrawnPayload = {
        source: 'stock',
        playerIndex: 0,
      };
      emitter.emit('card-drawn', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit card-drawn from discard', () => {
      const listener = vi.fn();
      emitter.on('card-drawn', listener);

      const payload: CardDrawnPayload = {
        source: 'discard',
        playerIndex: 1,
      };
      emitter.emit('card-drawn', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit card-flipped events', () => {
      const listener = vi.fn();
      emitter.on('card-flipped', listener);

      const payload: CardFlippedPayload = {
        position: 4,
        playerIndex: 0,
      };
      emitter.emit('card-flipped', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit card-swapped events', () => {
      const listener = vi.fn();
      emitter.on('card-swapped', listener);

      const payload: CardSwappedPayload = {
        position: 2,
        drawnFrom: 'stock',
        playerIndex: 1,
      };
      emitter.emit('card-swapped', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit card-discarded events', () => {
      const listener = vi.fn();
      emitter.on('card-discarded', listener);

      const payload: CardDiscardedPayload = {
        playerIndex: 0,
      };
      emitter.emit('card-discarded', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit ui-interaction events', () => {
      const listener = vi.fn();
      emitter.on('ui-interaction', listener);

      const payload: UIInteractionPayload = {
        elementId: 'play-again',
        action: 'click',
      };
      emitter.emit('ui-interaction', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });
  });

  // ── Solitaire event types ────────────────────────────

  describe('solitaire event types', () => {
    it('should emit card-to-foundation events', () => {
      const listener = vi.fn();
      emitter.on('card-to-foundation', listener);

      const payload: CardToFoundationPayload = {
        suit: 'hearts',
        rank: 'A',
        foundationIndex: 0,
        playerIndex: 0,
      };
      emitter.emit('card-to-foundation', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit card-to-foundation without optional playerIndex', () => {
      const listener = vi.fn();
      emitter.on('card-to-foundation', listener);

      const payload: CardToFoundationPayload = {
        suit: 'spades',
        rank: 'K',
        foundationIndex: 3,
      };
      emitter.emit('card-to-foundation', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit card-to-tableau events', () => {
      const listener = vi.fn();
      emitter.on('card-to-tableau', listener);

      const payload: CardToTableauPayload = {
        suit: 'diamonds',
        rank: '7',
        columnIndex: 3,
      };
      emitter.emit('card-to-tableau', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit card-pickup events', () => {
      const listener = vi.fn();
      emitter.on('card-pickup', listener);

      const payload: CardPickupPayload = {
        suit: 'clubs',
        rank: 'Q',
        source: 'tableau',
      };
      emitter.emit('card-pickup', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit card-pickup from different sources', () => {
      const listener = vi.fn();
      emitter.on('card-pickup', listener);

      const payload: CardPickupPayload = {
        suit: 'hearts',
        rank: '3',
        source: 'waste',
      };
      emitter.emit('card-pickup', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit card-snap-back events', () => {
      const listener = vi.fn();
      emitter.on('card-snap-back', listener);

      const payload: CardSnapBackPayload = {
        reason: 'Invalid move: card must be one rank lower',
      };
      emitter.emit('card-snap-back', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit card-snap-back without optional reason', () => {
      const listener = vi.fn();
      emitter.on('card-snap-back', listener);

      const payload: CardSnapBackPayload = {};
      emitter.emit('card-snap-back', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit auto-complete-start events', () => {
      const listener = vi.fn();
      emitter.on('auto-complete-start', listener);

      const payload: AutoCompleteStartPayload = {
        cardCount: 12,
      };
      emitter.emit('auto-complete-start', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit auto-complete-card events', () => {
      const listener = vi.fn();
      emitter.on('auto-complete-card', listener);

      const payload: AutoCompleteCardPayload = {
        suit: 'hearts',
        rank: '5',
        foundationIndex: 0,
      };
      emitter.emit('auto-complete-card', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit undo events', () => {
      const listener = vi.fn();
      emitter.on('undo', listener);

      const payload: UndoPayload = {
        moveDescription: 'Move 7H from column 3 to foundation',
      };
      emitter.emit('undo', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit undo without optional moveDescription', () => {
      const listener = vi.fn();
      emitter.on('undo', listener);

      const payload: UndoPayload = {};
      emitter.emit('undo', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit redo events', () => {
      const listener = vi.fn();
      emitter.on('redo', listener);

      const payload: RedoPayload = {
        moveDescription: 'Move 7H from column 3 to foundation',
      };
      emitter.emit('redo', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit redo without optional moveDescription', () => {
      const listener = vi.fn();
      emitter.on('redo', listener);

      const payload: RedoPayload = {};
      emitter.emit('redo', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit card-selected events', () => {
      const listener = vi.fn();
      emitter.on('card-selected', listener);

      const payload: CardSelectedPayload = {
        suit: 'spades',
        rank: 'J',
        columnIndex: 5,
      };
      emitter.emit('card-selected', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit card-deselected events', () => {
      const listener = vi.fn();
      emitter.on('card-deselected', listener);

      const payload: CardDeselectedPayload = {
        reason: 'new-selection',
      };
      emitter.emit('card-deselected', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit card-deselected without optional reason', () => {
      const listener = vi.fn();
      emitter.on('card-deselected', listener);

      const payload: CardDeselectedPayload = {};
      emitter.emit('card-deselected', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should emit deal-card events', () => {
      const listener = vi.fn();
      emitter.on('deal-card', listener);

      const payload: DealCardPayload = {
        cardIndex: 0,
        totalCards: 48,
      };
      emitter.emit('deal-card', payload);
      expect(listener).toHaveBeenCalledWith(payload);
    });
  });

  // ── off (unsubscribe) ─────────────────────────────────

  describe('off', () => {
    it('should remove a specific listener', () => {
      const listener = vi.fn();
      emitter.on('turn-started', listener);
      emitter.off('turn-started', listener);

      emitter.emit('turn-started', {
        turnNumber: 0,
        playerIndex: 0,
        playerName: 'Alice',
        isAI: false,
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should not affect other listeners when removing one', () => {
      const a = vi.fn();
      const b = vi.fn();
      emitter.on('turn-started', a);
      emitter.on('turn-started', b);
      emitter.off('turn-started', a);

      emitter.emit('turn-started', {
        turnNumber: 0,
        playerIndex: 0,
        playerName: 'Alice',
        isAI: false,
      });

      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledOnce();
    });

    it('should be safe to call off with an unregistered listener', () => {
      const listener = vi.fn();
      expect(() => emitter.off('turn-started', listener)).not.toThrow();
    });

    it('should be safe to call off on an event with no listeners', () => {
      const listener = vi.fn();
      expect(() =>
        emitter.off('game-ended', listener),
      ).not.toThrow();
    });
  });

  // ── Unsubscribe return value ──────────────────────────

  describe('on() return value (unsubscribe)', () => {
    it('should return a function that unsubscribes the listener', () => {
      const listener = vi.fn();
      const unsub = emitter.on('turn-started', listener);

      unsub();

      emitter.emit('turn-started', {
        turnNumber: 0,
        playerIndex: 0,
        playerName: 'Alice',
        isAI: false,
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ── once ──────────────────────────────────────────────

  describe('once', () => {
    it('should call listener only for the first emission', () => {
      const listener = vi.fn();
      emitter.once('state-settled', listener);

      const payload: StateSettledPayload = {
        turnNumber: 0,
        phase: 'playing',
      };
      emitter.emit('state-settled', payload);
      emitter.emit('state-settled', { turnNumber: 1, phase: 'playing' });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('should return an unsubscribe function', () => {
      const listener = vi.fn();
      const unsub = emitter.once('state-settled', listener);

      unsub();

      emitter.emit('state-settled', { turnNumber: 0, phase: 'playing' });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ── removeAllListeners ────────────────────────────────

  describe('removeAllListeners', () => {
    it('should remove all listeners for a specific event', () => {
      const a = vi.fn();
      const b = vi.fn();
      emitter.on('turn-started', a);
      emitter.on('turn-completed', b);

      emitter.removeAllListeners('turn-started');

      emitter.emit('turn-started', {
        turnNumber: 0,
        playerIndex: 0,
        playerName: 'Alice',
        isAI: false,
      });
      emitter.emit('turn-completed', {
        turnNumber: 0,
        playerIndex: 0,
        playerName: 'Alice',
        phase: 'playing',
      });

      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledOnce();
    });

    it('should remove all listeners for all events when called with no arguments', () => {
      const a = vi.fn();
      const b = vi.fn();
      emitter.on('turn-started', a);
      emitter.on('game-ended', b);

      emitter.removeAllListeners();

      emitter.emit('turn-started', {
        turnNumber: 0,
        playerIndex: 0,
        playerName: 'Alice',
        isAI: false,
      });
      emitter.emit('game-ended', {
        finalTurnNumber: 10,
        winnerIndex: 0,
      });

      expect(a).not.toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();
    });
  });

  // ── listenerCount ─────────────────────────────────────

  describe('listenerCount', () => {
    it('should return 0 for events with no listeners', () => {
      expect(emitter.listenerCount('turn-started')).toBe(0);
    });

    it('should return the correct count after adding listeners', () => {
      emitter.on('turn-started', vi.fn());
      emitter.on('turn-started', vi.fn());
      expect(emitter.listenerCount('turn-started')).toBe(2);
    });

    it('should decrease after removing a listener', () => {
      const listener = vi.fn();
      emitter.on('turn-started', listener);
      emitter.on('turn-started', vi.fn());
      emitter.off('turn-started', listener);
      expect(emitter.listenerCount('turn-started')).toBe(1);
    });
  });

  // ── Edge cases ────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle a listener that unsubscribes itself during emission', () => {
      const order: string[] = [];
      let unsub: () => void;

      unsub = emitter.on('state-settled', () => {
        order.push('self-removing');
        unsub();
      });
      emitter.on('state-settled', () => order.push('second'));

      emitter.emit('state-settled', { turnNumber: 0, phase: 'playing' });

      expect(order).toEqual(['self-removing', 'second']);
      expect(emitter.listenerCount('state-settled')).toBe(1);
    });

    it('should handle a listener that adds another listener during emission', () => {
      const order: string[] = [];

      emitter.on('state-settled', () => {
        order.push('first');
        emitter.on('state-settled', () => order.push('added-during'));
      });

      emitter.emit('state-settled', { turnNumber: 0, phase: 'playing' });
      // The newly added listener should NOT fire during the current emission
      expect(order).toEqual(['first']);

      // But should fire on the next emission
      emitter.emit('state-settled', { turnNumber: 1, phase: 'playing' });
      expect(order).toEqual(['first', 'first', 'added-during']);
    });

    it('should handle multiple independent emitter instances', () => {
      const emitter2 = new GameEventEmitter();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      emitter.on('turn-started', listener1);
      emitter2.on('turn-started', listener2);

      emitter.emit('turn-started', {
        turnNumber: 0,
        playerIndex: 0,
        playerName: 'Alice',
        isAI: false,
      });

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).not.toHaveBeenCalled();
    });
  });
});
