"use client";

import { X, Plus, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import type { QuoteProjection } from "@high-ground/quipsly-domain";
import { lorelists } from "@high-ground/quipsly-domain/seed"; // Temporary seed data

export function SaveToLorelistModal({
  quote,
  isOpen,
  onClose,
  onSave,
}: {
  readonly quote: QuoteProjection;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSave?: (lorelistId: string, note?: string) => void;
}) {
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!selectedList) return;
    setIsSaving(true);

    // Simulate network delay for UX
    setTimeout(() => {
      setIsSaving(false);
      setSuccess(true);
      if (onSave) onSave(selectedList, note);

      setTimeout(() => {
        setSuccess(false);
        onClose();
        setSelectedList(null);
        setNote("");
      }, 1500);
    }, 600);
  };

  return (
    <div className="share-modal-overlay" onClick={onClose} style={overlayStyle}>
      <div className="share-modal-content" onClick={(e) => e.stopPropagation()} style={contentStyle}>
        {success ? (
          <div style={successStyle}>
            <CheckCircle2 size={48} color="#b7733c" />
            <h2 style={{ marginTop: "16px" }}>Saved to Lorelist</h2>
            <p style={{ opacity: 0.8, marginTop: "8px" }}>Your collection is growing.</p>
          </div>
        ) : (
          <>
            <div className="share-modal-header" style={headerStyle}>
              <h2>Save to Lorelist</h2>
              <button onClick={onClose} className="button-icon" title="Close"><X size={20} /></button>
            </div>

            <div className="share-modal-body" style={bodyStyle}>
              <div style={quotePreviewStyle}>
                <span style={quotePreviewTextStyle}>"{quote.text.slice(0, 80)}{quote.text.length > 80 ? '...' : ''}"</span>
              </div>

              <div className="lorelist-selector" style={selectorStyle}>
                <h3 style={{ fontSize: "14px", textTransform: "uppercase", opacity: 0.7, marginBottom: "8px" }}>Select a Collection</h3>
                <div style={listContainerStyle}>
                  {lorelists.map(list => (
                    <button
                      key={list.id}
                      style={{ ...listItemStyle, ...(selectedList === list.id ? activeListItemStyle : {}) }}
                      onClick={() => setSelectedList(list.id)}
                    >
                      <div style={listIconStyle}></div>
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontWeight: "bold" }}>{list.title}</div>
                        <div style={{ fontSize: "12px", opacity: 0.7 }}>{list.visibility} • {list.arcLabel}</div>
                      </div>
                    </button>
                  ))}
                </div>
                <button style={createListBtnStyle}>
                  <Plus size={16} style={{ marginRight: "8px" }} />
                  Create new Lorelist
                </button>
              </div>

              {selectedList && (
                <div className="curator-note" style={{ marginTop: "16px" }}>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "bold", marginBottom: "8px" }}>
                    Curator's Note <span style={{ opacity: 0.5, fontWeight: "normal" }}>(Optional)</span>
                  </label>
                  <textarea
                    placeholder="Why are you saving this? What is the context?"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    style={textareaStyle}
                    rows={3}
                  />
                </div>
              )}
            </div>

            <div className="share-modal-footer" style={footerStyle}>
              <button className="button" onClick={onClose}>Cancel</button>
              <button
                className="button primary"
                onClick={handleSave}
                disabled={!selectedList || isSaving}
                style={{ ...(isSaving || !selectedList ? disabledBtnStyle : primaryBtnStyle) }}
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Inline styles for speed
const overlayStyle: React.CSSProperties = {
  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: "rgba(0,0,0,0.6)",
  display: "flex", justifyContent: "center", alignItems: "center",
  zIndex: 1000,
};
const contentStyle: React.CSSProperties = {
  backgroundColor: "#fffaf1", padding: "24px", borderRadius: "16px",
  width: "90%", maxWidth: "500px", boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};
const headerStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px"
};
const bodyStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "16px"
};
const quotePreviewStyle: React.CSSProperties = {
  padding: "16px", backgroundColor: "#fef3c7", borderRadius: "8px",
  borderLeft: "4px solid #b7733c", fontStyle: "italic", color: "#3d2618"
};
const quotePreviewTextStyle: React.CSSProperties = {
  fontSize: "15px", lineHeight: 1.5
};
const selectorStyle: React.CSSProperties = {
  marginTop: "8px"
};
const listContainerStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "8px", maxHeight: "200px", overflowY: "auto",
  marginBottom: "12px"
};
const listItemStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", padding: "12px", border: "1px solid #e5e7eb", borderRadius: "8px",
  backgroundColor: "#fff", cursor: "pointer", transition: "all 0.2s ease"
};
const activeListItemStyle: React.CSSProperties = {
  borderColor: "#b7733c", backgroundColor: "#fef3c7", boxShadow: "0 0 0 1px #b7733c"
};
const listIconStyle: React.CSSProperties = {
  width: "32px", height: "32px", borderRadius: "4px", backgroundColor: "#e0f2fe", marginRight: "12px"
};
const createListBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "12px",
  border: "1px dashed #b7733c", borderRadius: "8px", backgroundColor: "transparent", color: "#b7733c",
  cursor: "pointer", fontWeight: "bold"
};
const textareaStyle: React.CSSProperties = {
  width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #e5e7eb",
  backgroundColor: "#fff", fontFamily: "inherit", fontSize: "14px", resize: "vertical"
};
const footerStyle: React.CSSProperties = {
  display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #e5e7eb"
};
const disabledBtnStyle: React.CSSProperties = {
  opacity: 0.5, cursor: "not-allowed", backgroundColor: "#ccc", color: "#666", border: "none", padding: "10px 20px", borderRadius: "8px"
};
const primaryBtnStyle: React.CSSProperties = {
  backgroundColor: "#b7733c", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold"
};
const successStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center"
};
