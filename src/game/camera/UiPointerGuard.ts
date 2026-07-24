/**
 * UiPointerGuard.ts
 * ─────────────────
 * Phase 10B — centralized check: did a pointer begin over interactive HUD/UI?
 *
 * HUD root uses pointer-events:none; panels use pointer-events:all.
 * elementFromPoint returns the topmost element, so canvas hits mean the
 * gesture is free for world camera panning.
 */

const INTERACTIVE_UI_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'label',
  '[role="button"]',
  '[contenteditable="true"]',
  '.hud-panel',
  '.hud-coords',
  '.coord-btn',
  '.minimap',
  '.mobile-joystick',
  '.mobile-zoom-btn',
  '.mobile-interact-btn',
  '.mobile-collapsed-btn',
  '.action-bar',
  '.action-btn',
  '.chat-panel',
  '.chat-input',
  '.modal',
  '.modal-overlay',
  '.modal-backdrop',
  '.settings-panel',
  '.camera-recenter-btn',
  '.world-map-overlay',
  '.world-map-panel',
  '.world-map-stage',
  '.world-map-btn',
  '.world-map-filter',
  '[data-ui-block-camera]',
].join(', ');

/**
 * True when the screen point sits on interactive UI (not the Phaser canvas).
 * Safe to call from Phaser pointer handlers via event.clientX/Y.
 */
export function isPointerOverInteractiveUi(clientX: number, clientY: number): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return false;

  // Pure canvas / mount → world gestures allowed.
  if (el.closest('#phaser-mount, .game-canvas, canvas')) {
    // Nested HUD should never win while canvas is topmost; still guard.
    return false;
  }

  return el.closest(INTERACTIVE_UI_SELECTOR) !== null;
}
