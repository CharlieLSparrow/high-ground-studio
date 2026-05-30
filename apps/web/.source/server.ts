// @ts-nocheck
import * as __fd_glob_1 from "../content/publish/news/ai/antigravity.mdx?collection=news"
import * as __fd_glob_0 from "../content/publish/learn/ukulele/intro.mdx?collection=learn"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const episodes = await create.docs("episodes", "content/publish/episodes", {}, {});

export const learn = await create.docs("learn", "content/publish/learn", {}, {"ukulele/intro.mdx": __fd_glob_0, });

export const news = await create.docs("news", "content/publish/news", {}, {"ai/antigravity.mdx": __fd_glob_1, });