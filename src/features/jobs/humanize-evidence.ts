/**
 * The deterministic fit scorer stores evidence sentences written for auditability
 * ("Go is required but is not in the recorded skill inventory."). Those exact
 * strings are persisted with each run and asserted in tests, so they are
 * rewritten here — at display time only — into the way a person would say them.
 * Unrecognized sentences pass through untouched.
 */

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

type Rule = {
  pattern: RegExp;
  rewrite: (match: RegExpMatchArray) => string;
};

const RULES: readonly Rule[] = [
  {
    pattern: /^(.+) is required but is not in the recorded skill inventory\.$/,
    rewrite: (m) => `They want ${m[1]} — it’s not on your skill list yet.`,
  },
  {
    pattern: /^(.+) is \S+ but is not in the recorded skill inventory\.$/,
    rewrite: (m) => `${capitalize(m[1])} comes up here — it’s not on your skill list yet.`,
  },
  {
    pattern: /^(.+) is supported by (.+) evidence\.$/,
    rewrite: (m) => `You already have ${m[1]}, backed by ${m[2]} experience.`,
  },
  {
    pattern: /^(.+) is preference number 1\.$/,
    rewrite: (m) => `${capitalize(m[1])} work is your first choice.`,
  },
  {
    pattern: /^(.+) is preference number \d+\.$/,
    rewrite: (m) => `${capitalize(m[1])} work is one of your preferred setups.`,
  },
  {
    pattern: /^(.+) matches the (.+) target family\.$/,
    rewrite: (m) => `“${m[1]}” is exactly the kind of role you’re after.`,
  },
  {
    pattern: /^(.+) has meaningful title overlap with a target role family\.$/,
    rewrite: (m) => `“${m[1]}” is close to the roles you’re targeting.`,
  },
  {
    pattern: /^(.+) is only tangentially related to the configured role families\.$/,
    rewrite: (m) => `“${m[1]}” sits a bit outside the roles you’re targeting.`,
  },
  {
    pattern: /^(.+) maps to a recognized family outside the current targets\.$/,
    rewrite: (m) => `“${m[1]}” isn’t one of the roles you’re targeting.`,
  },
  {
    pattern: /^The lower bound meets or exceeds the target salary\.$/,
    rewrite: () => `Even the low end of the range clears your target salary.`,
  },
  {
    pattern: /^The lower bound meets the minimum move salary\.$/,
    rewrite: () => `The low end of the range clears your minimum to move.`,
  },
  {
    pattern: /^The responsibilities describe concrete AI or automation work\.$/,
    rewrite: () => `The day-to-day is real AI and automation work, not buzzwords.`,
  },
  {
    pattern: /^The listing includes product or implementation ownership\.$/,
    rewrite: () => `You’d own product or implementation work end to end.`,
  },
  {
    pattern: /^The role offers customer or cross-functional experience\.$/,
    rewrite: () => `You’d work directly with customers and other teams.`,
  },
  {
    pattern: /^The listing explicitly mentions structured growth or mentorship\.$/,
    rewrite: () => `They call out structured growth and mentorship.`,
  },
  {
    pattern: /^The work may be primarily repetitive first-line support\.$/,
    rewrite: () => `This could be mostly repetitive first-line support work.`,
  },
  {
    pattern: /^The role appears commission- or quota-heavy\.$/,
    rewrite: () => `Pay looks commission- or quota-heavy.`,
  },
  {
    pattern: /^Contract or temporary employment reduces stability\.$/,
    rewrite: () => `It’s contract or temp work, so less stability.`,
  },
  {
    pattern: /^(.+) is a direct industry preference\.$/,
    rewrite: (m) => `${capitalize(m[1])} is an industry you asked for.`,
  },
  {
    pattern: /^(.+) is an adjacent industry preference\.$/,
    rewrite: (m) => `${capitalize(m[1])} is close to the industries you asked for.`,
  },
  {
    pattern: /^(.+) is not a configured industry preference\.$/,
    rewrite: (m) => `${capitalize(m[1])} isn’t an industry you’ve shown interest in.`,
  },
  {
    pattern: /^No portfolio project is available to support this role\.$/,
    rewrite: () => `None of your portfolio projects speaks to this role yet.`,
  },
  {
    pattern: /^Remote eligibility cannot be resolved from the recorded location data\.$/,
    rewrite: () => `Worth confirming you’re eligible for their remote policy.`,
  },
  {
    pattern: /^Eligibility for the remote region or timezone restriction is unresolved\.$/,
    rewrite: () => `Check their remote region or timezone rules before applying.`,
  },
  {
    pattern: /^Geographic feasibility for the office requirement is unresolved\.$/,
    rewrite: () => `Check whether the office location actually works for you.`,
  },
];

export function humanizeEvidence(value: string): string {
  for (const rule of RULES) {
    const match = value.match(rule.pattern);
    if (match) return rule.rewrite(match);
  }
  return value;
}
