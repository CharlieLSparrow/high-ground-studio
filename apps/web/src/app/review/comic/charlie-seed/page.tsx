import React from 'react';
import fs from 'fs/promises';
import path from 'path';
import ScrollExperienceEngine from '@/components/scroll-experience/ScrollExperienceEngine';
import { transformComicSeedToScrollExperience } from '@/components/scroll-experience/utils/transformComicSeedToScrollExperience';

export default async function CharlieSeedPreviewPage() {
  // Load the private seed JSON file
  const seedPath = path.join(
    process.cwd(),
    '../../content/private/fiction/charlie-l-sparrow/my-heart-is-a-junkyard-starship/issue-001-tenderness-of-unlawful-design/scroll-seed.json'
  );

  let seedJson;
  try {
    const rawData = await fs.readFile(seedPath, 'utf-8');
    seedJson = JSON.parse(rawData);
  } catch (err) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black text-red-500">
        <p>Failed to load private comic seed. Ensure you have access.</p>
      </div>
    );
  }

  // Transform it into a generic ScrollExperience
  const experience = transformComicSeedToScrollExperience(seedJson);

  return (
    <main className="w-full h-[100dvh] bg-black">
      <ScrollExperienceEngine experience={experience} mode="preview" />
    </main>
  );
}
