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
    <div className="modal-backdrop">
      <div className="modal-panel flex flex-col">
        <div className="modal-head flex-shrink-0">
          <div>
            <p className="ops-label text-primary">03 / DETECTOR RULES</p>
            <h2 className="ops-title mt-1">Violation classes</h2>
            <p className="ops-label mt-1 normal-case tracking-normal font-sans text-xs">
              {model.name}
            </p>
          </div>
          <button onClick={onClose} className="icon-button" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="ops-notice ops-notice-info block">
            <div className="flex items-start gap-2">
              <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>
                Enter any class name that should trigger a violation — e.g.{" "}
                <span className="font-mono text-foreground">no mask</span>,{" "}
                <span className="font-mono text-foreground">no helmet</span>,{" "}
                <span className="font-mono text-foreground">no car plate</span>. Matching is
                case-insensitive. Press{" "}
                <kbd className="border border-border bg-panel-raised px-1 py-0.5 font-mono text-[10px] text-foreground">Enter</kbd>{" "}
                or{" "}
                <kbd className="border border-border bg-panel-raised px-1 py-0.5 font-mono text-[10px] text-foreground">,</kbd>{" "}
                to add.
              </span>
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="violation-class-input">Violation class names</label>
            <div
              className="min-h-[80px] flex flex-wrap gap-1.5 p-2 border border-border bg-panel-raised cursor-text"
              onClick={() => inputRef.current?.focus()}
            >
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 border border-destructive/40 bg-destructive/10 px-2 py-1 font-mono text-xs text-destructive"
                >
                  <ShieldAlert className="h-3 w-3 flex-shrink-0" />
                  {tag}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                    className="ml-0.5 text-destructive/60 hover:text-destructive"
                    aria-label={`Remove ${tag}`}
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
                <Plus className="h-3 w-3" /> Add “{input.trim()}”
              </button>
            )}
          </div>

          {suggestions.length > 0 && (
            <div>
              <p className="ops-label mb-2">Classes in this model — click to add</p>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {suggestions.map((cn) => (
                  <button
                    key={cn}
                    onClick={() => addTag(cn)}
                    className="border border-border bg-panel-raised px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    {cn}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 space-y-3 border-t border-border p-5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {tags.length > 0 ? (
                <>
                  <span className="font-mono text-destructive">{tags.length}</span> class
                  {tags.length !== 1 ? "es" : ""} will trigger violations
                </>
              ) : (
                "No rules — violations will not be logged"
              )}
            </span>
            {tags.length > 0 && (
              <button onClick={() => setTags([])} className="hover:underline">Clear all</button>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="ops-button flex-1">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="ops-button ops-button-primary flex-1"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save rules"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
