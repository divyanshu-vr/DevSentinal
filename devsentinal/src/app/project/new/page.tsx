"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import type { PipelineLogEvent } from "@/types";

// Dynamic pipeline steps — built based on selected options
interface PipelineStep {
    key: string;
    label: string;
    description: string;
}

function buildPipelineSteps(options: PipelineOptionsState): PipelineStep[] {
    const steps: PipelineStep[] = [
        { key: "create_project", label: "Creating Project", description: "Parsing repo URL and detecting tech stack" },
    ];

    if (options.generate_tests) {
        steps.push({ key: "upload_prd", label: "Uploading PRD", description: "Parsing document and extracting requirements" });
    }

    steps.push(
        { key: "trigger_analysis", label: "Starting Analysis", description: "Triggering analysis pipeline" },
        { key: "understanding_code", label: "Understanding Code", description: "AI is mapping the codebase" },
        { key: "building_graph", label: "Building Code Graph", description: "Analyzing module dependencies and structure" },
    );

    if (options.security_scan) {
        steps.push({ key: "scanning_security", label: "Security Scan", description: "Running Semgrep SAST analysis" });
    }
    if (options.quality_scan) {
        steps.push({ key: "scanning_quality", label: "Quality Scan", description: "Running SonarCloud analysis" });
    }
    if (options.generate_tests) {
        steps.push(
            { key: "generating_tests", label: "Generating Tests", description: "Creating test cases from requirements" },
            { key: "running_tests", label: "Running Tests", description: "Verifying requirements against code" },
            { key: "generating_test_files", label: "Generating Test Files", description: "Creating executable test files" },
        );
    }

    steps.push({ key: "complete", label: "Complete", description: "Analysis finished" });

    if (options.auto_fix) {
        steps.push({ key: "auto_fixing", label: "Auto-Fixing", description: "AI is fixing security and quality issues" });
    }

    return steps;
}

interface PipelineOptionsState {
    security_scan: boolean;
    quality_scan: boolean;
    generate_tests: boolean;
    auto_fix: boolean;
}

type StepStatus = "pending" | "active" | "done" | "error";

interface PipelineState {
    steps: PipelineStep[];
    stepStatuses: Record<string, StepStatus>;
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
    logMessages: PipelineLogEvent[];
    stepStartTimes: Record<string, number>;
    stepDurations: Record<string, number>;
    activeStepMessage: string | null;
}

function getInitialStepStatuses(steps: PipelineStep[]): Record<string, StepStatus> {
    const statuses: Record<string, StepStatus> = {};
    for (const step of steps) {
        statuses[step.key] = "pending";
    }
    return statuses;
}

function ElapsedTimer({ startTime }: { startTime: number }) {
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
        return () => clearInterval(interval);
    }, [startTime]);
    return <span className="font-mono text-[10px] text-accent/60 ml-2">{elapsed}s</span>;
}

