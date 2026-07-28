import { isLiteralColor, literalTextColor, toPickerHex } from "../src/color/InlineColor";
import { parser } from "../src/rendering/language/textColorLanguageParser";

describe("isLiteralColor", () => {
	test("accepts 3, 4, 6 and 8 digit hex", () => {
		["#0f8", "#0f8a", "#ff8800", "#FF8800", "#ff880080"].forEach(hex => {
			expect(isLiteralColor(hex)).toBe(true);
		});
	});

	test("rejects ids and malformed hex", () => {
		// note: #ff88 is valid, it is the 4 digit #rgba short form
		["red", "ff8800", "#gg8800", "#ff880", "#ff88000", "#", ""].forEach(token => {
			expect(isLiteralColor(token)).toBe(false);
		});
	});
});

describe("literalTextColor", () => {
	test("produces an inline style carrying the color", () => {
		const style = literalTextColor("#ff8800").getCssInlineStyle();
		expect(style).toContain("--ftc-color: #ff8800;");
		expect(style).toContain("color: var(--ftc-color);");
	});

	test("does not add per-id formatting a literal color cannot carry", () => {
		const style = literalTextColor("#ff8800").getCssInlineStyle();
		expect(style).not.toContain("font-weight");
		expect(style).not.toContain("font-style");
		expect(style).not.toContain("text-decoration");
	});

	test("follows the colorCodeSection setting like a theme color", () => {
		// @ts-expect-error only the one field is read
		const style = literalTextColor("#ff8800").getCssInlineStyle({ colorCodeSection: true });
		expect(style).toContain("--code-normal: var(--ftc-color);");
	});
});

describe("toPickerHex", () => {
	test("expands short form and drops alpha for the native picker", () => {
		expect(toPickerHex("#0f8")).toBe("#00ff88");
		expect(toPickerHex("#0f8a")).toBe("#00ff88");
		expect(toPickerHex("#ff8800")).toBe("#ff8800");
		expect(toPickerHex("#ff880080")).toBe("#ff8800");
	});
});

describe("grammar", () => {
	/** collect the text of every Color token in the parse tree */
	function colorsOf(input: string): string[] {
		const out: string[] = [];
		parser.parse(input).iterate({
			enter(node) {
				if (node.name === "Color") {
					out.push(input.slice(node.from, node.to));
				}
			},
		});
		return out;
	}

	test("tokenizes a literal color the same way as an id", () => {
		expect(colorsOf("~={red}hello=~")).toEqual(["red"]);
		expect(colorsOf("~={#ff8800}hello=~")).toEqual(["#ff8800"]);
	});

	test("handles literal and named colors nested together", () => {
		expect(colorsOf("~={#ff8800}outer ~={blue}inner=~ tail=~")).toEqual(["#ff8800", "blue"]);
	});
});
