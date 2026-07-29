import { SyntaxNode, SyntaxNodeRef, Tree } from "@lezer/common";

/**
 * Where coloring must keep its hands off: literal code.
 *
 * One rule, three consumers. The live preview decorator, the auto-hexifier
 * (which writes to the user's file) and the reading mode renderer all ask
 * this module instead of each carrying their own idea of what code is —
 * that divergence is how markup inside a code fence used to get rewritten.
 */

/** Read a slice of the document the tree was parsed from. */
export type SliceDoc = (from: number, to: number) => string;

/**
 * A code section that ends with its closing backtick is a real inline code
 * span: obsidian renders it as literal code and coloring must stay out. An
 * unbalanced backtick is rendered as plain text by obsidian, so expressions
 * behind it must still be colored (upstream #41).
 */
export function isClosedCodeSection(text: string): boolean {
	return text.length > 1 && text.endsWith("`");
}

/** Is this `CodeSection` node literal code rather than a stray backtick? */
export function isLiteralCodeSection(node: SyntaxNodeRef, sliceDoc: SliceDoc): boolean {
	return isClosedCodeSection(sliceDoc(node.from, node.to));
}

/**
 * Should a tree walk descend into this node? False only for code sections
 * that render as literal code. Pass this straight out of an `enter` callback.
 */
export function shouldDescendInto(node: SyntaxNodeRef, sliceDoc: SliceDoc): boolean {
	return node.type.name != "CodeSection" || !isLiteralCodeSection(node, sliceDoc);
}

/** Is this position inside a code section that renders as literal code? */
export function isInsideLiteralCode(tree: Tree, sliceDoc: SliceDoc, pos: number): boolean {
	return isLiteralCodeNode(tree.resolveInner(pos, 0), sliceDoc);
}

/**
 * Is this node inside a code section that renders as literal code? The node
 * form, for callers that already hold one — a position would have to be picked
 * out of it, and the boundaries are exactly where that gets ambiguous.
 */
export function isLiteralCodeNode(node: SyntaxNode | null, sliceDoc: SliceDoc): boolean {
	for (let n = node; n != null; n = n.parent) {
		if (n.type.name == "CodeSection" && isLiteralCodeSection(n, sliceDoc)) {
			return true;
		}
	}
	return false;
}

/**
 * The reading mode counterpart: obsidian renders code as `<code>` (wrapped in
 * `<pre>` for fenced blocks), and neither may be colored.
 */
export function isCodeElement(node: Node): boolean {
	return node.nodeName == "CODE" || node.nodeName == "PRE";
}
