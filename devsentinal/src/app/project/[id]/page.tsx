"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import GraphViewer from "@/components/v2/graph/graph-viewer";
import GraphInsights from "@/components/v2/graph/graph-insights";
import SecurityFindingCard from "@/components/v2/security/security-finding-card";

import RatingCard from "@/components/v2/quality/rating-card";
import QualityGateBadge from "@/components/v2/quality/quality-gate-badge";
import CodeSmellCard from "@/components/v2/quality/code-smell-card";
import TestFileCard from "@/components/v2/testing/test-file-card";
import TestCodePreview from "@/components/v2/testing/test-code-preview";
import type {
    CodeGraph,
    GraphSummary,
    SecurityFinding,
    QualityMetrics,
    CodeSmell,
    GeneratedTestFile,
} from "@/types";

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
    auto_fix_status: string | null;
    auto_fix_pr_url: string | null;
    auto_fix_current_item: string | null;
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

type MainTab = "compliance" | "graph" | "security" | "quality" | "tests";

export default function ProjectDetailPage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;

    const [project, setProject] = useState<Project | null>(null);
    const [run, setRun] = useState<AnalysisRun | null>(null);
    const [findings, setFindings] = useState<Finding[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Main tab
    const [activeMainTab, setActiveMainTab] = useState<MainTab>("compliance");

    // Compliance sub-tab
    const [complianceFilter, setComplianceFilter] = useState<"all" | "pass" | "fail">("all");
    const [expandedFinding, setExpandedFinding] = useState<string | null>(null);

    // v2 data
    const [graphData, setGraphData] = useState<{ graph: CodeGraph; summary: GraphSummary } | null>(null);
    const [securityData, setSecurityData] = useState<{ findings: SecurityFinding[]; total: number; by_severity: Record<string, number> } | null>(null);
    const [qualityData, setQualityData] = useState<{ metrics: QualityMetrics | null; issues: CodeSmell[]; quality_gate: string | null } | null>(null);
    const [testsData, setTestsData] = useState<{ test_files: GeneratedTestFile[] } | null>(null);

    // Security filter
    const [secSeverityFilter, setSecSeverityFilter] = useState<"all" | "ERROR" | "WARNING" | "INFO">("all");

    // Test preview
    const [selectedTestFile, setSelectedTestFile] = useState<GeneratedTestFile | null>(null);

    // Fix controls
    const [fixLoading, setFixLoading] = useState(false);

    useEffect(() => {
        if (!projectId) return;

        async function fetchData() {
            setLoading(true);
            setError(null);

            try {
                const projectRes = await fetch(`/api/projects`);
                if (!projectRes.ok) throw new Error("Failed to fetch projects");
                const projectData = await projectRes.json();
                const proj = projectData.projects?.find((p: Project) => p.id === projectId);
                if (!proj) throw new Error("Project not found");
                setProject(proj);

                const findingsRes = await fetch(`/api/projects/${projectId}/findings?run_id=latest`);
                if (findingsRes.ok) {
                    const findingsData = await findingsRes.json();
                    setRun(findingsData.run);
                    setFindings(findingsData.findings || []);
                }

                // Fetch v2 data in parallel
                const [graphRes, secRes, qualRes, testsRes] = await Promise.all([
                    fetch(`/api/projects/${projectId}/graph`).catch(() => null),
                    fetch(`/api/projects/${projectId}/security`).catch(() => null),
                    fetch(`/api/projects/${projectId}/quality`).catch(() => null),
                    fetch(`/api/projects/${projectId}/tests`).catch(() => null),
                ]);

                if (graphRes?.ok) {
                    const gd = await graphRes.json();
                    if (gd.graph) setGraphData(gd);
                }
                if (secRes?.ok) {
                    const sd = await secRes.json();
                    if (sd.findings?.length > 0) setSecurityData(sd);
                }
                if (qualRes?.ok) {
                    const qd = await qualRes.json();
                    if (qd.metrics) setQualityData(qd);
                }
                if (testsRes?.ok) {
                    const td = await testsRes.json();
                    if (td.test_files?.length > 0) setTestsData(td);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "An error occurred");
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [projectId]);

    // Poll for auto-fix progress updates
    useEffect(() => {
        if (!projectId || !run) return;
        const status = run.auto_fix_status;
        if (!status || status === "complete" || status === "error") return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/projects/${projectId}/findings?run_id=latest`);
                if (res.ok) {
                    const data = await res.json();
                    setRun(data.run);
                }
            } catch { /* ignore polling errors */ }
        }, 5000);

        return () => clearInterval(interval);
    }, [projectId, run?.auto_fix_status]);

    const filteredFindings = findings.filter((f) => {
        if (complianceFilter === "all") return true;
        return f.status === complianceFilter;
    });

    const passCount = findings.filter((f) => f.status === "pass").length;
    const failCount = findings.filter((f) => f.status === "fail").length;

    const filteredSecFindings = securityData?.findings.filter((f) => {
        if (secSeverityFilter === "all") return true;
        return f.severity === secSeverityFilter;
    }) ?? [];

    const handleApplyFixes = async () => {
        if (!projectId) return;
        setFixLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/fix-all`, { method: "POST" });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(err.error || "Failed to trigger auto-fix");
            } else {
                // Refresh run status
                const findingsRes = await fetch(`/api/projects/${projectId}/findings?run_id=latest`);
                if (findingsRes.ok) {
                    const data = await findingsRes.json();
                    setRun(data.run);
                }
            }
        } catch {
            alert("Failed to trigger auto-fix");
        } finally {
            setFixLoading(false);
        }
    };

    if (loading) {
        return (
            <AppLayout>
                <div className="flex items-center justify-center min-h-[60vh] cursor-auto">
                    <LoadingSpinner size="lg" label="Loading project..." />
                </div>
            </AppLayout>
        );
    }

    if (error || !project) {
        return (
            <AppLayout>
                <div className="max-w-2xl mx-auto py-12 px-8 cursor-auto">
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                        <div className="font-mono text-sm text-red-400 mb-4">{error || "Project not found"}</div>
                        {/* ✅ FIX: cursor-pointer on button */}
                        <button
                            onClick={() => router.push("/dashboard")}
                            className="font-mono text-[10px] text-mm-muted hover:text-mm-text uppercase tracking-[0.2em] font-bold cursor-pointer"
                        >
                            &larr; Back to Dashboard
                        </button>
                    </div>
                </div>
            </AppLayout>
        );
    }

    // Determine available tabs
    const tabs: { key: MainTab; label: string; count?: number }[] = [
        { key: "compliance", label: "Compliance", count: findings.length },
    ];
    if (graphData) tabs.push({ key: "graph", label: "Graph" });
    if (securityData) tabs.push({ key: "security", label: "Security", count: securityData.total });
    if (qualityData) tabs.push({ key: "quality", label: "Quality" });
    if (testsData) tabs.push({ key: "tests", label: "Tests", count: testsData.test_files.length });

    const hasIssues = (securityData?.by_severity?.ERROR ?? 0) > 0
        || (securityData?.by_severity?.WARNING ?? 0) > 0
        || (qualityData?.issues?.length ?? 0) > 0;

    return (
        <AppLayout>
            {/* ✅ FIX: cursor-auto on root div so cursor is always visible */}
            <div className="max-w-5xl mx-auto py-8 px-8 cursor-auto">
                {/* Breadcrumb */}
                {/* ✅ FIX: cursor-pointer on Link */}
                <Link
                    href="/dashboard"
                    className="font-mono text-[10px] text-mm-muted hover:text-mm-text transition-colors duration-200 uppercase tracking-[0.2em] font-bold inline-flex items-center gap-2 cursor-pointer"
                >
                    &larr; Dashboard
                </Link>

                {/* Project header */}
                <div className="mt-6 mb-6">
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

                {/* Auto-fix banner */}
                {run && hasIssues && (
                    <div className="mb-6 p-4 bg-surface border border-border rounded-xl flex items-center justify-between gap-4">
                        <div>
                            <div className="font-mono text-xs text-mm-text font-semibold">
                                {securityData ? `${securityData.by_severity.ERROR ?? 0} critical, ${securityData.by_severity.WARNING ?? 0} warning security issues` : ""}
                                {securityData && qualityData ? " and " : ""}
                                {qualityData ? `${qualityData.issues.length} quality issues` : ""}
                                {" found"}
                            </div>
                            {run.auto_fix_status === "complete" && run.auto_fix_pr_url && (
                                <a
                                    href={run.auto_fix_pr_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-[10px] text-accent hover:underline mt-1 block"
                                >
                                    View Auto-Fix PR &rarr;
                                </a>
                            )}
                            {run.auto_fix_status && run.auto_fix_status !== "complete" && run.auto_fix_status !== "error" && (
                                <div className="font-mono text-[10px] text-yellow-400 mt-1">
                                    <div className="flex items-center gap-2">
                                        <LoadingSpinner size="sm" />
                                        Auto-fix in progress ({run.auto_fix_status})...
                                    </div>
                                    {run.auto_fix_current_item && (
                                        <div className="text-yellow-400/70 mt-0.5 pl-5 truncate max-w-xs">
                                            {run.auto_fix_current_item}
                                        </div>
                                    )}
                                </div>
                            )}
                            {run.auto_fix_status === "error" && (
                                <div className="font-mono text-[10px] text-red-400 mt-1">
                                    Auto-fix failed. You can retry.
                                </div>
                            )}
                        </div>
                        {(!run.auto_fix_status || run.auto_fix_status === "error") && (
                            <button
                                onClick={handleApplyFixes}
                                disabled={fixLoading}
                                className="font-mono text-[10px] px-4 py-2 rounded-lg bg-accent text-white uppercase tracking-wider font-bold hover:bg-accent2 transition-colors disabled:opacity-50 flex-shrink-0"
                            >
                                {fixLoading ? "Triggering..." : "Apply Fixes"}
                            </button>
                        )}
                    </div>
                )}

                {/* No findings state */}
                {!run && (
                    <div className="bg-surface border border-border rounded-2xl p-12 text-center">
                        <div className="font-mono text-3xl text-mm-subtle mb-4">?</div>
                        <div className="font-body text-sm text-mm-muted mb-2">
                            No analysis has been run yet
                        </div>
                        <div className="font-mono text-[10px] text-mm-subtle uppercase tracking-wider">
                            Run the analysis pipeline to see results
                        </div>
                    </div>
                )}

                {/* Results */}
                {run && (
                    <>
                        {/* Health score + summary strip */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
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

                        {/* Main Tabs */}
                        <div className="flex gap-1 mb-6 bg-surface2 border border-border2 rounded-lg p-1 w-fit overflow-x-auto">
                            {tabs.map(({ key, label, count }) => (
                                <button
                                    key={key}
                                    onClick={() => setActiveMainTab(key)}
                                    className={`font-mono text-[10px] px-4 py-2 rounded-md uppercase tracking-wider font-bold transition-all duration-200 cursor-pointer whitespace-nowrap ${
                                        activeMainTab === key
                                            ? "bg-surface border border-border text-mm-text shadow-sm"
                                            : "text-mm-muted hover:text-mm-text"
                                    }`}
                                >
                                    {label}
                                    {count !== undefined && ` (${count})`}
                                </button>
                            ))}
                        </div>

                        {/* ═══ COMPLIANCE TAB ═══ */}
                        {activeMainTab === "compliance" && (
                            <>
                                <div className="flex gap-1 mb-6 bg-surface2 border border-border2 rounded-lg p-1 w-fit">
                                    {[
                                        { key: "all" as const, label: "All", count: findings.length },
                                        { key: "pass" as const, label: "Passed", count: passCount },
                                        { key: "fail" as const, label: "Failed", count: failCount },
                                    ].map(({ key, label, count }) => (
                                        <button
                                            key={key}
                                            onClick={() => setComplianceFilter(key)}
                                            className={`font-mono text-[10px] px-4 py-2 rounded-md uppercase tracking-wider font-bold transition-all duration-200 cursor-pointer ${
                                                complianceFilter === key
                                                    ? "bg-surface border border-border text-mm-text shadow-sm"
                                                    : "text-mm-muted hover:text-mm-text"
                                            }`}
                                        >
                                            {label} ({count})
                                        </button>
                                    ))}
                                </div>

                                <div className="space-y-3">
                                    {filteredFindings.length === 0 && (
                                        <div className="bg-surface border border-border rounded-xl p-8 text-center">
                                            <div className="font-mono text-sm text-mm-muted">No findings in this category</div>
                                        </div>
                                    )}

                                    {filteredFindings.map((finding) => {
                                        const isExpanded = expandedFinding === finding.id;

                                        return (
                                            <div key={finding.id} className="bg-surface border border-border rounded-xl overflow-hidden transition-all duration-200 hover:border-border2">
                                                <button
                                                    onClick={() => setExpandedFinding(isExpanded ? null : finding.id)}
                                                    className="w-full px-5 py-4 flex items-center gap-4 text-left"
                                                >
                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${finding.status === "pass" ? "bg-green-500/20" : "bg-red-500/20"}`}>
                                                        {finding.status === "pass" ? (
                                                            <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        ) : (
                                                            <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-mono text-xs text-mm-text font-semibold truncate">{finding.feature_name}</div>
                                                        <div className="font-mono text-[10px] text-mm-muted truncate mt-0.5">{finding.test_description}</div>
                                                    </div>
                                                    <div className="flex items-center gap-3 flex-shrink-0">
                                                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface3 border border-border2 text-mm-muted uppercase tracking-wider">{finding.test_type}</span>
                                                        <span className="font-mono text-[10px] text-mm-muted">{Math.round(finding.confidence * 100)}%</span>
                                                        <svg className={`w-4 h-4 text-mm-muted transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </div>
                                                </button>

                                                {isExpanded && (
                                                    <div className="px-5 pb-5 pt-0 border-t border-border">
                                                        <div className="pt-4 space-y-3">
                                                            {finding.explanation && (
                                                                <div>
                                                                    <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider font-bold mb-1">Explanation</div>
                                                                    <div className="font-body text-xs text-mm-text leading-relaxed">{finding.explanation}</div>
                                                                </div>
                                                            )}
                                                            {finding.file_path && (
                                                                <div>
                                                                    <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider font-bold mb-1">File</div>
                                                                    <div className="font-mono text-xs text-accent">
                                                                        {finding.file_path}
                                                                        {finding.line_start && `:${finding.line_start}`}
                                                                        {finding.line_end && `-${finding.line_end}`}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {finding.code_snippet && (
                                                                <div>
                                                                    <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider font-bold mb-1">Code Snippet</div>
                                                                    <pre className="bg-surface2 border border-border2 rounded-lg p-3 font-mono text-[11px] text-mm-text overflow-x-auto">{finding.code_snippet}</pre>
                                                                </div>
                                                            )}
                                                            {finding.status === "fail" && finding.fix_confidence !== null && (
                                                                <div className="flex items-center gap-2 pt-2">
                                                                    <span className="font-mono text-[10px] text-mm-muted uppercase tracking-wider">Fix confidence:</span>
                                                                    <span className="font-mono text-xs text-yellow-400 font-semibold">{Math.round(finding.fix_confidence * 100)}%</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {/* ═══ GRAPH TAB ═══ */}
                        {activeMainTab === "graph" && graphData && (
                            <div className="space-y-6">
                                <GraphViewer graph={graphData.graph} />
                                <GraphInsights
                                    summary={graphData.summary}
                                    nodeCount={graphData.graph.nodes.length}
                                    edgeCount={graphData.graph.edges.length}
                                />
                            </div>
                        )}

                        {/* ═══ SECURITY TAB ═══ */}
                        {activeMainTab === "security" && securityData && (
                            <div className="space-y-6">
                                {/* Severity summary */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-center">
                                        <div className="font-display font-extrabold text-2xl text-red-400">{securityData.by_severity.ERROR ?? 0}</div>
                                        <div className="font-mono text-[10px] text-red-400/70 uppercase tracking-wider mt-1">Error</div>
                                    </div>
                                    <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 text-center">
                                        <div className="font-display font-extrabold text-2xl text-yellow-400">{securityData.by_severity.WARNING ?? 0}</div>
                                        <div className="font-mono text-[10px] text-yellow-400/70 uppercase tracking-wider mt-1">Warning</div>
                                    </div>
                                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 text-center">
                                        <div className="font-display font-extrabold text-2xl text-blue-400">{securityData.by_severity.INFO ?? 0}</div>
                                        <div className="font-mono text-[10px] text-blue-400/70 uppercase tracking-wider mt-1">Info</div>
                                    </div>
                                </div>

                                {/* Filter */}
                                <div className="flex gap-1 bg-surface2 border border-border2 rounded-lg p-1 w-fit">
                                    {(["all", "ERROR", "WARNING", "INFO"] as const).map((key) => (
                                        <button
                                            key={key}
                                            onClick={() => setSecSeverityFilter(key)}
                                            className={`font-mono text-[10px] px-4 py-2 rounded-md uppercase tracking-wider font-bold transition-all duration-200 ${
                                                secSeverityFilter === key
                                                    ? "bg-surface border border-border text-mm-text shadow-sm"
                                                    : "text-mm-muted hover:text-mm-text"
                                            }`}
                                        >
                                            {key === "all" ? `All (${securityData.total})` : key}
                                        </button>
                                    ))}
                                </div>

                                {/* Findings list */}
                                <div className="space-y-3">
                                    {filteredSecFindings.length === 0 && (
                                        <div className="bg-surface border border-border rounded-xl p-8 text-center">
                                            <div className="font-mono text-sm text-mm-muted">No findings in this category</div>
                                        </div>
                                    )}
                                    {filteredSecFindings.map((f) => (
                                        <SecurityFindingCard key={f.id} finding={f} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ═══ QUALITY TAB ═══ */}
                        {activeMainTab === "quality" && qualityData && (
                            <div className="space-y-6">
                                {qualityData.metrics && (
                                    <>
                                        <div className="flex items-center gap-3">
                                            <QualityGateBadge status={qualityData.quality_gate as "PASS" | "FAIL" | null} />
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                            <RatingCard label="Reliability" rating={qualityData.metrics.reliability_rating} />
                                            <RatingCard label="Security" rating={qualityData.metrics.security_rating} />
                                            <RatingCard label="Maintainability" rating={qualityData.metrics.maintainability_rating} />
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div className="bg-surface border border-border rounded-xl p-4 text-center">
                                                <div className="font-display font-extrabold text-xl text-mm-text">{qualityData.metrics.coverage}%</div>
                                                <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider mt-1">Coverage</div>
                                            </div>
                                            <div className="bg-surface border border-border rounded-xl p-4 text-center">
                                                <div className="font-display font-extrabold text-xl text-mm-text">{qualityData.metrics.bugs}</div>
                                                <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider mt-1">Bugs</div>
                                            </div>
                                            <div className="bg-surface border border-border rounded-xl p-4 text-center">
                                                <div className="font-display font-extrabold text-xl text-mm-text">{qualityData.metrics.code_smells}</div>
                                                <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider mt-1">Code Smells</div>
                                            </div>
                                            <div className="bg-surface border border-border rounded-xl p-4 text-center">
                                                <div className="font-display font-extrabold text-xl text-mm-text">{qualityData.metrics.technical_debt}</div>
                                                <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider mt-1">Tech Debt</div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {qualityData.issues.length > 0 && (
                                    <div>
                                        <div className="font-mono text-[10px] text-mm-muted uppercase tracking-[0.2em] font-bold mb-4">
                                            Issues ({qualityData.issues.length})
                                        </div>
                                        <div className="space-y-2">
                                            {qualityData.issues.map((issue) => (
                                                <CodeSmellCard key={issue.key} issue={issue} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ═══ TESTS TAB ═══ */}
                        {activeMainTab === "tests" && testsData && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* File list */}
                                <div className="space-y-3 md:col-span-1">
                                    <div className="font-mono text-[10px] text-mm-muted uppercase tracking-[0.2em] font-bold mb-2">
                                        Generated Files ({testsData.test_files.length})
                                    </div>
                                    {testsData.test_files.map((file) => (
                                        <TestFileCard
                                            key={file.file_path}
                                            file={file}
                                            isSelected={selectedTestFile?.file_path === file.file_path}
                                            onClick={() => setSelectedTestFile(file)}
                                        />
                                    ))}
                                </div>

                                {/* Code preview */}
                                <div className="md:col-span-2">
                                    {selectedTestFile ? (
                                        <TestCodePreview file={selectedTestFile} />
                                    ) : (
                                        <div className="bg-surface border border-border rounded-xl p-12 text-center">
                                            <div className="font-mono text-sm text-mm-muted">
                                                Select a test file to preview
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Run metadata */}
                        {run.completed_at && (
                            <div className="mt-6 font-mono text-[10px] text-mm-subtle uppercase tracking-wider text-center">
                                Analysis completed {new Date(run.completed_at).toLocaleString()}
                            </div>
                        )}
                    </>
                )}
            </div>
        </AppLayout>
    );
}
