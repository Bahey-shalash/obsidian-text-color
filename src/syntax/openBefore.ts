import { CLOSE, OPEN } from "src/syntax/markers";
import { overlapsProtectedBlock, protectedBlocks } from "src/syntax/blocks";

/**
 * Whether the source in front of an offset leaves a color open.
 *
 * Reading mode is handed one section at a time, so on its own it cannot tell a
 * closing marker that belongs to an opener further up from a stray one the
 * user typed. Live preview parses the whole document and can, and the two have
 * to agree about which markers are markup — otherwise a color spanning a code
 * block leaves a `=~` on screen in one mode and not the other.
 *
 * The scan starts at the last blank line, which is where the grammar starts
 * one too: `ENDLN` is `\n\n`, so no expression reaches across one. Markers
 * inside a code or math block are not markers.
 */
export function colorOpenBefore(source: string, upTo: number): boolean {
	// the blocks come from the whole document, never from the stretch alone:
	// the scan is line by line and stateful, so starting it midway through a
	// fence would read that fence's closing line as an opening one.
	const blocks = protectedBlocks(source);
	const from = lastBlankLineBefore(source, upTo);

	const counted = (regex: RegExp): number => {
		const fresh = new RegExp(regex.source, "g");
		fresh.lastIndex = from;
		let count = 0;
		for (let m = fresh.exec(source); m != null && m.index < upTo; m = fresh.exec(source)) {
			if (!overlapsProtectedBlock(blocks, m.index, m.index + m[0].length)) {
				count++;
			}
		}
		return count;
	};

	return counted(OPEN) > counted(CLOSE);
}

/** Where the run of lines containing `upTo` begins: just after the last blank line. */
function lastBlankLineBefore(source: string, upTo: number): number {
	const blank = source.lastIndexOf("\n\n", upTo);
	return blank < 0 ? 0 : blank + "\n\n".length;
}
