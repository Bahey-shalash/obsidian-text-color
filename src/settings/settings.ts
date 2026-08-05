import { parseHex } from "src/color/InlineColor";

export const SETTINGS_VERSION = "4";

/** One palette entry: a menu name and the hex it stands for. */
export interface PaletteColor {
	name: string;
	hex: string;
}

/**
 * The whole settings model. Rendering is hex-only: notes carry hexes, the
 * palette only maps menu names to them for the menus and the suggester.
 *
 * Invariant, established by `migrateSettings` and relied on everywhere
 * downstream: every stored `hex` is a canonical lowercase hex color. A value
 * that cannot be one is not stored.
 */
export interface FastTextColorPluginSettings {
	version: string;
	palette: PaletteColor[];
	interactiveDelimiters: boolean;
	colorCodeSection: boolean;
}

export const DEFAULT_SETTINGS: FastTextColorPluginSettings = {
	version: SETTINGS_VERSION,
	palette: [
		{ name: "red", hex: "#e93147" },
		{ name: "orange", hex: "#ec7500" },
		{ name: "yellow", hex: "#e0ac00" },
		{ name: "green", hex: "#08b94e" },
		{ name: "cyan", hex: "#00bfbc" },
		{ name: "blue", hex: "#086ddd" },
		{ name: "purple", hex: "#7852ee" },
		{ name: "pink", hex: "#d53984" },
	],
	interactiveDelimiters: true,
	colorCodeSection: false,
};

/** color-1, color-2, ... skipping names that are already taken. */
export function nextFreeName(palette: PaletteColor[]): string {
	let n = palette.length + 1;
	while (palette.some(c => c.name === `color-${n}`)) {
		n++;
	}
	return `color-${n}`;
}

/** What loading had to leave behind, for the caller to report. */
export interface MigrationResult {
	settings: FastTextColorPluginSettings;
	/** palette names dropped because their value is not a color */
	dropped: string[];
	/** `was -> is` for every duplicate palette name that had to be renamed */
	renamed: string[];
}

/**
 * Bring whatever is on disk up to the current model. The plugin has its own
 * id and therefore its own data folder, so there is no old-version data to
 * migrate: this is a sanitizer: what comes out is the current shape, every
 * hex is canonical, and anything that is not a color is dropped and reported
 * rather than stored. (A retired `legacy` map from before the compatibility
 * layer was removed is simply ignored; the next save cleans it from disk.)
 */
export function migrateSettings(raw: unknown): MigrationResult {
	if (raw == null || typeof raw != "object") {
		return { settings: structuredClone(DEFAULT_SETTINGS), dropped: [], renamed: [] };
	}

	const record = raw as Record<string, unknown>;
	const dropped: string[] = [];
	const renamed: string[] = [];

	return {
		settings: {
			version: SETTINGS_VERSION,
			palette: sanitizePalette(record.palette, dropped, renamed),
			interactiveDelimiters: record.interactiveDelimiters !== false,
			colorCodeSection: record.colorCodeSection === true,
		},
		dropped,
		renamed,
	};
}

/**
 * A hand edited data.json must not smuggle non-colors past the boundary.
 *
 * Names have to come out unique as well as present. Two entries under one name
 * leave the second one unreachable (resolving a name takes the first match, so
 * typing it silently gets the other hex) and the settings tab identifies a row
 * by its name, so a duplicate would have two rows claiming to be the same one.
 * The settings tab refuses to create one; this is the same rule applied to what
 * arrives from disk. The color is kept and renamed rather than dropped: it is
 * still a color the user picked, and it stays where it was in the menus.
 */
function sanitizePalette(raw: unknown, dropped: string[], renamed: string[]): PaletteColor[] {
	if (!Array.isArray(raw)) {
		return structuredClone(DEFAULT_SETTINGS.palette);
	}

	const palette: PaletteColor[] = [];
	for (const entry of raw) {
		const name = (entry as PaletteColor)?.name;
		if (typeof name != "string" || name === "") {
			continue;
		}
		const hex = parseHex((entry as PaletteColor)?.hex);
		if (hex == null) {
			dropped.push(name);
			continue;
		}
		if (palette.some(c => c.name === name)) {
			const free = nextFreeName(palette);
			renamed.push(`${name} -> ${free}`);
			palette.push({ name: free, hex });
			continue;
		}
		palette.push({ name, hex });
	}
	return palette;
}
