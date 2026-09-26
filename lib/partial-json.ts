// The model writes JSON a few characters at a time. This turns whatever has
// arrived so far into the best object we can, so fields fill in live.

export function parsePartialJson(text: string): unknown {
  const stack: string[] = [];
  const cuts: { at: number; closers: string }[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      stack.pop();
      cuts.push({ at: i + 1, closers: [...stack].reverse().join("") });
    } else if (ch === ",") {
      cuts.push({ at: i, closers: [...stack].reverse().join("") });
    }
  }

  const attempts = [text + (inString && !escaped ? '"' : "") + [...stack].reverse().join("")];
  for (let k = cuts.length - 1; k >= 0 && attempts.length < 6; k--) {
    attempts.push(text.slice(0, cuts[k].at) + cuts[k].closers);
  }
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // keep cutting back
    }
  }
  return undefined;
}
