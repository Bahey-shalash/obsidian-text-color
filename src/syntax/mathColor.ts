import { HEX_SOURCE } from "src/color/InlineColor";

/**
 * Coloring a display math block, in latex's own terms.
 *
 * The `~={hex}...=~` markup cannot wrap a `$$` block: the moment a marker sits
 * on the line in front of the `$$`, reading mode stops parsing it as math
 * while live preview carries on rendering it, and the two modes disagree about
 * what the note even contains. Latex already knows how to color, so a math
 * block is colored the way a math block is colored — the engine does it, both
 * modes ask the same engine, and there is nothing left to disagree about.
 *
 * `\color` is a switch: it applies to the rest of the group it opens in, which
 * inside `$$ ... $$` is the whole block.
 *
 * This module owns both directions. Writing the command and finding it again
 * are the same fact, so they are the same pattern: the space `openingLineWithColor`
 * puts in front of an inline command is part of what `mathColorIn` takes back off.
 */
const MATH_COLOR = new RegExp(`\\s?\\\\color\\{${HEX_SOURCE}\\}`);

/** Where the color command sits in this line, if it carries one. */
export function mathColorIn(line: string): { index: number, length: number } | null {
	const found = MATH_COLOR.exec(line);
	return found == null ? null : { index: found.index, length: found[0].length };
}

/**
 * Is this line nothing but a color command? That is the shape this module
 * writes, and recoloring a block replaces it rather than stacking a second one
 * in front of it. A `\color` the user wove into their own latex is left where
 * it is until they ask for the color to come off.
 */
export function isMathColorLine(line: string): boolean {
	const found = mathColorIn(line);
	return found != null && line.slice(0, found.index).trim() == ""
		&& line.slice(found.index + found.length).trim() == "";
}

/**
 * The opening line of a math block, carrying the color.
 *
 * A `$$` with the line to itself keeps it, and the command goes on the line
 * behind it where it stays readable. A `$$` that already shares its line with
 * latex has to take the command inline, in front of that latex, or the content
 * ahead of it would keep the color it had.
 */
export function openingLineWithColor(line: string, hex: string): string[] {
	const command = `\\color{${hex}}`;
	const opener = line.indexOf("$$");

	if (opener < 0 || line.trim() == "$$") {
		// no latex sharing the line, so the command gets one of its own. The
		// missing `$$` cannot happen for a math block's opening line, but a
		// command dropped in front of the line would be worse than one below it.
		return [line, command];
	}

	const after = opener + "$$".length;
	return [`${line.slice(0, after)} ${command}${line.slice(after)}`];
}
