import { EditorState } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";
import { textColorParserField } from "src/editor/TextColorStateField";
import { isLiteralCodeNode } from "src/syntax";

/**
 * The innermost ~={token}...=~ expression containing pos, or null when pos is
 * not inside a colored expression. Pure lookup on the parse tree held by the
 * state field.
 *
 * Markup inside literal code is a code sample, not markup — live preview
 * leaves it alone and so does the auto hexifier, so it is not an expression
 * here either. Answering with it would let the editor commands rewrite the one
 * place the plugin promises never to touch.
 */
export function enclosingExpression(state: EditorState, pos: number): SyntaxNode | null {
	const field = state.field(textColorParserField, false);
	if (!field) {
		return null;
	}

	// side 0 first, then leaning left: a cursor parked at the very end of an
	// unclosed color sits on the boundary, where side 0 resolves to the node
	// above the expression rather than into it.
	const expression = expressionAround(field.tree.resolveInner(pos, 0))
		?? (pos > 0 ? expressionAround(field.tree.resolveInner(pos, -1)) : null);

	const sliceDoc = (from: number, to: number) => state.sliceDoc(from, to);
	return isLiteralCodeNode(expression, sliceDoc) ? null : expression;
}

function expressionAround(node: SyntaxNode | null): SyntaxNode | null {
	while (node != null) {
		if (node.type.name == "Expression") {
			return node;
		}
		node = node.parent;
	}
	return null;
}

/** The color token of the innermost expression containing pos. */
export function expressionColorAt(state: EditorState, pos: number): string | null {
	const expression = enclosingExpression(state, pos);
	if (expression == null) {
		return null;
	}

	const color = expression.getChild("TcLeft")?.getChild("Description")?.getChild("Color");
	return color ? state.sliceDoc(color.from, color.to) : null;
}
