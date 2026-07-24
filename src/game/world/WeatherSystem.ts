/**
 * Lightweight weather presentation state (visual/audio only).
 */

export type WeatherKind = 'clear' | 'cloudy' | 'light_rain' | 'fog' | 'wind';

export interface WeatherState {
  kind: WeatherKind;
  intensity: number;
}

export function pickAmbientWeather(seedHour: number): WeatherState {
  const bucket = Math.floor(seedHour) % 10;
  if (bucket <= 5) return { kind: 'clear', intensity: 0 };
  if (bucket <= 7) return { kind: 'cloudy', intensity: 0.35 };
  if (bucket === 8) return { kind: 'fog', intensity: 0.4 };
  if (bucket === 9) return { kind: 'light_rain', intensity: 0.5 };
  return { kind: 'wind', intensity: 0.3 };
}

export function weatherParticleBudget(kind: WeatherKind, quality: 'high' | 'balanced' | 'low'): number {
  const base = kind === 'light_rain' ? 40 : kind === 'fog' ? 12 : 0;
  if (quality === 'low') return Math.floor(base * 0.25);
  if (quality === 'balanced') return Math.floor(base * 0.55);
  return base;
}
