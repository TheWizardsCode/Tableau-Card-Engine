/**
 * Unit tests for PhaseManager<T> — generic turn-phase state machine.
 *
 * All Phaser text object interactions are mocked to run in Node.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PhaseManager } from '../../src/ui/PhaseManager';

// ── Mock helpers ────────────────────────────────────────────

/** Create a mock Phaser.GameObjects.Text with a setText spy. */
function mockTextObject() {
  return {
    setText: vi.fn().mockReturnThis(),
    text: '',
  } as unknown as Phaser.GameObjects.Text;
}

// ── Phase type used in tests ────────────────────────────────

type TestPhase = 'idle' | 'playing' | 'animating' | 'game-over';

const TEST_PHASE_TEXT_MAP: Partial<Record<TestPhase, string>> = {
  idle: 'Waiting for your move',
  playing: 'Click a card to play it',
  animating: '',
  // 'game-over' intentionally omitted to test default behavior
};

// ── Tests ───────────────────────────────────────────────────

describe('PhaseManager', () => {
  let textObj: Phaser.GameObjects.Text;

  beforeEach(() => {
    textObj = mockTextObject();
  });

  // ── Construction ──────────────────────────────────────────

  describe('construction', () => {
    it('should initialize with the given initial phase', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
      });
      expect(pm.current).toBe('idle');
    });

    it('should set previous to initialPhase on construction', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'playing',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
      });
      expect(pm.previous).toBe('playing');
    });

    it('should not call setText on construction (no text object)', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
        textObject: textObj,
      });
      // Constructor does not call setText — only set() and setTextObject() do
      expect((textObj.setText as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
      expect(pm.current).toBe('idle');
    });
  });

  // ── set() ─────────────────────────────────────────────────

  describe('set()', () => {
    it('should update current phase', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
      });
      pm.set('playing');
      expect(pm.current).toBe('playing');
    });

    it('should update previous phase', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
      });
      pm.set('playing');
      expect(pm.previous).toBe('idle');
    });

    it('should track multiple transitions correctly', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
      });
      pm.set('playing');
      pm.set('animating');
      pm.set('game-over');
      expect(pm.current).toBe('game-over');
      expect(pm.previous).toBe('animating');
    });

    it('should update text object with mapped text', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
        textObject: textObj,
      });
      pm.set('playing');
      expect(textObj.setText).toHaveBeenCalledWith('Click a card to play it');
    });

    it('should set empty string for phases not in the map', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
        textObject: textObj,
      });
      pm.set('game-over'); // not in map
      expect(textObj.setText).toHaveBeenCalledWith('');
    });

    it('should set empty string for phases mapped to empty string', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
        textObject: textObj,
      });
      pm.set('animating'); // mapped to ''
      expect(textObj.setText).toHaveBeenCalledWith('');
    });

    it('should not throw if no text object is bound', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
      });
      expect(() => pm.set('playing')).not.toThrow();
      expect(pm.current).toBe('playing');
    });

    it('should call onPhaseChange callback with new and previous phase', () => {
      const callback = vi.fn();
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
        onPhaseChange: callback,
      });
      pm.set('playing');
      expect(callback).toHaveBeenCalledWith('playing', 'idle');
    });

    it('should call onPhaseChange after updating text', () => {
      const callOrder: string[] = [];
      const mockText = {
        setText: vi.fn(() => { callOrder.push('setText'); return mockText; }),
      } as unknown as Phaser.GameObjects.Text;

      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
        textObject: mockText,
        onPhaseChange: () => { callOrder.push('callback'); },
      });
      pm.set('playing');
      expect(callOrder).toEqual(['setText', 'callback']);
    });

    it('should allow transitioning to the same phase', () => {
      const callback = vi.fn();
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
        onPhaseChange: callback,
      });
      pm.set('idle');
      expect(pm.current).toBe('idle');
      expect(pm.previous).toBe('idle');
      expect(callback).toHaveBeenCalledWith('idle', 'idle');
    });
  });

  // ── setTextObject() ───────────────────────────────────────

  describe('setTextObject()', () => {
    it('should bind a text object and sync text to current phase', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'playing',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
      });
      pm.setTextObject(textObj);
      expect(textObj.setText).toHaveBeenCalledWith('Click a card to play it');
    });

    it('should sync empty string for unmapped phase', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'game-over',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
      });
      pm.setTextObject(textObj);
      expect(textObj.setText).toHaveBeenCalledWith('');
    });

    it('should use the new text object on subsequent set() calls', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
      });
      pm.setTextObject(textObj);
      (textObj.setText as ReturnType<typeof vi.fn>).mockClear();

      pm.set('playing');
      expect(textObj.setText).toHaveBeenCalledWith('Click a card to play it');
    });

    it('should allow rebinding to a different text object', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: TEST_PHASE_TEXT_MAP,
        textObject: textObj,
      });
      const newText = mockTextObject();
      pm.setTextObject(newText);
      expect(newText.setText).toHaveBeenCalledWith('Waiting for your move');

      pm.set('playing');
      // Old text object should not be called again
      expect((textObj.setText as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
      expect(newText.setText).toHaveBeenCalledWith('Click a card to play it');
    });
  });

  // ── setPhaseText() ────────────────────────────────────────

  describe('setPhaseText()', () => {
    it('should update the text map for a specific phase', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: { ...TEST_PHASE_TEXT_MAP },
        textObject: textObj,
      });
      pm.setPhaseText('idle', 'Updated idle text');
      pm.set('idle');
      expect(textObj.setText).toHaveBeenCalledWith('Updated idle text');
    });

    it('should immediately refresh text if updating the current phase', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: { ...TEST_PHASE_TEXT_MAP },
        textObject: textObj,
      });
      pm.setPhaseText('idle', 'New idle text');
      expect(textObj.setText).toHaveBeenCalledWith('New idle text');
    });

    it('should not refresh text if updating a non-current phase', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: { ...TEST_PHASE_TEXT_MAP },
        textObject: textObj,
      });
      pm.setPhaseText('playing', 'New playing text');
      // setText should not have been called (no text object sync on construction)
      expect(textObj.setText).not.toHaveBeenCalled();
    });

    it('should add text for previously unmapped phases', () => {
      const pm = new PhaseManager<TestPhase>({
        initialPhase: 'idle',
        phaseTextMap: { ...TEST_PHASE_TEXT_MAP },
        textObject: textObj,
      });
      pm.setPhaseText('game-over', 'Game Over!');
      pm.set('game-over');
      expect(textObj.setText).toHaveBeenCalledWith('Game Over!');
    });
  });

});
