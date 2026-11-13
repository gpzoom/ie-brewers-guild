import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { normalizeLinkUrl } from "@/components/guild/broadcast-screen-helpers";

const toolButtonClass =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-[7px] text-ink transition-colors hover:bg-canvas-2 disabled:opacity-50 aria-pressed:bg-canvas-2 md:h-[34px] md:w-[34px]";
const lightButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] border border-canvas-border bg-canvas px-[17px] text-[13px] font-medium text-ink transition-colors hover:bg-canvas-2";
const accentButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-[9px] bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover";

// Tailwind's preflight strips list markers and paragraph spacing; put back
// what an email shows, so the message looks here like it will in the inbox.
const contentClass =
  "min-h-[280px] px-4 py-5 text-[15px] leading-[1.6] text-[#3A332C] outline-none md:px-[22px] " +
  "[&_p]:my-0 [&>*+*]:mt-[0.8em] [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_li>p]:my-0 [&_a]:text-brand [&_a]:underline [&_strong]:font-semibold";

function Divider() {
  return <span aria-hidden="true" className="mx-1.5 h-[22px] w-px bg-[#E6E0D6]" />;
}

/**
 * The Broadcast email body (artboard AA): TipTap with StarterKit, limited
 * to what the Worker keeps (p, br, bold, italic, underline, links, bulleted
 * and numbered lists) -- headings, quotes, code and rules are switched off so
 * nothing typed here is silently flattened on send. `children` is the
 * attachments row under the text.
 */
export function BroadcastEditor({
  initialHtml,
  onChange,
  disabled,
  onAttach,
  attachDisabled,
  children,
}: {
  initialHtml: string;
  onChange: (html: string) => void;
  disabled: boolean;
  onAttach: () => void;
  attachDisabled: boolean;
  children?: ReactNode;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          protocols: ["http", "https", "mailto"],
          isAllowedUri: (url) => normalizeLinkUrl(url) === url && url !== "",
        },
      }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class: contentClass,
        "aria-label": "Message",
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      underline: e?.isActive("underline") ?? false,
      link: e?.isActive("link") ?? false,
      bulletList: e?.isActive("bulletList") ?? false,
      orderedList: e?.isActive("orderedList") ?? false,
    }),
  });

  const [linkOpen, setLinkOpen] = useState(false);
  const toolsDisabled = disabled || !editor;

  function tool(
    label: string,
    pressed: boolean | null,
    run: (e: Editor) => void,
    content: ReactNode,
  ) {
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed === null ? undefined : pressed}
        disabled={toolsDisabled}
        onMouseDown={(ev) => ev.preventDefault()}
        onClick={() => editor && run(editor)}
        className={toolButtonClass}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex max-w-[820px] flex-col overflow-hidden rounded-[14px] border border-canvas-border bg-white">
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex flex-wrap items-center gap-0.5 border-b border-[#EFEAE1] bg-[#FCFAF6] px-2.5 py-2"
      >
        {tool(
          "Bold",
          active?.bold ?? false,
          (e) => e.chain().focus().toggleBold().run(),
          <span className="font-display text-sm font-bold">B</span>,
        )}
        {tool(
          "Italic",
          active?.italic ?? false,
          (e) => e.chain().focus().toggleItalic().run(),
          <span className="font-serif text-sm italic">I</span>,
        )}
        {tool(
          "Underline",
          active?.underline ?? false,
          (e) => e.chain().focus().toggleUnderline().run(),
          <span className="text-sm underline">U</span>,
        )}
        <Divider />
        {tool(
          "Insert link",
          active?.link ?? false,
          () => setLinkOpen(true),
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M6.5 9.5a3 3 0 0 0 4 .3l1.8-1.8a3 3 0 0 0-4.2-4.2L7 4.8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M9.5 6.5a3 3 0 0 0-4-.3L3.7 8a3 3 0 0 0 4.2 4.2L9 11.2"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>,
        )}
        {tool(
          "Bulleted list",
          active?.bulletList ?? false,
          (e) => e.chain().focus().toggleBulletList().run(),
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="3" cy="4.5" r="1.1" fill="currentColor" />
            <circle cx="3" cy="8" r="1.1" fill="currentColor" />
            <circle cx="3" cy="11.5" r="1.1" fill="currentColor" />
            <path
              d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>,
        )}
        {tool(
          "Numbered list",
          active?.orderedList ?? false,
          (e) => e.chain().focus().toggleOrderedList().run(),
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <text x="0.5" y="6" fontSize="4.5" fill="currentColor">
              1
            </text>
            <text x="0.5" y="9.6" fontSize="4.5" fill="currentColor">
              2
            </text>
            <text x="0.5" y="13.2" fontSize="4.5" fill="currentColor">
              3
            </text>
            <path
              d="M6.5 4.8h7M6.5 8.3h7M6.5 11.8h7"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>,
        )}
        <Divider />
        <button
          type="button"
          aria-label="Attach files"
          disabled={disabled || attachDisabled}
          onClick={onAttach}
          className={toolButtonClass}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M11.3 5.2 6.7 9.8a1.9 1.9 0 0 0 2.7 2.7l4.6-4.6a3.3 3.3 0 0 0-4.7-4.7L4.7 7.8a4.6 4.6 0 0 0 6.5 6.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <EditorContent editor={editor} className={disabled ? "opacity-70" : undefined} />
      {/* Before TipTap mounts in the browser, keep the box its full height. */}
      {!editor && <div aria-hidden="true" className="min-h-[280px]" />}

      {children}

      {editor && (
        <LinkDialog
          open={linkOpen}
          onOpenChange={setLinkOpen}
          initialUrl={(editor.getAttributes("link").href as string | undefined) ?? ""}
          onSave={(url) => {
            const chain = editor.chain().focus().extendMarkRange("link");
            if (url === "") {
              chain.unsetLink().run();
            } else if (editor.state.selection.empty && !editor.isActive("link")) {
              chain
                .insertContent({
                  type: "text",
                  text: url.replace(/^mailto:/, ""),
                  marks: [{ type: "link", attrs: { href: url } }],
                })
                .run();
            } else {
              chain.setLink({ href: url }).run();
            }
          }}
        />
      )}
    </div>
  );
}

/** Insert link: a web or email address; an empty one removes the link. */
function LinkDialog({
  open,
  onOpenChange,
  initialUrl,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUrl: string;
  onSave: (url: string) => void;
}) {
  const [value, setValue] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initialUrl);
      setError(null);
    }
  }, [open, initialUrl]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const url = normalizeLinkUrl(value);
    if (url === null) {
      setError("Use a web address (https://…) or an email address.");
      return;
    }
    onOpenChange(false);
    onSave(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 rounded-[14px] border-canvas-border bg-white p-6 font-sans sm:max-w-[460px] sm:rounded-[14px]">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader className="gap-1.5 text-left">
            <DialogTitle className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink">
              Insert link
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.55] text-[#564E45]">
              A web address or an email address. Leave it empty to remove the link.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="broadcast-link-url" className="sr-only">
            Link address
          </label>
          <input
            id="broadcast-link-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            placeholder="https://example.com"
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "broadcast-link-error" : undefined}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            className="h-[46px] w-full min-w-0 rounded-[9px] border border-canvas-border bg-white px-3.5 font-sans text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
          {error && (
            <p id="broadcast-link-error" role="alert" className="text-[12px] text-danger">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className={lightButtonClass}>
              Cancel
            </button>
            <button type="submit" className={accentButtonClass}>
              {value.trim() === "" && initialUrl ? "Remove link" : "Save link"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
