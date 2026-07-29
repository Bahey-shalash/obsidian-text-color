import { EditorState } from "@codemirror/state";
import { textColorParserField } from "src/editor/TextColorStateField";
import { findNameConversions } from "src/editor/AutoHexify";

function stateOf(doc: string): EditorState {
	return EditorState.create({ doc, extensions: [textColorParserField] });
}

const resolve = (id: string) =>
	({ yellow: "#e0de71", red: "#e93147" } as Record<string, string>)[id] ?? null;

function whole(doc: string) {
	return [{ from: 0, to: doc.length }];
}

function conversionsIn(doc: string) {
	return findNameConversions(stateOf(doc), whole(doc), resolve);
}

describe("findNameConversions", () => {
	test("a completed palette name converts to its hex", () => {
		expect(conversionsIn("~={yellow}test=~")).toEqual([{ from: 3, to: 9, insert: "#e0de71" }]);
	});

	test("an unfinished token is left alone while typing", () => {
		expect(conversionsIn("~={yellow")).toEqual([]);
	});

	test("hex literals are not touched", () => {
		expect(conversionsIn("~={#e0de71}test=~")).toEqual([]);
	});

	test("unknown names stay untouched", () => {
		expect(conversionsIn("~={mystery}test=~")).toEqual([]);
	});

	test("only tokens near the edited range convert", () => {
		const doc = "~={red}a=~ filler filler filler filler filler filler filler filler ~={yellow}b=~";
		const editAtEnd = [{ from: doc.length - 3, to: doc.length }];
		const conversions = findNameConversions(stateOf(doc), editAtEnd, resolve);
		expect(conversions).toHaveLength(1);
		expect(conversions[0].insert).toBe("#e0de71");
	});

	test("nested completed names both convert when in range", () => {
		const conversions = conversionsIn("~={red}out ~={yellow}in=~ side=~");
		expect(conversions.map(c => c.insert).sort()).toEqual(["#e0de71", "#e93147"]);
	});

	test("the same token is not reported twice for overlapping ranges", () => {
		const doc = "~={yellow}test=~";
		const ranges = [{ from: 0, to: 5 }, { from: 4, to: doc.length }];
		expect(findNameConversions(stateOf(doc), ranges, resolve)).toHaveLength(1);
	});
});

/**
 * This is the only part of the plugin that writes to the user's file on its
 * own. Markup inside a code fence is a code sample — most likely someone
 * documenting this very syntax — and rewriting it as they type is the worst
 * thing the plugin could do. It uses the same rule live preview uses.
 */
describe("literal code is never rewritten", () => {
	test("a fenced code block is left alone", () => {
		expect(conversionsIn("```\n~={red}hello=~\n```\n")).toEqual([]);
	});

	test("a fenced code block with a language is left alone", () => {
		expect(conversionsIn("```js\nlet s = \"~={red}x=~\";\n```")).toEqual([]);
	});

	test("inline code is left alone", () => {
		expect(conversionsIn("`~={red}hi=~`")).toEqual([]);
	});

	test("real markup next to a code sample still converts", () => {
		const doc = "`~={red}sample=~` and ~={yellow}real=~";
		const conversions = conversionsIn(doc);
		expect(conversions).toHaveLength(1);
		expect(conversions[0].insert).toBe("#e0de71");
	});

	test("an unbalanced backtick is plain text, so markup behind it converts (#41)", () => {
		const conversions = conversionsIn("` stray ~={red}x=~");
		expect(conversions.map(c => c.insert)).toEqual(["#e93147"]);
	});
});
