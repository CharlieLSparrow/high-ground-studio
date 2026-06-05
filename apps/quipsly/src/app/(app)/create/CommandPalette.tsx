import React, { useEffect, useState } from "react";
import { PlayCircle, Tag } from "lucide-react";

type CommandOption = {
  id: string;
  label: string;
  icon: typeof Tag;
  shortcut: string;
  action: () => void;
};

export default function CommandPalette({
  isOpen,
  onClose,
  position,
  onSelectStructure,
}: {
  isOpen: boolean;
  onClose: () => void;
  position: { top: number; left: number };
  onSelectStructure: (tagId: string) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const options: CommandOption[] = [
    {
      id: "chapter",
      label: "Chapter",
      icon: PlayCircle,
      shortcut: "Ch",
      action: () => onSelectStructure("chapter"),
    },
    {
      id: "episode",
      label: "Episode",
      icon: PlayCircle,
      shortcut: "Ep",
      action: () => onSelectStructure("episode"),
    },
  ];

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % options.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + options.length) % options.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        options[selectedIndex].action();
        onClose();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, options, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="absolute z-50 w-56 rounded-xl border border-amber-200 bg-white p-2 shadow-2xl overflow-hidden"
      style={{
        top: position.top + 24,
        left: position.left,
      }}
    >
      <div className="mb-2 px-2 pb-1 pt-1 text-[10px] font-black uppercase tracking-widest text-amber-600/70">
        Mark structure
      </div>
      <div className="flex flex-col gap-1">
        {options.map((option, index) => {
          const Icon = option.icon;
          const isSelected = index === selectedIndex;
          return (
            <button
              key={option.id}
              className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm font-bold transition-colors ${
                isSelected
                  ? "bg-amber-100 text-amber-900"
                  : "text-amber-950 hover:bg-amber-50"
              }`}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => {
                option.action();
                onClose();
              }}
            >
              <div className="flex items-center gap-2">
                <Icon size={14} className={isSelected ? "text-amber-600" : "text-amber-400"} />
                {option.label}
              </div>
              <span className="text-[10px] font-mono opacity-50">{option.shortcut}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
