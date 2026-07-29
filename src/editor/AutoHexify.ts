import { EditorState } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { textColorParserField } from "src/editor/TextColorStateField";
import { settingsFacet } from "src/editor/SettingsFacet";
import { isLiteralColor } from "src/color/InlineColor";
import { makeNameResolver } from "src/color/resolveToken";
import { shouldDescendInto } from "src/syntax";

export interface NameConversion {
	from: number;
	to: number;
	insert: string;
}

/**
 * Find palette names typed as color tokens inside the given ranges and return
 * the changes that replace them with their hex. Only complete tokens count: a
 * token still being typed (no closing brace yet) is left alone, and so are
 * hex literals and unknown names.
 *
 * Literal code is never touched. This is the one consumer of the syntax that
 * writes to the user's file, so it uses the same rule the live preview uses
 * to decide what is code — markup inside a code fence is a code sample, not
 * markup, and silently rewriting it is the worst thing this plugin could do.
 */
export function findNameConversions(
	state: EditorState,
	ranges: { from: number, to: number }[],
	resolve: (id: string) => string | null,
): NameConversion[] {
	const field = state.field(textColorParserField, false);
	if (!field) {
		return [];
	}

	const sliceDoc = (from: number, to: number) => state.sliceDoc(from, to);
	const conversions: NameConversion[] = [];
	const seen = new Set<number>();
	const PAD = 64;

	for (const range of ranges) {
		field.tree.iterate({
			from: Math.max(0, range.from - PAD),
			to: Math.min(state.doc.length, range.to + PAD),
			enter(node) {
				if (node.type.name == "CodeSection") {
					return shouldDescendInto(node, sliceDoc);
				}
				if (node.type.name != "Color" || seen.has(node.from)) {
					return true;
				}

				// only a completed token: Color inside a Description that has
				// its closing brace. While typing, the token sits in an
				// Unfinished node without the InnerMarker.
				const description = node.node.parent;
				if (!description || description.type.name != "Description" || !description.getChild("InnerMarker")) {
					return true;
				}

				const token = state.sliceDoc(node.from, node.to);
				if (isLiteralColor(token)) {
					return true;
				}

				const hex = resolve(token);
				if (hex == null) {
					return true;
				}

				seen.add(node.from);
				conversions.push({ from: node.from, to: node.to, insert: hex });
				return true;
			},
		});
	}

	return conversions;
}

/** Is this update the user undoing or redoing, rather than editing? */
function isHistoryUpdate(update: ViewUpdate): boolean {
	return update.transactions.some(tr => tr.isUserEvent("undo") || tr.isUserEvent("redo"));
}

/**
 * Editor extension: a palette name typed into the markup (~={yellow}) is
 * rewritten to its hex as soon as the token is complete, so the note stores
 * the color itself, never the keyword. Only regions touched by the current
 * edit are considered, so opening an old note changes nothing until the
 * user actually touches a token.
 */
export const autoHexify = EditorView.updateListener.of((update: ViewUpdate) => {
	if (!update.docChanged || update.view.composing) {
		return;
	}

	// an undo restores the name, which is a document change like any other:
	// converting it again would make the conversion impossible to undo, and
	// every further undo would land on the reconversion instead of moving
	// back through the user's own edits.
	if (isHistoryUpdate(update)) {
		return;
	}

	const ranges: { from: number, to: number }[] = [];
	update.changes.iterChangedRanges((fromA, toA, fromB, toB) => ranges.push({ from: fromB, to: toB }));

	const settings = update.state.facet(settingsFacet);
	const resolve = makeNameResolver(settings);

	const conversions = findNameConversions(update.state, ranges, resolve);
	if (conversions.length == 0) {
		return;
	}

	// dispatching inside an update cycle is not allowed; defer. The positions
	// are only valid for the document they were computed on, so bail out if
	// anything else changed the document in the meantime; the next edit will
	// pick the conversion up again.
	const expectedDoc = update.state.doc;
	queueMicrotask(() => {
		try {
			if (update.view.state.doc != expectedDoc) {
				return;
			}
			// an undo step of its own. Keeping it out of the history does not
			// fold it into the keystroke that triggered it — codemirror only
			// maps unrecorded changes forward — so undo would revert the
			// keystroke and leave the hex behind, with the name the user typed
			// unrecoverable. The `isHistoryUpdate` guard above is what stops
			// undoing this step from immediately reapplying it.
			update.view.dispatch({ changes: conversions });
		} catch (e) {
			console.error(`text-color: auto hexify failed: ${e}`);
		}
	});
});
