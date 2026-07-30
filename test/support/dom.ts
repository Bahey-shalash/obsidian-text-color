/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM } = require("jsdom");

/**
 * A dom for tests that render.
 *
 * Installs jsdom's globals plus the handful of extensions obsidian adds to
 * Node/HTMLElement that the reading mode renderer relies on. Call once per
 * test file, from beforeAll.
 */
export function setupDom(): void {
	const dom = new JSDOM("<!doctype html><body></body>");

	(globalThis as any).window = dom.window;
	(globalThis as any).document = dom.window.document;
	(globalThis as any).Node = dom.window.Node;
	(globalThis as any).HTMLElement = dom.window.HTMLElement;

	(dom.window.HTMLElement.prototype as any).addClass = function (...classes: string[]) {
		this.classList.add(...classes);
	};
	(dom.window.HTMLElement.prototype as any).removeClass = function (...classes: string[]) {
		this.classList.remove(...classes);
	};
	// obsidian's setCssProps writes custom properties into the style attribute,
	// which is where the assertions below read the color back out of.
	(dom.window.HTMLElement.prototype as any).setCssProps = function (props: Record<string, string>) {
		for (const [name, value] of Object.entries(props)) {
			this.style.setProperty(name, value);
		}
	};
	(dom.window.Node.prototype as any).insertAfter = function (node: Node, ref: Node) {
		this.insertBefore(node, ref.nextSibling);
		return node;
	};
}

/** A fresh detached block element to render into. */
export function block(html?: string): HTMLElement {
	const el = (globalThis as any).document.createElement("div") as HTMLElement;
	if (html != undefined) {
		el.innerHTML = html;
	}
	return el;
}

/**
 * The visible text of a rendered block together with the color each character
 * is rendered in, taken from the innermost span that carries one.
 */
export interface RenderedColoring {
	text: string;
	/** one entry per character of `text`: its hex, or null */
	colors: (string | null)[];
}

export function readColoring(el: HTMLElement): RenderedColoring {
	const text: string[] = [];
	const colors: (string | null)[] = [];

	const walk = (node: Node, inherited: string | null): void => {
		if (node.nodeType === Node.TEXT_NODE) {
			for (const ch of node.nodeValue ?? "") {
				text.push(ch);
				colors.push(inherited);
			}
			return;
		}
		const own = colorOf(node) ?? inherited;
		node.childNodes.forEach(child => walk(child, own));
	};

	walk(el, null);
	return { text: text.join(""), colors };
}

function colorOf(node: Node): string | null {
	if (node.nodeType !== Node.ELEMENT_NODE) {
		return null;
	}
	const style = (node as HTMLElement).getAttribute("style");
	return style == null ? null : hexInStyle(style);
}

/** `--ftc-color: #ff8800; ...` -> `#ff8800` */
export function hexInStyle(style: string): string | null {
	return /--ftc-color:\s*(#[0-9a-fA-F]+)/.exec(style)?.[1] ?? null;
}
