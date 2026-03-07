"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

interface HeaderProps {
    projectName?: string;
}

const Header: React.FC<HeaderProps> = ({ projectName }) => {
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 40);
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <header
            className={`fixed top-0 left-0 right-0 h-[60px] z-[50] flex items-center justify-between px-6 transition-all duration-300 border-b ${isScrolled
                    ? "bg-bg/95 backdrop-blur-xl border-border shadow-lg"
                    : "bg-bg/80 backdrop-blur-xl border-border"
                }`}
        >
            {/* Left: Logo */}
            <Link href="/" className="flex items-center gap-2 group">
                <span className="font-display font-extrabold text-mm-text text-xl tracking-tight">
                    ⚡ Mini<span className="text-accent group-hover:text-accent2 transition-colors">Minions</span>
                </span>
            </Link>

            {/* Center: Breadcrumb */}
            {projectName && (
                <div className="hidden md:flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
                    <span className="text-mm-muted">Dashboard</span>
                    <span className="text-mm-subtle">/</span>
                    <span className="text-mm-text font-bold">{projectName}</span>
                </div>
            )}

            {/* Right: Status & User */}
            <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-mm-green font-mono text-[10px] px-3 py-1 rounded-full uppercase tracking-wider">
                    <div className="w-1.5 h-1.5 rounded-full bg-mm-green animate-pulse" />
                    Agent ready
                </div>

                <div className="w-8 h-8 rounded-full bg-surface3 border border-border2 flex items-center justify-center font-mono text-[10px] text-mm-muted cursor-pointer hover:border-accent/40 transition-colors">
                    AH
                </div>
            </div>
        </header>
    );
};

export default Header;
