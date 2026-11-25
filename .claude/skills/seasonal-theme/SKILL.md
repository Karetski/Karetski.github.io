---
name: seasonal-theme
description: Add or change a dated theme for karetski.com — a seasonal or special-occasion look (Christmas, spring, an anniversary) that swaps the background and logo effects during a calendar window. Use when asked for a holiday/season/occasion look, to change when a theme is active, or to preview a theme out of season.
---

# Seasonal theme

A theme names one effect per slot; the schedule decides when it's active. New effects go through the `shader-effect` skill.

1. **Theme**: create `src/themes/<id>.ts`.

   ```ts
   export const winter: Theme = { id: 'winter', background: snowfall, logo: solid };
   ```

2. **Register it lazily** in `src/themes/registry.ts`:

   ```ts
   winter: () => import('./winter').then((m) => m.winter),
   ```

   Never import it statically, or every visitor downloads it all year. After `npm run build`, `dist/_astro/` should contain a separate chunk for it.

3. **Schedule it** in `src/themes/schedule.ts`:

   ```ts
   { theme: 'winter', from: '12-01', to: '02-28' },
   ```

   Dates are `'MM-DD'` in local time and inclusive. `from > to` wraps the new year. The first match wins, so list narrow occasions above broad seasons. There is no year field, so a one-off event must be removed afterwards. If the user didn't give exact dates, ask.

4. **Verify**:
   - `npm test`; add a `schedule.test.ts` case if the window relies on a rule the tests don't cover yet.
   - Run `npm run verify` outside the sandbox and check `/tmp/claude/verify/theme-<id>.png`. Verify finds themes by file name, so the file must be `src/themes/<id>.ts` with a matching `id`.
   - Preview under `npm run dev` with `/?theme=<id>` and `/about?theme=<id>`. The small logo is where artifacts show first.
