# Design

A modern bahi-khata: the red cloth-bound ledger of an Indian trading shop, rebuilt as a precise instrument. Light theme. The cover carries the identity; the pages stay white; ink, stamps and red-pencil marks carry meaning. All tokens live in `app/globals.css` as CSS custom properties in OKLCH.

## Color

| Token | Value | Role |
| --- | --- | --- |
| `--canvas` | `oklch(0.962 0.007 258)` | The desk behind the ledger |
| `--sheet` | `oklch(1 0 0)` | Ledger pages |
| `--sheet-2` | `oklch(0.982 0.005 258)` | Hover and quiet panels on a page |
| `--ink` | `oklch(0.25 0.045 262)` | Body text, fountain-pen blue-black (16:1 on white) |
| `--ink-2` | `oklch(0.4 0.035 262)` | Secondary text (9.2:1) |
| `--muted` | `oklch(0.52 0.025 262)` | Labels and notes (5.5:1) |
| `--rule` / `--rule-strong` | `oklch(0.915 0.024 248)` / `oklch(0.82 0.035 248)` | Blue ledger rules |
| `--margin-red` | `oklch(0.72 0.11 22)` | The double red margin line (decorative only, never text) |
| `--bahi` / `--bahi-deep` | `oklch(0.44 0.155 24)` / `oklch(0.34 0.12 22)` | The cover cloth |
| `--gold` | `oklch(0.85 0.105 86)` | Foil lettering on the cover (5.3:1 on bahi) |
| `--pass` | `oklch(0.46 0.11 150)` | Ledger-green tick |
| `--warn` / `--warn-mark` | `oklch(0.51 0.105 62)` / `oklch(0.74 0.15 75)` | Turmeric: text / marks |
| `--fail` | `oklch(0.53 0.19 30)` | Red pencil |
| `--stamp` | `oklch(0.43 0.16 300)` | Violet office-stamp ink for CHECKED |
| `--action` | `oklch(0.3 0.075 262)` | Primary buttons (white text 13.7:1) |
| `--focus` | `oklch(0.56 0.17 258)` | Focus rings, reading scan line |

Strategy: restrained pages, committed cover. Red lives on the cover and on mistakes; primary actions are ink-blue so an action never looks like an error.

## Type

- IBM Plex Sans for UI and body; IBM Plex Mono for money, GSTINs, HSN codes and dates (tabular, and 0/O, 1/I stay distinct).
- IBM Plex Sans Condensed Bold for rubber stamps only.
- Rozha One (Indian Type Foundry) for the wordmark and the two page titles only.
- Fixed rem scale, 12 / 13 / 14 / 15 / 17 / 20 / 22 px; money in Indian grouping (₹1,23,456.00).

## Components

- **Cover**: cloth texture, gold foil frame, index tabs that open into the desk.
- **Spread**: two pages with a binding shadow and a stack-of-paper edge. The photo page stays in view while the sheet scrolls.
- **Sheet**: double red margin, fields on blue rules, a double rule under the grand total.
- **GSTIN**: 15 character cells grouped state · PAN · entity · Z · check; a suspect character gets a red-pencil circle and a one-tap fix.
- **Stamp**: double-bordered, rotated, rough-edged ink. CHECKED (violet), LOOK AGAIN (turmeric), NOT READY (red). Lands with a short press animation when the verdict changes.
- **Checks**: problems as full rows with the numbers; passes as green chips.
- **Ledger**: dotted leaders to the input-tax-credit balances, mini stamps per bill.

## Motion

150–260 ms, ease-out-quint. Motion only for state: the scan line while reading, ink appearing as fields stream in, the stamp landing, a flip on a fixed GSTIN character. Everything is visible without animation; `prefers-reduced-motion` turns it all off.
