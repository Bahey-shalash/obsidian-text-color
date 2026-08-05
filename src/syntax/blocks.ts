/**
 * Blocks that render themselves, and so must never be given coloring markup.
 *
 * `code.ts` answers the same question for inline code, off the parse tree.
 * This answers it for whole blocks, off the raw text, because that is what the
 * editor commands hold and because a block is defined by how its delimiter
 * lines sit in the document rather than by anything the grammar knows about.
 *
 * A fenced code block belongs to obsidian's highlighter: markup written inside
 * one shows up as source and takes the highlighting of the language with it.
 *
 * A display math block belongs to mathjax, and it only *is* a math block while
 * its `$$` has the line to itself. Put one marker in front of it and reading
 * mode stops parsing it as math at all, while live preview carries on
 * rendering it, which is how a colored math block ends up looking right in
 * one mode and like raw latex in the other.
 */

/** A block the coloring has to route around, in document offsets. */
export interface ProtectedBlock {
	from: number;
	to: number;
	kind: "code" | "math";
}

/** Opening fence of a code block: three or more backticks or tildes. */
const CODE_FENCE = /^(`{3,}|~{3,})/;

/**
 * Every code and display math block in the document, in order.
 *
 * An unclosed code fence runs to the end of the document, which is what
 * obsidian does with it too: it swallows everything behind it rather than
 * being reinterpreted as text.
 *
 * An unclosed `$$` is the other way round. Obsidian renders it as the literal
 * text it is, so it is not a block and protects nothing, and it must not be,
 * because a line like `$$5 and rising` opens one. Protecting to the end of the
 * document would put every line behind a price out of the coloring's reach.
 */
export function protectedBlocks(text: string): ProtectedBlock[] {
	const blocks: ProtectedBlock[] = [];
	// only a code fence carries anything into its closing test; a math block is
	// closed by the one delimiter there is.
	let open: { kind: "code", fence: string, from: number } | { kind: "math", from: number } | null = null;
	let pos = 0;

	for (const line of text.split("\n")) {
		const from = pos;
		const to = pos + line.length;
		pos = to + 1; // the newline this split consumed
		const trimmed = line.trim();

		if (open == null) {
			const fence = CODE_FENCE.exec(trimmed)?.[1];
			if (fence != undefined) {
				open = { kind: "code", fence, from };
			} else if (opensMath(trimmed)) {
				open = { kind: "math", from };
			}
			continue;
		}

		if (open.kind == "code" ? closesCode(trimmed, open.fence) : trimmed.endsWith("$$")) {
			blocks.push({ from: open.from, to, kind: open.kind });
			open = null;
		}
	}

	if (open != null && open.kind == "code") {
		blocks.push({ from: open.from, to: text.length, kind: "code" });
	}

	return blocks;
}

/** The block this range falls in, if any. */
export function blockAt(blocks: ProtectedBlock[], from: number, to: number): ProtectedBlock | undefined {
	return blocks.find(block => from <= block.to && to >= block.from);
}

/** Does any protected block overlap this range? */
export function overlapsProtectedBlock(blocks: ProtectedBlock[], from: number, to: number): boolean {
	return blockAt(blocks, from, to) != undefined;
}

/**
 * Is this run of source a block that renders itself?
 *
 * Reading mode asks the question a section at a time rather than about a range
 * inside a document, and it has to ask about the source: the post processor
 * runs before obsidian has handed the section to mathjax or to the code
 * highlighter, so there is no `<pre>` or `<code>` in the dom yet to recognise
 * it by. Anything written into one of these comes back out as escaped text:
 * mathjax renders it as a parse error, the highlighter as literal source.
 */
export function isSelfRenderingSource(source: string): boolean {
	const [first] = protectedBlocks(source);
	return first != undefined && first.from == 0 && first.to >= source.trimEnd().length;
}

/**
 * `$$` alone on its line opens a block, and so does a `$$` that starts one
 * without closing it. `$$x$$` closes on the same line: that is a math element
 * inside a paragraph, which takes markup around it perfectly well.
 */
function opensMath(trimmed: string): boolean {
	return trimmed.startsWith("$$") && (trimmed.length == 2 || !trimmed.endsWith("$$"));
}

/** A closing fence is its own character, at least as long, and alone on the line. */
function closesCode(trimmed: string, fence: string): boolean {
	return trimmed.length >= fence.length && trimmed == fence[0].repeat(trimmed.length);
}
