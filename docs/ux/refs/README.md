# Visual references

Drop binary references (PNGs, screenshots, exported design files) here. Referenced from `docs/ux/briefs/*.md`.

## Expected files

| Filename | What it is | Source |
|---|---|---|
| `lovable-h1-portfolio.png` | Lovable's validated H1 portfolio mockup (2026-05-12). Dark theme, dense table, rollup strip, all 4 fixture projects, auth-service-migration flagged as regression. | Generated via Lovable from `docs/ux/briefs/H1-portfolio.md` + the marketing one-pager as the visual anchor. |
| `marketing-one-pager.png` | The dark/teal/precise one-pager that anchored the brand direction. | Source of truth for the visual mood. |

## How to add

```bash
cp ~/Downloads/<image>.png /Users/ram/Projects/coznt/docs/ux/refs/<expected-filename>.png
```

Then add the file to git: `git add docs/ux/refs/`. PNGs are small enough to commit; we're not running a binary-asset CDN for v1.
