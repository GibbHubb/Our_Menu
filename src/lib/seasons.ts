// OM13 — season helpers. Northern Hemisphere only for v1; hemisphere choice
// will land with the household model (OM14).

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

export const SEASON_LABEL: Record<Season, string> = {
  spring: 'Spring 🌱',
  summer: 'Summer ☀️',
  autumn: 'Autumn 🍂',
  winter: 'Winter ❄️',
};

export const SEASON_COLOR: Record<Season, string> = {
  spring: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  summer: 'bg-amber-100  text-amber-800  border-amber-200',
  autumn: 'bg-orange-100 text-orange-800 border-orange-200',
  winter: 'bg-sky-100    text-sky-800    border-sky-200',
};

/** Northern Hemisphere meteorological seasons (Mar/Jun/Sep/Dec boundaries). */
export function currentSeason(date: Date = new Date()): Season {
  const m = date.getMonth(); // 0-11
  if (m >= 2 && m <= 4)  return 'spring';
  if (m >= 5 && m <= 7)  return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

/**
 * A recipe is "in season" right now when its `seasons` array is empty
 * (year-round) — except for the displayed pill, where empty means "no
 * noteworthy season" and the pill is hidden.
 */
export function isInSeason(seasons: string[] | undefined | null, when: Date = new Date()): boolean {
  if (!seasons || seasons.length === 0) return true;
  return seasons.includes(currentSeason(when));
}

/** True only when the recipe has a season tag AND that tag is the active one. */
export function isSeasonHighlight(seasons: string[] | undefined | null, when: Date = new Date()): boolean {
  if (!seasons || seasons.length === 0) return false;
  return seasons.includes(currentSeason(when));
}
