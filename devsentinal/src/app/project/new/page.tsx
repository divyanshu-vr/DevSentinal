"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

// Pipeline step definitions
const PIPELINE_STEPS = [
    { key: "create_project", label: "Creating Project", description: "Parsing repo URL and detecting tech stack" },
    { key: "upload_prd", label: "Uploading PRD", description: "Parsing document and extracting requirements" },
    { key: "trigger_analysis", label: "Starting Analysis", description: "Triggering analysis pipeline" },
    { key: "parsing_prd", label: "Parsing PRD", description: "AI is reading your requirements" },
    { key: "understanding_code", label: "Understanding Code", description: "AI is mapping the codebase" },
    { key: "generating_tests", label: "Generating Tests", description: "Creating test cases from requirements" },
    { key: "running_tests", label: "Running Tests", description: "Verifying requirements against code" },
    { key: "complete", label: "Complete", description: "Analysis finished" },
] as const;

type StepKey = (typeof PIPELINE_STEPS)[number]["key"];

type StepStatus = "pending" | "active" | "done" | "error";

interface PipelineState {
    currentStep: StepKey | null;
    stepStatuses: Record<StepKey, StepStatus>;
    projectId: string | null;
    projectName: string | null;
    techStack: string[];
    requirementCount: number | null;
    runId: string | null;
    healthScore: number | null;
    totalTests: number;
    passed: number;
    failed: number;
    errorMessage: string | null;
    isRunning: boolean;
    isComplete: boolean;
}

function getInitialStepStatuses(): Record<StepKey, StepStatus> {
    const statuses = {} as Record<StepKey, StepStatus>;
    for (const step of PIPELINE_STEPS) {
        statuses[step.key] = "pending";
    }
    return statuses;
}

