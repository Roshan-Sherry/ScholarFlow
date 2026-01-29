import React, { useRef, useEffect, useState } from 'react';
import { AppMode, AgentState, AgentLog, Project, ProjectAsset, OutlineSection, ViewState } from '../types';
import { Activity, X, PanelLeftClose, PanelRightClose, Terminal, Cpu, Zap, Send, Loader2, FileImage, Table, Wand2, Database, Check, RefreshCw, ChevronDown, ChevronRight, MessageSquare, Sparkles, Eraser, PlayCircle, PenTool, BookOpen, Library, Quote } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';
// import { MOCK_PAPERS } from '../constants'; (Removed)
import Markdown from 'react-markdown';
import { useStreamingChat, useStreamingDraft } from '../hooks/useStreaming';

interface SidebarRightProps {
    appMode: AppMode;
    viewState?: ViewState;
    activePaper?: string | null;
    agentState: AgentState;
    setAgentState?: (state: AgentState) => void;
    logs: AgentLog[];
    addAgentLog?: (source: AgentLog['source'], message: string, status?: AgentLog['status']) => void;
    onCloseMobile?: () => void;
    onCollapse?: () => void;
    position?: 'left' | 'right';

    // Co-Author Props (Studio Mode)
    activeProject?: Project | null;
    activeFileContent?: string;
    onUpdateSection?: (sectionTitle: string, content: string, mode: 'append' | 'replace') => void;
    onAnalyzeAsset?: (asset: ProjectAsset) => void;
    pendingMessage?: string | null;
    onClearPendingMessage?: () => void;
    selectedContextIds?: Set<string>; // Paper IDs selected for context
}

