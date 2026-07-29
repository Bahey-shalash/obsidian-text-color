import { isLiteralColor, normalizeHex, parseHex, toPickerHex } from "src/color/InlineColor";
import { parser } from "src/parser/textColorLanguageParser";

describe("isLiteralColor", () => {
	test("accepts 3, 4, 6 and 8 digit hex", () => {
		["#0f8", "#0f8a", "#ff8800", "#FF8800", "#ff880080"].forEach(hex => {
			expect(isLiteralColor(hex)).toBe(true);
		});
	});

	test("rejects names and malformed hex", () => {
		// note: #ff88 is valid, it is the 4 digit #rgba short form
		["red", "ff8800", "#gg8800", "#ff880", "#ff88000", "#", ""].forEach(token => {
			expect(isLiteralColor(token)).toBe(false);
		});
	});
});

describe("parseHex", () => {
	test("canonicalizes anything that is a hex", () => {
		expect(parseHex("#FF8800")).toBe("#ff8800");
		expect(parseHex(" 0F8 ")).toBe("#0f8");
	});

	test("answers null for everything that is not", () => {
		["red", "rgb(1,2,3)", "inherit", "#ff880", "", "  ",
			"red; background-image: url(https://example.com/x)"].forEach(value => {
			expect(parseHex(value)).toBe(null);
		});
	});

	test("answers null for values that are not even strings", () => {
		[null, undefined, 42, {}, ["#fff"]].forEach(value => {
			expect(parseHex(value)).toBe(null);
		});
	});
});

describe("normalizeHex", () => {
	test("adds the missing # and lowercases", () => {
		expect(normalizeHex("FF8800")).toBe("#ff8800");
		expect(normalizeHex(" #0F8 ")).toBe("#0f8");
	});

	test("falls back on garbage", () => {
		expect(normalizeHex("not a color")).toBe("#ff0000");
		expect(normalizeHex("zz8800", "#123456")).toBe("#123456");
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

	test("tokenizes a literal color the same way as a name", () => {
		expect(colorsOf("~={red}hello=~")).toEqual(["red"]);
		expect(colorsOf("~={#ff8800}hello=~")).toEqual(["#ff8800"]);
	});

	test("handles literal and named colors nested together", () => {
		expect(colorsOf("~={#ff8800}outer ~={blue}inner=~ tail=~")).toEqual(["#ff8800", "blue"]);
	});
});
