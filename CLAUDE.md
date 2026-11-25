# CLAUDE.md

@.claude/agentkit-conduct.md

## What this is

`karetski.com`: a minimal personal site and a showcase for shader art, built with Astro as a fully static site. Pages render to plain HTML at build time; a WebGL layer (three.js) draws a background effect and a logo effect over them. Themes swap those effects by date (seasons, occasions). The visual baseline is light grayscale (pale background, dark content), set in Outfit, with no dark mode.

The bubble shooter (`/projects/bubble`) is an older, separate app on its own character-grid engine, kept working as-is.

**Less is more.** Prefer deleting to adding: no new dependency, file, abstraction, wrapper element, attribute, or CSS rule unless something concrete needs it. The only runtime dependency is three.js; dev dependencies are Astro, Vitest, TypeScript, Playwright, and type packages. Ask before adding anything to `package.json`, including Astro integrations and UI frameworks (React etc.).

## Commands

Node (version in `.nvmrc`) and npm. No other toolchain.

```bash
npm install
npm run dev         # Astro dev server with live reload (http://localhost:4321)
npm run build       # static site → dist/ (minified, hashed)
npm run typecheck   # tsc --noEmit, strict (.ts files; .astro frontmatter is not checked, so keep logic in .ts)
npm test            # Vitest: *.test.ts under src/ and tests/
npm run verify      # build, serve dist/ like GitHub Pages, smoke-test every page in Chromium
```

`verify` fails on any console error, failed request, shader page whose stage didn't start, or theme that doesn't come up under `?theme=<id>`. It writes screenshots (one per theme, at a fixed time) to `/tmp/claude/verify`. Chromium and the dev server can't run inside the Claude Code sandbox, and Astro needs `ASTRO_TELEMETRY_DISABLED=1` there.

## Layout

```
src/
  pages/       routes: src/pages/about.astro → /about, projects/index.astro → /projects
  layouts/     Site.astro: head, stage canvas, and stage entry for every shader-site page
  components/  Logo.astro: the inline AK mark, optical centre computed at build time
  styles/      site.css
  site.ts      stage entry: picks the theme, starts the stage
  stage/       shader runtime (renderer, slots, prelude GLSL, adaptive resolution) and logo geometry
               (SVG outline, SDF bake, optical centre)
  effects/     background/*, logo/*, shared GLSL chunks in glsl/
  themes/      one file per theme (<id>.ts), plus Theme type, registry, date schedule
  assets/      ak.svg (canonical logo), fonts/ (processed and hashed by the build)
  bubble/      the game: engine, logic, page entry and styles (closed: fix-only, nothing else imports it)
public/        copied as-is: favicons
scripts/       verify.ts
docs/shaders.md   the stage contract and performance budget
```

Imports flow `pages → layouts/components → site.ts → themes → effects → stage`.

## Pages

- A new page is a `.astro` file under `src/pages/`, copied from `src/pages/about.astro`. It wraps its content in `<Site title="…">`.
- Link without a trailing slash (`/about`). GitHub Pages redirects it to `/about/`, and the dev server serves both.
- Import files (CSS, fonts, `?raw`/`?url` assets) from `src/` so the build hashes them. Only files that need a fixed URL go in `public/`.
- Keep logic out of `.astro` frontmatter: put it in a `.ts` module so `tsc` and Vitest cover it.
- `<Logo />` inlines `src/assets/ak.svg` and opts the page into the logo slot. Its optical centre (a port of javier.xyz/visual-center) is computed at build time into `--optical-x`/`--optical-y`; CSS applies them where a logo should look centred. Edit the SVG file and every page follows.
- Pages must work with no JS or WebGL, and render in their final position on the first frame: anything that affects layout is computed at build time, not after scripts load.
- Keep markup semantic and minimal.
- The home composition is a golden-ratio modular scale keyed to the logo height (`--l` in `site.css`, taken from the original sketch). Size and space anything new on home as `--l / φⁿ`, measured centre to centre, rather than adding fixed values.
- Visitor-facing copy stays plain and short. No taglines or self-descriptions; let the content speak.

## Shader stage

Read `docs/shaders.md` before touching `src/stage/` or `src/effects/`. In short:

- An effect is `{ id, fragment, uniforms?, bleed? }`, where `fragment` is GLSL ES 3.00 in a `.glsl` file, imported with `?raw`.
- A theme maps the two slots to effects. Non-default themes are dynamic imports.
- `?theme=<id>` forces a theme; `?t=<seconds>` freezes time.
- Performance is a requirement. Run `hot-path-budget-audit` on any change to the frame loop or a shader.

## TypeScript

`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. Indexed access is `T | undefined`, so use `!` after a bounds check or `?.`. Type-only imports use `import type`. Scripts run directly with Node's built-in TypeScript support, so they import only packages and `node:` modules, not `src/`.

## Skills

- `shader-effect`: write or change an effect.
- `seasonal-theme`: add a dated theme.
- General: `architecture-canon`, `behavioral-testing`, `commit-discipline`, `debugging-methodology`, `function-shape`, `hot-path-budget-audit`, `principle-review` (this file is the principles), `simplify-ruthless`.

## Deploy

Push to `main` → GitHub Actions: `npm ci`, typecheck, test, build, then publish `dist/` to GitHub Pages. The custom domain lives in the repo's Pages settings.
