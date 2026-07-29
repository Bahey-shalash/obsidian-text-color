import { EditorState } from "@codemirror/state";
import { editorLivePreviewField } from "obsidian";

/** Whether the editor state is in live preview (as opposed to source mode). */
export function isLivePreview(state: EditorState): boolean {
	// @ts-ignore obsidian types the field value as a private class
	return state.field(editorLivePreviewField).valueOf();
}
