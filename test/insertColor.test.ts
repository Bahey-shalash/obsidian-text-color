import { insertColor } from "src/editor/TextColorFunctions";
import { FakeEditor } from "./support/fakeEditor";

const HEX = "#ff8800";
const OPEN = `~={${HEX}}`;

describe("insertColor with one selection", () => {
	test("wraps the selected text", () => {
		const editor = FakeEditor.withSelections("hello world", [[6, 11]]);
		insertColor(HEX, editor.asEditor());
		expect(editor.text).toBe(`hello ${OPEN}world=~`);
	});

	test("wraps each non empty line separately", () => {
		const editor = FakeEditor.withSelections("one\n\ntwo", [[0, 8]]);
		insertColor(HEX, editor.asEditor());
		expect(editor.text).toBe(`${OPEN}one=~\n\n${OPEN}two=~`);
	});

	test("a backwards selection wraps the same text", () => {
		const editor = FakeEditor.withSelections("hello world", [[11, 6]]);
		insertColor(HEX, editor.asEditor());
		expect(editor.text).toBe(`hello ${OPEN}world=~`);
	});
});

describe("insertColor without a selection", () => {
	test("inserts an empty pair and puts the caret inside it", () => {
		const editor = FakeEditor.withCursorsAt("ab", [1]);
		insertColor(HEX, editor.asEditor());
		expect(editor.text).toBe(`a${OPEN}=~b`);
		expect(editor.cursorOffsets).toEqual([1 + OPEN.length]);
	});
});

/**
 * Multi cursor: every cursor gets served, and every caret ends up inside its
 * own pair. Insertions are applied last to first so an earlier one can never
 * shift the offsets of an edit still to come (upstream bug), and the caret
 * offsets account for the growth of every pair before them.
 */
describe("insertColor with several cursors", () => {
	test("wraps every selection, not just the main one", () => {
		const editor = FakeEditor.withSelections("aaa bbb ccc", [[0, 3], [4, 7], [8, 11]]);
		insertColor(HEX, editor.asEditor());
		expect(editor.text).toBe(`${OPEN}aaa=~ ${OPEN}bbb=~ ${OPEN}ccc=~`);
	});

	test("selections given out of order are still handled correctly", () => {
		const editor = FakeEditor.withSelections("aaa bbb", [[4, 7], [0, 3]]);
		insertColor(HEX, editor.asEditor());
		expect(editor.text).toBe(`${OPEN}aaa=~ ${OPEN}bbb=~`);
	});

	test("every empty cursor gets its own pair, with a caret inside", () => {
		const editor = FakeEditor.withCursorsAt("a.b.c", [1, 3]);
		insertColor(HEX, editor.asEditor());
		expect(editor.text).toBe(`a${OPEN}=~.b${OPEN}=~.c`);

		const pairLength = OPEN.length + "=~".length;
		expect(editor.cursorOffsets).toEqual([
			1 + OPEN.length,
			3 + pairLength + OPEN.length,
		]);
	});

	test("mixed empty and non empty cursors", () => {
		const editor = FakeEditor.withSelections("aaa bbb", [[0, 3], [7, 7]]);
		insertColor(HEX, editor.asEditor());
		expect(editor.text).toBe(`${OPEN}aaa=~ bbb${OPEN}=~`);
	});

	test("multi line selections at several cursors", () => {
		const editor = FakeEditor.withSelections("one\ntwo\nthree", [[0, 3], [8, 13]]);
		insertColor(HEX, editor.asEditor());
		expect(editor.text).toBe(`${OPEN}one=~\ntwo\n${OPEN}three=~`);
	});
});
