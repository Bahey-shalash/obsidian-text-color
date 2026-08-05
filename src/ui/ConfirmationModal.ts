import { App, Modal, Setting } from "obsidian";

/**
 * Yes/no, as a promise.
 *
 * Every way out of a modal (the buttons, Escape, a click outside, the close
 * button) ends in `onClose`, so that is the single place the promise is
 * settled. Anything else has to be kept in sync with obsidian's dismissal
 * paths, and the paths it misses hang the caller forever.
 */
class ConfirmationModal extends Modal {
	private confirmed = false;

	constructor(
		app: App,
		private readonly message: string,
		private readonly heading: string,
		private readonly settle: (confirmed: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl("h1", { text: this.heading });
		contentEl.createDiv({ text: this.message });

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText("OK")
				.setCta()
				.onClick(() => {
					this.confirmed = true;
					this.close();
				}))
			.addButton(btn => btn
				.setButtonText("Cancel")
				.onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
		this.settle(this.confirmed);
	}
}

/** Ask the user to confirm. Any dismissal that is not OK means no. */
export function confirmByModal(app: App, message = '', heading = ''): Promise<boolean> {
	return new Promise<boolean>(resolve => {
		let settled = false;
		const settle = (confirmed: boolean) => {
			if (!settled) {
				settled = true;
				resolve(confirmed);
			}
		};

		new ConfirmationModal(app,
			message !== '' ? message : "Are you sure?",
			heading !== '' ? heading : "Confirm",
			settle).open();
	});
}
