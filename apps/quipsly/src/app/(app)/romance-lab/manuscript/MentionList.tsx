import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { UserSquare2 } from 'lucide-react';
import { cn } from "../../studio-ui";

export const MentionList = forwardRef((props: any, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];

    if (item) {
      props.command({ id: item.id, label: item.name });
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

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: any) => {
      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }

      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }

      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }

      return false;
    },
  }));

  if (!props.items.length) {
    return null;
  }

  return (
    <div className="bg-[#fdfaf6] border border-[#e8dcc4] rounded-xl shadow-xl overflow-hidden min-w-[220px]">
      {props.items.map((item: any, index: number) => (
        <button
          className={cn(
            "w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors",
            index === selectedIndex ? "bg-[#f8f3e6] border-l-2 border-[#8c6b4a]" : "bg-transparent border-l-2 border-transparent hover:bg-[#f8f3e6]/50"
          )}
          key={item.id}
          onClick={() => selectItem(index)}
        >
          <UserSquare2 size={16} className="text-[#8c6b4a]" />
          <div>
            <div className="font-bold text-[#3d3122]">{item.name}</div>
            <div className="text-[10px] uppercase tracking-wider text-[#8c6b4a]">{item.archetype || "Unknown Role"}</div>
          </div>
        </button>
      ))}
    </div>
  );
});

MentionList.displayName = 'MentionList';
