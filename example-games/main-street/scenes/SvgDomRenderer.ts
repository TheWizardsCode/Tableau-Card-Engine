import Phaser from 'phaser';

/**
 * SvgDomRenderer - renders SVG card art using DOM <img> elements wrapped
 * in Phaser DOMElement objects. Keeps vector quality and lets the browser
 * render text crisply at any scale.
 *
 * Usage:
 *   const r = new SvgDomRenderer(scene);
 *   r.createOrUpdate('biz-bakery', svgText, cx, cy, w, h, () => onClick());
 *   r.clear();
 *   r.destroy();
 */
export class SvgDomRenderer {
  private scene: Phaser.Scene;
  private map: Map<string, Phaser.GameObjects.DOMElement> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private svgToDataUri(svgText: string): string {
    // Use UTF-8 encoding safe method
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svgText);
  }

  createOrUpdate(
    id: string,
    svgText: string,
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    pointerCallback?: () => void,
    depth = 1000,
  ) {
    // Remove existing
    this.remove(id);

    const img = document.createElement('img');
    img.src = this.svgToDataUri(svgText);
    img.style.width = `${Math.max(1, Math.round(width))}px`;
    img.style.height = `${Math.max(1, Math.round(height))}px`;
    img.style.display = 'block';
    img.style.pointerEvents = 'auto';
    img.draggable = false;

    if (pointerCallback) {
      img.style.cursor = 'pointer';
      // Support multiple input event types so clicks/taps/pointers are handled
      img.addEventListener('click', pointerCallback);
      img.addEventListener('pointerdown', pointerCallback);
      img.addEventListener('mousedown', pointerCallback);
      img.addEventListener('touchstart', pointerCallback, { passive: true });
    }

    // Create Phaser DOMElement wrapping the img. Position uses game coordinates
    const dom = this.scene.add.dom(Math.round(centerX), Math.round(centerY), img) as Phaser.GameObjects.DOMElement;
    dom.setOrigin(0.5, 0.5);
    dom.setDepth(depth);

    // Ensure DOM element scales with camera (default behaviour).
    this.map.set(id, dom);
    return dom;
  }

  remove(id: string) {
    const dom = this.map.get(id);
    if (!dom) return;
    try {
      dom.destroy();
    } catch {
      // ignore
    }
    this.map.delete(id);
  }

  clear() {
    for (const [k, dom] of this.map.entries()) {
      try { dom.destroy(); } catch {};
      this.map.delete(k);
    }
  }

  destroy() {
    this.clear();
  }
}
