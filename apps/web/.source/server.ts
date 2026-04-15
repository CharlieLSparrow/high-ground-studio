// @ts-nocheck
import * as __fd_glob_13 from "../content/publish/book/preface.mdx?collection=docs"
import * as __fd_glob_12 from "../content/publish/book/introduction.mdx?collection=docs"
import * as __fd_glob_11 from "../content/publish/book/in-the-beginning.mdx?collection=docs"
import * as __fd_glob_10 from "../content/publish/write-it-down.mdx?collection=docs"
import * as __fd_glob_9 from "../content/publish/preface.mdx?collection=docs"
import * as __fd_glob_8 from "../content/publish/look-for-lessons.mdx?collection=docs"
import * as __fd_glob_7 from "../content/publish/know-where-you-came-from.mdx?collection=docs"
import * as __fd_glob_6 from "../content/publish/introduction.mdx?collection=docs"
import * as __fd_glob_5 from "../content/publish/index.mdx?collection=docs"
import * as __fd_glob_4 from "../content/publish/episode-003.mdx?collection=docs"
import * as __fd_glob_3 from "../content/publish/episode-002.mdx?collection=docs"
import * as __fd_glob_2 from "../content/publish/episode-001.mdx?collection=docs"
import * as __fd_glob_1 from "../content/publish/chapter-zero-in-the-beginning.mdx?collection=docs"
import { default as __fd_glob_0 } from "../content/publish/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/publish", {"meta.json": __fd_glob_0, }, {"chapter-zero-in-the-beginning.mdx": __fd_glob_1, "episode-001.mdx": __fd_glob_2, "episode-002.mdx": __fd_glob_3, "episode-003.mdx": __fd_glob_4, "index.mdx": __fd_glob_5, "introduction.mdx": __fd_glob_6, "know-where-you-came-from.mdx": __fd_glob_7, "look-for-lessons.mdx": __fd_glob_8, "preface.mdx": __fd_glob_9, "write-it-down.mdx": __fd_glob_10, "book/in-the-beginning.mdx": __fd_glob_11, "book/introduction.mdx": __fd_glob_12, "book/preface.mdx": __fd_glob_13, });