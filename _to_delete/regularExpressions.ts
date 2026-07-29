// the token can contain neither whitespace nor a closing brace,
// matching how the live preview grammar tokenizes it.
export const PREFIX = /~=\{[^}\s]+\}/g
export const SUFFIX = /=~/g

export interface RegExMatch {
	index: number;
	value: string;
	end: number;
}

/** First match of the regex in the text; the regex object is never mutated. */
export function firstMatch(text: string, regex: RegExp): RegExMatch | null {
	const fresh = new RegExp(regex.source, "g");
	const m = fresh.exec(text);
	return m == null ? null : { index: m.index, value: m[0], end: m.index + m[0].length };
}
