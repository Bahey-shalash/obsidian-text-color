import { ExternalTokenizer } from "@lezer/lr";
import { RMarker } from "./textColorLanguageParser.terms.js";

/**
 * The `=~` token, read by hand so it can look at what follows it.
 *
 * A closing marker shares its `~` with the opening marker of `~={token}`, and
 * obsidian's own markup is what puts the two next to each other: `==` around
 * colored text renders as `==~={red}text=~==`, where the `=` of the highlight
 * and the `~` of the color read as a perfect `=~`. Taken as a closer, that
 * pairing eats the opener and the expression stops existing, live preview
 * showed the raw markup while reading mode, which never sees the `==` because
 * obsidian consumed it, rendered the color.
 *
 * So a `=~` whose `~` starts a `~={` is not a closing marker. The character in
 * front of it is ordinary text, exactly as the user typed it.
 * `markers.isCloseMarker` is the same rule for the reading mode regexes, and
 * `test/syntaxConformance.test.ts` holds the two to it.
 */
const EQUALS = "=".charCodeAt(0);
const TILDE = "~".charCodeAt(0);
const OPEN_BRACE = "{".charCodeAt(0);

export const closeMarker = new ExternalTokenizer(input => {
	if (input.next != EQUALS || input.peek(1) != TILDE) {
		return;
	}
	if (input.peek(2) == EQUALS && input.peek(3) == OPEN_BRACE) {
		return; // `=~={`: the `~` belongs to the opening marker behind it.
	}
	input.acceptToken(RMarker, 2);
});
