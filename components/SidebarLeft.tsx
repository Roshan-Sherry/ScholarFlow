
import React, { useState, useRef, useEffect } from 'react';
import {
    Settings, ArrowLeft, Upload, X, PanelRightClose, PanelLeftClose,
    Bot, BookOpen, PlusCircle, CheckSquare, Square, MoreVertical, Activity, PenTool
} from 'lucide-react';
import { AppMode, ViewState, Project, ProjectAsset, ProjectFile, AgentState, AgentLog } from '../types';
import { AgentAvatar } from './AgentAvatar';

interface SidebarLeftProps {
    appMode: AppMode;
    viewState: ViewState;
    setAppMode: (mode: AppMode) => void;
    onBackToDiscovery: () => void;
    onBackToDashboard: () => void;
    activeProject: Project | null;
    onOpenPaper: (id: string) => void;
    selectedContextIds: Set<string>;
    onToggleContext: (id: string) => void;
    onCloseMobile?: () => void;

    // Modals
    onOpenAssetModal: () => void;
    onOpenPdfModal: () => void;

    onAnalyzeAsset: (asset: ProjectAsset) => void;
    onCollapse: () => void;
    isCollapsed: boolean;
    position?: 'left' | 'right';

    // File System Props
    files?: ProjectFile[];
    activeFileId?: string;
    onFileSelect?: (id: string) => void;
    onCreateFile?: (name: string, parentId?: string) => void;
    onCreateFolder?: (name: string, parentId?: string) => void;
    onDeleteFile?: (id: string) => void;

    // Agent State
    agentState?: AgentState;
    setAgentState?: (state: AgentState) => void;
    addAgentLog?: (source: AgentLog['source'], message: string, status?: AgentLog['status']) => void;
    logs?: AgentLog[];
    pendingMessage?: string | null;
    onClearPendingMessage?: () => void;
}

