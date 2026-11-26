import type { RatingLevel } from "./extensions";

/**
 * Content rating. Everyone picks a level (Kids, Teen, Everything) and can
 * rate any post or video as appropriate or inappropriate. Text checks run
 * everywhere; community ratings hide things for stricter levels.
 */

export const LEVELS: { id: RatingLevel; name: string; blurb: string }[] = [
  { id: "kids", name: "Kids", blurb: "Strictest. Hides swearing, mature topics, and anything people rated inappropriate." },
  { id: "teen", name: "Teen", blurb: "Hides strong swearing and slurs, and things many people rated inappropriate." },
  { id: "all", name: "Everything", blurb: "Only hides adult content (always hidden) and what you rated inappropriate yourself." },
];

const STRONG = /\b(f+u+c+k\w*|f\*+k\w*|sh[i1]t\w*|cunts?|bitch\w*|assholes?|motherf\w*|bastards?|sluts?|whores?|dickheads?|wtf|stfu|nigg\w*|fagg?ots?|retard\w*)\b/i;
const MATURE = /\b(sex\w*|porn\w*|nudes?|naked|drugs?|cocaine|heroin|meth|weed|marijuana|vap(e|ing)|alcohol|beers?|vodka|whiske?y|drunk|murder\w*|kill(ed|ing|s)?|guns?|shoot(ing|er)s?|suicide|gore|bloody|nsfw|damn\w*|hell|crap|sucks?|stupid|idiot\w*)\b/i;

/** Whether text is too much for a level. */
export function textBlocked(text: string, level: RatingLevel): boolean {
  if (level === "all") return false;
  if (STRONG.test(text)) return true;
  return level === "kids" && MATURE.test(text);
}

/** Whether community ratings hide something for a level. */
export function votesBlock(good: number, bad: number, level: RatingLevel): boolean {
  if (level === "kids") return bad > 0 && bad >= good;
  if (level === "teen") return bad - good >= 3;
  return false;
}
