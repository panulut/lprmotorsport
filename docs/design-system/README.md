# LPR Motorsport UI foundations

Self-hosted type and color tokens, plus a standalone reference at `/design-system.html`. The reference is English-only. The game supports Finnish and English.

## Decisions

- **Headings:** Stack Sans Headline, weight 400 maximum.
- **Body and controls:** Inter.
- **Delivery:** Font files live under `assets/fonts/` with their SIL Open Font License notices. Pages do not request Google Fonts.
- **Neutrals:** Geist-style dark grays. Brand green is the logo color `#03BC7E`. Purple, amber, red, and blue are the semantic ramps.
- **Icons:** Phosphor regular SVGs, MIT license in `assets/PHOSPHOR-LICENSE.txt`.
- **Type scale:** 12, 14, 16, 18, 20, 24, 28, 32, 40, and 48 px, plus a fluid display size. Prefer the `--text-*` aliases in `design-tokens.css`.

## Review

`npm run dev`, then open `/design-system.html` and `/`. The player build includes the token stylesheets and self-hosted fonts. It does not publish `design-system.html`.

`npm run build` and `npm run test:tools`.
