import type { Effect } from '../../stage/types';
import source from './solid.frag.glsl?raw';

export const solid: Effect = {
  id: 'logo-solid',
  fragment: source,
  uniforms: {
    uLevel: { value: 0.1 },
    uHalo: { value: 0.06 },
    uHaloCssPx: { value: 6 },
  },
  bleed: 24,
};
