"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Plus, ShoppingCart, Sparkles, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";  // OM43
import {
  addPantryItem,
  importCommonStaples,
  setPantryCategory,
  PANTRY_SECTIONS,
  type PantryCategory,
  bulkAddPantryItems,
  getPantryItems,
  removePantryItem,
  type PantryItem,
} from "@/lib/pantry";
import { canonicaliseIngredient } from "@/lib/ingredients";
import { announceListChanged, copyLinesToList, shoppingKey } from "@/lib/shopping";  // OM49

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
  // OM49 — the pantry stopped being a record of what is in the cupboard and
  // became the "then the house" half of a shop: you walk it, tick what you
  // need, and it goes on the list. The selection is deliberately LOCAL — it is
  // not the old `needed` flag, which persisted, so the screen always opened
  // wearing last week's decisions. It spans the section chips so one walk down
  // Kitchen, Bathroom and Household is a single decision.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

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
    if (!ok) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    // OM49 review finding 5 — the deleted row kept its tick, so the Add button
    // went on counting a thing that was no longer on screen.
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
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

  const toggleSelected = (id: string) => {
    setAddedCount(null);
    setAddError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // OM49 — copy the ticked items onto the shopping list, then forget them.
  // Nothing is written back to the pantry row: next time you open this screen
  // it is blank again, which is the whole point.
  const handleAddSelected = async () => {
    if (!selected.size) return;
    setAdding(true);
    const chosen = items.filter((i) => selected.has(i.id));
    // One call, so two rows that canonicalise to the same thing arrive as one
    // line rather than racing each other (OM49 review finding 2).
    const { added, merged, failed } = await copyLinesToList(
      chosen.map((i) => ({
        item: i.display_name,
        key: i.canonical_key || shoppingKey(i.display_name),
        qty_base: null,
        family: null,
        unit_hint: null,
      })),
    );
    setAdding(false);
    // Count what actually landed, not what was asked for.
    setAddedCount(added + merged);
    // OM49 review finding 3 — the whole selection used to be cleared even when
    // writes failed, so a failed item silently lost its tick with nothing on
    // screen to say so. Keep the ticks if anything failed; the button is safe
    // to press again, because the copy merges rather than duplicates.
    if (failed === 0) setSelected(new Set());
    else setAddError(`${failed} item${failed === 1 ? "" : "s"} didn't make it onto the list — try again.`);
    // OM49 review finding 4 — the nav badge counts the list, and nothing told
    // it the list had just grown.
    announceListChanged();
  };

  const selectedCount = selected.size;

  const previewKey = single.trim() ? canonicaliseIngredient(single) : "";

  /* OM49 — the one way off this screen and onto the list. It sits at the
     top because the sections are chips: walk Kitchen, walk Bathroom, walk
     Household, and the count keeps rising across all three, so burying the
     button under one section's list would hide it from a walk that ended in
     another. It reads 0 and is disabled until something is ticked.
     Rendered again under the list (Max, 2026-09-01) — the pantry is 30 rows
     long, so ticking your way to the bottom used to mean scrolling all the
     way back up to act on it. Same handler, same state, two positions. */
  const addBar = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => void handleAddSelected()}
        disabled={adding || selectedCount === 0}
        className={`flex-1 min-w-[220px] py-2.5 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${
          addedCount !== null ? "bg-emerald-600 text-white" : "bg-stone-900 text-white hover:bg-stone-800"
        }`}
      >
        {adding ? <Loader2 className="w-4 h-4 animate-spin" />
          : addedCount !== null ? <Check className="w-4 h-4" />
          : <ShoppingCart className="w-4 h-4" />}
        {addedCount !== null
          ? `Added ${addedCount} item${addedCount === 1 ? "" : "s"} to the shopping list`
          : `Add ${selectedCount} item${selectedCount === 1 ? "" : "s"} to shopping list`}
      </button>
      <Link
        href="/shopping"
        className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-stone-100 text-stone-700 hover:bg-stone-200"
      >
        Shopping list →
      </Link>
    </div>
  );

  return (
    <AppShell
      width="narrow"
      subnav={
        /* OM43 — the section chips sit where the recipe category chips sit, so
           the header is the same height on both tabs and nothing jumps. */
        <div className="flex gap-2 flex-nowrap whitespace-nowrap">
          {/* OM42 — sections. The pantry already held toothpaste and loo roll
              while the UI called everything an "ingredient". */}
          <div className="flex gap-2 flex-wrap">
            {PANTRY_SECTIONS.map((sec) => {
              const count = items.filter((i) => i.category === sec.key).length;
              const low = items.filter((i) => i.category === sec.key && selected.has(i.id)).length;
              return (
                <button
                  key={sec.key}
                  onClick={() => setSection(sec.key)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
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
        </div>
      }
      toolbar={
        <p className="text-sm text-stone-500">
          <span className="font-serif text-lg text-stone-900 mr-2">Pantry</span>
          {items.length} item{items.length === 1 ? "" : "s"}
          {selectedCount > 0 && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              {selectedCount} ticked
            </span>
          )}
        </p>
      }
    >
      <div className="space-y-6">

        <p className="text-xs text-stone-500 -mt-3">
          {PANTRY_SECTIONS.find((x) => x.key === section)?.hint}
        </p>

        {addBar}

        {addError && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {addError}
          </p>
        )}

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
                  {/* OM49 — tick what you need on this shop. Tapping the row
                      toggles it, so the target is the whole line rather than a
                      20px box on a phone. */}
                  <button
                    onClick={() => toggleSelected(item.id)}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left"
                    aria-pressed={selected.has(item.id)}
                  >
                    <span className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                      selected.has(item.id)
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "bg-white border-stone-300"
                    }`}>
                      {selected.has(item.id) && <Check className="w-3.5 h-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm truncate ${selected.has(item.id) ? "font-semibold text-stone-900" : "font-medium text-stone-900"}`}>
                        {item.display_name}
                      </span>
                      {item.canonical_key !== item.display_name.toLowerCase().trim() && (
                        <span className="block text-[10px] text-stone-400 font-mono truncate">{item.canonical_key}</span>
                      )}
                    </span>
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

        {/* The same bar again, for the walk that ends at the bottom of the
            list. Only when this section actually has rows — under an empty
            state it would sit inches below the top one. */}
        {!loading && items.filter((i) => i.category === section).length > 0 && addBar}
      </div>
    </AppShell>
  );
}
