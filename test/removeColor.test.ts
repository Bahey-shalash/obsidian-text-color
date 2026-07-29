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
