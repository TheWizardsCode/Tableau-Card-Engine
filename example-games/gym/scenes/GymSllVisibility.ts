export interface GymSllLayoutDescriptor {
  kind: 'direct' | 'composed';
  name: string;
}

/**
 * Shell chrome should stay visible in shell-only and composed views, but the
 * pure scene-only example hides the shared Gym scaffold so only scene-owned UI
 * remains visible.
 */
export function shouldShowShellChrome(
  layout: GymSllLayoutDescriptor,
): boolean {
  return !(layout.kind === 'direct' && layout.name === 'Scene-only');
}

/**
 * Shared Gym help chrome should stay visible for shell-only, pixel override,
 * and composed views, but remain hidden in the pure scene-only example.
 */
export function shouldShowSharedHelpChrome(
  layout: GymSllLayoutDescriptor,
): boolean {
  return shouldShowShellChrome(layout);
}

/**
 * The central demo action control is scene-owned, so shell-only mode hides it
 * to keep the shell demo focused on shared shell chrome.
 */
export function shouldShowDemoActionControl(
  layout: GymSllLayoutDescriptor,
): boolean {
  return !(layout.kind === 'direct' && layout.name === 'Shell-only');
}
