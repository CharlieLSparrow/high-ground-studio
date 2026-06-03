import { LoreLinkClient } from "./lorelink-client";
import { getCharacters, getFactions } from "../forge/actions";

export const dynamic = "force-dynamic";

export default async function LoreLinkPage() {
  const [characters, factions] = await Promise.all([
    getCharacters(),
    getFactions()
  ]);

  return <LoreLinkClient characters={characters} factions={factions} />;
}
