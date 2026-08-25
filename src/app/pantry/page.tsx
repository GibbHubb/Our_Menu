"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Loader2, Sparkles } from "lucide-react";
import {
  addPantryItem,
  bulkAddPantryItems,
  getPantryItems,
  removePantryItem,
  setPantryNeeded,
  type PantryItem,
} from "@/lib/pantry";
import { canonicaliseIngredient } from "@/lib/ingredients";

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [single, setSingle] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const data = await getPantryItems();
    setItems(data);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const handleAdd = async () => {
    const name = single.trim();
    if (!name) return;
    const added = await addPantryItem(name);
    setSingle("");
    if (added) setItems((prev) => [...prev, added].sort((a, b) => a.display_name.localeCompare(b.display_name)));
  };

  const handleBulkSave = async () => {
    if (!bulkText.trim()) return;
    setBulkSaving(true);
    await bulkAddPantryItems(bulkText);
    setBulkText("");
    setBulkOpen(false);
    setBulkSaving(false);
    await refresh();
  };

  const handleRemove = async (id: string) => {
    const ok = await removePantryItem(id);
    if (ok) setItems((prev) => prev.filter((i) => i.id !== id));
  };

  // OM40 — flag a staple as low so it lands under Staples on the shopping list.
  const handleNeeded = async (item: PantryItem) => {
    const next = !item.needed;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, needed: next } : i)));
    await setPantryNeeded(item.id, next);
  };

  const neededCount = items.filter((i) => i.needed).length;

  const previewKey = single.trim() ? canonicaliseIngredient(single) : "";

  return (
    <div className="min-h-screen bg-stone-50 font-sans pb-20">
      <div className="bg-white sticky top-0 z-40 border-b border-stone-100 px-4 py-3 flex items-center gap-3 shadow-sm">
        <Link href="/" className="p-2 -ml-2 text-stone-600 hover:bg-stone-100 rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <span className="font-serif font-bold text-stone-900">Pantry</span>
        <div className="ml-auto flex items-center gap-3">
          {neededCount > 0 && (
            <Link
              href="/shopping"
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200"
            >
              {neededCount} to buy →
            </Link>
          )}
          <span className="text-xs text-stone-500">{items.length} item{items.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100 space-y-3">
          <h2 className="text-lg font-serif font-bold text-stone-900 flex items-center gap-2">
            <Plus className="w-5 h-5 text-emerald-600" />
            Add an ingredient
          </h2>
          <div className="flex gap-2">
            <input
              value={single}
              onChange={(e) => setSingle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              placeholder="e.g. red onion"
              className="flex-1 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <button
              onClick={handleAdd}
              disabled={!single.trim()}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {previewKey && previewKey !== single.trim().toLowerCase() && (
            <p className="text-xs text-stone-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Stored as <span className="font-mono bg-stone-100 px-1.5 py-0.5 rounded">{previewKey}</span>
            </p>
          )}

          <button
            onClick={() => setBulkOpen((o) => !o)}
            className="text-xs text-stone-500 hover:text-stone-900 underline"
          >
            {bulkOpen ? "Hide bulk add" : "Bulk add from textarea"}
          </button>
          {bulkOpen && (
            <div className="space-y-2">
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={"onion\ngarlic\n400g chopped tomatoes\nolive oil"}
                rows={6}
                className="w-full p-3 text-sm bg-stone-50 border border-stone-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleBulkSave}
                  disabled={bulkSaving || !bulkText.trim()}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {bulkSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save all
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-stone-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-stone-400 italic text-center py-8">
              Your pantry is empty. Add ingredients above to enable the "Cookable now" filter.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-stone-900 truncate">{item.display_name}</div>
                    {item.canonical_key !== item.display_name.toLowerCase().trim() && (
                      <div className="text-[10px] text-stone-400 font-mono truncate">{item.canonical_key}</div>
                    )}
                  </div>
                  {/* OM40 — "we're low on this". Separate from removing it: being
                      out of olive oil doesn't mean you've stopped keeping it. */}
                  <button
                    onClick={() => handleNeeded(item)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                      item.needed
                        ? "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200"
                        : "bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100"
                    }`}
                    title={item.needed ? "On the shopping list — click to unflag" : "Flag as low, adds it to the shopping list"}
                  >
                    {item.needed ? "need to buy" : "running low?"}
                  </button>
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
