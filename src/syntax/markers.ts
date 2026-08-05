/**
 * The coloring syntax as text.
 *
 * `~={token}` opens a colored section, `=~` closes it. The token may contain
 * neither whitespace nor a closing brace, which is exactly how the grammar in
 * `textColorLanguage.grammar` tokenizes it. That agreement is not a comment
 * any more: `test/syntaxConformance.test.ts` feeds one corpus through both
 * implementations and fails when they drift apart.
 */

/** `~={token}`: the opening marker, token included. */
export const OPEN = /~=\{[^}\s]+\}/g;

/** `=~`: the closing marker. */
export const CLOSE = /=~/g;

/** The literal text an opening marker starts with. */
export const OPEN_START = "~={";

/** The literal text of a closing marker. */
export const CLOSE_MARKER = "=~";

/**
 * Whether the `=~` at this index really closes a color.
 *
 * The two markers share the `~`: `=~={red}` is an opening marker with a stray
 * `=` in front of it, not a closer that happens to be followed by one. That
 * `=` is not a contrived case: it is what obsidian leaves behind when the
 * user highlights colored text, since `==~={red}text=~==` puts the first `=`
 * of the highlight right against the opening marker. Read as a closer it eats
 * the opener and the whole expression stops existing.
 *
 * `parser/closeMarker.ts` is the same rule for the grammar.
 */
export function isCloseMarker(text: string, index: number): boolean {
	// sticky rather than a slice: this is asked per marker while rendering.
	const opener = new RegExp(OPEN.source, "y");
	opener.lastIndex = index + 1; // the `~` this closer would take
	return !opener.test(text);
}

export interface SyntaxMatch {
	index: number;
	value: string;
	end: number;
}

/** First match of the regex in the text; the regex object is never mutated. */
export function firstMatch(text: string, regex: RegExp): SyntaxMatch | null {
	const fresh = new RegExp(regex.source, "g");
	const m = fresh.exec(text);
	return m == null ? null : { index: m.index, value: m[0], end: m.index + m[0].length };
}

/** The token inside an opening marker: `~={red}` -> `red`. */
export function tokenOf(openMarker: string): string {
	return openMarker.slice(OPEN_START.length, openMarker.length - 1);
}

/** The opening marker for a token: `red` -> `~={red}`. */
export function openMarkerFor(token: string): string {
	return `${OPEN_START}${token}}`;
}
