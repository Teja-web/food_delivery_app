"use client";

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view";
import { Copy, Check, Download } from "lucide-react";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { basicSetup } from "codemirror";
import * as Y from "yjs";
import { yCollab } from "y-codemirror.next";
import type { LiveKitYjsProvider } from "@/lib/yjs-livekit-provider";

/* -- Types --------------------------------------------------- */

type Variant = "portal" | "live";

interface CodeEditorBaseProps {
  readOnly?: boolean;
  variant?: Variant;
  language?: string;
  placeholder?: string;
  /** Show copy button (default: true when readOnly) */
  showCopyButton?: boolean;
  /** Show download button (default: false) */
  showDownloadButton?: boolean;
  /** Filename for download (default: "code") */
  downloadFilename?: string;
}

interface UncontrolledProps extends CodeEditorBaseProps {
  value: string;
  onChange: (value: string) => void;
  yjsProvider?: undefined;
  ydoc?: undefined;
}

interface CollaborativeProps extends CodeEditorBaseProps {
  yjsProvider: LiveKitYjsProvider;
  ydoc: Y.Doc;
  value?: undefined;
  onChange?: undefined;
}

type CodeEditorProps = UncontrolledProps | CollaborativeProps;

/* -- Theme --------------------------------------------------- */

function createTheme(variant: Variant) {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: "13px",
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
      },
      ".cm-content": {
        padding: "12px 0",
      },
      ".cm-gutters": {
        border: "none",
        ...(variant === "live"
          ? { backgroundColor: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.3)" }
          : {}),
      },
      ".cm-activeLineGutter": {
        ...(variant === "live"
          ? { backgroundColor: "rgba(255,255,255,0.05)" }
          : {}),
      },
      ".cm-activeLine": {
        ...(variant === "live"
          ? { backgroundColor: "rgba(255,255,255,0.03)" }
          : {}),
      },
      // Remote cursor styles (Yjs awareness)
      ".cm-ySelectionInfo": {
        fontSize: "11px",
        fontFamily: "system-ui, sans-serif",
        padding: "1px 4px",
        borderRadius: "3px",
        opacity: "0.9",
      },
    },
    { dark: variant === "live" },
  );
}

/* -- Language ------------------------------------------------ */

function getLanguageExtension(lang?: string) {
  switch (lang?.toLowerCase()) {
    case "python":
    case "py":
      return python();
    case "javascript":
    case "js":
    case "typescript":
    case "ts":
    default:
      return javascript({ typescript: true });
  }
}

/* -- Component ----------------------------------------------- */

export function CodeEditor(props: CodeEditorProps) {
  const {
    readOnly = false,
    variant = "portal",
    language,
    placeholder: placeholderText = "// Write your code here...",
    showCopyButton,
    showDownloadButton = false,
    downloadFilename = "code",
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [copied, setCopied] = useState(false);

  const isCollaborative = "yjsProvider" in props && !!props.yjsProvider;

  // Show copy button by default in readOnly mode, or when explicitly enabled
  const shouldShowCopy = showCopyButton ?? readOnly;

  const getCode = useCallback(() => {
    if (viewRef.current) {
      return viewRef.current.state.doc.toString();
    }
    if (!isCollaborative && props.value !== undefined) {
      return props.value;
    }
    return "";
  }, [isCollaborative, props.value]);

  const handleCopy = useCallback(async () => {
    const code = getCode();
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  }, [getCode]);

  const handleDownload = useCallback(() => {
    const code = getCode();
    if (!code) return;

    const ext = language?.toLowerCase() === "python" || language?.toLowerCase() === "py" ? "py" : "js";
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${downloadFilename}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [getCode, language, downloadFilename]);

  // Stable theme
  const theme = useMemo(() => createTheme(variant), [variant]);
  const langExt = useMemo(() => getLanguageExtension(language), [language]);

  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      basicSetup,
      langExt,
      theme,
      placeholderExt(placeholderText),
      EditorView.lineWrapping,
    ];

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true));
      extensions.push(EditorView.editable.of(false));
    }

    if (isCollaborative && props.ydoc) {
      // Collaborative mode: bind CodeMirror to Yjs doc
      const ytext = props.ydoc.getText("code");
      const awareness = props.yjsProvider!.getAwareness();
      extensions.push(yCollab(ytext, awareness, { undoManager: new Y.UndoManager(ytext) }));
    } else if (!isCollaborative) {
      // Standalone mode: controlled value + onChange
      extensions.push(
        EditorView.updateListener.of((update) => {
          if (update.docChanged && props.onChange) {
            props.onChange(update.state.doc.toString());
          }
        }),
      );
    }

    const state = EditorState.create({
      doc: isCollaborative ? undefined : (props.value ?? ""),
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCollaborative, readOnly, variant, language]);

  // Sync external value changes for standalone mode
  useEffect(() => {
    if (isCollaborative || !viewRef.current) return;
    const view = viewRef.current;
    const currentValue = view.state.doc.toString();
    if (props.value !== undefined && props.value !== currentValue) {
      view.dispatch({
        changes: { from: 0, to: currentValue.length, insert: props.value },
      });
    }
  }, [isCollaborative, props.value]);

  const containerClass =
    variant === "live"
      ? "h-full min-h-[200px] rounded-lg border border-white/10 bg-[#0d0d0d] overflow-hidden"
      : "h-full min-h-[200px] rounded-lg border border-border bg-background overflow-hidden";

  const buttonBaseClass =
    variant === "live"
      ? "p-1.5 rounded-md transition-colors hover:bg-white/10 text-neutral-400 hover:text-neutral-200"
      : "p-1.5 rounded-md transition-colors hover:bg-muted text-muted-foreground hover:text-foreground";

  const showToolbar = shouldShowCopy || showDownloadButton;

  return (
    <div className="relative h-full">
      {showToolbar && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          {shouldShowCopy && (
            <button
              type="button"
              onClick={handleCopy}
              className={buttonBaseClass}
              title={copied ? "Copied!" : "Copy code"}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          )}
          {showDownloadButton && (
            <button
              type="button"
              onClick={handleDownload}
              className={buttonBaseClass}
              title="Download code"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      <div ref={containerRef} className={containerClass} />
    </div>
  );
}
