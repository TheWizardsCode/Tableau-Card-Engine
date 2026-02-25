/**
 * Hello World - Tableau Card Engine (TCE)
 *
 * A minimal Phaser 3.x game demonstrating the toolchain works:
 * Vite dev server, TypeScript compilation, Phaser initialization,
 * and asset loading from public/assets/.
 */
import { createCardGame } from '../../src/ui/createCardGame';
import { HelloWorldScene } from './scenes/HelloWorldScene';

createCardGame({
  backgroundColor: '#2d572c',
  scenes: [HelloWorldScene],
});
