import { RangeSetBuilder, EditorState } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { SyntaxNodeRef } from "@lezer/common";
import { MarkerWidget } from "src/editor/MarkerWidget";
import { ColorWidget } from "src/editor/ColorWidget";
import { settingsFacet } from "src/editor/SettingsFacet";
import { colorStyle } from "src/color/ColorStyle";
import { resolveTokenHex } from "src/color/resolveToken";

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

	const innermost = () => frames[frames.length - 1];

	const markText = (node: SyntaxNodeRef) => {
		const frame = innermost();
		if (frame == undefined) {
			return; // text outside any open color; nothing to apply.
		}
		const hex = resolveTokenHex(frame.token, settings);
		if (hex == null) {
			return; // unknown name or empty token: leave the text alone.
		}
		builder.add(node.from, node.to,
			Decoration.mark({ attributes: { style: colorStyle(hex, settings) } }));
	};

	const hideMarker = (node: SyntaxNodeRef) => {
		builder.add(node.from, node.to, Decoration.replace({ widget: new MarkerWidget(), block: false }));
	};

	/** `~={}` parses as an expression but carries no color token. */
	const hasColorToken = (node: SyntaxNodeRef): boolean =>
		node.node.getChild("TcLeft")?.getChild("Description")?.getChild("Color") != null;

	walkSubtree(expression, (node: SyntaxNodeRef) => {
		switch (node.type.name) {
			// `Unfinished` is also how the grammar files `~={token}=~`,
			// a complete but empty colored section: TcLeft immediately
			// followed by REnd. The syntax says that is markup, so it is
			// decorated like any other expression and its markers are
			// hidden — otherwise reading mode and live preview show a
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
				if (!settings.colorCodeSection) {
					return false;
				}
				markText(node);
				return false;

			case "Word":
				markText(node);
				return false;

			default:
				return true;
		}
	});
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
