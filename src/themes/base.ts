import { drift } from '../effects/background/drift';
import { solid } from '../effects/logo/solid';
import type { Theme } from './types';

/** Year-round default: quiet light grayscale, dark logo. */
export const base: Theme = {
  id: 'base',
  background: drift,
  logo: solid,
};
