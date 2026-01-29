import React, { useState, useRef, useEffect } from 'react';
import { Search, Sparkles, ArrowUp, Check, Plus, Globe, BrainCircuit, Loader2, Layers, FileText, X, Table } from 'lucide-react';
import Markdown from 'react-markdown';
import { VIRTUAL_PROJECT_ID } from '../constants';
import { Paper, ResearchTurn, AgentState, AgentLog } from '../types';
import { useStreamingChat } from '../hooks/useStreaming';
import { addPaperToLibrary } from '../lib/api-client';

interface WorkspaceDiscoveryProps {
    onOpenPaper: (id: string) => void;
    onCreateCollection?: (papers: Paper[]) => void;
    onAddToProject: (id: string) => void;
    activeProjectPapers: string[];
    selectedContextIds: Set<string>;
    setAgentState: (state: AgentState) => void;
    agentState?: AgentState;
    addAgentLog: (source: AgentLog['source'], message: string, status?: AgentLog['status']) => void;
    logs?: AgentLog[];
    // Persistence Props
    turns: ResearchTurn[];
    setTurns: React.Dispatch<React.SetStateAction<ResearchTurn[]>>;
    selectedResultIds: Set<string>;
    setSelectedResultIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export const WorkspaceDiscovery: React.FC<WorkspaceDiscoveryProps> = ({
    onOpenPaper,
    onCreateCollection,
    onAddToProject,
    activeProjectPapers,
    selectedContextIds,
    setAgentState,
    agentState,
    addAgentLog,
    logs = [],
    turns,
    setTurns,
    selectedResultIds,
    setSelectedResultIds
}) => {
    const [query, setQuery] = useState('');
    const [knownPapers, setKnownPapers] = useState<Map<string, Paper>>(new Map());

    // Hook
    const { streamChat, isStreaming } = useStreamingChat();

    // Scroll Refs
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const bottomAnchorRef = useRef<HTMLDivElement>(null);

    // Auto-scroll logic
    const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
        if (bottomAnchorRef.current) {
            bottomAnchorRef.current.scrollIntoView({ behavior, block: 'end' });
        }
    };

    useEffect(() => {
        // Re-populate known papers map from turns if component re-mounts
        const map = new Map<string, Paper>();
        // MOCK_PAPERS.forEach(p => map.set(p.id, p)); // Always know mocks (Removed)
        turns.forEach(turn => {
            turn.sources?.forEach(p => map.set(p.id, p));
        });
        setKnownPapers(map);
    }, [turns]);

    useEffect(() => {
        // Scroll on new turns or when processing state changes
        if (isStreaming || turns.length > 0) {
            scrollToBottom();
        }
    }, [turns.length, isStreaming, selectedContextIds]);

    // Helper to update turns
    const updateTurn = (id: string, updates: Partial<ResearchTurn>) => {
        setTurns(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim() || isStreaming) return;

        const userQuery = query;
        setQuery('');

        // 1. Setup User Turn
        const newTurnId = Date.now().toString();
        const userTurn: ResearchTurn = {
            id: newTurnId + '_user',
            role: 'user',
            query: userQuery,
            status: 'completed',
            logs: []
        };

        // 2. Setup Agent Turn
        const agentTurnId = newTurnId + '_agent';
        const initialAgentTurn: ResearchTurn = {
            id: agentTurnId,
            role: 'agent',
            status: 'thinking',
            logs: [],
            sources: [] // Backend parsing of sources not yet implemented in streaming, keeping empty for now
        };

        setTurns(prev => [...prev, userTurn, initialAgentTurn]);

        try {
            let accumulatedAnswer = "";

            await streamChat({
                project_id: VIRTUAL_PROJECT_ID, // Virtual project ID for discovery
                message: userQuery,
                selected_paper_ids: Array.from(selectedContextIds),
                lab_asset_ids: []
            }, (chunk) => {
                // Text chunks
                accumulatedAnswer += chunk;
                updateTurn(agentTurnId, {
                    status: 'synthesizing',
                    answer: accumulatedAnswer
                });
            }, (fullText) => {
                // Complete
                updateTurn(agentTurnId, {
                    status: 'completed',
                    answer: fullText
                });
            }, async (papers) => {
                // NEW: Papers found callback - display discovered papers
                updateTurn(agentTurnId, {
                    sources: papers
                });

                // Add to known papers map for selection
                const updatedMap = new Map(knownPapers);
                papers.forEach((p: Paper) => updatedMap.set(p.id, p));
                setKnownPapers(updatedMap);

                // Automatically add papers to virtual library for persistence
                console.log('Adding papers to library:', papers.length);
                for (const paper of papers) {
                    try {
                        await addPaperToLibrary(VIRTUAL_PROJECT_ID, paper);
                        console.log('Added paper to library:', paper.title);
                    } catch (error) {
                        console.warn('Failed to add paper to library:', paper.title, error);
                        // Continue with other papers even if one fails
                    }
                }
            });

        } catch (error) {
            console.error("Search failed", error);
            updateTurn(agentTurnId, { status: 'completed', logs: ['Error connecting to agent network.'] });
        }
    };

