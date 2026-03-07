"use client";

import React from "react";
import Link from "next/link";

interface Project {
    id: string;
    name: string;
    repo_url: string;
    repo_owner: string;
    repo_name: string;
    status: "created" | "analyzing" | "analyzed" | "fixing" | "error";
    health_score: number | null;
    tech_stack: string[];
    created_at: string;
    updated_at: string;
}

interface ProjectCardProps {
    project: Project;
}

const statusConfig: Record<
    Project["status"],
    { label: string; style: string; dotColor: string; animate?: boolean }
> = {
    analyzed: {
        label: "Done",
        style: "bg-green-500/10 border-green-500/20 text-green-400",
        dotColor: "bg-green-400",
    },
    analyzing: {
        label: "Running",
        style: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
        dotColor: "bg-yellow-400",
        animate: true,
    },
    fixing: {
        label: "Fixing",
        style: "bg-blue-500/10 border-blue-500/20 text-blue-400",
        dotColor: "bg-blue-400",
        animate: true,
    },
    error: {
        label: "Failed",
        style: "bg-red-500/10 border-red-500/20 text-red-400",
        dotColor: "bg-red-400",
    },
    created: {
        label: "Idle",
        style: "bg-surface3 border-border text-mm-muted",
        dotColor: "bg-mm-muted",
    },
};

function getTimeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;

    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return "just now";

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;

    return new Date(dateStr).toLocaleDateString();
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project }) => {
    const config = statusConfig[project.status] || statusConfig.created;
    const timeAgo = getTimeAgo(project.updated_at);

    return (
        <Link href={`/project/${project.id}`}>
            <div className="bg-surface border border-border rounded-xl p-5 hover:border-border2 hover:bg-surface2 transition-all duration-200 cursor-pointer group flex flex-col h-full">
                <div className="flex items-start justify-between mb-1">
                    <h3 className="font-mono font-semibold text-sm text-mm-text group-hover:text-accent transition-colors">
                        {project.name}
                    </h3>
                    <div
                        className={`font-mono text-[10px] px-2.5 py-1 rounded-full border flex items-center gap-1.5 uppercase tracking-wider ${config.style}`}
                    >
                        <div
                            className={`w-1.5 h-1.5 rounded-full ${config.dotColor} ${config.animate ? "animate-pulse" : ""}`}
                        />
                        {config.label}
                    </div>
                </div>

                <p className="font-mono text-[10px] text-mm-muted mb-3 truncate" title={project.repo_url}>
                    {project.repo_url}
                </p>

                {/* Tech stack tags */}
                {project.tech_stack?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {project.tech_stack.slice(0, 4).map((tech) => (
                            <span
                                key={tech}
                                className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-surface3 border border-border2 text-mm-subtle uppercase tracking-wider"
                            >
                                {tech}
                            </span>
                        ))}
                        {project.tech_stack.length > 4 && (
                            <span className="font-mono text-[9px] text-mm-subtle">
                                +{project.tech_stack.length - 4}
                            </span>
                        )}
                    </div>
                )}

                {/* Health score */}
                <div className="flex gap-4 mt-auto">
                    {project.health_score !== null && (
                        <div className="font-mono text-[10px]">
                            <span className="text-mm-subtle uppercase tracking-tighter">Health: </span>
                            <span
                                className={`font-medium ${
                                    project.health_score >= 70
                                        ? "text-green-400"
                                        : project.health_score >= 40
                                        ? "text-yellow-400"
                                        : "text-red-400"
                                }`}
                            >
                                {project.health_score}%
                            </span>
                        </div>
                    )}
                </div>

                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                    <span className="font-mono text-[10px] text-mm-muted">
                        {timeAgo}
                    </span>
                    <span className="font-mono text-[10px] text-accent font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        View &rarr;
                    </span>
                </div>
            </div>
        </Link>
    );
};

export default ProjectCard;
