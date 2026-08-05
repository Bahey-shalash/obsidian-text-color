import { RangeSetBuilder, EditorState } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { SyntaxNodeRef } from "@lezer/common";
import { MarkerWidget } from "src/editor/MarkerWidget";
import { ColorWidget } from "src/editor/ColorWidget";
import { settingsFacet } from "src/editor/SettingsFacet";
import { colorClasses, colorPropStyle } from "src/color/ColorStyle";
import { resolveTokenHex } from "src/color/resolveToken";
import { textColorParserField } from "src/editor/TextColorStateField";
import { shouldDescendInto } from "src/syntax";

/** One open ~={token} while walking an expression, innermost last. */
interface ColorFrame {
	token: string;
	/** the cursor touches this expression, so its markers stay visible */
	cursorInside: boolean;
	/**
	 * Whether this is really coloring markup. The grammar accepts `~={}` as a
	 * well formed expression with no color in it; the syntax does not, and
	 * reading mode renders it as the literal text the user typed. Hiding its
	 * markers here would make the two modes disagree about what is on screen.
	 */
	isMarkup: boolean;
}

/**
 * Decorate one top level expression: hide the markers (unless the cursor is
 * inside), put a swatch widget in front of visible tokens, and mark every
 * piece of text with its innermost color as an inline style.
 *
 * The walk goes through a cursor over the live tree, so every position is a
 * document position: copying the subtree out with `toTree()` would cost a copy
 * per expression per redraw, and redraws happen on every cursor move.
 */
