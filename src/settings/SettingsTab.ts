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

/** A rename the user has typed but not yet paid the save for. */
interface PendingName {
	commit: Debouncer<[string], void>;
	value: string;
}

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
	 * The renames waiting to be written, while the user is still typing. Saving
	 * a name costs a write to data.json, a reconfigure of every open editor and
	 * a rerender of every open preview, which is far too much to pay per
	 * keystroke; everything that reads the palette afterwards flushes them
	 * first, so a pending rename is never lost.
	 *
	 * Every row that has one is held, not just the one typed in last: each row
	 * commits against its own index, and an index only means what it meant
	 * while the palette keeps its order. A rename left behind here would fire
	 * after the next reorder or delete and land on a different color.
	 *
	 * Keyed by that index, and holding the name as well as the timer, because
	 * both of the things the pending renames have to take part in need to read
	 * them: the duplicate check and the next write of the palette.
	 */
	private readonly pendingNames = new Map<number, PendingName>();

	constructor(app: App, plugin: FastTextColorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	hide(): void {
		this.flushPendingNames()
			.catch(e => console.error(`text-color: could not save the palette: ${e}`));
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
						// redraw, so it lives only in the pending set.
						const palette = this.takePendingNames();
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
				// the snapshot here would write the old name back. Bail out
				// before taking the pending renames, so a row that is already
				// gone does not swallow them.
				const current = this.entryAt(index);
				if (current == undefined) {
					return;
				}
				const palette = this.takePendingNames();
				palette[index] = { ...palette[index], hex: normalizeHex(value, current.hex) };
				await this.updatePalette(palette);
				this.display();
			});

		const commitName: Debouncer<[string], void> = debounce((value: string) => {
			this.pendingNames.delete(index);
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
				const taken = this.effectiveNames().some((n, i) => i !== index && n === value);
				if (!validateColorName(value) || taken) {
					name.inputEl.addClass("ftc-name-invalid");
					// the keystroke before this one may have been valid and is
					// still scheduled; committing that prefix would save a name
					// the user typed past, not the one they meant.
					commitName.cancel();
					this.pendingNames.delete(index);
					return;
				}
				name.inputEl.removeClass("ftc-name-invalid");
				this.pendingNames.set(index, { commit: commitName, value });
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
				// awaited, not folded into the delete below: the confirmation
				// sits between the two, and a rename the user then decides not
				// to delete has to survive saying no.
				await this.flushPendingNames();
				const name = this.entryAt(index)?.name ?? color.name;
				if (await confirmByModal(this.app,
					`"${name}" disappears from the menus. Hexes already in your notes keep rendering.`,
					`Delete color ${name}`)) {
					await this.updatePalette(this.plugin.settings.palette.filter((_, i) => i !== index));
					this.display();
				}
			});
	}

	/**
	 * The palette with every pending rename applied, and the pending set left
	 * empty; the caller folds the result into the one write it was going to
	 * make anyway.
	 *
	 * Letting the renames save themselves instead would put two snapshots of
	 * data.json in flight at once — theirs and the caller's — and nothing
	 * orders the two writes, so the older one can land last and take the
	 * caller's change off disk while it is still on screen.
	 */
	private takePendingNames(): PaletteColor[] {
		const palette = this.plugin.settings.palette.map((c, i) => {
			const pending = this.pendingNames.get(i);
			return pending == undefined ? c : { ...c, name: pending.value };
		});
		// a rename that is about to be written must not also fire on its own.
		this.pendingNames.forEach(pending => pending.commit.cancel());
		this.pendingNames.clear();
		return palette;
	}

	/** Write every rename the user has stopped typing but not yet paid for. */
	private flushPendingNames(): Promise<void> {
		if (this.pendingNames.size == 0) {
			return Promise.resolve();
		}
		return this.updatePalette(this.takePendingNames());
	}

	/**
	 * The names as they will read once the pending renames land. The duplicate
	 * check has to see those: two rows renamed to the same thing inside one
	 * debounce window would both pass a check against the saved palette, and a
	 * duplicate leaves the second color unreachable, because resolving a name
	 * takes the first match — the markup would silently get the other hex.
	 */
	private effectiveNames(): string[] {
		return this.plugin.settings.palette.map((c, i) => this.pendingNames.get(i)?.value ?? c.name);
	}

	/** The palette entry a row stands for, as it is right now. */
	private entryAt(index: number): PaletteColor | undefined {
		return this.plugin.settings.palette[index];
	}

	private replaceColor(index: number, replacement: PaletteColor): Promise<void> {
		return this.updatePalette(this.plugin.settings.palette.map((c, i) => i === index ? replacement : c));
	}

	private async moveColor(index: number, direction: number): Promise<void> {
		// the bounds first, so a move that goes nowhere does not take the
		// pending renames with it and drop them unwritten.
		const target = index + direction;
		if (target < 0 || target >= this.plugin.settings.palette.length) {
			return;
		}
		const palette = this.takePendingNames();
		[palette[index], palette[target]] = [palette[target], palette[index]];
		await this.updatePalette(palette);
		this.display();
	}

	private updatePalette(palette: PaletteColor[]): Promise<void> {
		return this.plugin.updateSettings({ palette });
	}
}
