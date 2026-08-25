"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Loader2, Sparkles } from "lucide-react";
import PrimaryNav from "@/components/PrimaryNav";  // OM42
import {
  addPantryItem,
  importCommonStaples,
  setPantryCategory,
  PANTRY_SECTIONS,
  type PantryCategory,
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
  // OM42 — which section new items land in, and which one is on screen.
  const [section, setSection] = useState<PantryCategory>("kitchen");
  const [importing, setImporting] = useState(false);

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
    const added = await addPantryItem(name, section);
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

  // OM42 — one click for the things you buy again and again. Idempotent:
  // anything already in the pantry is skipped by the canonical-key index.
  const handleImport = async (all = false) => {
    setImporting(true);
    if (all) {
      for (const sec of PANTRY_SECTIONS) await importCommonStaples(sec.key);
    } else {
      await importCommonStaples(section);
    }
    await refresh();
    setImporting(false);
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

      <div className="max-w-2xl mx-auto px-6 pt-4">
        <PrimaryNav />
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">

        {/* OM42 — sections. The pantry already held toothpaste and loo roll
            while the UI called everything an "ingredient". */}
        <div className="flex gap-2 flex-wrap">
          {PANTRY_SECTIONS.map((sec) => {
            const count = items.filter((i) => i.category === sec.key).length;
            const low = items.filter((i) => i.category === sec.key && i.needed).length;
            return (
              <button
                key={sec.key}
                onClick={() => setSection(sec.key)}
                className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                  section === sec.key
                    ? "bg-stone-900 text-white border-stone-900"
                    : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                }`}
              >
                {sec.label}
                <span className={`ml-2 text-xs ${section === sec.key ? "text-stone-300" : "text-stone-400"}`}>
                  {count}
                </span>
                {low > 0 && (
                  <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">
                    {low}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-stone-500 -mt-3">
          {PANTRY_SECTIONS.find((x) => x.key === section)?.hint}
        </p>

        {/* OM42 — Max: "there should be a standard pantry with shit that
            everyone has / wants". Offered while the pantry is still thin, and
            it stops nagging once there is a real one. */}
        {!loading && items.length < 25 && (
          <div className="bg-stone-900 text-stone-50 rounded-2xl p-5 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[220px]">
              <p className="font-serif text-lg">Start from a standard pantry</p>
              <p className="text-xs text-stone-300 mt-0.5">
                The ~50 things most kitchens, bathrooms and cupboards hold — oil, flour, loo roll,
                washing powder. Anything you already have is skipped.
              </p>
            </div>
            <button
              onClick={() => void handleImport(true)}
              disabled={importing}
              className="px-5 py-2.5 bg-white text-stone-900 rounded-full text-sm font-bold hover:bg-stone-100 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {importing && <Loader2 className="w-4 h-4 animate-spin" />}
              Fill all three sections
            </button>
          </div>
        )}

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
          ) : items.filter((i) => i.category === section).length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-stone-400 italic">Nothing in {PANTRY_SECTIONS.find((x) => x.key === section)?.label} yet.</p>
              <button
                onClick={() => void handleImport()}
                disabled={importing}
                className="px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-semibold hover:bg-stone-800 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                Add the usual {PANTRY_SECTIONS.find((x) => x.key === section)?.label.toLowerCase()} staples
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {items.filter((i) => i.category === section).map((item) => (
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

          {items.filter((i) => i.category === section).length > 0 && (
            <button
              onClick={() => void handleImport()}
              disabled={importing}
              className="mt-4 text-xs text-stone-500 hover:text-stone-900 underline underline-offset-2 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {importing && <Loader2 className="w-3 h-3 animate-spin" />}
              add the usual {PANTRY_SECTIONS.find((x) => x.key === section)?.label.toLowerCase()} staples
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
