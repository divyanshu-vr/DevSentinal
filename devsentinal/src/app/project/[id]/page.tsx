"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

interface Project {
    id: string;
    name: string;
    repo_url: string;
    repo_owner: string;
    repo_name: string;
    branch: string;
    tech_stack: string[];
    status: string;
    health_score: number | null;
    created_at: string;
}

interface AnalysisRun {
    id: string;
    status: string;
    health_score: number | null;
    total_tests: number;
    passed: number;
    failed: number;
    error_message: string | null;
    created_at: string;
    completed_at: string | null;
}

interface Finding {
    id: string;
    requirement_id: string;
    status: "pass" | "fail";
    feature_name: string;
    test_description: string;
    test_type: string;
    confidence: number;
    file_path: string | null;
    line_start: number | null;
    line_end: number | null;
    code_snippet: string | null;
    explanation: string | null;
    fix_confidence: number | null;
}

type TabKey = "all" | "pass" | "fail";

export default function ProjectDetailPage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;

    const [project, setProject] = useState<Project | null>(null);
    const [run, setRun] = useState<AnalysisRun | null>(null);
    const [findings, setFindings] = useState<Finding[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabKey>("all");
    const [expandedFinding, setExpandedFinding] = useState<string | null>(null);

    useEffect(() => {
        if (!projectId) return;

        async function fetchData() {
            setLoading(true);
            setError(null);

            try {
                // Fetch project
                const projectRes = await fetch(`/api/projects`);
                if (!projectRes.ok) throw new Error("Failed to fetch projects");
                const projectData = await projectRes.json();
                const proj = projectData.projects?.find((p: Project) => p.id === projectId);
                if (!proj) throw new Error("Project not found");
                setProject(proj);

                // Fetch findings (latest run)
                const findingsRes = await fetch(`/api/projects/${projectId}/findings?run_id=latest`);
                if (findingsRes.ok) {
                    const findingsData = await findingsRes.json();
                    setRun(findingsData.run);
                    setFindings(findingsData.findings || []);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "An error occurred");
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [projectId]);

    const filtered = findings.filter((f) => {
        if (activeTab === "all") return true;
        return f.status === activeTab;
    });

    const passCount = findings.filter((f) => f.status === "pass").length;
    const failCount = findings.filter((f) => f.status === "fail").length;

    if (loading) {
        return (
            <AppLayout>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <LoadingSpinner size="lg" label="Loading project..." />
                </div>
            </AppLayout>
        );
    }

    if (error || !project) {
        return (
            <AppLayout>
                <div className="max-w-2xl mx-auto py-12 px-8">
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                        <div className="font-mono text-sm text-red-400 mb-4">{error || "Project not found"}</div>
                        <button
                            onClick={() => router.push("/dashboard")}
                            className="font-mono text-[10px] text-mm-muted hover:text-mm-text uppercase tracking-[0.2em] font-bold"
                        >
                            &larr; Back to Dashboard
                        </button>
                    </div>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <div className="max-w-5xl mx-auto py-8 px-8">
                {/* Breadcrumb */}
                <Link
                    href="/dashboard"
                    className="font-mono text-[10px] text-mm-muted hover:text-mm-text transition-colors duration-200 uppercase tracking-[0.2em] font-bold inline-flex items-center gap-2"
                >
                    &larr; Dashboard
                </Link>

                {/* Project header */}
                <div className="mt-6 mb-8">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="font-display font-extrabold text-2xl text-mm-text tracking-tight">
                                {project.name}
                            </h1>
                            <p className="font-mono text-[10px] text-mm-muted mt-1">
                                {project.repo_url} &middot; {project.branch}
                            </p>
                        </div>
                        <div
                            className={`font-mono text-[10px] px-3 py-1.5 rounded-full border uppercase tracking-wider ${
                                project.status === "analyzed"
                                    ? "bg-green-500/10 border-green-500/20 text-green-400"
                                    : project.status === "analyzing"
                                    ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                                    : project.status === "error"
                                    ? "bg-red-500/10 border-red-500/20 text-red-400"
                                    : "bg-surface3 border-border text-mm-muted"
                            }`}
                        >
                            {project.status}
                        </div>
                    </div>

                    {/* Tech stack */}
                    {project.tech_stack?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                            {project.tech_stack.map((tech) => (
                                <span
                                    key={tech}
                                    className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface3 border border-border2 text-mm-muted uppercase tracking-wider"
                                >
                                    {tech}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* No findings state */}
                {!run && (
                    <div className="bg-surface border border-border rounded-2xl p-12 text-center">
                        <div className="font-mono text-3xl text-mm-subtle mb-4">?</div>
                        <div className="font-body text-sm text-mm-muted mb-2">
                            No analysis has been run yet
                        </div>
                        <div className="font-mono text-[10px] text-mm-subtle uppercase tracking-wider">
                            Upload a PRD and run the analysis pipeline to see results
                        </div>
                    </div>
                )}

                {/* Results */}
                {run && (
                    <>
                        {/* Health score + summary strip */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                            {/* Health score card */}
                            <div className="bg-surface border border-border rounded-xl p-5 md:col-span-1">
                                <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider mb-2">
                                    Health Score
                                </div>
                                <div
                                    className={`font-display font-extrabold text-4xl tracking-tight ${
                                        (run.health_score ?? 0) >= 70
                                            ? "text-green-400"
                                            : (run.health_score ?? 0) >= 40
                                            ? "text-yellow-400"
                                            : "text-red-400"
                                    }`}
                                >
                                    {run.health_score ?? "N/A"}
                                    {run.health_score !== null && (
                                        <span className="text-lg text-mm-muted">%</span>
                                    )}
                                </div>
                                <div className="w-full h-1.5 bg-surface3 rounded-full overflow-hidden mt-3">
                                    <div
                                        className={`h-full rounded-full transition-all duration-1000 ${
                                            (run.health_score ?? 0) >= 70
                                                ? "bg-green-500"
                                                : (run.health_score ?? 0) >= 40
                                                ? "bg-yellow-500"
                                                : "bg-red-500"
                                        }`}
                                        style={{ width: `${run.health_score ?? 0}%` }}
                                    />
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="bg-surface border border-border rounded-xl p-5 flex flex-col justify-center">
                                <div className="font-display font-extrabold text-3xl text-mm-text tracking-tight">
                                    {run.total_tests}
                                </div>
                                <div className="font-mono text-[10px] text-mm-muted mt-1 uppercase tracking-widest font-bold">
                                    Total Tests
                                </div>
                            </div>
                            <div className="bg-surface border border-border rounded-xl p-5 flex flex-col justify-center">
                                <div className="font-display font-extrabold text-3xl text-green-400 tracking-tight">
                                    {run.passed}
                                </div>
                                <div className="font-mono text-[10px] text-green-400/70 mt-1 uppercase tracking-widest font-bold">
                                    Passed
                                </div>
                            </div>
                            <div className="bg-surface border border-border rounded-xl p-5 flex flex-col justify-center">
                                <div className="font-display font-extrabold text-3xl text-red-400 tracking-tight">
                                    {run.failed}
                                </div>
                                <div className="font-mono text-[10px] text-red-400/70 mt-1 uppercase tracking-widest font-bold">
                                    Failed
                                </div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-1 mb-6 bg-surface2 border border-border2 rounded-lg p-1 w-fit">
                            {[
                                { key: "all" as TabKey, label: "All", count: findings.length },
                                { key: "pass" as TabKey, label: "Passed", count: passCount },
                                { key: "fail" as TabKey, label: "Failed", count: failCount },
                            ].map(({ key, label, count }) => (
                                <button
                                    key={key}
                                    onClick={() => setActiveTab(key)}
                                    className={`font-mono text-[10px] px-4 py-2 rounded-md uppercase tracking-wider font-bold transition-all duration-200 ${
                                        activeTab === key
                                            ? "bg-surface border border-border text-mm-text shadow-sm"
                                            : "text-mm-muted hover:text-mm-text"
                                    }`}
                                >
                                    {label} ({count})
                                </button>
                            ))}
                        </div>

                        {/* Findings list */}
                        <div className="space-y-3">
                            {filtered.length === 0 && (
                                <div className="bg-surface border border-border rounded-xl p-8 text-center">
                                    <div className="font-mono text-sm text-mm-muted">
                                        No findings in this category
                                    </div>
                                </div>
                            )}

                            {filtered.map((finding) => {
                                const isExpanded = expandedFinding === finding.id;

                                return (
                                    <div
                                        key={finding.id}
                                        className="bg-surface border border-border rounded-xl overflow-hidden transition-all duration-200 hover:border-border2"
                                    >
                                        {/* Finding header row */}
                                        <button
                                            onClick={() =>
                                                setExpandedFinding(isExpanded ? null : finding.id)
                                            }
                                            className="w-full px-5 py-4 flex items-center gap-4 text-left"
                                        >
                                            {/* Status badge */}
                                            <div
                                                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                                                    finding.status === "pass"
                                                        ? "bg-green-500/20"
                                                        : "bg-red-500/20"
                                                }`}
                                            >
                                                {finding.status === "pass" ? (
                                                    <svg
                                                        className="w-3 h-3 text-green-400"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                        strokeWidth={3}
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            d="M5 13l4 4L19 7"
                                                        />
                                                    </svg>
                                                ) : (
                                                    <svg
                                                        className="w-3 h-3 text-red-400"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                        strokeWidth={3}
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            d="M6 18L18 6M6 6l12 12"
                                                        />
                                                    </svg>
                                                )}
                                            </div>

                                            {/* Feature name + test desc */}
                                            <div className="flex-1 min-w-0">
                                                <div className="font-mono text-xs text-mm-text font-semibold truncate">
                                                    {finding.feature_name}
                                                </div>
                                                <div className="font-mono text-[10px] text-mm-muted truncate mt-0.5">
                                                    {finding.test_description}
                                                </div>
                                            </div>

                                            {/* Metadata */}
                                            <div className="flex items-center gap-3 flex-shrink-0">
                                                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface3 border border-border2 text-mm-muted uppercase tracking-wider">
                                                    {finding.test_type}
                                                </span>
                                                <span className="font-mono text-[10px] text-mm-muted">
                                                    {Math.round(finding.confidence * 100)}%
                                                </span>
                                                <svg
                                                    className={`w-4 h-4 text-mm-muted transition-transform duration-200 ${
                                                        isExpanded ? "rotate-180" : ""
                                                    }`}
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                    strokeWidth={2}
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        d="M19 9l-7 7-7-7"
                                                    />
                                                </svg>
                                            </div>
                                        </button>

                                        {/* Expanded detail */}
                                        {isExpanded && (
                                            <div className="px-5 pb-5 pt-0 border-t border-border">
                                                <div className="pt-4 space-y-3">
                                                    {finding.explanation && (
                                                        <div>
                                                            <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider font-bold mb-1">
                                                                Explanation
                                                            </div>
                                                            <div className="font-body text-xs text-mm-text leading-relaxed">
                                                                {finding.explanation}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {finding.file_path && (
                                                        <div>
                                                            <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider font-bold mb-1">
                                                                File
                                                            </div>
                                                            <div className="font-mono text-xs text-accent">
                                                                {finding.file_path}
                                                                {finding.line_start &&
                                                                    `:${finding.line_start}`}
                                                                {finding.line_end &&
                                                                    `-${finding.line_end}`}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {finding.code_snippet && (
                                                        <div>
                                                            <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider font-bold mb-1">
                                                                Code Snippet
                                                            </div>
                                                            <pre className="bg-surface2 border border-border2 rounded-lg p-3 font-mono text-[11px] text-mm-text overflow-x-auto">
                                                                {finding.code_snippet}
                                                            </pre>
                                                        </div>
                                                    )}

                                                    {finding.status === "fail" &&
                                                        finding.fix_confidence !== null && (
                                                            <div className="flex items-center gap-2 pt-2">
                                                                <span className="font-mono text-[10px] text-mm-muted uppercase tracking-wider">
                                                                    Fix confidence:
                                                                </span>
                                                                <span className="font-mono text-xs text-yellow-400 font-semibold">
                                                                    {Math.round(
                                                                        finding.fix_confidence * 100
                                                                    )}
                                                                    %
                                                                </span>
                                                            </div>
                                                        )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Run metadata */}
                        {run.completed_at && (
                            <div className="mt-6 font-mono text-[10px] text-mm-subtle uppercase tracking-wider text-center">
                                Analysis completed{" "}
                                {new Date(run.completed_at).toLocaleString()}
                            </div>
                        )}
                    </>
                )}
            </div>
        </AppLayout>
    );
}
