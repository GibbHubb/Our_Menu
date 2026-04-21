"use client";

import { useState } from "react";
import { Folder, Plus, X, Pencil } from "lucide-react";
import type { Collection } from "@/lib/collections";

interface Props {
    collections: Collection[];
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onCreate: (name: string) => Promise<void>;
    onRename: (id: string, name: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

export default function CollectionBar({ collections, selectedId, onSelect, onCreate, onRename, onDelete }: Props) {
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");

    const handleCreate = async () => {
        if (!newName.trim()) return;
        await onCreate(newName.trim());
        setNewName("");
        setIsCreating(false);
    };

    const handleRenameSubmit = async (id: string) => {
        if (!editingName.trim()) return;
        await onRename(id, editingName.trim());
        setEditingId(null);
        setEditingName("");
    };

    return (
        <div className="max-w-7xl mx-auto px-4 pt-3">
            <div className="flex items-center gap-2 flex-wrap">
                <Folder className="w-4 h-4 text-stone-400 flex-shrink-0" />
                <button
                    onClick={() => onSelect(null)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                        selectedId === null
                            ? "bg-stone-900 text-white"
                            : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-100"
                    }`}
                >
                    All recipes
                </button>

                {collections.map((c) => (
                    <div key={c.id} className="flex items-center">
                        {editingId === c.id ? (
                            <input
                                autoFocus
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onBlur={() => handleRenameSubmit(c.id)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleRenameSubmit(c.id);
                                    if (e.key === "Escape") { setEditingId(null); setEditingName(""); }
                                }}
                                className="px-3 py-1 rounded-full text-xs border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                            />
                        ) : (
                            <button
                                onClick={() => onSelect(c.id)}
                                onDoubleClick={() => { setEditingId(c.id); setEditingName(c.name); }}
                                className={`group px-3 py-1 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                                    selectedId === c.id
                                        ? "bg-indigo-600 text-white"
                                        : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-100"
                                }`}
                                title="Click to filter, double-click to rename"
                            >
                                {c.name}
                                {selectedId === c.id && (
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(`Delete collection "${c.name}"? Recipes will not be deleted.`)) onDelete(c.id);
                                        }}
                                        className="hover:text-red-200 ml-0.5 cursor-pointer"
                                        aria-label="Delete collection"
                                    >
                                        <X className="w-3 h-3" />
                                    </span>
                                )}
                            </button>
                        )}
                    </div>
                ))}

                {isCreating ? (
                    <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onBlur={handleCreate}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreate();
                            if (e.key === "Escape") { setNewName(""); setIsCreating(false); }
                        }}
                        placeholder="Collection name..."
                        className="px-3 py-1 rounded-full text-xs border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                    />
                ) : (
                    <button
                        onClick={() => setIsCreating(true)}
                        className="px-3 py-1 rounded-full text-xs font-semibold bg-stone-50 border border-dashed border-stone-300 text-stone-500 hover:bg-stone-100 hover:border-stone-400 transition-colors flex items-center gap-1"
                    >
                        <Plus className="w-3 h-3" />
                        New collection
                    </button>
                )}
            </div>
        </div>
    );
}
