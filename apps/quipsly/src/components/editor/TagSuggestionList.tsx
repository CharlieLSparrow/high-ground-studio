import React, { forwardRef, useEffect, useImperativeHandle, useState } from "react";

export const TagSuggestionList = forwardRef((props: any, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command({ id: item.id, label: item.label, hexColor: item.hexColor });
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        upHandler();
        return true;
      }
      if (event.key === "ArrowDown") {
        downHandler();
        return true;
      }
      if (event.key === "Enter") {
        enterHandler();
        return true;
      }
      return false;
    },
  }));

  if (!props.items || props.items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-studio-line/60 bg-[#0c1412]/95 p-1.5 shadow-2xl backdrop-blur-xl min-w-[150px]">
      <div className="px-2 py-1 text-[0.68rem] font-bold text-studio-dim uppercase tracking-wider">
        Select Tag
      </div>
      {props.items.map((item: any, index: number) => (
        <button
          key={item.id}
          className={`flex items-center gap-2 w-full px-2.5 py-1.5 text-left rounded-lg text-[0.8rem] transition-all ${
            index === selectedIndex ? "bg-studio-ink/10 text-studio-ink" : "text-studio-muted hover:bg-studio-ink/5"
          }`}
          onClick={() => selectItem(index)}
        >
          <span 
            className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset"
            style={{ 
              color: item.hexColor || "#9ca3af",
              borderColor: item.hexColor ? `${item.hexColor}40` : "#9ca3af40",
              backgroundColor: item.hexColor ? `${item.hexColor}10` : "transparent"
            }}
          >
            #{item.label}
          </span>
        </button>
      ))}
    </div>
  );
});

TagSuggestionList.displayName = "TagSuggestionList";
