'use client';
import { useState, useRef } from 'react';

interface Item {
    name: string;
    quantity?: string;
}

interface Props {
    onAddItems: (items: string[]) => void;
}

export function ReceiptScanner({ onAddItems }: Props) {
    const [items, setItems] = useState<Item[]>([]);
    const [checked, setChecked] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        setError('');
        setItems([]);
        const fd = new FormData();
        fd.append('image', file);
        try {
            const res = await fetch('/api/receipts/scan', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Scan failed');
            if (!data.items?.length) {
                setError('No items found — try a clearer photo.');
            } else {
                setItems(data.items);
                setChecked(new Set(data.items.map((_: Item, i: number) => i)));
            }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
        }
        setLoading(false);
        // Reset input so same file can be re-scanned
        if (inputRef.current) inputRef.current.value = '';
    }

    function toggle(i: number) {
        setChecked(prev => {
            const next = new Set(prev);
            next.has(i) ? next.delete(i) : next.add(i);
            return next;
        });
    }

    function confirm() {
        const selected = items
            .filter((_, i) => checked.has(i))
            .map(item => `- [ ] ${item.name}${item.quantity ? ` (${item.quantity})` : ''}`);
        onAddItems(selected);
        setItems([]);
        setChecked(new Set());
    }

    return (
        <div style={{ marginTop: '12px' }}>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFile}
            />
            <button
                onClick={() => inputRef.current?.click()}
                disabled={loading}
                style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid #ddd',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    background: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                }}
            >
                {loading ? 'Scanning…' : '📷 Scan Receipt'}
            </button>

            {error && (
                <p style={{ color: '#b91c1c', fontSize: '12px', marginTop: '6px' }}>{error}</p>
            )}

            {items.length > 0 && (
                <div
                    style={{
                        marginTop: '10px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '12px',
                        background: '#fff',
                    }}
                >
                    <p style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                        Select items to add:
                    </p>
                    {items.map((item, i) => (
                        <label
                            key={i}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginBottom: '4px',
                                fontSize: '13px',
                                cursor: 'pointer',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={checked.has(i)}
                                onChange={() => toggle(i)}
                            />
                            {item.name}
                            {item.quantity ? ` — ${item.quantity}` : ''}
                        </label>
                    ))}
                    <button
                        onClick={confirm}
                        style={{
                            marginTop: '10px',
                            padding: '6px 16px',
                            background: '#1a1a2e',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 600,
                        }}
                    >
                        Add {checked.size} item{checked.size !== 1 ? 's' : ''} to list
                    </button>
                </div>
            )}
        </div>
    );
}
