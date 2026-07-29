/**
 * The decoration walk, at the level the view plugin uses it.
 *
 * `syntaxConformance.test.ts` checks what ends up on screen; this checks that
 * the walk stays inside the expression it was handed. A walk that runs on into
 * the following siblings still produces the right pixels — it decorates the
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

function stateOf(doc: string): EditorState {
	return EditorState.create({
		doc,
		selection: { anchor: 0 },
		extensions: [textColorParserField, settingsFacet.of(DEFAULT_SETTINGS)],
	});
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
