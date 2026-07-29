/**
 * The coloring syntax as text.
 *
 * `~={token}` opens a colored section, `=~` closes it. The token may contain
 * neither whitespace nor a closing brace, which is exactly how the grammar in
 * `textColorLanguage.grammar` tokenizes it. That agreement is not a comment
 * any more: `test/syntaxConformance.test.ts` feeds one corpus through both
 * implementations and fails when they drift apart.
 */

/** `~={token}` — the opening marker, token included. */
export const OPEN = /~=\{[^}\s]+\}/g;

/** `=~` — the closing marker. */
export const CLOSE = /=~/g;

/** The literal text an opening marker starts with. */
export const OPEN_START = "~={";

/** The literal text of a closing marker. */
export const CLOSE_MARKER = "=~";

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
