import type FastTextColorPlugin from "src/main";
import { App, ColorComponent, Debouncer, ExtraButtonComponent, PluginSettingTab, Setting, TextComponent, debounce } from "obsidian";
import { colorStyle } from "src/color/ColorStyle";
import { normalizeHex } from "src/color/InlineColor";
import { PaletteColor, nextFreeName } from "src/settings/settings";
import { confirmByModal } from "src/ui/ConfirmationModal";
import { validateColorName } from "src/settings/validateColorName";

// --------------------------------------------------------------------------
//                           Settings Tab
// --------------------------------------------------------------------------

/** How long the user has to stop typing before a rename is written, in ms. */
const RENAME_DELAY = 400;

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

	/**
	 * The rename waiting to be written, while the user is still typing. Saving
	 * a name costs a write to data.json, a reconfigure of every open editor and
	 * a rerender of every open preview, which is far too much to pay per
	 * keystroke; everything that reads the palette afterwards flushes it first,
	 * so a pending rename is never lost.
	 */
	private pendingName: Debouncer<[string], void> | null = null;

	constructor(app: App, plugin: FastTextColorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	hide(): void {
		this.flushPendingName();
		super.hide();
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
						this.flushPendingName();
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
				// the entry at click time, not the snapshot this row was drawn
				// from: a rename keeps focus and does not redraw, so spreading
				// the snapshot here would write the old name back.
				this.flushPendingName();
				const current = this.entryAt(index);
				if (current == undefined) {
					return;
				}
				await this.replaceColor(index, { ...current, hex: normalizeHex(value, current.hex) });
				this.display();
			});

		const commitName = debounce((value: string) => {
			const current = this.entryAt(index);
			if (current == undefined) {
				return;
			}
			this.replaceColor(index, { ...current, name: value })
				.catch(e => console.error(`text-color: could not save the palette: ${e}`));
		}, RENAME_DELAY, true);

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
				this.pendingName = commitName;
				commitName(value);
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
				this.flushPendingName();
				const name = this.entryAt(index)?.name ?? color.name;
				if (await confirmByModal(this.app,
					`"${name}" disappears from the menus. Hexes already in your notes keep rendering.`,
					`Delete color ${name}`)) {
					await this.updatePalette(this.plugin.settings.palette.filter((_, i) => i !== index));
					this.display();
				}
			});
	}

	/** Write a rename the user has stopped typing but not yet paid for. */
	private flushPendingName(): void {
		const pending = this.pendingName;
		this.pendingName = null;
		pending?.run();
	}

	/** The palette entry a row stands for, as it is right now. */
	private entryAt(index: number): PaletteColor | undefined {
		return this.plugin.settings.palette[index];
	}

	private replaceColor(index: number, replacement: PaletteColor): Promise<void> {
		return this.updatePalette(this.plugin.settings.palette.map((c, i) => i === index ? replacement : c));
	}

	private async moveColor(index: number, direction: number): Promise<void> {
		this.flushPendingName();
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
