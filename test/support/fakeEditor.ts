import type { Editor, EditorPosition, EditorSelection, EditorSelectionOrCaret } from "obsidian";

/**
 * A document with cursors, implementing the slice of obsidian's Editor that
 * the coloring commands actually use. Enough to test multi cursor behavior
 * without a running obsidian.
 */
export class FakeEditor {
	private selections: EditorSelection[] = [];

	constructor(private doc: string) { }

	// -- test helpers ------------------------------------------------------

	static withCursorsAt(doc: string, offsets: number[]): FakeEditor {
		const editor = new FakeEditor(doc);
		editor.selections = offsets.map(offset => {
			const pos = editor.offsetToPos(offset);
			return { anchor: pos, head: pos };
		});
		return editor;
	}

	static withSelections(doc: string, ranges: [number, number][]): FakeEditor {
		const editor = new FakeEditor(doc);
		editor.selections = ranges.map(([from, to]) => ({
			anchor: editor.offsetToPos(from),
			head: editor.offsetToPos(to),
		}));
		return editor;
	}

	get text(): string { return this.doc; }

	get cursorOffsets(): number[] {
		return this.selections.map(selection => this.posToOffset(selection.head));
	}

	asEditor(): Editor { return this as unknown as Editor; }

	// -- the Editor surface under test -------------------------------------

	listSelections(): EditorSelection[] { return this.selections; }

	setSelections(ranges: EditorSelectionOrCaret[]): void {
		this.selections = ranges.map(range => ({
			anchor: range.anchor,
			head: range.head ?? range.anchor,
		}));
	}

	somethingSelected(): boolean {
		return this.selections.some(s => this.posToOffset(s.anchor) != this.posToOffset(s.head));
	}

	getRange(from: EditorPosition, to: EditorPosition): string {
		return this.doc.slice(this.posToOffset(from), this.posToOffset(to));
	}

	replaceRange(replacement: string, from: EditorPosition, to?: EditorPosition): void {
		const start = this.posToOffset(from);
		const end = to == undefined ? start : this.posToOffset(to);
		this.doc = this.doc.slice(0, start) + replacement + this.doc.slice(end);
	}

	setCursor(pos: EditorPosition): void {
		this.selections = [{ anchor: pos, head: pos }];
	}

	posToOffset(pos: EditorPosition): number {
		const lines = this.doc.split("\n");
		let offset = 0;
		for (let line = 0; line < pos.line; line++) {
			offset += lines[line].length + 1;
		}
		return offset + pos.ch;
	}

	offsetToPos(offset: number): EditorPosition {
		const before = this.doc.slice(0, offset).split("\n");
		return { line: before.length - 1, ch: before[before.length - 1].length };
	}
}
