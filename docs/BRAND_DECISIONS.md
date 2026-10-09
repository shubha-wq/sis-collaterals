# Brand decisions

Brand questions raised during the rebuild, with what's been decided and
what's still open. Code follows the "Current behaviour" column; nothing here
is changed without the brand owner's approval.

## Open

### B1. SIS logo on a coral background (type-only Block)

| | |
|---|---|
| Raised | Phase 3, Block review |
| Status | **Open: needs an approved brand asset** |
| Where it shows | Block with no photo and the **Coral** accent: the type-only composition puts the SIS roundel on a solid coral ground. The **Salmon** accent is similar but less severe. |
| The problem | The SIS roundel is a coral disc with white script. On coral, the disc merges into the background and only the thin white script stays visible. It's legible, but weak. |
| Current behaviour | **Unchanged.** The standard coral roundel is used, with no plate, no recolouring and no substitute mark. The QA fixture "No photo, full content" (coral) shows the case. |
| Ruled out by the brand owner | Adding a background plate behind the SIS logo. Creating, recolouring or otherwise modifying an SIS logo. Inventing a new SIS mark. |
| Reference assets checked | `assets/logos/sisters-in-sweat-roundel-coral.png` is the only SIS logo (`uploads/SIS.png` is byte-identical). `Logo Black/White/Lime Green@2x.png` are Hive Club wordmarks. The design system's `Wordmark` is a text component labelled a "wordmark placeholder" in its manifest, not an approved logo. **No approved alternative SIS mark exists.** |
| What would resolve it | An approved SIS mark designed for coral or dark grounds (for example a single-colour off-white or ink roundel, as a transparent PNG or SVG). Once supplied, it would be added to the built-in library and used automatically only where the SIS mark sits on coral or salmon. |
| Unaffected | Teal, royal blue and golden yellow accents, and every Block with a photo (the roundel sits on the photo there). |

## Decided

| # | Decision | Phase |
|---|---|---|
| D1 | The SIS logo is on every creative and can't be removed or deleted. | 1 |
| D2 | Nike is the only built-in partner logo. Every other partner logo is user-uploaded. No Hive Club or other predefined partners. | 2 |
| D3 | Logos are transparent by default. Plates (Paper, White, Accent) only when the person picks one; never added automatically. | 2 |
| D4 | At most 4 partner logos per creative, plus SIS. | 2 |
| D5 | Library photos ship as JPEG (quality 90); original PNGs stay in the reference extraction. | 2 |
| D6 | The low-resolution Cubbon Park street photo stays in the library with a non-blocking warning. | 2 |
| D7 | The 9 clean candidate photos stay reference-only for now. | 2 |
| D8 | Block with no photo is a type-only colour composition; logos sit top-right of it. | 3 |
| D9 | Block details are always Cards. | 3 |
| D10 | Never create, recolour or modify an SIS logo. Use only approved SIS assets. | 3 |
