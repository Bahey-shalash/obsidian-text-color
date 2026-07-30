/**
 * The single source of truth for the `~={token}...=~` syntax.
 *
 * Two mechanisms are unavoidable — live preview parses an incremental
 * document, reading mode gets pre-rendered dom with no positions — but they
 * answer to one definition, kept here and held to it by the conformance test.
 */
export * from "src/syntax/markers";
export * from "src/syntax/code";
export * from "src/syntax/blocks";
export * from "src/syntax/mathColor";
export * from "src/syntax/openBefore";
export { textColorLanguage } from "src/syntax/language";
