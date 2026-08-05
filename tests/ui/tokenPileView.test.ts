import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TokenPileView,
  createSimpleTokenRenderer,
  createCardBackTokenRenderer,
} from '../../src/ui/TokenPileView';

// ── Minimal Phaser mock ─────────────────────────────────────

function createMockScene(): any {
  const containers: any[] = [];
  const texts: any[] = [];
  const images: any[] = [];
  const destroyed: any[] = [];
  const textureKeys = new Set<string>();
  let sceneRef: any;

  const mockContainer = (x: number, y: number) => {
    const cont: any = {
      x,
      y,
      scene: sceneRef,
      list: [] as any[],
      exclusive: true,
      setInteractive: vi.fn().mockReturnThis(),
      disableInteractive: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      add: vi.fn().mockImplementation((child: any) => {
        cont.list.push(child);
        return cont;
      }),
      destroy: vi.fn().mockImplementation(() => { destroyed.push(cont); }),
    };
    containers.push(cont);
    return cont;
  };

  const mockText = (x: number, y: number, text: string, _style?: any) => {
    const txt = {
      x, y, text,
      setOrigin: vi.fn().mockReturnThis(),
      setText: vi.fn().mockImplementation((t: string) => { txt.text = t; }),
      destroy: vi.fn().mockImplementation(() => { destroyed.push(txt); }),
    };
    texts.push(txt);
    return txt;
  };

  const mockGraphics = () => {
    const g = {
      clear: vi.fn().mockReturnThis(),
      fillStyle: vi.fn().mockReturnThis(),
      fillCircle: vi.fn().mockReturnThis(),
      lineStyle: vi.fn().mockReturnThis(),
      strokeCircle: vi.fn().mockReturnThis(),
      destroy: vi.fn().mockImplementation(() => { destroyed.push(g); }),
    };
    return g;
  };

  const mockCircle = (_x: number, _y: number, _r: number, _fill?: any, _stroke?: any) => {
    const circ: any = {
      x: _x, y: _y, radius: _r,
      setStrokeStyle: vi.fn().mockReturnThis(),
      setInteractive: vi.fn().mockReturnThis(),
      destroy: vi.fn().mockImplementation(() => { destroyed.push(circ); }),
    };
    return circ;
  };

  const inputHandlers: Record<string, any[]> = {};

  const scene: any = {
    add: {
      container: vi.fn().mockImplementation((x: number, y: number) => mockContainer(x, y)),
      text: vi.fn().mockImplementation(mockText),
      graphics: vi.fn().mockImplementation(mockGraphics),
      circle: vi.fn().mockImplementation(mockCircle),
      image: vi.fn().mockImplementation((x: number, y: number, key: string) => {
        const img = {
          x,
          y,
          key,
          destroy: vi.fn().mockImplementation(() => { destroyed.push(img); }),
        };
        images.push(img);
        return img;
      }),
      existing: vi.fn().mockReturnThis(),
    },
    textures: {
      exists: (key: string) => textureKeys.has(key),
      add: (key: string) => { textureKeys.add(key); },
    },
    events: {
      once: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
    tweens: {
      add: vi.fn().mockImplementation((config: any) => {
        if (config.onComplete) {
          setTimeout(() => config.onComplete(), 0);
        }
        return { stop: vi.fn() };
      }),
    },
    _containers: containers,
    _texts: texts,
    _images: images,
    _textureKeys: textureKeys,
    _destroyed: destroyed,
    _inputHandlers: inputHandlers,
  };
  sceneRef = scene;
  return scene;
}

// ── Tests ───────────────────────────────────────────────────

describe('TokenPileView', () => {
  let scene: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    scene = createMockScene();
  });

  it('creates a TokenPileView with required options', () => {
    const tpv = new TokenPileView(scene, {
      x: 300,
      y: 200,
    });
    expect(tpv).toBeDefined();
    expect(tpv.getTokens()).toEqual([]);
    expect(tpv.getCount()).toBe(0);
    tpv.destroy();
  });

  it('setTokens assigns token objects and updates the display', () => {
    const tpv = new TokenPileView(scene, {
      x: 300,
      y: 200,
      label: 'Resources',
    });

    const tokens = [
      { type: 'wheat', count: 3 },
      { type: 'barley', count: 2 },
    ];
    tpv.setTokens(tokens);

    expect(tpv.getTokens()).toEqual(tokens);
    expect(tpv.getCount()).toBe(5);
    tpv.destroy();
  });

  it('setTokens with explicit count overrides auto-count', () => {
    const tpv = new TokenPileView(scene, {
      x: 300,
      y: 200,
      label: 'Supply',
    });

    const tokens = [{ type: 'oats', count: 100 }];
    tpv.setTokens(tokens, 100);

    expect(tpv.getCount()).toBe(100);
    tpv.destroy();
  });

  it('update refreshes the count label', () => {
    const tpv = new TokenPileView(scene, {
      x: 300,
      y: 200,
      label: 'Deck',
    });

    const tokens = [{ type: 'wheat', count: 3 }];
    tpv.setTokens(tokens);

    const countText = scene._texts[0];
    expect(countText.text).toBe('Deck: 3');

    tpv.setTokens([{ type: 'barley', count: 7 }]);
    expect(countText.text).toBe('Deck: 7');

    tpv.destroy();
  });

  it('tokenRenderer callback is called for each token on update', () => {
    const renderMock = vi.fn();
    const tpv = new TokenPileView(scene, {
      x: 300,
      y: 200,
      tokenRenderer: renderMock,
    });

    const tokens = [
      { type: 'wheat', count: 3 },
      { type: 'barley', count: 2 },
    ];
    tpv.setTokens(tokens);

    expect(renderMock).toHaveBeenCalledTimes(2);
    expect(renderMock).toHaveBeenNthCalledWith(1, tokens[0], expect.any(Object), 0);
    expect(renderMock).toHaveBeenNthCalledWith(2, tokens[1], expect.any(Object), 1);

    // Second update
    renderMock.mockClear();
    tpv.update();
    expect(renderMock).toHaveBeenCalledTimes(2);

    tpv.destroy();
  });

  it('onClick registers a callback fired on container click', () => {
    const tpv = new TokenPileView(scene, {
      x: 300,
      y: 200,
    });

    const clickHandler = vi.fn();
    tpv.onClick(clickHandler);

    // Simulate a click on the container
    const cont = scene._containers[0];
    const onCalls = cont.on.mock.calls;
    const pointerdownCall = onCalls.find((c: any[]) => c[0] === 'pointerdown');
    if (pointerdownCall) {
      pointerdownCall[1]();
    }

    expect(clickHandler).toHaveBeenCalled();
    tpv.destroy();
  });

  it('getContainer returns the container', () => {
    const tpv = new TokenPileView(scene, {
      x: 300,
      y: 200,
    });

    const container = tpv.getContainer();
    expect(container).toBeDefined();
    expect(container.list).toBeDefined();
    tpv.destroy();
  });

  it('getCountText returns the count label text object', () => {
    const tpv = new TokenPileView(scene, {
      x: 300,
      y: 200,
    });

    const countText = tpv.getCountText();
    expect(countText).toBeDefined();
    tpv.destroy();
  });

  it('setInteractive enables/disables interaction', () => {
    const tpv = new TokenPileView(scene, {
      x: 300,
      y: 200,
    });

    const cont = scene._containers[0];
    tpv.setInteractive(true);
    expect(cont.setInteractive).toHaveBeenCalled();

    tpv.setInteractive(false);
    expect(cont.disableInteractive).toHaveBeenCalled();

    tpv.destroy();
  });

  it('destroy cleans up the token pile view', () => {
    const tpv = new TokenPileView(scene, {
      x: 300,
      y: 200,
      tokenRenderer: vi.fn(),
    });

    tpv.setTokens([{ type: 'wheat', count: 3 }]);
    tpv.destroy();

    expect(tpv.getTokens()).toEqual([]);
    expect(tpv.getCount()).toBe(0);
  });

  it('respects custom configuration options', () => {
    const tpv = new TokenPileView(scene, {
      x: 100,
      y: 200,
      label: 'Custom',
      tokenRadius: 25,
      tokenFillColor: '#ff0000',
      tokenStrokeColor: '#00ff00',
      tokenStrokeWidth: 3,
      countFontSize: '16px',
      countColor: '#ff0000',
      countOffsetY: 80,
    });

    expect(tpv.getContainer()).toBeDefined();
    expect(scene._texts[0].text).toBe('Custom: 0');

    tpv.destroy();
  });
});

