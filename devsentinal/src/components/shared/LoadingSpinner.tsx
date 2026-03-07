"use client";

import React from "react";

interface LoadingSpinnerProps {
    size?: "sm" | "md" | "lg";
    label?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = "md", label }) => {
    const sizeClasses = {
        sm: "w-4 h-4",
        md: "w-8 h-8",
        lg: "w-12 h-12",
    };

    return (
        <div className="flex flex-col items-center justify-center">
            <div className={`relative ${sizeClasses[size]}`}>
                {/* Outer ring */}
                <div className="absolute inset-0 border-2 border-border2 rounded-full"></div>
                {/* Spinning arc */}
                <div className="absolute inset-0 border-t-2 border-accent rounded-full animate-spin"></div>
            </div>
            {label && (
                <span className="font-mono text-xs text-mm-muted mt-3">{label}</span>
            )}
        </div>
    );
};

export default LoadingSpinner;
