(function () {
  const DATA_URL = "data/course_data.json";
  const STORAGE_KEY = "pathways-study-workbench:v1";
  const QUICK_TAGS = ["rewrite", "example", "review", "confusing", "mastered", "assignment", "video"];
  const ASSIGNMENT_TERMS = [
    "assignment",
    "project",
    "activity",
    "submit",
    "prove",
    "report",
    "case study",
    "deliverable",
    "challenge",
    "exercise",
    "status update",
    "team activity",
  ];

  const elements = {
    dataStatus: document.getElementById("dataStatus"),
    syncStatus: document.getElementById("syncStatus"),
    modeDock: document.getElementById("modeDock"),
    courseSelect: document.getElementById("courseSelect"),
    searchInput: document.getElementById("searchInput"),
    assignmentFilterButton: document.getElementById("assignmentFilterButton"),
    focusModeButton: document.getElementById("focusModeButton"),
    exportButton: document.getElementById("exportButton"),
    importInput: document.getElementById("importInput"),
    catalog: document.getElementById("catalog"),
    catalogSubtitle: document.getElementById("catalogSubtitle"),
    catalogSearchInput: document.getElementById("catalogSearchInput"),
    certificateFilter: document.getElementById("certificateFilter"),
    catalogSort: document.getElementById("catalogSort"),
    pathAisles: document.getElementById("pathAisles"),
    studyCockpit: document.getElementById("studyCockpit"),
    continuePanel: document.getElementById("continuePanel"),
    studyCart: document.getElementById("studyCart"),
    courseGrid: document.getElementById("courseGrid"),
    lessonShelfTitle: document.getElementById("lessonShelfTitle"),
    lessonShelfMeta: document.getElementById("lessonShelfMeta"),
    lessonShelf: document.getElementById("lessonShelf"),
    openCourseButton: document.getElementById("openCourseButton"),
    reviewDeck: document.getElementById("reviewDeck"),
    reviewDeckMeta: document.getElementById("reviewDeckMeta"),
    reviewTagSelect: document.getElementById("reviewTagSelect"),
    reviewScopeSelect: document.getElementById("reviewScopeSelect"),
    startReviewButton: document.getElementById("startReviewButton"),
    reviewQueue: document.getElementById("reviewQueue"),
    pageCount: document.getElementById("pageCount"),
    blockCount: document.getElementById("blockCount"),
    editedCount: document.getElementById("editedCount"),
    clearFiltersButton: document.getElementById("clearFiltersButton"),
    showHiddenToggle: document.getElementById("showHiddenToggle"),
    assignmentOnlyToggle: document.getElementById("assignmentOnlyToggle"),
    outline: document.getElementById("outline"),
    tagFilters: document.getElementById("tagFilters"),
    dbSearchButton: document.getElementById("dbSearchButton"),
    dbSearchInput: document.getElementById("dbSearchInput"),
    dbSearchResults: document.getElementById("dbSearchResults"),
    content: document.getElementById("content"),
    selectionEmpty: document.getElementById("selectionEmpty"),
    selectionPanel: document.getElementById("selectionPanel"),
    selectionMeta: document.getElementById("selectionMeta"),
    selectionTags: document.getElementById("selectionTags"),
    quickTags: document.getElementById("quickTags"),
    selectionNotes: document.getElementById("selectionNotes"),
    resetBlockButton: document.getElementById("resetBlockButton"),
    hideBlockButton: document.getElementById("hideBlockButton"),
    exportMode: document.getElementById("exportMode"),
    exportTagInput: document.getElementById("exportTagInput"),
    previewReviewButton: document.getElementById("previewReviewButton"),
    exportMarkdownButton: document.getElementById("exportMarkdownButton"),
    reviewPreview: document.getElementById("reviewPreview"),
    agentContextSummary: document.getElementById("agentContextSummary"),
    copyAgentContextButton: document.getElementById("copyAgentContextButton"),
    downloadAgentContextButton: document.getElementById("downloadAgentContextButton"),
    agentContextPreview: document.getElementById("agentContextPreview"),
    transcriptImport: document.getElementById("transcriptImport"),
    attachTranscriptButton: document.getElementById("attachTranscriptButton"),
    transcriptPreview: document.getElementById("transcriptPreview"),
    pageTemplate: document.getElementById("pageTemplate"),
    blockTemplate: document.getElementById("blockTemplate"),
  };

  const state = {
    source: null,
    activeCourseCode: "",
    activeMode: "browse",
    selectedBlockId: "",
    selectedTag: "",
    query: "",
    catalogQuery: "",
    certificateFilter: "all",
    catalogSort: "sequence",
    reviewTag: "review",
    reviewScope: "active",
    showHidden: false,
    assignmentOnly: false,
    focusMode: false,
    user: loadUserState(),
    blockIndex: new Map(),
    pageIndex: new Map(),
    saveTimer: null,
    syncTimer: null,
    apiAvailable: false,
    syncing: false,
    pendingSync: false,
    fullSyncRequested: false,
    dirtyBlocks: new Set(),
    dirtyTranscripts: new Set(),
  };

  function loadUserState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        schemaVersion: 1,
        blocks: parsed.blocks || {},
        transcripts: parsed.transcripts || {},
        importedAt: parsed.importedAt || "",
      };
    } catch (error) {
      console.warn("Could not read local study state", error);
      return { schemaVersion: 1, blocks: {}, transcripts: {}, importedAt: "" };
    }
  }

  function scheduleSave() {
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.user));
      updateStats();
      scheduleRemoteSync();
    }, 180);
  }

  function saveNow() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.user));
    updateStats();
    scheduleRemoteSync(0);
  }

  function markBlockDirty(blockId) {
    state.dirtyBlocks.add(blockId);
  }

  function markTranscriptDirty(blockId) {
    state.dirtyTranscripts.add(blockId);
  }

  function requestFullSync() {
    state.fullSyncRequested = true;
  }

  function scheduleRemoteSync(delay = 550) {
    if (!state.apiAvailable) {
      updateSyncStatus("Storage: browser");
      return;
    }
    window.clearTimeout(state.syncTimer);
    state.syncTimer = window.setTimeout(syncRemoteState, delay);
  }

  async function syncRemoteState() {
    if (!state.apiAvailable) {
      return;
    }
    if (state.syncing) {
      state.pendingSync = true;
      return;
    }
    state.syncing = true;
    state.pendingSync = false;
    updateSyncStatus("Syncing to SQLite...");
    try {
      if (state.fullSyncRequested) {
        const response = await fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user: state.user }),
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        state.fullSyncRequested = false;
        state.dirtyBlocks.clear();
        state.dirtyTranscripts.clear();
        updateSyncStatus(`SQLite full save ${result.savedAt || ""}`.trim());
      } else {
        const blockIds = [...state.dirtyBlocks];
        const transcriptIds = [...state.dirtyTranscripts];
        state.dirtyBlocks.clear();
        state.dirtyTranscripts.clear();
        try {
          await Promise.all([
            ...blockIds.map((blockId) => syncOneBlock(blockId)),
            ...transcriptIds.map((blockId) => syncOneTranscript(blockId)),
          ]);
        } catch (error) {
          blockIds.forEach((blockId) => state.dirtyBlocks.add(blockId));
          transcriptIds.forEach((blockId) => state.dirtyTranscripts.add(blockId));
          throw error;
        }
        updateSyncStatus(`SQLite saved ${new Date().toLocaleTimeString()}`);
      }
    } catch (error) {
      console.warn("Remote sync failed", error);
      state.apiAvailable = false;
      updateSyncStatus("Storage: browser fallback");
    } finally {
      state.syncing = false;
      if (state.pendingSync || state.dirtyBlocks.size || state.dirtyTranscripts.size || state.fullSyncRequested) {
        scheduleRemoteSync(0);
      }
    }
  }

  async function syncOneBlock(blockId) {
    const block = state.user.blocks[blockId];
    if (!block) {
      const response = await fetch(`/api/blocks/${encodeURIComponent(blockId)}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(`Block delete failed: ${response.status}`);
      }
      return response.json();
    }
    const response = await fetch(`/api/blocks/${encodeURIComponent(blockId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ block }),
    });
    if (!response.ok) {
      throw new Error(`Block sync failed: ${response.status}`);
    }
    return response.json();
  }

  async function syncOneTranscript(blockId) {
    const cues = state.user.transcripts[blockId] || [];
    const method = cues.length ? "PUT" : "DELETE";
    const response = await fetch(`/api/transcripts/${encodeURIComponent(blockId)}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: cues.length ? JSON.stringify({ cues }) : undefined,
    });
    if (!response.ok) {
      throw new Error(`Transcript sync failed: ${response.status}`);
    }
    return response.json();
  }

  function updateSyncStatus(message) {
    elements.syncStatus.textContent = message;
  }

  async function initializeRemoteState() {
    try {
      const health = await fetch("/api/health", { cache: "no-store" });
      if (!health.ok) {
        throw new Error("API unavailable");
      }
      state.apiAvailable = true;
      const localHasStudyLayer = Object.keys(state.user.blocks).length > 0 || Object.keys(state.user.transcripts).length > 0;
      const response = await fetch("/api/state", { cache: "no-store" });
      if (response.ok) {
        const remote = await response.json();
        mergeRemoteState(remote);
      }
      updateSyncStatus("Storage: SQLite + browser");
      if (localHasStudyLayer) {
        requestFullSync();
        scheduleRemoteSync(0);
      }
    } catch (_error) {
      state.apiAvailable = false;
      updateSyncStatus("Storage: browser");
    }
  }

  function mergeRemoteState(remote) {
    const remoteBlocks = remote.blocks || {};
    const remoteTranscripts = remote.transcripts || {};
    state.user.blocks = { ...remoteBlocks, ...state.user.blocks };
    state.user.transcripts = { ...remoteTranscripts, ...state.user.transcripts };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.user));
  }

  function getBlockState(block) {
    const saved = state.user.blocks[block.id] || {};
    return {
      draft: Object.prototype.hasOwnProperty.call(saved, "draft") ? saved.draft : block.source_text,
      tags: saved.tags || [],
      annotations: saved.annotations || "",
      hidden: Boolean(saved.hidden),
      updatedAt: saved.updatedAt || "",
    };
  }

  function persistBlockState(block) {
    if (!state.user.blocks[block.id]) {
      state.user.blocks[block.id] = {};
    }
    return state.user.blocks[block.id];
  }

  function pruneBlockState(block) {
    const saved = state.user.blocks[block.id];
    if (!saved) {
      return;
    }
    const hasDraft = Object.prototype.hasOwnProperty.call(saved, "draft") && saved.draft !== block.source_text;
    const hasTags = Array.isArray(saved.tags) && saved.tags.length > 0;
    const hasNotes = Boolean(saved.annotations);
    const isHidden = Boolean(saved.hidden);
    if (!hasDraft && !hasTags && !hasNotes && !isHidden) {
      delete state.user.blocks[block.id];
    }
  }

  function text(value) {
    return value == null ? "" : String(value);
  }

  function normalized(value) {
    return text(value).toLowerCase();
  }

  function displayPageTitle(page) {
    return page.extracted_title || page.html_title || page.link_text || page.lesson || page.url;
  }

  function getActiveCourse() {
    return state.source.courses.find((course) => course.code === state.activeCourseCode) || state.source.courses[0];
  }

  function indexSource() {
    state.blockIndex.clear();
    state.pageIndex.clear();
    for (const course of state.source.courses) {
      for (const page of course.pages) {
        state.pageIndex.set(page.id, { course, page });
        for (const block of page.blocks) {
          state.blockIndex.set(block.id, { course, page, block });
        }
      }
    }
  }

  function initCourseSelect() {
    elements.courseSelect.innerHTML = "";
    for (const course of state.source.courses) {
      const option = document.createElement("option");
      option.value = course.code;
      option.textContent = `${course.code} - ${course.title}`;
      elements.courseSelect.appendChild(option);
    }
    state.activeCourseCode = state.source.courses[0]?.code || "";
    elements.courseSelect.value = state.activeCourseCode;
    initCatalogFilters();
  }

  function initCatalogFilters() {
    const certificates = [...new Set(state.source.courses.map((course) => course.certificate))].sort();
    elements.certificateFilter.innerHTML = '<option value="all">All paths</option>';
    for (const certificate of certificates) {
      const option = document.createElement("option");
      option.value = certificate;
      option.textContent = certificate;
      elements.certificateFilter.appendChild(option);
    }
  }

  function render() {
    if (!state.source) {
      return;
    }
    renderModeDock();
    renderCatalog();
    renderReviewDeck();
    renderOutline();
    renderTagFilters();
    renderContent();
    renderSelection();
    updateStats();
    buildReviewPreview();
    renderAgentContext();
  }

  function renderModeDock() {
    document.body.dataset.uiMode = state.activeMode;
    document.body.classList.toggle("assignment-filter-active", state.assignmentOnly);
    elements.assignmentFilterButton.classList.toggle("active", state.assignmentOnly);
    elements.assignmentFilterButton.setAttribute("aria-pressed", state.assignmentOnly ? "true" : "false");
    elements.assignmentOnlyToggle.checked = state.assignmentOnly;
    elements.modeDock.querySelectorAll("button[data-mode]").forEach((button) => {
      const active = button.dataset.mode === state.activeMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
  }

  function renderCatalog() {
    const courses = getCatalogCourses();
    elements.catalogSubtitle.textContent = `${courses.length} courses visible · ${state.source.stats.pages} pages · ${state.source.stats.blocks} source blocks${state.assignmentOnly ? " · assignments only" : ""}`;
    renderPathAisles();
    renderStudyCockpit(courses);
    renderStorefront();
    elements.courseGrid.innerHTML = "";
    for (const course of courses) {
      elements.courseGrid.appendChild(renderCourseCard(course));
    }
    if (!courses.length) {
      elements.courseGrid.innerHTML = '<section class="panel empty-state">No courses match the catalog filters.</section>';
    }
    renderLessonShelf();
  }

  function renderStudyCockpit(visibleCourses) {
    const activeCourse = getActiveCourse();
    const activeStats = getCourseStats(activeCourse);
    const global = getGlobalStudyStats();
    const cards = [
      { label: "Active shelf", value: activeCourse.code, detail: activeCourse.title },
      { label: "Touched", value: formatCount(global.touchedBlocks), detail: `${global.annotatedBlocks} notes · ${global.taggedBlocks} tagged` },
      { label: "Visible", value: formatCount(visibleCourses.length), detail: `${state.certificateFilter === "all" ? "all paths" : state.certificateFilter}` },
      { label: "Shelf progress", value: `${activeStats.progress}%`, detail: `${activeStats.editedBlocks}/${activeStats.blocks} blocks` },
    ];
    elements.studyCockpit.innerHTML = cards
      .map(
        (card) => `
          <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm" data-agent-cockpit-card="${escapeAttribute(card.label)}">
            <div class="text-xs font-bold uppercase tracking-wide text-slate-500">${escapeHtml(card.label)}</div>
            <div class="mt-1 text-2xl font-black text-slate-900">${escapeHtml(card.value)}</div>
            <div class="mt-1 truncate text-sm text-slate-500">${escapeHtml(card.detail)}</div>
          </div>
        `,
      )
      .join("");
  }

  function renderPathAisles() {
    const certificates = ["all", ...new Set(state.source.courses.map((course) => course.certificate))];
    elements.pathAisles.innerHTML = "";
    for (const certificate of certificates) {
      const label = certificate === "all" ? "All shelves" : certificate;
      const count = certificate === "all" ? state.source.courses.length : state.source.courses.filter((course) => course.certificate === certificate).length;
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        certificate === state.certificateFilter
          ? "rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm"
          : "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:border-teal-300 hover:bg-teal-50";
      button.innerHTML = `${escapeHtml(label)} <span class="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-xs">${count}</span>`;
      button.addEventListener("click", () => {
        state.certificateFilter = certificate;
        elements.certificateFilter.value = certificate;
        renderCatalog();
      });
      elements.pathAisles.appendChild(button);
    }
  }

  function renderStorefront() {
    const target = findContinueTarget();
    renderContinuePanel(target);
    renderStudyCart();
  }

  function findContinueTarget() {
    const edited = Object.entries(state.user.blocks)
      .map(([blockId, blockState]) => ({ blockId, blockState, time: Date.parse(blockState.updatedAt || "") || 0 }))
      .filter((item) => state.blockIndex.has(item.blockId))
      .sort((a, b) => b.time - a.time);
    if (edited.length) {
      const indexed = state.blockIndex.get(edited[0].blockId);
      return { ...indexed, mode: "resume" };
    }
    const course = getActiveCourse();
    const page = course.pages[0];
    const block = page?.blocks[0];
    return { course, page, block, mode: "start" };
  }

  function renderContinuePanel(target) {
    if (!target?.course || !target?.page) {
      elements.continuePanel.innerHTML = '<div class="text-sm text-slate-300">No course material loaded.</div>';
      return;
    }
    const courseStats = getCourseStats(target.course);
    const lesson = target.page.lesson || "Course Home";
    elements.continuePanel.innerHTML = `
      <div class="grid h-full gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
        <div class="grid content-between gap-4">
          <div>
            <div class="mb-2 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-teal-100">
              ${target.mode === "resume" ? "Continue studying" : "Start this shelf"}
            </div>
            <h2 class="m-0 text-2xl font-black leading-tight text-white">${escapeHtml(target.course.code)} · ${escapeHtml(target.course.title)}</h2>
            <p class="mt-2 max-w-2xl text-sm text-slate-300">${escapeHtml(lesson)} · ${escapeHtml(displayPageTitle(target.page))}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button id="continueOpenButton" type="button" class="rounded-md border border-white/20 bg-white px-3 py-2 text-sm font-bold text-slate-950 hover:bg-teal-50">Open</button>
            <button id="continueBrowseButton" type="button" class="rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/15">Browse Lessons</button>
          </div>
        </div>
        <div class="grid content-center gap-3 rounded-lg border border-white/10 bg-white/10 p-3">
          <div>
            <div class="text-3xl font-black text-white">${courseStats.progress}%</div>
            <div class="text-xs uppercase tracking-wide text-slate-300">course touched</div>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-white/15"><div class="h-full rounded-full bg-teal-300" style="width: ${courseStats.progress}%"></div></div>
          <div class="grid grid-cols-3 gap-2 text-center text-xs text-slate-300">
            <div><strong class="block text-lg text-white">${courseStats.lessons}</strong>lessons</div>
            <div><strong class="block text-lg text-white">${courseStats.media}</strong>media</div>
            <div><strong class="block text-lg text-white">${courseStats.annotatedBlocks}</strong>notes</div>
          </div>
        </div>
      </div>
    `;
    elements.continuePanel.querySelector("#continueOpenButton").addEventListener("click", () => {
      openTarget(target);
    });
    elements.continuePanel.querySelector("#continueBrowseButton").addEventListener("click", () => {
      setActiveCourse(target.course.code);
      elements.lessonShelf.scrollIntoView({ block: "nearest" });
    });
  }

  function renderStudyCart() {
    const tagStats = getGlobalTagStats();
    const total = tagStats.reduce((sum, item) => sum + item.count, 0);
    elements.studyCart.innerHTML = `
      <div class="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 class="m-0 text-base font-black text-slate-900">Review Cart</h2>
          <p class="m-0 text-sm text-slate-500">${total} tagged blocks ready</p>
        </div>
        <span class="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">${Object.keys(state.user.blocks).length} touched</span>
      </div>
      <div class="grid gap-2"></div>
    `;
    const list = elements.studyCart.querySelector(".grid");
    for (const item of tagStats) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm hover:border-teal-300 hover:bg-teal-50";
      button.innerHTML = `<span class="font-bold text-slate-800">${escapeHtml(item.label)}</span><span class="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-700">${item.count}</span>`;
      button.disabled = item.count === 0;
      button.addEventListener("click", () => openTagCart(item.tag));
      list.appendChild(button);
    }
  }

  function getGlobalTagStats() {
    const labels = {
      rewrite: "Rewrite",
      example: "Examples",
      review: "Review later",
      confusing: "Confusing",
      mastered: "Mastered",
      assignment: "Assignments",
      video: "Video notes",
    };
    return QUICK_TAGS.map((tag) => {
      let count = 0;
      let firstBlockId = "";
      for (const [blockId, blockState] of Object.entries(state.user.blocks)) {
        if ((blockState.tags || []).includes(tag)) {
          count += 1;
          firstBlockId ||= blockId;
        }
      }
      return { tag, label: labels[tag] || tag, count, firstBlockId };
    });
  }

  function renderReviewDeck() {
    ensureReviewTagOptions();
    const items = getReviewItems();
    elements.reviewDeckMeta.textContent = `${items.length} blocks · ${state.reviewScope === "active" ? getActiveCourse().code : "all courses"} · ${state.reviewTag}`;
    elements.reviewQueue.innerHTML = "";
    if (!items.length) {
      elements.reviewQueue.innerHTML = '<section class="panel empty-state">No review blocks match this queue.</section>';
      return;
    }
    for (const item of items.slice(0, 24)) {
      elements.reviewQueue.appendChild(renderReviewQueueCard(item));
    }
  }

  function ensureReviewTagOptions() {
    const existing = [...elements.reviewTagSelect.options].map((option) => option.value);
    const tagStats = getGlobalTagStats();
    const tags = [...new Set([...QUICK_TAGS, ...tagStats.map((item) => item.tag)])];
    if (existing.join("|") === tags.join("|")) {
      return;
    }
    elements.reviewTagSelect.innerHTML = "";
    for (const tag of tags) {
      const option = document.createElement("option");
      option.value = tag;
      option.textContent = tag;
      elements.reviewTagSelect.appendChild(option);
    }
    elements.reviewTagSelect.value = state.reviewTag;
  }

  function getReviewItems() {
    const items = [];
    for (const [blockId, blockState] of Object.entries(state.user.blocks)) {
      if (!(blockState.tags || []).includes(state.reviewTag)) {
        continue;
      }
      const indexed = state.blockIndex.get(blockId);
      if (!indexed) {
        continue;
      }
      if (state.reviewScope === "active" && indexed.course.code !== state.activeCourseCode) {
        continue;
      }
      items.push({ ...indexed, blockState: getBlockState(indexed.block) });
    }
    return items.sort((a, b) => (Date.parse(b.blockState.updatedAt || "") || 0) - (Date.parse(a.blockState.updatedAt || "") || 0));
  }

  function renderReviewQueueCard(item) {
    const card = document.createElement("article");
    card.className = "review-card";
    card.dataset.agentBlockId = item.block.id;
    card.dataset.agentCourseCode = item.course.code;
    card.dataset.agentLesson = item.page.lesson || "Course Home";
    const preview = item.blockState.draft.replace(/\s+/g, " ").slice(0, 220);
    card.innerHTML = `
      <div>
        <div class="review-card-meta">${escapeHtml(item.course.code)} · ${escapeHtml(item.page.lesson || "Course Home")}</div>
        <h3>${escapeHtml(displayPageTitle(item.page))}</h3>
        <p>${escapeHtml(preview)}${preview.length === 220 ? "..." : ""}</p>
      </div>
      <div class="review-card-tags">${(item.blockState.tags || []).map((tag) => `<span class="lesson-chip">${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="review-card-actions">
        <button data-action="open" type="button">Open</button>
        <button data-action="mastered" type="button">Mastered</button>
      </div>
    `;
    card.querySelector('[data-action="open"]').addEventListener("click", () => {
      openTarget(item);
    });
    card.querySelector('[data-action="mastered"]').addEventListener("click", () => {
      markReviewItemMastered(item.block);
    });
    return card;
  }

  function markReviewItemMastered(block) {
    const saved = persistBlockState(block);
    const tags = new Set(saved.tags || []);
    tags.delete(state.reviewTag);
    tags.add("mastered");
    saved.tags = [...tags].sort();
    saved.updatedAt = new Date().toISOString();
    pruneBlockState(block);
    markBlockDirty(block.id);
    saveNow();
    render();
  }

  function getCatalogCourses() {
    const query = normalized(state.catalogQuery);
    let courses = state.source.courses.filter((course) => {
      if (state.certificateFilter !== "all" && course.certificate !== state.certificateFilter) {
        return false;
      }
      if (state.assignmentOnly && !courseHasAssignments(course)) {
        return false;
      }
      if (!query) {
        return true;
      }
      const lessonText = groupPagesByLesson(course.pages)
        .map((group) => group.lesson)
        .join(" ");
      return normalized(`${course.code} ${course.title} ${course.certificate} ${lessonText}`).includes(query);
    });
    courses = courses.map((course, index) => ({ course, index, stats: getCourseStats(course) }));
    courses.sort((a, b) => {
      if (state.catalogSort === "edited") {
        return b.stats.editedBlocks - a.stats.editedBlocks || a.index - b.index;
      }
      if (state.catalogSort === "blocks") {
        return b.stats.blocks - a.stats.blocks || a.index - b.index;
      }
      if (state.catalogSort === "media") {
        return b.stats.media - a.stats.media || a.index - b.index;
      }
      return a.index - b.index;
    });
    return courses.map((item) => item.course);
  }

  function renderCourseCard(course) {
    const stats = getCourseStats(course);
    const card = document.createElement("article");
    const theme = getCourseTheme(course);
    card.className = `course-card theme-${theme}${course.code === state.activeCourseCode ? " active" : ""}`;
    card.dataset.agentCourseCode = course.code;
    card.dataset.agentCertificate = course.certificate;
    card.dataset.agentPageCount = String(stats.pages);
    card.dataset.agentBlockCount = String(stats.blocks);
    card.dataset.agentTouchedBlocks = String(stats.editedBlocks);
    card.innerHTML = `
      <div class="course-stripe"></div>
      <div class="course-card-body">
        <div class="course-card-title">
          <div>
            <h3>${escapeHtml(course.title)}</h3>
            <small>${escapeHtml(course.certificate)}</small>
          </div>
          <div class="course-badge">${escapeHtml(course.code)}</div>
        </div>
        <div class="course-card-meta">
          ${miniStat(stats.lessons, "Lessons")}
          ${miniStat(stats.blocks, "Blocks")}
          ${miniStat(stats.media, "Media")}
        </div>
        <div class="course-map" aria-label="Lesson map">${renderCourseMap(course)}</div>
        <div>
          <div class="progress-track"><div class="progress-fill" style="width: ${stats.progress}%"></div></div>
          <small>${stats.editedBlocks} edited · ${stats.annotatedBlocks} annotated · ${stats.progress}% touched</small>
        </div>
        <div class="course-actions">
          <button data-action="browse" type="button">Browse</button>
          <button data-action="open" type="button">Open</button>
        </div>
      </div>
    `;
    card.querySelector('[data-action="browse"]').addEventListener("click", () => {
      setActiveCourse(course.code);
      elements.lessonShelf.scrollIntoView({ block: "nearest" });
    });
    card.querySelector('[data-action="open"]').addEventListener("click", () => {
      setActiveCourse(course.code);
      scrollToReader();
    });
    card.addEventListener("dblclick", () => {
      setActiveCourse(course.code);
      scrollToReader();
    });
    return card;
  }

  function renderLessonShelf() {
    const course = getActiveCourse();
    const courseStats = getCourseStats(course);
    const groups = groupPagesByLesson(course.pages).filter((group) => !state.assignmentOnly || groupHasAssignments(group));
    elements.lessonShelfTitle.textContent = `${course.code} Lessons`;
    elements.lessonShelfMeta.textContent = `${course.title} · ${groups.length} lessons · ${courseStats.blocks} blocks${state.assignmentOnly ? " · assignments only" : ""}`;
    elements.lessonShelf.innerHTML = "";
    for (const group of groups) {
      elements.lessonShelf.appendChild(renderLessonCard(course, group));
    }
    if (!groups.length) {
      elements.lessonShelf.innerHTML = '<section class="panel empty-state">No assignment lessons found for this course.</section>';
    }
  }

  function renderCourseMap(course) {
    const groups = groupPagesByLesson(course.pages);
    const lessonStats = groups.map((group) => getLessonStats(group));
    const maxBlocks = Math.max(1, ...lessonStats.map((stats) => stats.blocks));
    return lessonStats
      .slice(0, 14)
      .map((stats) => {
        const height = Math.max(22, Math.round((stats.blocks / maxBlocks) * 100));
        const activeClass = stats.editedBlocks ? " touched" : "";
        return `<span class="course-map-bar${activeClass}" style="height: ${height}%"></span>`;
      })
      .join("");
  }

  function renderLessonCard(course, group) {
    const stats = getLessonStats(group);
    const card = document.createElement("article");
    card.className = "lesson-card";
    card.dataset.agentCourseCode = course.code;
    card.dataset.agentLesson = group.lesson;
    card.dataset.agentPageCount = String(group.pages.length);
    card.dataset.agentBlockCount = String(stats.blocks);
    card.dataset.agentTouchedBlocks = String(stats.editedBlocks);
    const topic = getLessonTopic(group);
    card.innerHTML = `
      <div>
        <h3>${escapeHtml(group.lesson)}</h3>
        <p>${escapeHtml(topic)}</p>
      </div>
      <div class="lesson-card-meta">
        ${miniStat(group.pages.length, "Pages")}
        ${miniStat(stats.blocks, "Blocks")}
        ${miniStat(stats.media, "Media")}
      </div>
      <div>
        <div class="progress-track"><div class="progress-fill" style="width: ${stats.progress}%"></div></div>
        <small>${stats.editedBlocks} edited · ${stats.annotatedBlocks} notes</small>
      </div>
      <div class="lesson-tags">${renderLessonChips(stats)}</div>
      <div class="lesson-actions">
        <button data-action="open" type="button">Open Lesson</button>
        <button data-action="search" type="button">Search Here</button>
      </div>
    `;
    card.querySelector('[data-action="open"]').addEventListener("click", () => {
      setActiveCourse(course.code);
      scrollToPage(group.pages[0]);
    });
    card.querySelector('[data-action="search"]').addEventListener("click", () => {
      setActiveCourse(course.code);
      elements.searchInput.value = group.lesson;
      state.query = group.lesson;
      renderContent();
      scrollToReader();
    });
    return card;
  }

  function miniStat(value, label) {
    return `<div class="mini-stat"><strong>${escapeHtml(formatCount(value))}</strong><span>${escapeHtml(label)}</span></div>`;
  }

  function renderLessonChips(stats) {
    const chips = [];
    if (stats.examples) {
      chips.push(`${stats.examples} examples`);
    }
    if (stats.confusing) {
      chips.push(`${stats.confusing} confusing`);
    }
    if (stats.assignments) {
      chips.push(`${stats.assignments} assignments`);
    }
    if (!chips.length) {
      chips.push(stats.media ? "media ready" : "not started");
    }
    return chips.slice(0, 3).map((chip) => `<span class="lesson-chip">${escapeHtml(chip)}</span>`).join("");
  }

  function renderOutline() {
    const course = getActiveCourse();
    elements.outline.innerHTML = "";
    const grouped = groupPagesByLesson(course.pages);
    for (const group of grouped.filter((item) => !state.assignmentOnly || groupHasAssignments(item))) {
      const stats = getLessonStats(group);
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `
        <strong>${escapeHtml(group.lesson)}</strong>
        <small>${group.pages.length} pages · ${stats.blocks} blocks · ${stats.editedBlocks} touched</small>
        <span class="outline-progress"><span style="width: ${stats.progress}%"></span></span>
      `;
      button.addEventListener("click", () => {
        document.getElementById(pageDomId(group.pages[0]))?.scrollIntoView({ block: "start" });
      });
      elements.outline.appendChild(button);
    }
  }

  function groupPagesByLesson(pages) {
    const groups = [];
    const seen = new Map();
    for (const page of pages) {
      const lesson = page.lesson || "Course Home";
      if (!seen.has(lesson)) {
        const group = { lesson, pages: [] };
        seen.set(lesson, group);
        groups.push(group);
      }
      seen.get(lesson).pages.push(page);
    }
    return groups;
  }

  function getCourseStats(course) {
    const groups = groupPagesByLesson(course.pages);
    const stats = {
      pages: course.pages.length,
      lessons: groups.length,
      blocks: 0,
      media: 0,
      editedBlocks: 0,
      annotatedBlocks: 0,
      examples: 0,
      confusing: 0,
      assignments: 0,
      progress: 0,
    };
    for (const page of course.pages) {
      stats.media += page.media?.length || 0;
      for (const block of page.blocks) {
        addBlockStats(stats, page, block);
      }
    }
    stats.progress = stats.blocks ? Math.min(100, Math.round((stats.editedBlocks / stats.blocks) * 100)) : 0;
    return stats;
  }

  function getGlobalStudyStats() {
    const stats = {
      touchedBlocks: 0,
      annotatedBlocks: 0,
      taggedBlocks: 0,
      hiddenBlocks: 0,
      transcripts: Object.keys(state.user.transcripts).length,
    };
    for (const blockState of Object.values(state.user.blocks)) {
      const tags = blockState.tags || [];
      const touched = Boolean(
        Object.prototype.hasOwnProperty.call(blockState, "draft") ||
          blockState.annotations ||
          tags.length ||
          blockState.hidden,
      );
      if (touched) {
        stats.touchedBlocks += 1;
      }
      if (blockState.annotations) {
        stats.annotatedBlocks += 1;
      }
      if (tags.length) {
        stats.taggedBlocks += 1;
      }
      if (blockState.hidden) {
        stats.hiddenBlocks += 1;
      }
    }
    return stats;
  }

  function getLessonStats(group) {
    const stats = {
      blocks: 0,
      media: 0,
      editedBlocks: 0,
      annotatedBlocks: 0,
      examples: 0,
      confusing: 0,
      assignments: 0,
      progress: 0,
    };
    for (const page of group.pages) {
      stats.media += page.media?.length || 0;
      for (const block of page.blocks) {
        addBlockStats(stats, page, block);
      }
    }
    stats.progress = stats.blocks ? Math.min(100, Math.round((stats.editedBlocks / stats.blocks) * 100)) : 0;
    return stats;
  }

  function addBlockStats(stats, page, block) {
    stats.blocks += 1;
    const saved = state.user.blocks[block.id] || {};
    const tags = saved.tags || [];
    const rewritten = Object.prototype.hasOwnProperty.call(saved, "draft") && saved.draft !== block.source_text;
    const touched = Boolean(rewritten || saved.annotations || tags.length || saved.hidden);
    if (touched) {
      stats.editedBlocks += 1;
    }
    if (saved.annotations) {
      stats.annotatedBlocks += 1;
    }
    if (tags.includes("example")) {
      stats.examples += 1;
    }
    if (tags.includes("confusing")) {
      stats.confusing += 1;
    }
    if (tags.includes("assignment") || isAssignmentBlock(page, block)) {
      stats.assignments += 1;
    }
  }

  function courseHasAssignments(course) {
    return course.pages.some((page) => pageHasAssignments(page));
  }

  function groupHasAssignments(group) {
    return group.pages.some((page) => pageHasAssignments(page));
  }

  function pageHasAssignments(page) {
    return isAssignmentPage(page) || page.blocks.some((block) => isAssignmentBlock(page, block));
  }

  function isAssignmentPage(page) {
    const haystack = normalized(
      [
        page.lesson,
        page.page_type,
        page.link_text,
        page.html_title,
        page.extracted_title,
        page.url,
      ].join(" "),
    );
    return ASSIGNMENT_TERMS.some((term) => haystack.includes(term));
  }

  function isAssignmentBlock(page, block) {
    const saved = state.user.blocks[block.id] || {};
    if ((saved.tags || []).includes("assignment")) {
      return true;
    }
    if (isAssignmentPage(page)) {
      return true;
    }
    const haystack = normalized(block.source_text);
    return ASSIGNMENT_TERMS.some((term) => haystack.includes(term));
  }

  function getLessonTopic(group) {
    const page = group.pages.find((item) => item.link_text && item.link_text !== group.lesson) || group.pages[0];
    const title = page?.link_text || page?.extracted_title || page?.html_title || "";
    return title === group.lesson ? `${group.pages.length} source pages` : title;
  }

  function getCourseTheme(course) {
    return course.code.split("").reduce((total, char) => total + char.charCodeAt(0), 0) % 6;
  }

  function formatCount(value) {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
    }
    return String(value);
  }

  function setActiveCourse(courseCode) {
    state.activeCourseCode = courseCode;
    state.selectedBlockId = "";
    elements.courseSelect.value = courseCode;
    render();
  }

  function setMode(mode) {
    state.activeMode = mode || "browse";
    renderModeDock();
    if (state.activeMode === "browse") {
      elements.catalog.scrollIntoView({ block: "start" });
    } else if (state.activeMode === "review") {
      renderReviewDeck();
      elements.reviewDeck.scrollIntoView({ block: "start" });
    } else if (state.activeMode === "agent") {
      renderAgentContext();
      document.querySelector('[data-agent-region="agent-context"]')?.scrollIntoView({ block: "start" });
    } else {
      scrollToReader();
    }
  }

  function openTarget(target) {
    if (!target?.course || !target?.page) {
      return;
    }
    state.activeMode = "study";
    setActiveCourse(target.course.code);
    scrollToReader();
    window.requestAnimationFrame(() => {
      if (target.block) {
        selectBlock(target.block.id);
        document.getElementById(blockDomId(target.block))?.scrollIntoView({ block: "center" });
      } else {
        scrollToPage(target.page);
      }
    });
  }

  function openTagCart(tag) {
    const first = Object.entries(state.user.blocks).find(([_blockId, blockState]) => (blockState.tags || []).includes(tag));
    if (!first) {
      return;
    }
    const indexed = state.blockIndex.get(first[0]);
    if (!indexed) {
      return;
    }
    setActiveCourse(indexed.course.code);
    state.selectedTag = tag;
    render();
    scrollToReader();
    window.requestAnimationFrame(() => {
      selectBlock(indexed.block.id);
      document.getElementById(blockDomId(indexed.block))?.scrollIntoView({ block: "center" });
    });
  }

  function toggleFocusMode() {
    state.focusMode = !state.focusMode;
    document.body.classList.toggle("focus-mode", state.focusMode);
    elements.focusModeButton.textContent = state.focusMode ? "Browse" : "Focus";
    renderAgentContext();
  }

  function toggleAssignmentFilter() {
    state.assignmentOnly = !state.assignmentOnly;
    render();
    if (state.activeMode === "browse") {
      elements.catalog.scrollIntoView({ block: "start" });
    } else {
      scrollToReader();
    }
  }

  function scrollToReader() {
    document.querySelector(".shell")?.scrollIntoView({ block: "start" });
    elements.content.focus();
  }

  function scrollToPage(page) {
    window.requestAnimationFrame(() => {
      document.getElementById(pageDomId(page))?.scrollIntoView({ block: "start" });
    });
  }

  function renderTagFilters() {
    const tags = new Map();
    for (const blockState of Object.values(state.user.blocks)) {
      for (const tag of blockState.tags || []) {
        tags.set(tag, (tags.get(tag) || 0) + 1);
      }
    }
    elements.tagFilters.innerHTML = "";
    for (const tag of [...tags.keys()].sort()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tag-pill${state.selectedTag === tag ? " active" : ""}`;
      button.textContent = `${tag} ${tags.get(tag)}`;
      button.addEventListener("click", () => {
        state.selectedTag = state.selectedTag === tag ? "" : tag;
        render();
      });
      elements.tagFilters.appendChild(button);
    }
    if (!tags.size) {
      elements.tagFilters.innerHTML = '<div class="empty-state">No tags yet.</div>';
    }
  }

  async function runDatabaseSearch() {
    const query = elements.dbSearchInput.value.trim();
    if (!query) {
      elements.dbSearchResults.innerHTML = '<div class="empty-state">Enter a search term.</div>';
      return;
    }
    if (!state.apiAvailable) {
      elements.dbSearchResults.innerHTML = '<div class="empty-state">Run scripts/workbench_server.py for SQLite search.</div>';
      return;
    }
    elements.dbSearchResults.innerHTML = '<div class="empty-state">Searching...</div>';
    const params = new URLSearchParams({ q: query, course: state.activeCourseCode, limit: "8" });
    try {
      const response = await fetch(`/api/search?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error || `${response.status} ${response.statusText}`);
      }
      renderDatabaseSearchResults(payload.results || []);
    } catch (error) {
      elements.dbSearchResults.innerHTML = `<div class="empty-state">Search failed: ${escapeHtml(error.message)}</div>`;
    }
  }

  function renderDatabaseSearchResults(results) {
    elements.dbSearchResults.innerHTML = "";
    if (!results.length) {
      elements.dbSearchResults.innerHTML = '<div class="empty-state">No SQLite matches.</div>';
      return;
    }
    for (const result of results) {
      const item = document.createElement("div");
      item.className = "db-result";
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `
        <strong>${escapeHtml(result.course_code)} · ${escapeHtml(result.lesson || "Course Home")}</strong>
        <span>${renderSafeSnippet(result.snippet || "")}</span>
      `;
      button.addEventListener("click", () => {
        const indexed = state.blockIndex.get(result.block_id);
        if (!indexed) {
          return;
        }
        if (indexed.course.code !== state.activeCourseCode) {
          state.activeCourseCode = indexed.course.code;
          elements.courseSelect.value = indexed.course.code;
          render();
        }
        window.requestAnimationFrame(() => {
          selectBlock(result.block_id);
          document.getElementById(blockDomId({ id: result.block_id }))?.scrollIntoView({ block: "center" });
        });
      });
      item.appendChild(button);
      elements.dbSearchResults.appendChild(item);
    }
  }

  function renderContent() {
    const course = getActiveCourse();
    elements.content.innerHTML = "";
    const query = normalized(state.query);
    let visiblePages = 0;

    for (const page of course.pages) {
      const blocks = page.blocks.filter((block) => blockMatches(page, block, query));
      if (!blocks.length && (query || state.assignmentOnly)) {
        continue;
      }
      const section = elements.pageTemplate.content.firstElementChild.cloneNode(true);
      section.id = pageDomId(page);
      section.dataset.agentPageId = page.id;
      section.dataset.agentCourseCode = course.code;
      section.dataset.agentLesson = page.lesson || "Course Home";
      section.dataset.agentSourceUrl = page.url;
      renderPageHeader(section, page, blocks.length);
      for (const block of blocks) {
        section.appendChild(renderBlock(page, block));
      }
      elements.content.appendChild(section);
      visiblePages += 1;
    }

    if (!visiblePages) {
      elements.content.innerHTML = '<section class="panel empty-state">No matching course material.</section>';
    }
  }

  function renderPageHeader(section, page, visibleBlockCount) {
    const header = document.createElement("header");
    header.className = "page-header";
    const title = displayPageTitle(page);
    const mediaLinks = page.media || [];
    header.innerHTML = `
      <div>
        <h2>${escapeHtml(title)}</h2>
        <div class="meta">
          ${escapeHtml(page.lesson || "Course Home")} · ${escapeHtml(page.page_type || "page")} · ${visibleBlockCount} blocks
          <br><a class="source-link" href="${escapeAttribute(page.url)}" target="_blank" rel="noreferrer">${escapeHtml(page.url)}</a>
        </div>
      </div>
      <div class="media-list"></div>
    `;
    const mediaList = header.querySelector(".media-list");
    for (const media of mediaLinks.slice(0, 8)) {
      const link = document.createElement("a");
      link.href = media.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = media.label || media.type || "media";
      mediaList.appendChild(link);
    }
    section.appendChild(header);
  }

  function renderBlock(page, block) {
    const blockState = getBlockState(block);
    const article = elements.blockTemplate.content.firstElementChild.cloneNode(true);
    article.id = blockDomId(block);
    article.dataset.blockId = block.id;
    article.dataset.agentBlockId = block.id;
    article.dataset.agentPageId = page.id;
    article.dataset.agentCourseCode = state.blockIndex.get(block.id)?.course.code || "";
    article.dataset.agentLesson = page.lesson || "Course Home";
    article.dataset.agentBlockType = block.type;
    article.dataset.agentBlockPosition = String(block.position);
    article.dataset.agentSourceUrl = page.url;
    article.classList.toggle("selected", state.selectedBlockId === block.id);
    article.classList.toggle("hidden-block", Boolean(blockState.hidden));

    const source = article.querySelector(".block-source");
    source.textContent = block.source_text;
    source.classList.toggle("heading", block.type === "heading");
    source.classList.toggle("pre", block.type === "pre");

    const editable = article.querySelector(".editable");
    editable.textContent = blockState.draft || "";
    editable.dataset.placeholder = "Write your version";
    editable.classList.toggle("pre", block.type === "pre");
    editable.addEventListener("input", () => {
      const next = editable.innerText.replace(/\n\n\n+/g, "\n\n").trimEnd();
      const saved = persistBlockState(block);
      if (next === block.source_text) {
        delete saved.draft;
      } else {
        saved.draft = next;
      }
      saved.updatedAt = new Date().toISOString();
      pruneBlockState(block);
      markBlockDirty(block.id);
      scheduleSave();
    });
    editable.addEventListener("focus", () => selectBlock(block.id));

    article.addEventListener("click", (event) => {
      if (!event.target.closest("a")) {
        selectBlock(block.id);
      }
    });

    const tagContainer = article.querySelector(".block-tags");
    renderBlockTags(tagContainer, blockState.tags || []);

    article.querySelector('[data-action="tag"]').addEventListener("click", () => {
      selectBlock(block.id);
      quickTag(block.id);
    });
    article.querySelector('[data-action="note"]').addEventListener("click", () => {
      selectBlock(block.id);
      elements.selectionNotes.focus();
    });
    article.querySelector('[data-action="hide"]').addEventListener("click", () => {
      const current = getBlockState(block);
      const saved = persistBlockState(block);
      saved.hidden = !current.hidden;
      saved.updatedAt = new Date().toISOString();
      if (!saved.hidden) {
        delete saved.hidden;
      }
      pruneBlockState(block);
      markBlockDirty(block.id);
      saveNow();
      render();
    });

    if (blockState.hidden && !state.showHidden && !state.query && !state.selectedTag) {
      article.hidden = true;
    }
    return article;
  }

  function renderBlockTags(container, tags) {
    container.innerHTML = "";
    for (const tag of tags) {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = tag;
      container.appendChild(pill);
    }
  }

  function blockMatches(page, block, query) {
    const blockState = getBlockState(block);
    if (state.assignmentOnly && !isAssignmentBlock(page, block)) {
      return false;
    }
    if (state.selectedTag && !(blockState.tags || []).includes(state.selectedTag)) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [
      page.lesson,
      page.link_text,
      page.html_title,
      page.extracted_title,
      page.url,
      block.source_text,
      blockState.draft,
      (blockState.tags || []).join(" "),
      blockState.annotations,
    ]
      .map(normalized)
      .join(" ");
    return haystack.includes(query);
  }

  function selectBlock(blockId) {
    state.selectedBlockId = blockId;
    document.querySelectorAll(".study-block.selected").forEach((node) => node.classList.remove("selected"));
    document.getElementById(blockDomId({ id: blockId }))?.classList.add("selected");
    renderSelection();
  }

  function renderSelection() {
    const selected = state.blockIndex.get(state.selectedBlockId);
    if (!selected) {
      elements.selectionEmpty.hidden = false;
      elements.selectionPanel.hidden = true;
      elements.transcriptPreview.innerHTML = "";
      return;
    }
    const { course, page, block } = selected;
    const blockState = getBlockState(block);
    elements.selectionEmpty.hidden = true;
    elements.selectionPanel.hidden = false;
    elements.selectionMeta.innerHTML = `
      <strong>${escapeHtml(course.code)}</strong>
      <span>${escapeHtml(page.lesson || "Course Home")}</span>
      <a class="source-link" href="${escapeAttribute(page.url)}" target="_blank" rel="noreferrer">${escapeHtml(displayPageTitle(page))}</a>
    `;
    elements.selectionTags.value = (blockState.tags || []).join(", ");
    renderQuickTags(blockState.tags || []);
    elements.selectionNotes.value = blockState.annotations || "";
    elements.hideBlockButton.textContent = blockState.hidden ? "Show Block" : "Hide Block";
    renderTranscriptPreview(block.id);
  }

  function renderQuickTags(activeTags) {
    const active = new Set(activeTags);
    elements.quickTags.innerHTML = "";
    for (const tag of QUICK_TAGS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = active.has(tag) ? "active" : "";
      button.textContent = tag;
      button.addEventListener("click", () => toggleSelectedTag(tag));
      elements.quickTags.appendChild(button);
    }
  }

  function toggleSelectedTag(tag) {
    const selected = state.blockIndex.get(state.selectedBlockId);
    if (!selected) {
      return;
    }
    const current = getBlockState(selected.block);
    const tags = new Set(current.tags || []);
    if (tags.has(tag)) {
      tags.delete(tag);
    } else {
      tags.add(tag);
    }
    const saved = persistBlockState(selected.block);
    saved.tags = [...tags].sort();
    saved.updatedAt = new Date().toISOString();
    if (!saved.tags.length) {
      delete saved.tags;
    }
    pruneBlockState(selected.block);
    markBlockDirty(selected.block.id);
    saveNow();
    render();
  }

  function quickTag(blockId) {
    const selected = state.blockIndex.get(blockId);
    if (!selected) {
      return;
    }
    const blockState = getBlockState(selected.block);
    const existing = new Set(blockState.tags || []);
    const nextTag = QUICK_TAGS.find((tag) => !existing.has(tag)) || QUICK_TAGS[0];
    if (existing.has(nextTag)) {
      existing.delete(nextTag);
    } else {
      existing.add(nextTag);
    }
    const saved = persistBlockState(selected.block);
    saved.tags = [...existing].sort();
    saved.updatedAt = new Date().toISOString();
    if (!saved.tags.length) {
      delete saved.tags;
    }
    pruneBlockState(selected.block);
    markBlockDirty(selected.block.id);
    saveNow();
    render();
  }

  function updateSelectedTags() {
    const selected = state.blockIndex.get(state.selectedBlockId);
    if (!selected) {
      return;
    }
    const saved = persistBlockState(selected.block);
    saved.tags = elements.selectionTags.value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .filter((item, index, list) => list.indexOf(item) === index)
      .sort();
    saved.updatedAt = new Date().toISOString();
    if (!saved.tags.length) {
      delete saved.tags;
    }
    pruneBlockState(selected.block);
    markBlockDirty(selected.block.id);
    saveNow();
    render();
  }

  function updateSelectedNotes() {
    const selected = state.blockIndex.get(state.selectedBlockId);
    if (!selected) {
      return;
    }
    const saved = persistBlockState(selected.block);
    saved.annotations = elements.selectionNotes.value;
    saved.updatedAt = new Date().toISOString();
    if (!saved.annotations) {
      delete saved.annotations;
    }
    pruneBlockState(selected.block);
    markBlockDirty(selected.block.id);
    scheduleSave();
  }

  function resetSelectedBlock() {
    const selected = state.blockIndex.get(state.selectedBlockId);
    if (!selected) {
      return;
    }
    const saved = persistBlockState(selected.block);
    delete saved.draft;
    saved.updatedAt = new Date().toISOString();
    pruneBlockState(selected.block);
    markBlockDirty(selected.block.id);
    saveNow();
    render();
    document.getElementById(blockDomId(selected.block))?.scrollIntoView({ block: "center" });
  }

  function toggleSelectedHidden() {
    const selected = state.blockIndex.get(state.selectedBlockId);
    if (!selected) {
      return;
    }
    const current = getBlockState(selected.block);
    const saved = persistBlockState(selected.block);
    saved.hidden = !current.hidden;
    saved.updatedAt = new Date().toISOString();
    if (!saved.hidden) {
      delete saved.hidden;
    }
    pruneBlockState(selected.block);
    markBlockDirty(selected.block.id);
    saveNow();
    render();
  }

  function attachTranscriptToSelection() {
    if (!state.selectedBlockId) {
      return;
    }
    const raw = elements.transcriptImport.value.trim();
    if (!raw) {
      return;
    }
    state.user.transcripts[state.selectedBlockId] = parseTranscript(raw);
    markTranscriptDirty(state.selectedBlockId);
    elements.transcriptImport.value = "";
    saveNow();
    renderTranscriptPreview(state.selectedBlockId);
  }

  function parseTranscript(raw) {
    const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const cues = [];
    let i = 0;
    while (i < lines.length) {
      let line = lines[i].trim();
      if (!line || line.toUpperCase().startsWith("WEBVTT")) {
        i += 1;
        continue;
      }
      if (!line.includes("-->") && i + 1 < lines.length && lines[i + 1].includes("-->")) {
        i += 1;
        line = lines[i].trim();
      }
      if (line.includes("-->")) {
        const parts = line.split("-->");
        const start = parts[0].trim();
        const end = parts[1].trim().split(/\s+/)[0];
        i += 1;
        const body = [];
        while (i < lines.length && lines[i].trim()) {
          body.push(lines[i].replace(/<[^>]+>/g, "").trim());
          i += 1;
        }
        cues.push({ start, end, text: body.join(" ").replace(/\s+/g, " ").trim() });
      }
      i += 1;
    }
    if (cues.length) {
      return cues.filter((cue) => cue.text);
    }
    return raw
      .split(/\n\s*\n/)
      .map((chunk, index) => ({ start: "", end: "", text: chunk.replace(/\s+/g, " ").trim(), position: index }))
      .filter((cue) => cue.text);
  }

  function renderTranscriptPreview(blockId) {
    const selected = state.blockIndex.get(blockId);
    const manual = state.user.transcripts[blockId] || [];
    const sourceCues = selected ? collectPageTranscriptCues(selected.page) : [];
    const cues = manual.length ? manual : sourceCues;
    if (!cues.length) {
      elements.transcriptPreview.innerHTML = '<div class="empty-state">No transcript attached.</div>';
      return;
    }
    elements.transcriptPreview.innerHTML = "";
    for (const cue of cues.slice(0, 12)) {
      const div = document.createElement("div");
      div.className = "cue";
      div.textContent = `${cue.start ? `${cue.start} ` : ""}${cue.text}`;
      elements.transcriptPreview.appendChild(div);
    }
  }

  function collectPageTranscriptCues(page) {
    const cues = [];
    for (const media of page.media || []) {
      for (const cue of media.transcript_cues || []) {
        cues.push(cue);
      }
    }
    return cues;
  }

  function updateStats() {
    if (!state.source) {
      return;
    }
    const course = getActiveCourse();
    const blocks = course.pages.flatMap((page) => page.blocks);
    const edited = blocks.filter((block) => {
      const blockState = state.user.blocks[block.id];
      return Boolean(
        blockState &&
          ((Object.prototype.hasOwnProperty.call(blockState, "draft") && blockState.draft !== block.source_text) ||
            blockState.annotations ||
            blockState.tags?.length ||
            blockState.hidden),
      );
    });
    elements.pageCount.textContent = String(course.pages.length);
    elements.blockCount.textContent = String(blocks.length);
    elements.editedCount.textContent = String(edited.length);
  }

  function exportUserState() {
    const payload = {
      exportedAt: new Date().toISOString(),
      sourceGeneratedAt: state.source?.generated_at || "",
      storageKey: STORAGE_KEY,
      user: state.user,
    };
    downloadText(
      `pathways-study-layer-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      "application/json",
    );
  }

  function exportCourseMarkdown() {
    const course = getActiveCourse();
    const exportConfig = getExportConfig();
    const lines = [
      `# ${course.code} - ${course.title}`,
      "",
      `Mode: ${exportConfig.label}`,
      `Exported: ${new Date().toISOString()}`,
      "",
    ];
    for (const page of course.pages) {
      const exportBlocks = page.blocks.filter((block) => includeBlockInExport(block, exportConfig));
      if (!exportBlocks.length) {
        continue;
      }
      lines.push(`## ${displayPageTitle(page)}`, "");
      lines.push(`Source: ${page.url}`, "");
      if (page.media?.length) {
        lines.push("Media:");
        for (const media of page.media) {
          lines.push(`- ${media.label || media.type || "media"}: ${media.url}`);
        }
        lines.push("");
      }
      for (const block of exportBlocks) {
        const blockState = getBlockState(block);
        const body = (blockState.draft || "").trim();
        if (!body) {
          continue;
        }
        if (block.type === "heading") {
          const depth = Math.min(6, Math.max(3, Number(block.heading_level || 3) + 1));
          lines.push(`${"#".repeat(depth)} ${body.replace(/\n+/g, " ")}`, "");
        } else if (block.type === "pre") {
          lines.push("```", body, "```", "");
        } else {
          lines.push(body, "");
        }
        if (blockState.tags?.length) {
          lines.push(`Tags: ${blockState.tags.map((tag) => `#${tag.replace(/\s+/g, "-")}`).join(" ")}`, "");
        }
        if (blockState.annotations) {
          lines.push("> Note: " + blockState.annotations.replace(/\n/g, "\n> "), "");
        }
      }
    }
    downloadText(
      `${slugify(course.code)}-${slugify(exportConfig.label)}.md`,
      lines.join("\n").replace(/\n{4,}/g, "\n\n\n"),
      "text/markdown",
    );
  }

  function getExportConfig() {
    const mode = elements.exportMode.value;
    const customTag = elements.exportTagInput.value.trim().toLowerCase();
    const labels = {
      full: "Full edited course",
      rewritten: "Only rewritten blocks",
      annotations: "Only annotated blocks",
      examples: "All example tags",
      confusing: "All confusing tags",
      "custom-tag": customTag ? `Tag ${customTag}` : "Custom tag",
    };
    return { mode, customTag, label: labels[mode] || "Study notes" };
  }

  function includeBlockInExport(block, exportConfig) {
    const blockState = getBlockState(block);
    if (blockState.hidden) {
      return false;
    }
    const hasBody = Boolean((blockState.draft || "").trim());
    if (!hasBody) {
      return false;
    }
    const tags = new Set(blockState.tags || []);
    const rewritten = Object.prototype.hasOwnProperty.call(state.user.blocks[block.id] || {}, "draft") && blockState.draft !== block.source_text;
    if (exportConfig.mode === "full") {
      return true;
    }
    if (exportConfig.mode === "rewritten") {
      return rewritten;
    }
    if (exportConfig.mode === "annotations") {
      return Boolean(blockState.annotations);
    }
    if (exportConfig.mode === "examples") {
      return tags.has("example");
    }
    if (exportConfig.mode === "confusing") {
      return tags.has("confusing");
    }
    if (exportConfig.mode === "custom-tag") {
      return Boolean(exportConfig.customTag && tags.has(exportConfig.customTag));
    }
    return true;
  }

  function buildReviewPreview() {
    const course = getActiveCourse();
    const exportConfig = getExportConfig();
    const matches = [];
    let pageCount = 0;
    for (const page of course.pages) {
      const pageMatches = page.blocks.filter((block) => includeBlockInExport(block, exportConfig));
      if (pageMatches.length) {
        pageCount += 1;
        for (const block of pageMatches) {
          matches.push({ page, block, blockState: getBlockState(block) });
        }
      }
    }
    elements.reviewPreview.innerHTML = `
      <div><strong>${matches.length}</strong> blocks across <strong>${pageCount}</strong> pages.</div>
      ${matches.length ? "<ul></ul>" : '<div class="empty-state">No blocks match this export mode.</div>'}
    `;
    const list = elements.reviewPreview.querySelector("ul");
    if (!list) {
      return;
    }
    for (const match of matches.slice(0, 6)) {
      const item = document.createElement("li");
      const body = match.blockState.draft.replace(/\s+/g, " ").slice(0, 120);
      item.textContent = `${match.page.lesson || "Course Home"}: ${body}${body.length === 120 ? "..." : ""}`;
      list.appendChild(item);
    }
    if (matches.length > 6) {
      const item = document.createElement("li");
      item.textContent = `${matches.length - 6} more`;
      list.appendChild(item);
    }
  }

  function getAgentContext() {
    const course = getActiveCourse();
    const courseStats = getCourseStats(course);
    const globalStats = getGlobalStudyStats();
    const selected = state.blockIndex.get(state.selectedBlockId);
    const selectedBlockState = selected ? getBlockState(selected.block) : null;
    return {
      app: "Pathways Study Workbench",
      server: {
        url: window.location.origin,
        apiAvailable: state.apiAvailable,
        syncStatus: elements.syncStatus.textContent,
      },
      source: {
        generatedAt: state.source.generated_at,
        pages: state.source.stats.pages,
        blocks: state.source.stats.blocks,
        media: state.source.stats.media,
      },
      activeCourse: {
        code: course.code,
        title: course.title,
        certificate: course.certificate,
        pages: courseStats.pages,
        lessons: courseStats.lessons,
        blocks: courseStats.blocks,
        touchedBlocks: courseStats.editedBlocks,
        progress: courseStats.progress,
      },
      filters: {
        readerSearch: state.query,
        catalogSearch: state.catalogQuery,
        certificate: state.certificateFilter,
        catalogSort: state.catalogSort,
        selectedTag: state.selectedTag,
        showHidden: state.showHidden,
        assignmentOnly: state.assignmentOnly,
        focusMode: state.focusMode,
      },
      selection: selected
        ? {
            courseCode: selected.course.code,
            lesson: selected.page.lesson || "Course Home",
            pageId: selected.page.id,
            pageTitle: displayPageTitle(selected.page),
            sourceUrl: selected.page.url,
            blockId: selected.block.id,
            blockType: selected.block.type,
            blockPosition: selected.block.position,
            tags: selectedBlockState.tags,
            hidden: selectedBlockState.hidden,
            hasAnnotation: Boolean(selectedBlockState.annotations),
            sourcePreview: selected.block.source_text.slice(0, 240),
            draftPreview: selectedBlockState.draft.slice(0, 240),
          }
        : null,
      studyLayer: globalStats,
      files: {
        app: "web/app.js",
        html: "web/index.html",
        css: "web/styles.css",
        tailwindInput: "web/tailwind.input.css",
        tailwindOutput: "web/tailwind.generated.css",
        sourceData: "web/data/course_data.json",
        sourceDb: "data/pathways_workbench.sqlite",
        userDb: "data/pathways_user.sqlite",
      },
      commands: {
        runServer: "python3 scripts/workbench_server.py --port 8788",
        buildCss: "npm run build:css",
        watchCss: "npm run watch:css",
        refreshData: "python3 scripts/ingest_course_materials.py",
        searchCli: "python3 scripts/search_course_materials.py functions --course 'CSE 111'",
      },
    };
  }

  function renderAgentContext() {
    if (!state.source) {
      return;
    }
    const context = getAgentContext();
    elements.agentContextSummary.innerHTML = `
      <div class="agent-context-grid">
        <div><strong>${escapeHtml(context.activeCourse.code)}</strong><span>course</span></div>
        <div><strong>${escapeHtml(String(context.activeCourse.progress))}%</strong><span>progress</span></div>
        <div><strong>${escapeHtml(String(context.studyLayer.touchedBlocks))}</strong><span>touched</span></div>
      </div>
    `;
    const compact = {
      activeCourse: context.activeCourse,
      filters: context.filters,
      selection: context.selection,
      server: context.server,
      files: context.files,
      commands: context.commands,
    };
    elements.agentContextPreview.textContent = JSON.stringify(compact, null, 2);
  }

  async function copyAgentContext() {
    const text = JSON.stringify(getAgentContext(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      elements.copyAgentContextButton.textContent = "Copied";
      window.setTimeout(() => {
        elements.copyAgentContextButton.textContent = "Copy";
      }, 1200);
    } catch (_error) {
      downloadText("pathways-agent-context.json", text, "application/json");
    }
  }

  function downloadAgentContext() {
    downloadText("pathways-agent-context.json", JSON.stringify(getAgentContext(), null, 2), "application/json");
  }

  function downloadText(filename, contents, type) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importUserState(file) {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const imported = parsed.user || parsed;
        state.user = {
          schemaVersion: 1,
          blocks: imported.blocks || {},
          transcripts: imported.transcripts || {},
          importedAt: new Date().toISOString(),
        };
        requestFullSync();
        saveNow();
        render();
      } catch (error) {
        window.alert(`Import failed: ${error.message}`);
      }
    });
    reader.readAsText(file);
  }

  function pageDomId(page) {
    return `page-${page.id}`;
  }

  function blockDomId(block) {
    return `block-${block.id}`;
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function renderSafeSnippet(value) {
    return escapeHtml(value).replace(/&lt;mark&gt;/g, "<mark>").replace(/&lt;\/mark&gt;/g, "</mark>");
  }

  function slugify(value) {
    return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "course";
  }

  function wireEvents() {
    elements.modeDock.querySelectorAll("button[data-mode]").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });
    elements.courseSelect.addEventListener("change", () => {
      setActiveCourse(elements.courseSelect.value);
      elements.content.focus();
    });
    elements.focusModeButton.addEventListener("click", toggleFocusMode);
    elements.catalogSearchInput.addEventListener("input", () => {
      state.catalogQuery = elements.catalogSearchInput.value;
      renderCatalog();
    });
    elements.certificateFilter.addEventListener("change", () => {
      state.certificateFilter = elements.certificateFilter.value;
      renderCatalog();
    });
    elements.catalogSort.addEventListener("change", () => {
      state.catalogSort = elements.catalogSort.value;
      renderCatalog();
    });
    elements.openCourseButton.addEventListener("click", scrollToReader);
    elements.reviewTagSelect.addEventListener("change", () => {
      state.reviewTag = elements.reviewTagSelect.value;
      renderReviewDeck();
    });
    elements.reviewScopeSelect.addEventListener("change", () => {
      state.reviewScope = elements.reviewScopeSelect.value;
      renderReviewDeck();
    });
    elements.startReviewButton.addEventListener("click", () => {
      const first = getReviewItems()[0];
      if (first) {
        openTarget(first);
      }
    });
    elements.searchInput.addEventListener("input", () => {
      state.query = elements.searchInput.value;
      renderContent();
    });
    elements.assignmentFilterButton.addEventListener("click", () => {
      toggleAssignmentFilter();
    });
    elements.clearFiltersButton.addEventListener("click", () => {
      state.query = "";
      state.selectedTag = "";
      state.assignmentOnly = false;
      elements.searchInput.value = "";
      render();
    });
    elements.dbSearchButton.addEventListener("click", runDatabaseSearch);
    elements.dbSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        runDatabaseSearch();
      }
    });
    elements.showHiddenToggle.addEventListener("change", () => {
      state.showHidden = elements.showHiddenToggle.checked;
      renderContent();
    });
    elements.assignmentOnlyToggle.addEventListener("change", () => {
      state.assignmentOnly = elements.assignmentOnlyToggle.checked;
      render();
    });
    elements.exportButton.addEventListener("click", exportUserState);
    elements.previewReviewButton.addEventListener("click", buildReviewPreview);
    elements.exportMarkdownButton.addEventListener("click", exportCourseMarkdown);
    elements.exportMode.addEventListener("change", buildReviewPreview);
    elements.exportTagInput.addEventListener("input", buildReviewPreview);
    elements.copyAgentContextButton.addEventListener("click", copyAgentContext);
    elements.downloadAgentContextButton.addEventListener("click", downloadAgentContext);
    elements.importInput.addEventListener("change", () => {
      const file = elements.importInput.files?.[0];
      if (file) {
        importUserState(file);
      }
      elements.importInput.value = "";
    });
    elements.selectionTags.addEventListener("change", updateSelectedTags);
    elements.selectionNotes.addEventListener("input", updateSelectedNotes);
    elements.resetBlockButton.addEventListener("click", resetSelectedBlock);
    elements.hideBlockButton.addEventListener("click", toggleSelectedHidden);
    elements.attachTranscriptButton.addEventListener("click", attachTranscriptToSelection);
  }

  async function loadSource() {
    wireEvents();
    await initializeRemoteState();
    try {
      const response = await fetch(DATA_URL, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      state.source = await response.json();
      indexSource();
      initCourseSelect();
      elements.dataStatus.textContent = `Generated ${state.source.generated_at} · ${state.source.stats.pages} pages`;
      render();
    } catch (error) {
      elements.dataStatus.innerHTML = `<span class="status-error">Missing data: run python3 scripts/ingest_course_materials.py</span>`;
      elements.content.innerHTML = '<section class="panel empty-state">No generated course data found.</section>';
      console.error(error);
    }
  }

  loadSource();
})();
