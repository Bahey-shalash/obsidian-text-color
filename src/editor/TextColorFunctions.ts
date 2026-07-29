import { Editor, EditorPosition, EditorSelectionOrCaret } from "obsidian";
import { EditorView } from "@codemirror/view";
import { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import { textColorParserField } from "src/editor/TextColorStateField";
import { enclosingExpression } from "src/editor/treeQueries";
import { CLOSE_MARKER, openMarkerFor } from "src/syntax";

interface Edit {
	from: number;
	to: number;
	insert: string;
}

/**
 * Wrap every selection in ~={hex}...=~ markup, one fence pair per non empty
 * selected line. An empty selection gets an empty pair with the caret inside.
 *
 * Every cursor is served, not just the main one: the edits are computed
 * against the untouched document and then applied last to first, so earlier
 * insertions never shift the offsets of edits still to come.
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

	for (let i = edits.length - 1; i >= 0; i--) {
		const edit = edits[i];
		editor.replaceRange(edit.insert, editor.offsetToPos(edit.from), editor.offsetToPos(edit.to));
	}

	const carets = caretsInsideEmptyPairs(editor, edits, open.length);
	if (carets.length > 0) {
		editor.setSelections(carets);
	}
}

/** One fence pair per non empty line, so a color never spans a line break. */
function fenceLines(text: string, open: string): string {
	return text.split("\n")
		.map(line => (line ? open + line + CLOSE_MARKER : line))
		.join("\n");
}

/**
 * Where each caret goes once every edit has been applied: just behind the
 * opening marker of the pair that was inserted for it. Offsets accumulate the
 * length change of every edit before it, so this holds for any number of
 * cursors.
 */
function caretsInsideEmptyPairs(editor: Editor, edits: Edit[], openLength: number): EditorSelectionOrCaret[] {
	const carets: EditorSelectionOrCaret[] = [];
	let shift = 0;

	for (const edit of edits) {
		if (edit.from == edit.to) {
			const caret: EditorPosition = editor.offsetToPos(edit.from + shift + openLength);
			carets.push({ anchor: caret, head: caret });
		}
		shift += edit.insert.length - (edit.to - edit.from);
	}

	return carets;
}

/**
 * Remove the coloring around every cursor, or all colorings inside every
 * selection. The text itself stays.
 */
export function removeColor(editor: Editor, view: EditorView): void {
	const tree = view.state.field(textColorParserField).tree;
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
