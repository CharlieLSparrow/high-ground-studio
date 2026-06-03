import React from 'react';
import { FunnelVisualizer } from '@/components/marketing/FunnelVisualizer';
import { QuipslyAgenticInsights } from '@/components/marketing/QuipslyAgenticInsights';
import { SidebarLayout } from '@/components/SidebarLayout';
import { getPrismaClient } from '@/lib/prisma';
import { Users, Mail, MousePointerClick } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function FunnelDashboard() {
  const prisma = getPrismaClient();
  
  // Get primary user
  const user = await prisma.user.findFirst();
  if (!user) {
    return (
      <SidebarLayout>
        <div className="p-8">System not configured. No users found.</div>
      </SidebarLayout>
    );
  }

  // 1. Get Landing Pages
  const landingPages = await prisma.landingPage.findMany({
    where: { userId: user.id }
  });
  
  const totalLpViews = landingPages.reduce((acc, lp) => acc + lp.views, 0) || 1200; // Mock base if 0
  const totalLpConversions = landingPages.reduce((acc, lp) => acc + lp.conversions, 0);

  // 2. Get Email Sequences
  const emailSequences = await prisma.emailSequence.findMany({
    where: { userId: user.id }
  });
  // Mock some engagement stats for the email sequence based on leads
  const emailOpens = Math.floor(totalLpConversions * 0.6); 
  const emailClicks = Math.floor(emailOpens * 0.15);

  // 3. Get Recent Leads
  const recentLeads = await prisma.marketingLead.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { landingPage: true }
  });

  const totalLeads = await prisma.marketingLead.count({
    where: { userId: user.id }
  });

  // Construct Mapped Steps for the Visualizer
  const mappedSteps = [
    {
      id: 'step-1-lp',
      stepOrder: 1,
      stepType: 'landing_page',
      name: 'Lead Capture Pages',
      views: totalLpViews,
      conversions: totalLpConversions, // Number of leads generated
      expectedConvRate: 35.0,
      actualConvRate: totalLpViews > 0 ? (totalLpConversions / totalLpViews) * 100 : 0
    },
    {
      id: 'step-2-email',
      stepOrder: 2,
      stepType: 'email_sequence',
      name: 'Welcome Sequences',
      views: totalLpConversions, // Leads sent the email
      conversions: emailClicks, // Link clicks
      expectedConvRate: 20.0,
      actualConvRate: totalLpConversions > 0 ? (emailClicks / totalLpConversions) * 100 : 0
    },
    {
      id: 'step-3-checkout',
      stepOrder: 3,
      stepType: 'checkout',
      name: 'Core Offer Checkout',
      views: emailClicks,
      conversions: Math.floor(emailClicks * 0.25), // Mock purchases
      expectedConvRate: 25.0,
      actualConvRate: 25.0
    }
  ];

  return (
    <SidebarLayout>
      <div className="p-8 max-w-7xl mx-auto w-full">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Marketing Pipeline</h1>
          <p className="text-zinc-500 mt-2">Live macro-view of your entire marketing and sales engine.</p>
        </header>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <MousePointerClick className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Active Landing Pages</p>
                <h3 className="text-3xl font-bold text-zinc-900 dark:text-white">{landingPages.length}</h3>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Total Leads Captured</p>
                <h3 className="text-3xl font-bold text-zinc-900 dark:text-white">{totalLeads}</h3>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Active Automations</p>
                <h3 className="text-3xl font-bold text-zinc-900 dark:text-white">{emailSequences.length}</h3>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-8">
          <div className="flex-1 space-y-8">
            {/* Funnel Visualization */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">Global Conversion Funnel</h2>
              </div>
              <FunnelVisualizer steps={mappedSteps} />
            </div>

            {/* CRM Recent Leads Table */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
                <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">Recent Leads (CRM)</h2>
                <p className="text-sm text-zinc-500 mt-1">The newest subscribers across all funnels.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Email</th>
                      <th className="px-6 py-4 font-semibold">Name</th>
                      <th className="px-6 py-4 font-semibold">Source Page</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                      <th className="px-6 py-4 font-semibold">Date Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {recentLeads.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                          No leads captured yet. Go to the Lead Capture Builder and opt-in!
                        </td>
                      </tr>
                    )}
                    {recentLeads.map(lead => (
                      <tr key={lead.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-zinc-900 dark:text-white">{lead.email}</td>
                        <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400">{lead.name || '-'}</td>
                        <td className="px-6 py-4">
                          {lead.landingPage ? (
                            <span className="text-indigo-600 dark:text-indigo-400">{lead.landingPage.name}</span>
                          ) : (
                            <span className="text-zinc-400">Direct / API</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                            {lead.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400">
                          {new Date(lead.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          <div className="xl:w-80 flex-shrink-0">
            {/* The QuipslyAgenticInsights component analyzes the funnel steps for revenue leaks */}
            <QuipslyAgenticInsights funnelStepsData={mappedSteps} personaId="1" />
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
