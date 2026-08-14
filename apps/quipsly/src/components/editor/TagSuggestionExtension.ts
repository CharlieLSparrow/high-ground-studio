import { Mention, MentionOptions } from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import tippy, { Instance as TippyInstance } from "tippy.js";
import { TagSuggestionList } from "./TagSuggestionList";

export interface TagSuggestionOptions extends MentionOptions {
  projectTags: { id: string; label: string; hexColor?: string | null }[];
}

export const TagSuggestionExtension = Mention.extend<TagSuggestionOptions>({
  name: "tagSuggestion",
  addOptions() {
    return {
      ...this.parent?.(),
      projectTags: [],
    } as TagSuggestionOptions;
  },
  renderHTML({ node, HTMLAttributes }: any) {
    const hex = node.attrs.hexColor || "#9ca3af";
    return [
      "span",
      {
        ...HTMLAttributes,
        class: "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-bold ring-1 ring-inset",
        style: `color: ${hex}; border-color: ${hex}40; background-color: ${hex}10;`,
      },
      `#${node.attrs.label}`,
    ];
  },
}).configure({
  HTMLAttributes: {
    class: "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-bold ring-1 ring-inset",
  },
  suggestion: {
    char: "#",
    pluginKey: undefined,
    items: ({ query, editor }: { query: string; editor: any }) => {
      const options = editor.extensionManager.extensions.find((e: any) => e.name === 'tagSuggestion')?.options;
      const tags = options?.projectTags || [];
      
      return tags
        .filter((item: any) => item.label.toLowerCase().startsWith(query.toLowerCase()))
        .slice(0, 5);
    },
    render: () => {
      let component: ReactRenderer<any>;
      let popup: TippyInstance[];

      return {
        onStart: (props: any) => {
          component = new ReactRenderer(TagSuggestionList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },

        onUpdate(props: any) {
          component.updateProps(props);

          if (!props.clientRect) {
            return;
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect,
          });
        },

        onKeyDown(props: any) {
          if (props.event.key === "Escape") {
            popup[0].hide();
            return true;
          }
          return component.ref?.onKeyDown(props);
        },

        onExit() {
          popup[0].destroy();
          component.destroy();
        },
      };
    },
  },
});
