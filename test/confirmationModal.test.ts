import type { App } from "obsidian";
import { App as FakeApp, __buttons, __modals, __resetRecorders } from "./__mocks__/obsidian";
import { confirmByModal } from "src/ui/ConfirmationModal";

/**
 * The promise has to settle however the modal goes away.
 *
 * It used to settle only on the two buttons, while a polling loop waited for
 * a flag those buttons set. Escape, a click outside and the titlebar close
 * button all bypass them, so any of those left the caller — "convert the
 * entire vault", every palette delete — suspended forever, with a 60 Hz timer
 * still running for the rest of the session.
 */
describe("confirmByModal", () => {
	beforeEach(__resetRecorders);

	/** the mock stands in for the real App, which the modal never touches */
	const app = () => new FakeApp() as unknown as App;
	const press = (text: string) => __buttons.find(b => b.text === text)?.click();
	/** what obsidian does on Escape, a click outside, or the titlebar X */
	const dismiss = () => __modals[__modals.length - 1].close();

	test("OK resolves true", async () => {
		const answer = confirmByModal(app(), "sure?", "Confirm");
		press("OK");
		await expect(answer).resolves.toBe(true);
	});

	test("Cancel resolves false", async () => {
		const answer = confirmByModal(app(), "sure?", "Confirm");
		press("Cancel");
		await expect(answer).resolves.toBe(false);
	});

	test("a dismissal that is not a button resolves false", async () => {
		const answer = confirmByModal(app(), "sure?", "Confirm");
		dismiss();
		await expect(answer).resolves.toBe(false);
	});

	test("OK closes the modal instead of leaving it on screen", async () => {
		const answer = confirmByModal(app(), "sure?", "Confirm");
		press("OK");
		await answer;

		// closed already: dismissing again is a no-op and cannot settle twice
		expect(() => dismiss()).not.toThrow();
		await expect(answer).resolves.toBe(true);
	});

	test("the default question is used when none is given", async () => {
		const answer = confirmByModal(app());
		dismiss();
		await expect(answer).resolves.toBe(false);
	});
});
