/**
 * Matches a literal color written directly in the markup instead of a name.
 * Supported: #rgb, #rgba, #rrggbb, #rrggbbaa (case insensitive).
 */
export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Is this markup token a literal color rather than a name? */
export function isLiteralColor(token: string): boolean {
	return HEX_COLOR.test(token);
}

/**
 * The one gate every hex passes through. Accepts a hex with or without the
 * leading `#`, in any case, and answers with the canonical lowercase form —
 * or null for anything that is not a hex color at all.
 *
 * Everything that ends up in a style attribute comes through here, which is
 * what keeps "a color" and "an arbitrary css string" from being the same
 * type in this codebase.
 */
export function parseHex(value: unknown): string | null {
	if (typeof value != "string") {
		return null;
	}
	const trimmed = value.trim();
	const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
	return HEX_COLOR.test(withHash) ? withHash.toLowerCase() : null;
}

/** Coerce user input into a valid hex, or the fallback if it cannot be one. */
export function normalizeHex(value: string, fallback = "#ff0000"): string {
	return parseHex(value) ?? fallback;
}

/**
 * The native <input type="color"> only understands #rrggbb, so expand short
 * form and drop any alpha channel before handing a value to the picker.
 */
export function toPickerHex(hex: string): string {
	const body = hex.replace("#", "");
	if (body.length === 3 || body.length === 4) {
		return "#" + body.slice(0, 3).split("").map(c => c + c).join("");
	}
	return "#" + body.slice(0, 6);
}
