"use client";

import React from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import ProjectCard from "@/components/dashboard/ProjectCard";

const MOCK_PROJECTS = [
    {
        id: "1",
        name: "api-server",
        repo: "github.com/acehack/api-server",
        lastRun: "2 hours ago",
        status: "success" as const,
        prCount: 12,
        openIssues: 3,
    },
    {
        id: "2",
        name: "frontend-app",
        repo: "github.com/acehack/frontend-app",
        lastRun: "1 day ago",
        status: "idle" as const,
        prCount: 4,
        openIssues: 8,
    },
    {
        id: "3",
        name: "auth-service",
        repo: "github.com/acehack/auth-service",
        lastRun: "5 min ago",
        status: "running" as const,
        prCount: 7,
        openIssues: 1,
    },
];

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
    return (
        <AppLayout>
            <div className="p-8 max-w-7xl mx-auto">
                {/* Header row */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                    <div>
                        <h1 className="font-display font-extrabold text-3xl text-mm-text tracking-tight mb-1">
                            Dashboard
                        </h1>
                        <p className="font-body text-mm-muted text-sm">
                            3 projects · 2 agents available
                        </p>
                    </div>
                    <Link
                        href="/project/new"
                        className="bg-accent text-white font-body font-bold text-xs uppercase tracking-widest px-6 py-3 rounded-lg hover:bg-accent2 transition-all duration-200 shadow-lg shadow-accent/20 text-center"
                    >
                        + New Project
                    </Link>
                </div>

                {/* Stats strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                    <StatsItem value="23" label="Total PRs Opened" />
                    <StatsItem value="19" label="Issues Resolved" />
                    <StatsItem value="87s" label="Avg Time" />
                    <StatsItem value="2" label="Active Agents" />
                </div>

                {/* Section label */}
                <div className="font-mono text-[10px] text-mm-muted uppercase tracking-[0.2em] font-bold mb-6">
                    Your Projects
                </div>

                {/* Project cards grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {MOCK_PROJECTS.map((project) => (
                        <ProjectCard key={project.id} project={project} />
                    ))}
                </div>
            </div>
        </AppLayout>
    );
}
