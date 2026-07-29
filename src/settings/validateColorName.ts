/**
 * A palette name has to survive inside ~={name} markup, so it may not contain
 * anything the tokenizer treats as a delimiter: letters, digits, dash and
 * underscore only.
 */
export function validateColorName(name: string): boolean {
	return /^[A-Za-z0-9_-]+$/.test(name);
}
