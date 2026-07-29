/**
 * The two renderers must agree.
 *
 * Live preview parses an incremental document with a lezer grammar; reading
 * mode walks pre-rendered dom with a pair of regexes. Two mechanisms are
 * unavoidable, one definition is not — and every time they drifted apart, a
 * user found it: a stray `=~` wiping a block, a `}` inside colored text, an
 * empty token, markup inside a code fence. This feeds one corpus through both
 * and asserts they render the same characters in the same colors.
 *
 * Scope: single block, no closed code spans. Reading mode receives markdown
 * that has already been rendered to dom, so `<code>` and block splitting are
 * not expressible here; those rules are tested against their own renderers in
 * treeQueries.test.ts, autoHexify.test.ts and postProcessor.test.ts. An
 * unbalanced backtick is expressible: obsidian renders it as the plain text it
 * is, which is exactly the dom this feeds the post processor.
 */
import { EditorState } from "@codemirror/state";
import { textColorParserField } from "src/editor/TextColorStateField";
import { settingsFacet } from "src/editor/SettingsFacet";
import { buildTextColorDecorations } from "src/editor/buildDecorations";
import { textColorPostProcessor } from "src/reading/TextColorPostProcessor";
import { DEFAULT_SETTINGS, FastTextColorPluginSettings } from "src/settings/settings";
import type { MarkdownPostProcessorContext } from "obsidian";
import { setupDom, block, readColoring, hexInStyle, RenderedColoring } from "./support/dom";

beforeAll(setupDom);

const settings: FastTextColorPluginSettings = {
	...structuredClone(DEFAULT_SETTINGS),
	palette: [
		{ name: "red", hex: "#e93147" },
		{ name: "blue", hex: "#086ddd" },
		{ name: "olive", hex: "#808000" },
	],
};

/**
 * Every case is wrapped in plain text so no expression touches position 0,
 * where the default cursor sits: markers stay visible while the cursor is
 * inside them, which is live preview behavior reading mode has no notion of.
 */
const CORPUS = [
	"nothing to colour here",
	"~={red}simple=~",
	"~={#ff8800}a hex literal=~",
	"~={#FF8800}an uppercase hex literal=~",
	"~={olive}a third palette name=~",
	"~={mystery}an unknown name=~",
	"~={red}unclosed to the end",
	"a stray =~ closer",
	"~={red}closed=~=~ then a stray one",
	"~={red}outer ~={blue}inner=~ tail=~",
	"~={red}a}b=~ brace inside the body",
	"~={}empty token=~",
	"~={}empty ~={red}with real markup inside=~ tail=~",
	"~={a b}a token with whitespace=~",
	"~={red}one=~ plain ~={blue}two=~",
	// the grammar swallows everything behind a lone backtick into a
	// `CodeSection`, closing marker included; obsidian renders that backtick as
	// plain text, so the coloring has to look straight through the node.
	"~={red}a `b=~ tail",
	"~={red}a `b ~={blue}c=~ d=~",
	"a lone ` backtick outside any markup",
	"~={red}=~",
	"~={red",
	"trailing ~={red}",
];

describe("live preview and reading mode agree", () => {
	CORPUS.forEach(sample => {
		const doc = `lead ${sample} trail`;

		test(JSON.stringify(sample), () => {
			const live = livePreviewColoring(doc);
			const reading = readingModeColoring(doc);

			expect(live.text).toBe(reading.text);
			expect(live.colors).toEqual(reading.colors);
		});
	});
});

/** What live preview puts on screen: the doc minus hidden markers, colored. */
function livePreviewColoring(doc: string): RenderedColoring {
	const state = EditorState.create({
		doc,
		selection: { anchor: 0 },
		extensions: [textColorParserField, settingsFacet.of(settings)],
	});

	const hidden = new Array<boolean>(doc.length).fill(false);
	const colors = new Array<string | null>(doc.length).fill(null);

	// the editor's own walk, not a copy of it
	buildTextColorDecorations(state, [{ from: 0, to: doc.length }])
		.between(0, doc.length, (from, to, value) => {
			const style = (value.spec as { attributes?: { style?: string } }).attributes?.style;
			for (let i = from; i < to; i++) {
				if (style == undefined) {
					hidden[i] = true;      // a marker replaced by an empty widget
				} else {
					colors[i] = hexInStyle(style);
				}
			}
		});

	const text: string[] = [];
	const visibleColors: (string | null)[] = [];
	for (let i = 0; i < doc.length; i++) {
		if (!hidden[i]) {
			text.push(doc[i]);
			visibleColors.push(colors[i]);
		}
	}

	return { text: text.join(""), colors: visibleColors };
}

/** What reading mode puts on screen, for the same source. */
function readingModeColoring(doc: string): RenderedColoring {
	const el = block();
	const paragraph = el.ownerDocument.createElement("p");
	paragraph.appendChild(el.ownerDocument.createTextNode(doc));
	el.appendChild(paragraph);

	textColorPostProcessor(el, { frontmatter: null } as unknown as MarkdownPostProcessorContext, settings);
	return readColoring(el);
}
