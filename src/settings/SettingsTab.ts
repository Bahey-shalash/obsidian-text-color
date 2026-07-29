import type FastTextColorPlugin from "src/main";
import { App, ColorComponent, ExtraButtonComponent, PluginSettingTab, Setting, TextComponent } from "obsidian";
import { colorStyle } from "src/color/ColorStyle";
import { normalizeHex } from "src/color/InlineColor";
import { PaletteColor, nextFreeName } from "src/settings/settings";
import { confirmByModal } from "src/ui/ConfirmationModal";
import { validateColorName } from "src/settings/validateColorName";

// --------------------------------------------------------------------------
//                           Settings Tab
// --------------------------------------------------------------------------

/**
 * The palette: menu name <-> hex, one row per color. The name is only a label
 * for the menus; notes always receive the hex.
 *
 * Every handler produces a new settings object rather than editing the one it
 * was given. That is what lets open editors notice the change: the facet
 * value's identity is the signal, and an in place edit has none.
 */
export class FastTextColorPluginSettingTab extends PluginSettingTab {
	plugin: FastTextColorPlugin;

	constructor(app: App, plugin: FastTextColorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const { settings } = this.plugin;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Palette")
			.setDesc("A name for the menus and the hex it stands for. Notes always get the hex.")
			.setHeading();

		const paletteEl = containerEl.createDiv();
		paletteEl.addClass("ftc-palette");

		settings.palette.forEach((color, index) => {
			this.createPaletteRow(paletteEl, color, index);
		});

		new Setting(containerEl)
			.setName("Add color")
			.addButton(btn => {
				btn.setIcon("plus")
					.setTooltip("add a color to the palette")
					.onClick(async () => {
						// the palette at click time, not the snapshot this tab
						// was rendered from: a rename keeps focus and does not
						// redraw, so it lives only in the current object.
						const palette = this.plugin.settings.palette;
						await this.updatePalette([...palette, { name: nextFreeName(palette), hex: "#ffffff" }]);
						this.display();
					});
			});

		new Setting(containerEl).setName("Other").setHeading();

		new Setting(containerEl)
			.setName("Interactive delimiters")
			.setDesc("Show a color swatch in front of the color token inside the editor.")
			.addToggle(tgl => {
				tgl.setValue(settings.interactiveDelimiters)
					.onChange(value => this.plugin.updateSettings({ interactiveDelimiters: value }));
			});

		new Setting(containerEl)
			.setName("Color inline code")
			.setDesc("Apply color to inline code.")
			.addToggle(tgl => {
				tgl.setValue(settings.colorCodeSection)
					.onChange(value => this.plugin.updateSettings({ colorCodeSection: value }));
			});
	}

	/** One palette row: swatch, name, order, delete. */
	private createPaletteRow(container: HTMLElement, color: PaletteColor, index: number): void {
		const row = container.createDiv({ cls: "ftc-palette-row" });

		new ColorComponent(row)
			.setValue(color.hex)
			.onChange(async value => {
				await this.replaceColor(index, { ...color, hex: normalizeHex(value, color.hex) });
				this.display();
			});

		const name = new TextComponent(row);
		name.setValue(color.name)
			.setPlaceholder("name")
			.onChange(value => {
				const taken = this.plugin.settings.palette.some((c, i) => i !== index && c.name === value);
				if (!validateColorName(value) || taken) {
					name.inputEl.addClass("ftc-name-invalid");
					return;
				}
				name.inputEl.removeClass("ftc-name-invalid");
				this.replaceColor(index, { ...this.plugin.settings.palette[index], name: value });
			});
		name.inputEl.addClass("ftc-palette-name");
		// the name shows itself in its color.
		name.inputEl.setAttr("style", colorStyle(color.hex));

		new ExtraButtonComponent(row)
			.setIcon("chevron-up")
			.setTooltip("move up")
			.onClick(() => this.moveColor(index, -1));

		new ExtraButtonComponent(row)
			.setIcon("chevron-down")
			.setTooltip("move down")
			.onClick(() => this.moveColor(index, 1));

		new ExtraButtonComponent(row)
			.setIcon("trash")
			.setTooltip("delete color")
			.onClick(async () => {
				if (await confirmByModal(this.app,
					`"${color.name}" disappears from the menus. Hexes already in your notes keep rendering.`,
					`Delete color ${color.name}`)) {
					await this.updatePalette(this.plugin.settings.palette.filter((_, i) => i !== index));
					this.display();
				}
			});
	}

	private replaceColor(index: number, replacement: PaletteColor): Promise<void> {
		return this.updatePalette(this.plugin.settings.palette.map((c, i) => i === index ? replacement : c));
	}

	private async moveColor(index: number, direction: number): Promise<void> {
		const palette = [...this.plugin.settings.palette];
		const target = index + direction;
		if (target < 0 || target >= palette.length) {
			return;
		}
		[palette[index], palette[target]] = [palette[target], palette[index]];
		await this.updatePalette(palette);
		this.display();
	}

	private updatePalette(palette: PaletteColor[]): Promise<void> {
		return this.plugin.updateSettings({ palette });
	}
}
