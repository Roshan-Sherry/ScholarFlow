
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
import { SimpleTextEditor } from './SimpleTextEditor';
import { LivePaperPreview } from './LivePaperPreview';
import { saveDraft, loadDraft } from '../lib/api-client';

// --- CONSTANTS FOR A4 LAYOUT ---
const A4_W_MM = 210;
const A4_H_MM = 297;
const GAP_MM = 10;                          // Visual gap between pages (grey stripe)
const TOTAL_UNIT_MM = A4_H_MM + GAP_MM;    // 307mm per page unit

// IEEE margins (mm): top 19, bottom 43, sides 13
const IEEE_MT = 19;
const IEEE_MB = 43;
const IEEE_MS = 13;
const IEEE_BODY_H = A4_H_MM - IEEE_MT - IEEE_MB; // ~235mm printable height per page

// Springer LNCS margins: top 5cm, bottom 2.5cm, sides 2.5cm
const SPR_MT_MM = 50;
const SPR_MB_MM = 25;
const SPR_MS_MM = 25;
const SPR_BODY_H = A4_H_MM - SPR_MT_MM - SPR_MB_MM; // ~222mm printable height per page

const BASE_STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');

    .paper-viewport {
        background-color: #525659;
        padding: 40px 0;
        overflow-y: scroll;
        height: 100%;
        scroll-behavior: smooth;
    }

    /*
     * The canvas is a tall galley strip.
     * The repeating gradient paints A4 white pages separated by a grey gap stripe,
     * giving an authentic PDF-viewer look without JavaScript page splitting.
     */
    .paper-canvas {
        background: white;
        color: #000;
        box-shadow: 0 4px 20px rgba(0,0,0,0.35);
        box-sizing: border-box;
        margin: 0 auto;
        transform-origin: top center;
        position: relative;

        /* Repeating page background: white page, then grey gap */
        background-image: linear-gradient(to bottom,
            white          0mm,
            white          ${A4_H_MM}mm,
            #525659        ${A4_H_MM}mm,
            #525659        ${TOTAL_UNIT_MM}mm
        );
        background-size: 100% ${TOTAL_UNIT_MM}mm;
        background-repeat: repeat-y;

        min-height: ${A4_H_MM}mm;
        height: auto;
        overflow: visible;
    }

    /* ---- Page number label sits inside the grey gap stripe ---- */
    .page-number-overlay {
        position: absolute;
        left: 0;
        width: 100%;
        height: ${GAP_MM}mm;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Times New Roman', serif;
        font-size: 8pt;
        color: #ccc;
        pointer-events: none;
        letter-spacing: 0.1em;
    }

    /* ---- Editable blocks ---- */
    .editable-block {
        position: relative;
        border: 1px dashed transparent;
        transition: border-color 0.15s, background 0.15s;
        cursor: text;
    }
    .editable-block:hover {
        border-color: #c7d2fe;
        background-color: rgba(238,242,255,0.4);
    }
    .editable-block.editing {
        border-color: #6366f1;
        background-color: #1e1e1e;
        box-shadow: 0 0 0 4px rgba(99,102,241,0.25);
        z-index: 10;
        padding: 8px;
        margin: -8px;
        border-radius: 4px;
        color: #d4d4d4;
    }

    /* Prevent widows/orphans */
    .paper-canvas p,
    .paper-canvas li,
    .paper-canvas h1,
    .paper-canvas h2,
    .paper-canvas h3 {
        orphans: 3;
        widows: 3;
    }
