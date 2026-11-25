import type { Effect } from '../../stage/types';
import noise from '../glsl/noise.glsl?raw';
import source from './drift.frag.glsl?raw';

export const drift: Effect = {
  id: 'background-drift',
  fragment: `${noise}\n${source}`,
  uniforms: {
    uSpeed: { value: 0.03 },
    uBase: { value: 0.95 },
    uSmoke: { value: 0.12 },
    uEdge: { value: 0.06 },
  },
};
