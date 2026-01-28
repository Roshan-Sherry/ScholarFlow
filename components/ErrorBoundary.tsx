import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallbackComponent?: ReactNode;
    onReset?: () => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors in child components and displays a fallback UI
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Error Boundary caught an error:', error, errorInfo);
        this.setState({
            error,
            errorInfo,
        });
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
        this.props.onReset?.();
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallbackComponent) {
                return this.props.fallbackComponent;
            }

            return (
                <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg p-8 max-w-2xl w-full">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Something went wrong</h2>
                                <p className="text-sm text-gray-500">
                                    The application encountered an unexpected error
                                </p>
                            </div>
                        </div>

                        {this.state.error && (
                            <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
                                <p className="text-sm font-mono text-red-600 mb-2">
                                    {this.state.error.toString()}
                                </p>
                                {process.env.NODE_ENV !== 'production' && this.state.errorInfo && (
                                    <details className="mt-2">
                                        <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                                            Error Details
                                        </summary>
                                        <pre className="text-xs text-gray-600 mt-2 overflow-auto max-h-60">
                                            {this.state.errorInfo.componentStack}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={this.handleReset}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Try Again
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                            >
                                Reload Page
                            </button>
                        </div>

                        <p className="text-xs text-gray-500 mt-4">
                            If this problem persists, please contact support or check the browser console for more details.
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
