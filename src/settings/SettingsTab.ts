import type FastTextColorPlugin from "src/main";
import { App, Debouncer, PluginSettingTab, Setting, SettingDefinitionItem, TextComponent, debounce } from "obsidian";
import { applyColorStyle } from "src/color/ColorStyle";
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
 * The plain on/off settings, by the key the declarative control binds under,
 * which is also the key they are stored under, so `getControlValue` and
 * `setControlValue` below are a lookup rather than a mapping.
 */
const TOGGLES = {
	interactiveDelimiters: {
		name: "Interactive delimiters",
		desc: "Show a color swatch in front of the color token inside the editor.",
	},
	colorCodeSection: {
		name: "Color inline code",
		desc: "Apply color to inline code.",
	},
} as const;

type ToggleKey = keyof typeof TOGGLES;

/**
 * `in` would answer yes to `toString` and everything else off the prototype,
 * and a key that is not one of these must not read or write one of them.
 */
function isToggleKey(key: string): key is ToggleKey {
	return Object.prototype.hasOwnProperty.call(TOGGLES, key);
}

/**
 * The palette: menu name <-> hex, one row per color. The name is only a label
 * for the menus; notes always receive the hex.
 *
 * Declared rather than drawn: `getSettingDefinitions` hands obsidian the shape
 * of the tab and obsidian renders it, which is what puts these settings in the
 * settings search. The palette is a `list`, so the add, delete and reorder
 * affordances (buttons, drag handles, the keyboard shortcuts for them) come
 * from obsidian; this file only says what each of them does to the palette.
 * The rows themselves are still built by hand, because a row is two controls
 * (the color and the name that stands for it) and a declared row is one.
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
			.catch(e => console.error("colors: could not save the palette:", e));
		super.hide();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: "list",
				heading: "Palette",
				emptyState: "No colors yet. The color menus stay empty until you add one.",
				addItem: {
					name: "Add a color to the palette",
					action: () => { void this.addColor(); },
				},
				onDelete: index => { void this.deleteColor(index); },
				onReorder: (from, to) => { this.moveColor(from, to); },
				items: this.plugin.settings.palette.map((color, index) => ({
					// what the settings search matches a row on. The row shows
					// the name in the field that renames it, so `render` clears
					// the label rather than printing it twice.
					name: color.name,
					aliases: [color.hex],
					render: (setting: Setting) => this.renderPaletteRow(setting, color, index),
				})),
			},
			{
				type: "group",
				heading: "Other",
				items: Object.entries(TOGGLES).map(([key, { name, desc }]) => ({
					name,
					desc,
					control: { type: "toggle" as const, key },
				})),
			},
		];
	}

	/** Where the declared toggles above read from. */
	getControlValue(key: string): unknown {
		return isToggleKey(key) ? this.plugin.settings[key] : undefined;
	}

	/**
	 * Where they write to: `updateSettings`, and not `saveData`, because that
	 * is the path the open editors and previews are told about.
	 */
	setControlValue(key: string, value: unknown): void | Promise<void> {
		if (typeof value != "boolean") {
			return;
		}
		// spelled out rather than written through the key: a key that names no
		// setting has to write nothing, not fall through to whichever one an
		// else would have picked.
		switch (key) {
			case "interactiveDelimiters":
				return this.plugin.updateSettings({ interactiveDelimiters: value });
			case "colorCodeSection":
				return this.plugin.updateSettings({ colorCodeSection: value });
			default:
				return;
		}
	}

	/** One palette row: the color, and the name that stands for it. */
	private renderPaletteRow(setting: Setting, color: PaletteColor, index: number): void {
		setting.setName("");
		setting.settingEl.addClass("ftc-palette-row");

		setting.addColorPicker(picker => {
			picker.setValue(color.hex)
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
					this.update();
				});
		});

		const commitName: Debouncer<[string], void> = debounce((value: string) => {
			this.pendingNames.delete(index);
			const current = this.entryAt(index);
			if (current == undefined) {
				return;
			}
			this.replaceColor(index, { ...current, name: value })
				.catch(e => console.error("colors: could not save the palette:", e));
		}, RENAME_DELAY, true);

		setting.addText(text => {
			this.bindNameField(text, color, index, commitName);
		});
	}

	private bindNameField(name: TextComponent, color: PaletteColor, index: number, commitName: Debouncer<[string], void>): void {
		name.setValue(color.name)
			.setPlaceholder("Name")
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
		// the row carries no label, the name is shown in the field that edits
		// it, so the field has to say what it is on its own.
		name.inputEl.setAttr("aria-label", "Color name");
		// the name shows itself in its color.
		applyColorStyle(name.inputEl, color.hex);
	}

	private async addColor(): Promise<void> {
		// the palette at click time, not the snapshot the rows were built from:
		// a rename keeps focus and does not redraw, so it lives only in the
		// pending set.
		const palette = this.takePendingNames();
		await this.updatePalette([...palette, { name: nextFreeName(palette), hex: "#ffffff" }]);
		this.update();
	}

	/**
	 * The rows hold their index, so every structural change ends in `update()`
	 *, including the one the user calls off, because obsidian has already
	 * offered the deletion by the time this runs.
	 */
	private async deleteColor(index: number): Promise<void> {
		// awaited, not folded into the delete below: the confirmation sits
		// between the two, and a rename the user then decides not to delete has
		// to survive saying no.
		await this.flushPendingNames();
		const color = this.entryAt(index);
		if (color != undefined && await confirmByModal(this.app,
			`"${color.name}" disappears from the menus. Hexes already in your notes keep rendering.`,
			`Delete color ${color.name}`)) {
			await this.updatePalette(this.plugin.settings.palette.filter((_, i) => i !== index));
		}
		this.update();
	}

	/**
	 * Redrawn before the write lands, unlike the other two: obsidian moves the
	 * keyboard focus to the row at the destination index the moment this
	 * returns, and if the rows have not moved yet that is the row that was
	 * pushed aside, so the next alt+arrow would carry off the wrong color.
	 * `updateSettings` swaps the settings object before it awaits anything, so
	 * the redraw below already reads the new order.
	 */
	private moveColor(from: number, to: number): void {
		// the bounds first, so a move that goes nowhere does not take the
		// pending renames with it and drop them unwritten.
		const palette = this.plugin.settings.palette;
		if (from == to || from < 0 || to < 0 || from >= palette.length || to >= palette.length) {
			return;
		}
		const moved = this.takePendingNames();
		moved.splice(to, 0, ...moved.splice(from, 1));
		this.updatePalette(moved)
			.catch(e => console.error("colors: could not save the palette:", e));
		this.update();
	}

	/**
	 * The palette with every pending rename applied, and the pending set left
	 * empty; the caller folds the result into the one write it was going to
	 * make anyway.
	 *
	 * Letting the renames save themselves instead would put two snapshots of
	 * data.json in flight at once, theirs and the caller's, and nothing
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
	 * takes the first match: the markup would silently get the other hex.
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

	private updatePalette(palette: PaletteColor[]): Promise<void> {
		return this.plugin.updateSettings({ palette });
	}
}
