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

	/**
	 * `setSelections` replaces the whole selection, so every cursor has to be
	 * in the list it is given: a selection left out of it is a selection the
	 * user loses the moment a caret elsewhere puts the call in motion.
	 */
	test("a selection survives a caret being served alongside it", () => {
		const editor = FakeEditor.withSelections("aaa bbb", [[0, 3], [7, 7]]);
		insertColor(HEX, editor.asEditor());

		const pair = OPEN.length + "=~".length;
		expect(editor.selectionOffsets).toEqual([
			[0, OPEN.length + 3 + "=~".length],   // the wrapped selection, kept
			[7 + pair + OPEN.length, 7 + pair + OPEN.length],
		]);
	});

	test("multi line selections at several cursors", () => {
		const editor = FakeEditor.withSelections("one\ntwo\nthree", [[0, 3], [8, 13]]);
		insertColor(HEX, editor.asEditor());
		expect(editor.text).toBe(`${OPEN}one=~\ntwo\n${OPEN}three=~`);
	});
});

/**
 * Coloring is one action to the user. Applying it as one edit per cursor made
 * it one undo per cursor, and left the document in a half coloured state in
 * between; it goes in as a single transaction instead.
 */
describe("insertColor as one step", () => {
	test("several cursors are coloured in a single transaction", () => {
		const editor = FakeEditor.withSelections("aaa bbb ccc", [[0, 3], [4, 7], [8, 11]]);
		insertColor(HEX, editor.asEditor());

		expect(editor.text).toBe(`${OPEN}aaa=~ ${OPEN}bbb=~ ${OPEN}ccc=~`);
		expect(editor.transactionCount).toBe(1);
	});

	test("carets land on the right line when cursors sit on different lines", () => {
		const editor = FakeEditor.withCursorsAt("one\ntwo", [0, 4]);
		insertColor(HEX, editor.asEditor());

		expect(editor.text).toBe(`${OPEN}=~one\n${OPEN}=~two`);
		expect(editor.listSelections().map(selection => selection.head)).toEqual([
			{ line: 0, ch: OPEN.length },
			{ line: 1, ch: OPEN.length },
		]);
	});
});

/**
 * Blocks that render themselves.
 *
 * A code fence belongs to obsidian's highlighter and is passed straight
 * through. A math block cannot take the markup at all — a marker in front of
 * its `$$` and reading mode stops seeing math — so it is colored in latex,
 * which both renderers hand to the same engine.
 */
describe("insertColor around blocks", () => {
	function colored(doc: string, hex = HEX): string {
		const editor = FakeEditor.withSelections(doc, [[0, doc.length]]);
		insertColor(hex, editor.asEditor());
		return editor.text;
	}

	test("a math block is colored in latex, not in markup", () => {
		expect(colored("$$\nA^{T}A\n$$")).toBe(`$$\n\\color{${HEX}}\nA^{T}A\n$$`);
	});

	test("a $$ sharing its line takes the command inline, ahead of the latex", () => {
		expect(colored("$$ A^{T}A\n= B $$")).toBe(`$$ \\color{${HEX}} A^{T}A\n= B $$`);
	});

	test("recoloring replaces the command instead of stacking another", () => {
		const once = colored("$$\nA^{T}A\n$$");
		expect(colored(once, "#44cf6e")).toBe("$$\n\\color{#44cf6e}\nA^{T}A\n$$");
	});

	test("a fenced code block is passed through untouched", () => {
		expect(colored("```c\nint x = 1;\n```")).toBe("```c\nint x = 1;\n```");
	});

	test("prose on either side is still colored", () => {
		expect(colored("before\n```c\nint x;\n```\nafter"))
			.toBe(`${OPEN}before=~\n\`\`\`c\nint x;\n\`\`\`\n${OPEN}after=~`);
	});

	test("a cursor inside a block writes nothing and stays where it is", () => {
		const doc = "```c\nint x;\n```";
		const at = doc.indexOf("int");
		const editor = FakeEditor.withCursorsAt(doc, [at]);
		insertColor(HEX, editor.asEditor());
		expect(editor.text).toBe(doc);
		expect(editor.cursorOffsets).toEqual([at]);
	});

	test("inline math and inline code still take ordinary markup", () => {
		expect(colored("a $x^2$ and `code`")).toBe(`${OPEN}a $x^2$ and \`code\`=~`);
	});
});
