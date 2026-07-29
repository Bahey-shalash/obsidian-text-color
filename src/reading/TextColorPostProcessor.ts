import { MarkdownPostProcessorContext } from 'obsidian';
import { FastTextColorPluginSettings } from 'src/settings/settings';
import { OPEN, CLOSE, OPEN_START, firstMatch, tokenOf, isCodeElement, SyntaxMatch } from 'src/syntax';
import { applyColorStyle } from 'src/color/ColorStyle';
import { resolveTokenHex } from 'src/color/resolveToken';

/**
 * Reading mode rendering: walk the rendered block, split text nodes at the
 * ~={token} / =~ markers and wrap the text between them in color spans.
 *
 * The whole pass works on one invariant: `open` holds the currently open color
 * spans, innermost last. Opening a color pushes its span, a closing marker
 * pops it, and everything rendered between the two is moved inside the span.
 */
export const textColorPostProcessor = (el: HTMLElement, context: MarkdownPostProcessorContext, settings: FastTextColorPluginSettings): void => {
	// cheap guard: no opening marker anywhere means nothing to do. textContent
	// costs a walk, innerHTML would cost a full serialization of the block.
	if (!(el.textContent ?? "").includes(OPEN_START)) {
		return;
	}

	const snapshot = el.cloneNode(true);

	try {
		colorNode(el, { settings, open: [], doc: el.ownerDocument });
	} catch (e) {
		console.error(`text-color: reading mode coloring failed, block left uncolored: ${e}`);
		restoreChildren(el, snapshot);
	}
};

/**
 * One `~={token}` that has been opened and not yet closed.
 *
 * `span` is the span currently collecting this color's content. It is not
 * fixed for the color's lifetime: markdown puts the opening marker and the
 * text that follows it at different levels of the rendered tree (`**~={red}a**
 * b=~`), and a color cannot be one span across those levels without dragging
 * the text into an element it was never formatted by. So the color continues
 * as a fresh span at whatever level the next content lives at, and `span`
 * follows along — which also keeps the closing marker's remainder landing at
 * the level the text came from.
 */
interface OpenColor {
	/** the resolved color, or null for a token that does not name one */
	hex: string | null;
	/** the span collecting this color's content at the level being walked */
	span: HTMLElement;
}

/** Everything one coloring pass needs to carry through the recursion. */
interface RenderContext {
	settings: FastTextColorPluginSettings;
	/** currently open colors, innermost last */
	open: OpenColor[];
	/** the block's own document, which may belong to a pop out window */
	doc: Document;
}

const BLOCK_BOUNDARIES = new Set([
	"P", "DIV", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH",
	"UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "H6",
	"BLOCKQUOTE", "PRE", "HR", "SECTION", "ARTICLE", "FIGURE",
]);

/** A color never continues across block elements (#60, #55). */
function isBlockBoundary(node: Node): boolean {
	return node.nodeType == Node.ELEMENT_NODE && BLOCK_BOUNDARIES.has(node.nodeName);
}

/**
 * Color one node's children in place.
 *
 * The child list is live on purpose: handlers split text nodes and insert the
 * remainder as new siblings, which this loop then visits in document order.
 */
function colorNode(node: Node, ctx: RenderContext): void {
	if (isCodeElement(node)) {
		return;
	}

	for (let i = 0; i < node.childNodes.length; i++) {
		const lengthBefore = node.childNodes.length;
		const child = node.childNodes.item(i);

		if (child.nodeType == Node.TEXT_NODE && !child.nodeValue) {
			continue; // an empty remainder left behind by a marker
		}

		if (ctx.open.length > 0 && isBlockBoundary(child)) {
			ctx.open.length = 0;
		}

		moveIntoOpenColor(child, ctx);
		if (lengthBefore > node.childNodes.length) {
			// the child left this list; stay in place.
			i -= lengthBefore - node.childNodes.length;
		}

		if (child.nodeType != Node.TEXT_NODE) {
			colorNode(child, ctx);
			continue;
		}

		colorTextNode(child as Text, ctx);
	}
}