export const SidebarLeft: React.FC<SidebarLeftProps> = ({
    appMode,
    viewState,
    setAppMode,
    onBackToDashboard,
    onBackToDiscovery,
    activeProject,
    onOpenPaper,
    selectedContextIds,
    onToggleContext,
    onCloseMobile,
    onOpenAssetModal,
    onOpenPdfModal,
    onCollapse,
    position = 'left',

    agentState = AgentState.IDLE,
    logs = [],
}) => {

    const isStudio = appMode === AppMode.STUDIO;
    // Use real papers from the project, initialized empty if null
    const projectPapers = activeProject?.papers || [];

    // Auto-Pilot State (Local for visual toggle)
    const [isAutoPilot, setIsAutoPilot] = useState(true);

    // Tooltip State
    const [hoveredPaper, setHoveredPaper] = useState<{ id: string, top: number, left: number } | null>(null);
    const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll logs
    useEffect(() => {
        if (logsEndRef.current && isStudio) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, isStudio]);

    const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>, id: string) => {
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        if (window.innerWidth < 1024) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const left = position === 'left' ? rect.right + 12 : undefined;
        setHoveredPaper({ id, top: rect.top, left: left || 0 });
    };

    const handleMouseLeave = () => {
        hoverTimeout.current = setTimeout(() => { setHoveredPaper(null); }, 50);
    };

    // Derived Assets
    const activePaper = hoveredPaper ? projectPapers.find(p => p.id === hoveredPaper.id) : null;
    const activePaperSummary = activePaper?.summary || 'No summary available';

    // Dynamic Border Class based on position
    const borderClass = position === 'left' ? 'border-r' : 'border-l';

    return (
        <>
            <aside className={`h-full flex flex-col ${borderClass} transition-colors duration-500 z-20 ${isStudio ? 'bg-black border-gray-800 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>

                {/* Header */}
                <div className={`h-12 flex items-center justify-between px-4 border-b border-inherit gap-3 bg-inherit shrink-0 ${position === 'right' ? 'flex-row-reverse' : ''}`}>
                    <div className="flex-1 flex items-center gap-3 overflow-hidden">
                        <button
                            onClick={onBackToDashboard}
                            className="p-1.5 hover:bg-gray-200/50 dark:hover:bg-gray-800 rounded-md transition-colors group"
                            title="Back to Dashboard"
                        >
                            <ArrowLeft className="w-4 h-4 opacity-70 group-hover:opacity-100" />
                        </button>
                        <div className={`flex-1 overflow-hidden ${isStudio ? 'text-left' : 'text-right'}`}>
                            <div className="text-[10px] font-semibold opacity-50 uppercase tracking-wider truncate">
                                {isStudio ? 'AGENT MONITOR' : 'CONTEXT'}
                            </div>
                            <div className="font-bold text-xs truncate">{activeProject?.title || 'Untitled'}</div>
                        </div>
                    </div>

                    <div className="flex items-center pl-2">
                        <button onClick={onCollapse} className="hidden lg:block p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title="Collapse Sidebar">
                            {position === 'left' ? <PanelLeftClose className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={onCloseMobile}
                            className="lg:hidden p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* --- STUDIO MODE: MONITOR + ACTIONS --- */}
                {isStudio && (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

                        {/* 1. MONITOR SECTION */}
                        <div className="shrink-0 bg-[#0a0a0a] flex flex-col items-center pt-6 pb-2">
                            <div className="transform scale-90 -my-2">
                                <AgentAvatar state={agentState} />
                            </div>
                            {/* Scrolling Console Logs */}
                            <div className="w-full h-48 overflow-y-auto px-4 py-2 font-mono text-[10px] space-y-2 mt-4">
                                {logs.length === 0 ? (
                                    <div className="text-gray-600 italic text-center mt-4 opacity-50">System Idle.</div>
                                ) : (
                                    logs.map(log => (
                                        <div key={log.id} className="text-green-500/90 leading-tight animate-in fade-in slide-in-from-left-1 border-l-2 border-green-500/20 pl-2 py-0.5">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="opacity-50">{log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                                <span className="opacity-70 uppercase tracking-wider text-[9px]">[{log.source}]</span>
                                            </div>
                                            <div className={log.source === 'Thought' ? 'text-amber-500 italic' : ''}>{log.message}</div>
                                        </div>
                                    ))
                                )}
                                <div ref={logsEndRef} />
                            </div>
                            {/* Gradient Fade for Logs */}
                            <div className="w-full h-8 -mt-8 bg-gradient-to-t from-black to-transparent pointer-events-none relative z-10" />
                        </div>

                        {/* 2. ACTIONS SECTION */}
                        <div className="p-4 space-y-3 shrink-0 border-t border-gray-800/50">
                            <button
                                onClick={() => setIsAutoPilot(!isAutoPilot)}
                                className={`w-full flex items-center justify-center gap-2 px-3 py-3 text-xs font-bold uppercase tracking-wide rounded-lg transition-all border ${isAutoPilot
                                    ? 'bg-[#1e1b4b] border-indigo-500/50 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                                    : 'bg-transparent border-gray-700 text-gray-500 hover:text-gray-300'
                                    }`}
                            >
                                <Bot className={`w-3.5 h-3.5 ${isAutoPilot ? 'text-indigo-400' : ''}`} />
                                Auto-Pilot: {isAutoPilot ? 'ON' : 'OFF'}
                            </button>
                            <button
                                onClick={() => onOpenAssetModal()}
                                className="w-full flex items-center justify-center gap-2 px-3 py-3 text-xs font-bold uppercase tracking-wide rounded-lg transition-all bg-[#15803d] hover:bg-[#166534] text-white shadow-lg shadow-green-900/20 border border-green-600"
                            >
                                <Upload className="w-3.5 h-3.5" />
                                Upload Asset
                            </button>
                        </div>

                    </div>
                )}

                {/* --- RESEARCH MODE: LIBRARY --- */}
                {!isStudio && (
                    <div className="flex-1 overflow-y-auto mt-0 space-y-4 pt-2">
                        <div className="p-3 pb-0 space-y-2 shrink-0">
                            <button
                                onClick={() => onOpenPdfModal()}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide rounded-md transition-all bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 hover:border-gray-300"
                            >
                                <Upload className="w-3 h-3" />
                                Upload PDF
                            </button>
                            {viewState === ViewState.READING && (
                                <button
                                    onClick={onBackToDiscovery}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide rounded-md text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all"
                                >
                                    <ArrowLeft className="w-3 h-3" />
                                    Back to Search
                                </button>
                            )}
                        </div>

                        <div className="space-y-2 pb-20 px-3">
                            <div className="flex items-center justify-between px-2 mb-2 text-gray-500">
                                <span className="font-bold text-[10px] uppercase tracking-wider">Library ({projectPapers.length})</span>
                                {selectedContextIds.size > 0 && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold">{selectedContextIds.size} Active</span>}
                            </div>
                            {projectPapers.length === 0 ? (
                                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2"><PlusCircle className="w-4 h-4 text-gray-400" /></div>
                                    <p className="text-xs text-gray-500 font-medium">Library is empty.</p>
                                    <p className="text-[10px] text-gray-400 mt-1">Upload PDFs or Search to add.</p>
                                </div>
                            ) : (
                                <>
                                    {projectPapers.map(paper => {
                                        const isSelected = selectedContextIds.has(paper.id);
                                        return (
                                            <div
                                                key={paper.id}
                                                onMouseEnter={(e) => handleMouseEnter(e, paper.id)}
                                                onMouseLeave={handleMouseLeave}
                                                className={`group relative flex items-start gap-3 p-3 rounded-xl border transition-all hover:shadow-md cursor-default ${isSelected ? 'bg-indigo-50/50 border-indigo-200' : 'bg-white border-transparent hover:border-gray-200'}`}
                                            >
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onToggleContext(paper.id); }}
                                                    className="mt-1 shrink-0 text-gray-300 hover:text-indigo-600 transition-colors"
                                                    title={isSelected ? "Remove from Context" : "Add to Context"}
                                                >
                                                    {isSelected ? <CheckSquare className="w-4 h-4 text-indigo-600 fill-indigo-50" /> : <Square className="w-4 h-4" />}
                                                </button>
                                                <div className="flex-1 cursor-pointer min-w-0" onClick={() => { console.log('Opening paper:', paper.id, paper.title); onOpenPaper(paper.id); }}>
                                                    <div className={`font-medium text-sm leading-tight truncate ${isSelected ? 'text-indigo-900' : 'text-gray-700'}`}>{paper.title}</div>
                                                    <div className="text-xs text-gray-500 mt-1 truncate">
                                                        {Array.isArray(paper.authors) && paper.authors.length > 0 ? paper.authors[0] : 'Unknown Author'} • {paper.year || 'Year N/A'}
                                                    </div>
                                                </div>
                                                <button className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600"><MoreVertical className="w-3 h-3" /></button>
                                                {isSelected && <div className="absolute left-0 top-3 bottom-3 w-1 bg-indigo-500 rounded-r-full" />}
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Mode Switcher / Bottom Actions */}
                <div className="p-4 border-t border-inherit bg-inherit shrink-0">
                    <button
                        onClick={() => setAppMode(isStudio ? AppMode.RESEARCH : AppMode.STUDIO)}
                        className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${isStudio
                            ? 'bg-[#18181b] text-gray-400 border border-gray-800 hover:bg-gray-800 hover:text-white hover:border-gray-700'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        {isStudio ? <><BookOpen className="w-4 h-4" /> Switch to Research</> : <><PenTool className="w-4 h-4" /> Switch to Studio</>}
                    </button>
                </div>

                {/* User Profile */}
                <div className="p-4 pt-2 border-t border-transparent flex items-center gap-3 bg-inherit mb-safe shrink-0">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-xs">JD</div>
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold dark:text-gray-200 truncate">Jane Doe</div>
                        <div className="text-[10px] opacity-60">Pro Plan</div>
                    </div>
                    <Settings className="w-4 h-4 opacity-50 cursor-pointer hover:opacity-100" />
                </div>

            </aside>

            {/* Tooltip */}
            {hoveredPaper && activePaperSummary && (
                <div
                    className="fixed z-[100] w-72 p-4 bg-gray-900/95 backdrop-blur-sm text-white text-xs rounded-xl shadow-2xl pointer-events-none animate-in fade-in zoom-in-95 slide-in-from-left-2 duration-200 border border-white/10 hidden lg:block"
                    style={{ top: hoveredPaper.top, left: hoveredPaper.left }}
                >
                    <div className="font-bold mb-2 text-indigo-300 uppercase tracking-widest text-[10px]">Paper Summary</div>
                    <div className="leading-relaxed opacity-90 font-light">{activePaperSummary}</div>
                    <div className="absolute top-6 -left-1.5 w-3 h-3 bg-gray-900/95 border-l border-b border-white/10 rotate-45 transform" />
                </div>
            )}
        </>
    );
};
