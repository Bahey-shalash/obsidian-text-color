import { EditorView, WidgetType } from "@codemirror/view";

/** The empty stand-in that hides ~={...} and =~ markers in live preview. */
export class MarkerWidget extends WidgetType {

	/** every marker renders the same empty span; never redraw one. */
	eq(): boolean {
		return true;
	}

	/** the editor may live in a pop out window; build in its document. */
	toDOM(view: EditorView): HTMLElement {
		return view.dom.ownerDocument.createElement("span");
	}
}
