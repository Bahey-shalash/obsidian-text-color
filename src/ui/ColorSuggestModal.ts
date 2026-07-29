import { SuggestModal, App, Editor } from "obsidian";
import { insertColor } from "src/editor/TextColorFunctions";
import { applyColorStyle } from "src/color/ColorStyle";
import { PaletteColor } from "src/settings/settings";

/** Pick a palette color by name; the note receives its hex. */
export class ColorSuggestModal extends SuggestModal<PaletteColor> {
	constructor(
		app: App,
		private palette: PaletteColor[],
		private editor: Editor,
		private onPicked?: (color: PaletteColor) => void,
	) {
		super(app);
	}

	getSuggestions(query: string): PaletteColor[] {
		const needle = query.toLowerCase();
		return this.palette.filter(color => color.name.toLowerCase().startsWith(needle));
	}

	renderSuggestion(color: PaletteColor, el: HTMLElement): void {
		const div = el.createDiv();
		div.innerText = color.name;
		applyColorStyle(div, color.hex);
	}

	onChooseSuggestion(color: PaletteColor): void {
		insertColor(color.hex, this.editor);
		this.onPicked?.(color);
	}
}
