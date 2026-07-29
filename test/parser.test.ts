import fs from 'fs';
import path from 'path';
import { parser } from "src/parser/textColorLanguageParser";

/** The node names of a parse, in document order. */
function nodeNames(input: string): string[] {
	const names: string[] = [];
	parser.parse(input).iterate({ enter(node) { names.push(node.name); } });
	return names;
}

describe("the grammar parses the sample documents", () => {
	const testCasesDir = path.join(__dirname, 'test-cases');

	fs.readdirSync(testCasesDir).forEach(file => {
		it(`parses ${file} without error nodes`, () => {
			const data = fs.readFileSync(path.join(testCasesDir, file), 'utf8');
			const names = nodeNames(data);

			expect(names[0]).toBe("TextColor");
			expect(names).not.toContain("⚠");
		});
	});
});

describe("the grammar recognises the syntax", () => {
	it("sees a complete expression", () => {
		expect(nodeNames("~={red}text=~")).toEqual(expect.arrayContaining([
			"Expression", "TcLeft", "LMarker", "Description", "Color", "InnerMarker",
			"TcRight", "Text", "Word", "REnd", "RMarker",
		]));
	});

	it("sees a token still being typed as unfinished", () => {
		const names = nodeNames("~={red");
		expect(names).toContain("Unfinished");
		expect(names).not.toContain("Expression");
	});

	it("does not treat a token containing whitespace as a color", () => {
		expect(nodeNames("~={a b}text=~")).not.toContain("Expression");
	});

	it("sees nesting", () => {
		expect(nodeNames("~={red}a ~={blue}b=~ c=~").filter(n => n === "Expression")).toHaveLength(2);
	});
});
