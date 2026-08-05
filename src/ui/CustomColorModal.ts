import { App, ColorComponent, Modal, Setting, TextComponent } from "obsidian";
import { parseHex, toPickerHex, normalizeHex } from "src/color/InlineColor";
import { applyColorStyle } from "src/color/ColorStyle";

/**
 * Modal that lets the user pick an arbitrary hex color. A pure picker: what
 * happens with the picked color (insert new markup, replace an existing
 * token) is the caller's onPicked, so the command palette and the swatch
 * menu share one modal instead of each half-owning it.
 */
export class CustomColorModal extends Modal {
	hex: string;

	private preview!: HTMLElement;
	private text!: TextComponent;
	private picker!: ColorComponent;
	private syncing = false;

	constructor(
		app: App,
		initial: string,
		private readonly sample: string,
		private readonly onPicked: (hex: string) => void,
	) {
		super(app);
		this.hex = normalizeHex(initial);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("ftc-custom-color-modal");
		contentEl.createEl("h3", { text: "Custom color" });

		this.preview = contentEl.createDiv({ cls: "ftc-custom-color-preview" });
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
				// the field's value is the current hex, so the placeholder is
				// only seen once the user clears it: it names the field rather
				// than repeating the format they just deleted.
				text.setPlaceholder("Hex color")
					.setValue(this.hex)
					.onChange(value => {
						if (parseHex(value) != null) {
							this.setHex(value, "text");
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
		// the modal may live in a pop out window; use that window's timer.
		contentEl.win.setTimeout(() => this.text?.inputEl.focus(), 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private sampleText(): string {
		const sample = this.sample.trim() === "" ? "This is colored text" : this.sample;
		return sample.length > 80 ? `${sample.slice(0, 80)}...` : sample;
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
		applyColorStyle(this.preview, this.hex);
	}

	private apply() {
		const hex = parseHex(this.hex);
		if (hex == null) {
			return;
		}
		this.onPicked(hex);
		this.close();
	}
}
