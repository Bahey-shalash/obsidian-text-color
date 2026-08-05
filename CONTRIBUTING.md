# Contributing

Thanks for taking an interest in this plugin. Bug reports and pull requests are
both welcome.

## Reporting a bug

Open an issue using the bug report template. The two things that make a report
actionable are the **markup you typed** and **which mode it rendered wrong in**
(live preview, reading mode or PDF export), since the three take different code
paths and a bug in one is usually fine in the others.

## Getting set up

```bash
npm install
npm run dev
```

`npm run dev` bundles `src/main.ts` into `main.js`, compiles `styles/styles.scss`
into `styles.css`, and watches both. To try your build, symlink or copy
`main.js`, `styles.css` and `manifest.json` into
`<vault>/.obsidian/plugins/colors/` and reload Obsidian.

## Before opening a pull request

```bash
npm run build
npm run lint
npm test
```

All three run in CI and must pass. `npm run build` typechecks with `tsc` before
bundling, so it catches more than the bundler alone would.

If you change the grammar in `src/parser/textColorLanguage.grammar`, regenerate
the parser and commit the result:

```bash
npm run grammar
```

## How the code is laid out

| Path | What lives there |
| --- | --- |
| `src/syntax/` | The markup itself: the grammar's shape, protected blocks, markers |
| `src/editor/` | Live preview: CodeMirror decorations, widgets, state fields |
| `src/reading/` | Reading mode and PDF export: the markdown post processor |
| `src/color/` | Hex parsing, token resolution and the one style definition |
| `src/settings/` | Settings, migration between versions, the settings tab |
| `src/ui/` | Modals: the color suggester, the custom hex picker |

Two conventions worth knowing before you edit:

- **One style definition.** `src/color/ColorStyle.ts` is the only place that
  decides how a colored run is styled. The hex travels as the `--ftc-color`
  custom property and the declarations live in `styles/_inline-color.scss`, so
  themes and CSS snippets can override them. Do not write `color:` into a style
  attribute.
- **Hexes are validated at the boundary.** Only a value returned by `parseHex`
  or `resolveTokenHex` may reach a style attribute. Everything else is untrusted
  note content.

## Tests

Tests live in `test/` and run under Jest. Renderer tests use jsdom through
`test/support/dom.ts`, which installs the handful of DOM helpers Obsidian adds
on top of the standard ones. `test/syntaxConformance.test.ts` asserts that live
preview and reading mode color the same characters for the same input: if you
touch either path, that is the test that catches a divergence.
