# Colors

Color text in Obsidian with a hex-based markup syntax. The note stores a plain hex, so what renders is what is written: live preview, reading mode and PDF export all draw the same inline color.

```
~={#fb464c} colored text $x_{n}^2$ =~
~={#027aff}you can even ~={#e0de71}color=~ text inside colored text =~
```

![The markup above rendered: red text with colored LaTeX, and a yellow word nested inside a blue sentence](images/demo.png)

## Features

- Hex-in-the-note markup: `~={#rrggbb}colored text=~` — no configuration attached, notes render the same on any machine
- Identical rendering in live preview, reading mode and PDF export (all three share one style definition, by construction)
- Name-to-hex palette: menus and the command suggester show names, notes always receive the hex
- Typing a palette name by hand (`~={yellow}`) is rewritten to its hex the moment the token completes
- Interactive delimiter: a small color swatch in front of the visible hex (VS Code style), with a hover menu to change or remove the color
- Rendered LaTeX inside colored text is colored too
- Lean by design: no themes, no per-id formatting, no generated CSS

## Usage

### Syntax

```
~={#ff8800} This text uses that color =~
~={#0f8}    Short form works too =~
~={#ff880080} So does an alpha channel =~
```

Colors nest, and rendered LaTeX inside a colored section is colored too.

### Applying color

- Select text, right click → **Color** submenu: palette names, `Custom...` picker, remove
- Commands: `Change text color` (palette suggester), `Apply custom color (hex)`, `Apply latest color`, `Remove text color`
- Press Tab at the end of a colored section to jump out of it

### Settings

The palette is a simple list of name → hex rows: recolor, rename, reorder, delete. Names are menu labels only; they never enter your notes.

## Installation

Not yet in the community plugin directory. Until then, install via [BRAT](https://github.com/TfTHacker/obsidian42-brat) with this repository's URL, or copy `main.js`, `manifest.json` and `styles.css` from the latest release into `.obsidian/plugins/colors/`.

## About this fork

A lean fork of [Fast Text Color](https://github.com/Superschnizel/obsidian-fast-text-color) by Leon Holtmeier. The markup syntax and the lezer grammar carry over; rendering was rebuilt hex-only, and themes, per-id formatting, keybinds and the floating color menu were removed by design. There is no separate migration layer: notes written with the original `~={id}` markup render whenever a palette entry carries that name, and editing such a token rewrites it to its hex. Licensed GPL-3.0, like the original.

## How it works

A custom lezer parser integrates the coloring syntax with Obsidian's editor; reading mode walks the rendered blocks. All coloring is applied as inline styles derived from the hex in the markup.
