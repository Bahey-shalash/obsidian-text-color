import { MarkdownPostProcessorContext } from 'obsidian';
import { FastTextColorPluginSettings } from 'src/settings/settings';
import { OPEN, CLOSE, OPEN_START, CLOSE_MARKER, firstMatch, isCloseMarker, tokenOf, isCodeElement, isSelfRenderingSource, colorOpenBefore, SyntaxMatch } from 'src/syntax';
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
	const text = el.textContent ?? "";
	const opens = text.includes(OPEN_START);

	// cheap guard: no marker to act on means nothing to do. textContent costs a
	// walk, innerHTML would cost a full serialization of the block.
	if (!opens && !text.includes(CLOSE_MARKER)) {
		return;
	}

	// where this section's markdown sits in the note. Fetched once: both
	// questions below are about the source, and it is the whole file.
	const section = sourceRangeOf(el, context);

	// a section obsidian renders itself is not ours to walk. `isCodeElement`
	// cannot see one yet: this runs before the section reaches mathjax or the
	// code highlighter, so there is no `<pre>` or `<code>` in the dom to
	// recognise: the source has to be asked instead. Spans written into one
	// come back as the block's own input: mathjax renders them as a parse
	// error and the highlighter as literal text, either way taking the block
	// down with them.
	if (section != null && isSelfRenderingSource(section.source.slice(section.from, section.to))) {
		return;
	}

	// a closing marker whose opener is in an earlier section still belongs to
	// that opener. Live preview parses the whole document and hides it; without
	// this, reading mode has no opener to match and leaves it on screen: the
	// shape a color wrapping a code block always takes.
	const inherited = !opens && section != null
		&& colorOpenBefore(section.source, section.from);

	if (!opens && !inherited) {
		return;
	}

	const snapshot = el.cloneNode(true);

	try {
		colorNode(el, { settings, open: [], doc: el.ownerDocument, root: el, inherited });
	} catch (e) {
		console.error("colors: reading mode coloring failed, block left uncolored:", e);
		restoreChildren(el, snapshot);
	}
};

/** The note this section was rendered from, and where in it the section sits. */
interface SourceRange {
	/** the whole note, which is what both questions about a section need */
	source: string;
	from: number;
	to: number;
}

/**
 * Locate this section in its note, in offsets.
 *
 * Answers null when there is no section info to go on (embeds and exports do
 * not always carry it), which leaves the dom level `isCodeElement` guard as the
 * only line of defence, exactly as before.
 *
 * Walks to the line rather than splitting: `info.text` is the entire note, and
 * this runs once per rendered section, so splitting it here would cost a copy
 * of the note per section.
 */
function sourceRangeOf(el: HTMLElement, context: MarkdownPostProcessorContext): SourceRange | null {
	// guarded rather than called: the type says this is always there, but it is
	// the host's promise, not ours, and answering null costs only the coloring
	// of a section that spans blocks.
	const info = context?.getSectionInfo?.(el);
	if (info == null) {
		return null;
	}
	const from = offsetOfLine(info.text, info.lineStart);
	return { source: info.text, from, to: offsetOfLine(info.text, info.lineEnd + 1, from, info.lineStart) };
}

/** Where a line starts, counted from a line already known to start at `pos`. */
function offsetOfLine(source: string, line: number, pos = 0, counted = 0): number {
	for (let n = counted; n < line; n++) {
		const next = source.indexOf("\n", pos);
		if (next < 0) {
			return source.length;
		}
		pos = next + 1;
	}
	return pos;
}

/**
 * One `~={token}` that has been opened and not yet closed.
 *
 * `span` is the span currently collecting this color's content. It is not
 * fixed for the color's lifetime: markdown puts the opening marker and the
 * text that follows it at different levels of the rendered tree (`**~={red}a**
 * b=~`), and a color cannot be one span across those levels without dragging
 * the text into an element it was never formatted by. So the color continues
 * as a fresh span at whatever level the next content lives at, and `span`
 * follows along, which also keeps the closing marker's remainder landing at
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
	/** the block this pass was handed; nothing outside it is ours to touch */
	root: Node;
	/**
	 * A color opened in an earlier section is still open here, so the first
	 * closing marker with nothing of its own to close is markup rather than the
	 * stray text it would otherwise be. Cleared once that marker is consumed.
	 */
	inherited: boolean;
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
		// that is still open, which the caller's walk would have handled for a
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
	// a `=~` that would take the `~` of the opener behind it is not a closer;
	// see `isCloseMarker`. The opener wins the character they both want.
	const closes = close != null && isCloseMarker(text, close.index);

	if (open != null && (!closes || open.index < close.index)) {
		return openColor(textNode, text, open, ctx);
	}
	if (closes) {
		return closeColor(textNode, text, close, ctx);
	}
	return closeSplitMarker(textNode, text, ctx);
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

	if (closed == undefined && ctx.inherited) {
		// closes a color opened in an earlier section: markup, so it goes. The
		// color itself does not reach across the block between them: only the
		// marker does, and leaving it on screen is what live preview does not do.
		ctx.inherited = false;
		textNode.nodeValue = text.slice(0, marker.index);
		textNode.parentNode?.insertAfter(rest, textNode);
		return rest;
	}

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

