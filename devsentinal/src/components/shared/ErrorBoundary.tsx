"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface ErrorFallbackProps {
    error: Error | null;
    resetError: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, resetError }) => {
    return (
        <div className="bg-surface border border-red-500/20 rounded-xl p-6">
            <div className="text-red-400 text-2xl mb-3">⚠</div>
            <h2 className="font-display font-bold text-mm-text text-lg mb-2">
                Something went wrong
            </h2>
            <div className="font-mono text-xs text-mm-muted bg-surface2 rounded-lg p-3 mb-4 break-all">
                {error?.message || "Unknown error"}
            </div>
            <button
                onClick={resetError}
                className="bg-accent/10 border border-accent/30 text-accent font-mono text-sm px-4 py-2 rounded-lg hover:bg-accent/20 transition-all duration-200"
            >
                Try again
            </button>
        </div>
    );
};

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    private resetError = () => {
        this.setState({ hasError: false, error: null });
    };

    public render() {
        if (this.state.hasError) {
            return <ErrorFallback error={this.state.error} resetError={this.resetError} />;
        }

        return this.props.children ? this.props.children : null;
    }
}

export { ErrorBoundary, ErrorFallback };
export default ErrorBoundary;
