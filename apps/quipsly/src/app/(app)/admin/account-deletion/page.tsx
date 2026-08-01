import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileWarning,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { getPrismaClient } from "@/lib/prisma";
import {
  buildAccountDeletionInventory,
  type AccountDeletionInventory,
} from "@/lib/server/account-deletion-inventory";
import { projectAccountDeletionRequest } from "@/lib/server/account-deletion-policy";
import { accountDeletionWorkerConfiguration } from "@/lib/server/account-deletion-worker-client";
import { requireQuipslyAdminActor } from "@/lib/server/user-management";

import {
  advanceAccountDeletionReviewAction,
  executeAccountDeletionAction,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = {
  updated?: string;
  completed?: string;
  error?: string;
};

function queryValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function statusTone(status: string) {
  if (status === "COMPLETED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }
  if (status === "FAILED" || status === "REJECTED") {
    return "border-rose-200 bg-rose-50 text-rose-950";
  }
  if (status === "READY_FOR_DELETION" || status === "EXECUTING") {
    return "border-amber-300 bg-amber-50 text-amber-950";
  }
  return "border-sky-200 bg-sky-50 text-sky-950";
}

export default async function AccountDeletionConsolePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireQuipslyAdminActor();
  const query = searchParams ? await searchParams : {};
  const prisma = getPrismaClient();
  const requests = await prisma.userAccountDeletionRequest.findMany({
    orderBy: { requestedAt: "desc" },
    take: 50,
    include: {
      executions: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
  });
  const inventories = new Map<string, AccountDeletionInventory | Error>();

  await Promise.all(
    requests.map(async (request) => {
      const stored = request.executions[0]?.inventoryJson;
      if (stored) {
        inventories.set(
          request.id,
          stored as unknown as AccountDeletionInventory,
        );
        return;
      }
      if (!request.userId || request.status === "COMPLETED") return;
      try {
        inventories.set(
          request.id,
          await buildAccountDeletionInventory({
            userId: request.userId,
            prisma,
          }),
        );
      } catch (error) {
        inventories.set(
          request.id,
          error instanceof Error ? error : new Error("Inventory failed."),
        );
      }
    }),
  );

  const activeCount = requests.filter((request) =>
    [
      "REQUESTED",
      "REVIEWING",
      "EXPORT_PREPARING",
      "READY_FOR_DELETION",
      "EXECUTING",
      "FAILED",
    ].includes(request.status),
  ).length;
  const executorEnabled = accountDeletionWorkerConfiguration().enabled;

  return (
    <main className="mx-auto max-w-6xl space-y-6 pb-16 text-[#3d3122]">
      <header className="rounded-[32px] border border-[#e6d6bb] bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#9a652b]">
              Privacy operations
            </p>
            <h1 className="mt-3 font-serif text-4xl font-black tracking-tight md:text-5xl">
              Account deletion console
            </h1>
            <p className="mt-4 text-sm leading-7 text-[#6f5a43] md:text-base">
              Review account-owned and shared records before access is revoked.
              “Completed” is only written by the dedicated deletion worker
              after its database, storage, Firebase, and confirmation receipts
              succeed. Nest keeps its in-process deletion executor disabled;
              only the private worker combines the required deletion-provider
              authority.
            </p>
          </div>
          <div className="grid gap-2 text-right text-xs font-black uppercase tracking-[0.14em]">
            <span className="rounded-full border border-[#ead8ba] bg-[#fff8ec] px-4 py-2">
              {activeCount} active
            </span>
            <span
              className={`rounded-full border px-4 py-2 ${
                executorEnabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              Executor {executorEnabled ? "enabled" : "safety-gated"}
            </span>
          </div>
        </div>
      </header>

      {queryValue(query.error) ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-950">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h2 className="font-black">No deletion was completed</h2>
              <p className="mt-1 text-sm leading-6">
                {queryValue(query.error)}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {queryValue(query.completed) ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
          <div className="flex gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="font-bold">
              Request {queryValue(query.completed)} completed with a durable
              receipt.
            </p>
          </div>
        </section>
      ) : null}

      {requests.length === 0 ? (
        <section className="rounded-[28px] border border-dashed border-[#d9c5a5] bg-white/80 p-10 text-center">
          <Clock3 className="mx-auto h-8 w-8 text-[#a78056]" />
          <h2 className="mt-4 font-serif text-2xl font-black">
            No deletion requests
          </h2>
          <p className="mt-2 text-sm text-[#765f46]">
            In-app requests will appear here with their review deadline.
          </p>
        </section>
      ) : (
        <div className="grid gap-5">
          {requests.map((request) => {
            const projected = projectAccountDeletionRequest(request);
            const inventoryValue = inventories.get(request.id);
            const inventory =
              inventoryValue && !(inventoryValue instanceof Error)
                ? inventoryValue
                : null;
            const inventoryError =
              inventoryValue instanceof Error ? inventoryValue.message : null;
            const execution = request.executions[0] ?? null;

            return (
              <article
                key={request.id}
                className="rounded-[28px] border border-[#e6d6bb] bg-white p-5 shadow-sm md:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9a7654]">
                      {request.emailSnapshot ?? "Identity removed"}
                    </p>
                    <h2 className="mt-2 font-serif text-2xl font-black">
                      {projected.statusLabel}
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6f5a43]">
                      {projected.statusDetail}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] ${statusTone(
                      request.status,
                    )}`}
                  >
                    {request.status.replaceAll("_", " ")}
                  </span>
                </div>

                <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-2xl bg-[#fff8ec] p-3">
                    <dt className="text-xs font-bold uppercase text-[#9a7654]">
                      Request
                    </dt>
                    <dd className="mt-1 break-all font-mono text-xs">
                      {request.id}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-[#fff8ec] p-3">
                    <dt className="text-xs font-bold uppercase text-[#9a7654]">
                      Requested
                    </dt>
                    <dd className="mt-1 font-bold">
                      {request.requestedAt.toLocaleString()}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-[#fff8ec] p-3">
                    <dt className="text-xs font-bold uppercase text-[#9a7654]">
                      Target
                    </dt>
                    <dd className="mt-1 font-bold">
                      {projected.targetCompletionAt?.toLocaleDateString()}
                    </dd>
                  </div>
                </dl>

                <section className="mt-5 rounded-2xl border border-[#ead8ba] bg-[#fffdf9] p-4">
                  <div className="flex items-center gap-2">
                    {inventory?.eligibleForAutomatedExecution ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                    ) : (
                      <FileWarning className="h-5 w-5 text-amber-700" />
                    )}
                    <h3 className="font-black">Deletion inventory</h3>
                  </div>
                  {inventory ? (
                    <>
                      <p className="mt-2 text-sm leading-6 text-[#6f5a43]">
                        {inventory.homeNests.length} Home Nest
                        {inventory.homeNests.length === 1 ? "" : "s"};{" "}
                        {inventory.blockers.length} blocker categor
                        {inventory.blockers.length === 1 ? "y" : "ies"}.
                      </p>
                      {inventory.blockers.length > 0 ? (
                        <ul className="mt-3 grid gap-2">
                          {inventory.blockers.map((blocker) => (
                            <li
                              key={`${blocker.category}-${blocker.count}`}
                              className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"
                            >
                              <strong>{blocker.category}</strong>:{" "}
                              {blocker.count}. {blocker.reason}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-rose-800">
                      {inventoryError ??
                        "The account subject has already been removed."}
                    </p>
                  )}
                </section>

                {request.status === "REQUESTED" ? (
                  <form
                    action={advanceAccountDeletionReviewAction}
                    className="mt-5"
                  >
                    <input type="hidden" name="requestId" value={request.id} />
                    <input
                      type="hidden"
                      name="transition"
                      value="start-review"
                    />
                    <button className="rounded-xl bg-[#4f3a28] px-4 py-3 text-sm font-black text-white">
                      Start review
                    </button>
                  </form>
                ) : null}

                {request.status === "REVIEWING" ? (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <form action={advanceAccountDeletionReviewAction}>
                      <input
                        type="hidden"
                        name="requestId"
                        value={request.id}
                      />
                      <input
                        type="hidden"
                        name="transition"
                        value="prepare-export"
                      />
                      <button className="rounded-xl border border-[#cfb68d] bg-[#fff8ec] px-4 py-3 text-sm font-black">
                        Prepare requested export
                      </button>
                    </form>
                    <form action={advanceAccountDeletionReviewAction}>
                      <input
                        type="hidden"
                        name="requestId"
                        value={request.id}
                      />
                      <input type="hidden" name="transition" value="ready" />
                      <button className="rounded-xl bg-[#4f3a28] px-4 py-3 text-sm font-black text-white">
                        Inventory checked — ready
                      </button>
                    </form>
                  </div>
                ) : null}

                {request.status === "EXPORT_PREPARING" ? (
                  <form
                    action={advanceAccountDeletionReviewAction}
                    className="mt-5"
                  >
                    <input type="hidden" name="requestId" value={request.id} />
                    <input type="hidden" name="transition" value="ready" />
                    <button className="rounded-xl bg-[#4f3a28] px-4 py-3 text-sm font-black text-white">
                      Export handled — inventory checked
                    </button>
                  </form>
                ) : null}

                {(request.status === "READY_FOR_DELETION" ||
                  request.status === "FAILED") && (
                  <form
                    action={executeAccountDeletionAction}
                    className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4"
                  >
                    <div className="flex gap-3">
                      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-800" />
                      <div>
                        <h3 className="font-black text-rose-950">
                          Irreversible deletion
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-rose-900">
                          Rechecks inventory, disables access, deletes the
                          approved account and exclusive Home Nest data, then
                          sends confirmation. Failures stop with a resumable
                          receipt.
                        </p>
                      </div>
                    </div>
                    <input type="hidden" name="requestId" value={request.id} />
                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
                      <input
                        name="confirmation"
                        required
                        autoComplete="off"
                        placeholder={`DELETE ${request.id}`}
                        className="min-w-0 rounded-xl border border-rose-200 bg-white px-4 py-3 font-mono text-sm"
                      />
                      <select
                        name="exportDisposition"
                        required
                        defaultValue=""
                        className="rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold"
                      >
                        <option value="" disabled>
                          Export disposition
                        </option>
                        <option value="not-requested">Not requested</option>
                        <option value="declined">User declined</option>
                        <option value="delivered">Delivered</option>
                      </select>
                      <button
                        disabled={!executorEnabled}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-800 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Trash2 className="h-4 w-4" />
                        Execute
                      </button>
                    </div>
                  </form>
                )}

                {execution ? (
                  <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-[#8b765f]">
                    Execution {execution.status.toLowerCase()} ·{" "}
                    {execution.executorVersion} · receipt{" "}
                    {execution.receiptJson ? "present" : "pending"}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
