"use client";

import React, { useState } from "react";
import { 
  Users, 
  CreditCard, 
  History, 
  Plus, 
  Trash2, 
  ShieldAlert,
  Building,
  FileText,
  Activity,
  X,
  ChevronRight,
  Edit,
  Eye,
  BookOpen,
  EyeOff
} from "lucide-react";
import { 
  updateOrgDetailsAction, 
  removeTeamMemberAction, 
  updateMemberRoleAction
} from "./actions";
import { 
  createCategoryAction, 
  deleteCategoryAction, 
  upsertArticleAction, 
  deleteArticleAction 
} from "@/app/(marketing)/help/actions";
import { FeedbackPortal } from "./feedback-card";
import { OrganizationRole, SubscriptionStatus } from "@prisma/client";

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  subscription: {
    id: string;
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    currentPeriodEnd: Date | null;
  } | null;
}

interface Member {
  id: string;
  userId: string;
  role: OrganizationRole;
  user: {
    id: string;
    name: string | null;
    primaryEmail: string;
    image: string | null;
  };
}

interface LogEvent {
  id: string;
  eventName: string;
  payloadJson: unknown;
  createdAt: Date;
  user: {
    name: string | null;
    primaryEmail: string;
  };
}

function readableEventPayload(payload: unknown) {
  if (typeof payload !== "string") return payload;
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

export function SettingsClientView({
  initialOrg,
  initialMembers,
  initialEvents,
  initialFeedback,
  plans,
  currentUserRole,
  currentUserId,
  initialKbData = []
}: {
  initialOrg: any;
  initialMembers: any[];
  initialEvents: any[];
  initialFeedback: any[];
  plans: any[];
  currentUserRole: OrganizationRole;
  currentUserId: string;
  initialKbData?: any[];
}) {
  const [activeTab, setActiveTab] = useState<"team" | "billing" | "support" | "audit" | "kb">("team");
  
  // Organization profile state
  const [org, setOrg] = useState<Organization>(initialOrg);
  const [orgName, setOrgName] = useState(initialOrg.name);
  const [orgDesc, setOrgDesc] = useState(initialOrg.description || "");
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgMessage, setOrgMessage] = useState("");

  // Roster state
  const [members, setMembers] = useState<Member[]>(initialMembers);

  // Subscription records are displayed as persisted data only. Quipsly does
  // not currently expose a provider-backed checkout from this surface.
  const activePlan = (initialOrg.subscription?.plan || null) as SubscriptionPlan | null;
  const activeSubStatus = (initialOrg.subscription?.status || null) as SubscriptionStatus | null;

  // Audit state
  const events = initialEvents as LogEvent[];
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Knowledge Base management state
  const [kbData, setKbData] = useState<any[]>(initialKbData);
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [catLoading, setCatLoading] = useState(false);

  const [editingArticle, setEditingArticle] = useState<any | null>(null);
  const [isArticleModalOpen, setIsArticleModalOpen] = useState(false);
  const [artCategoryId, setArtCategoryId] = useState("");
  const [artTitle, setArtTitle] = useState("");
  const [artSlug, setArtSlug] = useState("");
  const [artContent, setArtContent] = useState("");
  const [artPublished, setArtPublished] = useState(false);
  const [artLoading, setArtLoading] = useState(false);

  // Can execute mutations
  const isOwnerOrAdmin = currentUserRole === OrganizationRole.OWNER || currentUserRole === OrganizationRole.ADMIN;

  const handleUpdateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnerOrAdmin) return;
    setOrgSaving(true);
    setOrgMessage("");

    const res = await updateOrgDetailsAction(org.id, orgName, orgDesc);
    if (res.ok) {
      setOrg({ ...org, name: orgName, description: orgDesc });
      setOrgMessage("Organization details updated successfully.");
    } else {
      setOrgMessage(res.error || "Failed to update organization details.");
    }
    setOrgSaving(false);
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("Are you sure you want to remove this member?")) return;
    const res = await removeTeamMemberAction(org.id, memberId);
    if (res.ok) {
      setMembers(members.filter(m => m.id !== memberId));
    } else {
      alert(res.error || "Failed to remove member.");
    }
  };

  const handleChangeRole = async (memberId: string, newRole: OrganizationRole) => {
    const res = await updateMemberRoleAction(org.id, memberId, newRole);
    if (res.ok) {
      setMembers(members.map(m => m.id === memberId ? { ...m, role: newRole } : m));
    } else {
      alert(res.error || "Failed to update role.");
    }
  };

  // KB Category submit
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName) return;
    setCatLoading(true);

    try {
      const res = await createCategoryAction(catName, catDesc);
      if (res.ok && res.category) {
        setKbData([...kbData, { ...res.category, articles: [] }]);
        setCatName("");
        setCatDesc("");
        setIsCatModalOpen(false);
      } else {
        alert("Failed to create help category.");
      }
    } catch (err) {
      alert("Error creating category.");
    } finally {
      setCatLoading(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Are you sure you want to delete this Category? All articles inside will be deleted!")) return;
    
    try {
      const res = await deleteCategoryAction(id);
      if (res.ok) {
        setKbData(kbData.filter(c => c.id !== id));
      }
    } catch (e) {
      alert("Error deleting category.");
    }
  };

  // KB Article submit
  const startNewArticle = () => {
    if (kbData.length === 0) {
      alert("Please create at least one Knowledge Category first.");
      return;
    }
    setEditingArticle(null);
    setArtCategoryId(kbData[0].id);
    setArtTitle("");
    setArtSlug("");
    setArtContent("");
    setArtPublished(false);
    setIsArticleModalOpen(true);
  };

  const startEditArticle = (art: any, catId: string) => {
    setEditingArticle(art);
    setArtCategoryId(catId);
    setArtTitle(art.title);
    setArtSlug(art.slug);
    setArtContent(art.content);
    setArtPublished(art.isPublished);
    setIsArticleModalOpen(true);
  };

  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!artTitle || !artSlug || !artContent) return;
    setArtLoading(true);

    try {
      const res = await upsertArticleAction(
        editingArticle?.id || null,
        artCategoryId,
        artTitle,
        artSlug,
        artContent,
        artPublished
      );

      if (res.ok && res.article) {
        // Refresh local categories state
        const updatedArticle = res.article;
        
        setKbData(kbData.map(cat => {
          // If moving categories, remove from previous category
          if (editingArticle && editingArticle.categoryId !== artCategoryId && cat.id === editingArticle.categoryId) {
            return { ...cat, articles: cat.articles.filter((a: any) => a.id !== editingArticle.id) };
          }
          
          // Add/Update in target category
          if (cat.id === artCategoryId) {
            const exists = cat.articles.some((a: any) => a.id === updatedArticle.id);
            const nextArticles = exists
              ? cat.articles.map((a: any) => a.id === updatedArticle.id ? updatedArticle : a)
              : [...cat.articles, updatedArticle];
            return { ...cat, articles: nextArticles };
          }
          
          return cat;
        }));

        setIsArticleModalOpen(false);
      } else {
        alert("Failed to save article.");
      }
    } catch (err) {
      alert("Error saving article details.");
    } finally {
      setArtLoading(false);
    }
  };

  const handleDeleteArticle = async (artId: string, catId: string) => {
    if (!confirm("Are you sure you want to delete this article?")) return;

    try {
      const res = await deleteArticleAction(artId);
      if (res.ok) {
        setKbData(kbData.map(cat => {
          if (cat.id === catId) {
            return { ...cat, articles: cat.articles.filter((a: any) => a.id !== artId) };
          }
          return cat;
        }));
      }
    } catch (e) {
      alert("Error deleting article.");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* Navigation list */}
      <aside className="col-span-1 flex flex-col gap-2 bg-[#032321]/50 border border-studio-line rounded-2xl p-4 h-fit">
        <button
          onClick={() => setActiveTab("team")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
            activeTab === "team" 
              ? "bg-studio-tag text-[#032321] shadow-sm" 
              : "text-studio-muted hover:text-studio-ink hover:bg-[#062d2a]"
          }`}
        >
          <Users size={16} />
          Profile & Team
        </button>
        <button
          onClick={() => setActiveTab("billing")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
            activeTab === "billing" 
              ? "bg-studio-tag text-[#032321] shadow-sm" 
              : "text-studio-muted hover:text-studio-ink hover:bg-[#062d2a]"
          }`}
        >
          <CreditCard size={16} />
          Billing & Plans
        </button>
        <button
          onClick={() => setActiveTab("kb")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
            activeTab === "kb" 
              ? "bg-studio-tag text-[#032321] shadow-sm" 
              : "text-studio-muted hover:text-studio-ink hover:bg-[#062d2a]"
          }`}
        >
          <BookOpen size={16} />
          Knowledge Base
        </button>
        <button
          onClick={() => setActiveTab("support")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
            activeTab === "support" 
              ? "bg-studio-tag text-[#032321] shadow-sm" 
              : "text-studio-muted hover:text-studio-ink hover:bg-[#062d2a]"
          }`}
        >
          <ShieldAlert size={16} />
          Feedback & Support
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
            activeTab === "audit" 
              ? "bg-studio-tag text-[#032321] shadow-sm" 
              : "text-studio-muted hover:text-studio-ink hover:bg-[#062d2a]"
          }`}
        >
          <History size={16} />
          Activity Log
        </button>
      </aside>

      {/* Main tab display panel */}
      <section className="col-span-1 lg:col-span-3 flex flex-col gap-6" aria-labelledby="settings-heading">
        
        {/* TAB 1: PROFILE & TEAM */}
        {activeTab === "team" && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-200">
            <div className="bg-[#032321]/90 border border-studio-line rounded-2xl p-6 shadow-studio-panel">
              <h3 className="text-lg font-bold text-studio-ink flex items-center gap-2 mb-4">
                <Building className="text-studio-tag" size={20} />
                Organization Details
              </h3>
              
              <form onSubmit={handleUpdateOrg} className="flex flex-col gap-4">
                {orgMessage && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold">
                    {orgMessage}
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="org-name" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
                      Organization Name
                    </label>
                    <input
                      id="org-name"
                      type="text"
                      disabled={!isOwnerOrAdmin}
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-studio-ink focus:outline-none focus:ring-2 focus:ring-studio-tag/20 transition-all font-medium text-sm disabled:opacity-50"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="org-slug" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
                      Identifier / Slug
                    </label>
                    <input
                      id="org-slug"
                      type="text"
                      disabled
                      value={org.slug}
                      className="bg-[#062d2a]/50 border border-studio-line/50 rounded-xl px-4 py-3 text-studio-dim focus:outline-none font-mono text-xs disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="org-desc" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
                    Studio Description
                  </label>
                  <textarea
                    id="org-desc"
                    rows={2}
                    disabled={!isOwnerOrAdmin}
                    value={orgDesc}
                    onChange={(e) => setOrgDesc(e.target.value)}
                    className="bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-studio-ink focus:outline-none focus:ring-2 focus:ring-studio-tag/20 transition-all font-medium text-sm disabled:opacity-50 resize-none"
                  />
                </div>

                {isOwnerOrAdmin && (
                  <button
                    type="submit"
                    disabled={orgSaving}
                    className="w-fit px-6 py-2.5 bg-studio-tag hover:bg-studio-tag/90 text-[#032321] font-black rounded-xl text-xs transition-all flex items-center gap-2 self-end mt-2 disabled:opacity-50"
                  >
                    {orgSaving ? "Saving..." : "Save Details"}
                  </button>
                )}
              </form>
            </div>

            <div className="bg-[#032321]/90 border border-studio-line rounded-2xl p-6 shadow-studio-panel">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-studio-ink">Collaborators</h3>
                  <p className="text-xs text-studio-muted mt-0.5">Review existing access and manage roles for current members.</p>
                </div>
                <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200">
                  Existing access only
                </span>
              </div>

              <div role="status" className="mb-5 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-xs leading-5 text-amber-100">
                New invitations are unavailable until Quipsly can issue an expiring invite, deliver it, and record acceptance. This page will not create an account or grant membership from an email address.
              </div>

              <div className="overflow-x-auto rounded-xl border border-studio-line">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-studio-line bg-[#062d2a]/50 text-studio-dim text-xs font-bold uppercase tracking-wider">
                      <th className="p-4">Name / Contact</th>
                      <th className="p-4">Workspace Privilege</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-b border-studio-line hover:bg-[#062d2a]/20 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#062d2a] border border-studio-line overflow-hidden shrink-0">
                              <img
                                src={m.user.image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.user.primaryEmail}`}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-studio-ink text-sm">{m.user.name || "Pending User"}</span>
                              <span className="text-xs text-studio-dim font-mono">{m.user.primaryEmail}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          {isOwnerOrAdmin && m.userId !== currentUserId && m.role !== OrganizationRole.OWNER ? (
                            <select
                              value={m.role}
                              onChange={(e) => handleChangeRole(m.id, e.target.value as OrganizationRole)}
                              className="bg-[#062d2a] border border-studio-line rounded-lg px-2 py-1 text-xs text-studio-ink focus:outline-none font-bold"
                            >
                              <option value="ADMIN">Admin</option>
                              <option value="EDITOR">Editor</option>
                              <option value="VIEWER">Viewer</option>
                            </select>
                          ) : (
                            <span className="text-xs font-bold px-2 py-1 bg-[#062d2a] border border-studio-line text-[#f0b765] rounded-lg">
                              {m.role}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          {isOwnerOrAdmin && m.userId !== currentUserId && m.role !== OrganizationRole.OWNER ? (
                            <button
                              onClick={() => handleRemoveMember(m.id)}
                              className="p-1.5 rounded-lg border border-studio-line text-studio-dim hover:text-rose-400 hover:border-rose-400/30 transition-all"
                              title="Revoke access"
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : (
                            <span className="text-xs text-studio-dim italic">System protected</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: BILLING & PLANS */}
        {activeTab === "billing" && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-200">
            <div role="status" className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5 text-sm leading-6 text-amber-100">
              <p className="font-black text-amber-200">Billing changes are not connected.</p>
              <p className="mt-1 text-xs">
                Quipsly is showing persisted subscription and plan-catalog records only. Prices, renewals, and entitlements are not verified checkout offers, and this page cannot charge a card or activate a plan.
              </p>
            </div>

            <div className="bg-[#032321]/90 border border-studio-line rounded-2xl p-6 shadow-studio-panel flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="flex gap-4 items-center">
                <div className="w-12 h-12 rounded-xl bg-studio-tag/10 border border-studio-tag/30 flex items-center justify-center text-studio-tag">
                  <CreditCard size={24} />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-studio-dim uppercase font-bold tracking-widest">Persisted subscription record</span>
                  <h3 className="text-xl font-black text-studio-ink mt-0.5">{activePlan?.name || "No plan recorded"}</h3>
                  <p className="text-xs text-studio-muted mt-1">
                    Status: <span className="font-bold text-studio-ink">{activeSubStatus || "No status recorded"}</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-col md:items-end gap-1 font-mono">
                <span className="text-2xl font-black text-studio-ink">
                  {activePlan ? `$${(activePlan.price / 100).toFixed(2)}` : "—"}
                  {activePlan && <span className="text-xs font-normal text-studio-dim"> / {activePlan.interval}</span>}
                </span>
                <span className="text-xs text-studio-muted">
                  {org.subscription?.currentPeriodEnd
                    ? `Recorded period end: ${new Date(org.subscription.currentPeriodEnd).toLocaleDateString()}`
                    : "No renewal or period-end receipt recorded"}
                </span>
              </div>
            </div>

            <div className="bg-[#032321]/90 border border-studio-line rounded-2xl p-6 shadow-studio-panel">
              <h3 className="text-lg font-bold text-studio-ink mb-2">Internal plan catalog</h3>
              <p className="text-xs text-studio-muted mb-6">Reference records only. Checkout, provider verification, and entitlement changes are intentionally disabled.</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {plans.map((p) => {
                  const isCurrent = p.id === activePlan?.id;
                  return (
                    <div key={p.id} className={`flex flex-col justify-between border rounded-2xl p-5 bg-[#062d2a]/40 ${
                      isCurrent ? "border-studio-tag" : "border-studio-line"
                    }`}>
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-start">
                          <h4 className="font-bold text-sm text-studio-ink">{p.name}</h4>
                          {isCurrent && (
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-studio-tag text-[#032321] rounded-full uppercase tracking-wider">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="flex items-baseline gap-1 mt-2">
                          <span className="text-3xl font-black text-studio-ink">${(p.price / 100).toFixed(0)}</span>
                          <span className="text-xs text-studio-dim">/{p.interval}</span>
                        </div>
                        
                        <p className="mt-4 text-xs leading-5 text-studio-muted">
                          No provider product, feature entitlement, or purchasable offer is asserted by this catalog row.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled
                        className="mt-6 w-full cursor-not-allowed rounded-xl border border-studio-line bg-[#062d2a] py-2.5 text-xs font-bold text-studio-dim opacity-75"
                      >
                        {isCurrent ? "Current database record" : "Checkout unavailable"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {plans.length === 0 && (
                <div className="rounded-xl border border-studio-line bg-[#062d2a]/30 p-5 text-sm text-studio-muted">
                  No plan catalog records are available.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: KNOWLEDGE BASE ADMIN */}
        {activeTab === "kb" && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-200">
            <div className="bg-[#032321]/90 border border-studio-line rounded-2xl p-6 shadow-studio-panel">
              <div className="flex justify-between items-center mb-6 border-b border-studio-line pb-4">
                <div>
                  <h3 className="text-lg font-bold text-studio-ink">Documentation Manager</h3>
                  <p className="text-xs text-studio-muted mt-0.5">Author articles that instantly publish to the public Help Center portal.</p>
                </div>
                
                {isOwnerOrAdmin && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsCatModalOpen(true)}
                      className="px-3 py-2 border border-studio-line hover:text-studio-ink text-studio-dim rounded-xl font-bold text-xs transition-all flex items-center gap-1.5"
                    >
                      <Plus size={12} /> New Category
                    </button>
                    <button
                      onClick={startNewArticle}
                      className="px-4 py-2 bg-studio-tag text-[#032321] hover:bg-studio-tag/90 rounded-xl font-black text-xs transition-all flex items-center gap-1.5"
                    >
                      <Plus size={14} /> Write Article
                    </button>
                  </div>
                )}
              </div>

              {/* Categories list */}
              <div className="flex flex-col gap-6">
                {kbData.map(cat => (
                  <div key={cat.id} className="border border-studio-line rounded-2xl p-5 bg-[#062d2a]/20 flex flex-col gap-4">
                    <div className="flex justify-between items-start border-b border-studio-line/40 pb-3">
                      <div>
                        <h4 className="font-bold text-sm text-studio-ink flex items-center gap-2">
                          <BookOpen className="text-studio-tag" size={16} />
                          {cat.name}
                        </h4>
                        <p className="text-xs text-studio-dim mt-0.5">{cat.description || "No description."}</p>
                      </div>
                      {isOwnerOrAdmin && (
                        <button
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="p-1 rounded-lg border border-transparent text-studio-dim hover:text-rose-400 hover:border-rose-450/20 hover:bg-[#062d2a]/30 transition-all"
                          title="Delete category"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>

                    {/* Articles in category */}
                    <div className="flex flex-col gap-2">
                      {cat.articles.map((art: any) => (
                        <div key={art.id} className="p-3 bg-[#032321]/80 border border-studio-line rounded-xl flex justify-between items-center hover:border-studio-line-strong transition-all">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                              art.isPublished 
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            }`}>
                              {art.isPublished ? "Published" : "Draft"}
                            </span>
                            <span className="font-bold text-xs text-studio-ink">{art.title}</span>
                            <span className="text-[10px] font-mono text-studio-dim">/help/article/{art.slug}</span>
                          </div>

                          {isOwnerOrAdmin && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => startEditArticle(art, cat.id)}
                                className="p-1 rounded text-studio-dim hover:text-studio-ink hover:bg-[#062d2a]/50"
                                title="Edit details"
                              >
                                <Edit size={12} />
                              </button>
                              <button
                                onClick={() => handleDeleteArticle(art.id, cat.id)}
                                className="p-1 rounded text-studio-dim hover:text-rose-400 hover:bg-[#062d2a]/50"
                                title="Delete article"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}

                      {cat.articles.length === 0 && (
                        <div className="text-center py-4 text-studio-dim italic text-xs">
                          No articles drafted inside this category yet.
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {kbData.length === 0 && (
                  <div className="text-center py-12 text-studio-dim italic text-sm">
                    No categories created yet. Create a category to start drafting articles.
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* TAB 4: FEEDBACK & SUPPORT */}
        {activeTab === "support" && (
          <div className="animate-in fade-in duration-200">
            <FeedbackPortal initialTickets={initialFeedback} orgId={org.id} />
          </div>
        )}

        {/* TAB 5: AUDIT ACTIVITY LOG */}
        {activeTab === "audit" && (
          <div className="bg-[#032321]/90 border border-studio-line rounded-2xl p-6 shadow-studio-panel animate-in fade-in duration-200">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-studio-ink flex items-center gap-2">
                <Activity className="text-studio-tag" size={20} />
                Organization Event Stream
              </h3>
              <p className="text-xs text-studio-muted mt-0.5">Real-time audit registry tracking SaaS operations and events.</p>
            </div>

            <div className="flex flex-col gap-3">
              {events.map((e) => {
                const isExpanded = expandedEventId === e.id;
                return (
                  <div 
                    key={e.id} 
                    className="border border-studio-line rounded-xl overflow-hidden bg-[#062d2a]/30"
                  >
                    <button
                      onClick={() => setExpandedEventId(isExpanded ? null : e.id)}
                      className="w-full flex justify-between items-center p-4 hover:bg-[#062d2a]/50 transition-colors text-left focus:outline-none"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-studio-tag animate-pulse"></div>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-studio-ink">{e.eventName}</span>
                          <span className="text-xs text-studio-dim">
                            By {e.user.name || e.user.primaryEmail}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono text-studio-dim">
                        <span>{new Date(e.createdAt).toLocaleTimeString()}</span>
                        <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90 text-studio-tag" : ""}`} />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-4 bg-[#032321] border-t border-studio-line font-mono text-xs flex flex-col gap-2">
                        <span className="text-studio-dim uppercase font-bold text-[10px] tracking-wider">Payload JSON:</span>
                        <pre className="p-3 bg-black/35 text-studio-muted rounded-lg overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(readableEventPayload(e.payloadJson), null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}

              {events.length === 0 && (
                <div className="text-center py-12 text-studio-dim italic text-sm">
                  No events logged in the stream yet.
                </div>
              )}
            </div>
          </div>
        )}

      </section>

      {/* NEW KB CATEGORY DIALOG */}
      {isCatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#032321] border border-studio-line rounded-2xl w-full max-w-md p-6 relative shadow-studio-panel">
            <button
              onClick={() => setIsCatModalOpen(false)}
              className="absolute top-4 right-4 text-studio-muted hover:text-studio-ink p-1 rounded-lg hover:bg-[#062d2a]"
              aria-label="Close Category Modal"
            >
              <X size={18} />
            </button>

            <h3 className="text-lg font-bold text-studio-ink mb-2">Create Help Category</h3>
            <p className="text-xs text-studio-muted mb-6">Group articles inside a custom topic heading.</p>

            <form onSubmit={handleCreateCategory} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="cat-name" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
                  Category Name
                </label>
                <input
                  id="cat-name"
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. Video Renders"
                  className="bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-studio-ink focus:outline-none focus:ring-2 focus:ring-studio-tag/20 transition-all text-sm"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="cat-desc" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
                  Description
                </label>
                <input
                  id="cat-desc"
                  type="text"
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  placeholder="Short description for this help group..."
                  className="bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-studio-ink focus:outline-none focus:ring-2 focus:ring-studio-tag/20 transition-all text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setIsCatModalOpen(false)}
                  className="px-4 py-2 border border-studio-line rounded-xl text-studio-dim hover:text-studio-ink font-bold text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={catLoading}
                  className="px-6 py-2 bg-studio-tag hover:bg-studio-tag/90 text-[#032321] font-black rounded-xl text-xs transition-all disabled:opacity-50"
                >
                  {catLoading ? "Creating..." : "Create Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: NEW/EDIT KB ARTICLE DIALOG */}
      {isArticleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#032321] border border-studio-line rounded-3xl w-full max-w-2xl p-6 relative shadow-studio-panel max-h-[85vh] flex flex-col justify-between">
            <div>
              <button
                onClick={() => setIsArticleModalOpen(false)}
                className="absolute top-4 right-4 text-studio-muted hover:text-studio-ink p-1.5 rounded-lg hover:bg-[#062d2a]"
                aria-label="Close Article Modal"
              >
                <X size={18} />
              </button>

              <h3 className="text-lg font-bold text-studio-ink mb-1">
                {editingArticle ? "Edit Help Article" : "Write Help Article"}
              </h3>
              <p className="text-xs text-studio-muted mb-6">Draft documentation templates using Markdown syntax.</p>
            </div>

            <form onSubmit={handleSaveArticle} className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor="art-category" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
                    Category Topic
                  </label>
                  <select
                    id="art-category"
                    value={artCategoryId}
                    onChange={(e) => setArtCategoryId(e.target.value)}
                    className="w-full bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-studio-ink text-sm focus:outline-none focus:ring-2 focus:ring-studio-tag/20"
                  >
                    {kbData.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="art-published" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
                    Publish Status
                  </label>
                  <select
                    id="art-published"
                    value={artPublished ? "true" : "false"}
                    onChange={(e) => setArtPublished(e.target.value === "true")}
                    className="w-full bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-studio-ink text-sm focus:outline-none focus:ring-2 focus:ring-studio-tag/20"
                  >
                    <option value="false">Draft (Internal)</option>
                    <option value="true">Published (Public)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor="art-title" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
                    Article Title
                  </label>
                  <input
                    id="art-title"
                    type="text"
                    required
                    value={artTitle}
                    onChange={(e) => {
                      setArtTitle(e.target.value);
                      if (!editingArticle) {
                        setArtSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                      }
                    }}
                    placeholder="e.g. Exporting Renders"
                    className="bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-studio-ink text-sm focus:outline-none focus:ring-2 focus:ring-studio-tag/20"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="art-slug" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
                    Slug Identifier
                  </label>
                  <input
                    id="art-slug"
                    type="text"
                    required
                    value={artSlug}
                    onChange={(e) => setArtSlug(e.target.value)}
                    placeholder="e.g. exporting-renders"
                    className="bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-studio-ink text-sm focus:outline-none focus:ring-2 focus:ring-studio-tag/20 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="art-content" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
                  Markdown Content
                </label>
                <textarea
                  id="art-content"
                  rows={8}
                  required
                  value={artContent}
                  onChange={(e) => setArtContent(e.target.value)}
                  placeholder="# Section Header&#10;&#10;Draft your article contents using clean markdown tags here..."
                  className="bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-studio-ink text-sm focus:outline-none focus:ring-2 focus:ring-studio-tag/20 resize-none font-mono text-xs leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-studio-line pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setIsArticleModalOpen(false)}
                  className="px-4 py-2 border border-studio-line rounded-xl text-studio-dim hover:text-studio-ink font-bold text-xs transition-all"
                >
                  Discard Draft
                </button>
                <button
                  type="submit"
                  disabled={artLoading}
                  className="px-6 py-2 bg-studio-tag hover:bg-studio-tag/90 text-[#032321] font-black rounded-xl text-xs transition-all disabled:opacity-50"
                >
                  {artLoading ? "Saving..." : "Save Article"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
