/**
 * Which blocks the coloring has to route around. A marker written into one of
 * these does not just look wrong. It takes the block's own rendering with it:
 * a code fence loses its syntax highlighting, and a `$$` that no longer starts
 * its line stops being math in reading mode while live preview carries on
 * rendering it.
 */
import { protectedBlocks, overlapsProtectedBlock } from "src/syntax";

/** The blocks of a document, as the text they cover. */
function coveredBy(doc: string): string[] {
	return protectedBlocks(doc).map(block => doc.slice(block.from, block.to));
}

describe("code fences", () => {
	test("a fenced block is protected, language and all", () => {
		expect(coveredBy("before\n```c\nint x = 1;\n```\nafter"))
			.toEqual(["```c\nint x = 1;\n```"]);
	});

	test("tildes fence too", () => {
		expect(coveredBy("~~~py\nx = 1\n~~~")).toEqual(["~~~py\nx = 1\n~~~"]);
	});

	test("the other fence character does not close a block", () => {
		expect(coveredBy("```py\n~~~\nx = 1\n```")).toEqual(["```py\n~~~\nx = 1\n```"]);
	});

	test("a longer fence closes a shorter one, a shorter one does not close a longer", () => {
		expect(coveredBy("````\n```\nstill inside\n````")).toEqual(["````\n```\nstill inside\n````"]);
	});

	test("an unclosed fence swallows the rest of the document", () => {
		expect(coveredBy("before\n```py\nx = 1")).toEqual(["```py\nx = 1"]);
	});

	test("two blocks are found separately", () => {
		expect(coveredBy("```\na\n```\nmiddle\n```\nb\n```"))
			.toEqual(["```\na\n```", "```\nb\n```"]);
	});
});

describe("display math", () => {
	test("a $$ block is protected", () => {
		expect(coveredBy("before\n$$\nA^{T}A\n$$\nafter")).toEqual(["$$\nA^{T}A\n$$"]);
	});

	test("a $$ that opens with content on its line still opens a block", () => {
		expect(coveredBy("$$ A^{T}A\n= B $$")).toEqual(["$$ A^{T}A\n= B $$"]);
	});

	/**
	 * `$$x$$` is a math element inside a paragraph, not a block. It takes
	 * markup around it perfectly well, so protecting it would refuse a
	 * coloring that works.
	 */
	test("a $$ closed on its own line is not a block", () => {
		expect(coveredBy("some $$x^2$$ here")).toEqual([]);
		expect(coveredBy("$$x^2$$")).toEqual([]);
	});

	test("inline math is not a block", () => {
		expect(coveredBy("some $x^2$ here")).toEqual([]);
	});
});

describe("one inside the other", () => {
	test("$$ inside a code fence does not open a math block", () => {
		expect(coveredBy("```\n$$\nnot math\n$$\n```")).toEqual(["```\n$$\nnot math\n$$\n```"]);
	});

	test("a fence inside a math block does not open a code block", () => {
		expect(coveredBy("$$\n```\n$$")).toEqual(["$$\n```\n$$"]);
	});
});

describe("overlapsProtectedBlock", () => {
	const doc = "before\n$$\nx\n$$\nafter";
	const blocks = protectedBlocks(doc);

	test("a range clear of every block does not overlap", () => {
		expect(overlapsProtectedBlock(blocks, 0, "before".length)).toBe(false);
	});

	test("a range inside a block overlaps", () => {
		const from = doc.indexOf("x");
		expect(overlapsProtectedBlock(blocks, from, from + 1)).toBe(true);
	});

	test("a caret on the block's own edge overlaps, so nothing is written in front of $$", () => {
		const from = doc.indexOf("$$");
		expect(overlapsProtectedBlock(blocks, from, from)).toBe(true);
	});
});

/**
 * An unclosed `$$` is not a math block. Obsidian renders it as the literal
 * text it is, and a line like `$$5 and rising` opens one: protecting to the
 * end of the document would put every line behind a price out of reach.
 */
describe("an unclosed $$ is not a block", () => {
	test("a price does not swallow the rest of the note", () => {
		expect(coveredBy("$$5 and rising\nordinary prose\nand more of it")).toEqual([]);
	});

	test("a genuinely unclosed math block protects nothing", () => {
		expect(coveredBy("$$\nA^{T}A\nnever closed")).toEqual([]);
	});

	test("an unclosed code fence still swallows the rest", () => {
		expect(coveredBy("```py\nx = 1\nno closing fence")).toEqual(["```py\nx = 1\nno closing fence"]);
	});

	test("a closed block after a stray $$ is still found", () => {
		expect(coveredBy("$$5 a price\n$$\nA\n$$")).toEqual(["$$5 a price\n$$"]);
	});
});
