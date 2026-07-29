import {
	Decoration,
	DecorationSet,
	EditorView,
	PluginSpec,
	PluginValue,
	ViewPlugin,
	ViewUpdate,
} from "@codemirror/view";
import { livePreviewState } from "obsidian";
import { isLivePreview } from "src/editor/EditorContext";
import { buildTextColorDecorations } from "src/editor/buildDecorations";
import { colorMathWidgets } from "src/editor/MathWidgets";
import { settingsFacet } from "src/editor/SettingsFacet";

/**
 * Live preview rendering: decorates every visible color expression and keeps
 * the async rendered math widgets colored.
 */
class TextColorViewPlugin implements PluginValue {
	decorations: DecorationSet;
	notLivePreview = false;

	/** recolors math widgets as they are rendered asynchronously by mathjax. */
	mathObserver: MutationObserver;

	constructor(view: EditorView) {
		this.decorations = buildTextColorDecorations(view.state, view.visibleRanges);

		this.mathObserver = new MutationObserver((records) => {
			// only rendered widgets matter; skip pure removals and text churn.
			if (records.some(r => r.addedNodes.length > 0)) {
				colorMathWidgets(view);
			}
		});
		this.mathObserver.observe(view.contentDOM, { childList: true, subtree: true });
	}

	update(update: ViewUpdate) {
		if (!isLivePreview(update.state)) {
			if (this.decorations.size > 0) {
				this.decorations = Decoration.none;
			}
			this.notLivePreview = true;
			return;
		}

		// re-entering live preview from source mode needs a full rebuild even
		// though neither document nor viewport changed.
		if (this.notLivePreview) {
			this.notLivePreview = false;
			this.rebuild(update.view);
			return;
		}

		const selectionChanged = update.selectionSet && !update.view.plugin(livePreviewState)?.mousedown;
		// settings objects are immutable, so a new identity means the palette,
		// the delimiter toggle or the inline code toggle changed. Without this
		// a settings change would not reach an editor until it was next typed
		// in, because a reconfigure alone changes neither doc nor viewport.
		const settingsChanged = update.startState.facet(settingsFacet) !== update.state.facet(settingsFacet);

		if (update.docChanged || update.viewportChanged || selectionChanged || settingsChanged) {
			this.rebuild(update.view);
		}

		if (update.docChanged || update.viewportChanged || settingsChanged) {
			colorMathWidgets(update.view);
		}
	}

	destroy() {
		this.mathObserver.disconnect();
	}

	private rebuild(view: EditorView): void {
		this.decorations = buildTextColorDecorations(view.state, view.visibleRanges);
	}
}

const pluginSpec: PluginSpec<TextColorViewPlugin> = {
	decorations: (value: TextColorViewPlugin) => value.decorations,
};

export const textColorViewPlugin = ViewPlugin.fromClass(
	TextColorViewPlugin,
	pluginSpec
);
