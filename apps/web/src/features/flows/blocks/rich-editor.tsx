"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { EditorContent, Node, mergeAttributes, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  BoldIcon, Heading2Icon, Heading3Icon, ItalicIcon, ListIcon, ListOrderedIcon, MessageSquareWarningIcon, QuoteIcon, Redo2Icon,
  StrikethroughIcon, UnderlineIcon, Undo2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const CALLOUT_VARIANTS = ["info", "warning", "error", "note", "success"] as const;
type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    callout: { setCallout: (variant: CalloutVariant) => ReturnType };
  }
}

/** Encart d'information / avertissement / erreur / notes / réussite (`flowApp.flowTab.blocStyle.*`). */
const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { variant: { default: "info", parseHTML: (el) => el.getAttribute("data-variant") ?? "info", renderHTML: (a) => ({ "data-variant": a.variant }) } };
  },
  parseHTML() { return [{ tag: "div[data-callout]" }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "", class: "rich-callout" }), 0]; },
  addCommands() {
    return { setCallout: (variant) => ({ commands }) => commands.wrapIn(this.name, { variant }) };
  },
});

export const CALLOUT_CLASSES =
  "[&_.rich-callout]:my-2 [&_.rich-callout]:rounded-md [&_.rich-callout]:border-l-4 [&_.rich-callout]:px-3 [&_.rich-callout]:py-2 " +
  "[&_.rich-callout[data-variant=info]]:border-info [&_.rich-callout[data-variant=info]]:bg-info-bg " +
  "[&_.rich-callout[data-variant=warning]]:border-warning [&_.rich-callout[data-variant=warning]]:bg-warning-bg " +
  "[&_.rich-callout[data-variant=error]]:border-destructive [&_.rich-callout[data-variant=error]]:bg-danger-bg " +
  "[&_.rich-callout[data-variant=note]]:border-muted-foreground [&_.rich-callout[data-variant=note]]:bg-muted " +
  "[&_.rich-callout[data-variant=success]]:border-success [&_.rich-callout[data-variant=success]]:bg-success-bg";

export const RICH_CONTENT_CLASSES = cn(
  "max-w-none text-sm [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_p]:my-1",
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic",
  "[&_a]:text-info [&_a]:underline",
  CALLOUT_CLASSES,
);

function Toolbar({ editor }: { editor: Editor }) {
  const t = useTranslations("blocks.editor");
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"), strike: e.isActive("strike"),
      h2: e.isActive("heading", { level: 2 }), h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"), quote: e.isActive("blockquote"),
    }),
  });
  const btn = (key: string, active: boolean, Icon: typeof BoldIcon, run: () => void) => (
    <Button key={key} type="button" size="icon-sm" variant={active ? "secondary" : "ghost"} aria-label={t(key)} title={t(key)}
      onMouseDown={(e) => e.preventDefault()} onClick={run}>
      <Icon />
    </Button>
  );
  const chain = () => editor.chain().focus();
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1 py-1">
      {btn("bold", state.bold, BoldIcon, () => chain().toggleBold().run())}
      {btn("italic", state.italic, ItalicIcon, () => chain().toggleItalic().run())}
      {btn("underline", state.underline, UnderlineIcon, () => chain().toggleUnderline().run())}
      {btn("strike", state.strike, StrikethroughIcon, () => chain().toggleStrike().run())}
      {btn("heading2", state.h2, Heading2Icon, () => chain().toggleHeading({ level: 2 }).run())}
      {btn("heading3", state.h3, Heading3Icon, () => chain().toggleHeading({ level: 3 }).run())}
      {btn("bulletList", state.bullet, ListIcon, () => chain().toggleBulletList().run())}
      {btn("orderedList", state.ordered, ListOrderedIcon, () => chain().toggleOrderedList().run())}
      {btn("blockquote", state.quote, QuoteIcon, () => chain().toggleBlockquote().run())}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="ghost"><MessageSquareWarningIcon data-icon="inline-start" />{t("insertCallout")}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            {CALLOUT_VARIANTS.map((v) => (
              <DropdownMenuItem key={v} onSelect={() => chain().setCallout(v).run()}>{t(`callouts.${v}`)}</DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="ml-auto" />
      {btn("undo", false, Undo2Icon, () => chain().undo().run())}
      {btn("redo", false, Redo2Icon, () => chain().redo().run())}
    </div>
  );
}

/** Éditeur riche Tiptap (blocs PR, TXT, sous-blocs MULTI_PR). */
export function RichEditor({ content, editable, placeholder, onChange, className }: {
  content: unknown; editable: boolean; placeholder: string;
  onChange?: (html: string, json: unknown) => void; className?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [StarterKit, Placeholder.configure({ placeholder }), Callout],
    content: (content as string | object | null) ?? "",
    editorProps: { attributes: { class: cn("min-h-40 px-4 py-3 outline-none", RICH_CONTENT_CLASSES) } },
    onUpdate: ({ editor: e }) => onChange?.(e.getHTML(), e.getJSON()),
  });
  useEffect(() => { editor?.setEditable(editable, false); }, [editor, editable]);
  return (
    <div className={cn("overflow-hidden rounded-md border bg-white",
      "[&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-muted-foreground [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
      !editable && "bg-muted/20", className)}>
      {editor && editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
