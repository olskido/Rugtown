/** Cardinal facing — shared by bitmap characters, minimap, interaction. */
export type Direction = 'down' | 'up' | 'left' | 'right';

export const DIRECTIONS: Direction[] = ['down', 'up', 'left', 'right'];

export function nearestCardinal(vx: number, vy: number): Direction {
  if (Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01) return 'down';
  if (Math.abs(vx) >= Math.abs(vy)) return vx > 0 ? 'right' : 'left';
  return vy > 0 ? 'down' : 'up';
}
