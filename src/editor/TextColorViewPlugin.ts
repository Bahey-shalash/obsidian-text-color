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

/** The window the editor lives in; it may be a pop out. */
function windowOf(view: EditorView): Window {
	return view.dom.ownerDocument.defaultView ?? window;
}

/** Did this batch of mutations put rendered math on screen? */
function addsMath(record: MutationRecord): boolean {
	for (let i = 0; i < record.addedNodes.length; i++) {
		const node = record.addedNodes.item(i);
		if (node == null || node.nodeType != Node.ELEMENT_NODE) {
			continue;
		}
		const element = node as Element;
		if (element.matches("mjx-container") || element.querySelector("mjx-container") != null) {
			return true;
		}
	}
	return false;
}

/**
 * Live preview rendering: decorates every visible color expression and keeps
 * the async rendered math widgets colored.
 */
class TextColorViewPlugin implements PluginValue {
	decorations: DecorationSet;
	notLivePreview = false;

	/** recolors math widgets as they are rendered asynchronously by mathjax. */
	mathObserver: MutationObserver;

	/** pending coalesced math pass, if any */
	private mathPass: number | null = null;

	private readonly view: EditorView;

	constructor(view: EditorView) {
		this.view = view;
		this.decorations = buildTextColorDecorations(view.state, view.visibleRanges);

		this.mathObserver = new MutationObserver((records) => {
			// only rendered math matters. Every other insertion — typing,
			// scrolling, obsidian's own widgets — would otherwise pay for a
			// query over the whole content dom.
			if (records.some(addsMath)) {
				this.scheduleMathPass(view);
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
		if (this.mathPass != null) {
			windowOf(this.view).clearTimeout(this.mathPass);
			this.mathPass = null;
		}
	}

	private rebuild(view: EditorView): void {
		this.decorations = buildTextColorDecorations(view.state, view.visibleRanges);
	}

	/** mathjax renders in bursts; one pass per burst is enough. */
	private scheduleMathPass(view: EditorView): void {
		if (this.mathPass != null) {
			return;
		}
		this.mathPass = windowOf(view).setTimeout(() => {
			this.mathPass = null;
			colorMathWidgets(view);
		}, 0);
	}
}

const pluginSpec: PluginSpec<TextColorViewPlugin> = {
	decorations: (value: TextColorViewPlugin) => value.decorations,
};

export const textColorViewPlugin = ViewPlugin.fromClass(
	TextColorViewPlugin,
	pluginSpec
);
