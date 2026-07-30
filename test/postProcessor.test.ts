/**
 * Reading mode rendering tests, against a real dom.
 */
import { textColorPostProcessor } from "src/reading/TextColorPostProcessor";
import { DEFAULT_SETTINGS, FastTextColorPluginSettings } from "src/settings/settings";
import type { MarkdownPostProcessorContext } from "obsidian";
import { setupDom, block, readColoring } from "./support/dom";

beforeAll(setupDom);

// the default palette already maps red and blue to the hexes asserted below.
const settings: FastTextColorPluginSettings = structuredClone(DEFAULT_SETTINGS);

function render(html: string): HTMLElement {
	const el = block(html);
	textColorPostProcessor(el, { frontmatter: null } as unknown as MarkdownPostProcessorContext, settings);
	return el;
}

/**
 * Sections obsidian renders itself.
 *
 * This processor runs before the section reaches mathjax or the code
 * highlighter, so the dom holds no `<pre>` or `<code>` to recognise one by —
 * only the source says what it is. A span written into a math block becomes
 * part of the latex mathjax is handed, which it renders as a parse error: the
 * whole block comes back as the serialized `<span style="...">` as text.
 */
describe("blocks that render themselves", () => {
	function renderSection(html: string, source: string): HTMLElement {
		const el = block(html);
		const context = {
			frontmatter: null,
			getSectionInfo: () => ({ text: source, lineStart: 0, lineEnd: source.split("\n").length - 1 }),
		} as unknown as MarkdownPostProcessorContext;
		textColorPostProcessor(el, context, settings);
		return el;
	}

	test("a math block is left exactly as it was", () => {
		const source = "$$\n~={red}A^{T}A=~\n$$";
		const el = renderSection(`<p>${source}</p>`, source);
		expect(el.querySelector("span")).toBeNull();
		expect(el.textContent).toBe(source);
	});

	test("a fenced code block is left exactly as it was", () => {
		const source = "```c\n~={red}int main(){}=~\n```";
		const el = renderSection(`<p>${source}</p>`, source);
		expect(el.querySelector("span")).toBeNull();
		expect(el.textContent).toBe(source);
	});

	test("an ordinary paragraph is still colored", () => {
		const source = "~={red}hello=~";
		const el = renderSection(`<p>${source}</p>`, source);
		expect(spanWith(el, "#e93147")?.textContent).toBe("hello");
	});
});

/** the span carrying this hex, wherever it is */
function spanWith(el: HTMLElement, hex: string): HTMLElement | null {
	return Array.from(el.querySelectorAll("span")).find(s =>
		s.getAttribute("style")?.includes(`--ftc-color: ${hex}`)) as HTMLElement ?? null;
}

describe("reading mode basics", () => {
	test("a known name renders as its hex, inline", () => {
		const el = render("<p>~={red}hello=~</p>");
		expect(spanWith(el, "#e93147")?.textContent).toBe("hello");
	});

	test("hex literal becomes an inline styled span", () => {
		const el = render("<p>~={#ff8800}hello=~</p>");
		expect(el.querySelector("span")?.getAttribute("style")).toContain("--ftc-color: #ff8800;");
	});

	test("nested literal and named colors", () => {
		const el = render("<p>plain ~={#ff8800}outer ~={blue}inner=~ tail=~ done</p>");
		const outer = el.querySelector("p > span");
		expect(outer?.getAttribute("style")).toContain("#ff8800");
		expect(spanWith(el, "#086ddd")?.textContent).toBe("inner");
	});
});

describe("stray closing delimiter (upstream known issue)", () => {
	test("a lone =~ stays plain text", () => {
		const el = render("<p>stray =~ here</p>");
		expect(el.textContent).toBe("stray =~ here");
		expect(el.querySelector("span")).toBeNull();
	});

	test("markup after a stray =~ still gets colored", () => {
		const el = render("<p>stray =~ here ~={red}ok=~</p>");
		expect(spanWith(el, "#e93147")?.textContent).toBe("ok");
		expect(el.textContent).toBe("stray =~ here ok");
	});
});

describe("colors do not escape block elements (#60, #55)", () => {
	test("table cells stay intact when a color is left open in one cell", () => {
		const el = render("<table><tbody><tr><td>~={red}start</td><td>end=~ tail</td></tr></tbody></table>");
		// structure preserved: two sibling cells, no cell nested inside a span
		expect(el.querySelectorAll("td")).toHaveLength(2);
		expect(el.querySelector("span td")).toBeNull();
		// the open color colors its own cell only
		expect(spanWith(el.querySelectorAll("td")[0] as HTMLElement, "#e93147")?.textContent).toBe("start");
		expect(el.querySelectorAll("td")[1].querySelector("span")).toBeNull();
	});

	test("paragraphs stay siblings when a color spans blocks", () => {
		const el = render("<p>~={red}start</p><p>end=~ tail</p>");
		expect(el.querySelectorAll("div > p, p")).toHaveLength(2);
		expect(el.querySelector("span p")).toBeNull();
		expect(spanWith(el.querySelectorAll("p")[0] as HTMLElement, "#e93147")?.textContent).toBe("start");
	});

	test("inline elements still move into the color", () => {
		const el = render("<p>~={red}before <a href=\"x\">link</a> after=~ done</p>");
		const span = spanWith(el, "#e93147");
		expect(span?.querySelector("a")?.textContent).toBe("link");
		expect(span?.textContent).toBe("before link after");
	});

	test("prefix without suffix colors to the end of its block", () => {
		const el = render("<p>~={red}colored to end</p>");
		expect(spanWith(el, "#e93147")?.textContent).toBe("colored to end");
	});
});

