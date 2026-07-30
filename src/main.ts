import {
	Editor,
	MarkdownView,
	Menu,
	Notice,
	Plugin,
} from 'obsidian';
import { Prec, Extension } from "@codemirror/state";
import { keymap, EditorView } from '@codemirror/view';

import { DEFAULT_SETTINGS, FastTextColorPluginSettings, migrateSettings, SETTINGS_VERSION } from 'src/settings/settings';
import { FastTextColorPluginSettingTab } from 'src/settings/SettingsTab';
import { textColorParserField } from 'src/editor/TextColorStateField';
import { textColorViewPlugin } from 'src/editor/TextColorViewPlugin';
import { autoHexify } from 'src/editor/AutoHexify';
import { settingsFacet } from 'src/editor/SettingsFacet';
import { insertColor, removeColor, jumpOutOfColor } from 'src/editor/TextColorFunctions';
import { textColorPostProcessor } from 'src/reading/TextColorPostProcessor';
import { ColorSuggestModal } from 'src/ui/ColorSuggestModal';
import { CustomColorModal } from 'src/ui/CustomColorModal';

/**
 * Plugin shell: wires the editor extensions, the reading mode post processor,
 * commands, menus and settings together. The actual behavior lives in the
 * color/, editor/, reading/, syntax/ and ui/ modules.
 */
export default class FastTextColorPlugin extends Plugin {
	settings!: FastTextColorPluginSettings;

	/** hex of the color applied last, seeding "apply latest" and the picker. */
	private lastUsedHex!: string;

	/**
	 * The settings as the editors see them. Registered as an array and then
	 * rewritten in place: obsidian rebuilds every editor's configuration from
	 * this array, so an editor opened after a settings change gets the current
	 * value too. Handing `settingsFacet.of(this.settings)` to
	 * `registerEditorExtension` directly would freeze the settings of every
	 * future editor at the ones loaded at startup.
	 */
	private editorSettings: Extension[] = [];

	async onload() {
		await this.loadSettings();
		this.lastUsedHex = this.settings.palette[0]?.hex ?? "#ff0000";

		this.registerEditorExtension(textColorParserField);
		this.registerEditorExtension(textColorViewPlugin);
		this.registerEditorExtension(autoHexify);
		this.registerMarkdownPostProcessor((el, ctx) => textColorPostProcessor(el, ctx, this.settings), -1000);

		// makes the settings available inside the editor extensions.
		this.editorSettings = [settingsFacet.of(this.settings)];
		this.registerEditorExtension(this.editorSettings);

		this.registerEditorExtension(
			Prec.high(keymap.of([{
				key: "Tab",
				run: (view) => {
					const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
					return editor ? jumpOutOfColor(view, editor) : false;
				},
			}]))
		);

		this.registerCommands();
		this.registerContextMenu();
		this.addSettingTab(new FastTextColorPluginSettingTab(this.app, this));
	}

	// ----------------------------------------------------------------------
	//                              commands
	// ----------------------------------------------------------------------

	private registerCommands(): void {
		this.addCommand({
			id: 'change-color',
			name: 'Change text color',
			editorCallback: (editor: Editor) => this.openSuggester(editor),
		});

		this.addCommand({
			id: 'apply-custom-color',
			name: 'Apply custom color (hex)',
			editorCallback: (editor: Editor) => this.openCustomPicker(editor),
		});

		this.addCommand({
			id: 'apply-latest-color',
			name: 'Apply latest color',
			editorCallback: (editor: Editor) => insertColor(this.lastUsedHex, editor),
		});

		this.addCommand({
			id: 'remove-color',
			name: 'Remove text color',
			editorCallback: (editor, view) => {
				const editorView = editorViewOf(view);
				if (editorView) {
					removeColor(editor, editorView);
				}
			},
		});

	}

	private registerContextMenu(): void {
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				if (editor.getSelection() == '') {
					return;
				}
				menu.addItem((item) => {
					item.setSection("selection")
						.setTitle("Color")
						.setIcon("palette");
					// @ts-ignore setSubmenu is not in the public api
					const submenu: Menu = item.setSubmenu();

					this.settings.palette.forEach(color => {
						submenu.addItem((subitem) => {
							subitem.setTitle(color.name)
								.setIcon("circle")
								.onClick(() => this.applyColor(color.hex, editor));
						});
					});

					submenu.addItem((subitem) => {
						subitem.setTitle("Custom...")
							.setIcon("pipette")
							.onClick(() => this.openCustomPicker(editor));
					});

					submenu.addItem((subitem) => {
						subitem.setTitle("remove")
							.setIcon("ban")
							.onClick(() => {
								const editorView = editorViewOf(view);
								if (editorView) {
									removeColor(editor, editorView);
								}
							});
					});
				});
			})
		);
	}

	private applyColor(hex: string, editor: Editor): void {
		this.lastUsedHex = hex;
		insertColor(hex, editor);
	}

	private openSuggester(editor: Editor): void {
		if (this.settings.palette.length == 0) {
			new Notice("The palette is empty. Add colors in the settings.");
			return;
		}
		new ColorSuggestModal(this.app, this.settings.palette, editor,
			(color) => { this.lastUsedHex = color.hex; }).open();
	}

	private openCustomPicker(editor: Editor): void {
		new CustomColorModal(this.app, this.lastUsedHex, editor.getSelection(), (hex) => {
			this.lastUsedHex = hex;
			insertColor(hex, editor);
		}).open();
	}

	// ----------------------------------------------------------------------
	//                          settings plumbing
	// ----------------------------------------------------------------------

	async loadSettings() {
		const raw = await this.loadData();
		const { settings, dropped } = migrateSettings(raw ?? DEFAULT_SETTINGS);
		this.settings = settings;

		if (dropped.length > 0) {
			console.warn(`colors: dropped ${dropped.length} setting(s) whose value is not a color: ${dropped.join(", ")}`);
		}

		const stored = raw as { version?: string, legacy?: unknown } | null;
		if (stored?.version !== SETTINGS_VERSION || stored?.legacy != undefined || dropped.length > 0) {
			await this.saveData(this.settings);
		}
	}

	/**
	 * The only way settings change. A new object replaces the old one, which
	 * is what makes the change visible to every editor: the facet compares by
	 * identity, so an in place edit would be invisible to it.
	 */
	async updateSettings(update: Partial<FastTextColorPluginSettings>): Promise<void> {
		this.settings = { ...this.settings, ...update };
		await this.saveData(this.settings);
		this.refreshViews();
	}

	/**
	 * Push the current settings into every markdown view: the open ones through
	 * a reconfigure, the ones opened later through the registered array they
	 * are built from.
	 */
	private refreshViews(): void {
		this.editorSettings.length = 0;
		this.editorSettings.push(settingsFacet.of(this.settings));
		this.app.workspace.updateOptions();

		// reading mode renders once and keeps the result; it has to be
		// asked to render again with the new settings.
		this.app.workspace.getLeavesOfType("markdown").forEach(leaf => {
			const view = leaf.view as MarkdownView;
			if (view.getMode?.() === "preview") {
				view.previewMode?.rerender(true);
			}
		});
	}
}

/** The underlying CodeMirror view of a markdown view; not in the public api. */
function editorViewOf(view: MarkdownView | { editor?: Editor } | null): EditorView | null {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- editor.cm is not in the public api
	return ((view?.editor as any)?.cm as EditorView) ?? null;
}
