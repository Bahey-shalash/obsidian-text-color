import { TextColor } from "./TextColor";

/**
 * Matches a literal color written directly in the markup instead of a color id.
 * Supported: #rgb, #rgba, #rrggbb, #rrggbbaa (case insensitive).
 */
export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Is this color token a literal color rather than an id defined in a theme?
 *
 * @param {string} token - the text between ~={ and }
 */
export function isLiteralColor(token: string): boolean {
	return HEX_COLOR.test(token);
}

/**
 * Wrap a literal color in a throwaway TextColor so it reuses the exact same
 * css declaration logic as theme colors (colorCodeSection, --ftc-color, ...).
 *
 * @param {string} hex - the literal color, e.g. #ff0000
 */
export function literalTextColor(hex: string): TextColor {
	return new TextColor(hex, hex, "literal");
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
