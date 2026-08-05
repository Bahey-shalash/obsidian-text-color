import { StateField, Text } from '@codemirror/state';
import { type ChangedRange, type Tree, TreeFragment } from '@lezer/common';
import { DocInput } from "@codemirror/language";
import { ProtectedBlock, protectedBlocks, textColorLanguage } from 'src/syntax';

interface ParsedDocument {
	tree: Tree;
	fragment: readonly TreeFragment[];
	/**
	 * The code and math blocks of the document. Kept beside the tree because
	 * they change only when the document does, while the decorations that read
	 * them are rebuilt on every cursor move.
	 */
	readonly blocks: ProtectedBlock[];
}

/**
 * Parses the document with the coloring grammar and keeps the tree current,
 * so the view plugin, the auto hexifier and the editor commands all read one
 * parse rather than each doing their own.
 */
export const textColorParserField: StateField<ParsedDocument> = StateField.define({
	create(state) {
		const parsedTree = textColorLanguage.parser.parse(state.doc.toString());
		return parsed(parsedTree, TreeFragment.addTree(parsedTree), state.doc);
	},

	update(value, transaction) {
		// most of this is taken from https://github.com/Fevol/obsidian-criticmarkup/blob/main/src/editor/base/edit-util/range-parser.ts
		if (!transaction.docChanged) {
			return value;
		}

		// update the changed tree for anything that has changed in the tree.
		const changed_ranges: ChangedRange[] = [];
		transaction.changes.iterChangedRanges((from, to, fromB, toB) =>
			changed_ranges.push({ fromA: from, toA: to, fromB: fromB, toB: toB })
		);

		let fragments = TreeFragment.applyChanges(value.fragment, changed_ranges);
		const tree = textColorLanguage.parser.parse(new DocInput(transaction.state.doc), fragments);
		fragments = TreeFragment.addTree(tree, fragments);

		return parsed(tree, fragments, transaction.state.doc);
	},
});

/**
 * One parse of the document, with its blocks found on first ask and kept.
 *
 * The block scan needs the document flat, and this field is rebuilt on every
 * keystroke: the incremental parse above is handed a `DocInput` precisely so
 * it never has to flatten anything, and scanning eagerly here would undo that
 * for every document, colored or not. Nothing asks for the blocks until a
 * colored expression is decorated or a coloring command runs, so a note with no
 * markup in it never pays.
 */
function parsed(tree: Tree, fragment: readonly TreeFragment[], doc: Text): ParsedDocument {
	let blocks: ProtectedBlock[] | null = null;

	return {
		tree,
		fragment,
		get blocks(): ProtectedBlock[] {
			return blocks ??= protectedBlocks(doc.toString());
		},
	};
}
