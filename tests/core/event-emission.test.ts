/**
 * Unit tests for emitEventOrCallback and CardEventPayloads.
 *
 * @group unit
 */

import { describe, it, expect, vi } from 'vitest';
import { emitEventOrCallback } from '../../src/core-engine/event-emission';
import type { CardDealtPayload, CardPlacedPayload, CardDiscardedPayload } from '../../src/core-engine/CardEventPayloads';

describe('emitEventOrCallback', () => {
  it('emits via gameEvents when provided', () => {
    const emit = vi.fn();
    const gameEvents = { emit };

    emitEventOrCallback<CardDealtPayload>({
      gameEvents,
      event: 'card:dealt',
      payload: { cardId: 'h1', playerIndex: 0 },
    });

    expect(emit).toHaveBeenCalledWith('card:dealt', { cardId: 'h1', playerIndex: 0 });
  });

  it('invokes onEvent callback when no gameEvents provided', () => {
    const callback = vi.fn();

    emitEventOrCallback<CardDealtPayload>({
      event: 'card:dealt',
      payload: { cardId: 'h1' },
      onEvent: callback,
    });

    expect(callback).toHaveBeenCalledWith({ cardId: 'h1' });
  });

  it('prefers gameEvents over callback when both provided', () => {
    const emit = vi.fn();
    const callback = vi.fn();

    emitEventOrCallback<CardDealtPayload>({
      gameEvents: { emit },
      event: 'card:dealt',
      payload: { cardId: 'h1' },
      onEvent: callback,
    });

    expect(emit).toHaveBeenCalledWith('card:dealt', { cardId: 'h1' });
    expect(callback).not.toHaveBeenCalled();
  });

  it('is a no-op when neither gameEvents nor callback provided', () => {
    emitEventOrCallback<CardDealtPayload>({
      event: 'card:dealt',
      payload: { cardId: 'h1' },
    });
    // Should not throw
  });

  it('works with CardPlacedPayload', () => {
    const emit = vi.fn();
    emitEventOrCallback<CardPlacedPayload>({
      gameEvents: { emit },
      event: 'card:placed',
      payload: { cardId: 'h1', playerIndex: 0, slotIndex: 3 },
    });
    expect(emit).toHaveBeenCalledWith('card:placed', {
      cardId: 'h1',
      playerIndex: 0,
      slotIndex: 3,
    });
  });

  it('works with CardDiscardedPayload', () => {
    const emit = vi.fn();
    emitEventOrCallback<CardDiscardedPayload>({
      gameEvents: { emit },
      event: 'card:discarded',
      payload: { cardId: 'h1' },
    });
    expect(emit).toHaveBeenCalledWith('card:discarded', { cardId: 'h1' });
  });

  it('forwards cardId-only payloads', () => {
    const emit = vi.fn();
    emitEventOrCallback<CardDealtPayload>({
      gameEvents: { emit },
      event: 'card:dealt',
      payload: { cardId: 'h2' },
    });
    expect(emit).toHaveBeenCalledWith('card:dealt', { cardId: 'h2' });
  });
});
