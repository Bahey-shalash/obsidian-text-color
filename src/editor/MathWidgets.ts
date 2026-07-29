import { EditorView } from "@codemirror/view";
import { settingsFacet } from "src/editor/SettingsFacet";
import { isLivePreview } from "src/editor/EditorContext";
import { expressionColorAt } from "src/editor/treeQueries";
import { resolveTokenHex } from "src/color/resolveToken";

const MARKER_ATTRIBUTE = "data-ftc-math";

/**
 * Rendered math is an obsidian widget that replaces $...$ and therefore never
 * sits inside the color marks. Color the mathjax containers directly from the
 * expression they live in; mathjax glyphs use currentColor, so setting color
 * on the container is enough. Elements are tagged so stale coloring can be
 * removed once the markup around them is gone.
 */
export function colorMathWidgets(view: EditorView): void {
	if (!isLivePreview(view.state)) {
		return;
	}

	const settings = view.state.facet(settingsFacet);

	view.contentDOM.querySelectorAll("mjx-container").forEach(widget => {
		const el = widget as HTMLElement;

		const pos = positionOf(view, el);
		if (pos == null) {
			return;
		}

		clearColoring(el);

		const token = expressionColorAt(view.state, pos);
		const hex = token == null ? null : resolveTokenHex(token, settings);
		if (hex == null) {
			return;
		}

		el.style.setProperty("--ftc-color", hex);
		el.style.color = "var(--ftc-color)";
		el.setAttribute(MARKER_ATTRIBUTE, "");
	});
}

function positionOf(view: EditorView, el: HTMLElement): number | null {
	try {
		return view.posAtDOM(el);
	} catch {
		return null; // widget not (yet) part of the document
	}
}

function clearColoring(el: HTMLElement): void {
	if (!el.hasAttribute(MARKER_ATTRIBUTE)) {
		return;
	}
	el.style.removeProperty("--ftc-color");
	el.style.removeProperty("color");
	el.removeAttribute(MARKER_ATTRIBUTE);
}
