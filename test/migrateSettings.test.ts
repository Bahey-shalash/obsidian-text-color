import { migrateSettings, DEFAULT_SETTINGS, SETTINGS_VERSION } from "src/settings/settings";

/**
 * The plugin has its own id and therefore its own data folder, so there is
 * no old-version data to migrate: loading is a sanitizer. Whatever is on
 * disk, what comes out is the current shape, every stored hex is canonical,
 * and anything that is not a color is dropped and reported, never stored.
 */
describe("migrateSettings", () => {
	test("null and garbage yield the defaults", () => {
		expect(migrateSettings(null).settings).toEqual(DEFAULT_SETTINGS);
		expect(migrateSettings("junk").settings).toEqual(DEFAULT_SETTINGS);
	});

	test("a current data.json passes through, canonicalized", () => {
		const raw = { version: SETTINGS_VERSION, palette: [{ name: "x", hex: "#ABCDEF" }], colorCodeSection: true };
		const { settings, dropped } = migrateSettings(raw);
		expect(settings.palette).toEqual([{ name: "x", hex: "#abcdef" }]);
		expect(settings.colorCodeSection).toBe(true);
		expect(settings.interactiveDelimiters).toBe(true);
		expect(dropped).toEqual([]);
	});

	test("a missing or malformed palette falls back to the default one", () => {
		expect(migrateSettings({ version: SETTINGS_VERSION }).settings.palette).toEqual(DEFAULT_SETTINGS.palette);
		expect(migrateSettings({ version: SETTINGS_VERSION, palette: "nope" }).settings.palette).toEqual(DEFAULT_SETTINGS.palette);
	});

	test("a hand edited data.json cannot smuggle a non-hex in", () => {
		const raw = {
			version: SETTINGS_VERSION,
			palette: [
				{ name: "ok", hex: "#ABCDEF" },
				{ name: "sneaky", hex: "red; background-image: url(https://example.com/beacon)" },
				{ name: "", hex: "#000000" },
			],
		};
		const { settings, dropped } = migrateSettings(raw);
		expect(settings.palette).toEqual([{ name: "ok", hex: "#abcdef" }]);
		expect(dropped).toEqual(["sneaky"]);
	});

	/**
	 * A name is how the menus and the settings tab tell two colors apart, and
	 * resolving one takes the first match; a second entry under the same name
	 * is a color nothing can reach. Renamed rather than dropped, so the color
	 * itself survives.
	 */
	test("a duplicate palette name is renamed, and the color kept", () => {
		const raw = {
			version: SETTINGS_VERSION,
			palette: [
				{ name: "red", hex: "#ff0000" },
				{ name: "red", hex: "#aa0000" },
				{ name: "color-2", hex: "#00ff00" },
			],
		};
		const { settings, renamed } = migrateSettings(raw);
		expect(settings.palette).toEqual([
			{ name: "red", hex: "#ff0000" },
			{ name: "color-2", hex: "#aa0000" },
			{ name: "color-3", hex: "#00ff00" },
		]);
		expect(renamed).toEqual(["red -> color-2", "color-2 -> color-3"]);
	});

	test("a retired legacy map is ignored, not carried along", () => {
		const raw = { version: SETTINGS_VERSION, palette: [{ name: "x", hex: "#123456" }], legacy: { red: "#e93147" } };
		const { settings } = migrateSettings(raw);
		expect("legacy" in settings).toBe(false);
		expect(settings.palette).toEqual([{ name: "x", hex: "#123456" }]);
	});

	test("toggles keep their stored values", () => {
		const raw = { version: SETTINGS_VERSION, interactiveDelimiters: false, colorCodeSection: true };
		const out = migrateSettings(raw).settings;
		expect(out.interactiveDelimiters).toBe(false);
		expect(out.colorCodeSection).toBe(true);
	});
});
