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
	 * The window form of `createSpan`, and not the node or the global one, for
	 * the reason `src/obsidian-globals.d.ts` gives: it is the only one that
	 * returns a detached element in a document other than the main window's.
	 * The other two places that build one, `ColorWidget.toDOM` and the reading
	 * mode `newSpan`, go the same way.
	 */
	toDOM(view: EditorView): HTMLElement {
		return view.dom.ownerDocument.win.createSpan();
	}
}
