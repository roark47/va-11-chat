import type { AdminChannel } from "../types";

const VA11_DRINK_NAMES = [
  "Bad Touch",
  "Beer",
  "Bleeding Jane",
  "Bloom Light",
  "Blue Fairy",
  "Brandtini",
  "Cobalt Velvet",
  "Crevice Spike",
  "Flaming Moai",
  "Fluffy Dream",
  "Fringe Weaver",
  "Grizzly Temple",
  "Gut Punch",
  "Marsblast",
  "Mercuryblast",
  "Moonblast",
  "Piano Man",
  "Piano Woman",
  "Piledriver",
  "Sparkle Star",
  "Sugar Rush",
  "Sunshine Cloud",
  "Suplex",
  "Zen Star",
];

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function randomAvailableDrinkName(channels: AdminChannel[], currentName = ""): string {
  const usedNames = new Set(channels.map((channel) => normalizeName(channel.name)));
  const available = VA11_DRINK_NAMES.filter((name) => !usedNames.has(normalizeName(name)));
  const alternatives = available.filter(
    (name) => normalizeName(name) !== normalizeName(currentName),
  );
  const pool = alternatives.length > 0 ? alternatives : available;
  return pool[Math.floor(Math.random() * pool.length)] ?? "";
}
