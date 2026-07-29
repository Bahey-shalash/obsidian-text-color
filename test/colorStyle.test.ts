import { colorStyle } from "src/color/ColorStyle";
import { resolveTokenHex } from "src/color/resolveToken";
import { DEFAULT_SETTINGS, FastTextColorPluginSettings } from "src/settings/settings";

const settings: FastTextColorPluginSettings = {
	...structuredClone(DEFAULT_SETTINGS),
	palette: [{ name: "code", hex: "#a6c25a" }],
};

describe("colorStyle", () => {
	test("carries the color through the --ftc-color variable", () => {
		expect(colorStyle("#ff8800")).toBe("--ftc-color: #ff8800; color: var(--ftc-color);");
	});

	test("colors inline code only when the setting asks for it", () => {
		expect(colorStyle("#ff8800", { colorCodeSection: true })).toContain("--code-normal: var(--ftc-color);");
		expect(colorStyle("#ff8800", { colorCodeSection: false })).not.toContain("--code-normal");
	});
});

describe("resolveTokenHex", () => {
	test("a hex literal is itself", () => {
		expect(resolveTokenHex("#0f8", settings)).toBe("#0f8");
	});

	test("uppercase literals come back canonical", () => {
		expect(resolveTokenHex("#FF8800", settings)).toBe("#ff8800");
	});

	test("palette names resolve to their hex", () => {
		expect(resolveTokenHex("code", settings)).toBe("#a6c25a");
	});

	test("unknown names and empty tokens are not colors", () => {
		expect(resolveTokenHex("mystery", settings)).toBe(null);
		expect(resolveTokenHex("", settings)).toBe(null);
	});

	/**
	 * Settings are normalized on load, so this cannot normally happen — but a
	 * value that is not a hex must never reach a style attribute, whatever
	 * put it in the settings.
	 */
	test("a non-hex that somehow reached the settings resolves to nothing", () => {
		const corrupt = {
			...settings,
			palette: [{ name: "evil", hex: "red; background-image: url(https://example.com/beacon)" }],
		};
		expect(resolveTokenHex("evil", corrupt)).toBe(null);
	});
});
