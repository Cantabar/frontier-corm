export type OverlayMode = 'color' | 'glow' | 'densityGradient' | 'area';

export type OverlayFilter =
  | 'region'
  | 'constellation'
  | 'ancientCivilizations'
  | 'planetCount'
  | 'planetType'
  | 'moonCount'
  | 'npcStations'
  | 'myStructures';

export interface OverlayConfig {
  filter: OverlayFilter;
  mode: OverlayMode;
  planetTypeId?: number; // required when filter === 'planetType'
}
