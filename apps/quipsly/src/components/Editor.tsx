"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { SnippetExtension } from "../lib/SnippetExtension";
import { cn } from "../app/studio-ui";
import { 
  Bold, 
  Italic, 
  Code, 
  Sparkles, 
  Tag, 
  Video, 
  User, 
  BookOpen 
} from "lucide-react";

interface EditorProps {
  roomName: string;
  token?: string; // JWT token for collab auth
  userName?: string;
  userColor?: string;
  onSelectTagging?: (text: string) => void;
  onSelectVideo?: () => void;
}

export default function Editor({ 
  roomName, 
  token = "", 
  userName = "Anonymous", 
  userColor = "#f97316", // Default orange
  onSelectTagging,
  onSelectVideo
}: EditorProps) {
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);

  useEffect(() => {
    // Connect to the local Hocuspocus Collab Server
    const hocuspocusProvider = new HocuspocusProvider({
      url: "ws://localhost:8789",
      name: roomName,
      token,
      onAuthenticationFailed: () => {
        console.error("Collab authentication failed. Check your token.");
      },
    });

    setProvider(hocuspocusProvider);

    return () => {
      hocuspocusProvider.destroy();
    };
  }, [roomName, token]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // @ts-expect-error - Required to disable history for Yjs collab
        history: false,
      }),
      Collaboration.configure({
        document: provider?.document,
      }),
      CollaborationCaret.configure({
        provider: provider,
        user: {
          name: userName,
          color: userColor,
        },
      }),
      SnippetExtension,
    ],
    editorProps: {
      attributes: {
        class: "prose prose-lg dark:prose-invert focus:outline-none max-w-none min-h-[500px] text-studio-ink font-serif leading-relaxed",
      },
    },
  });

  const handleEditorClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const videoBlock = target.closest("[data-video-embed]");
    if (videoBlock && onSelectVideo) {
      onSelectVideo();
    }
  };

  if (!editor || !provider) {
    return (
      <div className="p-8 text-studio-muted flex items-center justify-center gap-3 bg-studio-panel/40 border border-studio-line/40 rounded-2xl backdrop-blur-xl min-h-[500px]">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-studio-tag border-t-transparent" />
        <span>Connecting to semantic collab room...</span>
      </div>
    );
  }

  return (
    <div 
      className="w-full bg-studio-panel/30 border border-studio-line/30 rounded-2xl shadow-studio-panel backdrop-blur-xl p-[28px] transition-all duration-300 relative focus-within:border-studio-source/40"
      onClick={handleEditorClick}
    >
      {/* Bubble Menu for formatting & workspace tagging/video */}
      {editor && (
        <BubbleMenu
          editor={editor}
          className="flex items-center gap-1 rounded-xl border border-studio-line/60 bg-[#0c1412]/95 p-1.5 shadow-2xl backdrop-blur-xl"
        >
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(
              "p-1.5 rounded-lg text-studio-muted hover:text-studio-ink hover:bg-studio-ink/10 transition-all",
              editor.isActive("bold") && "bg-studio-tag/15 text-studio-tag hover:bg-studio-tag/20"
            )}
            title="Bold"
            type="button"
          >
            <Bold size={15} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(
              "p-1.5 rounded-lg text-studio-muted hover:text-studio-ink hover:bg-studio-ink/10 transition-all",
              editor.isActive("italic") && "bg-studio-tag/15 text-studio-tag hover:bg-studio-tag/20"
            )}
            title="Italic"
            type="button"
          >
            <Italic size={15} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={cn(
              "p-1.5 rounded-lg text-studio-muted hover:text-studio-ink hover:bg-studio-ink/10 transition-all",
              editor.isActive("code") && "bg-studio-tag/15 text-studio-tag hover:bg-studio-tag/20"
            )}
            title="Code"
            type="button"
          >
            <Code size={15} />
          </button>

          <div className="w-[1px] h-4 bg-studio-line/60 mx-1" />

          <button
            onClick={() => {
              const { from, to } = editor.state.selection;
              const text = editor.state.doc.textBetween(from, to);
              onSelectTagging?.(text);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[0.75rem] font-bold bg-studio-tag/15 text-studio-tag hover:bg-studio-tag/25 transition-all"
            type="button"
          >
            <Tag size={13} />
            <span>Tag Excerpt</span>
          </button>

          <button
            onClick={() => {
              onSelectVideo?.();
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[0.75rem] font-bold bg-studio-source/15 text-studio-source hover:bg-studio-source/25 transition-all"
            type="button"
          >
            <Video size={13} />
            <span>Video Clip</span>
          </button>
        </BubbleMenu>
      )}

      {/* Floating Menu for inserting creative templates */}
      {editor && (
        <FloatingMenu
          editor={editor}
          className="flex flex-col gap-1 rounded-xl border border-studio-line/60 bg-[#0c1412]/95 p-1.5 shadow-2xl backdrop-blur-xl min-w-[200px]"
        >
          <div className="px-2 py-1 text-[0.68rem] font-bold text-studio-dim uppercase tracking-wider">
            Insert Template
          </div>
          <button
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertContent(
                  `<div class="p-5 my-4 rounded-xl border border-studio-source/30 bg-studio-source/5 backdrop-blur-md">
                    <h3 class="text-studio-source font-bold m-0 mb-2">👤 CHARACTER PROFILE: [Name]</h3>
                    <ul class="text-studio-muted text-sm space-y-1">
                      <li><strong>Role:</strong> Protagonist / Antagonist / Mentor</li>
                      <li><strong>Core Desire:</strong> What drives them?</li>
                      <li><strong>Greatest Fear:</strong> What holds them back?</li>
                      <li><strong>ADHD Trait:</strong> Hyperfocus triggers & cognitive styles</li>
                    </ul>
                  </div>`
                )
                .run()
            }
            className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left rounded-lg text-[0.8rem] text-studio-ink hover:bg-studio-ink/10 transition-all"
            type="button"
          >
            <User size={14} className="text-studio-source" />
            <span>Character Profile</span>
          </button>

          <button
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertContent(
                  `<div class="p-5 my-4 rounded-xl border border-studio-node/30 bg-studio-node/5 backdrop-blur-md">
                    <h3 class="text-studio-node font-bold m-0 mb-2">📚 CHAPTER OUTLINE</h3>
                    <ol class="text-studio-muted text-sm space-y-1">
                      <li><strong>The Hook:</strong> Immediate action or intrigue</li>
                      <li><strong>The Confrontation:</strong> Core struggle of this segment</li>
                      <li><strong>The Cliffhanger:</strong> High stakes transition to next chapter</li>
                    </ol>
                  </div>`
                )
                .run()
            }
            className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left rounded-lg text-[0.8rem] text-studio-ink hover:bg-studio-ink/10 transition-all"
            type="button"
          >
            <BookOpen size={14} className="text-studio-node" />
            <span>Chapter Outline</span>
          </button>

          <button
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertContent(
                  `<blockquote class="border-l-4 border-studio-tag bg-studio-tag/5 p-4 my-4 rounded-r-xl">
                    <span class="text-studio-tag font-extrabold flex items-center gap-1.5 text-xs uppercase mb-1">
                      <span class="animate-pulse">✨</span> Vertex AI Workbench Prompt
                    </span>
                    <p class="m-0 text-studio-ink italic">"Analyze the cognitive pacing of this draft and recommend high-momentum transition phrases."</p>
                  </blockquote>`
                )
                .run()
            }
            className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left rounded-lg text-[0.8rem] text-studio-ink hover:bg-studio-ink/10 transition-all"
            type="button"
          >
            <Sparkles size={14} className="text-studio-tag" />
            <span>AI Prompt Block</span>
          </button>

          <button
            onClick={() => {
              editor
                .chain()
                .focus()
                .insertContent(
                  `<div class="my-4 rounded-xl overflow-hidden border border-studio-tag/40 bg-studio-tag/5 p-4 flex flex-col gap-3" data-video-embed="gs://high-ground-raw/podcasts/episode-001.mp4">
                    <div class="flex items-center justify-between">
                      <span class="text-[0.7rem] font-bold text-studio-tag uppercase tracking-wider flex items-center gap-1">🎥 Video Clip Source</span>
                      <span class="text-[0.7rem] bg-studio-tag/15 text-studio-tag px-2 py-0.5 rounded font-mono">episode-001.mp4</span>
                    </div>
                    <p class="text-studio-ink text-sm m-0">Click this block to activate the AI Video Engine and crop social vertical clips.</p>
                  </div>`
                )
                .run();
              onSelectVideo?.();
            }}
            className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left rounded-lg text-[0.8rem] text-studio-ink hover:bg-studio-ink/10 transition-all"
            type="button"
          >
            <Video size={14} className="text-studio-source" />
            <span>Insert Video Source</span>
          </button>
        </FloatingMenu>
      )}

      <EditorContent editor={editor} />
    </div>
  );
}
