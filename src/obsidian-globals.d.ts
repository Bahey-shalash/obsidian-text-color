/**
 * Obsidian's dom helpers, per window.
 *
 * A widget or a rendered span has to be built detached and in the document it
 * is going to live in, which for a pop out window is not the main one. Neither
 * published form of `createEl` does that: `Node.createEl` appends the result to
 * the node it was called on, and the bare global builds in the main window's
 * document.
 *
 * The per window form does. Obsidian bootstraps every window it opens (pop
 * outs included) by evaluating its globals inside it, so each window's
 * `createEl` closes over that window's own document, and
 * `someDoc.win.createSpan()` returns a detached span belonging to `someDoc`.
 * The published typings only declare these as ambient functions, so the window
 * form is named here. Checked against obsidian 1.13.
 */

declare global {
	interface Window {
		createSpan(o?: DomElementInfo | string, callback?: (el: HTMLSpanElement) => void): HTMLSpanElement;
	}
}

export { };
