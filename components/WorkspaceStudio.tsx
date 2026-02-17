
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Download, RefreshCw, Maximize, Minimize,
    Printer, Edit3, Check, PlusCircle, Trash2,
    LayoutTemplate, ChevronDown, ChevronLeft, ChevronRight, Undo2, Redo2,
    FileText
} from 'lucide-react';
import { Project } from '../types';
import Editor from '@monaco-editor/react';
import Markdown from 'react-markdown';
import { useToastStore } from '../stores/toastStore';
import { saveDraft, loadDraft } from '../lib/api-client';

// ─── A4 / page geometry ───────────────────────────────────────────────────────
const A4_W_MM  = 210;
const A4_H_MM  = 297;
const GAP_MM   = 10;   // grey gap between pages in the viewer

// Springer LNCS exact margins (mm)
// Running header sits at 15mm from top, content area starts at 49mm
const SPR_HDR_MM  = 15;   // running header baseline from top
const SPR_MT_MM   = 49;   // top margin (content starts here)
const SPR_MB_MM   = 27;   // bottom margin (page number at ~287mm from top)
const SPR_MS_MM   = 25;   // side margins (left & right)
const SPR_BODY_H  = A4_H_MM - SPR_MT_MM - SPR_MB_MM; // ≈221mm printable

// IEEE Conference exact margins (mm)
const IEEE_HDR_MM = 14;   // header / conference name area
const IEEE_MT_MM  = 19;   // top margin
const IEEE_MB_MM  = 43;   // bottom margin (larger for IEEE footer)
const IEEE_MS_MM  = 13;   // side margins
const IEEE_BODY_H = A4_H_MM - IEEE_MT_MM - IEEE_MB_MM; // ≈235mm printable

// PX per MM at 96dpi
const PX_PER_MM = 96 / 25.4;

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface Block {
    id: string;
    type: 'title' | 'authors' | 'abstract' | 'keywords' | 'section';
    heading?: string;
    content: string;
}

interface TemplateConfig {
    name: string;
    // page geometry
    mt: number; mb: number; ms: number;
    hdrMm: number;
    bodyH: number;
    cols: 1 | 2;
    colGap?: number;
    // typography
    fontFamily: string;
    fontSize: string;
    lineHeight: string;
    // title block
    titleSize: string;
    titleWeight: string;
    // abstract indent
    abstractIndent?: string;
    // section heading
    sectionSize: string;
    sectionWeight: string;
    sectionAlign?: string;
    sectionVariant?: string;
    // running header style
    hdrStyle?: string;
}

const TEMPLATES: Record<string, TemplateConfig> = {
    SPRINGER: {
        name: 'Springer LNCS (A4)',
        mt: SPR_MT_MM, mb: SPR_MB_MM, ms: SPR_MS_MM,
        hdrMm: SPR_HDR_MM, bodyH: SPR_BODY_H,
        cols: 1,
        fontFamily: "'Times New Roman', Times, serif",
        fontSize: '10pt', lineHeight: '1.2',
        titleSize: '14pt', titleWeight: 'bold',
        abstractIndent: '10mm',
        sectionSize: '11pt', sectionWeight: 'bold', sectionAlign: 'left',
        hdrStyle: 'italic',
    },
    IEEE: {
        name: 'IEEE Conference (A4)',
        mt: IEEE_MT_MM, mb: IEEE_MB_MM, ms: IEEE_MS_MM,
        hdrMm: IEEE_HDR_MM, bodyH: IEEE_BODY_H,
        cols: 2, colGap: 5,
        fontFamily: "'Times New Roman', Times, serif",
        fontSize: '10pt', lineHeight: '1.15',
        titleSize: '20pt', titleWeight: 'normal',
        abstractIndent: '12mm',
        sectionSize: '10pt', sectionWeight: 'bold',
        sectionAlign: 'center', sectionVariant: 'small-caps',
        hdrStyle: 'normal',
    },
};

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

