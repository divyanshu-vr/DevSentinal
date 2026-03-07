"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

export default function NewProjectPage() {
    const [repoUrl, setRepoUrl] = useState("");
    const [prdFile, setPrdFile] = useState<File | null>(null);
    const [autoRun, setAutoRun] = useState(true);
    const [requireTests, setRequireTests] = useState(true);
    const [isLoading, setIsLoading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setPrdFile(e.target.files[0]);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        // Simulate loading
        setTimeout(() => {
            console.log("Form Submitted:", {
                repoUrl,
                prdFile: prdFile?.name,
                autoRun,
                requireTests,
            });
            setIsLoading(false);
            // In a real app, we'd redirect to dashboard or project page
        }, 1500);
    };

    const ToggleRow = ({
        label,
        description,
        isEnabled,
        onToggle,
    }: {
        label: string;
        description: string;
        isEnabled: boolean;
        onToggle: () => void;
    }) => (
        <div className="flex items-center justify-between py-4 border-b border-border last:border-0">
            <div>
                <div className="font-body text-sm text-mm-text font-medium">{label}</div>
                <div className="font-mono text-[10px] text-mm-muted mt-0.5 uppercase tracking-wider">
                    {description}
                </div>
            </div>
            <div
                onClick={onToggle}
                className={`relative w-10 h-5 rounded-full border transition-all duration-200 cursor-pointer ${isEnabled ? "bg-accent/20 border-accent/50" : "bg-surface3 border-border2"
                    }`}
            >
                <div
                    className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all duration-200 ${isEnabled ? "bg-accent left-5" : "bg-mm-muted left-0.5"
                        }`}
                />
            </div>
        </div>
    );

    return (
        <AppLayout>
            <div className="max-w-2xl mx-auto py-12 px-8">
                {/* Back Link */}
                <Link
                    href="/dashboard"
                    className="font-mono text-[10px] text-mm-muted hover:text-mm-text transition-colors duration-200 uppercase tracking-[0.2em] font-bold inline-flex items-center gap-2"
                >
                    ← Back to Dashboard
                </Link>

                {/* Page Title */}
                <div className="mt-8 mb-10">
                    <h1 className="font-display font-extrabold text-3xl text-mm-text tracking-tight uppercase">
                        New Project
                    </h1>
                    <p className="font-body text-mm-muted text-sm mt-1">
                        Connect a GitHub repo and let MiniMinions handle your backlog.
                    </p>
                </div>

                {/* Form Card */}
                <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-8 shadow-xl shadow-black/20">

                    {/* SECTION 1: Repo URL */}
                    <div className="mb-8">
                        <label className="font-mono text-[10px] text-mm-muted uppercase tracking-[0.2em] font-bold mb-3 block">
                            GitHub Repository URL
                        </label>
                        <input
                            type="text"
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            placeholder="github.com/owner/repository"
                            className="w-full bg-surface2 border border-border2 rounded-xl px-4 py-3.5 font-mono text-sm text-mm-text placeholder:text-mm-subtle focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-200"
                            required
                        />
                        <p className="font-mono text-[10px] text-mm-subtle mt-2 uppercase tracking-wide">
                            Must be a public repository
                        </p>
                    </div>

                    <div className="border-t border-border my-8" />

                    {/* SECTION 2: PRD Upload */}
                    <div className="mb-8">
                        <label className="font-mono text-[10px] text-mm-muted uppercase tracking-[0.2em] font-bold mb-3 block">
                            Product Requirements Document
                        </label>

                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".pdf,.md,.docx"
                            className="hidden"
                        />

                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className={`w-full border-2 border-dashed border-border2 rounded-xl p-10 text-center cursor-pointer hover:border-accent/40 hover:bg-accent/5 transition-all duration-200 ${prdFile ? "bg-accent/5 border-accent/30" : ""
                                }`}
                        >
                            {!prdFile ? (
                                <>
                                    <div className="font-mono text-3xl text-mm-subtle mb-3">↑</div>
                                    <div className="font-body text-sm text-mm-muted">
                                        Drop your PRD here or click to browse
                                    </div>
                                    <div className="font-mono text-[10px] text-mm-subtle mt-2 uppercase tracking-widest">
                                        Supports .pdf, .md, .docx — max 10MB
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <div className="text-mm-green text-3xl mb-3">✓</div>
                                    <div className="font-mono text-sm text-mm-text break-all">
                                        {prdFile.name}
                                    </div>
                                    <div className="font-mono text-[10px] text-mm-muted mt-1 uppercase tracking-widest">
                                        {(prdFile.size / 1024).toFixed(1)} KB
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setPrdFile(null);
                                        }}
                                        className="text-red-400 text-[10px] font-mono hover:text-red-300 mt-4 uppercase tracking-[0.2em] font-bold"
                                    >
                                        Remove File
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="border-t border-border my-8" />

                    {/* SECTION 3: Agent Config */}
                    <div className="mb-10">
                        <label className="font-mono text-[10px] text-mm-muted uppercase tracking-[0.2em] font-bold mb-4 block">
                            Agent Configuration
                        </label>

                        <ToggleRow
                            label="Auto-run on new issues"
                            description="Trigger agent when issues are labeled 'miniminion'"
                            isEnabled={autoRun}
                            onToggle={() => setAutoRun(!autoRun)}
                        />

                        <ToggleRow
                            label="Require test passage"
                            description="Block PR if tests fail after 2 retries"
                            isEnabled={requireTests}
                            onToggle={() => setRequireTests(!requireTests)}
                        />
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isLoading}
                        className={`w-full py-4 px-6 rounded-xl bg-accent text-white font-body font-bold text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-xl shadow-accent/20 flex items-center justify-center ${isLoading ? "opacity-70 cursor-not-allowed" : "hover:bg-accent2 hover:shadow-accent2/30 transform hover:-translate-y-0.5"
                            }`}
                    >
                        {isLoading ? (
                            <div className="flex items-center gap-3">
                                <LoadingSpinner size="sm" />
                                <span>Setting up project...</span>
                            </div>
                        ) : (
                            "Create Project →"
                        )}
                    </button>
                </form>
            </div>
        </AppLayout>
    );
}
