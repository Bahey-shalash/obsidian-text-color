import type { FastTextColorPluginSettings } from "src/settings/settings";
import { isLiteralColor, parseHex } from "src/color/InlineColor";

/**
 * What a markup token means: a hex literal is itself, a palette name resolves
 * through the settings, anything else is not a color.
 *
 * The answer is always a canonical hex or null. Settings are normalized on
 * load, and this second gate means even a hand edited data.json cannot get a
 * non-color into a style attribute.
 */
export function resolveTokenHex(token: string, settings: FastTextColorPluginSettings): string | null {
	if (isLiteralColor(token)) {
		return token.toLowerCase();
	}
	const configured = settings.palette.find(c => c.name === token)?.hex;
	return configured == undefined ? null : parseHex(configured);
}

/** Resolver over the configured palette names. */
export function makeNameResolver(settings: FastTextColorPluginSettings): (name: string) => string | null {
	return (name: string) => resolveTokenHex(name, settings);
}