/**
 * Close a color whose `=~` obsidian broke in half.
 *
 * Striking colored text through gives `~~~={red}text=~~~`: three tildes in a
 * row, of which obsidian's strikethrough takes the first two. The `=` of the
 * closing marker is left inside the `<del>` and its `~` behind it as a
 * sibling, so neither half holds a marker any regex can find. Unhandled, the
 * color never closes: it runs on to the end of the block with both orphaned
 * characters on screen, which is the opposite of what live preview shows for
 * the same line.
 *
 * So a trailing `=` whose next text begins with `~` is the marker, split, and
 * both halves go the way a whole one would. The text behind them stays where
 * obsidian put it: it is no longer inside the color.
 *
 * Only across the edge of a strikethrough, though. Nothing else in markdown
 * can take that `~`, and without the restriction the rule reads `~={red}a=*~b*=~`
 * (a `=` at the end of the colored text, italics that happen to start with a
 * tilde) as a split marker, and eats a character the user typed.
 */
function closeSplitMarker(textNode: Text, text: string, ctx: RenderContext): null {
	if (ctx.open.length == 0 || !text.endsWith(CLOSE_MARKER[0])) {
		return null;
	}
	const next = textAfter(textNode, ctx.root);
	const behind = next?.nodeValue ?? "";
	if (next == null || !behind.startsWith(CLOSE_MARKER[1])) {
		return null;
	}
	if (struckThrough(textNode, ctx.root) == struckThrough(next, ctx.root)) {
		return null; // no `<del>` between the halves, so nothing split them.
	}

	textNode.nodeValue = text.slice(0, -CLOSE_MARKER[0].length);
	next.nodeValue = behind.slice(CLOSE_MARKER[1].length);
	ctx.open.pop();
	return null;
}

/** The elements obsidian renders `~~text~~` as. */
const STRIKETHROUGH = new Set(["DEL", "S"]);

/** Whether a node sits inside a strikethrough within this block. */
function struckThrough(node: Node, root: Node): boolean {
	for (let up: Node | null = node; up != null && up != root; up = up.parentNode) {
		if (STRIKETHROUGH.has(up.nodeName)) {
			return true;
		}
	}
	return false;
}

/**
 * The next text node in document order, without leaving the block.
 *
 * Bounded by the block this pass was handed as well as by the block elements
 * inside it: the root is not always one of those, obsidian decides what a
 * section is, and a walk that climbs past it is looking at somebody else's
 * rendered section, which is not ours to read, let alone to edit.
 */
function textAfter(node: Node, root: Node): Text | null {
	for (let up: Node | null = node; up != null && up != root && !isBlockBoundary(up); up = up.parentNode) {
		for (let sibling = up.nextSibling; sibling != null; sibling = sibling.nextSibling) {
			const text = firstTextIn(sibling);
			if (text != null) {
				return text;
			}
		}
	}
	return null;
}

/** The first non empty text inside a node, itself included. */
function firstTextIn(node: Node): Text | null {
	if (node.nodeType == Node.TEXT_NODE) {
		return node.nodeValue ? node as Text : null;
	}
	if (isBlockBoundary(node) || isCodeElement(node)) {
		return null;
	}
	for (let child = node.firstChild; child != null; child = child.nextSibling) {
		const text = firstTextIn(child);
		if (text != null) {
			return text;
		}
	}
	return null;
}

function newSpan(ctx: RenderContext, hex: string | null): HTMLElement {
	// the window's createSpan, not the node or the global one; see
	// MarkerWidget.toDOM for why.
	const span = ctx.doc.win.createSpan();
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
