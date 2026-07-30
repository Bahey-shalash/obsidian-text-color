import { EditorState } from "@codemirror/state";
import { editorLivePreviewField } from "obsidian";

/** Whether the editor state is in live preview (as opposed to source mode). */
export function isLivePreview(state: EditorState): boolean {
	return state.field(editorLivePreviewField).valueOf();
}