export default function NewProjectPage() {
    const router = useRouter();
    const [repoUrl, setRepoUrl] = useState("");
    const [prdFile, setPrdFile] = useState<File | null>(null);
    const [autoRun, setAutoRun] = useState(true);
    const [requireTests, setRequireTests] = useState(true);
    const [isLoading, setIsLoading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    const [pipeline, setPipeline] = useState<PipelineState>({
        currentStep: null,
        stepStatuses: getInitialStepStatuses(),
        projectId: null,
        projectName: null,
        techStack: [],
        requirementCount: null,
        runId: null,
        healthScore: null,
        totalTests: 0,
        passed: 0,
        failed: 0,
        errorMessage: null,
        isRunning: false,
        isComplete: false,
    });

    // Cleanup SSE on unmount
    useEffect(() => {
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, []);

    const markStep = useCallback((step: StepKey, status: StepStatus) => {
        setPipeline((prev) => ({
            ...prev,
            currentStep: status === "active" ? step : prev.currentStep,
            stepStatuses: { ...prev.stepStatuses, [step]: status },
        }));
    }, []);

    const markStepsDoneBefore = useCallback((targetStep: StepKey) => {
        setPipeline((prev) => {
            const newStatuses = { ...prev.stepStatuses };
            for (const step of PIPELINE_STEPS) {
                if (step.key === targetStep) break;
                if (newStatuses[step.key] !== "error") {
                    newStatuses[step.key] = "done";
                }
            }
            return { ...prev, stepStatuses: newStatuses, currentStep: targetStep };
        });
    }, []);

    const setError = useCallback((step: StepKey, message: string) => {
        setPipeline((prev) => ({
            ...prev,
            stepStatuses: { ...prev.stepStatuses, [step]: "error" },
            errorMessage: message,
            isRunning: false,
        }));
    }, []);

    // Map SSE status to our step keys
    const mapAnalysisStatus = (status: string): StepKey | null => {
        const mapping: Record<string, StepKey> = {
            pending: "trigger_analysis",
            parsing_prd: "parsing_prd",
            understanding_code: "understanding_code",
            generating_tests: "generating_tests",
            running_tests: "running_tests",
            complete: "complete",
        };
        return mapping[status] ?? null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!repoUrl || !prdFile) return;

        setIsLoading(true);
        setPipeline({
            currentStep: "create_project",
            stepStatuses: getInitialStepStatuses(),
            projectId: null,
            projectName: null,
            techStack: [],
            requirementCount: null,
            runId: null,
            healthScore: null,
            totalTests: 0,
            passed: 0,
            failed: 0,
            errorMessage: null,
            isRunning: true,
            isComplete: false,
        });

        // Normalize the URL
        let normalizedUrl = repoUrl.trim();
        if (!normalizedUrl.startsWith("http")) {
            normalizedUrl = "https://" + normalizedUrl;
        }

        // ── Step 1: Create Project ──
        markStep("create_project", "active");

        let projectId: string;
        let projectName: string;
        let techStack: string[];

        try {
            const createRes = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ repo_url: normalizedUrl }),
            });

            if (!createRes.ok) {
                const err = await createRes.json().catch(() => ({}));
                throw new Error(err.error || `Failed to create project (HTTP ${createRes.status})`);
            }

            const createData = await createRes.json();
            projectId = createData.project.id;
            projectName = createData.project.name;
            techStack = createData.tech_stack || [];

            setPipeline((prev) => ({
                ...prev,
                projectId,
                projectName,
                techStack,
            }));
            markStep("create_project", "done");
        } catch (err) {
            setError("create_project", err instanceof Error ? err.message : "Failed to create project");
            setIsLoading(false);
            return;
        }

        // ── Step 2: Upload PRD ──
        markStep("upload_prd", "active");

        let requirementCount: number;

        try {
            const formData = new FormData();
            formData.append("file", prdFile);
            formData.append("project_id", projectId);

            const uploadRes = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });

            if (!uploadRes.ok) {
                const err = await uploadRes.json().catch(() => ({}));
                throw new Error(err.error || `Failed to upload PRD (HTTP ${uploadRes.status})`);
            }

            const uploadData = await uploadRes.json();
            requirementCount = uploadData.requirements?.length ?? 0;

            setPipeline((prev) => ({
                ...prev,
                requirementCount,
            }));
            markStep("upload_prd", "done");
        } catch (err) {
            setError("upload_prd", err instanceof Error ? err.message : "Failed to upload PRD");
            setIsLoading(false);
            return;
        }

        // ── Step 3: Trigger Analysis ──
        markStep("trigger_analysis", "active");

        let runId: string;
        let sseUrl: string;

        try {
            const analyzeRes = await fetch(`/api/projects/${projectId}/analyze`, {
                method: "POST",
            });

            if (!analyzeRes.ok) {
                const err = await analyzeRes.json().catch(() => ({}));
                throw new Error(err.error || `Failed to trigger analysis (HTTP ${analyzeRes.status})`);
            }

            const analyzeData = await analyzeRes.json();
            runId = analyzeData.run_id;
            sseUrl = analyzeData.sse_url;

            setPipeline((prev) => ({
                ...prev,
                runId,
            }));
            markStep("trigger_analysis", "done");
        } catch (err) {
            setError("trigger_analysis", err instanceof Error ? err.message : "Failed to trigger analysis");
            setIsLoading(false);
            return;
        }

        // ── Step 4: Stream progress via SSE ──
        markStep("parsing_prd", "active");

        try {
            const eventSource = new EventSource(sseUrl);
            eventSourceRef.current = eventSource;

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === "status_change" && data.status) {
                        const stepKey = mapAnalysisStatus(data.status);
                        if (stepKey) {
                            markStepsDoneBefore(stepKey);
                            if (stepKey === "complete") {
                                markStep("complete", "done");
                            } else {
                                markStep(stepKey, "active");
                            }
                        }
                    }

                    if (data.type === "complete") {
                        // Mark all steps done
                        setPipeline((prev) => {
                            const newStatuses = { ...prev.stepStatuses };
                            for (const step of PIPELINE_STEPS) {
                                if (newStatuses[step.key] !== "error") {
                                    newStatuses[step.key] = "done";
                                }
                            }
                            return {
                                ...prev,
                                stepStatuses: newStatuses,
                                currentStep: "complete",
                                healthScore: data.health_score ?? prev.healthScore,
                                isRunning: false,
                                isComplete: true,
                            };
                        });
                        eventSource.close();
                        eventSourceRef.current = null;
                        setIsLoading(false);

                        // Fetch final findings
                        fetchFindings(projectId, runId);
                    }

                    if (data.type === "error") {
                        const failingStep = mapAnalysisStatus(data.status || "") || "running_tests";
                        setError(failingStep, data.message || "Analysis failed");
                        eventSource.close();
                        eventSourceRef.current = null;
                        setIsLoading(false);
                    }
                } catch {
                    // Ignore parse errors from SSE
                }
            };

            eventSource.onerror = () => {
                // SSE connection lost — start polling as fallback
                eventSource.close();
                eventSourceRef.current = null;
                startPolling(projectId, runId);
            };
        } catch {
            // SSE not supported — fallback to polling
            startPolling(projectId, runId);
        }
    };

    // Polling fallback if SSE fails
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const startPolling = useCallback((projectId: string, runId: string) => {
        if (pollIntervalRef.current) return;

        let pollCount = 0;
        const maxPolls = 120;

        pollIntervalRef.current = setInterval(async () => {
            pollCount++;
            if (pollCount > maxPolls) {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
                setError("running_tests", "Analysis timed out");
                setIsLoading(false);
                return;
            }

            try {
                const res = await fetch(`/api/projects/${projectId}/findings?run_id=${runId}`);
                if (!res.ok) return;
                const data = await res.json();
                const status = data.run?.status;

                if (status) {
                    const stepKey = mapAnalysisStatus(status);
                    if (stepKey) {
                        markStepsDoneBefore(stepKey);
                        if (stepKey === "complete") {
                            markStep("complete", "done");
                        } else {
                            markStep(stepKey, "active");
                        }
                    }
                }

                if (status === "complete") {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;

                    setPipeline((prev) => {
                        const newStatuses = { ...prev.stepStatuses };
                        for (const step of PIPELINE_STEPS) {
                            if (newStatuses[step.key] !== "error") {
                                newStatuses[step.key] = "done";
                            }
                        }
                        return {
                            ...prev,
                            stepStatuses: newStatuses,
                            currentStep: "complete",
                            healthScore: data.run?.health_score ?? prev.healthScore,
                            totalTests: data.run?.total_tests ?? 0,
                            passed: data.run?.passed ?? 0,
                            failed: data.run?.failed ?? 0,
                            isRunning: false,
                            isComplete: true,
                        };
                    });
                    setIsLoading(false);
                }

                if (status === "error") {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                    setError("running_tests", data.run?.error_message || "Analysis failed");
                    setIsLoading(false);
                }
            } catch {
                // Keep polling on network errors
            }
        }, 3000);
    }, [markStep, markStepsDoneBefore, setError]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, []);

    const fetchFindings = async (projectId: string, runId: string) => {
        try {
            const res = await fetch(`/api/projects/${projectId}/findings?run_id=${runId}`);
            if (!res.ok) return;
            const data = await res.json();
            setPipeline((prev) => ({
                ...prev,
                healthScore: data.run?.health_score ?? prev.healthScore,
                totalTests: data.run?.total_tests ?? 0,
                passed: data.run?.passed ?? 0,
                failed: data.run?.failed ?? 0,
            }));
        } catch {
            // Non-critical
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setPrdFile(e.target.files[0]);
        }
    };

    const showPipeline = pipeline.isRunning || pipeline.isComplete || pipeline.errorMessage;

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
                    &larr; Back to Dashboard
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

                {/* Form Card — hide when pipeline is active */}
                {!showPipeline && (
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
                                        <div className="font-mono text-3xl text-mm-subtle mb-3">&uarr;</div>
                                        <div className="font-body text-sm text-mm-muted">
                                            Drop your PRD here or click to browse
                                        </div>
                                        <div className="font-mono text-[10px] text-mm-subtle mt-2 uppercase tracking-widest">
                                            Supports .pdf, .md, .docx &mdash; max 10MB
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center">
                                        <div className="text-green-400 text-3xl mb-3">&#10003;</div>
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
                            disabled={isLoading || !repoUrl || !prdFile}
                            className={`w-full py-4 px-6 rounded-xl bg-accent text-white font-body font-bold text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-xl shadow-accent/20 flex items-center justify-center ${isLoading || !repoUrl || !prdFile ? "opacity-50 cursor-not-allowed" : "hover:bg-accent2 hover:shadow-accent2/30 transform hover:-translate-y-0.5"
                                }`}
                        >
                            {isLoading ? (
                                <div className="flex items-center gap-3">
                                    <LoadingSpinner size="sm" />
                                    <span>Setting up project...</span>
                                </div>
                            ) : (
                                "Create Project &rarr;"
                            )}
                        </button>
                    </form>
                )}

                {/* ═══ Pipeline Progress View ═══ */}
                {showPipeline && (
                    <div className="bg-surface border border-border rounded-2xl p-8 shadow-xl shadow-black/20">
                        {/* Project info header */}
                        {pipeline.projectName && (
                            <div className="mb-8 pb-6 border-b border-border">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
                                        <span className="text-accent text-sm font-bold">&lt;/&gt;</span>
                                    </div>
                                    <div>
                                        <h2 className="font-mono text-sm text-mm-text font-semibold">
                                            {pipeline.projectName}
                                        </h2>
                                        <p className="font-mono text-[10px] text-mm-muted">
                                            {repoUrl}
                                        </p>
                                    </div>
                                </div>
                                {pipeline.techStack.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {pipeline.techStack.map((tech) => (
                                            <span
                                                key={tech}
                                                className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface3 border border-border2 text-mm-muted uppercase tracking-wider"
                                            >
                                                {tech}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {pipeline.requirementCount !== null && (
                                    <p className="font-mono text-[10px] text-mm-muted mt-3 uppercase tracking-wider">
                                        {pipeline.requirementCount} requirements extracted
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Pipeline stepper */}
                        <div className="font-mono text-[10px] text-mm-muted uppercase tracking-[0.2em] font-bold mb-6">
                            Pipeline Progress
                        </div>

                        <div className="space-y-0">
                            {PIPELINE_STEPS.map((step, idx) => {
                                const status = pipeline.stepStatuses[step.key];
                                const isLast = idx === PIPELINE_STEPS.length - 1;

                                return (
                                    <div key={step.key} className="flex gap-4">
                                        {/* Vertical line + circle */}
                                        <div className="flex flex-col items-center">
                                            <div
                                                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                                                    status === "done"
                                                        ? "bg-green-500/20 border-green-500/50"
                                                        : status === "active"
                                                        ? "bg-accent/20 border-accent animate-pulse"
                                                        : status === "error"
                                                        ? "bg-red-500/20 border-red-500/50"
                                                        : "bg-surface3 border-border2"
                                                }`}
                                            >
                                                {status === "done" && (
                                                    <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                                {status === "active" && (
                                                    <div className="w-2 h-2 rounded-full bg-accent" />
                                                )}
                                                {status === "error" && (
                                                    <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                )}
                                                {status === "pending" && (
                                                    <div className="w-1.5 h-1.5 rounded-full bg-border2" />
                                                )}
                                            </div>
                                            {/* Connector line */}
                                            {!isLast && (
                                                <div
                                                    className={`w-0.5 h-8 transition-all duration-300 ${
                                                        status === "done"
                                                            ? "bg-green-500/30"
                                                            : status === "active"
                                                            ? "bg-accent/30"
                                                            : "bg-border"
                                                    }`}
                                                />
                                            )}
                                        </div>

                                        {/* Step content */}
                                        <div className={`pb-${isLast ? "0" : "4"} pt-1`}>
                                            <div
                                                className={`font-mono text-xs font-semibold transition-colors duration-200 ${
                                                    status === "done"
                                                        ? "text-green-400"
                                                        : status === "active"
                                                        ? "text-accent"
                                                        : status === "error"
                                                        ? "text-red-400"
                                                        : "text-mm-subtle"
                                                }`}
                                            >
                                                {step.label}
                                                {status === "active" && (
                                                    <span className="ml-2 inline-flex">
                                                        <LoadingSpinner size="sm" />
                                                    </span>
                                                )}
                                            </div>
                                            <div className="font-mono text-[10px] text-mm-muted mt-0.5">
                                                {step.description}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Error message */}
                        {pipeline.errorMessage && (
                            <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                                <div className="font-mono text-[10px] text-red-400 uppercase tracking-wider font-bold mb-1">
                                    Error
                                </div>
                                <div className="font-mono text-xs text-red-300">
                                    {pipeline.errorMessage}
                                </div>
                                <button
                                    onClick={() => {
                                        setPipeline((prev) => ({
                                            ...prev,
                                            currentStep: null,
                                            stepStatuses: getInitialStepStatuses(),
                                            errorMessage: null,
                                            isRunning: false,
                                            isComplete: false,
                                        }));
                                        setIsLoading(false);
                                    }}
                                    className="mt-3 font-mono text-[10px] text-red-400 hover:text-red-300 uppercase tracking-[0.2em] font-bold"
                                >
                                    &larr; Try Again
                                </button>
                            </div>
                        )}

                        {/* Completion summary */}
                        {pipeline.isComplete && (
                            <div className="mt-8 pt-6 border-t border-border">
                                <div className="font-mono text-[10px] text-mm-muted uppercase tracking-[0.2em] font-bold mb-4">
                                    Analysis Results
                                </div>

                                {/* Health score */}
                                {pipeline.healthScore !== null && (
                                    <div className="mb-6">
                                        <div className="flex items-end gap-3 mb-2">
                                            <span
                                                className={`font-display font-extrabold text-4xl tracking-tight ${
                                                    pipeline.healthScore >= 70
                                                        ? "text-green-400"
                                                        : pipeline.healthScore >= 40
                                                        ? "text-yellow-400"
                                                        : "text-red-400"
                                                }`}
                                            >
                                                {pipeline.healthScore}%
                                            </span>
                                            <span className="font-mono text-[10px] text-mm-muted uppercase tracking-wider mb-1">
                                                Health Score
                                            </span>
                                        </div>
                                        <div className="w-full h-2 bg-surface3 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-1000 ${
                                                    pipeline.healthScore >= 70
                                                        ? "bg-green-500"
                                                        : pipeline.healthScore >= 40
                                                        ? "bg-yellow-500"
                                                        : "bg-red-500"
                                                }`}
                                                style={{ width: `${pipeline.healthScore}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Stats */}
                                <div className="grid grid-cols-3 gap-4 mb-6">
                                    <div className="bg-surface2 border border-border2 rounded-xl p-4 text-center">
                                        <div className="font-display font-extrabold text-2xl text-mm-text">
                                            {pipeline.totalTests}
                                        </div>
                                        <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider mt-1">
                                            Total Tests
                                        </div>
                                    </div>
                                    <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 text-center">
                                        <div className="font-display font-extrabold text-2xl text-green-400">
                                            {pipeline.passed}
                                        </div>
                                        <div className="font-mono text-[10px] text-green-400/70 uppercase tracking-wider mt-1">
                                            Passed
                                        </div>
                                    </div>
                                    <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-center">
                                        <div className="font-display font-extrabold text-2xl text-red-400">
                                            {pipeline.failed}
                                        </div>
                                        <div className="font-mono text-[10px] text-red-400/70 uppercase tracking-wider mt-1">
                                            Failed
                                        </div>
                                    </div>
                                </div>

                                {/* View findings button */}
                                <button
                                    onClick={() => router.push(`/project/${pipeline.projectId}`)}
                                    className="w-full py-4 px-6 rounded-xl bg-accent text-white font-body font-bold text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-xl shadow-accent/20 hover:bg-accent2 hover:shadow-accent2/30 transform hover:-translate-y-0.5"
                                >
                                    View Detailed Findings &rarr;
                                </button>

                                <button
                                    onClick={() => router.push("/dashboard")}
                                    className="w-full mt-3 py-3 px-6 rounded-xl bg-surface2 border border-border2 text-mm-muted font-mono text-[10px] uppercase tracking-[0.2em] font-bold hover:border-border hover:text-mm-text transition-all duration-200"
                                >
                                    Back to Dashboard
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
