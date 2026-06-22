import { useRef, useState } from "react";
import { modelsApi, type AIModel } from "@/api/models";
import { X, Save, ShieldAlert, Info, Plus } from "lucide-react";

interface Props {
  model: AIModel;
  onClose: () => void;
  onSaved: (updated: AIModel) => void;
}

export default function ModelRulesModal({ model, onClose, onSaved }: Props) {
  const [tags, setTags] = useState<string[]>(
    model.ppe_class_names.length > 0
      ? model.ppe_class_names
      : []
  );
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setTags((prev) => [...prev, trimmed]);
    }
    setInput("");
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) =>
    setTags((prev) => prev.filter((t) => t !== tag));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await modelsApi.updateRules(model.id, tags);
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  };

  // Suggest model's own class names as quick-add chips
  const suggestions = model.class_names.filter(
    (cn) => !tags.some((t) => t.toLowerCase() === cn.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
          <div>
            <h2 className="font-semibold">Violation Rules</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{model.name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Info */}
          <div className="flex items-start gap-2 bg-secondary/50 border border-border rounded-lg px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Type any class name that should trigger a violation — e.g. <span className="font-mono text-foreground">no mask</span>, <span className="font-mono text-foreground">no helmet</span>, <span className="font-mono text-foreground">no car plate</span>.
              Matching is case-insensitive. Press <kbd className="px-1 py-0.5 bg-secondary border border-border rounded text-[10px]">Enter</kbd> or <kbd className="px-1 py-0.5 bg-secondary border border-border rounded text-[10px]">,</kbd> to add.
            </span>
          </div>

          {/* Tag input */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Violation class names
            </label>
            <div
              className="min-h-[80px] flex flex-wrap gap-1.5 p-2 bg-secondary border border-border rounded-lg cursor-text"
              onClick={() => inputRef.current?.focus()}
            >
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-destructive/20 text-destructive border border-destructive/30 rounded-md text-xs font-medium"
                >
                  <ShieldAlert className="h-3 w-3 flex-shrink-0" />
                  {tag}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                    className="ml-0.5 text-destructive/60 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={tags.length === 0 ? "Type a class name and press Enter…" : ""}
                className="flex-1 min-w-[180px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
              />
            </div>
            {input.trim() && (
              <button
                onClick={() => addTag(input)}
                className="mt-1.5 flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="h-3 w-3" /> Add "{input.trim()}"
              </button>
            )}
          </div>

          {/* Suggestions from model's own class names */}
          {suggestions.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">
                Classes in this model — click to add:
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {suggestions.map((cn) => (
                  <button
                    key={cn}
                    onClick={() => addTag(cn)}
                    className="px-2 py-1 text-xs bg-secondary border border-border rounded-md hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors"
                  >
                    {cn}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border flex-shrink-0 space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {tags.length > 0
                ? <><span className="text-destructive font-medium">{tags.length}</span> class{tags.length !== 1 ? "es" : ""} will trigger violations</>
                : "No rules — violations will not be logged"}
            </span>
            {tags.length > 0 && (
              <button onClick={() => setTags([])} className="hover:underline">Clear all</button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border rounded-md text-sm hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save rules"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
