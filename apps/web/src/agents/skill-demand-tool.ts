import { tool } from "ai";
import { z } from "zod";

/**
 * Day 2 (TS Port)'s fake "live" job-posting-count database. Shared by the
 * standalone trend-tool-agent.ts script and the live chat app's /api/chat
 * route, so both exercise the exact same tool rather than two copies drifting
 * apart.
 */
export const skillDatabase: Record<string, number> = {
  "pydantic ai": 142,
  "vercel ai sdk": 98,
  llamaindex: 85,
};

// Gives the AI a tool it can call mid-answer: a function that looks up a skill's live
// count in the database above, instead of the AI guessing the number itself. The
// "description" and the "inputSchema" field descriptions are read by the model, exactly
// like Pydantic AI's tool docstring and Field(description=...) calls.
export const fetchLiveSkillCount = tool({
  description: "Queries our internal database for current live job posting counts for a skill.",
  inputSchema: z.object({
    skillName: z.string().describe("The exact technical skill to look up, e.g. 'Pydantic AI'."),
  }),
  execute: async ({ skillName }: { skillName: string }) => {
    const formattedKey = skillName.toLowerCase().trim();
    // The AI sometimes shortens the skill name it was asked about (e.g. "Pydantic"
    // instead of "Pydantic AI") before calling this tool. An exact match would silently
    // return 0 for a real skill just because the wording didn't match — so we also accept
    // a database key that starts with what the AI sent, to catch that shortening.
    const exactMatch = skillDatabase[formattedKey];
    if (exactMatch !== undefined) {
      return exactMatch;
    }
    const partialMatchKey = Object.keys(skillDatabase).find((key) => key.startsWith(formattedKey));
    return partialMatchKey ? skillDatabase[partialMatchKey] : 0;
  },
});