`;

/*
 * IEEE CONFERENCE TEMPLATE
 * ────────────────────────
 * • A4 page (210 × 297 mm)
 * • Margins: top 19 mm, bottom 43 mm, sides 13 mm
 * • Two equal columns, 5 mm gutter
 * • column-fill: auto  → fills left column first, then right, then wraps to next page
 * • column-height = printable body height so columns never bleed into the gap stripe
 */
const IEEE_CSS = `
    .template-IEEE {
        width: ${A4_W_MM}mm;
        padding: ${IEEE_MT}mm ${IEEE_MS}mm 0 ${IEEE_MS}mm;
        font-family: 'Times New Roman', Times, serif;
        font-size: 10pt;
        line-height: 1.15;
    }
    /* Front matter spans full width */
    .template-IEEE .paper-front-matter {
        margin-bottom: 5mm;
        text-align: center;
    }
    .template-IEEE .paper-title {
        font-size: 20pt;
        font-weight: normal;
        margin-bottom: 10pt;
        line-height: 1.1;
    }
    .template-IEEE .paper-authors {
        font-size: 10pt;
        margin-bottom: 8pt;
        line-height: 1.4;
    }
    .template-IEEE .paper-abstract {
        font-size: 9pt;
        text-align: justify;
        margin: 0 12mm 6mm 12mm;
    }
    .template-IEEE .paper-abstract-label {
        font-weight: bold;
        font-style: italic;
    }
    /*
     * Two-column body.
     * column-height limits each column to the printable body height so
     * text wraps to the next column / page before hitting the grey gap.
     */
    .template-IEEE .paper-columns {
        column-count: 2;
        column-gap: 5mm;
        column-fill: auto;
        column-rule: none;
        height: auto;
        text-align: justify;
    }
    .template-IEEE .paper-h1 {
        font-size: 10pt;
        font-weight: bold;
        text-align: center;
        font-variant: small-caps;
        margin-top: 10pt;
        margin-bottom: 5pt;
        break-after: avoid;
        column-break-after: avoid;
    }
    .template-IEEE p {
        text-indent: 3.5mm;
        margin: 0 0 3pt 0;
    }
    /* Section wrapper: keep heading + first paragraph together */
    .template-IEEE .paper-columns > div {
        break-inside: avoid-column;
    }
    /* Bottom margin area — pushed by padding on wrapper (see PagedColumn) */
`;

/*
 * SPRINGER LNCS TEMPLATE
 * ──────────────────────
 * • A4 page (210 × 297 mm)
 * • Margins: top 5 cm, bottom 2.5 cm, sides 2.5 cm
 * • Single column, 12.2 cm text block
 * • Content overflows naturally to next page
 */
const SPRINGER_CSS = `
    .template-SPRINGER {
        width: ${A4_W_MM}mm;
        padding: ${SPR_MT_MM}mm ${SPR_MS_MM}mm 0 ${SPR_MS_MM}mm;
        font-family: 'Times New Roman', Times, serif;
        font-size: 10pt;
        line-height: 1.2;
    }
    .template-SPRINGER .paper-front-matter {
        text-align: center;
        margin-bottom: 18pt;
    }
    .template-SPRINGER .paper-title {
        font-size: 14pt;
        font-weight: bold;
        margin-bottom: 14pt;
        line-height: 1.2;
    }
    .template-SPRINGER .paper-authors {
        font-size: 10pt;
        margin-bottom: 10pt;
    }
    .template-SPRINGER .paper-abstract {
        font-size: 9pt;
        margin: 0 0 12pt 0;
        text-align: justify;
    }
    .template-SPRINGER .paper-abstract-label {
        font-weight: bold;
    }
    .template-SPRINGER .paper-columns {
        column-count: 1;
        text-align: justify;
    }
    .template-SPRINGER .paper-h1 {
        font-size: 11pt;
        font-weight: bold;
        margin-top: 14pt;
        margin-bottom: 6pt;
        break-after: avoid;
    }
    .template-SPRINGER p {
        text-indent: 0;
        margin: 0 0 6pt 0;
    }
