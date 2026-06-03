"use client";

import React, { useState } from "react";
import { 
  Target, 
  LayoutTemplate, 
  Mail, 
  Plus, 
  Map, 
  Briefcase, 
  Play, 
  Users, 
  Sparkles, 
  Database,
  Search,
  CheckCircle,
  FileText,
  BarChart2,
  Terminal,
  Send,
  Loader2,
  X,
  Edit,
  Trash2
} from "lucide-react";
import Image from "next/image";
import { 
  bootstrapMarketingDataAction, 
  createNewLeadAction, 
  updateEmailSequenceAction, 
  dispatchSimulatedCampaignAction 
} from "./actions";

type Props = {
  initialCampaigns: any[];
  avatars: any[];
  landingPages: any[];
  emailSequences: any[];
  leads: any[];
  organization: any;
};

interface EmailStep {
  subject: string;
  body: string;
  dayOffset: number;
}

export function CampaignSandboxClient({ 
  initialCampaigns, 
  avatars, 
  landingPages, 
  emailSequences,
  leads: initialLeads,
  organization
}: Props) {
  const [activeTab, setActiveTab] = useState<"sandbox" | "crm" | "dispatch">("sandbox");
  const [campaigns, setCampaigns] = useState<any[]>(initialCampaigns);
  const [activeCampaign, setActiveCampaign] = useState(initialCampaigns[0] || null);
  const [leads, setLeads] = useState<any[]>(initialLeads);
  const [sequences, setSequences] = useState<any[]>(emailSequences);
  const [lps, setLps] = useState<any[]>(landingPages);
  
  // Roster segment query filters
  const [crmFilter, setCrmFilter] = useState<"all" | "subscribed" | "unsubscribed" | "blueprint">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewLeadOpen, setIsNewLeadOpen] = useState(false);
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadEmail, setNewLeadEmail] = useState("");
  
  // Sequence editor state
  const [editingSequence, setEditingSequence] = useState<any | null>(null);
  const [seqName, setSeqName] = useState("");
  const [seqEmails, setSeqEmails] = useState<EmailStep[]>([]);
  const [seqSaving, setSeqSaving] = useState(false);

  // Dispatch Sandbox states
  const [selectedSequence, setSelectedSequence] = useState<any | null>(emailSequences[0] || null);
  const [selectedSegment, setSelectedSegment] = useState<string>("subscribed");
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simLogs, setSimLogs] = useState<string[]>([]);
  const [simStats, setSimStats] = useState({ sent: 0, opened: 0, clicked: 0, bounced: 0 });
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      const res = await bootstrapMarketingDataAction(organization.id);
      if (res.ok) {
        window.location.reload();
      } else {
        alert("Provisioning sandbox data failed.");
      }
    } catch (err) {
      console.error(err);
      alert("Error provisioning sandbox database data.");
    } finally {
      setBootstrapping(false);
    }
  };

  const handleCreateCampaign = async () => {
    setIsCreatingCampaign(true);
    try {
      const res = await fetch("/api/marketing/campaigns", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to create campaign");
      
      const newCampaign = await res.json();
      setCampaigns(prev => [newCampaign, ...prev]);
      setActiveCampaign(newCampaign);
    } catch (err) {
      console.error(err);
      alert("Failed to create campaign");
    } finally {
      setIsCreatingCampaign(false);
    }
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadEmail) return;

    try {
      const res = await createNewLeadAction(organization.id, newLeadName, newLeadEmail, "subscribed");
      if (res.ok && res.lead) {
        setLeads([res.lead, ...leads]);
        setNewLeadName("");
        setNewLeadEmail("");
        setIsNewLeadOpen(false);
      } else {
        alert("Failed to create lead.");
      }
    } catch (err) {
      alert("Error adding lead.");
    }
  };

  const startEditSequence = (seq: any) => {
    setEditingSequence(seq);
    setSeqName(seq.name);
    try {
      setSeqEmails(JSON.parse(seq.emailsJson as string));
    } catch (e) {
      setSeqEmails([]);
    }
  };

  const handleSaveSequence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSequence) return;
    setSeqSaving(true);

    const res = await updateEmailSequenceAction(editingSequence.id, seqName, seqEmails);
    if (res.ok && res.sequence) {
      setSequences(sequences.map(s => s.id === editingSequence.id ? res.sequence : s));
      setEditingSequence(null);
    } else {
      alert("Failed to save sequence.");
    }
    setSeqSaving(false);
  };

  const addEmailStep = () => {
    setSeqEmails([...seqEmails, { subject: "New Email Step", body: "Write body copy...", dayOffset: 1 }]);
  };

  const removeEmailStep = (index: number) => {
    setSeqEmails(seqEmails.filter((_, i) => i !== index));
  };

  const updateEmailStepField = (index: number, field: keyof EmailStep, value: any) => {
    setSeqEmails(seqEmails.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  // Run Campaign Dispatch simulation
  const handleSimulateDispatch = async () => {
    if (!selectedSequence || !activeCampaign) {
      alert("Please select both a sequence and an active campaign.");
      return;
    }

    setSimulationRunning(true);
    setSimLogs(["[System] Initializing transactional dispatch simulation engine...", `[System] Targeting segment: [${selectedSegment.toUpperCase()}]`]);
    setSimStats({ sent: 0, opened: 0, clicked: 0, bounced: 0 });

    const targetLeads = leads.filter(l => {
      if (selectedSegment === "subscribed") return l.status === "subscribed";
      return true;
    });

    if (targetLeads.length === 0) {
      setSimLogs(prev => [...prev, "[Error] Dispatch aborted: No leads found in target segment."]);
      setSimulationRunning(false);
      return;
    }

    const leadIds = targetLeads.map(l => l.id);

    try {
      // Proactively run the simulated action first to commit events to the DB
      const res = await dispatchSimulatedCampaignAction(organization.id, activeCampaign.id, selectedSequence.id, leadIds);
      
      if (!res.ok) {
        setSimLogs(prev => [...prev, `[Error] ${res.error || "Simulation run failed."}`]);
        setSimulationRunning(false);
        return;
      }

      // Simulate a real-time progress dispatch visual logger in the UI
      const steps = JSON.parse(selectedSequence.emailsJson as string);
      let localSent = 0;
      let localOpened = 0;
      let localClicked = 0;
      let localBounced = 0;

      for (const lead of targetLeads) {
        setSimLogs(prev => [...prev, `[Queue] Preparing email bundle for: ${lead.email}`]);
        await new Promise(r => setTimeout(r, 200));

        for (let idx = 0; idx < steps.length; idx++) {
          const step = steps[idx];
          
          localSent++;
          setSimStats(prev => ({ ...prev, sent: localSent }));
          setSimLogs(prev => [...prev, `[SMTP] Send step ${idx + 1} "${step.subject}" -> ${lead.email} SUCCESS`]);
          await new Promise(r => setTimeout(r, 150));

          const randomVal = Math.random();
          if (randomVal < 0.05) {
            localBounced++;
            setSimStats(prev => ({ ...prev, bounced: localBounced }));
            setSimLogs(prev => [...prev, `[Warning] Delivery failed (Bounce): mailbox full for ${lead.email}`]);
            break; // Stop sequences for this lead
          }

          if (randomVal < 0.75) {
            localOpened++;
            setSimStats(prev => ({ ...prev, opened: localOpened }));
            setSimLogs(prev => [...prev, `[Opened] ${lead.name || lead.email} read step ${idx + 1}`]);
            await new Promise(r => setTimeout(r, 150));

            if (randomVal < 0.40) {
              localClicked++;
              setSimStats(prev => ({ ...prev, clicked: localClicked }));
              setSimLogs(prev => [...prev, `[Action] ${lead.name || lead.email} clicked target URL link!`]);
              await new Promise(r => setTimeout(r, 150));
            }
          }
        }
      }

      setSimLogs(prev => [...prev, `[Complete] Campaign execution resolved. Generated ${res.eventsGeneratedCount} UserEvents in DB ledger.`]);
    } catch (err) {
      setSimLogs(prev => [...prev, `[Error] Simulation failed to execute: ${String(err)}`]);
    } finally {
      setSimulationRunning(false);
    }
  };

  // Filter CRM lists
  const filteredLeads = leads.filter(l => {
    const matchesSearch = l.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (l.name && l.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (!matchesSearch) return false;
    if (crmFilter === "subscribed") return l.status === "subscribed";
    if (crmFilter === "unsubscribed") return l.status === "unsubscribed";
    return true;
  });

  // Main UI Empty State if no campaigns exist
  if (campaigns.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-transparent min-h-[calc(100vh-100px)] text-studio-ink">
        <div className="bg-[#032321] border border-studio-line rounded-3xl p-8 max-w-xl text-center shadow-studio-panel flex flex-col items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-studio-tag/10 border border-studio-tag/30 flex items-center justify-center text-studio-tag">
            <Database size={32} />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold tracking-tight">Configure Your CRM Workspace</h2>
            <p className="text-sm text-studio-muted leading-relaxed">
              Before launching a campaign, we need to populate your studio database with sample leads, landing pages, and email automators.
            </p>
          </div>
          <button
            onClick={handleBootstrap}
            disabled={bootstrapping}
            className="px-8 py-3.5 bg-studio-tag hover:bg-studio-tag/90 text-[#032321] font-black rounded-xl text-sm transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {bootstrapping ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Provisioning CRM Database...
              </>
            ) : (
              <>
                <Sparkles size={16} /> Bootstrap Sandbox Data
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] w-full bg-transparent text-studio-ink">
      
      {/* Top Header tab controls */}
      <header className="shrink-0 border-b border-studio-line px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#032321]/50 backdrop-blur-md">
        <div>
          <span className="text-[10px] font-bold text-studio-tag uppercase tracking-widest">Growth Engine</span>
          <h2 className="text-xl font-black text-studio-ink mt-0.5">Campaign Dashboard</h2>
        </div>

        <div className="flex items-center gap-2 bg-[#032321] border border-studio-line rounded-xl p-1 shrink-0">
          <button
            onClick={() => setActiveTab("sandbox")}
            className={`px-4 py-2 rounded-lg font-bold text-xs transition-all ${
              activeTab === "sandbox" ? "bg-studio-tag text-[#032321]" : "text-studio-dim hover:text-studio-ink"
            }`}
          >
            <Map className="inline mr-1" size={14} /> Campaign Canvas
          </button>
          <button
            onClick={() => setActiveTab("crm")}
            className={`px-4 py-2 rounded-lg font-bold text-xs transition-all ${
              activeTab === "crm" ? "bg-studio-tag text-[#032321]" : "text-studio-dim hover:text-studio-ink"
            }`}
          >
            <Users className="inline mr-1" size={14} /> CRM directory
          </button>
          <button
            onClick={() => setActiveTab("dispatch")}
            className={`px-4 py-2 rounded-lg font-bold text-xs transition-all ${
              activeTab === "dispatch" ? "bg-studio-tag text-[#032321]" : "text-studio-dim hover:text-studio-ink"
            }`}
          >
            <Send className="inline mr-1" size={14} /> Dispatch Console
          </button>
        </div>
      </header>

      {/* Tab content wrapper */}
      <div className="flex-1 min-h-0 relative">
        
        {/* TAB 1: CAMPAIGN CANVAS */}
        {activeTab === "sandbox" && (
          <div className="h-full flex divide-x divide-studio-line animate-in fade-in duration-150">
            {/* Sidebar list */}
            <aside className="w-80 flex flex-col bg-[#032321]/20 overflow-y-auto shrink-0">
              <div className="p-4 border-b border-studio-line flex justify-between items-center bg-[#032321]/40">
                <span className="text-xs font-bold text-studio-dim uppercase tracking-wider">Launches</span>
                <button 
                  onClick={handleCreateCampaign}
                  disabled={isCreatingCampaign}
                  className="flex items-center gap-1 text-[10px] font-black bg-studio-tag hover:bg-studio-tag/90 text-[#032321] px-2.5 py-1.5 rounded-lg transition-all"
                >
                  <Plus size={12} /> New Launch
                </button>
              </div>

              <div className="p-3 flex flex-col gap-2">
                {campaigns.map(camp => (
                  <button
                    key={camp.id}
                    onClick={() => setActiveCampaign(camp)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      activeCampaign?.id === camp.id 
                        ? "bg-[#032321] border-studio-tag/50 shadow-sm" 
                        : "bg-transparent border-transparent hover:bg-[#062d2a]/30"
                    }`}
                  >
                    <h4 className={`font-bold text-sm ${activeCampaign?.id === camp.id ? "text-studio-ink" : "text-studio-muted"}`}>
                      {camp.name}
                    </h4>
                    <p className="text-xs text-studio-dim mt-1 line-clamp-1">{camp.description || "No description"}</p>
                    <span className="inline-block text-[9px] font-bold bg-[#062d2a] border border-studio-line text-[#f0b765] px-2 py-0.5 rounded-md uppercase mt-3">
                      {camp.status}
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            {/* Canvas */}
            <main className="flex-1 bg-transparent p-6 overflow-y-auto min-w-0">
              {!activeCampaign ? (
                <div className="h-full flex flex-col items-center justify-center text-studio-dim">
                  <Map className="w-12 h-12 mb-2 opacity-30" />
                  <p className="text-sm italic">Select a launch campaign from the sidebar.</p>
                </div>
              ) : (
                <div className="max-w-6xl mx-auto flex flex-col gap-6">
                  <div className="flex flex-col gap-1 border-b border-studio-line pb-4">
                    <h3 className="text-2xl font-black text-studio-ink">{activeCampaign.name}</h3>
                    <p className="text-sm text-studio-muted">{activeCampaign.description}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Avatars */}
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between border-b border-studio-line pb-2">
                        <span className="font-bold text-xs text-studio-dim uppercase tracking-wider flex items-center gap-1.5">
                          <Target size={14} className="text-studio-tag" /> Target Avatars
                        </span>
                        <span className="bg-[#032321] border border-studio-line text-[10px] px-2 py-0.5 rounded-full font-bold text-studio-muted">{avatars.length}</span>
                      </div>
                      
                      <div className="flex flex-col gap-3">
                        {avatars.map(avatar => (
                          <div key={avatar.id} className="bg-[#032321]/90 border border-studio-line p-4 rounded-xl shadow-sm flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#062d2a] overflow-hidden shrink-0 border border-studio-line">
                              <img src={avatar.avatarImageUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${avatar.name}`} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div className="min-w-0">
                              <h5 className="font-bold text-xs text-studio-ink truncate">{avatar.name}</h5>
                              <p className="text-[10px] text-studio-dim truncate">{avatar.demographics}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Landing Pages */}
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between border-b border-studio-line pb-2">
                        <span className="font-bold text-xs text-studio-dim uppercase tracking-wider flex items-center gap-1.5">
                          <LayoutTemplate size={14} className="text-studio-tag" /> Lead Capture pages
                        </span>
                        <span className="bg-[#032321] border border-studio-line text-[10px] px-2 py-0.5 rounded-full font-bold text-studio-muted">{lps.length}</span>
                      </div>
                      
                      <div className="flex flex-col gap-3">
                        {lps.map(lp => (
                          <div key={lp.id} className="bg-[#032321]/90 border-l-2 border-l-emerald-500 border border-studio-line p-4 rounded-xl relative overflow-hidden flex flex-col gap-2">
                            <h5 className="font-bold text-xs text-studio-ink">{lp.name}</h5>
                            <p className="text-[10px] text-studio-muted line-clamp-1">{lp.headline}</p>
                            <div className="flex items-center gap-2 mt-1 text-[10px] font-bold">
                              <span className="bg-[#062d2a] border border-studio-line text-studio-dim px-2 py-0.5 rounded">Views: {lp.views}</span>
                              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">Leads: {lp.conversions}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Email Sequences */}
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between border-b border-studio-line pb-2">
                        <span className="font-bold text-xs text-studio-dim uppercase tracking-wider flex items-center gap-1.5">
                          <Mail size={14} className="text-studio-tag" /> Email Sequences
                        </span>
                        <span className="bg-[#032321] border border-studio-line text-[10px] px-2 py-0.5 rounded-full font-bold text-studio-muted">{sequences.length}</span>
                      </div>
                      
                      <div className="flex flex-col gap-3">
                        {sequences.map(seq => {
                          let stepCount = 0;
                          try {
                            stepCount = JSON.parse(seq.emailsJson as string).length;
                          } catch (e) {}

                          return (
                            <div 
                              key={seq.id} 
                              className="bg-[#032321]/90 border-l-2 border-l-amber-500 border border-studio-line p-4 rounded-xl flex justify-between items-center group cursor-pointer hover:border-studio-line-strong transition-colors"
                              onClick={() => startEditSequence(seq)}
                            >
                              <div className="flex flex-col gap-1 min-w-0">
                                <h5 className="font-bold text-xs text-studio-ink truncate group-hover:text-[#f0b765] transition-colors">{seq.name}</h5>
                                <span className="text-[10px] text-studio-dim">{stepCount} email steps</span>
                              </div>
                              <Edit size={12} className="text-studio-dim group-hover:text-studio-ink transition-colors" />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                </div>
              )}
            </main>
          </div>
        )}

        {/* TAB 2: CRM CONTACT DIRECTORY */}
        {activeTab === "crm" && (
          <div className="h-full p-6 overflow-y-auto animate-in fade-in duration-150 max-w-6xl mx-auto flex flex-col gap-6">
            {/* Stats widgets */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[#032321] border border-studio-line rounded-2xl p-5 shadow-sm flex flex-col gap-1">
                <span className="text-xs font-bold text-studio-dim uppercase">Total Leads</span>
                <span className="text-3xl font-black text-studio-ink mt-1">{leads.length}</span>
              </div>
              <div className="bg-[#032321] border border-studio-line rounded-2xl p-5 shadow-sm flex flex-col gap-1">
                <span className="text-xs font-bold text-studio-dim uppercase">Active Subscribed</span>
                <span className="text-3xl font-black text-emerald-400 mt-1">
                  {leads.filter(l => l.status === "subscribed").length}
                </span>
              </div>
              <div className="bg-[#032321] border border-studio-line rounded-2xl p-5 shadow-sm flex flex-col gap-1">
                <span className="text-xs font-bold text-studio-dim uppercase">Opt-out Rate</span>
                <span className="text-3xl font-black text-studio-muted mt-1">
                  {leads.length > 0 ? ((leads.filter(l => l.status === "unsubscribed").length / leads.length) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <div className="bg-[#032321] border border-studio-line rounded-2xl p-5 shadow-sm flex flex-col gap-1">
                <span className="text-xs font-bold text-studio-dim uppercase">Active Funnels</span>
                <span className="text-3xl font-black text-[#f0b765] mt-1">{lps.length}</span>
              </div>
            </div>

            {/* Leads Directory & Segment tools */}
            <div className="bg-[#032321]/90 border border-studio-line rounded-2xl p-6 shadow-studio-panel flex-1 flex flex-col gap-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-studio-line pb-6">
                
                {/* Filters */}
                <div className="flex items-center gap-2 bg-[#062d2a] border border-studio-line rounded-xl p-1 font-mono text-xs">
                  <button
                    onClick={() => setCrmFilter("all")}
                    className={`px-3 py-1.5 rounded-lg font-bold ${crmFilter === "all" ? "bg-[#032321] text-studio-tag" : "text-studio-dim hover:text-studio-ink"}`}
                  >
                    All Leads
                  </button>
                  <button
                    onClick={() => setCrmFilter("subscribed")}
                    className={`px-3 py-1.5 rounded-lg font-bold ${crmFilter === "subscribed" ? "bg-[#032321] text-studio-tag" : "text-studio-dim hover:text-studio-ink"}`}
                  >
                    Subscribed Segment
                  </button>
                  <button
                    onClick={() => setCrmFilter("unsubscribed")}
                    className={`px-3 py-1.5 rounded-lg font-bold ${crmFilter === "unsubscribed" ? "bg-[#032321] text-studio-tag" : "text-studio-dim hover:text-studio-ink"}`}
                  >
                    Unsubscribed
                  </button>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div className="relative flex-1 md:w-64">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-studio-dim" />
                    <input
                      type="text"
                      placeholder="Search contacts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#062d2a] border border-studio-line rounded-xl py-2 pl-9 pr-4 text-xs text-studio-ink placeholder:text-studio-dim/40 focus:outline-none focus:ring-1 focus:ring-studio-tag/30"
                    />
                  </div>
                  
                  <button
                    onClick={() => setIsNewLeadOpen(true)}
                    className="flex items-center gap-1 px-4 py-2 bg-studio-tag text-[#032321] hover:bg-studio-tag/90 font-black text-xs rounded-xl transition-all shrink-0"
                  >
                    <Plus size={14} /> Add Lead
                  </button>
                </div>
              </div>

              {/* Roster table */}
              <div className="overflow-x-auto rounded-xl border border-studio-line">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-studio-line bg-[#062d2a]/50 text-studio-dim font-bold uppercase tracking-wider">
                      <th className="p-4">Contact name</th>
                      <th className="p-4">Email address</th>
                      <th className="p-4">Conversion Source</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map(l => (
                      <tr key={l.id} className="border-b border-studio-line hover:bg-[#062d2a]/20 transition-colors">
                        <td className="p-4 font-bold text-studio-ink">{l.name || "Anonymous Lead"}</td>
                        <td className="p-4 font-mono text-studio-dim">{l.email}</td>
                        <td className="p-4 text-studio-muted">{l.landingPage?.name || "Manual Import"}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${
                            l.status === "subscribed" 
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                              : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                          }`}>
                            {l.status}
                          </span>
                        </td>
                        <td className="p-4 text-right text-studio-dim">{new Date(l.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                    {filteredLeads.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center p-8 text-studio-dim italic">
                          No leads matching current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DISPATCH SIMULATION CONSOLE */}
        {activeTab === "dispatch" && (
          <div className="h-full p-6 overflow-y-auto animate-in fade-in duration-150 max-w-6xl mx-auto flex flex-col gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Configuration panel */}
              <div className="lg:col-span-1 bg-[#032321]/90 border border-studio-line rounded-2xl p-6 shadow-studio-panel flex flex-col gap-4">
                <h3 className="text-lg font-bold text-studio-ink flex items-center gap-2 mb-2">
                  <Play className="text-studio-tag" size={20} />
                  Dispatch Setup
                </h3>

                <div className="flex flex-col gap-2">
                  <label htmlFor="seq-select" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
                    Email Sequence
                  </label>
                  <select
                    id="seq-select"
                    value={selectedSequence?.id || ""}
                    onChange={(e) => setSelectedSequence(sequences.find(s => s.id === e.target.value) || null)}
                    className="w-full bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-studio-ink text-sm focus:outline-none"
                  >
                    {sequences.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="seg-select" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
                    Target Segment
                  </label>
                  <select
                    id="seg-select"
                    value={selectedSegment}
                    onChange={(e) => setSelectedSegment(e.target.value)}
                    className="w-full bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-studio-ink text-sm focus:outline-none"
                  >
                    <option value="subscribed">All Subscribed CRM Leads ({leads.filter(l => l.status === "subscribed").length})</option>
                  </select>
                </div>

                <button
                  onClick={handleSimulateDispatch}
                  disabled={simulationRunning}
                  className="w-full py-3.5 bg-studio-tag hover:bg-studio-tag/90 disabled:opacity-50 text-[#032321] font-black rounded-xl text-sm transition-all flex items-center justify-center gap-2 mt-4"
                >
                  {simulationRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Dispatching Sequence...
                    </>
                  ) : (
                    <>
                      <Send size={14} /> Start Dispatch Simulation
                    </>
                  )}
                </button>
              </div>

              {/* Console logs */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                
                {/* Stats panel */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-[#032321] border border-studio-line rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-studio-dim uppercase">Dispatched</span>
                    <span className="text-2xl font-black text-studio-ink mt-2">{simStats.sent}</span>
                  </div>
                  <div className="bg-[#032321] border border-studio-line rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-studio-dim uppercase">Opened</span>
                    <span className="text-2xl font-black text-sky-400 mt-2">{simStats.opened}</span>
                  </div>
                  <div className="bg-[#032321] border border-studio-line rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-studio-dim uppercase">Clicks</span>
                    <span className="text-2xl font-black text-emerald-400 mt-2">{simStats.clicked}</span>
                  </div>
                  <div className="bg-[#032321] border border-studio-line rounded-xl p-4 flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-studio-dim uppercase">Bounces</span>
                    <span className="text-2xl font-black text-rose-400 mt-2">{simStats.bounced}</span>
                  </div>
                </div>

                {/* Console output */}
                <div className="bg-black border border-studio-line rounded-2xl p-6 shadow-studio-panel flex-1 flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-studio-line pb-3">
                    <span className="text-xs font-bold text-studio-dim flex items-center gap-1.5 font-mono">
                      <Terminal size={14} className="text-studio-tag" /> dispatch_engine_simulation.sh
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  </div>

                  <div className="flex-1 bg-black/60 font-mono text-[11px] text-zinc-300 overflow-y-auto max-h-[320px] custom-scrollbar p-3 rounded-lg flex flex-col gap-1 text-left leading-relaxed">
                    {simLogs.map((log, idx) => {
                      let color = "text-zinc-300";
                      if (log.startsWith("[SMTP]")) color = "text-[#f0b765]";
                      if (log.startsWith("[Opened]")) color = "text-sky-300";
                      if (log.startsWith("[Action]")) color = "text-emerald-400 font-bold";
                      if (log.startsWith("[Error]")) color = "text-rose-400";
                      if (log.startsWith("[System]")) color = "text-studio-dim";
                      
                      return (
                        <div key={idx} className={color}>
                          {log}
                        </div>
                      );
                    })}

                    {simLogs.length === 0 && (
                      <div className="text-zinc-600 italic">Console idle. Awaiting campaign dispatch trigger...</div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          </div>
        )}

      </div>

      {/* MODAL 1: NEW LEAD DIALOG */}
      {isNewLeadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div 
            className="bg-[#032321] border border-studio-line rounded-2xl w-full max-w-md p-6 relative shadow-studio-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-lead-title"
          >
            <button
              onClick={() => setIsNewLeadOpen(false)}
              className="absolute top-4 right-4 text-studio-muted hover:text-studio-ink p-1 rounded-lg hover:bg-[#062d2a]"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>

            <h3 id="new-lead-title" className="text-lg font-bold text-studio-ink mb-2">Import Single Contact</h3>
            <p className="text-xs text-studio-muted mb-6">Create an active lead record inside your CRM database directory.</p>

            <form onSubmit={handleAddLead} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="lead-name" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
                  Full Name
                </label>
                <input
                  id="lead-name"
                  type="text"
                  value={newLeadName}
                  onChange={(e) => setNewLeadName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-studio-ink focus:outline-none focus:ring-2 focus:ring-studio-tag/20 transition-all text-sm"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="lead-email" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
                  Email Address
                </label>
                <input
                  id="lead-email"
                  type="email"
                  required
                  value={newLeadEmail}
                  onChange={(e) => setNewLeadEmail(e.target.value)}
                  placeholder="e.g. john@domain.com"
                  className="bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-studio-ink focus:outline-none focus:ring-2 focus:ring-studio-tag/20 transition-all text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setIsNewLeadOpen(false)}
                  className="px-4 py-2 border border-studio-line rounded-xl text-studio-dim hover:text-studio-ink font-bold text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-studio-tag hover:bg-studio-tag/90 text-[#032321] font-black rounded-xl text-xs transition-all"
                >
                  Import Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EMAIL SEQUENCE STEP-BY-STEP EDITOR */}
      {editingSequence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="bg-[#032321] border border-studio-line rounded-3xl w-full max-w-2xl p-6 relative shadow-studio-panel max-h-[85vh] flex flex-col justify-between"
            role="dialog"
            aria-modal="true"
            aria-labelledby="seq-editor-title"
          >
            <div>
              <button
                onClick={() => setEditingSequence(null)}
                className="absolute top-4 right-4 text-studio-muted hover:text-studio-ink p-1.5 rounded-lg hover:bg-[#062d2a]"
                aria-label="Close editor"
              >
                <X size={18} />
              </button>

              <h3 id="seq-editor-title" className="text-lg font-bold text-studio-ink mb-1">Sequence Customizer</h3>
              <p className="text-xs text-studio-muted mb-6">Modify dispatch titles and draft contents for steps within the automation sequence.</p>
            </div>

            <form onSubmit={handleSaveSequence} className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label htmlFor="seq-title" className="text-xs font-bold uppercase tracking-wider text-studio-dim">
                  Sequence Name
                </label>
                <input
                  id="seq-title"
                  type="text"
                  required
                  value={seqName}
                  onChange={(e) => setSeqName(e.target.value)}
                  className="bg-[#062d2a] border border-studio-line rounded-xl px-4 py-3 text-studio-ink text-sm focus:outline-none focus:ring-2 focus:ring-studio-tag/20"
                />
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center border-b border-studio-line pb-2">
                  <span className="text-xs font-bold text-studio-dim uppercase">Automator Steps</span>
                  <button
                    type="button"
                    onClick={addEmailStep}
                    className="flex items-center gap-1 text-[10px] font-black bg-studio-tag/10 text-studio-tag border border-studio-tag/20 px-2 py-1 rounded hover:bg-studio-tag/20 transition-all"
                  >
                    <Plus size={10} /> Add Step
                  </button>
                </div>

                {seqEmails.map((email, idx) => (
                  <div key={idx} className="p-4 bg-[#062d2a]/30 border border-studio-line rounded-xl flex flex-col gap-3 relative">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-[#f0b765] bg-[#062d2a] px-2 py-0.5 rounded border border-studio-line uppercase tracking-wide">
                        Email Step {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeEmailStep(idx)}
                        className="text-studio-dim hover:text-rose-400 p-1 rounded hover:bg-[#062d2a]"
                        title="Delete step"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 flex flex-col gap-1">
                        <label htmlFor={`subject-${idx}`} className="text-[10px] font-bold uppercase text-studio-dim">Subject Line</label>
                        <input
                          id={`subject-${idx}`}
                          type="text"
                          required
                          value={email.subject}
                          onChange={(e) => updateEmailStepField(idx, "subject", e.target.value)}
                          className="bg-[#062d2a] border border-studio-line rounded-lg px-3 py-2 text-xs text-studio-ink focus:outline-none"
                        />
                      </div>
                      <div className="col-span-1 flex flex-col gap-1">
                        <label htmlFor={`offset-${idx}`} className="text-[10px] font-bold uppercase text-studio-dim">Day Delay</label>
                        <input
                          id={`offset-${idx}`}
                          type="number"
                          required
                          min={0}
                          value={email.dayOffset}
                          onChange={(e) => updateEmailStepField(idx, "dayOffset", parseInt(e.target.value) || 0)}
                          className="bg-[#062d2a] border border-studio-line rounded-lg px-3 py-2 text-xs text-studio-ink focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label htmlFor={`body-${idx}`} className="text-[10px] font-bold uppercase text-studio-dim">Email Content</label>
                      <textarea
                        id={`body-${idx}`}
                        rows={3}
                        required
                        value={email.body}
                        onChange={(e) => updateEmailStepField(idx, "body", e.target.value)}
                        className="bg-[#062d2a] border border-studio-line rounded-lg px-3 py-2 text-xs text-studio-ink focus:outline-none resize-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 mt-6 border-t border-studio-line pt-4">
                <button
                  type="button"
                  onClick={() => setEditingSequence(null)}
                  className="px-4 py-2 border border-studio-line rounded-xl text-studio-dim hover:text-studio-ink font-bold text-xs transition-all"
                >
                  Discard Changes
                </button>
                <button
                  type="submit"
                  disabled={seqSaving}
                  className="px-6 py-2 bg-studio-tag hover:bg-studio-tag/90 text-[#032321] font-black rounded-xl text-xs transition-all disabled:opacity-50"
                >
                  {seqSaving ? "Saving..." : "Save Sequence"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
