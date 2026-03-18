// @ts-nocheck
import * as __fd_glob_7 from "../content/docs/preface.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/introduction.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/index.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/episode-003.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/episode-002.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/episode-001.mdx?collection=docs"
import * as __fd_glob_1 from "../content/docs/chapter-zero-in-the-beginning.mdx?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, }, {"chapter-zero-in-the-beginning.mdx": __fd_glob_1, "episode-001.mdx": __fd_glob_2, "episode-002.mdx": __fd_glob_3, "episode-003.mdx": __fd_glob_4, "index.mdx": __fd_glob_5, "introduction.mdx": __fd_glob_6, "preface.mdx": __fd_glob_7, });