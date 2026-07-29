import { EditorState } from "@codemirror/state";
import { textColorParserField } from "src/editor/TextColorStateField";
import { enclosingExpression, expressionColorAt } from "src/editor/treeQueries";
import { isClosedCodeSection, isInsideLiteralCode } from "src/syntax";

function stateOf(doc: string): EditorState {
	return EditorState.create({ doc, extensions: [textColorParserField] });
}

describe("expressionColorAt", () => {
	test("inside a colored expression returns its token", () => {
		const doc = "~={red}test math=~";
		expect(expressionColorAt(stateOf(doc), doc.indexOf("math"))).toBe("red");
	});

	test("hex tokens come back verbatim", () => {
		const doc = "a ~={#ff8800}test=~ b";
		expect(expressionColorAt(stateOf(doc), doc.indexOf("test"))).toBe("#ff8800");
	});

	test("outside any expression returns null", () => {
		const doc = "plain ~={red}x=~ tail";
		const state = stateOf(doc);
		expect(expressionColorAt(state, 2)).toBe(null);
		expect(expressionColorAt(state, doc.length - 1)).toBe(null);
	});

	test("nested expressions resolve to the innermost color", () => {
		const doc = "~={red}out ~={blue}in=~ side=~";
		const state = stateOf(doc);
		expect(expressionColorAt(state, doc.indexOf("in="))).toBe("blue");
		expect(expressionColorAt(state, doc.indexOf("side"))).toBe("red");
	});

	test("empty token yields null", () => {
		const doc = "~={}text=~";
		expect(expressionColorAt(stateOf(doc), doc.indexOf("text"))).toBe(null);
	});
});

describe("enclosingExpression", () => {
	test("finds the expression a position sits in", () => {
		const doc = "tail ~={red}body=~ more";
		const node = enclosingExpression(stateOf(doc), doc.indexOf("body"));
		expect(node?.from).toBe(doc.indexOf("~={red}"));
	});

	test("null outside any expression", () => {
		const doc = "tail ~={red}body=~ more";
		expect(enclosingExpression(stateOf(doc), 1)).toBe(null);
	});
});

describe("isClosedCodeSection", () => {
	test("balanced inline code is closed", () => {
		expect(isClosedCodeSection("`code`")).toBe(true);
	});

	test("an unbalanced backtick is not", () => {
		expect(isClosedCodeSection("` b ~={red}c=~ d")).toBe(false);
		expect(isClosedCodeSection("`")).toBe(false);
	});
});

describe("isInsideLiteralCode", () => {
	function inCode(doc: string, needle: string): boolean {
		const state = stateOf(doc);
		const tree = state.field(textColorParserField).tree;
		return isInsideLiteralCode(tree, (from, to) => state.sliceDoc(from, to), doc.indexOf(needle));
	}

	test("inside inline code", () => {
		expect(inCode("`~={red}hi=~`", "hi")).toBe(true);
	});

	test("inside a fenced block", () => {
		expect(inCode("```\n~={red}hello=~\n```\n", "hello")).toBe(true);
	});

	test("outside any code", () => {
		expect(inCode("~={red}hello=~", "hello")).toBe(false);
	});

	test("behind an unbalanced backtick is not code (#41)", () => {
		expect(inCode("` stray ~={red}hello=~", "hello")).toBe(false);
	});
});
