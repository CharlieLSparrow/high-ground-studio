import { getPrismaClient } from '@/lib/prisma';
import Link from 'next/link';
import { Film, Filter, Folder, Inbox, Plus, Search, Share2, Tag } from 'lucide-react';
import {
  ensureHomeNestForEmail,
  getCurrentHomeNestActorEmail,
  listProjectsVisibleToEmail,
} from '@/lib/server/home-nest';
import { sourceLabelForNestKind } from '@/lib/studio/project-registry';
import {
  attachAssetToProject,
  detachAssetFromProject,
  seedDummyVideo,
  syncAssetMediaTags,
} from './actions';

export const dynamic = 'force-dynamic';

type SearchParams = {
  projectId?: string;
  binId?: string;
  tag?: string;
  q?: string;
  source?: string;
};

function normalizeSearchParam(value?: string) {
  if (!value || typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned.length === 0 ? undefined : cleaned.toLowerCase();
}

function buildMediaHref(
  options: { projectId?: string; binId?: string; tag?: string; q?: string },
) {
  const params = new URLSearchParams();

  const projectId = normalizeSearchParam(options.projectId);
  const binId = normalizeSearchParam(options.binId);
  const tag = normalizeSearchParam(options.tag);
  const q = normalizeSearchParam(options.q);

  if (projectId && projectId !== 'all') params.set('projectId', projectId);
  if (binId && binId !== 'all') params.set('binId', binId);
  if (tag) params.set('tag', tag);
  if (q) params.set('q', q);

  const search = params.toString();
  return `/media${search ? `?${search}` : ''}`;
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }

  return out;
}

function describeMediaDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code === "ECONNREFUSED" || message.includes("ECONNREFUSED")) {
    return "The local database connection is unavailable.";
  }
  return "The media database request failed.";
}

