import React from "react";
import { Block } from "../Tagger";
import { BlockCardRenderer } from "./EditorExtensionRegistry";
import ClipCueCard, { hasYouTubeClipCue } from "../ClipCueCard";
import PublishedEpisodeCard from "./PublishedEpisodeCard";
import CharacterCard from "./cards/CharacterCard";
import SponsorAdCard from "./cards/SponsorAdCard";
import ImageGalleryCard from "./cards/ImageGalleryCard";
import QuizCard from "./cards/QuizCard";
import QuoteAttributionCard from "./cards/QuoteAttributionCard";


function extractLinks(text: string) {
  return Array.from(text.matchAll(/https?:\/\/[^\s<>"')]+/gi))
    .map((match) => match[0].replace(/[.,;:!?]+$/, ""));
}

function isYouTubeLink(url: string) {
  return /(^https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
}

function publishedEpisodeLinks(block: Block) {
  return extractLinks(block.text).filter(isYouTubeLink);
}

export const coreBlockCards: BlockCardRenderer[] = [

  {
    id: "character-profile",
    shouldRender: (block, tags) => tags.includes("character"),
    render: ({ block }) => <CharacterCard block={block} />
  },
  {
    id: "sponsor-ad",
    shouldRender: (block, tags) => tags.includes("sponsor-ad"),
    render: ({ block }) => <SponsorAdCard block={block} />
  },
  {
    id: "image-gallery",
    shouldRender: (block, tags) => tags.includes("gallery"),
    render: ({ block }) => <ImageGalleryCard block={block} />
  },
  {
    id: "quiz-module",
    shouldRender: (block, tags) => tags.includes("quiz"),
    render: ({ block }) => <QuizCard block={block} />
  },
  {
    id: "quote-attribution",
    shouldRender: (block, tags) => tags.includes("quote-attribution"),
    render: ({ block }) => <QuoteAttributionCard block={block} />
  },

  {
    id: "published-episode",
    shouldRender: (block, tags) => tags.includes("published-episode") && publishedEpisodeLinks(block).length > 0,
    render: ({ block }) => <PublishedEpisodeCard block={block} />
  },
  {
    id: "clip-cue",
    shouldRender: (block, tags) => tags.includes("clip-cue") || tags.includes("youtube-clip") || hasYouTubeClipCue(block.text),
    render: ({ block, onTextChange, onTextCommit }) => (
      <ClipCueCard
        text={block.text}
        onChange={(nextText) => onTextChange(block.id, nextText)}
        onCommit={(nextText) => onTextCommit(block.id, nextText)}
      />
    )
  }
];
