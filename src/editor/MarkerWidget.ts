import { EditorView, WidgetType } from "@codemirror/view";

/** The empty stand-in that hides ~={...} and =~ markers in live preview. */
export class MarkerWidget extends WidgetType {

	/** every marker renders the same empty span; never redraw one. */
	eq(): boolean {
		return true;
	}

	/**
	 * The editor may live in a pop out window; build in its document.
	 *
	 * `createElement` rather than obsidian's `createEl` on purpose, and the
	 * same goes for the other two places that build a detached element
	 * (`ColorWidget.toDOM` and the reading mode `newSpan`). `createEl` on a
	 * node appends the result to that node, so `document.createEl` would try
	 * `document.appendChild` and throw; the global `createEl` builds in the
	 * main window's document, which loses the pop out this line exists for.
	 * Neither form can return a detached element in the right document.
	 */
	toDOM(view: EditorView): HTMLElement {
		return view.dom.ownerDocument.createElement("span");
	}
}