export default async function MediaLibraryPage({ searchParams }: { searchParams: SearchParams }) {
  const prisma = getPrismaClient();
  const actorEmail = await getCurrentHomeNestActorEmail();

  if (!actorEmail) {
    return <><div className="p-8">Sign in to open your media vault.</div></>;
  }

  let homeNest: Awaited<ReturnType<typeof ensureHomeNestForEmail>>;
  let projects: Awaited<ReturnType<typeof listProjectsVisibleToEmail>>;
  let mediaTags: Awaited<ReturnType<typeof prisma.studioMediaTag.findMany>>;

  try {
    homeNest = await ensureHomeNestForEmail(actorEmail, prisma);
    projects = await listProjectsVisibleToEmail(actorEmail, prisma);
    mediaTags = await prisma.studioMediaTag.findMany({
      orderBy: { label: 'asc' },
    });
  } catch (error) {
    console.error('[media] Failed to load media vault', error);
    const message = describeMediaDatabaseError(error);
    return (
      <>
        <div className="mx-auto max-w-2xl p-8">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
            <h1 className="text-2xl font-black">Media vault is waiting on the database</h1>
            <p className="mt-3 text-sm leading-6">
              Your Home Nest and media attachments are database-backed. The app is running, but the local database connection is not available right now.
            </p>
            <p className="mt-4 rounded-lg bg-white/70 p-3 font-mono text-xs text-amber-900">{message}</p>
          </div>
        </div>
      </>
    );
  }

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const accessibleProjectIds = projects.map((project) => project.id);

  const requestedProjectId = normalizeSearchParam(searchParams.projectId) || homeNest.id;
  const selectedProjectId =
    requestedProjectId === 'all' || projectById.has(requestedProjectId)
      ? requestedProjectId
      : homeNest.id;
  const selectedBinId = normalizeSearchParam(searchParams.binId) || 'all';
  const selectedTagSlug = normalizeSearchParam(searchParams.tag);
  const mediaQuery = normalizeSearchParam(searchParams.q) || '';
  const source = normalizeSearchParam(searchParams.source);
  const isMobileSource = source === 'iphone';
  const selectedProject = selectedProjectId !== 'all' ? projectById.get(selectedProjectId) : null;
  const selectedProjectIsHome = selectedProject?.sourceLabel === sourceLabelForNestKind('home');

  const selectedTag = selectedTagSlug
    ? mediaTags.find((tag) => tag.slug.toLowerCase() === selectedTagSlug)
    : null;

  const projectLabel =
    selectedProjectId === 'all'
      ? 'your accessible media'
      : projectById.get(selectedProjectId)?.name || 'selected nest';

  const bins =
    selectedProjectId !== 'all'
      ? await prisma.mediaBin.findMany({
        where: { projectId: selectedProjectId },
        orderBy: { name: 'asc' },
      })
      : [];

  const assets = await prisma.studioMediaAsset.findMany({
    where: {
      ...(selectedProjectId === 'all'
        ? {
            OR: [
              { isGlobal: true },
              { projects: { some: { id: { in: accessibleProjectIds } } } },
            ],
          }
        : {
            OR: [
              { isGlobal: true },
              { projects: { some: { id: selectedProjectId } } },
            ],
          }),
      ...(selectedProjectId !== 'all' && selectedBinId !== 'all'
        ? { mediaBinId: selectedBinId }
        : {}),
      ...(selectedTag
        ? {
            mediaTags: {
              some: { slug: selectedTag.slug },
            },
          }
        : {}),
      ...(mediaQuery
        ? {
            filename: {
              contains: mediaQuery,
            },
          }
        : {}),
    },
    include: {
      clips: {
        orderBy: { inTimecode: 'asc' },
      },
      projects: {
        select: { id: true, name: true, sourceLabel: true },
      },
      mediaTags: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <>
      <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
        <header className="mb-8 flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
              <Film className="text-indigo-500" />
              Media Vault
            </h1>
            <p className="text-zinc-500 mt-2">
              Go through media for {projectLabel}
              {selectedTag ? ` · filtered by ${selectedTag.label}` : ''}
              . Uploads land in your Home Nest first, then attach to any working Nest when they are ready.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
                <Inbox size={15} />
                Home Nest intake
              </div>
              <p className="mt-2 text-xs leading-5 text-emerald-900">
                Every signed-in user has a private Home Nest. New uploads and test assets land there unless you explicitly choose a working Nest.
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-cyan-950">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
                <Folder size={15} />
                Working Nest attachment
              </div>
              <p className="mt-2 text-xs leading-5 text-cyan-900">
                Attaching an asset to a working Nest makes that same asset visible in the Nest tools. It does not duplicate the file.
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
                <Share2 size={15} />
                Sharing follows Nests
              </div>
              <p className="mt-2 text-xs leading-5 text-amber-900">
                Sharing a Nest exposes assets attached to that Nest. Sharing your Home Nest is allowed, but should be deliberate.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <form action="" className="relative" method="GET">
              <label className="sr-only" htmlFor="media-query">Search media</label>
              <Search className="absolute left-3 top-2.5 text-zinc-400" size={16} />
              <input
                id="media-query"
                name="q"
                defaultValue={mediaQuery}
                placeholder="Search filename"
                className="pl-9 pr-3 py-2 w-full md:w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input type="hidden" name="projectId" value={selectedProjectId} />
              <input type="hidden" name="tag" value={selectedTagSlug || ''} />
              <input type="hidden" name="binId" value={selectedBinId} />
            </form>

            <form action="" method="GET" className="flex">
              <input type="hidden" name="q" value={mediaQuery} />
              <input type="hidden" name="binId" value={selectedBinId} />
              <input type="hidden" name="tag" value={selectedTagSlug || ''} />
              <select
                name="projectId"
                className="px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                defaultValue={selectedProjectId}
                onChange={(e) => e.currentTarget.form?.submit()}
              >
                <option value="all">All accessible media</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.sourceLabel === sourceLabelForNestKind('home') ? 'Home Nest · ' : ''}
                    {project.name}
                  </option>
                ))}
              </select>
            </form>

            <Link
              href={buildMediaHref({ projectId: selectedProjectId, q: mediaQuery })}
              className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg font-medium text-zinc-600 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700"
            >
              Clear filters
            </Link>

            <form
              action={async () => {
                'use server';
                if (selectedProjectId && selectedProjectId !== 'all') {
                  await seedDummyVideo(selectedProjectId);
                  return;
                }
                await seedDummyVideo(homeNest.id);
              }}
              className="ml-auto"
            >
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
                title={selectedProjectId === 'all' ? 'Creates a test asset in your Home Nest.' : 'Creates a test asset attached to the selected Nest.'}
              >
                <Plus size={18} /> Add dummy asset
              </button>
            </form>
          </div>

          <div className="mt-2 flex flex-wrap gap-2 items-center">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 inline-flex items-center gap-1">
              <Tag size={14} />
              Tag filter
            </span>
            <Link
              href={buildMediaHref({
                projectId: selectedProjectId,
                binId: selectedBinId,
                q: mediaQuery,
              })}
              className={`px-3 py-1 rounded-full text-xs border ${
                !selectedTagSlug
                  ? 'text-white bg-indigo-600 border-indigo-600'
                  : 'text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700'
              }`}
            >
              All
            </Link>
            {mediaTags.map((tag) => {
              const isActive = selectedTagSlug === tag.slug;
              return (
                <Link
                  key={tag.id}
                  href={buildMediaHref({
                    projectId: selectedProjectId,
                    binId: selectedBinId,
                    q: mediaQuery,
                    tag: tag.slug,
                  })}
                  className={`px-3 py-1 rounded-full text-xs border ${
                    isActive ? 'text-white border-transparent' : 'text-zinc-700 dark:text-zinc-200'
                  }`}
                  style={{
                    backgroundColor: isActive ? tag.color : 'transparent',
                    borderColor: tag.color,
                    color: isActive ? '#fff' : tag.color,
                  }}
                >
                  {tag.label}
                </Link>
              );
            })}
          </div>
        </header>

        <div className="flex-1 flex gap-8">
          {/* Bins Sidebar */}
          <div className="w-64 flex-shrink-0 flex flex-col gap-2">
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-2">Media Bins</h3>
            <p className="px-3 py-1.5 text-xs text-zinc-500">
              Bins stay Nest-scoped. Assets can attach to Home Nest first, then to one or more working Nests.
            </p>
            {selectedProjectId !== 'all' && (
              <>
                <Link
                  href={buildMediaHref({
                    projectId: 'all',
                    tag: selectedTagSlug || undefined,
                    q: mediaQuery,
                  })}
                  className="flex items-center gap-2 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 font-medium"
                >
                <Film size={18} /> All Accessible Media
                </Link>
                <Link
                  href={buildMediaHref({
                    projectId: selectedProjectId,
                    tag: selectedTagSlug || undefined,
                    q: mediaQuery,
                    binId: undefined,
                  })}
                  className="flex items-center gap-2 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 font-medium"
                >
                  <Folder size={18} /> {selectedProjectIsHome ? 'Home Nest Inbox' : 'Nest Bins'}
                </Link>
                {bins.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-zinc-500">No bins yet. Create bins from the episode-production workflow.</p>
                ) : (
                  bins.map((bin) => {
                    const isActive = bin.id === selectedBinId;
                    return (
                      <Link
                        key={bin.id}
                        href={buildMediaHref({
                          projectId: selectedProjectId,
                          binId: bin.id,
                          tag: selectedTagSlug || undefined,
                          q: mediaQuery,
                        })}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-600 dark:text-zinc-400 font-medium transition-colors ${
                          isActive
                            ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-200 font-semibold'
                            : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <Folder size={18} />
                        <span>{bin.name}</span>
                      </Link>
                    );
                  })
                )}
              </>
            )}
            {selectedProjectId === 'all' && (
              <p className="px-3 py-2 text-xs text-zinc-500">
                Accessible view. Select Home Nest to sort personal uploads, or a working Nest to see what collaborators can use there.
              </p>
            )}
            {selectedBinId !== 'all' && selectedProjectId !== 'all' ? (
              <Link
                href={buildMediaHref({
                  projectId: selectedProjectId,
                  tag: selectedTagSlug || undefined,
                  q: mediaQuery,
                })}
                className="mt-2 px-3 py-2 text-xs inline-flex items-center gap-2 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400"
              >
                <Filter size={12} />
                Clear bin filter
              </Link>
            ) : null}
          </div>

          {/* Asset Grid */}
          <div className="flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {assets.map((asset) => {
                const belongsToProject =
                  selectedProjectId !== 'all' && asset.projects?.some((project: any) => project.id === selectedProjectId);
                const isLastHomeAttachment =
                  selectedProjectIsHome && belongsToProject && (asset.projects?.length || 0) <= 1;
                const attachedHomeCount = asset.projects?.filter((project: any) => project.sourceLabel === sourceLabelForNestKind('home')).length || 0;
                const attachedWorkingCount = Math.max((asset.projects?.length || 0) - attachedHomeCount, 0);

                return (
                  <article
                    key={asset.id}
                    className="group block bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm hover:shadow-md hover:border-indigo-500 transition-all"
                  >
                    <div className="aspect-video bg-zinc-900 relative">
                      {asset.thumbnailUrl ? (
                        <img
                          src={asset.thumbnailUrl}
                          alt={asset.filename}
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <Film size={32} />
                        </div>
                      )}
                      {asset.duration && (
                        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 text-white text-xs font-mono rounded">
                          {Math.floor(asset.duration / 60)}:{(asset.duration % 60).toString().padStart(2, '0')}
                        </div>
                      )}
                    </div>

                    <div className="p-4">
                      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate mb-1" title={asset.filename}>
                        {asset.filename}
                      </h4>

                      <div className="flex items-center justify-between text-xs text-zinc-500">
                        <span>
                          {asset.resolution || 'Unknown'} • {asset.fps || '--'}fps
                        </span>
                        <span className="font-medium px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded">{asset.clips.length} clips</span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {attachedHomeCount > 0 ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-100">
                            Home Nest
                          </span>
                        ) : null}
                        {attachedWorkingCount > 0 ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-100">
                            {attachedWorkingCount} working Nest{attachedWorkingCount === 1 ? '' : 's'}
                          </span>
                        ) : null}
                        {asset.isGlobal && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-100">
                            legacy global
                          </span>
                        )}
                        {asset.mediaTags?.map((tag: any) => (
                          <Link
                            key={tag.id}
                            href={buildMediaHref({
                              projectId: selectedProjectId,
                              binId: selectedBinId,
                              q: mediaQuery,
                              tag: tag.slug,
                            })}
                            className="text-[10px] px-2 py-0.5 rounded-full border"
                            style={{ borderColor: tag.color || '#c4b5a4', color: tag.color || '#8c6b4a' }}
                          >
                            {tag.label}
                          </Link>
                        ))}
                      </div>

                      {mediaTags.length > 0 ? (
                        <div className="mt-2">
                          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-2">Quick tag review labels</p>
                          <div className="flex flex-wrap gap-1">
                            {mediaTags.map((assetTag) => {
                              const alreadyHas = asset.mediaTags?.some((tag: { id: string }) => tag.id === assetTag.id);
                              const nextTagIds = dedupeStrings(
                                alreadyHas
                                  ? (asset.mediaTags ?? []).map((item: { id: string }) => item.id).filter((itemId) => itemId !== assetTag.id)
                                  : [...(asset.mediaTags ?? []).map((item: { id: string }) => item.id), assetTag.id],
                              );

                              return (
                                <form
                                  key={`${asset.id}-tag-${assetTag.id}`}
                                  action={async () => {
                                    'use server';
                                    await syncAssetMediaTags(asset.id, nextTagIds, []);
                                  }}
                                >
                                  <button
                                    type="submit"
                                    className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                                      alreadyHas
                                        ? 'text-white'
                                        : 'text-zinc-500 hover:text-zinc-800'
                                    }`}
                                    style={{
                                      backgroundColor: alreadyHas ? assetTag.color || '#8c6b4a' : 'transparent',
                                      borderColor: assetTag.color || '#c4b5a4',
                                      color: alreadyHas ? '#fff' : assetTag.color || '#8c6b4a',
                                    }}
                                  >
                                    {alreadyHas ? '✓' : '+'} {assetTag.label}
                                  </button>
                                </form>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-3 flex gap-2">
                        {selectedProjectId !== 'all' && (
                          <>
                            {isLastHomeAttachment ? (
                              <span className="text-xs px-2 py-1 rounded border text-zinc-500">
                                Home landing place
                              </span>
                            ) : belongsToProject ? (
                              <form action={async () => detachAssetFromProject(asset.id, selectedProjectId)}>
                                <button className="text-xs px-2 py-1 rounded border text-zinc-500 hover:text-zinc-900 hover:border-amber-500">
                                  Detach from this Nest
                                </button>
                              </form>
                            ) : (
                              <form action={async () => attachAssetToProject(asset.id, selectedProjectId)}>
                                <button className="text-xs px-2 py-1 rounded border text-zinc-500 hover:text-zinc-900 hover:border-emerald-500">
                                  Attach to this Nest
                                </button>
                              </form>
                            )}
                          </>
                        )}

                        <span className="text-[10px] px-2 py-1 rounded border text-zinc-500">
                          in {asset.projects?.length || 0} nest(s)
                        </span>

                        <Link
                          href={`/media/${asset.id}${isMobileSource ? '?source=iphone' : ''}`}
                          className="text-xs px-2 py-1 rounded border text-indigo-700 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                        >
                          Open logger
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}

              {assets.length === 0 && (
                <div className="col-span-full py-20 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                  <Film size={48} className="mx-auto mb-4 opacity-20" />
                  <h3 className="text-xl font-medium text-zinc-500">No media found</h3>
                  <p className="text-zinc-400 mt-2">
                    {selectedProjectId === 'all'
                      ? 'Your accessible media will appear here after uploads land in Home Nest or are attached to shared Nests.'
                      : selectedProjectIsHome
                        ? 'Your personal uploads will land here first. Add a dummy asset to test the intake flow.'
                        : 'Attach assets from Home Nest or import directly into this working Nest when the project needs media.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
