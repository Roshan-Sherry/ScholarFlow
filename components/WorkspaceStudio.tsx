
import React, { useState, useEffect, useRef } from 'react';
import {
    Download, RefreshCw, Maximize, Minimize,
    Bold, Italic, Heading1, List, Image as ImageIcon,
    Printer, Edit3, Check, X, Sparkles, PlusCircle, Trash2,
    LayoutTemplate, Upload, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Hash, Undo2, Redo2,
    PanelRightOpen, Code, FileText
} from 'lucide-react';
import { Project } from '../types';
import Editor, { loader } from '@monaco-editor/react';
import Markdown from 'react-markdown';
import { useToastStore } from '../stores/toastStore';

// --- CONSTANTS FOR A4 LAYOUT ---
const A4_W_MM = 210;
const A4_H_MM = 297;
const GAP_MM = 10;
const TOTAL_UNIT_MM = A4_H_MM + GAP_MM;

const BASE_STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=Times+New+Roman&display=swap');
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
    
    .paper-viewport {
        background-color: #525659; /* PDF Viewer Grey */
        padding: 40px 0;
        overflow-y: scroll;
        height: 100%;
        scroll-behavior: smooth;
    }

    .paper-canvas {
        background: white;
        color: black;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        box-sizing: border-box;
        margin: 0 auto;
        transition: transform 0.2s ease-out;
        transform-origin: top center;
        
        /* A4 PAGE SIMULATION (Galley Mode) */
        background-image: linear-gradient(to bottom, 
            white 0mm, 
            white ${A4_H_MM}mm,      
            #525659 ${A4_H_MM}mm,    
            #525659 ${TOTAL_UNIT_MM}mm 
        );
        background-size: 100% ${TOTAL_UNIT_MM}mm;
        background-repeat: repeat-y;
        
        min-height: ${A4_H_MM}mm;
        position: relative;
    }
    
    /* Page Number Styling */
    .page-number-overlay {
        position: absolute;
        left: 0;
        width: 100%;
        height: 20px;
        text-align: center;
        font-family: 'Times New Roman', serif;
        font-size: 9pt;
        color: #666;
        pointer-events: none;
    }
    
    .editable-block {
        position: relative;
        border: 1px dashed transparent;
        transition: all 0.2s;
        cursor: text;
        break-inside: avoid; /* Try to keep blocks together */
    }
    .editable-block:hover {
        border-color: #cbd5e1;
        background-color: rgba(241, 245, 249, 0.3);
    }
    .editable-block.editing {
        border-color: #6366f1;
        background-color: #1e1e1e; /* Dark mode editor bg match */
        box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.3);
        z-index: 10;
        padding: 8px;
        margin: -8px; 
        border-radius: 4px;
        break-inside: auto;
        color: #d4d4d4;
    }