export function decorateExpression(expression: SyntaxNodeRef, builder: RangeSetBuilder<Decoration>, state: EditorState): void {
	const frames: ColorFrame[] = [];

	const selection = state.selection.main;
	const settings = state.facet(settingsFacet);
	const sliceDoc = (from: number, to: number) => state.sliceDoc(from, to);

	/**
	 * The block this expression runs into, if any. Both kinds count: reading
	 * mode skips a whole section that renders itself, so decorating inside one
	 * here is how the two modes end up disagreeing about a `$$` block.
	 *
	 * Resolved once for the expression rather than per node: this runs on every
	 * cursor move, once per visible expression, and the walk asks per node.
	 */
	const block = state.field(textColorParserField).blocks
		.find(b => b.from < expression.to && b.to > expression.from);
	const insideBlock = (range: { from: number, to: number }) =>
		block != undefined && block.from <= range.from && range.to <= block.to;

	/**
	 * The part of a range that stays out of the block, or null when none of it
	 * does. Clipped rather than skipped because the runs marked inside an
	 * unbalanced code section are not nodes: one can start in ordinary text and
	 * carry on straight through a fence, and only the tail of it is off limits.
	 */
	const outsideBlock = (range: { from: number, to: number }) => {
		if (block == undefined || range.to <= block.from || range.from >= block.to) {
			return range;
		}
		if (range.from < block.from) {
			return { from: range.from, to: block.from };
		}
		return range.to > block.to ? { from: block.to, to: range.to } : null;
	};

	const innermost = () => frames[frames.length - 1];

	const markText = (marked: { from: number, to: number }) => {
		const range = outsideBlock(marked);
		if (range == null) {
			return; // a block renders itself; see `insideBlock`.
		}
		if (range.to <= range.from) {
			return; // codemirror does not accept an empty mark.
		}
		const frame = innermost();
		if (frame == undefined) {
			return; // text outside any open color; nothing to apply.
		}
		const hex = resolveTokenHex(frame.token, settings);
		if (hex == null) {
			return; // unknown name or empty token: leave the text alone.
		}
		builder.add(range.from, range.to, Decoration.mark({
			class: colorClasses(settings),
			attributes: { style: colorPropStyle(hex) },
		}));
	};

	const hideMarker = (node: SyntaxNodeRef) => {
		if (insideBlock(node)) {
			return; // markup inside a block is a sample, not a marker.
		}
		builder.add(node.from, node.to, Decoration.replace({ widget: new MarkerWidget(), block: false }));
	};

	/** `~={}` parses as an expression but carries no color token. */
	const hasColorToken = (node: SyntaxNodeRef): boolean =>
		node.node.getChild("TcLeft")?.getChild("Description")?.getChild("Color") != null;

	/**
	 * The text of an unbalanced code section that still has to be marked. The
	 * grammar hands that text out as bare `char` tokens with no `Word` nodes of
	 * its own, so nothing in the switch below would ever colour it; the runs
	 * between the markers inside the section are marked from here instead.
	 */
	let codeRun: { pos: number, end: number } | null = null;

	/**
	 * Mark the run in front of the node about to be entered, and step over that
	 * node. Marking as the walk arrives rather than all at once up front is
	 * what keeps the runs in the order the builder demands, and what makes each
	 * of them see the color that is open where it sits: the run before a
	 * closing marker still belongs to the color that marker ends.
	 */
	const markCodeRunBefore = (node: { from: number, to: number }) => {
		if (codeRun == null || node.from < codeRun.pos) {
			return; // inside something the run has already stepped over.
		}
		markText({ from: codeRun.pos, to: Math.min(node.from, codeRun.end) });
		codeRun = node.to < codeRun.end ? { pos: node.to, end: codeRun.end } : null;
	};

	walkSubtree(expression, (node: SyntaxNodeRef) => {
		// nothing inside a block is ours to decorate. `markText` and
		// `hideMarker` enforce that too, because the runs marked inside an
		// unbalanced code section are not nodes and never reach this check;
		// skipping the subtree here just saves walking it.
		if (insideBlock(node)) {
			return false;
		}

		// the backtick is as plain as the rest of an unbalanced section, so it
		// stays inside the run; only the markers below end one.
		if (node.type.name != "CODE") {
			markCodeRunBefore(node);
		}

		switch (node.type.name) {
			// `Unfinished` is also how the grammar files `~={token}=~`,
			// a complete but empty colored section: TcLeft immediately
			// followed by REnd. The syntax says that is markup, so it is
			// decorated like any other expression and its markers are
			// hidden, otherwise reading mode and live preview show a
			// different number of characters for the same source.
			case "Unfinished":
			case "Expression":
				frames.push({
					token: '',
					cursorInside: selection.from <= node.to && selection.to >= node.from,
					isMarkup: hasColorToken(node),
				});
				return true;

			case "TcLeft": {
				// ~={token}
				const frame = innermost();
				if (frame?.isMarkup && !frame.cursorInside) {
					hideMarker(node);
				}
				return true;
			}

			case "Color": {
				const token = state.sliceDoc(node.from, node.to);
				const frame = innermost();
				if (frame == undefined) {
					return true;
				}
				frame.token = token;

				if (frame.cursorInside && settings.interactiveDelimiters) {
					// vscode style: a small swatch in front of the visible
					// color token instead of a ball hiding it.
					const widget = new ColorWidget(token, node.from, node.to, resolveTokenHex(token, settings));
					builder.add(node.from, node.from, Decoration.widget({ widget: widget, side: -1 }));
				}
				return true;
			}

			case "RMarker": {
				// =~
				const closed = frames.pop();
				if (closed?.isMarkup && !closed.cursorInside) {
					hideMarker(node);
				}
				return true;
			}

			case "EOF":
			case "ENDLN":
				frames.pop();
				return true;

			case "CodeSection":
				// the rule every other consumer of the syntax already uses:
				// only a section that closes its backtick is literal code, and
				// only that is left alone. An unbalanced one is plain text in
				// obsidian (#41), and the grammar swallows the rest of the line
				// into it, the enclosing color's closing marker included, so
				// skipping it left that marker on screen and the color running
				// on past its own end.
				if (!shouldDescendInto(node, sliceDoc)) {
					if (settings.colorCodeSection) {
						markText(node);
					}
					return false;
				}
				codeRun = { pos: node.from, end: node.to };
				return true;

			case "Word":
				markText(node);
				return false;

			default:
				return true;
		}
	});

	// a code section that reaches the end of the expression has no node behind
	// it for the walk to arrive at, so the end of the expression stands in.
	markCodeRunBefore({ from: expression.to, to: expression.to });
}

/**
 * Walk a node and its descendants in document order, `enter` returning false to
 * skip a subtree.
 *
 * Hand rolled because neither library walk does this. `Tree.iterate` needs a
 * tree, so it costs a `toTree()` copy per expression per redraw, and redraws
 * happen on every cursor move. `TreeCursor.iterate` needs no copy but is not
 * scoped to the node it starts on: having exhausted that node it moves on to
 * the following siblings, so decorating one expression would walk out into the
 * rest of the document and decorate everything after it as well.
 */
function walkSubtree(root: SyntaxNodeRef, enter: (node: SyntaxNodeRef) => boolean): void {
	const cursor = root.node.cursor();

	for (let depth = 0; ;) {
		if (enter(cursor) !== false && cursor.firstChild()) {
			depth++;
			continue;
		}
		for (;;) {
			if (depth == 0) {
				return; // back at the root: the subtree is done.
			}
			if (cursor.nextSibling()) {
				break;
			}
			cursor.parent();
			depth--;
		}
	}
}
