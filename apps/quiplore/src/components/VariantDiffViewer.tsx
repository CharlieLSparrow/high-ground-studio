"use client";

import { useState, useMemo } from "react";
import { Search, History, ArrowRight } from "lucide-react";
import { VerificationBadge } from "@/components/VerificationBadge";
import type { QuoteVariantProjection, QuoteProjection } from "@high-ground/quipsly-domain";

interface DiffToken {
  text: string;
  type: "added" | "removed" | "unchanged";
}

// A simple LCS (Longest Common Subsequence) based word diff
function computeWordDiff(original: string, variant: string): DiffToken[] {
  // Split by whitespace but keep the whitespace as separate tokens so we can reconstruct exactly
  const tokenize = (text: string) => text.split(/(\s+)/).filter(t => t.length > 0);

  const origTokens = tokenize(original);
  const varTokens = tokenize(variant);

  // Create DP matrix
  const dp: number[][] = Array(origTokens.length + 1).fill(0).map(() => Array(varTokens.length + 1).fill(0));

  for (let i = 1; i <= origTokens.length; i++) {
    for (let j = 1; j <= varTokens.length; j++) {
      if (origTokens[i - 1].toLowerCase() === varTokens[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find diff
  const result: DiffToken[] = [];
  let i = origTokens.length;
  let j = varTokens.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origTokens[i - 1].toLowerCase() === varTokens[j - 1].toLowerCase()) {
      result.unshift({ text: varTokens[j - 1], type: "unchanged" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ text: varTokens[j - 1], type: "added" });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      result.unshift({ text: origTokens[i - 1], type: "removed" });
      i--;
    }
  }

  return result;
}

export function VariantDiffViewer({
  quote,
  variants
}: {
  readonly quote: QuoteProjection;
  readonly variants: readonly QuoteVariantProjection[];
}) {
  const [activeVariantId, setActiveVariantId] = useState<string | null>(
    variants.length > 0 ? variants[0].id : null
  );

  const activeVariant = variants.find(v => v.id === activeVariantId);

  const diff = useMemo(() => {
    if (!activeVariant) return [];
    return computeWordDiff(quote.text, activeVariant.text);
  }, [quote.text, activeVariant]);

  if (variants.length === 0) {
    return (
      <section className="text-stack">
        <h2 className="panel-title">Variants and disputes</h2>
        <p>No variants are attached to this record yet.</p>
      </section>
    );
  }

  return (
    <section className="text-stack">
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Search size={18} className="text-[#ad6b35]" />
        <h2 className="panel-title" style={{ margin: 0 }}>Misquote Forensics</h2>
      </div>
      <p className="panel-copy" style={{ marginBottom: "1rem" }}>
        Explore how this quote mutated over time. Select a variant below to view the semantic diff against the verified original.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1.5rem" }}>
        {/* Left Column: Variant List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {variants.map(variant => (
            <button
              key={variant.id}
              onClick={() => setActiveVariantId(variant.id)}
              className="panel"
              style={{
                textAlign: "left",
                padding: "1rem",
                cursor: "pointer",
                border: activeVariantId === variant.id ? "2px solid #ad6b35" : "1px solid #e2b17b",
                backgroundColor: activeVariantId === variant.id ? "#fdf1dc" : "#fffaf1",
                transition: "all 0.2s ease"
              }}
            >
              <div style={{ marginBottom: "0.5rem" }}>
                <VerificationBadge status={variant.status} />
              </div>
              <p style={{ fontSize: "12px", color: "#4c331b", lineHeight: 1.4, margin: 0, fontStyle: "italic" }}>
                "{variant.text.slice(0, 50)}..."
              </p>
            </button>
          ))}
        </div>

        {/* Right Column: The Diff Viewer */}
        {activeVariant && (
          <div className="panel" style={{ padding: "1.5rem", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <div style={{ fontSize: "12px", fontWeight: "bold", color: "#8d5a2b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Lexical Diff
              </div>
              <VerificationBadge status={activeVariant.status} />
            </div>

            <div style={{
              fontSize: "1.1rem",
              lineHeight: 1.6,
              color: "#4c331b",
              backgroundColor: "#fff",
              padding: "1.5rem",
              borderRadius: "8px",
              border: "1px solid #e2b17b",
              fontFamily: "var(--font-mono, monospace)" // give it a slightly technical feel
            }}>
              {diff.map((token, idx) => {
                if (token.text.match(/^\s+$/)) {
                  // just render whitespace normally
                  return <span key={idx}>{token.text}</span>;
                }

                if (token.type === "added") {
                  return (
                    <span key={idx} style={{
                      backgroundColor: "#dcfce7",
                      color: "#166534",
                      padding: "2px 4px",
                      borderRadius: "4px",
                      fontWeight: "bold"
                    }}>
                      {token.text}
                    </span>
                  );
                }

                if (token.type === "removed") {
                  return (
                    <span key={idx} style={{
                      backgroundColor: "#fee2e2",
                      color: "#991b1b",
                      padding: "2px 4px",
                      borderRadius: "4px",
                      textDecoration: "line-through",
                      opacity: 0.7
                    }}>
                      {token.text}
                    </span>
                  );
                }

                return <span key={idx}>{token.text}</span>;
              })}
            </div>

            <div style={{ marginTop: "1.5rem", borderTop: "1px solid #e2b17b", paddingTop: "1rem" }}>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem", color: "#8d5a2b", fontSize: "12px", fontWeight: "bold" }}>
                <History size={14} />
                <span>Quipsly MLE Note</span>
              </div>
              <p style={{ fontSize: "13px", color: "#4c331b", margin: 0, lineHeight: 1.5 }}>
                {activeVariant.note}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
