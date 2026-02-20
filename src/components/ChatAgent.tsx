"use client";

import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Loader2, Bot } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
    role: "system" | "user" | "assistant";
    content: string;
}

export default function ChatAgent() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { role: "assistant", content: "Hi! I'm your kitchen AI. How can I help you today?" }
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    const handleSend = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg: Message = { role: "user", content: input.trim() };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput("");
        setIsLoading(true);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [
                        { role: "system", content: "You are a helpful kitchen assistant AI for Max and Bron's recipe app. Keep answers concise." },
                        ...newMessages
                    ]
                })
            });

            if (!res.ok) throw new Error("Failed to fetch");
            const data = await res.json();

            // Assume OpenAI-compatible format
            const aiContent = data.choices?.[0]?.message?.content ||
                data.message?.content ||
                "I couldn't process that.";

            setMessages(prev => [...prev, { role: "assistant", content: aiContent }]);
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I ran into an error connecting to my brain." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed bottom-6 left-6 z-50 flex flex-col items-start gap-4 pointer-events-none">

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ duration: 0.2 }}
                        className="pointer-events-auto bg-white rounded-2xl shadow-2xl border border-stone-200 w-80 sm:w-96 flex flex-col overflow-hidden"
                        style={{ height: '500px', maxHeight: '70vh' }}
                    >
                        {/* Header */}
                        <div className="bg-stone-900 text-white p-4 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-2">
                                <Bot className="w-5 h-5 text-amber-500" />
                                <h3 className="font-serif font-bold text-lg leading-none">Sous Chef</h3>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-stone-400 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-stone-50">
                            {messages.map((msg, idx) => {
                                if (msg.role === "system") return null;
                                const isUser = msg.role === "user";
                                return (
                                    <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`
                                            max-w-[85%] rounded-2xl px-4 py-2 shadow-sm text-sm leading-relaxed
                                            ${isUser
                                                ? 'bg-stone-900 text-white rounded-br-none'
                                                : 'bg-white border border-stone-200 text-stone-800 rounded-bl-none'}
                                        `}>
                                            {msg.content}
                                        </div>
                                    </div>
                                );
                            })}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-white border border-stone-200 text-stone-800 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm">
                                        <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <form
                            onSubmit={handleSend}
                            className="p-3 bg-white border-t border-stone-100 flex items-end gap-2"
                        >
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Ask about recipes..."
                                className="flex-1 bg-stone-100 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-stone-900 outline-none"
                                disabled={isLoading}
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || isLoading}
                                className="bg-amber-100 text-amber-700 p-2.5 rounded-xl hover:bg-amber-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            <button
                onClick={() => setIsOpen(!isOpen)}
                className="pointer-events-auto p-4 bg-stone-900 text-white rounded-full shadow-lg hover:bg-stone-800 transition-transform hover:scale-105 active:scale-95 flex items-center justify-center shrink-0"
                title="AI Kitchen Assistant"
            >
                {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
            </button>
        </div>
    );
}
