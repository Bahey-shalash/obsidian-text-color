import { Editor, EditorChange, EditorPosition, EditorRangeOrCaret } from "obsidian";
import { EditorView } from "@codemirror/view";
import { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import { textColorParserField } from "src/editor/TextColorStateField";
import { enclosingExpression } from "src/editor/treeQueries";
import { CLOSE_MARKER, openMarkerFor, shouldDescendInto } from "src/syntax";

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
 */
export function insertColor(hex: string, editor: Editor): void {
	const open = openMarkerFor(hex);

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
				? open + CLOSE_MARKER
				: fenceLines(editor.getRange(editor.offsetToPos(from), editor.offsetToPos(to)), open),
		}));

	if (edits.length == 0) {
		return;
	}

	const changes: EditorChange[] = edits.map(edit => ({
		from: editor.offsetToPos(edit.from),
		to: editor.offsetToPos(edit.to),
		text: edit.insert,
	}));

	editor.transaction({
		changes,
		// positions in the document the transaction produces, which is not the
		// one the editor can be asked about yet.
		selections: selectionsAfterInsert(applyEdits(editor.getValue(), edits), edits, open.length),
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

/** One fence pair per non empty line, so a color never spans a line break. */
function fenceLines(text: string, open: string): string {
	return text.split("\n")
		.map(line => (line ? open + line + CLOSE_MARKER : line))
		.join("\n");
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
			selections.push({ from: positionAt(colored, start + openLength) });
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
	const tree = view.state.field(textColorParserField).tree;
	const sliceDoc = (from: number, to: number) => view.state.sliceDoc(from, to);
	const changes: Edit[] = [];

	for (const range of view.state.selection.ranges) {
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
