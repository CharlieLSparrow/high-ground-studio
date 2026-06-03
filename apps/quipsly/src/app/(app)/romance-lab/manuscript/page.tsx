import { ManuscriptClient } from "./manuscript-client";
import { getCharacters } from "../forge/actions";

export const dynamic = "force-dynamic";

export default async function ManuscriptPage() {
  const characters = await getCharacters();
  return <ManuscriptClient initialCharacters={characters} />;
}
