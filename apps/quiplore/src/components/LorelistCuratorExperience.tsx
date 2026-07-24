"use client";

import { useState } from "react";
import { CheckCircle2, ChevronRight, Library, Plus, Save, Trash2, X } from "lucide-react";
import { starterNest, getAllQuipCards, themes } from "@high-ground/quipsly-domain/seed";
import type { QuipCardProjection } from "@high-ground/quipsly-domain";

interface SelectedItem {
  id: string; // unique item id
  quoteId: string;
  card: QuipCardProjection;
  curatorNote: string;
}

export function LorelistCuratorExperience() {
  // Available quotes (mocked from starterNest)
  const allCards = getAllQuipCards();
  const availableCards = allCards.filter(card => starterNest.savedQuoteIds.includes(card.quote.id));

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [arcLabel, setArcLabel] = useState("");
  const [coverThemeId, setCoverThemeId] = useState(themes[0].id);
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("public");

  // Items State
  const [items, setItems] = useState<SelectedItem[]>([]);

  // Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Publish State
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleAddQuote = (card: QuipCardProjection) => {
    setItems((current) => [
      ...current,
      {
        id: `item-${Date.now()}-${card.quote.id}`,
        quoteId: card.quote.id,
        card,
        curatorNote: "",
      }
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const handleUpdateNote = (id: string, note: string) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, curatorNote: note } : item))
    );
  };

  const handlePublish = () => {
    setIsPublishing(true);

    // Simulate API payload
    const payload = {
      title,
      description,
      arcLabel,
      visibility,
      coverThemeId,
      items: items.map(item => ({
        quoteId: item.quoteId,
        curatorNote: item.curatorNote
      }))
    };

    console.log("Mock Publishing Lorelist payload:", JSON.stringify(payload, null, 2));

    setTimeout(() => {
      setIsPublishing(false);
      setIsSuccess(true);
    }, 1200);
  };

  if (isSuccess) {
    return (
      <div className="panel" style={{ textAlign: "center", padding: "4rem 2rem", marginTop: "2rem" }}>
        <CheckCircle2 size={48} className="text-emerald-600 mx-auto" />
        <h2 className="panel-title" style={{ marginTop: "1rem" }}>Lorelist Published</h2>
        <p className="panel-copy">Your collection is now live and waiting for readers.</p>
        <button
          className="button primary"
          onClick={() => window.location.href = "/hub"}
          style={{ marginTop: "2rem" }}
        >
          Return to Hub
        </button>
      </div>
    );
  }

  return (
    <div className="detail-grid" style={{ marginTop: "2rem" }}>
      {/* Left Column: Editor */}
      <section className="stack">
        <div className="panel">
          <span className="section-label">Lorelist Details</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
            <input
              type="text"
              placeholder="Collection Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-input"
              style={inputStyle}
            />
            <textarea
              placeholder="What ties these quotes together? (Description)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-input"
              style={{ ...inputStyle, minHeight: "80px" }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={labelStyle}>Arc Label</label>
                <input
                  type="text"
                  placeholder="e.g. Early Work"
                  value={arcLabel}
                  onChange={(e) => setArcLabel(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Visibility</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as any)}
                  style={inputStyle}
                >
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="passport-block lorelist-items">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="section-label">Collection Items ({items.length})</span>
            <button className="button primary" onClick={() => setIsDrawerOpen(true)}>
              <Plus size={16} /> Add Quote
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1.5rem" }}>
            {items.length === 0 ? (
              <div className="panel" style={{ textAlign: "center", opacity: 0.7 }}>
                <Library size={32} style={{ margin: "0 auto", opacity: 0.5 }} />
                <p style={{ marginTop: "1rem" }}>This Lorelist is empty. Add quotes from your Nest to begin curating.</p>
              </div>
            ) : (
              items.map((item, index) => (
                <div key={item.id} className="panel" style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                  <div style={{
                    width: "24px", height: "24px", borderRadius: "12px",
                    backgroundColor: "#f8d9b0", color: "#ad6b35",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: "bold", fontSize: "12px", flexShrink: 0
                  }}>
                    {index + 1}
                  </div>
                  <div style={{ flexGrow: 1 }}>
                    <blockquote style={{ fontSize: "14px", fontStyle: "italic", marginBottom: "0.5rem" }}>
                      "{item.card.quote.text.slice(0, 100)}{item.card.quote.text.length > 100 ? '...' : ''}"
                    </blockquote>
                    <p style={{ fontSize: "12px", opacity: 0.7, marginBottom: "1rem" }}>— {item.card.person.displayName}</p>

                    <textarea
                      placeholder="Curator's note for this quote (Optional)"
                      value={item.curatorNote}
                      onChange={(e) => handleUpdateNote(item.id, e.target.value)}
                      style={{ ...inputStyle, minHeight: "60px", fontSize: "13px" }}
                    />
                  </div>
                  <button className="button-icon" onClick={() => handleRemoveItem(item.id)} title="Remove item">
                    <Trash2 size={16} color="#ef4444" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Right Column: Actions */}
      <aside className="stack">
        <section className="panel">
          <span className="section-label">Publishing</span>
          <h2 className="panel-title">Ready to share?</h2>
          <p className="panel-copy">
            When you publish this Lorelist, it will become accessible based on your visibility settings.
          </p>
          <button
            className="button primary"
            style={{ width: "100%", justifyContent: "center", marginTop: "1rem" }}
            onClick={handlePublish}
            disabled={items.length === 0 || !title || isPublishing}
          >
            {isPublishing ? "Publishing..." : <><Save size={16} /> Publish Lorelist</>}
          </button>
          {(!title || items.length === 0) && (
            <p style={{ fontSize: "12px", color: "#ef4444", marginTop: "0.5rem", textAlign: "center" }}>
              Requires a title and at least one quote.
            </p>
          )}
        </section>
      </aside>

      {/* Drawer Overlay for Quote Selection */}
      {isDrawerOpen && (
        <div style={overlayStyle} onClick={() => setIsDrawerOpen(false)}>
          <div style={drawerStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <h2 className="panel-title">Your Nest</h2>
              <button className="button-icon" onClick={() => setIsDrawerOpen(false)}><X size={20} /></button>
            </div>

            <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
              {availableCards.map(card => (
                <div key={card.quote.id} className="panel" style={{ cursor: "pointer" }} onClick={() => {
                  handleAddQuote(card);
                  setIsDrawerOpen(false);
                }}>
                  <blockquote style={{ fontSize: "14px", fontStyle: "italic", marginBottom: "0.5rem" }}>
                    "{card.quote.text.slice(0, 80)}..."
                  </blockquote>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ fontSize: "12px", opacity: 0.7 }}>— {card.person.displayName}</p>
                    <ChevronRight size={16} color="#ad6b35" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline styles for speed
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #e2b17b",
  backgroundColor: "#fffaf1", fontFamily: "inherit", fontSize: "14px"
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "12px", fontWeight: "bold", marginBottom: "4px", color: "#8d5a2b", textTransform: "uppercase"
};
const overlayStyle: React.CSSProperties = {
  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: "rgba(0,0,0,0.4)", zIndex: 1000,
  display: "flex", justifyContent: "flex-end"
};
const drawerStyle: React.CSSProperties = {
  width: "100%", maxWidth: "400px", height: "100%", backgroundColor: "#fdf1dc",
  padding: "24px", boxShadow: "-10px 0 30px rgba(0,0,0,0.1)",
  display: "flex", flexDirection: "column"
};
