import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet } from "@codemirror/view";
import { textColorParserField } from "src/editor/TextColorStateField";
import { decorateExpression } from "src/editor/ExpressionDecorations";
import { shouldDescendInto } from "src/syntax";

/**
 * The decoration set for the given ranges of a document: what live preview
 * puts on screen.
 *
 * Separate from the view plugin so the conformance test can render a document
 * exactly the way the editor does, rather than through a copy of this walk
 * that could quietly drift away from it.
 */
export function buildTextColorDecorations(
	state: EditorState,
	ranges: readonly { from: number, to: number }[],
): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const sliceDoc = (from: number, to: number) => state.sliceDoc(from, to);

	// an expression that reaches across the gap between two visible ranges is
	// entered once per range. Decorating it twice would hand the builder a
	// range that starts before the last one it took, which throws.
	const decorated = new Set<number>();

	const decorate = (node: Parameters<typeof decorateExpression>[0]) => {
		if (decorated.has(node.from)) {
			return;
		}
		decorated.add(node.from);

		try {
			decorateExpression(node, builder, state);
		} catch (e) {
			// a malformed tree during heavy edits must never take down the
			// whole decoration pass.
			console.error(`colors: could not decorate expression at ${node.from}:`, e);
		}
	};

	for (const { from, to } of ranges) {
		state.field(textColorParserField).tree.iterate({
			from,
			to,
			enter(node) {
				switch (node.type.name) {
					case "TextColor":
						return true; // top node, go deeper

					case "CodeSection":
						// literal code is never coloring markup; an unbalanced
						// backtick is plain text in obsidian, so expressions
						// inside it still count (#41).
						return shouldDescendInto(node, sliceDoc);

					case "Unfinished":
						// only the `~={token}=~` shape is finished markup; a
						// token still being typed has no TcLeft yet.
						if (node.node.getChild("TcLeft") == null) {
							return false;
						}
						decorate(node);
						return false;

					case "Expression":
						decorate(node);
						return false;

					default:
						return false;
				}
			},
		});
	}

	return builder.finish();
}
