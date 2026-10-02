/** Type declarations for the `build-steam-friends.mjs` build script (P4). */

export interface StageAddonOptions {
  /** Source `.node` path (defaults to the node-gyp build output). */
  from?: string;
  /** Destination package directory. */
  toDir?: string;
}

export declare function isWindows(platform?: string): boolean;

/** Stage a built addon as the `tce-steam-friends` node module. */
export declare function stageAddon(options?: StageAddonOptions): string;
