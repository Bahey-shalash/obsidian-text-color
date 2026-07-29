// Minimal stand-ins so modules that pull in the obsidian API can be unit tested.
// The obsidian package ships types only, there is no runtime module to resolve.

export class App { }
export class Notice { }
export class Menu { }
export class Plugin { }
export class PluginSettingTab { }
export class ColorComponent { }
export class TextComponent { }
export class Editor { }
export class MarkdownView { }
export function normalizePath(path: string): string { return path; }

/** Just enough element to let a modal build its content. */
class StubEl {
	children: StubEl[] = [];
	text = "";

	createEl(tag: string, opts?: { text?: string }): StubEl { return this.child(opts?.text); }
	createDiv(opts?: { text?: string }): StubEl { return this.child(opts?.text); }
	empty(): void { this.children = []; }
	addClass(): void { /* no-op */ }
	setText(text: string): void { this.text = text; }

	private child(text?: string): StubEl {
		const el = new StubEl();
		el.text = text ?? "";
		this.children.push(el);
		return el;
	}
}

/**
 * Modals in obsidian close through one funnel: `close()` runs `onClose()`,
 * whether the user pressed a button, hit Escape, clicked outside or used the
 * titlebar. The mock reproduces exactly that, so a test can dismiss a modal
 * the way a user does.
 */
export class Modal {
	contentEl = new StubEl() as unknown as HTMLElement;
	private opened = false;

	constructor(readonly app: App) {
		__modals.push(this);
	}

	open(): void {
		this.opened = true;
		this.onOpen();
	}

	close(): void {
		if (!this.opened) {
			return;
		}
		this.opened = false;
		this.onClose();
	}

	onOpen(): void { /* overridden */ }
	onClose(): void { /* overridden */ }
}

/** Modals constructed during the current test, in creation order. */
export const __modals: Modal[] = [];

/** Buttons created by any `Setting` in the current test, in creation order. */
export const __buttons: ButtonComponent[] = [];

/** Forget everything recorded so far; call from beforeEach. */
export function __resetRecorders(): void {
	__modals.length = 0;
	__buttons.length = 0;
}

export class ButtonComponent {
	text = "";
	private handler?: () => unknown;

	setButtonText(text: string): this { this.text = text; return this; }
	setCta(): this { return this; }
	setIcon(): this { return this; }
	setTooltip(): this { return this; }
	onClick(handler: () => unknown): this { this.handler = handler; return this; }

	/** test helper: press this button */
	click(): void { this.handler?.(); }
}

export class Setting {
	constructor(containerEl?: unknown) { /* content is not inspected */ }

	setName(): this { return this; }
	setDesc(): this { return this; }
	setHeading(): this { return this; }

	addButton(cb: (btn: ButtonComponent) => unknown): this {
		const btn = new ButtonComponent();
		__buttons.push(btn);
		cb(btn);
		return this;
	}
}