`;

const TEMPLATES: Record<string, { name: string, css: string }> = {
    IEEE: {
        name: "IEEE Conference (A4)",
        css: `
            .template-IEEE {
                width: ${A4_W_MM}mm; 
                /* IEEE A4 Margins: Top 19mm, Bottom 43mm, Sides 13mm */
                /* We add extra bottom padding to account for the gap simulation if text overflows */
                padding: 19mm 13mm 19mm 13mm;
                font-family: 'Times New Roman', Times, serif;
                font-size: 10pt;
                line-height: 1.1;
            }
            .template-IEEE .paper-columns {
                column-count: 2;
                column-gap: 5mm;
                text-align: justify;
            }
            .template-IEEE .paper-front-matter {
                column-span: all;
                margin-bottom: 6mm;
                text-align: center;
            }
            .template-IEEE .paper-title {
                font-size: 24pt;
                font-weight: normal;
                margin-bottom: 12pt;
                line-height: 1;
            }
            .template-IEEE .paper-authors {
                font-size: 11pt;
                margin-bottom: 12pt;
            }
            .template-IEEE .paper-h1 {
                font-size: 10pt;
                font-weight: bold;
                text-align: center;
                font-variant: small-caps;
                margin-top: 12pt;
                margin-bottom: 6pt;
                page-break-after: avoid;
            }
            .template-IEEE .paper-abstract {
                font-size: 9pt;
                font-weight: bold;
                text-align: justify;
                margin: 0 15mm 8pt 15mm;
            }
            .template-IEEE .paper-abstract-label {
                font-style: italic;
            }
            .template-IEEE p { text-indent: 3.5mm; margin: 0 0 4pt 0; }
        `
    },
    // ... other templates would need similar A4 updates ...
    SPRINGER: {
        name: "Springer LNCS (A4)",
        css: `
            .template-SPRINGER {
                width: ${A4_W_MM}mm;
                padding: 5cm 2.5cm 2.5cm 2.5cm;
                font-family: 'Times New Roman', Times, serif;
                font-size: 10pt;
                line-height: 1.2;
            }
            .template-SPRINGER .paper-columns {
                column-count: 1; 
                text-align: justify;
                max-width: 12.2cm; 
                margin: 0 auto;
            }
            .template-SPRINGER .paper-front-matter {
                text-align: center;
                margin-bottom: 2cm;
            }
            .template-SPRINGER .paper-title {
                font-size: 14pt;
                font-weight: bold;
                margin-bottom: 16pt;
            }
            /* ... rest same ... */
            .template-SPRINGER p { text-indent: 0.5cm; margin: 0; }
        `
    }
};

interface Block {
    id: string;
    type: 'title' | 'authors' | 'abstract' | 'section';
    heading?: string;
    content: string;
}

interface WorkspaceStudioProps {
    activeProject?: Project | null;
    content: string;
    onChange: (content: string) => void;
    activeFileName?: string;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
}

export const WorkspaceStudio: React.FC<WorkspaceStudioProps> = ({
    activeProject,
    content,
    onChange,
    activeFileName,
    onUndo,
    onRedo,
    canUndo,
    canRedo
}) => {
    // --- STATE ---
    const [viewMode, setViewMode] = useState<'visual' | 'source'>('visual');
    const [blocks, setBlocks] = useState<Block[]>([]);
    const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
    const [zoom, setZoom] = useState(100);

    // Template State
    const [activeTemplate, setActiveTemplate] = useState<string>('IEEE');
    const [isRefactoring, setIsRefactoring] = useState(false);
    const [customTemplates, setCustomTemplates] = useState<string[]>([]);
    const [templateMenuOpen, setTemplateMenuOpen] = useState(false);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const viewportRef = useRef<HTMLDivElement>(null);

    const [fontSize, setFontSize] = useState(11); // pt
    const [lineHeight, setLineHeight] = useState(1.5);
    const { addToast } = useToastStore();

    // Editor State
    const [editorRef, setEditorRef] = useState<any>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    // File Upload Ref
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- PAGINATION LOGIC ---
    const PX_PER_MM = 3.78;

    useEffect(() => {
        const updatePagination = () => {
            if (canvasRef.current && viewportRef.current) {
                const totalHeight = canvasRef.current.scrollHeight;
                // Since we use CSS zoom, the scrollHeight matches the visual height (scaled)
                const pageUnitPx = (TOTAL_UNIT_MM * PX_PER_MM) * (zoom / 100);

                const pages = Math.max(1, Math.ceil(totalHeight / pageUnitPx));
                setTotalPages(pages);

                const scrollY = viewportRef.current.scrollTop;
                const scaledPageHeight = pageUnitPx * (zoom / 100);

                // Approximate current page
                const current = Math.min(pages, Math.max(1, Math.floor((scrollY + (scaledPageHeight / 3)) / scaledPageHeight) + 1));

                setCurrentPage(current);
            }
        };

        const viewport = viewportRef.current;
        if (viewport) {
            viewport.addEventListener('scroll', updatePagination);
            updatePagination();
            const ro = new ResizeObserver(updatePagination);
            if (canvasRef.current) ro.observe(canvasRef.current);

            return () => {
                viewport.removeEventListener('scroll', updatePagination);
                ro.disconnect();
            };
        }
    }, [zoom, blocks, activeTemplate, viewMode]);

    const scrollToPage = (page: number) => {
        if (!viewportRef.current) return;
        const targetPage = Math.max(1, Math.min(page, totalPages));
        const pageUnitPx = TOTAL_UNIT_MM * PX_PER_MM;
        const scaledPageHeight = pageUnitPx * (zoom / 100);

        viewportRef.current.scrollTo({
            top: (targetPage - 1) * scaledPageHeight,
            behavior: 'smooth'
        });
    };

    // --- PARSING LOGIC (Markdown -> Blocks) ---
    useEffect(() => {
        if (!content) return;
        if (editingBlockId) return;
        // Don't re-parse if we are just switching back and forth unless content changed
        // But content does change when editing in Source mode, so this is correct.

        const newBlocks: Block[] = [];
        const lines = content.split('\n');

        let currentType: Block['type'] = 'title';
        let buffer: string[] = [];
        let currentHeading = '';

        const flush = (nextType: Block['type'], nextHeading: string = '') => {
            if (buffer.length > 0 || currentType === 'title') {
                if (currentType === 'title') {
                    const titleText = buffer[0]?.replace(/^#\s/, '') || 'Untitled';
                    newBlocks.push({ id: 'meta-title', type: 'title', content: titleText });
                    const authorIdx = buffer.findIndex(l => l.includes('**Authors:**'));
                    if (authorIdx !== -1) {
                        const authorText = buffer.slice(authorIdx + 1).join('\n').trim();
                        newBlocks.push({ id: 'meta-authors', type: 'authors', content: authorText });
                    }
                } else {
                    newBlocks.push({
                        id: `blk-${newBlocks.length}`,
                        type: currentType,
                        heading: currentHeading,
                        content: buffer.join('\n').trim()
                    });
                }
            }
            buffer = [];
            currentType = nextType;
            currentHeading = nextHeading;
        };

        lines.forEach(line => {
            if (line.startsWith('## Abstract')) {
                flush('abstract');
            } else if (line.startsWith('## ')) {
                flush('section', line.replace('## ', '').trim());
            } else {
                buffer.push(line);
            }
        });
        flush('section', 'End');
        setBlocks(newBlocks.filter(b => b.content || b.heading));

    }, [content]);

    // --- RECONSTRUCTION LOGIC ---
    const saveBlocks = (updatedBlocks: Block[]) => {
        let md = '';
        updatedBlocks.forEach(b => {
            if (b.type === 'title') md += `# ${b.content}\n\n`;
            else if (b.type === 'authors') md += `**Authors:**\n${b.content}\n\n`;
            else if (b.type === 'abstract') md += `## Abstract\n${b.content}\n\n`;
            else if (b.type === 'section') md += `## ${b.heading}\n${b.content}\n\n`;
        });
        onChange(md);
        setBlocks(updatedBlocks);
    };

    const handleBlockChange = (id: string, newContent: string) => {
        const updated = blocks.map(b => b.id === id ? { ...b, content: newContent } : b);
        saveBlocks(updated);
    };

    const handleHeadingChange = (id: string, newHeading: string) => {
        const updated = blocks.map(b => b.id === id ? { ...b, heading: newHeading } : b);
        saveBlocks(updated);
    };

    const addNewSection = () => {
        const newBlock: Block = {
            id: `blk-${Date.now()}`,
            type: 'section',
            heading: 'New Section',
            content: 'Start writing here...'
        };
        saveBlocks([...blocks, newBlock]);
        setEditingBlockId(newBlock.id);
    };

    const deleteBlock = (id: string) => {
        if (confirm("Delete this section?")) {
            saveBlocks(blocks.filter(b => b.id !== id));
            setEditingBlockId(null);
        }
    };

    const handleTemplateSwitch = (templateKey: string) => {
        setIsRefactoring(true);
        setTemplateMenuOpen(false);
        setTimeout(() => {
            setActiveTemplate(templateKey);
            setIsRefactoring(false);
        }, 800);
    };

    const handleCustomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsRefactoring(true);
        setTemplateMenuOpen(false);

        setTimeout(() => {
            const templateName = file.name.replace(/\.(tex|cls|zip)$/, '');
            setCustomTemplates(prev => [...prev, templateName]);
            setActiveTemplate('IEEE');
            addToast(`Template "${templateName}" uploaded and analyzed.`, 'success');
            setIsRefactoring(false);
        }, 1500);
    };

    const handlePrint = () => { window.print(); };

    const handleSourceEditorMount = (editor: any, monaco: any) => {
        setupMonaco(monaco);
    };

    return (
        <div className="flex flex-col h-full bg-[#e5e7eb] text-gray-800 font-sans overflow-hidden">
            {/* INJECT STYLES */}
            <style>{BASE_STYLES}</style>
            <style>{TEMPLATES[activeTemplate]?.css || TEMPLATES['IEEE'].css}</style>

            {/* TOOLBAR */}
            <div className="h-12 bg-white border-b border-gray-300 flex items-center justify-between px-4 shrink-0 z-30 shadow-sm print:hidden">
                <div className="flex items-center gap-4">
                    <span className="font-bold text-gray-700 flex items-center gap-2 mr-2">
                        <Printer className="w-4 h-4 text-indigo-600" /> Live Paper
                    </span>

                    {/* VIEW TOGGLE */}
                    <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                        <button
                            onClick={() => setViewMode('visual')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'visual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <FileText className="w-3.5 h-3.5" />
                            Visual
                        </button>
                        <button
                            onClick={() => setViewMode('source')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'source' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Code className="w-3.5 h-3.5" />
                            Source
                        </button>
                    </div>

                    <div className="h-4 w-px bg-gray-300"></div>

                    {/* TEMPLATE SELECTOR (Visual Mode Only) */}
                    {viewMode === 'visual' && (
                        <div className="relative animate-in fade-in duration-300">
                            <button
                                onClick={() => setTemplateMenuOpen(!templateMenuOpen)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md text-xs font-semibold text-gray-700 transition-colors"
                            >
                                <LayoutTemplate className="w-3.5 h-3.5 text-gray-500" />
                                {customTemplates.includes(activeTemplate) ? activeTemplate : TEMPLATES[activeTemplate].name}
                                <ChevronDown className="w-3 h-3 text-gray-400" />
                            </button>

                            {templateMenuOpen && (
                                <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
                                    <div className="p-1">
                                        <div className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Standard Templates</div>
                                        {Object.entries(TEMPLATES).map(([key, t]) => (
                                            <button
                                                key={key}
                                                onClick={() => handleTemplateSwitch(key)}
                                                className={`w-full text-left px-2 py-1.5 text-xs rounded-md flex items-center justify-between ${activeTemplate === key ? 'bg-indigo-50 text-indigo-600 font-bold' : 'hover:bg-gray-50 text-gray-700'}`}
                                            >
                                                {t.name}
                                                {activeTemplate === key && <Check className="w-3 h-3" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {viewMode === 'visual' && (
                        <div className="flex items-center gap-1 bg-gray-100 rounded p-0.5 ml-2">
                            <button onClick={() => setZoom(z => Math.max(50, z - 10))} className="p-1 hover:bg-white rounded"><Minimize className="w-3 h-3" /></button>
                            <span className="text-xs w-8 text-center">{zoom}%</span>
                            <button onClick={() => setZoom(z => Math.min(150, z + 10))} className="p-1 hover:bg-white rounded"><Maximize className="w-3 h-3" /></button>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 border-r border-gray-200 pr-3 mr-1">
                        <button
                            onClick={onUndo}
                            disabled={!canUndo}
                            className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded disabled:opacity-30"
                            title="Undo Agent Edit"
                        >
                            <Undo2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={onRedo}
                            disabled={!canRedo}
                            className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded disabled:opacity-30"
                            title="Redo"
                        >
                            <Redo2 className="w-4 h-4" />
                        </button>
                    </div>

                    {viewMode === 'visual' && (
                        <button onClick={addNewSection} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded text-xs font-bold transition-colors">
                            <PlusCircle className="w-3.5 h-3.5" /> Add Section
                        </button>
                    )}
                    <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 text-white hover:bg-gray-700 rounded text-xs font-bold transition-colors">
                        <Download className="w-3.5 h-3.5" /> Export PDF
                    </button>
                </div>
            </div>

            {/* CONTENT AREA */}
            {viewMode === 'visual' ? (
                /* 1. VISUAL PAPER MODE */
                <div ref={viewportRef} className="paper-viewport flex-1 relative print:p-0 print:overflow-visible">
                    {/* REFACTORING OVERLAY */}
                    {isRefactoring && (
                        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                            <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center gap-4">
                                <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                                <div className="text-center">
                                    <h3 className="font-bold text-gray-900">Refactoring Content</h3>
                                    <p className="text-xs text-gray-500 mt-1">Adapting structure to {customTemplates.includes(activeTemplate) ? activeTemplate : TEMPLATES[activeTemplate].name}...</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* CANVAS WRAPPER FOR ZOOM */}
                    <div className="flex justify-center min-h-full items-start pb-20">
                        <div
                            ref={canvasRef}
                            className={`paper-canvas template-${activeTemplate} print:transform-none print:shadow-none print:m-0`}
                            style={{ zoom: zoom / 100, transformOrigin: 'top center' }}
                        >
                            {/* Page Numbers Overlay */}
                            {Array.from({ length: totalPages }).map((_, i) => (
                                <div
                                    key={i}
                                    className="page-number-overlay"
                                    style={{ top: `${(i + 1) * A4_H_MM + (i * GAP_MM) - 15}mm` }} // Just above the gap
                                >
                                    {i + 1}
                                </div>
                            ))}

                            {/* 1. FRONT MATTER */}
                            <div className="paper-front-matter">
                                {/* Title Block */}
                                {blocks.filter(b => b.type === 'title').map(block => (
                                    <EditableBlock
                                        key={block.id}
                                        block={block}
                                        isEditing={editingBlockId === block.id}
                                        setEditing={setEditingBlockId}
                                        onChange={handleBlockChange}
                                        className="paper-title"
                                    />
                                ))}

                                {/* Author Block */}
                                {blocks.filter(b => b.type === 'authors').map(block => (
                                    <EditableBlock
                                        key={block.id}
                                        block={block}
                                        isEditing={editingBlockId === block.id}
                                        setEditing={setEditingBlockId}
                                        onChange={handleBlockChange}
                                        className="paper-authors"
                                    />
                                ))}

                                {/* Abstract Block */}
                                {blocks.filter(b => b.type === 'abstract').map(block => (
                                    <div key={block.id} className="paper-abstract">
                                        <span className="paper-abstract-label">Abstract—</span>
                                        <EditableBlock
                                            block={block}
                                            isEditing={editingBlockId === block.id}
                                            setEditing={setEditingBlockId}
                                            onChange={handleBlockChange}
                                            inline
                                        />
                                    </div>
                                ))}
                            </div>

                            {/* 2. COLUMNS BODY */}
                            <div className="paper-columns">
                                {blocks.filter(b => b.type === 'section').map((block, idx) => (
                                    <div key={block.id} className="mb-6 break-inside-avoid">
                                        {/* Section Header */}
                                        <div className="group flex items-center gap-2 mb-2">
                                            {editingBlockId === block.id ? (
                                                <input
                                                    value={block.heading}
                                                    onChange={(e) => handleHeadingChange(block.id, e.target.value)}
                                                    className="font-bold uppercase text-sm border-b border-indigo-500 outline-none w-full"
                                                    placeholder="SECTION TITLE"
                                                />
                                            ) : (
                                                <h1 className="paper-h1 cursor-pointer hover:text-indigo-600" onClick={() => setEditingBlockId(block.id)}>
                                                    {idx + 1}. {block.heading}
                                                </h1>
                                            )}
                                            {editingBlockId === block.id && (
                                                <button onClick={() => deleteBlock(block.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                                            )}
                                        </div>

                                        {/* Content */}
                                        <EditableBlock
                                            block={block}
                                            isEditing={editingBlockId === block.id}
                                            setEditing={setEditingBlockId}
                                            onChange={handleBlockChange}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* 2. SOURCE CODE MODE */
                <div className="flex-1 bg-[#1e1e1e] relative overflow-hidden">
                    <Editor
                        height="100%"
                        defaultLanguage="markdown"
                        theme="scholar-dark"
                        value={content}
                        onChange={(val) => onChange(val || '')}
                        onMount={handleSourceEditorMount}
                        options={{
                            minimap: { enabled: true },
                            fontSize: 14,
                            fontFamily: 'JetBrains Mono, monospace',
                            wordWrap: 'on',
                            padding: { top: 32, bottom: 32 },
                            lineNumbers: 'on',
                            folding: true,
                            scrollBeyondLastLine: false,
                            renderValidationDecorations: 'on',
                            bracketPairColorization: { enabled: true }
                        }}
                    />
                </div>
            )}

            {/* FLOATING PAGINATION CONTROLS (Visual Mode Only) */}
            {viewMode === 'visual' && (
                <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-40 animate-in slide-in-from-bottom-4 print:hidden">
                    <div className="bg-gray-900 text-white rounded-full shadow-2xl px-4 py-2 flex items-center gap-4 text-sm font-medium border border-gray-700/50 backdrop-blur-md">
                        <button
                            onClick={() => scrollToPage(currentPage - 1)}
                            disabled={currentPage <= 1}
                            className="p-1 hover:bg-gray-700 rounded-full disabled:opacity-30 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-2 min-w-[100px] justify-center select-none">
                            <span className="text-gray-400">Page</span>
                            <input
                                type="number"
                                min={1}
                                max={totalPages}
                                value={currentPage}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (!isNaN(val) && val >= 1 && val <= totalPages) {
                                        scrollToPage(val);
                                    }
                                }}
                                className="w-8 bg-transparent text-center focus:outline-none focus:border-b border-indigo-500 font-bold"
                            />
                            <span className="text-gray-400">of {totalPages}</span>
                        </div>

                        <button
                            onClick={() => scrollToPage(currentPage + 1)}
                            disabled={currentPage >= totalPages}
                            className="p-1 hover:bg-gray-700 rounded-full disabled:opacity-30 transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- SUB-COMPONENT: EDITABLE BLOCK ---
let monacoConfigured = false;
const setupMonaco = (monaco: any) => {
    if (monacoConfigured) return;
    monacoConfigured = true;

    // Custom Citation Completion Provider
    monaco.languages.registerCompletionItemProvider('markdown', {
        provideCompletionItems: (model: any, position: any) => {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };

            return {
                suggestions: [
                    {
                        label: '\\cite',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: '\\cite{${1:ref_key}}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Insert a citation key',
                        detail: 'Citation',
                        range: range
                    },
                    {
                        label: 'section',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: '## ${1:Section Name}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'New Section Header',
                        range: range
                    },
                    {
                        label: 'equation',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: '$$ \n  ${1:x = y^2} \n$$',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Math Block',
                        range: range
                    }
                ]
            };
        }
    });

    // Theme Customization if needed
    monaco.editor.defineTheme('scholar-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
            'editor.background': '#1e1e1e',
        }
    });
};

const EditableBlock = ({ block, isEditing, setEditing, onChange, className = '', inline = false }: any) => {

    const handleEditorDidMount = (editor: any, monaco: any) => {
        setupMonaco(monaco);
        editor.focus();
    };

    // Markdown Preview Renderer (Simple)
    const renderContent = (content: string) => {
        // Strip markdown for simple title/author preview, parse for body
        if (block.type === 'title' || block.type === 'authors') {
            return content.split('\n').map((line, i) => <div key={i}>{line}</div>);
        }
        return (
            <Markdown
                components={{
                    p: ({ node, ...props }) => <p {...props} className="mb-2" />,
                    strong: ({ node, ...props }) => <span {...props} className="font-bold" />,
                    em: ({ node, ...props }) => <span {...props} className="italic" />,
                    li: ({ node, ...props }) => <li {...props} className="ml-4 list-disc" />
                }}
            >
                {content}
            </Markdown>
        );
    };

    if (isEditing) {
        return (
            <div className={`editable-block editing ${className}`}>
                <div className="flex justify-between items-center mb-1 pb-1 border-b border-gray-700">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase flex items-center gap-1">
                        <Edit3 className="w-3 h-3" /> Editing {block.type}
                    </span>
                    <div className="flex gap-2">
                        <button onClick={(e) => { e.stopPropagation(); setEditing(null); }} className="p-1 hover:bg-green-900/30 text-green-500 rounded transition-colors" title="Save & Close (Esc)">
                            <Check className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
                <Editor
                    height={block.type === 'section' ? "300px" : "100px"}
                    defaultLanguage="markdown"
                    value={block.content}
                    onChange={(val) => onChange(block.id, val || '')}
                    onMount={handleEditorDidMount}
                    theme="vs-dark"
                    options={{
                        minimap: { enabled: true, scale: 0.75 },
                        lineNumbers: 'on',
                        folding: true,
                        foldingHighlight: true,
                        wordWrap: 'on',
                        fontSize: 13,
                        padding: { top: 12, bottom: 12 },
                        scrollBeyondLastLine: false,
                        fontFamily: 'JetBrains Mono, monospace',
                        renderValidationDecorations: 'on',
                        quickSuggestions: true,
                        snippetSuggestions: 'inline',
                        contextmenu: true,
                        matchBrackets: 'always',
                        autoClosingBrackets: 'always',
                        autoClosingQuotes: 'always',
                        formatOnType: true
                    }}
                />
            </div>
        );
    }

    return (
        <div
            className={`editable-block group relative ${className} ${inline ? 'inline' : ''}`}
            onClick={() => setEditing(block.id)}
        >
            {/* Hover Action */}
            <div className="absolute -left-6 top-0 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                <div className="p-1 bg-gray-100 rounded shadow-sm cursor-pointer hover:text-indigo-600">
                    <Edit3 className="w-3 h-3" />
                </div>
            </div>

            {renderContent(block.content)}
        </div>
    );
};