export default function NewProjectPage() {
    const router = useRouter();
    const [repoUrl, setRepoUrl] = useState("");
    const [prdFile, setPrdFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Pipeline options
    const [options, setOptions] = useState<PipelineOptionsState>({
        security_scan: true,
        quality_scan: true,
        generate_tests: false,
        auto_fix: false,
    });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    const initialSteps = buildPipelineSteps(options);
    const [pipeline, setPipeline] = useState<PipelineState>({
        steps: initialSteps,
        stepStatuses: getInitialStepStatuses(initialSteps),
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
        logMessages: [],
        stepStartTimes: {},
        stepDurations: {},
        activeStepMessage: null,
    });

    useEffect(() => {
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, []);

    const markStep = useCallback((step: string, status: StepStatus) => {
        setPipeline((prev) => {
            // Never revert a completed step back to active
            if (status === "active" && prev.stepStatuses[step] === "done") return prev;

            const newState: Partial<PipelineState> = {
                stepStatuses: { ...prev.stepStatuses, [step]: status },
            };

            if (status === "active") {
                newState.stepStartTimes = { ...prev.stepStartTimes, [step]: Date.now() };
                newState.activeStepMessage = null;
            }

            if (status === "done" && prev.stepStartTimes[step]) {
                newState.stepDurations = {
                    ...prev.stepDurations,
                    [step]: Date.now() - prev.stepStartTimes[step],
                };
            }

            return { ...prev, ...newState };
        });
    }, []);

    const markStepsDoneBefore = useCallback((targetStep: string) => {
        setPipeline((prev) => {
            const newStatuses = { ...prev.stepStatuses };
            const newDurations = { ...prev.stepDurations };
            const now = Date.now();
            for (const step of prev.steps) {
                if (step.key === targetStep) break;
                if (newStatuses[step.key] !== "error" && newStatuses[step.key] !== "done") {
                    newStatuses[step.key] = "done";
                    if (prev.stepStartTimes[step.key] && !newDurations[step.key]) {
                        newDurations[step.key] = now - prev.stepStartTimes[step.key];
                    }
                }
            }
            return { ...prev, stepStatuses: newStatuses, stepDurations: newDurations };
        });
    }, []);

    const setError = useCallback((step: string, message: string) => {
        setPipeline((prev) => ({
            ...prev,
            stepStatuses: { ...prev.stepStatuses, [step]: "error" },
            errorMessage: message,
            isRunning: false,
        }));
    }, []);

    // Map SSE analysis status to our step keys
    const mapAnalysisStatus = (status: string): string | null => {
        const mapping: Record<string, string> = {
            // Only backend-controlled steps — frontend manages create_project, upload_prd, trigger_analysis
            understanding_code: "understanding_code",
            building_graph: "building_graph",
            scanning_security: "scanning_security",
            scanning_quality: "scanning_quality",
            generating_tests: "generating_tests",
            running_tests: "running_tests",
            generating_test_files: "generating_test_files",
            complete: "complete",
        };
        return mapping[status] ?? null;
    };

    // Steps managed by handleSubmit — SSE/polling must never override these
    const FRONTEND_MANAGED_STEPS = new Set(["create_project", "upload_prd", "trigger_analysis"]);

    const canSubmit = repoUrl.trim().length > 0 && (!options.generate_tests || prdFile !== null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;

        setIsLoading(true);
        const steps = buildPipelineSteps(options);
        setPipeline({
            steps,
            stepStatuses: getInitialStepStatuses(steps),
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
            logMessages: [],
            stepStartTimes: {},
            stepDurations: {},
            activeStepMessage: null,
        });

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

            setPipeline((prev) => ({ ...prev, projectId, projectName, techStack }));
            markStep("create_project", "done");
        } catch (err) {
            setError("create_project", err instanceof Error ? err.message : "Failed to create project");
            setIsLoading(false);
            return;
        }

        // ── Step 2: Upload PRD (only if generate_tests) ──
        if (options.generate_tests && prdFile) {
            markStep("upload_prd", "active");

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
                const requirementCount = uploadData.requirements?.length ?? 0;
                setPipeline((prev) => ({ ...prev, requirementCount }));
                markStep("upload_prd", "done");
            } catch (err) {
                setError("upload_prd", err instanceof Error ? err.message : "Failed to upload PRD");
                setIsLoading(false);
                return;
            }
        }

        // ── Step 3: Trigger Analysis ──
        markStep("trigger_analysis", "active");

        let runId: string;
        let sseUrl: string;

        try {
            const analyzeRes = await fetch(`/api/projects/${projectId}/analyze`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    security_scan: options.security_scan,
                    quality_scan: options.quality_scan,
                    generate_tests: options.generate_tests,
                    auto_fix: options.auto_fix,
                }),
            });

            if (!analyzeRes.ok) {
                const err = await analyzeRes.json().catch(() => ({}));
                throw new Error(err.error || `Failed to trigger analysis (HTTP ${analyzeRes.status})`);
            }

            const analyzeData = await analyzeRes.json();
            runId = analyzeData.run_id;
            sseUrl = analyzeData.sse_url;

            setPipeline((prev) => ({ ...prev, runId }));
            markStep("trigger_analysis", "done");
        } catch (err) {
            setError("trigger_analysis", err instanceof Error ? err.message : "Failed to trigger analysis");
            setIsLoading(false);
            return;
        }

        // ── Step 4: Stream progress via SSE ──
        markStep("understanding_code", "active");

        try {
            const eventSource = new EventSource(sseUrl);
            eventSourceRef.current = eventSource;

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === "status_change" && data.status) {
                        const stepKey = mapAnalysisStatus(data.status);
                        if (stepKey && !FRONTEND_MANAGED_STEPS.has(stepKey)) {
                            markStepsDoneBefore(stepKey);
                            if (stepKey === "complete") {
                                markStep("complete", "done");
                            } else {
                                markStep(stepKey, "active");
                            }
                        }
                    }

                    if (data.type === "complete") {
                        setPipeline((prev) => {
                            const newStatuses = { ...prev.stepStatuses };
                            for (const step of prev.steps) {
                                if (newStatuses[step.key] !== "error") {
                                    newStatuses[step.key] = "done";
                                }
                            }
                            return {
                                ...prev,
                                stepStatuses: newStatuses,
                                healthScore: data.health_score ?? prev.healthScore,
                                isRunning: false,
                                isComplete: true,
                            };
                        });
                        eventSource.close();
                        eventSourceRef.current = null;
                        setIsLoading(false);
                        fetchFindings(projectId, runId);
                    }

                    if (data.type === "error") {
                        const failingStep = mapAnalysisStatus(data.status || "") || "understanding_code";
                        setError(failingStep, data.message || "Analysis failed");
                        eventSource.close();
                        eventSourceRef.current = null;
                        setIsLoading(false);
                    }

                    if (data.type === "log" && data.log) {
                        const newLog = data.log as PipelineLogEvent;
                        setPipeline((prev) => {
                            if (prev.logMessages.some((l) => l.id === newLog.id)) return prev;
                            return {
                                ...prev,
                                logMessages: [...prev.logMessages, newLog],
                                activeStepMessage: newLog.message,
                            };
                        });
                    }
                } catch {
                    // Ignore SSE parse errors
                }
            };

            eventSource.onerror = () => {
                eventSource.close();
                eventSourceRef.current = null;
                startPolling(projectId, runId);
            };
        } catch {
            startPolling(projectId, runId);
        }
    };

    // Polling fallback
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastLogTimestampRef = useRef<string>("1970-01-01T00:00:00Z");

    const startPolling = useCallback((projectId: string, runId: string) => {
        if (pollIntervalRef.current) return;

        let pollCount = 0;
        const maxPolls = 120;

        pollIntervalRef.current = setInterval(async () => {
            pollCount++;
            if (pollCount > maxPolls) {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
                setError("understanding_code", "Analysis timed out");
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
                    if (stepKey && !FRONTEND_MANAGED_STEPS.has(stepKey)) {
                        markStepsDoneBefore(stepKey);
                        if (stepKey === "complete") {
                            markStep("complete", "done");
                        } else {
                            markStep(stepKey, "active");
                        }
                    }
                }

                // Poll pipeline logs for sub-step messages
                try {
                    const logRes = await fetch(
                        `/api/projects/${projectId}/logs?run_id=${runId}&after=${encodeURIComponent(lastLogTimestampRef.current)}`
                    );
                    if (logRes.ok) {
                        const logData = await logRes.json();
                        if (logData.logs && logData.logs.length > 0) {
                            setPipeline((prev) => {
                                const existingIds = new Set(prev.logMessages.map((l: PipelineLogEvent) => l.id));
                                const newLogs = (logData.logs as PipelineLogEvent[]).filter((l) => !existingIds.has(l.id));
                                if (newLogs.length === 0) return prev;
                                return {
                                    ...prev,
                                    logMessages: [...prev.logMessages, ...newLogs],
                                    activeStepMessage: newLogs[newLogs.length - 1].message,
                                };
                            });
                            lastLogTimestampRef.current = logData.logs[logData.logs.length - 1].created_at;
                        }
                    }
                } catch {
                    // Non-critical: keep polling status even if logs fail
                }

                if (status === "complete") {
                    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;

                    setPipeline((prev) => {
                        const newStatuses = { ...prev.stepStatuses };
                        for (const step of prev.steps) {
                            if (newStatuses[step.key] !== "error") {
                                newStatuses[step.key] = "done";
                            }
                        }
                        return {
                            ...prev,
                            stepStatuses: newStatuses,
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
                    setError("understanding_code", data.run?.error_message || "Analysis failed");
                    setIsLoading(false);
                }
            } catch {
                // Keep polling on network errors
            }
        }, 3000);
    }, [markStep, markStepsDoneBefore, setError]);

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
        disabled,
    }: {
        label: string;
        description: string;
        isEnabled: boolean;
        onToggle: () => void;
        disabled?: boolean;
    }) => (
        <div className={`flex items-center justify-between py-4 border-b border-border last:border-0 ${disabled ? "opacity-50" : ""}`}>
            <div>
                <div className="font-body text-sm text-mm-text font-medium">{label}</div>
                <div className="font-mono text-[10px] text-mm-muted mt-0.5 uppercase tracking-wider">
                    {description}
                </div>
            </div>
            {/* ✅ FIX: cursor-pointer on toggle */}
            <div
                onClick={disabled ? undefined : onToggle}
                className={`relative w-10 h-5 rounded-full border transition-all duration-200 ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${isEnabled ? "bg-accent/20 border-accent/50" : "bg-surface3 border-border2"}`}
            >
                <div
                    className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all duration-200 ${isEnabled ? "bg-accent left-5" : "bg-mm-muted left-0.5"}`}
                />
            </div>
        </div>
    );

    return (
        <AppLayout>
            <div className="max-w-2xl mx-auto py-12 px-8 cursor-auto">
                <Link
                    href="/dashboard"
                    className="font-mono text-[10px] text-mm-muted hover:text-mm-text transition-colors duration-200 uppercase tracking-[0.2em] font-bold inline-flex items-center gap-2 cursor-pointer"
                >
                    &larr; Back to Dashboard
                </Link>

                <div className="mt-8 mb-10">
                    <h1 className="font-display font-extrabold text-3xl text-mm-text tracking-tight uppercase">
                        New Project
                    </h1>
                    <p className="font-body text-mm-muted text-sm mt-1">
                        Connect a GitHub repo and configure the analysis pipeline.
                    </p>
                </div>

                {/* Form Card */}
                {!showPipeline && (
                    <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-8 shadow-xl shadow-black/20">

                        {/* SECTION 1: Repo URL */}
                        <div className="mb-8">
                            <label className="font-mono text-[10px] text-mm-muted uppercase tracking-[0.2em] font-bold mb-3 block">
                                GitHub Repository URL
                            </label>
                            {/* ✅ FIX: cursor-text on input */}
                            <input
                                type="text"
                                value={repoUrl}
                                onChange={(e) => setRepoUrl(e.target.value)}
                                placeholder="github.com/owner/repository"
                                className="w-full bg-surface2 border border-border2 rounded-xl px-4 py-3.5 font-mono text-sm text-mm-text placeholder:text-mm-subtle focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all duration-200 cursor-text"
                                required
                            />
                            <p className="font-mono text-[10px] text-mm-subtle mt-2 uppercase tracking-wide">
                                Must be a public repository
                            </p>
                        </div>

                        <div className="border-t border-border my-8" />

                        {/* SECTION 2: Pipeline Options */}
                        <div className="mb-8">
                            <label className="font-mono text-[10px] text-mm-muted uppercase tracking-[0.2em] font-bold mb-4 block">
                                Pipeline Configuration
                            </label>

                            <ToggleRow
                                label="Code Graph"
                                description="Analyze module dependencies and architecture (always on)"
                                isEnabled={true}
                                onToggle={() => {}}
                                disabled
                            />
                            <ToggleRow
                                label="Security Scan"
                                description="Run Semgrep SAST scanner for vulnerabilities"
                                isEnabled={options.security_scan}
                                onToggle={() => setOptions((o) => ({ ...o, security_scan: !o.security_scan }))}
                            />
                            <ToggleRow
                                label="Quality Scan"
                                description="Run SonarCloud analysis for code quality"
                                isEnabled={options.quality_scan}
                                onToggle={() => setOptions((o) => ({ ...o, quality_scan: !o.quality_scan }))}
                            />
                            <ToggleRow
                                label="Generate Tests"
                                description="Create test cases from PRD (requires PRD upload)"
                                isEnabled={options.generate_tests}
                                onToggle={() => {
                                    setOptions((o) => ({ ...o, generate_tests: !o.generate_tests }));
                                    if (options.generate_tests) setPrdFile(null);
                                }}
                            />
                            <ToggleRow
                                label="Auto-Fix"
                                description="Automatically fix security and quality issues and create a PR"
                                isEnabled={options.auto_fix}
                                onToggle={() => setOptions((o) => ({ ...o, auto_fix: !o.auto_fix }))}
                            />
                        </div>

                        {/* Auto-fix info banner */}
                        {options.auto_fix && (
                            <div className="mb-8 p-4 bg-accent/5 border border-accent/20 rounded-xl">
                                <div className="font-mono text-[10px] text-accent uppercase tracking-wider font-bold mb-1">
                                    Auto-Fix Enabled
                                </div>
                                <div className="font-mono text-[10px] text-mm-muted">
                                    Security and quality issues will be automatically fixed after analysis.
                                    A pull request will be created with all fixes via the DevSentinel bot.
                                </div>
                            </div>
                        )}

                        {/* SECTION 3: PRD Upload (conditional) */}
                        {options.generate_tests && (
                            <>
                                <div className="border-t border-border my-8" />
                                <div className="mb-8">
                                    <label className="font-mono text-[10px] text-mm-muted uppercase tracking-[0.2em] font-bold mb-3 block">
                                        Product Requirements Document
                                        <span className="text-red-400 ml-1">*</span>
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
                                        className={`w-full border-2 border-dashed border-border2 rounded-xl p-10 text-center cursor-pointer hover:border-accent/40 hover:bg-accent/5 transition-all duration-200 ${prdFile ? "bg-accent/5 border-accent/30" : ""}`}
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
                                                    className="text-red-400 text-[10px] font-mono hover:text-red-300 mt-4 uppercase tracking-[0.2em] font-bold cursor-pointer"
                                                >
                                                    Remove File
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading || !canSubmit}
                            className={`w-full py-4 px-6 rounded-xl bg-accent text-white font-body font-bold text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-xl shadow-accent/20 flex items-center justify-center ${isLoading || !canSubmit ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-accent2 hover:shadow-accent2/30 transform hover:-translate-y-0.5"}`}
                        >
                            {isLoading ? (
                                <div className="flex items-center gap-3">
                                    <LoadingSpinner size="sm" />
                                    <span>Setting up project...</span>
                                </div>
                            ) : (
                                "Run Pipeline &rarr;"
                            )}
                        </button>
                    </form>
                )}

                {/* Pipeline Progress View */}
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
                                        <p className="font-mono text-[10px] text-mm-muted">{repoUrl}</p>
                                    </div>
                                </div>
                                {pipeline.techStack.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {pipeline.techStack.map((tech) => (
                                            <span key={tech} className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface3 border border-border2 text-mm-muted uppercase tracking-wider">
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
                            {pipeline.steps.map((step, idx) => {
                                const status = pipeline.stepStatuses[step.key] || "pending";
                                const isLast = idx === pipeline.steps.length - 1;

                                return (
                                    <div key={step.key} className="flex gap-4">
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
                                                {status === "active" && <div className="w-2 h-2 rounded-full bg-accent" />}
                                                {status === "error" && (
                                                    <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                )}
                                                {status === "pending" && <div className="w-1.5 h-1.5 rounded-full bg-border2" />}
                                            </div>
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
                                                {status === "active" && pipeline.stepStartTimes[step.key] && (
                                                    <ElapsedTimer startTime={pipeline.stepStartTimes[step.key]} />
                                                )}
                                                {status === "done" && pipeline.stepDurations[step.key] && (
                                                    <span className="font-mono text-[10px] text-green-400/60 ml-2">
                                                        {Math.round(pipeline.stepDurations[step.key] / 1000)}s
                                                    </span>
                                                )}
                                            </div>
                                            <div className="font-mono text-[10px] text-mm-muted mt-0.5">
                                                {step.description}
                                            </div>
                                            {status === "active" && pipeline.activeStepMessage && (
                                                <div className="font-mono text-[10px] text-accent/70 mt-1 animate-pulse">
                                                    {pipeline.activeStepMessage}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Pipeline Logs */}
                        {pipeline.logMessages.length > 0 && (
                            <details className="mt-6">
                                <summary className="font-mono text-[10px] text-mm-muted uppercase tracking-[0.2em] font-bold cursor-pointer hover:text-mm-text transition-colors">
                                    Pipeline Logs ({pipeline.logMessages.length})
                                </summary>
                                <div className="mt-2 max-h-64 overflow-y-auto bg-surface2 border border-border2 rounded-xl p-3 space-y-1">
                                    {pipeline.logMessages.map((log) => (
                                        <div key={log.id} className="font-mono text-[10px] flex gap-2">
                                            <span className="text-mm-subtle shrink-0">
                                                {new Date(log.created_at).toLocaleTimeString()}
                                            </span>
                                            <span className={`shrink-0 uppercase font-bold ${
                                                log.level === "error" ? "text-red-400"
                                                    : log.level === "warn" ? "text-yellow-400"
                                                    : "text-mm-muted"
                                            }`}>
                                                [{log.step}{log.sub_step ? `:${log.sub_step}` : ""}]
                                            </span>
                                            <span className="text-mm-text">{log.message}</span>
                                            {log.metadata && typeof log.metadata === "object" && "duration_ms" in log.metadata && (
                                                <span className="text-accent/60 shrink-0">
                                                    {Math.round((log.metadata.duration_ms as number) / 1000)}s
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </details>
                        )}

                        {/* Error */}
                        {pipeline.errorMessage && (
                            <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                                <div className="font-mono text-[10px] text-red-400 uppercase tracking-wider font-bold mb-1">Error</div>
                                <div className="font-mono text-xs text-red-300">{pipeline.errorMessage}</div>
                                <button
                                    onClick={() => {
                                        const steps = buildPipelineSteps(options);
                                        setPipeline({
                                            steps,
                                            stepStatuses: getInitialStepStatuses(steps),
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
                                            logMessages: [],
                                            stepStartTimes: {},
                                            stepDurations: {},
                                            activeStepMessage: null,
                                        });
                                        setIsLoading(false);
                                    }}
                                    className="mt-3 font-mono text-[10px] text-red-400 hover:text-red-300 uppercase tracking-[0.2em] font-bold cursor-pointer"
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

                                {pipeline.healthScore !== null && (
                                    <div className="mb-6">
                                        <div className="flex items-end gap-3 mb-2">
                                            <span
                                                className={`font-display font-extrabold text-4xl tracking-tight ${
                                                    pipeline.healthScore >= 70 ? "text-green-400"
                                                        : pipeline.healthScore >= 40 ? "text-yellow-400"
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
                                                    pipeline.healthScore >= 70 ? "bg-green-500"
                                                        : pipeline.healthScore >= 40 ? "bg-yellow-500"
                                                        : "bg-red-500"
                                                }`}
                                                style={{ width: `${pipeline.healthScore}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {pipeline.totalTests > 0 && (
                                    <div className="grid grid-cols-3 gap-4 mb-6">
                                        <div className="bg-surface2 border border-border2 rounded-xl p-4 text-center">
                                            <div className="font-display font-extrabold text-2xl text-mm-text">{pipeline.totalTests}</div>
                                            <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider mt-1">Total Tests</div>
                                        </div>
                                        <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 text-center">
                                            <div className="font-display font-extrabold text-2xl text-green-400">{pipeline.passed}</div>
                                            <div className="font-mono text-[10px] text-green-400/70 uppercase tracking-wider mt-1">Passed</div>
                                        </div>
                                        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-center">
                                            <div className="font-display font-extrabold text-2xl text-red-400">{pipeline.failed}</div>
                                            <div className="font-mono text-[10px] text-red-400/70 uppercase tracking-wider mt-1">Failed</div>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={() => router.push(`/project/${pipeline.projectId}`)}
                                    className="w-full py-4 px-6 rounded-xl bg-accent text-white font-body font-bold text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-xl shadow-accent/20 hover:bg-accent2 hover:shadow-accent2/30 transform hover:-translate-y-0.5 cursor-pointer"
                                >
                                    View Detailed Results &rarr;
                                </button>

                                <button
                                    onClick={() => router.push("/dashboard")}
                                    className="w-full mt-3 py-3 px-6 rounded-xl bg-surface2 border border-border2 text-mm-muted font-mono text-[10px] uppercase tracking-[0.2em] font-bold hover:border-border hover:text-mm-text transition-all duration-200 cursor-pointer"
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