export const SidebarRight: React.FC<SidebarRightProps> = ({
    appMode,
    viewState,
    activePaper,
    agentState,
    setAgentState,
    logs,
    addAgentLog,
    onCloseMobile,
    onCollapse,
    position = 'right',

    // Co-Author Props
    activeProject,
    activeFileContent = '',
    onUpdateSection,
    onAnalyzeAsset,
    pendingMessage,
    onClearPendingMessage,
    selectedContextIds = new Set()
}) => {

    const isStudio = appMode === AppMode.STUDIO;
    const isReading = viewState === ViewState.READING;

    // --- MONITOR STATE ---
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logsEndRef.current && !isStudio && !isReading) {
            setTimeout(() => {
                logsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }, 50);
        }
    }, [logs, isStudio, isReading]);


    // --- CO-AUTHOR STATE ---
    // Unified Tabs: 'PLAN' (Structure & Drafting), 'LIBRARY' (Sources), 'ASSETS' (Data)
    const [activeTab, setActiveTab] = useState<'PLAN' | 'LIBRARY' | 'ASSETS' | null>('PLAN');

    const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'agent', text: string }[]>([]);
    const [chatInput, setChatInput] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Plan/Structure State
    const [outline, setOutline] = useState<OutlineSection[]>([]);
    const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
    const [draftingSectionId, setDraftingSectionId] = useState<string | null>(null);
    const [draftingAssetIds, setDraftingAssetIds] = useState<Set<string>>(new Set());
    const [assetPromptSectionId, setAssetPromptSectionId] = useState<string | null>(null);
    const [isAutoWriting, setIsAutoWriting] = useState(false);

    // Rewrite/Review State (Integrated into Plan Items)
    const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
    const [isRewriting, setIsRewriting] = useState(false);
    const [rewriteSuggestion, setRewriteSuggestion] = useState<string | null>(null);
    const [rewriteInstruction, setRewriteInstruction] = useState('');

    const projectPapers = activeProject?.papers || [];

    // --- PDF CHAT STATE ---
    const [pdfChatInput, setPdfChatInput] = useState('');
    const [pdfChatMessages, setPdfChatMessages] = useState<{ role: 'user' | 'agent', text: string }[]>([]);
    const pdfChatEndRef = useRef<HTMLDivElement>(null);

    // Initialize PDF Chat when entering reading mode
    useEffect(() => {
        if (!isStudio && isReading && activePaper) {
            // Find paper in active project or known papers (if we had a global store), for now rely on project
            const paper = activeProject?.papers.find(p => p.id === activePaper) || { title: 'this paper' };

            // Only add initial message if empty
            setPdfChatMessages(prev => {
                if (prev.length === 0) {
                    return [{ role: 'agent', text: `I'm ready to discuss "**${paper?.title}**". Ask me about its methodology, results, or conclusions.` }];
                }
                return prev;
            });
        } else if (!isReading) {
            setPdfChatMessages([]); // Reset when leaving reading mode
        }
    }, [isStudio, isReading, activePaper, activeProject]);

    useEffect(() => {
        pdfChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [pdfChatMessages, isReading]);

    // --- CO-AUTHOR LOGIC ---

    // Initialization
    useEffect(() => {
        if (isStudio) {
            if (chatMessages.length === 0) {
                setChatMessages([{ role: 'agent', text: 'I am in Agentic Mode. Generate a plan to start auto-drafting your paper.' }]);
            }
        }
    }, [isStudio]);

    // Sync Plan with Editor Content
    // This ensures that if a user manually adds a header, it shows up in the plan,
    // AND it detects which plan items have been written.
    useEffect(() => {
        if (activeTab === 'PLAN' && activeFileContent) {
            const regex = /^## (.*)$/gm;
            const foundHeaders: string[] = [];
            let match;
            while ((match = regex.exec(activeFileContent)) !== null) {
                foundHeaders.push(match[1].trim());
            }

            setOutline(prevOutline => {
                // 1. Mark existing outline items as completed if header found
                const updated = prevOutline.map(item => {
                    const isPresent = foundHeaders.some(h => h.toLowerCase() === item.title.toLowerCase());
                    return isPresent ? { ...item, status: 'completed' as const } : item;
                });

                // 2. (Optional) Add manual headers to outline if not present?
                // For now, we keeps it simple: Plan drives the bus.
                return updated;
            });
        }
    }, [activeFileContent, activeTab]);

    // Handle External Triggers
    useEffect(() => {
        if (pendingMessage) {
            handleSendMessage(pendingMessage);
            if (onClearPendingMessage) onClearPendingMessage();
        }
    }, [pendingMessage]);

    // Auto-scroll Chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages, activeTab]);


    const toggleTab = (tab: 'PLAN' | 'LIBRARY' | 'ASSETS') => {
        if (activeTab === tab) setActiveTab(null); // Toggle off to maximize chat
        else setActiveTab(tab);
    };

    // --- HOOKS ---
    const { streamChat, isStreaming: isChatStreaming } = useStreamingChat();
    const { streamDraft, isStreaming: isDraftStreaming } = useStreamingDraft();

    // --- ACTIONS ---

    const handleSendMessage = async (textOverride?: string) => {
        const text = textOverride || chatInput;
        if (!text.trim()) return;

        if (!textOverride) setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', text }]);

        // Agent state is handled by the hook via store, but we can sync local thinking state if needed
        // The hook updates the global agentStore logs and status.

        if (activeProject) {
            try {
                // Use selected papers from Library tab, or all project papers if none selected
                const paperIds = selectedContextIds.size > 0
                    ? Array.from(selectedContextIds)
                    : (activeProject.papers || []).map(p => p.id);

                // Use selected assets if any
                const assetIds = draftingAssetIds.size > 0
                    ? Array.from(draftingAssetIds)
                    : [];

                await streamChat({
                    project_id: activeProject.id,
                    message: text,
                    selected_paper_ids: paperIds,
                    lab_asset_ids: assetIds
                },
                    undefined, // We don't need intermediate chunks for chat UI if we trust the store/logs? 
                    // Actually getting the chunks to display in CHAT UI is important.
                    (fullText) => {
                        setChatMessages(prev => [...prev, { role: 'agent', text: fullText }]);
                    });
            } catch (e) {
                console.error(e);
            }
        }
    };

    const handlePdfChatSubmit = async () => {
        if (!pdfChatInput.trim() || !activePaper) return;
        const text = pdfChatInput;
        setPdfChatInput('');
        setPdfChatMessages(prev => [...prev, { role: 'user', text }]);

        if (activeProject) {
            try {
                await streamChat({
                    project_id: activeProject.id,
                    message: text,
                    selected_paper_ids: [activePaper],
                    lab_asset_ids: []
                },
                    undefined,
                    (fullText) => {
                        setPdfChatMessages(prev => [...prev, { role: 'agent', text: fullText }]);
                    });
            } catch (e) {
                console.error(e);
            }
        }
    };

    const handleGenerateOutline = async () => {
        if (!activeProject) return;
        setIsGeneratingOutline(true);
        if (addAgentLog) addAgentLog('Co-Author', 'Auto-generating research plan...');

        try {
            // Trigger the planner via chat
            // Ideally we would have a dedicated endpoint or we parse the JSON from chat
            // For this refactor, we will simulate the outline generation using the chat stream 
            // but prompting for JSON.

            let accumulatedJson = "";
            await streamChat({
                project_id: activeProject.id,
                message: "Generate a detailed research outline for this project based on the uploaded papers. Return the response as a valid JSON array of objects with keys: id, title, description, relevantPaperIds (empty array), status ('pending'). Do not wrap in markdown blocks.",
                selected_paper_ids: activeProject.papers,
                lab_asset_ids: []
            },
                (chunk) => accumulatedJson += chunk,
                (fullText) => {
                    try {
                        // Clean potential markdown code blocks
                        const cleanJson = fullText.replace(/```json/g, '').replace(/```/g, '').trim();
                        const parsed: OutlineSection[] = JSON.parse(cleanJson);
                        // Ensure defaults
                        const validated = parsed.map((s, i) => ({
                            ...s,
                            id: s.id || `section-${Date.now()}-${i}`,
                            status: 'pending' as const,
                            relevantPaperIds: s.relevantPaperIds || [],
                            recommendedAssetTypes: s.recommendedAssetTypes || []
                        }));
                        setOutline(validated);
                        if (addAgentLog) addAgentLog('Co-Author', `Generated ${validated.length} sections.`, 'success');
                    } catch (e) {
                        console.error("Failed to parse outline JSON", e);
                        if (addAgentLog) addAgentLog('Co-Author', 'Failed to generate valid structure.', 'error');
                    }
                });

        } catch (e) { console.error(e); }
        finally { setIsGeneratingOutline(false); }
    };

    const executeDraftSection = async (section: OutlineSection) => {
        if (draftingSectionId || !onUpdateSection || !activeProject) return;
        setDraftingSectionId(section.id);
        setAssetPromptSectionId(null);
        if (addAgentLog) addAgentLog('Co-Author', `Drafting: ${section.title}...`);

        // Collect selected assets
        const selectedAssetIds = Array.from(draftingAssetIds);

        try {
            setOutline(prev => prev.map(s => s.id === section.id ? { ...s, status: 'drafting' } : s));

            let accumulatedText = "";

            await streamDraft({
                project_id: activeProject.id,
                message: `Draft section: ${section.title}. Description: ${section.description}`,
                selected_paper_ids: section.relevantPaperIds,
                lab_asset_ids: selectedAssetIds
            }, (chunk) => {
                accumulatedText += chunk;
                onUpdateSection(section.title, accumulatedText, 'replace');
            });

            setOutline(prev => prev.map(s => s.id === section.id ? { ...s, status: 'completed' } : s));
            if (addAgentLog) addAgentLog('Co-Author', `Finished ${section.title}.`, 'success');
        } catch (e) { console.error("Drafting failed", e); }
        finally { setDraftingSectionId(null); }
    };

    const handleAutoWriteAll = async () => {
        if (isAutoWriting) return;
        setIsAutoWriting(true);
        if (addAgentLog) addAgentLog('Co-Author', 'Starting Auto-Write Sequence...');

        const pendingSections = outline.filter(s => s.status === 'pending');

        for (const section of pendingSections) {
            await executeDraftSection(section);
            // Small pause between sections
            await new Promise(r => setTimeout(r, 1000));
        }

        setIsAutoWriting(false);
        if (addAgentLog) addAgentLog('Co-Author', 'Auto-Write Sequence Complete.', 'success');
    };

    const handleDraftClick = (section: OutlineSection) => {
        const recommendsAssets = section.recommendedAssetTypes && section.recommendedAssetTypes.length > 0;
        const hasSelection = draftingAssetIds.size > 0;
        const hasProjectAssets = activeProject?.assets && activeProject.assets.length > 0;

        // If assets are recommended but not selected, show selector
        if (recommendsAssets && !hasSelection && hasProjectAssets) {
            setAssetPromptSectionId(section.id);
        } else {
            executeDraftSection(section);
        }
    };

    const toggleAsset = (id: string) => {
        const newSet = new Set(draftingAssetIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setDraftingAssetIds(newSet);
    };

    // --- REWRITE / CRITIQUE LOGIC ---

    const getSectionContent = (title: string) => {
        if (!activeFileContent) return '';
        const regex = new RegExp(`## ${title}\\n([\\s\\S]*?)(?=\\n## |$)`);
        const match = activeFileContent.match(regex);
        return match ? match[1].trim() : '';
    };

    const handleCritique = (section: OutlineSection) => {
        handleSendMessage(`Critique the section "${section.title}" for clarity, academic tone, and logical flow.`);
    };

    const handleRewrite = async (section: OutlineSection, instruction: string) => {
        if (isRewriting || !instruction.trim() || !activeProject) return;
        setIsRewriting(true);
        setRewriteSuggestion("");

        const content = getSectionContent(section.title);
        if (!content) {
            setIsRewriting(false);
            return;
        }

        if (addAgentLog) addAgentLog('Co-Author', `Rewriting section: ${section.title}`);

        try {
            // Use streamChat for rewrite as it's a "chat" with a specific context
            let accumulated = "";
            await streamChat({
                project_id: activeProject.id,
                message: `Rewrite the following text based on this instruction: "${instruction}".\n\nText:\n${content}`,
                selected_paper_ids: [],
                lab_asset_ids: []
            }, (chunk) => {
                // We might not get chunks for chat stream in the same way, but let's assume valid
                // Actually streamChat hook callback is (chunk) => ... 
                // Wait, previous usage: (chunk) handling
            }, (fullText) => {
                setRewriteSuggestion(fullText);
            });
        } catch (e) {
            console.error(e);
        } finally {
            setIsRewriting(false);
        }
    };

    const applyRewrite = (section: OutlineSection) => {
        if (onUpdateSection && rewriteSuggestion) {
            onUpdateSection(section.title, rewriteSuggestion, 'replace');
            setRewriteSuggestion(null);
            setExpandedSectionId(null);
            if (addAgentLog) addAgentLog('Co-Author', `Applied changes to ${section.title}.`, 'success');
        }
    };


    // --- STYLING ---
    const borderClass = position === 'left' ? 'border-r' : 'border-l';
    const bgClass = isStudio ? `bg-black ${borderClass} border-gray-800` : `bg-gray-50 ${borderClass} border-gray-200`;
    const headerClass = isStudio ? 'text-gray-200 border-gray-800' : 'text-gray-800 border-gray-200';

    return (
        <aside className={`h-full flex flex-col transition-colors duration-500 z-30 shadow-xl ${bgClass}`}>

            {/* Header */}
            <div className={`flex items-center justify-between p-4 border-b ${headerClass} relative shrink-0 ${position === 'right' ? 'flex-row-reverse' : ''}`}>
                <div className="flex-1 flex items-center gap-2 justify-end min-w-0">
                    {isStudio ? (
                        <>
                            <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
                            <div className="flex flex-col items-end overflow-hidden">
                                <span className="font-bold text-xs uppercase tracking-widest whitespace-nowrap">Co-Author</span>
                                <span className="text-[9px] text-gray-500 font-bold truncate w-full text-right">{activeProject?.title}</span>
                            </div>
                        </>
                    ) : isReading ? (
                        <>
                            <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
                            <span className="font-bold text-xs uppercase tracking-widest truncate">Paper Chat</span>
                        </>
                    ) : (
                        <>
                            <Activity className="w-4 h-4 text-indigo-600 shrink-0" />
                            <span className="font-bold text-xs uppercase tracking-widest truncate">Agent Monitor</span>
                        </>
                    )}
                </div>

                <div className="flex items-center pl-2">
                    <button onClick={onCollapse} className="hidden lg:block p-1.5 hover:bg-gray-200/50 dark:hover:bg-gray-800 rounded-md transition-colors" title="Collapse">
                        {position === 'left' ? <PanelLeftClose className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
                    </button>
                    <button onClick={onCloseMobile} className="lg:hidden p-2 hover:bg-gray-200/50 dark:hover:bg-gray-800 rounded-md transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* --- STUDIO MODE: CO-AUTHOR WORKFLOWS --- */}
            {isStudio ? (
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden text-gray-300">

                    {/* 1. Context Selector Tabs */}
                    <div className="px-3 pt-3 pb-0 shrink-0">
                        <div className="grid grid-cols-3 gap-1 bg-[#18181b] rounded-lg p-1 border border-gray-800">
                            {['PLAN', 'LIBRARY', 'ASSETS'].map(tab => {
                                const isActive = activeTab === tab;
                                let Icon = PenTool;
                                if (tab === 'LIBRARY') Icon = Library;
                                if (tab === 'ASSETS') Icon = Database;

                                return (
                                    <button
                                        key={tab}
                                        onClick={() => toggleTab(tab as any)}
                                        className={`py-1.5 text-[10px] font-bold uppercase rounded transition-all flex items-center justify-center gap-1 ${isActive ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        <Icon className="w-3 h-3" />
                                        {tab}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* 2. Unified Workspace (Context + Chat) */}
                    <div className="flex-1 flex flex-col min-h-0 relative">

                        {/* A. Top Pane: Context Tool (Collapsible) */}
                        {activeTab && (
                            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 border-b border-gray-800 bg-black/50">

                                {/* PLAN & REVIEW VIEW */}
                                {activeTab === 'PLAN' && (
                                    <div className="space-y-3 pb-4">
                                        {outline.length === 0 ? (
                                            <div className="text-center py-6">
                                                <p className="text-[11px] text-gray-500 mb-4 leading-relaxed px-4">
                                                    Generate a plan based on your papers and assets to start drafting.
                                                </p>
                                                <button onClick={handleGenerateOutline} disabled={isGeneratingOutline} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20">
                                                    {isGeneratingOutline ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                                                    Generate Plan
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {/* Auto-Write Controls */}
                                                <div className="flex items-center justify-between px-1 mb-2">
                                                    <span className="text-[10px] font-bold text-gray-500 uppercase">Structure</span>
                                                    {!isAutoWriting && outline.some(s => s.status === 'pending') && (
                                                        <button
                                                            onClick={handleAutoWriteAll}
                                                            className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                                                        >
                                                            <PlayCircle className="w-3 h-3" /> Auto-Write All
                                                        </button>
                                                    )}
                                                    {isAutoWriting && (
                                                        <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 animate-pulse">
                                                            <PenTool className="w-3 h-3" /> Writing Paper...
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Sections List */}
                                                {outline.map((section, index) => {
                                                    const isDrafted = section.status === 'completed';
                                                    const isDraftingThis = draftingSectionId === section.id;
                                                    const isExpanded = expandedSectionId === section.id;

                                                    return (
                                                        <div key={section.id} className={`bg-[#111113] border transition-all rounded-lg overflow-hidden ${isDrafted ? 'border-indigo-500/30' : 'border-gray-800 hover:border-gray-700'}`}>

                                                            {/* Header */}
                                                            <div className="p-3">
                                                                <div className="flex items-start justify-between mb-2">
                                                                    <div>
                                                                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block mb-0.5">Section {index + 1}</span>
                                                                        <h4 className="text-sm font-bold text-gray-200 leading-tight flex items-center gap-2">
                                                                            {section.title}
                                                                            {isDrafted && <Check className="w-3 h-3 text-green-500" />}
                                                                        </h4>
                                                                    </div>
                                                                    {isDrafted ? (
                                                                        <button onClick={() => setExpandedSectionId(isExpanded ? null : section.id)} className="p-1 hover:bg-gray-800 rounded">
                                                                            {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                                                        </button>
                                                                    ) : (
                                                                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${isDraftingThis ? 'bg-indigo-500 animate-pulse' : 'bg-gray-700'}`} />
                                                                    )}
                                                                </div>

                                                                {/* Description (Only show if not drafted or if expanded) */}
                                                                {(!isDrafted || isExpanded) && (
                                                                    <p className="text-[10px] text-gray-500 mb-3 leading-relaxed border-l-2 border-gray-800 pl-2">
                                                                        {section.description}
                                                                    </p>
                                                                )}

                                                                {/* DRAFTING UI (If not drafted) */}
                                                                {!isDrafted && (
                                                                    <>
                                                                        {assetPromptSectionId === section.id ? (
                                                                            <div className="bg-black/40 rounded p-2 mb-2 border border-indigo-500/30 animate-in fade-in zoom-in-95">
                                                                                <div className="text-[9px] text-indigo-300 font-bold mb-2 flex items-center gap-1"><Database className="w-3 h-3" /> Select Assets</div>
                                                                                <div className="space-y-1 mb-2 max-h-24 overflow-y-auto">
                                                                                    {activeProject?.assets.map(asset => (
                                                                                        <div key={asset.id} className="flex items-center gap-2 text-[10px] text-gray-400 hover:text-white cursor-pointer" onClick={() => toggleAsset(asset.id)}>
                                                                                            <div className={`w-3 h-3 rounded border flex items-center justify-center ${draftingAssetIds.has(asset.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600'}`}>
                                                                                                {draftingAssetIds.has(asset.id) && <Check className="w-2 h-2 text-white" />}
                                                                                            </div>
                                                                                            <span className="truncate">{asset.name}</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                                <button onClick={() => executeDraftSection(section)} className="w-full py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold rounded">
                                                                                    Confirm & Write
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <button
                                                                                onClick={() => handleDraftClick(section)}
                                                                                disabled={draftingSectionId !== null || isAutoWriting}
                                                                                className={`w-full py-1.5 rounded text-[10px] font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors ${isDraftingThis ? 'bg-indigo-900/20 text-indigo-400' : 'bg-[#1e2025] text-gray-400 hover:bg-gray-800 hover:text-white border border-gray-800'
                                                                                    }`}
                                                                            >
                                                                                {isDraftingThis ? <Loader2 className="w-3 h-3 animate-spin" /> : <PenTool className="w-3 h-3" />}
                                                                                {isDraftingThis ? 'Drafting...' : 'Draft Section'}
                                                                            </button>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>

                                                            {/* REVIEW UI (If drafted & expanded) */}
                                                            {isDrafted && isExpanded && (
                                                                <div className="bg-black/20 border-t border-gray-800 p-3 space-y-3 animate-in slide-in-from-top-2">

                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Refine</span>
                                                                        <button
                                                                            onClick={() => handleCritique(section)}
                                                                            className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300"
                                                                        >
                                                                            <MessageSquare className="w-3 h-3" /> Critique
                                                                        </button>
                                                                    </div>

                                                                    <div className="flex gap-2">
                                                                        <button onClick={() => handleRewrite(section, "Improve academic tone")} className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] border border-gray-700 text-gray-300 hover:text-white transition-colors">
                                                                            Formal
                                                                        </button>
                                                                        <button onClick={() => handleRewrite(section, "Make it more concise")} className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] border border-gray-700 text-gray-300 hover:text-white transition-colors">
                                                                            Concise
                                                                        </button>
                                                                        <button onClick={() => executeDraftSection(section)} className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] border border-gray-700 text-gray-300 hover:text-white transition-colors flex items-center justify-center gap-1">
                                                                            <RefreshCw className="w-3 h-3" /> Regens
                                                                        </button>
                                                                    </div>

                                                                    <div className="relative">
                                                                        <input
                                                                            value={rewriteInstruction}
                                                                            onChange={(e) => setRewriteInstruction(e.target.value)}
                                                                            placeholder="Custom instruction..."
                                                                            className="w-full bg-[#111113] border border-gray-700 rounded p-2 text-xs text-gray-300 focus:border-indigo-500 outline-none pr-8"
                                                                            onKeyDown={(e) => e.key === 'Enter' && handleRewrite(section, rewriteInstruction)}
                                                                        />
                                                                        <button
                                                                            onClick={() => handleRewrite(section, rewriteInstruction)}
                                                                            disabled={!rewriteInstruction.trim() || isRewriting}
                                                                            className="absolute right-1.5 top-1.5 p-1 text-gray-500 hover:text-indigo-400 disabled:opacity-30"
                                                                        >
                                                                            {isRewriting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                                                                        </button>
                                                                    </div>

                                                                    {(isRewriting || rewriteSuggestion) && (
                                                                        <div className="mt-2 bg-black/40 rounded border border-indigo-500/30 p-2">
                                                                            <div className="flex justify-between items-center mb-1">
                                                                                <span className="text-[9px] text-indigo-300 font-bold uppercase">Suggestion</span>
                                                                                {!isRewriting && <button onClick={() => setRewriteSuggestion(null)} className="text-gray-500 hover:text-white"><X className="w-3 h-3" /></button>}
                                                                            </div>
                                                                            <div className="text-[10px] text-gray-300 font-mono bg-black/20 p-2 rounded mb-2 max-h-48 overflow-y-auto leading-relaxed border border-gray-800/50">
                                                                                {rewriteSuggestion || <Loader2 className="w-3 h-3 animate-spin mx-auto" />}
                                                                            </div>
                                                                            {!isRewriting && rewriteSuggestion && (
                                                                                <button onClick={() => applyRewrite(section)} className="w-full py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-[10px] font-bold flex items-center justify-center gap-2">
                                                                                    <Check className="w-3 h-3" /> Accept Changes
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* LIBRARY VIEW */}
                                {activeTab === 'LIBRARY' && (
                                    <div className="space-y-3 pb-4">
                                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1">Connected Papers ({projectPapers.length})</div>
                                        {projectPapers.length === 0 ? (
                                            <div className="text-center py-6 text-gray-600 italic text-xs border border-dashed border-gray-800 rounded">
                                                No papers connected to this project.
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {projectPapers.map(paper => (
                                                    <div key={paper.id} className="bg-[#18181b] border border-gray-800 rounded-lg p-3 hover:border-indigo-500/50 transition-colors group">
                                                        <div className="flex justify-between items-start gap-2">
                                                            <div className="min-w-0">
                                                                <div className="text-xs font-bold text-gray-300 leading-tight mb-1">{paper.title}</div>
                                                                <div className="text-[10px] text-gray-500">{paper.authors[0]} • {paper.year}</div>
                                                            </div>
                                                            <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={() => handleSendMessage(`What are the key findings of "${paper.title}"?`)}
                                                                    className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                                                                    title="Ask about this paper"
                                                                >
                                                                    <MessageSquare className="w-3 h-3" />
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        navigator.clipboard.writeText(`\\cite{${paper.id}}`);
                                                                        if (addAgentLog) addAgentLog('System', 'Citation copied to clipboard.');
                                                                    }}
                                                                    className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                                                                    title="Copy Citation Key"
                                                                >
                                                                    <Quote className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ASSETS VIEW */}
                                {activeTab === 'ASSETS' && (
                                    <div className="space-y-3 pb-4">
                                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1">Active Assets ({activeProject?.assets.length})</div>
                                        {activeProject?.assets.length === 0 ? (
                                            <div className="text-center py-6 text-gray-600 italic text-xs border border-dashed border-gray-800 rounded">
                                                No assets found.
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-2">
                                                {activeProject?.assets.map(asset => (
                                                    <div key={asset.id} className="bg-[#18181b] border border-gray-800 rounded-lg p-2 hover:border-indigo-500/50 transition-colors group cursor-pointer" onClick={() => onAnalyzeAsset && onAnalyzeAsset(asset)}>
                                                        <div className="aspect-square bg-black/40 rounded flex items-center justify-center mb-2 overflow-hidden">
                                                            {asset.type === 'image' ? <FileImage className="w-6 h-6 text-purple-400" /> : <Table className="w-6 h-6 text-emerald-400" />}
                                                        </div>
                                                        <div className="text-[10px] font-bold text-gray-300 truncate">{asset.name}</div>
                                                        <button className="w-full mt-2 py-1 bg-indigo-900/30 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded text-[9px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                                            Analyze
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* B. Bottom Pane: Chat (Always Visible, Height Adjusts) */}
                        <div className={`${activeTab ? 'h-[40%] border-t border-gray-800' : 'flex-1'} flex flex-col min-h-0 bg-[#0a0a0a] transition-all duration-300`}>
                            {/* Chat Messages */}
                            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                                {chatMessages.map((m, i) => (
                                    <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        <div className={`max-w-[95%] rounded-lg px-3 py-2 text-xs leading-relaxed ${m.role === 'user' ? 'bg-indigo-900/50 text-indigo-100 border border-indigo-500/30' : 'bg-gray-800 text-gray-300'}`}>
                                            {m.role === 'agent' ? <Markdown>{m.text}</Markdown> : m.text}
                                        </div>
                                    </div>
                                ))}
                                {agentState === AgentState.THINKING && (
                                    <div className="flex items-center gap-2 text-gray-500 text-xs italic">
                                        <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
                                    </div>
                                )}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Chat Input */}
                            <div className="p-2 border-t border-gray-800 bg-[#18181b] shrink-0">
                                <div className="relative">
                                    <input
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                        placeholder={activeTab ? `Discuss ${activeTab.toLowerCase()}...` : "Ask Co-Author..."}
                                        className="w-full bg-black border border-gray-700 rounded pl-3 pr-8 py-2 text-xs text-gray-300 focus:border-indigo-500 outline-none"
                                    />
                                    <button onClick={() => handleSendMessage()} className="absolute right-1.5 top-1.5 text-gray-500 hover:text-white">
                                        <Send className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            ) : isReading ? (
                // --- RESEARCH MODE: PDF CHAT ---
                <div className="flex-1 flex flex-col min-h-0 bg-white">
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {pdfChatMessages.map((m, i) => (
                            <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-[90%] rounded-2xl px-4 py-2 text-xs leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                                    {m.role === 'agent' ? <Markdown>{m.text}</Markdown> : m.text}
                                </div>
                            </div>
                        ))}
                        {agentState === AgentState.THINKING && (
                            <div className="flex items-center gap-2 text-gray-400 text-xs pl-2">
                                <Loader2 className="w-3 h-3 animate-spin" /> Analyzing paper...
                            </div>
                        )}
                        <div ref={pdfChatEndRef} />
                    </div>

                    <div className="p-3 border-t border-gray-100 bg-gray-50">
                        <div className="relative">
                            <input
                                value={pdfChatInput}
                                onChange={(e) => setPdfChatInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handlePdfChatSubmit()}
                                placeholder="Ask about this paper..."
                                className="w-full bg-white border border-gray-200 rounded-full pl-4 pr-10 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none shadow-sm"
                            />
                            <button
                                onClick={handlePdfChatSubmit}
                                disabled={!pdfChatInput.trim()}
                                className="absolute right-1.5 top-1.5 p-1.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:bg-gray-400 transition-colors"
                            >
                                <Send className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                // --- RESEARCH MODE: AGENT MONITOR ---
                <>
                    {/* Processor Visualization */}
                    <div className="p-4 border-b border-gray-200 bg-white flex flex-col items-center justify-center">
                        <div className="scale-75 transform -my-4">
                            <AgentAvatar state={agentState} />
                        </div>
                        {agentState !== AgentState.IDLE && (
                            <div className="mt-2 flex items-center gap-2 text-[10px] font-mono opacity-80 animate-pulse text-gray-500">
                                <Cpu className="w-3 h-3" />
                                <span>Processing context vectors...</span>
                            </div>
                        )}
                    </div>

                    {/* Logs / Stream */}
                    <div className="flex-1 flex flex-col min-h-0 relative">
                        <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-gray-50 to-transparent z-10 pointer-events-none" />
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-[11px]">
                            {logs.length === 0 ? (
                                <div className="text-center opacity-30 mt-10">
                                    <Terminal className="w-8 h-8 mx-auto mb-2" />
                                    <p>System Ready.</p>
                                </div>
                            ) : (
                                logs.map((log) => (
                                    <div key={log.id} className="animate-in fade-in slide-in-from-left-2 duration-300 group">
                                        <div className="flex items-center gap-2 opacity-50 mb-0.5">
                                            <span>{log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                            <span className="text-[9px] uppercase tracking-wider">[{log.source}]</span>
                                        </div>
                                        <div className={`pl-2 border-l-2 ${log.source === 'Thought' ? 'border-amber-500 text-amber-500 italic' :
                                            log.status === 'error' ? 'border-red-500 text-red-500' :
                                                log.status === 'success' ? 'border-green-500 text-green-500' :
                                                    'border-gray-300 text-gray-700'
                                            }`}>
                                            {log.source === 'Thought' && <Zap className="w-3 h-3 inline mr-1" />}
                                            {log.message}
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={logsEndRef} className="h-4" />
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none" />
                    </div>
                </>
            )}

        </aside>
    );
};
