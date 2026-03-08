"use client";

import React from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { ErrorBoundary } from "../shared/ErrorBoundary";

interface AppLayoutProps {
    children: React.ReactNode;
    projectName?: string;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children, projectName }) => {
    return (
        <div className="min-h-screen bg-bg text-mm-text font-body antialiased">
            <Header projectName={projectName} />
            <div className="flex">
                <Sidebar />
                <main className="flex-1 ml-[220px] pt-[60px] min-h-screen bg-bg">
                    <ErrorBoundary>
                        {children}
                    </ErrorBoundary>
                </main>
            </div>
        </div>
    );
};

export default AppLayout;
