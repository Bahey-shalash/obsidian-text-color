/**
 * The decoration walk, at the level the view plugin uses it.
 *
 * `syntaxConformance.test.ts` checks what ends up on screen; this checks that
 * the walk stays inside the expression it was handed. A walk that runs on into
 * the following siblings still produces the right pixels: it decorates the
 * next expression early, and the builder then throws on the duplicate, which
 * `buildTextColorDecorations` catches and logs. Right by accident, and only
 * until the layout changes, so it is asserted directly here.
 */
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { textColorParserField } from "src/editor/TextColorStateField";
import { settingsFacet } from "src/editor/SettingsFacet";
import { decorateExpression } from "src/editor/ExpressionDecorations";
import { buildTextColorDecorations } from "src/editor/buildDecorations";
import { DEFAULT_SETTINGS } from "src/settings/settings";

function stateOf(doc: string, colorCodeSection = false): EditorState {
	return EditorState.create({
		doc,
		selection: { anchor: 0 },
		extensions: [
			textColorParserField,
			settingsFacet.of({ ...DEFAULT_SETTINGS, colorCodeSection }),
		],
	});
}

const RED = DEFAULT_SETTINGS.palette[0].hex;

/** What the decorations say about a document: hidden markers and colored runs. */
function renderedOf(doc: string, colorCodeSection = false): string[] {
	const rendered: string[] = [];
	buildTextColorDecorations(stateOf(doc, colorCodeSection), [{ from: 0, to: doc.length }])
		.between(0, doc.length, (from, to, value) => {
			const style = (value.spec as { attributes?: { style?: string } }).attributes?.style;
			const hex = style == undefined ? "hidden" : /--ftc-color:\s*(#[0-9a-f]+)/.exec(style)?.[1];
			rendered.push(`${JSON.stringify(doc.slice(from, to))} ${hex}`);
		});
	return rendered;
}

/** The top level expression nodes of a document, in order. */
function expressionsOf(state: EditorState): SyntaxNode[] {
	const found: SyntaxNode[] = [];
	state.field(textColorParserField).tree.iterate({
		enter(node) {
			if (node.type.name != "Expression") {
				return true;
			}
			found.push(node.node);
			return false;
		},
	});
	return found;
}

describe("decorateExpression stays inside its expression", () => {
	test("a later expression is left for its own turn", () => {
		const doc = "lead ~={#ff0000}one=~ plain ~={#00ff00}two=~ trail";
		const state = stateOf(doc);
		const [first, second] = expressionsOf(state);
		expect(second.from).toBeGreaterThan(first.to); // the layout the test needs

		const builder = new RangeSetBuilder<Decoration>();
		decorateExpression(first, builder, state);

		// nothing the first expression produced may reach into the second
		const ends: number[] = [];
		builder.finish().between(0, doc.length, (_from, to) => { ends.push(to); });
		expect(ends.length).toBeGreaterThan(0);
		expect(Math.max(...ends)).toBeLessThanOrEqual(first.to);
	});

	test("two expressions in one document both get decorated, without errors", () => {
		const doc = "lead ~={#ff0000}one=~ plain ~={#00ff00}two=~ trail";
		const state = stateOf(doc);

		const errors: unknown[] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => { errors.push(args); };
		let styles: string[] = [];
		try {
			styles = stylesOf(buildTextColorDecorations(state, [{ from: 0, to: doc.length }]), doc.length);
		} finally {
			console.error = original;
		}

		expect(errors).toEqual([]);
		expect(styles).toContain("#ff0000");
		expect(styles).toContain("#00ff00");
	});
});

/**
 * Only a code section that closes its backtick is literal code. An unbalanced
 * one is plain text in obsidian, and the grammar puts the whole rest of the
 * line inside it: the enclosing color's closing marker included. Skipping it
 * left that `=~` on screen and the color running on past its own end, which
 * `syntaxConformance.test.ts` catches as the two renderers disagreeing; the
 * `colorCodeSection` half of the rule is not expressible there, so it is here.
 */
describe("code sections", () => {
	test("an unbalanced backtick does not swallow the closing marker", () => {
		expect(renderedOf("lead ~={red}a `b=~ trail")).toEqual([
			'"~={red}" hidden',
			`"a " ${RED}`,
			`"\`b" ${RED}`,
			'"=~" hidden',
		]);
	});

	test("the setting has no say over text an unbalanced backtick only looks like code", () => {
		expect(renderedOf("lead ~={red}a `b=~ trail", true))
			.toEqual(renderedOf("lead ~={red}a `b=~ trail", false));
	});

	test("markup inside an unbalanced backtick still nests", () => {
		expect(renderedOf("lead ~={red}a `b ~={blue}c=~ d=~ trail")).toEqual([
			'"~={red}" hidden',
			`"a " ${RED}`,
			`"\`b " ${RED}`,
			'"~={blue}" hidden',
			`"c" ${DEFAULT_SETTINGS.palette[5].hex}`,
			'"=~" hidden',
			`" d" ${RED}`,
			'"=~" hidden',
		]);
	});

	test("a closed code span is left alone unless the setting says otherwise", () => {
		expect(renderedOf("lead ~={red}a `b` c=~ trail")).toEqual([
			'"~={red}" hidden',
			`"a " ${RED}`,
			`" c" ${RED}`,
			'"=~" hidden',
		]);
	});

	/**
	 * The grammar only knows single backticks, so a ``` fence reaches the walk
	 * as an ordinary pair of them and the whole body of the block looks like
	 * one inline code span. `colorCodeSection` is a setting about inline code;
	 * letting it repaint a fenced block takes obsidian's syntax highlighting
	 * with it.
	 */
	test("a fenced block is never colored, whatever the setting says", () => {
		const doc = "~={red}\n```c\nint main(){\nreturn 0;\n}\n```\n=~";
		const body = ["int main(){", "return 0;", "}", "```c"];

		for (const colorCodeSection of [false, true]) {
			const colored = renderedOf(doc, colorCodeSection)
				.filter(entry => !entry.endsWith("hidden"))
				.join("\n");
			body.forEach(line => expect(colored).not.toContain(line));
		}
	});

	test("a closed code span is colored as one piece when the setting is on", () => {
		expect(renderedOf("lead ~={red}a `b` c=~ trail", true)).toEqual([
			'"~={red}" hidden',
			`"a " ${RED}`,
			`"\`b\`" ${RED}`,
			`" c" ${RED}`,
			'"=~" hidden',
		]);
	});
});

function stylesOf(set: ReturnType<typeof buildTextColorDecorations>, length: number): string[] {
	const hexes: string[] = [];
	set.between(0, length, (_from, _to, value) => {
		const style = (value.spec as { attributes?: { style?: string } }).attributes?.style;
		const hex = style == undefined ? null : /--ftc-color:\s*(#[0-9a-f]+)/.exec(style)?.[1];
		if (hex != null && hex != undefined) {
			hexes.push(hex);
		}
	});
	return hexes;
}

/**
 * `=~` and `~={` want the same `~`.
 *
 * Obsidian's own markup is what puts them next to each other: highlighting
 * colored text writes `==~={red}text=~==`, where the first `=` of the
 * highlight sits against the opening marker. Taking that `~` for a closing
 * marker deletes the opener, and live preview showed the raw markup while
 * reading mode (which never sees the `==`, obsidian having consumed it)
 * rendered the color. The opener takes it; see `parser/closeMarker.ts`.
 */
describe("an equals in front of an opening marker", () => {
	test("a highlight around the markup still colors", () => {
		expect(renderedOf("lead ==~={red}hello=~== trail")).toEqual([
			'"~={red}" hidden',
			`"hello" ${RED}`,
			'"=~" hidden',
		]);
	});

	test("a plain equals in front of the opener is ordinary text", () => {
		expect(renderedOf("lead x=~={red}hello=~ trail")).toEqual([
			'"~={red}" hidden',
			`"hello" ${RED}`,
			'"=~" hidden',
		]);
	});

	test("a real closing marker is still one", () => {
		expect(renderedOf("lead ~={red}hello=~=~ trail")).toEqual([
			'"~={red}" hidden',
			`"hello" ${RED}`,
			'"=~" hidden',
		]);
	});
});

/**
 * Blocks that render themselves, in the decorator.
 *
 * Reading mode skips a whole section whose source is a code or math block, so
 * decorating inside one here is how the two renderers end up disagreeing about
 * the same note. The guard has to hold for the runs marked inside an unbalanced
 * code section too: those are not tree nodes, and one can start in ordinary
 * text and carry straight on through a fence.
 */
describe("blocks are never decorated", () => {
	test("markup inside a $$ block is left alone, as reading mode leaves it", () => {
		expect(renderedOf("$$\n~={red}x=~\n$$")).toEqual([]);
	});

	test("markup inside a ``` block is left alone", () => {
		expect(renderedOf("```c\n~={red}int x;=~\n```")).toEqual([]);
	});

	test("a run reaching into a fence stops at its edge", () => {
		const rendered = renderedOf("~={red}a `b\n~~~\ncode\n~~~\ntail=~");
		expect(rendered.some(entry => entry.includes("code"))).toBe(false);
		expect(rendered.some(entry => entry.includes("~~~"))).toBe(false);
		expect(rendered).toContain(`"a " ${RED}`);
	});

	test("prose on the far side of a fence is still colored", () => {
		expect(renderedOf("lead ~={red}hello=~ trail")).toEqual([
			'"~={red}" hidden',
			`"hello" ${RED}`,
			'"=~" hidden',
		]);
	});
});
