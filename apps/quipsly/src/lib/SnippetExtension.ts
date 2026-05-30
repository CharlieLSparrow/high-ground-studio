import { Mark, mergeAttributes } from "@tiptap/core";

export interface SnippetOptions {
  HTMLAttributes: Record<string, any>;
  onSnippetClick?: (snippetId: string) => void;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    snippet: {
      /**
       * Set a snippet mark around the current selection
       */
      setSnippet: (attributes: { id: string }) => ReturnType;
      /**
       * Unset a snippet mark
       */
      unsetSnippet: () => ReturnType;
    };
  }
}

export const SnippetExtension = Mark.create<SnippetOptions>({
  name: "snippet",

  addOptions() {
    return {
      HTMLAttributes: {
        class: "bg-yellow-200 dark:bg-yellow-900/50 cursor-pointer rounded-sm px-1 py-0.5 border-b-2 border-yellow-400 dark:border-yellow-600",
      },
      onSnippetClick: undefined,
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-snippet-id]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-snippet-id"),
        renderHTML: (attributes) => {
          if (!attributes.id) return {};
          return {
            "data-snippet-id": attributes.id,
          };
        },
      },
    };
  },

  addCommands() {
    return {
      setSnippet:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      unsetSnippet:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});
