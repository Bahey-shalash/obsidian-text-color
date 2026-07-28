import { App, ColorComponent, Editor, Modal, Setting, TextComponent } from "obsidian";
import { applyColor } from "src/color/TextColorFunctions";
import { literalTextColor, isLiteralColor, toPickerHex } from "src/color/InlineColor";

/**
 * Modal that lets the user pick an arbitrary color and apply it directly as a
 * literal color in the markup (~={#rrggbb}text=~), without having to define it
 * as a named color in a theme first.
 */
export class CustomColorModal extends Modal {
	editor: Editor;
	hex: string;

	private preview: HTMLElement;
	private text: TextComponent;
	private picker: ColorComponent;
	private syncing = false;

	constructor(app: App, editor: Editor, initial = "#ff0000") {
		super(app);
		this.editor = editor;
		this.hex = normalizeHex(initial);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("ftc-custom-color-modal");
		contentEl.createEl("h3", { text: "Custom color" });

		this.preview = contentEl.createEl("div", { cls: "ftc-custom-color-preview" });
		this.preview.setText(this.sampleText());

		new Setting(contentEl)
			.setName("Color")
			.addColorPicker(picker => {
				this.picker = picker;
				picker.setValue(toPickerHex(this.hex));
				picker.onChange(value => this.setHex(value, "picker"));
			})
			.addText(text => {
				this.text = text;
				text.setPlaceholder("#ff0000")
					.setValue(this.hex)
					.onChange(value => {
						const candidate = value.startsWith("#") ? value : `#${value}`;
						if (isLiteralColor(candidate)) {
							this.setHex(candidate, "text");
						}
					});
				text.inputEl.addEventListener("keydown", evt => {
					if (evt.key === "Enter") {
						evt.preventDefault();
						this.apply();
					}
				});
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText("Apply")
				.setCta()
				.onClick(() => this.apply()));

		this.updatePreview();
		window.setTimeout(() => this.text?.inputEl.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private sampleText(): string {
		const selected = this.editor.getSelection();
		if (!selected) {
			return "This is colored text";
		}
		return selected.length > 80 ? `${selected.slice(0, 80)}...` : selected;
	}

	/**
	 * Keep the picker and the text field in sync without looping back on each other.
	 */
	private setHex(value: string, source: "picker" | "text") {
		if (this.syncing) {
			return;
		}
		this.hex = normalizeHex(value);

		this.syncing = true;
		try {
			if (source === "picker") {
				this.text?.setValue(this.hex);
			} else {
				this.picker?.setValue(toPickerHex(this.hex));
			}
		} finally {
			this.syncing = false;
		}

		this.updatePreview();
	}

	private updatePreview() {
		this.preview.setAttribute("style", literalTextColor(this.hex).getCssInlineStyle());
	}

	private apply() {
		if (!isLiteralColor(this.hex)) {
			return;
		}
		applyColor(literalTextColor(this.hex), this.editor);
		this.close();
	}
}

/**
 * Coerce whatever the picker or the user gives us into a leading-# hex string.
 */
function normalizeHex(value: string): string {
	const trimmed = value.trim();
	const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
	return isLiteralColor(withHash) ? withHash.toLowerCase() : "#ff0000";
}
