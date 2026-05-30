// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  episodes: create.doc("episodes", {}),
  learn: create.doc("learn", {"ukulele/intro.mdx": () => import("../content/publish/learn/ukulele/intro.mdx?collection=learn"), }),
  news: create.doc("news", {"ai/antigravity.mdx": () => import("../content/publish/news/ai/antigravity.mdx?collection=news"), }),
};
export default browserCollections;