`;

const TEMPLATES: Record<string, { name: string; css: string }> = {
    IEEE:     { name: 'IEEE Conference (A4)',  css: IEEE_CSS },
    SPRINGER: { name: 'Springer LNCS (A4)',    css: SPRINGER_CSS },
};

// Bottom-margin padding per template (mm) — appended to each page's worth of content
// so text never bleeds into the grey gap stripe.
const TEMPLATE_BOTTOM_MM: Record<string, number> = {
    IEEE:     IEEE_MB,
    SPRINGER: SPR_MB_MM,
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
    onOpenPaper?: (paperId: string, page?: number, highlightText?: string) => void;
    isStreaming?: boolean;
}

export const WorkspaceStudio: React.FC<WorkspaceStudioProps> = ({
    activeProject,
    content,
    onChange,
    activeFileName,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    onOpenPaper,
    isStreaming = false,
}) => {
    // --- STATE ---
    const [blocks, setBlocks] = useState<Block[]>([]);
    const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
    const [zoom, setZoom] = useState(100);

    const [activeTemplate, setActiveTemplate] = useState<string>('IEEE');
    const [isRefactoring, setIsRefactoring] = useState(false);
    const [customTemplates, setCustomTemplates] = useState<string[]>([]);
    const [templateMenuOpen, setTemplateMenuOpen] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const { addToast } = useToastStore();
    const canvasRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // CSS reference pixels per mm at 96 dpi (1in = 96px, 1in = 25.4mm)
    const PX_PER_MM = 96 / 25.4; // ≈ 3.7795

    // --- PAGINATION ---
    useEffect(() => {
        const updatePagination = () => {
            if (!canvasRef.current || !viewportRef.current) return;

            // We measure the canvas in UNSCALED CSS pixels by temporarily
            // reading getBoundingClientRect (which reflects zoom) and dividing
            // by the zoom factor, giving us the true layout height.
            // Then we compare against one A4+gap page in unscaled CSS pixels.
            const zoomFactor = zoom / 100;
            const rect = canvasRef.current.getBoundingClientRect();
            const unscaledHeight = rect.height / zoomFactor;

            // One page unit in unscaled CSS px
            const pageUnitPx = TOTAL_UNIT_MM * PX_PER_MM;

            const pages = Math.max(1, Math.ceil(unscaledHeight / pageUnitPx));
            setTotalPages(pages);

            // Current page: viewport scrollTop is in real (zoomed) px,
            // so we scale it back to unscaled before dividing.
            const scrollY = viewportRef.current.scrollTop / zoomFactor;
            const current = Math.min(pages, Math.max(1,
                Math.floor((scrollY + pageUnitPx / 3) / pageUnitPx) + 1
            ));
            setCurrentPage(current);
        };

        const viewport = viewportRef.current;
        if (!viewport) return;
        viewport.addEventListener('scroll', updatePagination);
        updatePagination();
        const ro = new ResizeObserver(updatePagination);
        if (canvasRef.current) ro.observe(canvasRef.current);
        return () => { viewport.removeEventListener('scroll', updatePagination); ro.disconnect(); };
    }, [zoom, blocks, activeTemplate]);

    const scrollToPage = (page: number) => {
        if (!viewportRef.current) return;
        const targetPage = Math.max(1, Math.min(page, totalPages));
        // Scroll in real (zoomed) px: unscaled page offset × zoom factor
        const pageUnitPx = TOTAL_UNIT_MM * PX_PER_MM;
        viewportRef.current.scrollTo({ top: (targetPage - 1) * pageUnitPx * (zoom / 100), behavior: 'smooth' });
    };

    // --- DRAFT PERSISTENCE (Load on Mount) ---
    useEffect(() => {
        if (!activeProject?.id) return;
        const load = async () => {
            try {
                const draft = await loadDraft(activeProject.id);
                if (draft.full_content && draft.full_content !== content) {
                    onChange(draft.full_content);
                }
            } catch (e) {
                console.warn('Failed to load draft:', e);
            }
        };
        load();
    }, [activeProject?.id]);

    // --- DRAFT PERSISTENCE (Auto-save) ---
    useEffect(() => {
        if (!activeProject?.id || !content) return;
        const t = setTimeout(() => {
            saveDraft(activeProject.id, null, content).catch(e => console.warn('Auto-save failed:', e));
        }, 3000);
        return () => clearTimeout(t);
    }, [activeProject?.id, content]);

    // --- PARSE Markdown → Blocks ---
    // Allow re-parse during streaming even if editingBlockId is set,
    // but skip only if the user is actively typing in the Monaco editor.
    const isStreamingRef = useRef(isStreaming);
    useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);

    useEffect(() => {
        // Skip re-parse only when user is manually editing a block AND not streaming
        if (editingBlockId && !isStreamingRef.current) return;
        if (!content) { setBlocks([]); return; }

        const newBlocks: Block[] = [];
        const lines = content.split('\n');
        let currentType: Block['type'] = 'title';
        let buffer: string[] = [];
        let currentHeading = '';

        const flush = (nextType?: Block['type'], nextHeading = '') => {
            if (buffer.length > 0 || currentType === 'title') {
                if (currentType === 'title') {
                    const titleText = buffer[0]?.replace(/^#+\s*/, '') || 'Untitled';
                    newBlocks.push({ id: 'meta-title', type: 'title', content: titleText });
                    const authorIdx = buffer.findIndex(l => l.includes('**Authors:**'));
                    if (authorIdx !== -1) {
                        const authorText = buffer.slice(authorIdx + 1).join('\n').trim();
                        if (authorText) newBlocks.push({ id: 'meta-authors', type: 'authors', content: authorText });
                    }
                } else if (currentType === 'abstract' || currentType === 'section') {
                    const blockContent = buffer.join('\n').trim();
                    if (blockContent || currentHeading) {
                        newBlocks.push({
                            id: `blk-${newBlocks.length}`,
                            type: currentType,
                            heading: currentHeading,
                            content: blockContent,
                        });
                    }
                }
            }
            buffer = [];
            if (nextType) { currentType = nextType; currentHeading = nextHeading; }
        };

        lines.forEach(line => {
            if (line.startsWith('## Abstract')) flush('abstract');
            else if (line.startsWith('## '))      flush('section', line.replace(/^##\s*/, '').trim());
            else                                   buffer.push(line);
        });
        flush();
        setBlocks(newBlocks);
    }, [content, editingBlockId]);

    // --- RECONSTRUCT Blocks → Markdown ---
    const saveBlocks = (updatedBlocks: Block[]) => {
        let md = '';
        updatedBlocks.forEach(b => {
            if      (b.type === 'title')    md += `# ${b.content}\n\n`;
            else if (b.type === 'authors')  md += `**Authors:**\n${b.content}\n\n`;
            else if (b.type === 'abstract') md += `## Abstract\n${b.content}\n\n`;
            else if (b.type === 'section')  md += `## ${b.heading}\n${b.content}\n\n`;
        });
        onChange(md);
        setBlocks(updatedBlocks);
    };

    const handleBlockChange   = (id: string, v: string) => saveBlocks(blocks.map(b => b.id === id ? { ...b, content: v } : b));
    const handleHeadingChange = (id: string, v: string) => saveBlocks(blocks.map(b => b.id === id ? { ...b, heading: v } : b));

    const addNewSection = () => {
        const nb: Block = { id: `blk-${Date.now()}`, type: 'section', heading: 'New Section', content: 'Start writing here...' };
        saveBlocks([...blocks, nb]);
        setEditingBlockId(nb.id);
    };

    const deleteBlock = (id: string) => {
        if (confirm('Delete this section?')) { saveBlocks(blocks.filter(b => b.id !== id)); setEditingBlockId(null); }
    };

    const handleTemplateSwitch = (key: string) => {
        setIsRefactoring(true);
        setTemplateMenuOpen(false);
        setTimeout(() => { setActiveTemplate(key); setIsRefactoring(false); }, 600);
    };

    const handlePrint = () => window.print();

    // Bottom padding needed per page so content doesn't bleed into the grey gap
    const bottomPadMm = TEMPLATE_BOTTOM_MM[activeTemplate] ?? 25;

    return (
        <div className="flex flex-col h-full bg-[#525659] text-gray-800 font-sans overflow-hidden">
            {/* INJECT STYLES */}
            <style>{BASE_STYLES}</style>
            <style>{TEMPLATES[activeTemplate]?.css ?? TEMPLATES['IEEE'].css}</style>

            {/* TOOLBAR */}
            <div className="h-12 bg-white border-b border-gray-300 flex items-center justify-between px-4 shrink-0 z-30 shadow-sm print:hidden">
                <div className="flex items-center gap-4">
                    <span className="font-bold text-gray-700 flex items-center gap-2 mr-2">
                        <Printer className="w-4 h-4 text-indigo-600" /> Live Paper
                    </span>

                    {/* TEMPLATE SELECTOR */}
                    <div className="relative">
                        <button
                            onClick={() => setTemplateMenuOpen(!templateMenuOpen)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md text-xs font-semibold text-gray-700 transition-colors"
                        >
                            <LayoutTemplate className="w-3.5 h-3.5 text-gray-500" />
                            {customTemplates.includes(activeTemplate) ? activeTemplate : TEMPLATES[activeTemplate]?.name}
                            <ChevronDown className="w-3 h-3 text-gray-400" />
                        </button>
                        {templateMenuOpen && (
                            <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
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

                    {/* ZOOM */}
                    <div className="flex items-center gap-1 bg-gray-100 rounded p-0.5 ml-2">
                        <button onClick={() => setZoom(z => Math.max(40, z - 10))} className="p-1 hover:bg-white rounded"><Minimize className="w-3 h-3" /></button>
                        <span className="text-xs w-8 text-center">{zoom}%</span>
                        <button onClick={() => setZoom(z => Math.min(160, z + 10))} className="p-1 hover:bg-white rounded"><Maximize className="w-3 h-3" /></button>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 border-r border-gray-200 pr-3 mr-1">
                        <button onClick={onUndo} disabled={!canUndo} className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded disabled:opacity-30" title="Undo">
                            <Undo2 className="w-4 h-4" />
                        </button>
                        <button onClick={onRedo} disabled={!canRedo} className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded disabled:opacity-30" title="Redo">
                            <Redo2 className="w-4 h-4" />
                        </button>
                    </div>
                    <button onClick={addNewSection} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded text-xs font-bold transition-colors">
                        <PlusCircle className="w-3.5 h-3.5" /> Add Section
                    </button>
                    <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 text-white hover:bg-gray-700 rounded text-xs font-bold transition-colors">
                        <Download className="w-3.5 h-3.5" /> Export PDF
                    </button>
                </div>
            </div>

            {/* PAPER VIEWPORT */}
            <div ref={viewportRef} className="paper-viewport flex-1 relative print:p-0 print:overflow-visible">

                {isRefactoring && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm">
                        <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center gap-4">
                            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                            <div className="text-center">
                                <h3 className="font-bold text-gray-900">Switching Template</h3>
                                <p className="text-xs text-gray-500 mt-1">Adapting to {TEMPLATES[activeTemplate]?.name}…</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Zoom wrapper */}
                <div className="flex justify-center items-start py-10">
                    <div
                        ref={canvasRef}
                        className={`paper-canvas template-${activeTemplate} print:transform-none print:shadow-none print:m-0`}
                        style={{ zoom: zoom / 100 }}
                    >
                        {/* Page-number overlays — one per detected page, sitting in the grey gap */}
                        {Array.from({ length: totalPages }).map((_, i) => (
                            <div
                                key={i}
                                className="page-number-overlay"
                                style={{ top: `${(i + 1) * A4_H_MM + i * GAP_MM}mm` }}
                            >
                                {i + 1}
                            </div>
                        ))}

                        {/* ── FRONT MATTER (title, authors, abstract) ── */}
                        <div className="paper-front-matter">
                            {blocks.filter(b => b.type === 'title').map(block => (
                                <EditableBlock key={block.id} block={block}
                                    isEditing={editingBlockId === block.id}
                                    setEditing={setEditingBlockId}
                                    onChange={handleBlockChange}
                                    className="paper-title" />
                            ))}
                            {blocks.filter(b => b.type === 'authors').map(block => (
                                <EditableBlock key={block.id} block={block}
                                    isEditing={editingBlockId === block.id}
                                    setEditing={setEditingBlockId}
                                    onChange={handleBlockChange}
                                    className="paper-authors" />
                            ))}
                            {blocks.filter(b => b.type === 'abstract').map(block => (
                                <div key={block.id} className="paper-abstract">
                                    <span className="paper-abstract-label">Abstract— </span>
                                    <EditableBlock block={block}
                                        isEditing={editingBlockId === block.id}
                                        setEditing={setEditingBlockId}
                                        onChange={handleBlockChange}
                                        inline />
                                </div>
                            ))}
                        </div>

                        {/*
                         * ── BODY COLUMNS ──
                         *
                         * For IEEE (2 col): we wrap the columns div in a container that
                         * has padding-bottom = bottom margin + gap so content stops before
                         * the grey stripe. CSS columns then auto-balance across pages.
                         *
                         * For Springer (1 col): same padding approach; content wraps
                         * naturally across pages.
                         */}
                        <PagedColumns bottomPadMm={bottomPadMm + GAP_MM}>
                            <div className="paper-columns">
                                {blocks.filter(b => b.type === 'section').map((block, idx) => (
                                    <div key={block.id} className="section-block" style={{ breakInside: 'avoid-column', pageBreakInside: 'avoid' }}>
                                        {/* Section heading */}
                                        <div className="group flex items-center gap-2 mb-1">
                                            {editingBlockId === block.id ? (
                                                <input
                                                    value={block.heading}
                                                    onChange={e => handleHeadingChange(block.id, e.target.value)}
                                                    className="paper-h1 border-b border-indigo-500 outline-none w-full bg-transparent"
                                                    placeholder="SECTION TITLE"
                                                />
                                            ) : (
                                                <h1 className="paper-h1 w-full cursor-pointer" onClick={() => setEditingBlockId(block.id)}>
                                                    {idx + 1}. {block.heading}
                                                </h1>
                                            )}
                                            {editingBlockId === block.id && (
                                                <button onClick={() => deleteBlock(block.id)} className="shrink-0 text-red-400 hover:text-red-600 print:hidden">
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                        {/* Section body */}
                                        <EditableBlock
                                            block={block}
                                            isEditing={editingBlockId === block.id}
                                            setEditing={setEditingBlockId}
                                            onChange={handleBlockChange}
                                            onOpenPaper={onOpenPaper}
                                            activeProject={activeProject}
                                        />
                                    </div>
                                ))}
                            </div>
                        </PagedColumns>

                        {/* Empty-paper placeholder */}
                        {blocks.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-24 text-gray-400 select-none">
                                <FileText className="w-12 h-12 mb-4 opacity-30" />
                                <p className="text-sm font-medium">Your paper will appear here</p>
                                <p className="text-xs mt-1 opacity-60">Draft sections using the Co-Author panel →</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* FLOATING PAGINATION CONTROLS */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 print:hidden">
                <div className="bg-gray-900 text-white rounded-full shadow-2xl px-4 py-2 flex items-center gap-4 text-sm font-medium border border-gray-700/50">
                    <button onClick={() => scrollToPage(currentPage - 1)} disabled={currentPage <= 1}
                        className="p-1 hover:bg-gray-700 rounded-full disabled:opacity-30 transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2 min-w-[110px] justify-center select-none">
                        <span className="text-gray-400">Page</span>
                        <input type="number" min={1} max={totalPages} value={currentPage}
                            onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) scrollToPage(v); }}
                            className="w-8 bg-transparent text-center focus:outline-none font-bold" />
                        <span className="text-gray-400">of {totalPages}</span>
                    </div>
                    <button onClick={() => scrollToPage(currentPage + 1)} disabled={currentPage >= totalPages}
                        className="p-1 hover:bg-gray-700 rounded-full disabled:opacity-30 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── PagedColumns ─────────────────────────────────────────────────────────────
// Wraps the column content with bottom padding so text never bleeds into the
// grey gap stripe. The padding equals (bottom margin + gap).
const PagedColumns: React.FC<{ bottomPadMm: number; children: React.ReactNode }> = ({ bottomPadMm, children }) => (
    <div style={{ paddingBottom: `${bottomPadMm}mm` }}>
        {children}
    </div>
);

// ── EditableBlock ─────────────────────────────────────────────────────────────
let monacoConfigured = false;
const setupMonaco = (monaco: any) => {
    if (monacoConfigured) return;
    monacoConfigured = true;
    monaco.languages.registerCompletionItemProvider('markdown', {
        provideCompletionItems: (model: any, position: any) => {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
                startColumn: word.startColumn,        endColumn: word.endColumn,
            };
            return {
                suggestions: [
                    { label: '\\cite', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '\\cite{${1:ref_key}}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'Insert citation key', detail: 'Citation', range },
                    { label: 'section', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '## ${1:Section Name}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'New section header', range },
                    { label: 'equation', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '$$\n  ${1:x = y^2}\n$$', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'Math block', range },
                ],
            };
        },
    });
    monaco.editor.defineTheme('scholar-dark', { base: 'vs-dark', inherit: true, rules: [], colors: { 'editor.background': '#1e1e1e' } });
};

const EditableBlock = ({ block, isEditing, setEditing, onChange, className = '', inline = false, onOpenPaper, activeProject }: any) => {
    const handleMount = (editor: any, monaco: any) => { setupMonaco(monaco); editor.focus(); };

    const renderContent = (content: string) => {
        if (block.type === 'title' || block.type === 'authors') {
            return content.split('\n').map((line: string, i: number) => <div key={i}>{line || <br />}</div>);
        }
        return (
            <Markdown components={{
                p:      ({ node, ...p }) => <p      {...p} />,
                strong: ({ node, ...p }) => <strong {...p} />,
                em:     ({ node, ...p }) => <em     {...p} />,
                li:     ({ node, ...p }) => <li     {...p} className="ml-4 list-disc" />,
            }}>
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
                    <button onClick={e => { e.stopPropagation(); setEditing(null); }} className="p-1 hover:bg-green-900/30 text-green-500 rounded" title="Done">
                        <Check className="w-3.5 h-3.5" />
                    </button>
                </div>
                <Editor
                    height={block.type === 'section' ? '280px' : '90px'}
                    defaultLanguage="markdown"
                    value={block.content}
                    onChange={val => onChange(block.id, val || '')}
                    onMount={handleMount}
                    theme="vs-dark"
                    options={{
                        minimap: { enabled: false }, lineNumbers: 'off', wordWrap: 'on',
                        fontSize: 13, padding: { top: 8, bottom: 8 }, scrollBeyondLastLine: false,
                        fontFamily: 'JetBrains Mono, monospace', quickSuggestions: true,
                        snippetSuggestions: 'inline', autoClosingBrackets: 'always',
                        autoClosingQuotes: 'always', formatOnType: true,
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
            <div className="absolute -left-5 top-0 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                <div className="p-1 bg-white rounded shadow-sm border border-gray-200 cursor-pointer hover:text-indigo-600">
                    <Edit3 className="w-3 h-3" />
                </div>
            </div>
            {renderContent(block.content)}
        </div>
    );
};
