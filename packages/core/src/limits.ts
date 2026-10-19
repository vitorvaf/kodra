/** Maximum length of an agent kickoff prompt (issues:start-agent). The
 * compose UI enforces the same budget so long bodies are attached as
 * files instead of failing server-side validation. */
export const KICKOFF_PROMPT_MAX_CHARS = 20_000;

/** Maximum length of an issue body / thread message. */
export const BODY_MAX_CHARS = 65_536;
