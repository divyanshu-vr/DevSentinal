"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const Sidebar = () => {
    const pathname = usePathname();

    const navItems = [
        { label: "Dashboard", href: "/dashboard", icon: "▦" },
        { label: "New Project", href: "/project/new", icon: "+" },
        { label: "Settings", href: "/settings", icon: "⚙" },
    ];

    return (
        <aside className="fixed left-0 top-0 w-[220px] h-full bg-surface border-r border-border z-[40] pt-[60px] flex flex-col">
            <nav className="flex-1 mt-6">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-all duration-200 group ${isActive
                                    ? "bg-accent/10 border border-accent/20 text-mm-text"
                                    : "text-mm-muted hover:text-mm-text hover:bg-surface2"
                                }`}
                        >
                            <span
                                className={`font-mono text-sm w-5 text-center transition-colors ${isActive ? "text-accent" : "text-mm-muted group-hover:text-mm-text"
                                    }`}
                            >
                                {item.icon}
                            </span>
                            <span className="font-body text-sm font-medium">{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom section */}
            <div className="p-6">
                <div className="border-t border-border mb-4 pt-4">
                    <div className="font-mono text-[10px] text-mm-subtle uppercase tracking-widest leading-loose">
                        AceHack 5.0<br />
                        UEM Jaipur · 2026
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
