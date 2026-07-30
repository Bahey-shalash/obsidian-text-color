import { EditorState, EditorSelection, ChangeSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Editor } from "obsidian";
import { textColorParserField } from "src/editor/TextColorStateField";
import { removeColor, removeColorAt } from "src/editor/TextColorFunctions";

/**
 * `removeColor` only ever reads `state` and dispatches changes, so a state
 * plus a recorder stands in for the whole view.
 */
function viewOf(doc: string, ranges: [number, number][]) {
	const state = EditorState.create({
		doc,
		selection: ranges.length > 0
			? EditorSelection.create(ranges.map(([anchor, head]) => EditorSelection.range(anchor, head)))
			: undefined,
		// obsidian enables multi cursor; without this codemirror keeps only the main range
		extensions: [textColorParserField, EditorState.allowMultipleSelections.of(true)],
	});

	let result = doc;
	const view = {
		state,
		dispatch(spec: { changes?: ChangeSpec }) {
			result = state.update({ changes: spec.changes }).state.doc.toString();
		},
	};

	return { view: view as unknown as EditorView, text: () => result };
}

const editor = {} as Editor; // removeColor never touches the obsidian editor

describe("removeColor", () => {
	test("strips the markers around the cursor", () => {
		const doc = "a ~={#ff8800}body=~ b";
		const { view, text } = viewOf(doc, [[doc.indexOf("body"), doc.indexOf("body")]]);
		removeColor(editor, view);
		expect(text()).toBe("a body b");
	});

	test("does nothing when the cursor is outside any color", () => {
		const doc = "a ~={#ff8800}body=~ b";
		const { view, text } = viewOf(doc, [[0, 0]]);
		removeColor(editor, view);
		expect(text()).toBe(doc);
	});

	test("strips every color a selection touches", () => {
		const doc = "~={#ff8800}one=~ mid ~={#00ff00}two=~";
		const { view, text } = viewOf(doc, [[0, doc.length]]);
		removeColor(editor, view);
		expect(text()).toBe("one mid two");
	});

	test("an unclosed color loses only the opening marker", () => {
		const doc = "a ~={#ff8800}body";
		const { view, text } = viewOf(doc, [[doc.length, doc.length]]);
		removeColor(editor, view);
		expect(text()).toBe("a body");
	});

	/**
	 * `insertColor` serves every cursor; `removeColor` used to read only the
	 * main one, so undoing a multi cursor coloring took several attempts.
	 */
	test("serves every cursor, not just the main one", () => {
		const doc = "~={#ff8800}one=~ mid ~={#00ff00}two=~";
		const { view, text } = viewOf(doc, [
			[doc.indexOf("one"), doc.indexOf("one")],
			[doc.indexOf("two"), doc.indexOf("two")],
		]);
		removeColor(editor, view);
		expect(text()).toBe("one mid two");
	});
});

/**
 * Markup inside a closed code span is a code sample. Live preview renders it
 * literally and the auto hexifier refuses to rewrite it, so the one command
 * that edits markup away must refuse too — otherwise documenting the syntax in
 * a note is enough to have it silently rewritten.
 */
describe("literal code is never edited", () => {
	const doc = "text `~={#ff0000}sample=~` more";

	test("a selection across a code span leaves it alone", () => {
		const { view, text } = viewOf(doc, [[0, doc.length]]);
		removeColor(editor, view);
		expect(text()).toBe(doc);
	});

	test("a cursor inside a code span leaves it alone", () => {
		const at = doc.indexOf("sample");
		const { view, text } = viewOf(doc, [[at, at]]);
		removeColor(editor, view);
		expect(text()).toBe(doc);
	});

	test("an unbalanced backtick is plain text, so its markup is still removed", () => {
		const stray = "text `~={#ff0000}sample=~ more";
		const at = stray.indexOf("sample");
		const { view, text } = viewOf(stray, [[at, at]]);
		removeColor(editor, view);
		expect(text()).toBe("text `sample more");
	});

	test("real markup outside the code span is still removed", () => {
		const mixed = "`~={#ff0000}a=~` ~={#00ff00}b=~";
		const { view, text } = viewOf(mixed, [[0, mixed.length]]);
		removeColor(editor, view);
		expect(text()).toBe("`~={#ff0000}a=~` b");
	});
});

describe("removeColorAt", () => {
	test("strips the expression at a position", () => {
		const doc = "a ~={#ff8800}body=~ b";
		const { view, text } = viewOf(doc, []);
		removeColorAt(view, doc.indexOf("body"));
		expect(text()).toBe("a body b");
	});

	/**
	 * The swatch menu's Remove used to carry the expression's end position
	 * from when the decoration was built. Adding the closing marker afterwards
	 * left that stale, and the `=~` survived the removal. The position is now
	 * resolved from the current state, so there is nothing to go stale.
	 */
	test("finds the closing marker even if it was added after the swatch appeared", () => {
		const doc = "~={#ff0000}hello=~";
		const { view, text } = viewOf(doc, []);
		removeColorAt(view, doc.indexOf("hello"));
		expect(text()).toBe("hello");
	});

	test("does nothing outside any expression", () => {
		const doc = "plain text";
		const { view, text } = viewOf(doc, []);
		removeColorAt(view, 3);
		expect(text()).toBe(doc);
	});
});

/**
 * A math block wears its color as latex, not as markup, so that is what has to
 * come off it. See `syntax/mathColor.ts` for why it is latex in the first
 * place.
 */
describe("removeColor on a math block", () => {
	test("takes the color command and its line away", () => {
		const doc = "$$\n\\color{#a882ff}\nA^{T}A\n$$";
		const { view, text } = viewOf(doc, [[0, doc.length]]);
		removeColor(editor, view);
		expect(text()).toBe("$$\nA^{T}A\n$$");
	});

	test("takes an inline color command away without eating the latex", () => {
		const doc = "$$ \\color{#a882ff} A^{T}A\n= B $$";
		const { view, text } = viewOf(doc, [[0, doc.length]]);
		removeColor(editor, view);
		expect(text()).toBe("$$ A^{T}A\n= B $$");
	});

	test("a cursor inside the block is enough", () => {
		const doc = "$$\n\\color{#a882ff}\nA^{T}A\n$$";
		const at = doc.indexOf("A^{T}A");
		const { view, text } = viewOf(doc, [[at, at]]);
		removeColor(editor, view);
		expect(text()).toBe("$$\nA^{T}A\n$$");
	});

	test("a color command sitting inside the latex comes off too", () => {
		const doc = "$$\nA = \\color{#a882ff} B\n$$";
		const { view, text } = viewOf(doc, [[0, doc.length]]);
		removeColor(editor, view);
		expect(text()).toBe("$$\nA = B\n$$");
	});

	test("an uncolored block is left exactly as it was", () => {
		const doc = "$$\nA^{T}A\n$$";
		const { view, text } = viewOf(doc, [[0, doc.length]]);
		removeColor(editor, view);
		expect(text()).toBe(doc);
	});
});
