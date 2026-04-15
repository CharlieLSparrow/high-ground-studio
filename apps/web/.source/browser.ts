// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"chapter-zero-in-the-beginning.mdx": () => import("../content/publish/chapter-zero-in-the-beginning.mdx?collection=docs"), "episode-001.mdx": () => import("../content/publish/episode-001.mdx?collection=docs"), "episode-002.mdx": () => import("../content/publish/episode-002.mdx?collection=docs"), "episode-003.mdx": () => import("../content/publish/episode-003.mdx?collection=docs"), "index.mdx": () => import("../content/publish/index.mdx?collection=docs"), "introduction.mdx": () => import("../content/publish/introduction.mdx?collection=docs"), "know-where-you-came-from.mdx": () => import("../content/publish/know-where-you-came-from.mdx?collection=docs"), "look-for-lessons.mdx": () => import("../content/publish/look-for-lessons.mdx?collection=docs"), "preface.mdx": () => import("../content/publish/preface.mdx?collection=docs"), "write-it-down.mdx": () => import("../content/publish/write-it-down.mdx?collection=docs"), "book/in-the-beginning.mdx": () => import("../content/publish/book/in-the-beginning.mdx?collection=docs"), "book/introduction.mdx": () => import("../content/publish/book/introduction.mdx?collection=docs"), "book/preface.mdx": () => import("../content/publish/book/preface.mdx?collection=docs"), }),
};
export default browserCollections;