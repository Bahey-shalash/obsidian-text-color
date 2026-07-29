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
 */
export function decorateExpression(expression: SyntaxNodeRef, builder: RangeSetBuilder<Decoration>, state: EditorState): void {
	const base = expression.from;
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
		builder.add(node.from + base, node.to + base,
			Decoration.mark({ attributes: { style: colorStyle(hex, settings) } }));
	};

	const hideMarker = (node: SyntaxNodeRef) => {
		builder.add(node.from + base, node.to + base, Decoration.replace({ widget: new MarkerWidget(), block: false }));
	};

	/** `~={}` parses as an expression but carries no color token. */
	const hasColorToken = (node: SyntaxNodeRef): boolean =>
		node.node.getChild("TcLeft")?.getChild("Description")?.getChild("Color") != null;

	expression.node.toTree().iterate({
		enter(node) {
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
						cursorInside: selection.from <= base + node.to && selection.to >= base + node.from,
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
					const token = state.sliceDoc(base + node.from, base + node.to);
					const frame = innermost();
					if (frame == undefined) {
						return true;
					}
					frame.token = token;

					if (frame.cursorInside && settings.interactiveDelimiters) {
						// vscode style: a small swatch in front of the visible
						// color token instead of a ball hiding it.
						const widget = new ColorWidget(token, node.from + base, node.to + base);
						builder.add(node.from + base, node.from + base, Decoration.widget({ widget: widget, side: -1 }));
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
					return;
			}
		},
	});
}
