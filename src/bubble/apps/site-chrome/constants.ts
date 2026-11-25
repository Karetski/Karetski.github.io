export const TITLE = 'Alexey Karetski';

export const TOGGLE_DARK_LABEL  = 'switch to dark';
export const TOGGLE_LIGHT_LABEL = 'switch to light';
export const NAV_PLAY_LABEL = 'bubble game';
export const NAV_BACK_LABEL = 'back';

// Root-absolute so the links work from any page depth. In play mode "back"
// returns to the projects list, the bubble page's parent.
export const NAV_HOME_HREF = '/projects';
export const NAV_PLAY_HREF = '/projects/bubble';

export const FRAME_PAD = 4;
export const FRAME_GAP = 1;

export interface LinkSpec {
  label: string;
  href: string;
}

export const LINKS: readonly LinkSpec[] = [
  { label: 'linkedin', href: 'https://www.linkedin.com/in/karetski' },
  { label: 'github',   href: 'https://github.com/karetski' },
  { label: 'x',        href: 'https://x.com/karetski23' },
];
