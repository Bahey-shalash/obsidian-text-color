import {
	COLORED_CLASS,
	CODE_SECTION_CLASS,
	applyColorStyle,
	clearColorStyle,
	colorClasses,
	colorPropStyle,
} from "src/color/ColorStyle";
import { resolveTokenHex } from "src/color/resolveToken";
import { DEFAULT_SETTINGS, FastTextColorPluginSettings } from "src/settings/settings";
import { setupDom } from "./support/dom";

beforeAll(setupDom);

const settings: FastTextColorPluginSettings = {
	...structuredClone(DEFAULT_SETTINGS),
	palette: [{ name: "code", hex: "#a6c25a" }],
};

describe("colorPropStyle", () => {
	test("carries the color through the --ftc-color variable", () => {
		expect(colorPropStyle("#ff8800")).toBe("--ftc-color: #ff8800;");
	});

	/**
	 * The declarations live in the stylesheet, not here: an inline `color` can
	 * only be overridden with `!important`, which locks themes out.
	 */
	test("carries nothing but the variable", () => {
		expect(colorPropStyle("#ff8800")).not.toContain("color: var");
	});
});

describe("colorClasses", () => {
	test("colors inline code only when the setting asks for it", () => {
		expect(colorClasses({ colorCodeSection: true })).toBe(`${COLORED_CLASS} ${CODE_SECTION_CLASS}`);
		expect(colorClasses({ colorCodeSection: false })).toBe(COLORED_CLASS);
		expect(colorClasses()).toBe(COLORED_CLASS);
	});
});

describe("applyColorStyle", () => {
	function span(): HTMLElement {
		return document.createElement("span");
	}

	test("the class renders the color, the style attribute only holds the hex", () => {
		const el = span();
		applyColorStyle(el, "#ff8800");

		expect(el.classList.contains(COLORED_CLASS)).toBe(true);
		expect(el.getAttribute("style")).toBe("--ftc-color: #ff8800;");
	});

	test("the code section class follows the setting", () => {
		const on = span();
		applyColorStyle(on, "#ff8800", { colorCodeSection: true });
		expect(on.classList.contains(CODE_SECTION_CLASS)).toBe(true);

		const off = span();
		applyColorStyle(off, "#ff8800", { colorCodeSection: false });
		expect(off.classList.contains(CODE_SECTION_CLASS)).toBe(false);
	});

	/** Math widgets are obsidian's, not ours; stale coloring has to come off cleanly. */
	test("clearColorStyle leaves the element as it was found", () => {
		const el = span();
		applyColorStyle(el, "#ff8800", { colorCodeSection: true });
		clearColorStyle(el);

		expect(el.classList.contains(COLORED_CLASS)).toBe(false);
		expect(el.classList.contains(CODE_SECTION_CLASS)).toBe(false);
		expect(el.style.getPropertyValue("--ftc-color")).toBe("");
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
	 * Settings are normalized on load, so this cannot normally happen, but a
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
