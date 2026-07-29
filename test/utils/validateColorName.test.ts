import { validateColorName } from "src/settings/validateColorName";

it('returns `true` when the color name contain valid characters; otherwise, it returns `false`', () => {
	expect(validateColorName('')).toBe(false);
	expect(validateColorName(' ')).toBe(false);
	expect(validateColorName('a')).toBe(true);
	expect(validateColorName('9')).toBe(true);
	expect(validateColorName('b1')).toBe(true);
	expect(validateColorName('b1_dD_8')).toBe(true);
	expect(validateColorName('b1-dD_8')).toBe(true);
	// characters that would break the markup
	expect(validateColorName('b1/dD/8')).toBe(false);
	expect(validateColorName('#ff0000')).toBe(false);
	expect(validateColorName('a{b')).toBe(false);
	expect(validateColorName('a}b')).toBe(false);
	expect(validateColorName('a`b')).toBe(false);
});
