import { EditorView, WidgetType } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";
import { Menu, editorInfoField } from "obsidian";
import { settingsFacet } from "src/editor/SettingsFacet";
import { removeColorAt } from "src/editor/TextColorFunctions";
import { enclosingExpression } from "src/editor/treeQueries";
import { applyColorStyle } from "src/color/ColorStyle";
import { resolveTokenHex } from "src/color/resolveToken";
import { CustomColorModal } from "src/ui/CustomColorModal";
import type { FastTextColorPluginSettings } from "src/settings/settings";

/**
 * The swatch shown in front of a visible color token (vscode style). Clicking
 * selects the token, hovering opens the palette to swap or remove the color.
 *
 * The widget holds no position it does not compare in `eq()`. Codemirror
 * keeps the dom — and with it the handler closures — of a widget that
 * compares equal, so a field left out of `eq()` is a field that goes stale;
 * the enclosing expression is therefore looked up from the current state at
 * click time rather than captured when the decoration was built.
 */
export class ColorWidget extends WidgetType {
	private menu: Menu | null = null;

	constructor(
		readonly token: string,
		readonly from: number,
		readonly to: number,
	) {
		super();
	}

	eq(other: ColorWidget): boolean {
		return other.token == this.token && other.from == this.from && other.to == this.to;
	}

	toDOM(view: EditorView): HTMLElement {
		const settings = view.state.facet(settingsFacet);
		const doc = view.dom.ownerDocument;

		const swatch = doc.createElement("span");
		const hex = resolveTokenHex(this.token, settings);
		if (hex != null) {
			applyColorStyle(swatch, hex);
		}
		swatch.addClass("ftc-color-delimiter");

		swatch.onclick = () => {
			view.dispatch({ selection: { anchor: this.from, head: this.to } });
		};

		swatch.onmouseover = () => this.openMenu(view, swatch, doc);

		return swatch;
	}

	/** A menu outlives its swatch unless it is told not to. */
	destroy(): void {
		this.menu?.hide();
		this.menu = null;
	}

	private openMenu(view: EditorView, swatch: HTMLElement, doc: Document): void {
		if (this.menu != null) {
			return;
		}

		const settings = view.state.facet(settingsFacet);
		const menu = new Menu();
		this.menu = menu;
		// decorations reuse this widget via eq(), so the flag must clear
		// when the menu closes or it would never open again.
		menu.onHide(() => { this.menu = null; });

		settings.palette.forEach(entry => {
			menu.addItem(item => {
				item.setTitle(entry.name)
					.setIcon("palette")
					.onClick(() => {
						view.dispatch({ changes: { from: this.from, to: this.to, insert: entry.hex } });
					});
			});
		});

		menu.addItem(item => {
			item.setTitle("Custom...")
				.setIcon("pipette")
				.onClick(() => this.openCustomPicker(view, settings));
		});

		menu.addItem(item => {
			item.setTitle("Remove")
				.setIcon("ban")
				.onClick(() => removeColorAt(view, this.from));
		});

		const rect = swatch.getBoundingClientRect();
		// the swatch may live in a pop out window; show the menu in its document.
		menu.showAtPosition({ x: rect.left, y: rect.bottom }, doc);
	}

	/**
	 * The custom picker for an already colored section — the context menu has
	 * it, so the swatch menu must not offer less. The sample is read from the
	 * current state at click time; the range being replaced is the token this
	 * widget decorates, same as the palette entries above.
	 */
	private openCustomPicker(view: EditorView, settings: FastTextColorPluginSettings): void {
		const expression = enclosingExpression(view.state, this.from);
		const sample = expression == null ? "" : expressionBody(view.state, expression);

		new CustomColorModal(
			view.state.field(editorInfoField).app,
			resolveTokenHex(this.token, settings) ?? "#ff0000",
			sample,
			hex => view.dispatch({ changes: { from: this.from, to: this.to, insert: hex } }),
		).open();
	}
}

/** The text between an expression's markers, as it stands right now. */
function expressionBody(state: EditorState, expression: SyntaxNode): string {
	const left = expression.getChild("TcLeft");
	const right = expression.getChild("TcRight")?.getChild("REnd")?.getChild("RMarker");
	return state.sliceDoc(left?.to ?? expression.from, right?.from ?? expression.to);
}
