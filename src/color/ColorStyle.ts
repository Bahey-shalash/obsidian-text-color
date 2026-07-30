import type { FastTextColorPluginSettings } from "src/settings/settings";

/** Only the part of the settings the style generator actually reads. */
export type StyleSettings = Pick<FastTextColorPluginSettings, "colorCodeSection">;

/** Turns `--ftc-color` into the rendered text color; see styles/_inline-color.scss. */
export const COLORED_CLASS = "ftc-colored";

/** Additionally recolors inline code inside the colored range. */
export const CODE_SECTION_CLASS = "ftc-code-section";

/**
 * How a colored piece of text is styled: a class carries the declarations, a
 * custom property carries the hex. One definition feeds live preview marks,
 * reading mode spans, math widgets and every preview; the property is plain
 * inline css, so it renders identically everywhere, PDF export included.
 *
 * The declarations deliberately live in the stylesheet rather than in the style
 * attribute: an inline `color` can only be overridden with `!important`, which
 * locks themes and css snippets out of the one thing this plugin renders.
 *
 * `hex` must be a value that came out of `parseHex` or `resolveTokenHex`;
 * nothing else may reach a style attribute.
 */
export function colorClasses(settings?: StyleSettings): string {
	return settings?.colorCodeSection
		? `${COLORED_CLASS} ${CODE_SECTION_CLASS}`
		: COLORED_CLASS;
}

/** The hex as a custom property, for the consumers that set properties on an element. */
export function colorProps(hex: string): Record<string, string> {
	return { "--ftc-color": hex };
}

/**
 * The same custom property as a style declaration, for codemirror mark
 * decorations: a mark takes a class and an attribute bag, never an element, so
 * the property can only reach it as text.
 */
export function colorPropStyle(hex: string): string {
	return `--ftc-color: ${hex};`;
}

/** Color an element's text. */
export function applyColorStyle(el: HTMLElement, hex: string, settings?: StyleSettings): void {
	el.addClass(COLORED_CLASS);
	if (settings?.colorCodeSection) {
		el.addClass(CODE_SECTION_CLASS);
	}
	el.setCssProps(colorProps(hex));
}

/** Undo `applyColorStyle`, leaving the element as it was found. */
export function clearColorStyle(el: HTMLElement): void {
	el.removeClass(COLORED_CLASS);
	el.removeClass(CODE_SECTION_CLASS);
	el.setCssProps({ "--ftc-color": "" });
}
