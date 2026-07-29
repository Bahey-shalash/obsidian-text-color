import { StateField } from '@codemirror/state';
import { type ChangedRange, type Tree, TreeFragment } from '@lezer/common';
import { DocInput } from "@codemirror/language";
import { textColorLanguage } from 'src/syntax';

/**
 * Parses the document with the coloring grammar and keeps the tree current,
 * so the view plugin, the auto hexifier and the editor commands all read one
 * parse rather than each doing their own.
 */
export const textColorParserField: StateField<{ tree: Tree, fragment: readonly TreeFragment[] }> = StateField.define({
	create(state) {
		const parsedTree = textColorLanguage.parser.parse(state.doc.toString());

		return {
			tree: parsedTree,
			fragment: TreeFragment.addTree(parsedTree),
		};
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

		return { tree: tree, fragment: fragments };
	},
});
