"use client";

import React from "react";

interface Project {
    id: string;
    name: string;
    repo: string;
    lastRun: string;
    status: "success" | "running" | "failed" | "idle";
    prCount: number;
    openIssues: number;
}

interface ProjectCardProps {
    project: Project;
}

const StatusBadge: React.FC<{ status: Project["status"] }> = ({ status }) => {
    const styles = {
        success: "bg-green-500/10 border-green-500/20 text-green-400",
        running: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
        failed: "bg-red-500/10 border-red-500/20 text-red-400",
        idle: "bg-surface3 border-border text-mm-muted",
    };

    const labels = {
        success: "Done",
        running: "Running",
        failed: "Failed",
        idle: "Idle",
    };

    return (
        <div
            className={`font-mono text-[10px] px-2.5 py-1 rounded-full border flex items-center gap-1.5 uppercase tracking-wider ${styles[status]}`}
        >
            <div
                className={`w-1.5 h-1.5 rounded-full ${status === "success"
                        ? "bg-green-400"
                        : status === "running"
                            ? "bg-yellow-400 animate-pulse"
                            : status === "failed"
                                ? "bg-red-400"
                                : "bg-mm-muted"
                    }`}
            />
            {labels[status]}
        </div>
    );
};

const ProjectCard: React.FC<ProjectCardProps> = ({ project }) => {
    return (
        <div className="bg-surface border border-border rounded-xl p-5 hover:border-border2 hover:bg-surface2 transition-all duration-200 cursor-pointer group flex flex-col h-full">
            <div className="flex items-start justify-between mb-1">
                <h3 className="font-mono font-semibold text-sm text-mm-text group-hover:text-accent transition-colors">
                    {project.name}
                </h3>
                <StatusBadge status={project.status} />
            </div>

            <p className="font-mono text-[10px] text-mm-muted mb-4 truncate" title={project.repo}>
                {project.repo}
            </p>

            <div className="flex gap-4 mt-auto">
                <div className="font-mono text-[10px]">
                    <span className="text-mm-subtle uppercase tracking-tighter">PRs Opened: </span>
                    <span className="text-mm-text font-medium">{project.prCount}</span>
                </div>
                <div className="font-mono text-[10px]">
                    <span className="text-mm-subtle uppercase tracking-tighter">Open Issues: </span>
                    <span className="text-mm-text font-medium">{project.openIssues}</span>
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                <span className="font-mono text-[10px] text-mm-muted">
                    Last run: {project.lastRun}
                </span>
                <span className="font-mono text-[10px] text-accent font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    Run agent →
                </span>
            </div>
        </div>
    );
};

export default ProjectCard;
