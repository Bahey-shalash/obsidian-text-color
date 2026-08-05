import { Editor, EditorPosition, EditorRangeOrCaret, Notice } from "obsidian";
import { EditorView } from "@codemirror/view";
import { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import { textColorParserField } from "src/editor/TextColorStateField";
import { enclosingExpression } from "src/editor/treeQueries";
import {
	CLOSE_MARKER,
	ProtectedBlock,
	blockAt,
	isMathColorLine,
	mathColorIn,
	openMarkerFor,
	openingLineWithColor,
	overlapsProtectedBlock,
	protectedBlocks,
	shouldDescendInto,
} from "src/syntax";

interface Edit {
	from: number;
	to: number;
	insert: string;
}

/**
 * Wrap every selection in ~={hex}...=~ markup, one fence pair per non empty
 * selected line. An empty selection gets an empty pair with the caret inside.
 *
 * Every cursor is served, not just the main one, and all of them in a single
 * transaction: coloring is one action to the user, so it has to be one step to
 * undo, not one step per cursor. Every change is expressed against the
 * untouched document, which is what keeps them independent of each other.
 *
 * Code and display math blocks are routed around rather than written into;
 * see `syntax/blocks.ts` for why neither survives a marker. A line inside one
 * is left exactly as it was, so a selection that runs across a block still
 * colors the prose on either side of it.
 */
export function insertColor(hex: string, editor: Editor): void {
	const open = openMarkerFor(hex);
	const text = editor.getValue();
	const blocks = protectedBlocks(text);

	// every selection keeps an edit, even one that turns out to be a no-op:
	// the transaction replaces the whole selection, so a cursor missing from
	// the list below is a cursor deleted.
	const edits: Edit[] = editor.listSelections()
		.map(selection => {
			const a = editor.posToOffset(selection.anchor);
			const b = editor.posToOffset(selection.head);
			return { from: Math.min(a, b), to: Math.max(a, b) };
		})
		.sort((x, y) => x.from - y.from)
		.map(({ from, to }) => ({
			from,
			to,
			insert: from == to
				? (overlapsProtectedBlock(blocks, from, to) ? "" : open + CLOSE_MARKER)
				: colorLines(text.slice(from, to), hex, open, from, blocks),
		}));

	const writes = (edit: Edit) => edit.insert != text.slice(edit.from, edit.to);

	if (!edits.some(writes)) {
		// silent when the selection simply already reads this way; a block is
		// the only reason worth explaining, because the click looked ignored.
		if (edits.some(edit => overlapsProtectedBlock(blocks, edit.from, edit.to))) {
			new Notice("Nothing to color: code blocks keep their own highlighting, and a math block takes its color in LaTeX.");
		}
		return;
	}

	editor.transaction({
		changes: edits.filter(writes).map(edit => ({
			from: editor.offsetToPos(edit.from),
			to: editor.offsetToPos(edit.to),
			text: edit.insert,
		})),
		// positions in the document the transaction produces, which is not the
		// one the editor can be asked about yet.
		selections: selectionsAfterInsert(applyEdits(text, edits), edits, open.length),
	});
}

/** The document these edits produce. */
function applyEdits(text: string, edits: Edit[]): string {
	let colored = "";
	let taken = 0;

	for (const edit of edits) {
		colored += text.slice(taken, edit.from) + edit.insert;
		taken = edit.to;
	}

	return colored + text.slice(taken);
}

/** Line and column of an offset in the given text. */
function positionAt(text: string, offset: number): EditorPosition {
	const before = text.slice(0, offset).split("\n");
	return { line: before.length - 1, ch: before[before.length - 1].length };
}

/**
 * The replacement for a selection: one fence pair per non empty line, so a
 * color never spans a line break.
 *
 * A line a block owns is not fenced. A code block keeps its own rendering and
 * is passed through untouched; a math block is colored in latex instead, which
 * is the only way to color one that both modes agree on; see
 * `syntax/mathColor.ts`.
 *
 * `start` is where `text` sits in the document, which is what lets each line be
 * placed against the blocks.
 */
function colorLines(text: string, hex: string, open: string, start: number, blocks: ProtectedBlock[]): string {
	const lines = text.split("\n");
	const offsets = lineOffsets(lines, start);
	// only a math block whose opening line the selection actually reaches can be
	// colored: the command goes right behind that `$$`, and there is nowhere to
	// put it otherwise.
	const lineStarts = new Set(offsets);

	const out: string[] = [];

	lines.forEach((line, i) => {
		const from = offsets[i];
		const block = blockAt(blocks, from, from + line.length);

		if (block == undefined) {
			out.push(line ? open + line + CLOSE_MARKER : line);
			return;
		}
		if (block.kind == "code" || !lineStarts.has(block.from)) {
			out.push(line); // not ours to touch, or no `$$` of its own in reach
			return;
		}
		if (from == block.from) {
			out.push(...openingLineWithColor(line, hex));
			return;
		}
		// the color this block already carried is replaced, never stacked.
		if (!isMathColorLine(line)) {
			out.push(line);
		}
	});

	return out.join("\n");
}

/** Where each of these lines starts, given where the first one does. */
function lineOffsets(lines: string[], start: number): number[] {
	const offsets: number[] = [];
	let pos = start;

	for (const line of lines) {
		offsets.push(pos);
		pos += line.length + 1; // the newline the split consumed
	}

	return offsets;
}

/**
 * Where every cursor goes in the colored document: an empty one lands just
 * behind the opening marker of the pair inserted for it, a selection keeps the
 * text it selected, markup included. Offsets accumulate the length change of
 * every edit before them, so this holds for any number of cursors.
 *
 * Every cursor is returned, not only the empty ones: the transaction replaces
 * the whole selection, so a cursor left out of this list is a cursor deleted.
 */
function selectionsAfterInsert(colored: string, edits: Edit[], openLength: number): EditorRangeOrCaret[] {
	const selections: EditorRangeOrCaret[] = [];
	let shift = 0;

	for (const edit of edits) {
		const start = edit.from + shift;

		if (edit.from == edit.to) {
			// a cursor that was served sits inside its new pair; one a protected
			// block sent away has nothing to sit inside and stays put.
			selections.push({ from: positionAt(colored, edit.insert == "" ? start : start + openLength) });
		} else {
			selections.push({
				from: positionAt(colored, start),
				to: positionAt(colored, start + edit.insert.length),
			});
		}

		shift += edit.insert.length - (edit.to - edit.from);
	}

	return selections;
}

/**
 * Remove the coloring around every cursor, or all colorings inside every
 * selection. The text itself stays.
 */
export function removeColor(editor: Editor, view: EditorView): void {
	const { tree, blocks } = view.state.field(textColorParserField);
	const sliceDoc = (from: number, to: number) => view.state.sliceDoc(from, to);
	const changes: Edit[] = [];

	for (const range of view.state.selection.ranges) {
		// a math block wears its color as latex rather than as markup, so that
		// is what has to come off it.
		changes.push(...mathColorRemovals(view, blocks, range.from, range.to));

		if (range.empty) {
			// no selection: strip the expression the cursor is inside.
			const expression = enclosingExpression(view.state, range.head);
			if (expression) {
				changes.push(...markerRemovals(expression));
			}
			continue;
		}

		// selection: strip every expression it touches.
		tree.iterate({
			from: range.from,
			to: range.to,
			enter(ref: SyntaxNodeRef) {
				// markup inside literal code is a code sample; the renderers
				// leave it alone, so this must not edit it away either.
				if (ref.type.name == "CodeSection") {
					return shouldDescendInto(ref, sliceDoc);
				}
				if (ref.type.name == "Expression") {
					changes.push(...markerRemovals(ref.node));
				}
				return true;
			},
		});
	}

	if (changes.length > 0) {
		view.dispatch({ changes: dedupe(changes) });
	}
}

/**
 * The changes that take the latex color back off every math block this range
 * touches: the whole line when the command has one to itself, otherwise just
 * the command and the space in front of it that put it there.
 */
function mathColorRemovals(view: EditorView, blocks: ProtectedBlock[], from: number, to: number): Edit[] {
	const changes: Edit[] = [];

	for (const block of blocks) {
		if (block.kind != "math" || from > block.to || to < block.from) {
			continue;
		}

		const last = view.state.doc.lineAt(block.to).number;
		for (let n = view.state.doc.lineAt(block.from).number; n <= last; n++) {
			const line = view.state.doc.line(n);
			const found = mathColorIn(line.text);
			if (found == null) {
				continue;
			}
			// a line the command had to itself goes with it, break included, so
			// no blank one is left behind; one shared with latex keeps the latex.
			changes.push(isMathColorLine(line.text)
				? { from: line.from, to: Math.min(line.to + 1, block.to), insert: '' }
				: { from: line.from + found.index, to: line.from + found.index + found.length, insert: '' });
			break;
		}
	}

	return changes;
}

/** Strip the coloring of the expression at a document position. */
export function removeColorAt(view: EditorView, pos: number): void {
	const expression = enclosingExpression(view.state, pos);
	if (expression == null) {
		return;
	}
	view.dispatch({ changes: markerRemovals(expression) });
}

/** The changes that delete an expression's ~={...} and =~ markers. */
export function markerRemovals(node: SyntaxNode): Edit[] {
	const left = node.getChild("TcLeft");
	const right = node.getChild("TcRight")?.getChild("REnd")?.getChild("RMarker");

	const changes: Edit[] = [];
	if (left) {
		changes.push({ from: left.from, to: left.to, insert: '' });
	}
	if (right) {
		changes.push({ from: right.from, to: right.to, insert: '' });
	}
	return changes;
}

/** Overlapping cursors can name the same expression twice; delete it once. */
function dedupe(changes: Edit[]): Edit[] {
	const seen = new Set<string>();
	return changes.filter(change => {
		const key = `${change.from}:${change.to}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

/**
 * Move the cursor behind the closing marker of the colored section it is in.
 * Bound to Tab so the color can be "left" without arrow keys.
 */
export function jumpOutOfColor(view: EditorView, editor: Editor): boolean {
	const tree = view.state.field(textColorParserField).tree;

	let node = tree.resolve(view.state.selection.main.head);
	if (node.type.name == "Text" && node.parent != null) {
		node = node.parent;
	}

	if (node.type.name != "TcRight") {
		return false;
	}

	editor.setCursor(editor.offsetToPos(node.to));
	return true;
}
