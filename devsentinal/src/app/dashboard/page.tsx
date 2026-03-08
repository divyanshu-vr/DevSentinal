"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import ProjectCard from "@/components/dashboard/ProjectCard";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

interface Project {
    id: string;
    name: string;
    repo_url: string;
    repo_owner: string;
    repo_name: string;
    branch: string;
    tech_stack: string[];
    status: "created" | "analyzing" | "analyzed" | "fixing" | "error";
    health_score: number | null;
    created_at: string;
    updated_at: string;
}

const StatsItem = ({ value, label }: { value: string; label: string }) => (
    <div className="bg-surface border border-border rounded-xl p-5 flex flex-col justify-center">
        <div className="font-display font-extrabold text-3xl text-mm-text tracking-tight uppercase">
            {value}
        </div>
        <div className="font-mono text-[10px] text-mm-muted mt-1 uppercase tracking-widest font-bold">
            {label}
        </div>
    </div>
);

export default function DashboardPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchProjects() {
            try {
                const res = await fetch("/api/projects");
                if (!res.ok) {
                    throw new Error("Failed to fetch projects");
                }
                const data = await res.json();
                setProjects(data.projects || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load projects");
            } finally {
                setLoading(false);
            }
        }

        fetchProjects();
    }, []);

    const analyzedCount = projects.filter((p) => p.status === "analyzed").length;
    const runningCount = projects.filter((p) => p.status === "analyzing" || p.status === "fixing").length;
    const avgHealth = projects.filter((p) => p.health_score !== null).length > 0
        ? Math.round(
              projects
                  .filter((p) => p.health_score !== null)
                  .reduce((sum, p) => sum + (p.health_score ?? 0), 0) /
              projects.filter((p) => p.health_score !== null).length
          )
        : null;

    return (
        // ✅ FIX: cursor-auto ensures cursor is always visible throughout the page
        <AppLayout>
            <div className="p-8 max-w-7xl mx-auto cursor-auto">
                {/* Header row */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                    <div>
                        <h1 className="font-display font-extrabold text-3xl text-mm-text tracking-tight mb-1">
                            Dashboard
                        </h1>
                        <p className="font-body text-mm-muted text-sm">
                            {loading
                                ? "Loading projects..."
                                : `${projects.length} project${projects.length !== 1 ? "s" : ""}`}
                        </p>
                    </div>
                    {/* ✅ FIX: cursor-pointer added on Link */}
                    <Link
                        href="/project/new"
                        className="bg-accent text-white font-body font-bold text-xs uppercase tracking-widest px-6 py-3 rounded-lg hover:bg-accent2 transition-all duration-200 shadow-lg shadow-accent/20 text-center cursor-pointer"
                    >
                        + New Project
                    </Link>
                </div>

                {/* Stats strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                    <StatsItem value={String(projects.length)} label="Total Projects" />
                    <StatsItem value={String(analyzedCount)} label="Analyzed" />
                    <StatsItem value={String(runningCount)} label="Running" />
                    <StatsItem value={avgHealth !== null ? `${avgHealth}%` : "--"} label="Avg Health" />
                </div>

                {/* Section label */}
                <div className="font-mono text-[10px] text-mm-muted uppercase tracking-[0.2em] font-bold mb-6">
                    Your Projects
                </div>

                {/* Loading state */}
                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <LoadingSpinner size="lg" label="Loading projects..." />
                    </div>
                )}

                {/* Error state */}
                {error && !loading && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                        <div className="font-mono text-sm text-red-400 mb-2">{error}</div>
                        {/* ✅ FIX: cursor-pointer added on button */}
                        <button
                            onClick={() => window.location.reload()}
                            className="font-mono text-[10px] text-mm-muted hover:text-mm-text uppercase tracking-[0.2em] font-bold cursor-pointer"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* Empty state */}
                {!loading && !error && projects.length === 0 && (
                    <div className="bg-surface border border-border rounded-2xl p-12 text-center">
                        <div className="font-mono text-4xl text-mm-subtle mb-4">+</div>
                        <div className="font-body text-sm text-mm-muted mb-2">
                            No projects yet
                        </div>
                        <div className="font-mono text-[10px] text-mm-subtle uppercase tracking-wider mb-6">
                            Create your first project to get started
                        </div>
                        {/* ✅ FIX: cursor-pointer added on Link */}
                        <Link
                            href="/project/new"
                            className="inline-block bg-accent text-white font-body font-bold text-xs uppercase tracking-widest px-6 py-3 rounded-lg hover:bg-accent2 transition-all duration-200 shadow-lg shadow-accent/20 cursor-pointer"
                        >
                            + New Project
                        </Link>
                    </div>
                )}

                {/* Project cards grid */}
                {!loading && !error && projects.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {projects.map((project) => (
                            <ProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