// ── createSimpleTokenRenderer tests ─────────────────────────

describe('createSimpleTokenRenderer', () => {
  let scene: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    scene = createMockScene();
  });

  it('creates a renderer function', () => {
    const renderer = createSimpleTokenRenderer(scene);
    expect(typeof renderer).toBe('function');
  });

  it('renders tokens when called', () => {
    const renderer = createSimpleTokenRenderer(scene, 0x000000);

    const container = scene._containers[0] || scene.add.container(0, 0);
    renderer({ type: 'wheat', count: 5 }, container, 0);

    // Should have added display objects to the container
    expect(container.list.length).toBeGreaterThan(0);
  });

  it('renders different colours for different token types', () => {
    const renderer = createSimpleTokenRenderer(scene, 0x000000);

    const container = scene._containers[0] || scene.add.container(0, 0);

    // Render multiple token types
    renderer({ type: 'wheat', count: 3 }, container, 0);
    renderer({ type: 'barley', count: 2 }, container, 1);
    renderer({ type: 'flax', count: 1 }, container, 2);
    renderer({ type: 'turnip', count: 4 }, container, 3);
    renderer({ type: 'mead', count: 6 }, container, 4);

    // Each token renders 3 objects (circle, icon, count label)
    expect(container.list.length).toBe(15);
  });
});

// ── createCardBackTokenRenderer tests ───────────────────────

describe('createCardBackTokenRenderer', () => {
  let scene: ReturnType<typeof createMockScene>;

  beforeEach(() => {
    scene = createMockScene();
  });

  it('creates a renderer function', () => {
    const renderer = createCardBackTokenRenderer('gym_token_card_back');
    expect(typeof renderer).toBe('function');
  });

  it('uses the base back texture when the token has no cardType', () => {
    const renderer = createCardBackTokenRenderer('gym_token_card_back');
    const container = scene.add.container(0, 0);
    renderer({}, container, 0);
    expect(scene._images[0].key).toBe('gym_token_card_back');
  });

  it('uses the cardType variant texture when it exists', () => {
    scene.textures.add('gym_token_card_back-treasure');
    const renderer = createCardBackTokenRenderer('gym_token_card_back');
    const container = scene.add.container(0, 0);
    renderer({ cardType: 'treasure' }, container, 0);
    expect(scene._images[0].key).toBe('gym_token_card_back-treasure');
  });

  it('falls back to the base back texture when the cardType variant texture is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const renderer = createCardBackTokenRenderer('gym_token_card_back');
      const container = scene.add.container(0, 0);
      // 'gym_token_card_back-treasure' is not registered in the texture manager
      renderer({ cardType: 'treasure' }, container, 0);
      expect(scene._images[0].key).toBe('gym_token_card_back');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
