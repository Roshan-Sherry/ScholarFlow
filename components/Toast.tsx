import React from 'react';
import { useToastStore, ToastType } from '../stores/toastStore';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
};

const bgColors = {
    success: 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800',
    error: 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800',
    warning: 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800',
    info: 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800',
};

export const ToastContainer: React.FC = () => {
    const { toasts, removeToast } = useToastStore();

    return (
        <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 max-w-sm w-full">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`
            flex items-start gap-3 p-4 rounded-lg shadow-lg border animate-in slide-in-from-right-full duration-300
            ${bgColors[toast.type]}
            backdrop-blur-sm
          `}
                >
                    <div className="flex-shrink-0 mt-0.5">{icons[toast.type]}</div>
                    <div className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">
                        {toast.message}
                    </div>
                    <button
                        onClick={() => removeToast(toast.id)}
                        className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}
        </div>
    );
};
