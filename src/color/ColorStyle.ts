import type { FastTextColorPluginSettings } from "src/settings/settings";

/** Only the part of the settings the style generator actually reads. */
export type StyleSettings = Pick<FastTextColorPluginSettings, "colorCodeSection">;

/**
 * The inline style for a colored piece of text. One definition feeds live
 * preview marks, reading mode spans, math widgets and every preview; it is
 * plain inline css, so it renders identically everywhere, PDF export included.
 *
 * `hex` must be a value that came out of `parseHex` or `resolveTokenHex`;
 * nothing else may reach a style attribute.
 */
export function colorStyle(hex: string, settings?: StyleSettings): string {
	const declarations = [
		`--ftc-color: ${hex};`,
		"color: var(--ftc-color);",
		settings?.colorCodeSection ? "--code-normal: var(--ftc-color);" : "",
	];
	return declarations.filter(Boolean).join(" ");
}

/** Apply the color as an inline style. */
export function applyColorStyle(el: HTMLElement, hex: string, settings?: StyleSettings): void {
	el.setAttribute("style", colorStyle(hex, settings));
}