/**
 * A color that opens inside an inline element and closes outside it cannot be
 * one span: adopting the text that follows would render it bold, italic or
 * linked when the source never said so. The color continues as a second span
 * at the level the text actually lives at.
 */
describe("a color that outlives the element it opened in", () => {
	test("text after the element is colored but not bolded", () => {
		// source: **~={red}bold** normal=~ tail
		const el = render("<p><strong>~={red}bold</strong> normal=~ tail</p>");

		expect(el.textContent).toBe("bold normal tail");
		expect(el.querySelector("strong")?.textContent).toBe("bold");

		const { text, colors } = readColoring(el);
		expect(text).toBe("bold normal tail");
		expect(colors.slice(0, "bold normal".length)).toEqual(
			new Array("bold normal".length).fill("#e93147"));
		expect(colors.slice("bold normal".length)).toEqual([null, null, null, null, null]);
	});

	test("an outer color still covers what follows the inner one", () => {
		// source: **~={red}a ~={blue}b** c=~ d=~
		const el = render("<p><strong>~={red}a ~={blue}b</strong> c=~ d=~</p>");

		const { text, colors } = readColoring(el);
		expect(text).toBe("a b c d");
		// "a " red, "b" blue, " c" still blue, " d" back to red — none of it plain
		expect(colors).toEqual([
			"#e93147", "#e93147",
			"#086ddd",
			"#086ddd", "#086ddd",
			"#e93147", "#e93147",
		]);
	});

	test("markup behind the closing marker is still rendered", () => {
		// source: *~={red}a* b=~ c ~={blue}d=~ e
		const el = render("<p><em>~={red}a</em> b=~ c ~={blue}d=~ e</p>");

		expect(el.textContent).toBe("a b c d e");
		expect(el.querySelector("em")?.textContent).toBe("a");
		expect(spanWith(el, "#086ddd")?.textContent).toBe("d");
	});
});

describe("code is never colored", () => {
	test("inline code keeps the markup literal", () => {
		const el = render("<p>see <code>~={red}sample=~</code> here</p>");
		expect(el.querySelector("code")?.textContent).toBe("~={red}sample=~");
		expect(el.querySelector("code span")).toBeNull();
	});

	test("a fenced block keeps the markup literal", () => {
		const el = render("<pre><code>~={red}sample=~\n</code></pre>");
		expect(el.querySelector("pre")?.textContent).toBe("~={red}sample=~\n");
		expect(el.querySelector("pre span")).toBeNull();
	});
});

describe("token edge cases", () => {
	test("a } inside the colored text matches live preview", () => {
		const el = render("<p>~={red}a}b=~</p>");
		expect(spanWith(el, "#e93147")?.textContent).toBe("a}b");
	});

	test("an empty token is not markup", () => {
		const el = render("<p>~={}text=~</p>");
		expect(el.querySelector("span")).toBeNull();
		expect(el.textContent).toBe("~={}text=~");
	});

	test("an unknown name renders uncolored, markers gone", () => {
		const el = render("<p>~={mystery}text=~</p>");
		expect(el.textContent).toBe("text");
		expect(el.querySelector("span")?.getAttribute("style")).toBeNull();
	});
});

/**
 * A closing marker whose opener is in an earlier section.
 *
 * This is the shape a color wrapping a code block always takes: the opener,
 * the fence and the closer are three separate sections. Live preview parses
 * the whole document and hides both markers; reading mode sees the closer on
 * its own and used to leave it on screen as stray text.
 */
describe("a closing marker inherited from an earlier section", () => {
	const source = "~={red}\n```\nhello\n```\n=~";

	function renderClosingSection(html: string, text: string, lineStart: number): HTMLElement {
		const el = block(html);
		const context = {
			frontmatter: null,
			getSectionInfo: () => ({ text, lineStart, lineEnd: lineStart }),
		} as unknown as MarkdownPostProcessorContext;
		textColorPostProcessor(el, context, settings);
		return el;
	}

	test("the marker is taken off instead of shown", () => {
		const el = renderClosingSection("<p>=~</p>", source, 4);
		expect(el.textContent).toBe("");
	});

	test("a stray closer with no opener above it is still plain text", () => {
		const el = renderClosingSection("<p>=~</p>", "just prose\n\n=~", 2);
		expect(el.textContent).toBe("=~");
	});

	test("a closer whose opener was already closed is still plain text", () => {
		const el = renderClosingSection("<p>=~</p>", "~={red}done=~\n\n=~", 2);
		expect(el.textContent).toBe("=~");
	});

	test("an opener inside a code block does not count", () => {
		const el = renderClosingSection("<p>=~</p>", "```\n~={red}\n```\n=~", 3);
		expect(el.textContent).toBe("=~");
	});

	test("a blank line ends the reach, as it does in the grammar", () => {
		const el = renderClosingSection("<p>=~</p>", "~={red}open\n\nprose\n\n=~", 4);
		expect(el.textContent).toBe("=~");
	});
});
