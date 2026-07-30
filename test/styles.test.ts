/**
 * Guards on the compiled stylesheet.
 *
 * The colors themselves are asserted elsewhere by reading `--ftc-color` back
 * out of a style attribute, which says nothing about whether the declaration
 * that consumes it actually wins the cascade. These two rules are the ones
 * that have to out-specify obsidian's own, and nothing else in the suite would
 * notice if they stopped.
 */
import * as sass from "sass";
import { COLORED_CLASS } from "src/color/ColorStyle";

const css = sass.compile("styles/styles.scss").css;

/** The stylesheet with comments stripped, so assertions cannot match prose. */
const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("colored text", () => {
	test("the class renders the color", () => {
		expect(declarations).toMatch(new RegExp(`\\.${COLORED_CLASS}\\b`));
		expect(declarations).toContain("color: var(--ftc-color)");
	});

	/**
	 * The settings tab colors a palette name by putting the class on a text
	 * input, and obsidian colors those through `input[type='text']`, which
	 * out-specifies a bare class. Without an `input`-qualified selector the
	 * name silently renders in `--text-normal`.
	 */
	test("an input carrying the class keeps its color", () => {
		expect(declarations).toMatch(new RegExp(`input\\.${COLORED_CLASS}\\b`));
	});
});

/**
 * Inline styles and `!important` both lock themes and css snippets out of the
 * one thing this plugin renders; the whole point of moving the declarations
 * into this stylesheet was to let them back in.
 */
test("nothing is forced with !important", () => {
	expect(declarations).not.toContain("!important");
});
