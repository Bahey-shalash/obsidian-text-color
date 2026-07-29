import { EditorState } from "@codemirror/state";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { textColorParserField } from "src/editor/TextColorStateField";
import { findNameConversions } from "src/editor/AutoHexify";
import { decorateExpression } from "src/editor/ExpressionDecorations";
import { settingsFacet } from "src/editor/SettingsFacet";
import { DEFAULT_SETTINGS } from "src/settings/settings";

const resolve = (id: string) => ({ red: "#e93147", yellow: "#e0ac00" } as Record<string,string>)[id] ?? null;

function stateOf(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [textColorParserField, settingsFacet.of(DEFAULT_SETTINGS)] });
}

test("PROBE autoHexify inside code", () => {
  const cases = ["```\n~={red}hello=~\n```\n", "`~={red}hi=~`", "```js\nlet s = \"~={red}x=~\";\n```"];
  for (const doc of cases) {
    // eslint-disable-next-line no-console
    console.log("AUTOHEX", JSON.stringify(doc), JSON.stringify(findNameConversions(stateOf(doc), [{from:0,to:doc.length}], resolve)));
  }
});

test("PROBE decorateExpression corpus", () => {
  const corpus = [
    "~={red}a=~", "~={red}a", "~={red}", "~={red}a ~={yellow}b=~ c=~", "~={red}a ~={yellow}b",
    "~={red}a=~=~", "~={red}a\n\nb", "~={}x=~", "~={red}a `code` b=~", "~={red}a ` b=~",
    "~={red}~={red}~={red}", "~={red}a=~ ~={red}b=~", "~={#ff0000}x=~", "~={red}$x^2$=~",
    "~={red}a}b=~", "=~ ~={red}a=~", "~={red}\n\n~={yellow}b=~",
  ];
  for (const doc of corpus) {
    const state = stateOf(doc);
    const builder = new RangeSetBuilder<Decoration>();
    const errs: string[] = [];
    state.field(textColorParserField).tree.iterate({
      enter(node) {
        if (node.type.name === "TextColor") return true;
        if (node.type.name === "Expression") {
          try { decorateExpression(node, builder, state); } catch (e) { errs.push(String(e)); }
          return false;
        }
        return false;
      },
    });
    let built = "ok";
    try { builder.finish(); } catch (e) { built = "BUILDER_THROW: " + e; }
    // eslint-disable-next-line no-console
    console.log("DEC", JSON.stringify(doc), "errs=" + JSON.stringify(errs), built);
  }
});
