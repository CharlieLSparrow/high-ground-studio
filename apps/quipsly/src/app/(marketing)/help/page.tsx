import React from "react";
import { HelpClientPortal } from "./help-client-portal";
import { getPrismaClient } from "@/lib/prisma";

export const metadata = {
  title: "Quipsly Help Center",
  description: "Browse guides, FAQs, and support tutorials for Quipsly.com.",
};

export const dynamic = "force-dynamic";

export default async function HelpCenterPage() {
  const prisma = getPrismaClient();

  // Load all categories with published articles
  const categories = await prisma.knowledgeCategory.findMany({
    include: {
      articles: {
        where: { isPublished: true },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { order: "asc" },
  });

  return (
    <div className="min-h-screen bg-transparent p-4">
      <HelpClientPortal initialCategories={categories} />
    </div>
  );
}
