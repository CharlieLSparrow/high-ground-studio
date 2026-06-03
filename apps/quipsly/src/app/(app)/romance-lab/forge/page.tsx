import { ForgeClient } from "./forge-client";
import { getCharacters, getFactions } from "./actions";

export const dynamic = "force-dynamic";

export default async function EntityForgePage() {
  const [characters, factions] = await Promise.all([
    getCharacters(),
    getFactions()
  ]);

  return <ForgeClient initialCharacters={characters} initialFactions={factions} />;
}
