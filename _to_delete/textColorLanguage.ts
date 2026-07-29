import { parser } from 'src/parser/textColorLanguageParser';
import { LRLanguage } from '@codemirror/language';

export const textColorLanguage = LRLanguage.define({
	name: 'textColorLanguage',
	parser: parser.configure({}),
});