// ─── Main component ───────────────────────────────────────────────────────────
export const WorkspaceStudio: React.FC<WorkspaceStudioProps> = ({
    activeProject,
    content,
    onChange,
    activeFileName,
    onUndo, onRedo, canUndo, canRedo,
    onOpenPaper,
    isStreaming = false,
}) => {
    const [blocks,        setBlocks]        = useState<Block[]>([]);
    const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
    const [zoom,          setZoom]          = useState(100);
    const [activeTemplate, setActiveTemplate] = useState<string>('SPRINGER');
    const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
    const [isRefactoring, setIsRefactoring] = useState(false);
    const [currentPage,  setCurrentPage]   = useState(1);
    const [totalPages,   setTotalPages]    = useState(1);

    const { addToast } = useToastStore();
    const viewportRef   = useRef<HTMLDivElement>(null);
    const canvasRef     = useRef<HTMLDivElement>(null);
    const measureRef    = useRef<HTMLDivElement>(null); // off-screen measure

    const isStreamingRef = useRef(isStreaming);
    useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);

    const tmpl = TEMPLATES[activeTemplate] ?? TEMPLATES['SPRINGER'];

    // ── Parse markdown → blocks ───────────────────────────────────────────────
    useEffect(() => {
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
                    const authorIdx = buffer.findIndex(l => l.includes('**Authors:**') || l.startsWith('> '));
                    if (authorIdx !== -1) {
                        const authorText = buffer.slice(authorIdx + 1).join('\n').trim()
                            || buffer[authorIdx].replace(/^>\s*/, '').replace('**Authors:**', '').trim();
                        if (authorText) newBlocks.push({ id: 'meta-authors', type: 'authors', content: authorText });
                    }
                } else if (currentType === 'abstract') {
                    const blockContent = buffer.join('\n').trim();
                    if (blockContent) newBlocks.push({ id: 'meta-abstract', type: 'abstract', heading: 'Abstract', content: blockContent });
                } else if (currentType === 'keywords') {
                    const blockContent = buffer.join('\n').trim();
                    if (blockContent) newBlocks.push({ id: 'meta-keywords', type: 'keywords', content: blockContent });
                } else if (currentType === 'section') {
                    const blockContent = buffer.join('\n').trim();
                    if (blockContent || currentHeading) {
                        newBlocks.push({ id: `blk-${newBlocks.length}`, type: 'section', heading: currentHeading, content: blockContent });
                    }
                }
            }
            buffer = [];
            if (nextType) { currentType = nextType; currentHeading = nextHeading; }
        };

        lines.forEach(line => {
            if      (line.match(/^##\s+Abstract/i))  flush('abstract');
            else if (line.match(/^##\s+Keywords/i))  flush('keywords');
            else if (line.match(/^##\s+/))            flush('section', line.replace(/^##\s*/, '').trim());
            else                                       buffer.push(line);
        });
        flush();
        setBlocks(newBlocks);
    }, [content, editingBlockId]);

    // ── Reconstruct markdown from blocks ──────────────────────────────────────
    const saveBlocks = useCallback((updated: Block[]) => {
        let md = '';
        updated.forEach(b => {
            if      (b.type === 'title')    md += `# ${b.content}\n\n`;
            else if (b.type === 'authors')  md += `**Authors:**\n${b.content}\n\n`;
            else if (b.type === 'abstract') md += `## Abstract\n${b.content}\n\n`;
            else if (b.type === 'keywords') md += `## Keywords\n${b.content}\n\n`;
            else if (b.type === 'section')  md += `## ${b.heading}\n${b.content}\n\n`;
        });
        onChange(md);
        setBlocks(updated);
    }, [onChange]);

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

    // ── Draft persistence ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!activeProject?.id) return;
        loadDraft(activeProject.id).then(draft => {
            if (draft.full_content && draft.full_content !== content) onChange(draft.full_content);
        }).catch(() => {});
    }, [activeProject?.id]);

    useEffect(() => {
        if (!activeProject?.id || !content) return;
        const t = setTimeout(() => {
            saveDraft(activeProject.id, null, content).catch(() => {});
        }, 3000);
        return () => clearTimeout(t);
    }, [activeProject?.id, content]);

    // ── Measure content → page count ─────────────────────────────────────────
    // We render a hidden off-screen div with the same width/font as one body
    // column, measure its height, then divide by bodyH to get page count.
    useEffect(() => {
        const measure = () => {
            if (!measureRef.current) return;
            const h = measureRef.current.getBoundingClientRect().height / PX_PER_MM;
            // For 2-col (IEEE) the measure div uses 2 cols so reported height is halved already
            const pages = Math.max(1, Math.ceil(h / tmpl.bodyH));
            setTotalPages(pages);
        };
        const ro = new ResizeObserver(measure);
        if (measureRef.current) ro.observe(measureRef.current);
        measure();
        return () => ro.disconnect();
    }, [blocks, activeTemplate]);

    // ── Scroll → current page ─────────────────────────────────────────────────
    const VIEWPORT_PAD = 40; // px, from .paper-viewport padding-top
    useEffect(() => {
        const updatePage = () => {
            if (!viewportRef.current) return;
            const zf = zoom / 100;
            const sy = (viewportRef.current.scrollTop - VIEWPORT_PAD * zf) / zf;
            const unitPx = (A4_H_MM + GAP_MM) * PX_PER_MM;
            setCurrentPage(Math.min(totalPages, Math.max(1, Math.floor(sy / unitPx) + 1)));
        };
        const vp = viewportRef.current;
        if (!vp) return;
        vp.addEventListener('scroll', updatePage);
        return () => vp.removeEventListener('scroll', updatePage);
    }, [zoom, totalPages]);

    const scrollToPage = (p: number) => {
        if (!viewportRef.current) return;
        const target = Math.max(1, Math.min(p, totalPages));
        const zf = zoom / 100;
        const unitPx = (A4_H_MM + GAP_MM) * PX_PER_MM;
        viewportRef.current.scrollTo({ top: VIEWPORT_PAD * zf + (target - 1) * unitPx * zf, behavior: 'smooth' });
    };

    const handleTemplateSwitch = (key: string) => {
        setIsRefactoring(true);
        setTemplateMenuOpen(false);
        setTimeout(() => { setActiveTemplate(key); setIsRefactoring(false); }, 400);
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full bg-[#525659] font-sans overflow-hidden">
            <style>{`
                .editable-hover:hover { background: rgba(238,242,255,0.5); outline: 1px dashed #c7d2fe; }
                @media print {
                    .paper-viewport { padding: 0 !important; background: white !important; }
                }
            `}</style>

            {/* ── TOOLBAR ── */}
            <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 z-30 shadow-sm print:hidden">
                <div className="flex items-center gap-3">
                    <span className="font-bold text-gray-700 flex items-center gap-2">
                        <Printer className="w-4 h-4 text-indigo-600" /> Live Paper
                    </span>

                    {/* Template picker */}
                    <div className="relative">
                        <button
                            onClick={() => setTemplateMenuOpen(v => !v)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md text-xs font-semibold text-gray-700"
                        >
                            <LayoutTemplate className="w-3.5 h-3.5 text-gray-400" />
                            {TEMPLATES[activeTemplate]?.name ?? activeTemplate}
                            <ChevronDown className="w-3 h-3 text-gray-400" />
                        </button>
                        {templateMenuOpen && (
                            <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1">
                                {Object.entries(TEMPLATES).map(([key, t]) => (
                                    <button key={key} onClick={() => handleTemplateSwitch(key)}
                                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between
                                            ${activeTemplate === key ? 'bg-indigo-50 text-indigo-600 font-bold' : 'hover:bg-gray-50 text-gray-700'}`}>
                                        {t.name}
                                        {activeTemplate === key && <Check className="w-3 h-3" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Zoom */}
                    <div className="flex items-center gap-0.5 bg-gray-100 rounded px-1">
                        <button onClick={() => setZoom(z => Math.max(40, z - 10))} className="p-1 hover:bg-white rounded text-gray-500">
                            <Minimize className="w-3 h-3" />
                        </button>
                        <span className="text-xs w-9 text-center font-medium">{zoom}%</span>
                        <button onClick={() => setZoom(z => Math.min(160, z + 10))} className="p-1 hover:bg-white rounded text-gray-500">
                            <Maximize className="w-3 h-3" />
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5 border-r border-gray-200 pr-2 mr-1">
                        <button onClick={onUndo} disabled={!canUndo} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded disabled:opacity-30" title="Undo">
                            <Undo2 className="w-4 h-4" />
                        </button>
                        <button onClick={onRedo} disabled={!canRedo} className="p-1.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded disabled:opacity-30" title="Redo">
                            <Redo2 className="w-4 h-4" />
                        </button>
                    </div>
                    <button onClick={addNewSection} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded text-xs font-bold">
                        <PlusCircle className="w-3.5 h-3.5" /> Add Section
                    </button>
                    <button onClick={() => window.print()} className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 text-white hover:bg-gray-700 rounded text-xs font-bold">
                        <Download className="w-3.5 h-3.5" /> Export PDF
                    </button>
                </div>
            </div>

            {/* ── VIEWPORT ── */}
            <div
                ref={viewportRef}
                className="flex-1 overflow-y-scroll relative print:overflow-visible"
                style={{ background: '#525659', padding: `${VIEWPORT_PAD}px 0` }}
            >
                {isRefactoring && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                        <div className="bg-white p-6 rounded-xl shadow-2xl flex flex-col items-center gap-3">
                            <RefreshCw className="w-7 h-7 text-indigo-600 animate-spin" />
                            <p className="text-sm font-semibold">Switching to {TEMPLATES[activeTemplate]?.name}…</p>
                        </div>
                    </div>
                )}

                {/* Off-screen measure div — same font/cols as body, no clip */}
                <MeasureDiv ref={measureRef} tmpl={tmpl} blocks={blocks} />

                {/* Canvas: flex col of page+gap */}
                <div
                    ref={canvasRef}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        width: `${A4_W_MM}mm`,
                        margin: '0 auto',
                        paddingBottom: `${VIEWPORT_PAD}px`,
                        zoom: zoom / 100,
                        transformOrigin: 'top center',
                    }}
                >
                    {blocks.length === 0 ? (
                        <EmptyPage tmpl={tmpl} />
                    ) : (
                        <>
                            {Array.from({ length: totalPages }, (_, i) => (
                                <React.Fragment key={i}>
                                    {i > 0 && (
                                        <div style={{
                                            width: `${A4_W_MM}mm`, height: `${GAP_MM}mm`,
                                            background: '#525659',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: '#aaa', fontSize: '8pt',
                                            fontFamily: 'Times New Roman, serif',
                                            letterSpacing: '0.1em',
                                            flexShrink: 0,
                                            userSelect: 'none',
                                        }}>
                                            — {i + 1} —
                                        </div>
                                    )}
                                    <PaperPage
                                        pageIndex={i}
                                        totalPages={totalPages}
                                        tmpl={tmpl}
                                        activeTemplate={activeTemplate}
                                        blocks={blocks}
                                        editingBlockId={editingBlockId}
                                        setEditingBlockId={setEditingBlockId}
                                        handleBlockChange={handleBlockChange}
                                        handleHeadingChange={handleHeadingChange}
                                        deleteBlock={deleteBlock}
                                        onOpenPaper={onOpenPaper}
                                        activeProject={activeProject}
                                        activeFileName={activeFileName}
                                    />
                                </React.Fragment>
                            ))}
                        </>
                    )}
                </div>
            </div>

            {/* ── PAGINATION PILL ── */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 print:hidden">
                <div className="bg-gray-900 text-white rounded-full shadow-2xl px-4 py-2 flex items-center gap-3 text-sm font-medium border border-gray-700/50">
                    <button onClick={() => scrollToPage(currentPage - 1)} disabled={currentPage <= 1}
                        className="p-1 hover:bg-gray-700 rounded-full disabled:opacity-30">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-gray-400 text-xs">Page</span>
                    <input type="number" min={1} max={totalPages} value={currentPage}
                        onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) scrollToPage(v); }}
                        className="w-7 bg-transparent text-center focus:outline-none font-bold text-sm" />
                    <span className="text-gray-400 text-xs">of {totalPages}</span>
                    <button onClick={() => scrollToPage(currentPage + 1)} disabled={currentPage >= totalPages}
                        className="p-1 hover:bg-gray-700 rounded-full disabled:opacity-30">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── MeasureDiv ───────────────────────────────────────────────────────────────
// Hidden off-screen div that holds all content (no clip) for measuring height.
const MeasureDiv = React.forwardRef<HTMLDivElement, { tmpl: TemplateConfig; blocks: Block[] }>(
    ({ tmpl, blocks }, ref) => (
        <div
            ref={ref}
            style={{
                position: 'fixed',
                top: '-99999px',
                left: '-99999px',
                width: `${A4_W_MM - tmpl.ms * 2}mm`,
                height: 'auto',
                overflow: 'visible',
                visibility: 'hidden',
                pointerEvents: 'none',
                fontFamily: tmpl.fontFamily,
                fontSize: tmpl.fontSize,
                lineHeight: tmpl.lineHeight,
                columnCount: tmpl.cols,
                columnGap: tmpl.colGap ? `${tmpl.colGap}mm` : undefined,
            }}
        >
            {/* Front matter */}
            {blocks.filter(b => ['title','authors','abstract','keywords'].includes(b.type)).map(b => (
                <div key={b.id}>{b.content}</div>
            ))}
            {/* Body sections */}
            {blocks.filter(b => b.type === 'section').map((b, i) => (
                <div key={b.id} style={{ breakInside: 'avoid-column' }}>
                    <div style={{ fontWeight: b.type === 'section' ? 'bold' : 'normal' }}>{i + 1}. {b.heading}</div>
                    <div>{b.content}</div>
                </div>
            ))}
        </div>
    )
);

// ─── EmptyPage ────────────────────────────────────────────────────────────────
const EmptyPage: React.FC<{ tmpl: TemplateConfig }> = ({ tmpl }) => (
    <div style={{
        width: `${A4_W_MM}mm`, height: `${A4_H_MM}mm`,
        background: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        padding: `${tmpl.mt}mm ${tmpl.ms}mm ${tmpl.mb}mm ${tmpl.ms}mm`,
        boxSizing: 'border-box',
    }}>
        <div style={{ textAlign: 'center', color: '#9ca3af' }}>
            <FileText style={{ width: 40, height: 40, margin: '0 auto 12px', opacity: 0.3 }} />
            <p style={{ fontSize: '10pt', fontFamily: tmpl.fontFamily }}>Your paper will appear here</p>
            <p style={{ fontSize: '8pt', opacity: 0.6, marginTop: 4, fontFamily: tmpl.fontFamily }}>
                Draft sections using the Co-Author panel →
            </p>
        </div>
    </div>
);

// ─── PaperPage ────────────────────────────────────────────────────────────────
// Each A4 page is a fixed-size clip window.
// Inside it we render the FULL content stream but shift it up so only
// this page's slice is visible.  The shift = pageIndex × bodyH.
// For page 0 there is no shift — the stream starts at the top of page 1.
interface PaperPageProps {
    pageIndex: number;
    totalPages: number;
    tmpl: TemplateConfig;
    activeTemplate: string;
    blocks: Block[];
    editingBlockId: string | null;
    setEditingBlockId: (id: string | null) => void;
    handleBlockChange: (id: string, v: string) => void;
    handleHeadingChange: (id: string, v: string) => void;
    deleteBlock: (id: string) => void;
    onOpenPaper?: (paperId: string, page?: number, highlightText?: string) => void;
    activeProject?: Project | null;
    activeFileName?: string;
}

const PaperPage: React.FC<PaperPageProps> = ({
    pageIndex, totalPages, tmpl, activeTemplate, blocks,
    editingBlockId, setEditingBlockId,
    handleBlockChange, handleHeadingChange, deleteBlock,
    onOpenPaper, activeProject, activeFileName,
}) => {
    // How many mm to shift the inner content stream upward
    const shiftMm = pageIndex * tmpl.bodyH;
    const title  = blocks.find(b => b.type === 'title')?.content  ?? activeFileName ?? 'Untitled';
    const authors = blocks.find(b => b.type === 'authors')?.content ?? '';
    const authorShort = authors.split('\n')[0]?.split(',')[0]?.trim() ?? 'Authors';

    // Running header text (left = author et al., right = short title)
    const hdrLeft  = authorShort ? `${authorShort} et al.` : '';
    const hdrRight = title.length > 50 ? title.slice(0, 48) + '…' : title;

    return (
        <div style={{
            width: `${A4_W_MM}mm`,
            height: `${A4_H_MM}mm`,
            background: 'white',
            boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
            overflow: 'hidden',
            position: 'relative',
            boxSizing: 'border-box',
            flexShrink: 0,
            color: '#000',
            fontFamily: tmpl.fontFamily,
            fontSize: tmpl.fontSize,
            lineHeight: tmpl.lineHeight,
        }}>
            {/* ── Running header ── */}
            <div style={{
                position: 'absolute',
                top: `${tmpl.hdrMm}mm`,
                left: `${tmpl.ms}mm`,
                right: `${tmpl.ms}mm`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                borderBottom: '1px solid #000',
                paddingBottom: '2pt',
                fontSize: '9pt',
                fontStyle: tmpl.hdrStyle === 'italic' ? 'italic' : 'normal',
            }}>
                <span>{pageIndex % 2 === 0 ? hdrLeft : hdrRight}</span>
                <span style={{ fontStyle: 'normal' }}>{pageIndex + 1}</span>
            </div>

            {/* ── Content area — clipped inner stream ── */}
            {/*
             * The inner stream renders ALL content starting from the top margin.
             * For page N we push it up by N×bodyH so the correct slice shows
             * through the page's overflow:hidden clip window.
             */}
            <div style={{
                position: 'absolute',
                top: `${tmpl.mt}mm`,
                left: `${tmpl.ms}mm`,
                right: `${tmpl.ms}mm`,
                bottom: `${tmpl.mb}mm`,
                overflow: 'hidden',
            }}>
                <div style={{
                    marginTop: shiftMm > 0 ? `-${shiftMm}mm` : undefined,
                }}>
                    {/* Front-matter block (page 1 only — hidden on other pages via clip) */}
                    <FrontMatter
                        tmpl={tmpl}
                        blocks={blocks}
                        editingBlockId={editingBlockId}
                        setEditingBlockId={setEditingBlockId}
                        handleBlockChange={handleBlockChange}
                    />

                    {/* Body columns — same height as total pages × bodyH so columns flow through */}
                    <div style={{
                        columnCount: tmpl.cols,
                        columnGap: tmpl.colGap ? `${tmpl.colGap}mm` : undefined,
                        columnFill: 'auto',
                        height: `${tmpl.bodyH * totalPages}mm`,
                        textAlign: 'justify',
                    }}>
                        {blocks.filter(b => b.type === 'section').map((block, idx) => (
                            <div key={block.id} style={{ breakInside: 'avoid-column', pageBreakInside: 'avoid' }}>
                                {/* Section heading */}
                                <div className="group" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                    {editingBlockId === block.id ? (
                                        <input
                                            value={block.heading}
                                            onChange={e => handleHeadingChange(block.id, e.target.value)}
                                            style={{
                                                fontSize: tmpl.sectionSize, fontWeight: tmpl.sectionWeight,
                                                textAlign: tmpl.sectionAlign as any,
                                                fontVariant: tmpl.sectionVariant ?? 'normal',
                                                border: 'none', borderBottom: '1px solid #6366f1',
                                                outline: 'none', width: '100%', background: 'transparent',
                                                fontFamily: tmpl.fontFamily,
                                            }}
                                            placeholder="SECTION TITLE"
                                        />
                                    ) : (
                                        <div
                                            style={{
                                                fontSize: tmpl.sectionSize, fontWeight: tmpl.sectionWeight,
                                                textAlign: tmpl.sectionAlign as any,
                                                fontVariant: tmpl.sectionVariant ?? 'normal',
                                                marginTop: '10pt', marginBottom: '5pt',
                                                cursor: 'pointer',
                                                width: '100%',
                                            }}
                                            onClick={() => setEditingBlockId(block.id)}
                                        >
                                            {idx + 1}. {block.heading?.toUpperCase?.() ?? block.heading}
                                        </div>
                                    )}
                                    {editingBlockId === block.id && (
                                        <button
                                            onClick={() => deleteBlock(block.id)}
                                            style={{ color: '#f87171', flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer' }}
                                        >
                                            <Trash2 style={{ width: 12, height: 12 }} />
                                        </button>
                                    )}
                                </div>
                                {/* Section body */}
                                <EditableBlock
                                    block={block}
                                    isEditing={editingBlockId === block.id}
                                    setEditing={setEditingBlockId}
                                    onChange={handleBlockChange}
                                    tmpl={tmpl}
                                    onOpenPaper={onOpenPaper}
                                    activeProject={activeProject}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── FrontMatter ──────────────────────────────────────────────────────────────
interface FrontMatterProps {
    tmpl: TemplateConfig;
    blocks: Block[];
    editingBlockId: string | null;
    setEditingBlockId: (id: string | null) => void;
    handleBlockChange: (id: string, v: string) => void;
}

const FrontMatter: React.FC<FrontMatterProps> = ({
    tmpl, blocks, editingBlockId, setEditingBlockId, handleBlockChange,
}) => {
    const titleBlock  = blocks.find(b => b.type === 'title');
    const authBlock   = blocks.find(b => b.type === 'authors');
    const absBlock    = blocks.find(b => b.type === 'abstract');
    const kwBlock     = blocks.find(b => b.type === 'keywords');

    if (!titleBlock && !authBlock && !absBlock) return null;

    return (
        <div style={{ marginBottom: '12pt', textAlign: 'center', fontFamily: tmpl.fontFamily }}>
            {/* Title */}
            {titleBlock && (
                <EditableBlock
                    block={titleBlock}
                    isEditing={editingBlockId === titleBlock.id}
                    setEditing={setEditingBlockId}
                    onChange={handleBlockChange}
                    tmpl={tmpl}
                    style={{
                        fontSize: tmpl.titleSize,
                        fontWeight: tmpl.titleWeight,
                        lineHeight: 1.2,
                        marginBottom: '12pt',
                        display: 'block',
                        textAlign: 'center',
                    }}
                />
            )}

            {/* Authors */}
            {authBlock && (
                <EditableBlock
                    block={authBlock}
                    isEditing={editingBlockId === authBlock.id}
                    setEditing={setEditingBlockId}
                    onChange={handleBlockChange}
                    tmpl={tmpl}
                    style={{
                        fontSize: tmpl.fontSize,
                        marginBottom: '8pt',
                        display: 'block',
                        textAlign: 'center',
                    }}
                />
            )}

            {/* Abstract */}
            {absBlock && (
                <div style={{
                    textAlign: 'left',
                    margin: `0 ${tmpl.abstractIndent ?? 0} 10pt`,
                    fontSize: '9pt',
                }}>
                    <span style={{ fontWeight: 'bold' }}>Abstract. </span>
                    <EditableBlock
                        block={absBlock}
                        isEditing={editingBlockId === absBlock.id}
                        setEditing={setEditingBlockId}
                        onChange={handleBlockChange}
                        tmpl={tmpl}
                        inline
                    />
                </div>
            )}

            {/* Keywords */}
            {kwBlock && (
                <div style={{
                    textAlign: 'left',
                    margin: `0 ${tmpl.abstractIndent ?? 0} 10pt`,
                    fontSize: '9pt',
                }}>
                    <span style={{ fontWeight: 'bold' }}>Keywords: </span>
                    <EditableBlock
                        block={kwBlock}
                        isEditing={editingBlockId === kwBlock.id}
                        setEditing={setEditingBlockId}
                        onChange={handleBlockChange}
                        tmpl={tmpl}
                        inline
                    />
                </div>
            )}

            {/* Horizontal rule before body */}
            <hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '8pt 0' }} />
        </div>
    );
};

// ─── EditableBlock ────────────────────────────────────────────────────────────
let monacoConfigured = false;
const setupMonaco = (monaco: any) => {
    if (monacoConfigured) return;
    monacoConfigured = true;
    monaco.editor.defineTheme('scholar-dark', {
        base: 'vs-dark', inherit: true, rules: [],
        colors: { 'editor.background': '#1e1e1e' },
    });
};

interface EditableBlockProps {
    block: Block;
    isEditing: boolean;
    setEditing: (id: string | null) => void;
    onChange: (id: string, v: string) => void;
    tmpl: TemplateConfig;
    inline?: boolean;
    style?: React.CSSProperties;
    onOpenPaper?: (paperId: string, page?: number, highlightText?: string) => void;
    activeProject?: Project | null;
}

const EditableBlock: React.FC<EditableBlockProps> = ({
    block, isEditing, setEditing, onChange, tmpl, inline = false, style,
}) => {
    const handleMount = (editor: any, monaco: any) => { setupMonaco(monaco); editor.focus(); };

    const renderMarkdown = (text: string) => (
        <Markdown components={{
            p:      ({ node, ...p }) => <p      {...p} style={{ margin: '0 0 4pt', textIndent: block.type === 'section' ? '3.5mm' : 0 }} />,
            strong: ({ node, ...p }) => <strong {...p} />,
            em:     ({ node, ...p }) => <em     {...p} />,
            li:     ({ node, ...p }) => <li     {...p} style={{ marginLeft: 16 }} />,
        }}>
            {text}
        </Markdown>
    );

    if (isEditing) {
        return (
            <div style={{
                border: '1px solid #6366f1',
                borderRadius: 4,
                background: '#1e1e1e',
                boxShadow: '0 0 0 3px rgba(99,102,241,0.2)',
                padding: 8,
                margin: '-8px',
                zIndex: 10,
                position: 'relative',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, borderBottom: '1px solid #333', paddingBottom: 4 }}>
                    <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 'bold', textTransform: 'uppercase', fontFamily: 'monospace' }}>
                        ✏ Editing {block.type}
                    </span>
                    <button
                        onClick={e => { e.stopPropagation(); setEditing(null); }}
                        style={{ color: '#4ade80', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                        title="Done"
                    >
                        <Check style={{ width: 14, height: 14 }} />
                    </button>
                </div>
                <Editor
                    height={block.type === 'section' ? '260px' : '80px'}
                    defaultLanguage="markdown"
                    value={block.content}
                    onChange={val => onChange(block.id, val || '')}
                    onMount={handleMount}
                    theme="scholar-dark"
                    options={{
                        minimap: { enabled: false }, lineNumbers: 'off', wordWrap: 'on',
                        fontSize: 13, padding: { top: 6, bottom: 6 },
                        scrollBeyondLastLine: false, fontFamily: 'JetBrains Mono, monospace',
                    }}
                />
            </div>
        );
    }

    const contentEl = (
        <div
            style={{
                cursor: 'pointer',
                position: 'relative',
                borderRadius: 2,
                transition: 'background 0.15s',
                ...style,
            }}
            className="editable-hover"
            onClick={() => setEditing(block.id)}
            title="Click to edit"
        >
            {block.type === 'title' || block.type === 'authors'
                ? block.content.split('\n').map((line, i) => <div key={i}>{line || <br />}</div>)
                : renderMarkdown(block.content)
            }
        </div>
    );

    return inline ? <span onClick={() => setEditing(block.id)} style={{ cursor: 'pointer' }}>{contentEl}</span> : contentEl;
};
