import type { Effect } from '../stage/types';

/** One look for the site: which effect fills each stage slot. */
export interface Theme {
  readonly id: string;
  readonly background: Effect;
  readonly logo: Effect;
}
