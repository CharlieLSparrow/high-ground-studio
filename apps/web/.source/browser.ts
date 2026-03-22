// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"chapter-zero-in-the-beginning.mdx": () => import("../content/docs/chapter-zero-in-the-beginning.mdx?collection=docs"), "episode-001.mdx": () => import("../content/docs/episode-001.mdx?collection=docs"), "episode-002.mdx": () => import("../content/docs/episode-002.mdx?collection=docs"), "episode-003.mdx": () => import("../content/docs/episode-003.mdx?collection=docs"), "index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "introduction.mdx": () => import("../content/docs/introduction.mdx?collection=docs"), "preface.mdx": () => import("../content/docs/preface.mdx?collection=docs"), "book/in-the-beginning.mdx": () => import("../content/docs/book/in-the-beginning.mdx?collection=docs"), "book/introduction.mdx": () => import("../content/docs/book/introduction.mdx?collection=docs"), "book/preface.mdx": () => import("../content/docs/book/preface.mdx?collection=docs"), "episodes/know-where-you-came-from.mdx": () => import("../content/docs/episodes/know-where-you-came-from.mdx?collection=docs"), "episodes/look-for-lessons.mdx": () => import("../content/docs/episodes/look-for-lessons.mdx?collection=docs"), "episodes/write-it-down.mdx": () => import("../content/docs/episodes/write-it-down.mdx?collection=docs"), }),
};
export default browserCollections;