    // Toggle selection for batch actions
    const toggleResultSelection = (paper: Paper) => {
        setSelectedResultIds(prev => {
            const next = new Set(prev);
            if (next.has(paper.id)) {
                next.delete(paper.id);
            } else {
                next.add(paper.id);
            }
            return next;
        });
    };

    // Trigger the "Wise-Base" style generation
    const handleGenerateCollection = async () => {
        if (!onCreateCollection) return;

        // Use backend generation if we have selected papers
        if (selectedResultIds.size > 0) {
            const papersToCompile = Array.from(selectedResultIds)
                .map(id => knownPapers.get(id))
                .filter((p): p is Paper => !!p);

            // Save papers to library before generating project
            // This happens in the parent (App.tsx) via generateProject API call
            // which now properly associates papers with the project

            onCreateCollection(papersToCompile);
            setSelectedResultIds(new Set());
        }
    };

    const handleComparisonTable = async () => {
        if (selectedResultIds.size === 0) return;

        const newTurnId = Date.now().toString() + '_compare';
        const initialAgentTurn: ResearchTurn = {
            id: newTurnId,
            role: 'agent',
            status: 'thinking',
            logs: [],
            sources: []
        };

        setTurns(prev => [...prev, initialAgentTurn]);

        try {
            const selectedPapers = Array.from(selectedResultIds).map(id => knownPapers.get(id));
            const prompt = `Create a comparison table for the following papers: ${selectedPapers.map(p => p?.title).join(', ')}. Compare them based on methodology, key findings, and limitations. Return the result as a Markdown table.`;

            let accumulatedAnswer = "";
            const payload = {
                project_id: VIRTUAL_PROJECT_ID,
                message: prompt,
                selected_paper_ids: Array.from(selectedResultIds),
                lab_asset_ids: []
            };
            await streamChat(payload, (chunk) => {
                accumulatedAnswer += chunk;
                updateTurn(newTurnId, { status: 'synthesizing', answer: accumulatedAnswer });
            }, (fullText) => {
                updateTurn(newTurnId, { status: 'completed', answer: fullText });
            });

            setSelectedResultIds(new Set());
        } catch (error) {
            console.error("Comparison failed", error);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-white relative">

            {/* Scrollable Chat Area */}
            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth pb-40" // Increased padding bottom for double bars
            >
                {turns.length === 0 ? (
                    // Empty State
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-6 min-h-[50vh]">
                        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center shadow-sm">
                            <Sparkles className="w-8 h-8 text-indigo-600" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Research Assistant</h1>
                            <p className="text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
                                {selectedContextIds.size > 0
                                    ? `Ask a question about the ${selectedContextIds.size} selected papers.`
                                    : "Search for topics to find papers, or select multiple results to generate a Literature Review."
                                }
                            </p>
                        </div>

                        {selectedContextIds.size === 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm max-w-2xl w-full">
                                <button onClick={() => setQuery("How does Chain-of-Thought prompting improve reasoning?")} className="p-4 border border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left text-gray-600 hover:text-indigo-700">
                                    "How does Chain-of-Thought prompting improve reasoning?"
                                </button>
                                <button onClick={() => setQuery("Summarize the architectural changes in Llama 2")} className="p-4 border border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left text-gray-600 hover:text-indigo-700">
                                    "Summarize the architectural changes in Llama 2"
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    // Chat Turns
                    turns.map((turn) => (
                        <div key={turn.id} className={`w-full max-w-4xl mx-auto flex gap-4 ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>

                            {/* Agent Avatar Icon */}
                            {turn.role === 'agent' && (
                                <div className="w-8 h-8 shrink-0 rounded-full bg-indigo-600 flex items-center justify-center text-white mt-1 shadow-md">
                                    <BrainCircuit className="w-4 h-4" />
                                </div>
                            )}

                            {/* Message Body */}
                            <div className={`flex-1 max-w-3xl ${turn.role === 'user' ? 'bg-gray-100 text-gray-900 px-5 py-3 rounded-2xl rounded-tr-sm' : ''}`}>

                                {/* User Query */}
                                {turn.role === 'user' && <div className="text-lg">{turn.query}</div>}

                                {/* Agent Response */}
                                {turn.role === 'agent' && (
                                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">

                                        {/* 1. Thinking / Activity Log */}
                                        {turn.status !== 'completed' && logs.length > 0 && (
                                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                                <div className="flex items-center gap-2 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                                    <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
                                                    {agentState === AgentState.THINKING ? 'Thinking...' : 'Working...'}
                                                </div>
                                                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                                    {logs.slice(-5).map((log, i) => (
                                                        <div key={log.id || i} className="flex items-start gap-2 text-sm text-gray-600 animate-in fade-in slide-in-from-left-1">
                                                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${log.source === 'Thought' ? 'bg-amber-500' : 'bg-indigo-500 animate-pulse'}`} />
                                                            <div className="flex-1">
                                                                <span className={`font-semibold text-xs opacity-70 uppercase mr-1 ${log.source === 'Thought' ? 'text-amber-600' : ''}`}>[{log.source}]</span>
                                                                <span className={log.source === 'Thought' ? 'text-amber-700 italic font-medium' : ''}>{log.message}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* 2. Found Sources (Selectable) - DISABLED IN REFACTOR UNTIL BACKEND SUPPORTS */}
                                        {turn.sources && turn.sources.length > 0 && (
                                            <div>
                                                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Globe className="w-4 h-4 text-gray-400" />
                                                        Found {turn.sources.length} Sources
                                                    </div>
                                                    <span className="text-[10px] text-gray-400 font-normal uppercase tracking-wide">
                                                        Select papers to create collection
                                                    </span>
                                                </h3>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    {turn.sources.map(paper => {
                                                        const isAdded = activeProjectPapers.includes(paper.id);
                                                        const isSelected = selectedResultIds.has(paper.id);

                                                        return (
                                                            <div
                                                                key={paper.id}
                                                                onClick={() => toggleResultSelection(paper)}
                                                                className={`group p-3 border rounded-lg transition-all cursor-pointer relative ${isSelected
                                                                    ? 'bg-indigo-50 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                                                                    : 'bg-white border-gray-200 hover:border-indigo-300 hover:shadow-md'
                                                                    }`}
                                                            >
                                                                {/* Selection Checkmark */}
                                                                {isSelected && (
                                                                    <div className="absolute -top-2 -right-2 bg-indigo-600 text-white rounded-full p-0.5 shadow-sm z-10">
                                                                        <Check className="w-3 h-3" />
                                                                    </div>
                                                                )}

                                                                <div className="flex justify-between items-start gap-2">
                                                                    <div className="text-sm font-bold text-gray-900 leading-tight mb-1 line-clamp-2">
                                                                        {paper.title}
                                                                    </div>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); onAddToProject(paper.id); }}
                                                                        disabled={isAdded}
                                                                        className={`shrink-0 p-1.5 rounded-md transition-colors z-10 ${isAdded ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400 hover:bg-indigo-600 hover:text-white'}`}
                                                                        title={isAdded ? "Added to Library" : "Add to Library"}
                                                                    >
                                                                        {isAdded ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                                                    </button>
                                                                </div>
                                                                <div className="text-xs text-gray-500 font-mono mb-2">{paper.authors[0]} • {paper.year}</div>
                                                                <div className="text-xs text-gray-600 line-clamp-2 leading-relaxed">{paper.summary}</div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* 3. Answer */}
                                        {turn.answer && (
                                            <div>
                                                {turn.sources && turn.sources.length > 0 && (
                                                    <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                                                        <Sparkles className="w-4 h-4 text-indigo-500" />
                                                        Synthesis
                                                    </h3>
                                                )}
                                                <div className="prose prose-sm max-w-none text-gray-800 leading-relaxed">
                                                    <Markdown components={{
                                                        p: ({ children }) => {
                                                            // Custom renderer to detect [n] patterns
                                                            return (
                                                                <p className="mb-4 last:mb-0">
                                                                    {React.Children.map(children, child => {
                                                                        if (typeof child === 'string') {
                                                                            // Regex to find [n] patterns
                                                                            const parts = child.split(/(\[\d+\])/g);
                                                                            return parts.map((part, index) => {
                                                                                const match = part.match(/^\[(\d+)\]$/);
                                                                                if (match) {
                                                                                    const citationIndex = parseInt(match[1]);
                                                                                    // Find the paper corresponding to this index (1-based)
                                                                                    // The 'sources' array in the turn typically maps 1:1 if we assume order
                                                                                    const paper = turn.sources && turn.sources[citationIndex - 1];

                                                                                    if (paper) {
                                                                                        return (
                                                                                            <span
                                                                                                key={index}
                                                                                                className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 ml-1 text-[10px] font-bold text-indigo-600 bg-indigo-100 rounded cursor-pointer hover:bg-indigo-200 transition-colors align-text-top"
                                                                                                onClick={() => onOpenPaper(paper.id)}
                                                                                                title={`View: ${paper.title}`}
                                                                                            >
                                                                                                {citationIndex}
                                                                                            </span>
                                                                                        );
                                                                                    }
                                                                                }
                                                                                return part;
                                                                            });
                                                                        }
                                                                        return child;
                                                                    })}
                                                                </p>
                                                            );
                                                        }
                                                    }}>
                                                        {turn.answer}
                                                    </Markdown>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
                {/* Anchor for auto-scrolling */}
                <div ref={bottomAnchorRef} className="h-4" />
            </div>

            {/* FIXED BOTTOM AREA */}
            <div className="absolute bottom-0 left-0 right-0 z-20">

                {/* A. Batch Action Bar (Appears when papers selected) */}
                {selectedResultIds.size > 0 && (
                    <div className="max-w-xl mx-auto mb-4 px-4 animate-in slide-in-from-bottom-6 fade-in duration-300">
                        <div className="bg-gray-900 text-white rounded-xl shadow-2xl p-3 flex items-center justify-between border border-gray-700">
                            <div className="flex items-center gap-3 px-2">
                                <div className="bg-indigo-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                                    {selectedResultIds.size}
                                </div>
                                <span className="text-sm font-medium">papers selected</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setSelectedResultIds(new Set())}
                                    className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                                    title="Clear Selection"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                                <div className="h-4 w-px bg-gray-700 mx-1"></div>

                                {/* Comparison Action */}
                                <button
                                    onClick={handleComparisonTable}
                                    className="flex items-center gap-2 px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
                                >
                                    <Table className="w-4 h-4" />
                                    Compare
                                </button>

                                <button
                                    onClick={handleGenerateCollection}
                                    className="flex items-center gap-2 px-4 py-2 bg-white text-gray-900 hover:bg-gray-200 rounded-lg text-sm font-bold transition-colors"
                                >
                                    <FileText className="w-4 h-4" />
                                    Generate Lit Review
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* B. Input Bar */}
                <div className="bg-white/80 backdrop-blur-md border-t border-gray-100 p-4 md:p-6">
                    <form onSubmit={handleSearch} className="max-w-4xl mx-auto relative group">
                        {selectedContextIds.size > 0 && (
                            <div className="absolute -top-10 left-0 bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-t-lg font-medium flex items-center gap-2 shadow-lg">
                                <Layers className="w-3 h-3" />
                                Talking to {selectedContextIds.size} Papers
                            </div>
                        )}

                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            {isStreaming ? (
                                <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                            ) : (
                                <Sparkles className="w-5 h-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                            )}
                        </div>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            disabled={isStreaming}
                            placeholder={selectedContextIds.size > 0 ? "Ask a question about the selected context..." : "Ask a question to start research or search for papers..."}
                            className={`w-full bg-white border border-gray-200 rounded-2xl py-4 pl-12 pr-14 shadow-lg shadow-gray-200/50 hover:shadow-xl focus:shadow-2xl focus:border-indigo-500 focus:outline-none transition-all text-base disabled:opacity-50 disabled:cursor-not-allowed ${selectedContextIds.size > 0 ? 'rounded-tl-none border-indigo-200 ring-1 ring-indigo-100' : ''}`}
                        />
                        <button
                            type="submit"
                            disabled={!query.trim() || isStreaming}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors disabled:opacity-0 disabled:scale-75 transform duration-200"
                        >
                            <ArrowUp className="w-5 h-5" />
                        </button>
                    </form>
                </div>
            </div>

        </div>
    );
};
