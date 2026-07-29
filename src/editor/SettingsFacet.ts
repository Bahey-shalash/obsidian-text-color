import { Facet } from '@codemirror/state';
import { DEFAULT_SETTINGS, FastTextColorPluginSettings } from "src/settings/settings";

/**
 * The settings, as seen from inside an editor.
 *
 * Settings objects are immutable: a change produces a new object, so the
 * facet value's identity is what tells the view plugin that it has to redraw.
 * Mutating settings in place would make a change undetectable here.
 */
export const settingsFacet = Facet.define<FastTextColorPluginSettings, FastTextColorPluginSettings>({
	combine: inputs => inputs.length > 0 ? inputs[inputs.length - 1] : DEFAULT_SETTINGS,
});
