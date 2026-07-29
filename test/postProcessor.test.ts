/**
 * Reading mode rendering tests, against a real dom.
 */
import { textColorPostProcessor } from "src/reading/TextColorPostProcessor";
import { DEFAULT_SETTINGS, FastTextColorPluginSettings } from "src/settings/settings";
import type { MarkdownPostProcessorContext } from "obsidian";
import { setupDom, block } from "./support/dom";

beforeAll(setupDom);

// the default palette already maps red and blue to the hexes asserted below.
const settings: FastTextColorPluginSettings = structuredClone(DEFAULT_SETTINGS);

function render(html: string): HTMLElement {
	const el = block(html);
	textColorPostProcessor(el, { frontmatter: null } as unknown as MarkdownPostProcessorContext, settings);
	return el;
}

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