/**
 * Inline content rendered after an open color belongs inside it: markdown emits
 * `<strong>`, links and the following text as siblings, so they are adopted
 * into the open span until the closing marker is found.
 *
 * Adoption only ever happens between siblings. Content one level up from the
 * span was not formatted by the element the span sits in, so pulling it in
 * would render it bold, italic or linked when the source never said so; the
 * color continues as a new span at this level instead.
 */
function moveIntoOpenColor(child: Node, ctx: RenderContext): void {
	const innermost = ctx.open[ctx.open.length - 1];
	const parent = child.parentNode;
	if (innermost == undefined || innermost.span == child || parent == null) {
		return;
	}
	if (child.compareDocumentPosition(innermost.span) & Node.DOCUMENT_POSITION_CONTAINS) {
		return; // already inside the open span; nothing to adopt.
	}

	if (innermost.span.parentNode != parent) {
		innermost.span = newSpan(ctx, innermost.hex);
		parent.insertBefore(innermost.span, child);
	}

	parent.removeChild(child);
	innermost.span.appendChild(child);
}

/**
 * Handle every marker in a text node.
 *
 * Each handler returns what is left behind the marker it consumed, and the
 * loop carries on there. Following the remainder rather than leaving it to the
 * caller's child walk is what keeps markup found behind a marker from being
 * missed: the remainder does not always end up in the child list the caller is
 * iterating.
 */
function colorTextNode(textNode: Text, ctx: RenderContext): void {
	let rest: Text | null = textNode;
	while (rest != null && rest.nodeValue) {
		// closing the innermost color can leave the remainder outside a color
		// that is still open — which the caller's walk would have handled for a
		// child of its own, but this remainder is not one.
		moveIntoOpenColor(rest, ctx);
		rest = colorFirstMarker(rest, ctx);
	}
}

/** Handle the first marker in a text node; answer with the text behind it. */
function colorFirstMarker(textNode: Text, ctx: RenderContext): Text | null {
	const text = textNode.nodeValue ?? "";
	const open = firstMatch(text, OPEN);
	const close = firstMatch(text, CLOSE);

	if (open != null && (close == null || open.index < close.index)) {
		return openColor(textNode, text, open, ctx);
	}
	if (close != null) {
		return closeColor(textNode, text, close, ctx);
	}
	return null;
}

/** ~={token}: start a span; the text behind the marker moves inside it. */
function openColor(textNode: Text, text: string, marker: SyntaxMatch, ctx: RenderContext): Text {
	const hex = resolveTokenHex(tokenOf(marker.value), ctx.settings);
	const span = newSpan(ctx, hex);
	const rest = ctx.doc.createTextNode(text.slice(marker.end));

	textNode.nodeValue = text.slice(0, marker.index);
	textNode.parentNode?.insertAfter(span, textNode);
	span.appendChild(rest);

	ctx.open.push({ hex, span });
	return rest;
}

/** =~: close the innermost span; the rest of the text continues after it. */
function closeColor(textNode: Text, text: string, marker: SyntaxMatch, ctx: RenderContext): Text {
	const closed = ctx.open.pop();
	const rest = ctx.doc.createTextNode(text.slice(marker.end));

	if (closed == undefined) {
		// stray closing marker with no open color: keep it as plain text
		// and continue scanning behind it.
		textNode.nodeValue = text.slice(0, marker.index) + marker.value;
		textNode.parentNode?.insertAfter(rest, textNode);
		return rest;
	}

	textNode.nodeValue = text.slice(0, marker.index);
	closed.span.parentNode?.insertAfter(rest, closed.span);
	return rest;
}

function newSpan(ctx: RenderContext, hex: string | null): HTMLElement {
	const span = ctx.doc.createElement("span");
	if (hex != null) {
		applyColorStyle(span, hex, ctx.settings);
	}
	return span;
}

/** Put the pre-coloring content back after a failed pass. */
function restoreChildren(el: HTMLElement, snapshot: Node): void {
	while (el.firstChild) {
		el.removeChild(el.firstChild);
	}
	while (snapshot.firstChild) {
		el.appendChild(snapshot.firstChild);
	}
}
