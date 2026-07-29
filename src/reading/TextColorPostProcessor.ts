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

/** Everything one coloring pass needs to carry through the recursion. */
interface RenderContext {
	settings: FastTextColorPluginSettings;
	/** currently open color spans, innermost last */
	open: HTMLElement[];
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

		if (child.nodeValue) {
			colorTextNode(child as Text, ctx);
		}
	}
}

/**
 * Inline content rendered after an open color span belongs inside it: markdown
 * emits `<strong>`, links and the following text as siblings, so they are
 * adopted into the span until its closing marker is found.
 */
function moveIntoOpenColor(child: Node, ctx: RenderContext): void {
	const innermost = ctx.open[ctx.open.length - 1];
	if (innermost == undefined || innermost == child) {
		return;
	}
	if (child.compareDocumentPosition(innermost) & Node.DOCUMENT_POSITION_CONTAINS) {
		// we are iterating above the span; nothing to adopt at this level.
		return;
	}

	child.parentNode?.removeChild(child);
	innermost.appendChild(child);
}

/** Handle the first marker in a text node; the loop picks up the remainder. */
function colorTextNode(textNode: Text, ctx: RenderContext): void {
	const text = textNode.nodeValue ?? "";
	const open = firstMatch(text, OPEN);
	const close = firstMatch(text, CLOSE);

	if (open != null && (close == null || open.index < close.index)) {
		openColor(textNode, text, open, ctx);
	} else if (close != null) {
		closeColor(textNode, text, close, ctx);
	}
}

/** ~={token}: start a span; the text behind the marker moves inside it. */
function openColor(textNode: Text, text: string, marker: SyntaxMatch, ctx: RenderContext): void {
	const span = ctx.doc.createElement("span");
	const hex = resolveTokenHex(tokenOf(marker.value), ctx.settings);
	if (hex != null) {
		applyColorStyle(span, hex, ctx.settings);
	}

	textNode.nodeValue = text.slice(0, marker.index);
	textNode.parentNode?.insertAfter(span, textNode);
	span.appendChild(ctx.doc.createTextNode(text.slice(marker.end)));

	ctx.open.push(span);
}

/** =~: close the innermost span; the rest of the text continues after it. */
function closeColor(textNode: Text, text: string, marker: SyntaxMatch, ctx: RenderContext): void {
	const closed = ctx.open.pop();

	if (closed == undefined) {
		// stray closing marker with no open color: keep it as plain text
		// and continue scanning behind it.
		textNode.nodeValue = text.slice(0, marker.index) + marker.value;
		textNode.parentNode?.insertAfter(ctx.doc.createTextNode(text.slice(marker.end)), textNode);
		return;
	}

	textNode.nodeValue = text.slice(0, marker.index);
	closed.parentNode?.insertAfter(ctx.doc.createTextNode(text.slice(marker.end)), closed);
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
