import React, { useState, useRef, useEffect } from 'react';
import { MOCK_PAPERS } from '../constants';
import { Highlighter, Share, ZoomIn, ZoomOut, Plus, Check, StickyNote, Copy, Loader2, BookOpen } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useProjectStore } from '../stores/projectStore';
import * as api from '../lib/api-client';
import { Paper } from '../types';

// Initialize Worker
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

interface WorkspaceReadingProps {
  paperId: string | null;
  onAddToProject?: (id: string) => void;
  isSaved?: boolean;
}

export const WorkspaceReading: React.FC<WorkspaceReadingProps> = ({ paperId, onAddToProject, isSaved = false }) => {
  const { activeProject } = useProjectStore();
  const [paper, setPaper] = useState<Paper | null>(null);

  // PDF Viewer State
  const [zoom, setZoom] = useState(1.0);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<{ x: number, y: number, text: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paperId) return;

    const loadPaper = async () => {
      // 1. Check Mock Papers First
      const mock = MOCK_PAPERS.find(p => p.id === paperId);
      if (mock) {
        setPaper(mock);
        return;
      }

      // 2. Fetch Real Paper Metadata
      try {
        const realPaper = await api.fetchPaper(paperId);
        setPaper(realPaper);
      } catch (e) {
        console.error("Failed to load paper", e);
        // Fallback UI
        setPaper({
          id: paperId,
          title: 'Error Loading Paper',
          authors: [],
          year: 2024,
          summary: 'Could not fetch metadata.',
          tags: [],
          pdfUrl: ''
        });
      }
    };

    loadPaper();
  }, [paperId]);

  // Handle Zoom
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 2.5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.6));

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  // Handle Selection for custom menu
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();

      if (!selection || selection.isCollapsed || !containerRef.current?.contains(selection.anchorNode)) {
        return;
      }

      if (selection.toString().trim().length === 0) {
        setSelectionMenu(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setSelectionMenu({
        x: rect.left + (rect.width / 2),
        y: rect.top - 10,
        text: selection.toString()
      });
    };

    const handleMouseUp = () => {
      setTimeout(handleSelectionChange, 10);
    }

    const handleScroll = () => {
      if (selectionMenu) setSelectionMenu(null);
    }

    document.addEventListener('mouseup', handleMouseUp);
    if (containerRef.current) containerRef.current.addEventListener('scroll', handleScroll);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      if (containerRef.current) containerRef.current.removeEventListener('scroll', handleScroll);
    };
  }, [selectionMenu]);

  const handleCopy = () => {
    if (selectionMenu) {
      navigator.clipboard.writeText(selectionMenu.text);
      setSelectionMenu(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  if (!paper) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex-1 flex flex-col bg-gray-100 h-full relative overflow-hidden">
      {/* Toolbar */}
      <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 shadow-sm z-20 overflow-x-auto overflow-y-hidden shrink-0">
        <div className="flex items-center gap-3 overflow-hidden mr-4">
          <div className="bg-red-50 p-1.5 rounded text-red-600">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="font-semibold text-gray-700 truncate max-w-[150px] md:max-w-md" title={paper.title}>{paper.title}</div>
        </div>

        <div className="flex items-center gap-2 shrink-0">

          <button
            onClick={() => onAddToProject && onAddToProject(paper.id)}
            disabled={isSaved}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all mr-2 ${isSaved ? 'bg-green-50 text-green-600' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
          >
            {isSaved ? (
              <>
                <Check className="w-4 h-4" /> <span className="hidden sm:inline">Saved</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Context</span>
              </>
            )}
          </button>

          <div className="h-4 w-px bg-gray-300 mx-2 hidden sm:block"></div>

          {/* Page Info */}
          <div className="text-xs font-mono text-gray-500 hidden sm:block">
            {numPages ? `${numPages} Pages` : 'Loading...'}
          </div>

          <div className="h-4 w-px bg-gray-300 mx-2 hidden sm:block"></div>

          <button onClick={handleZoomOut} className="p-2 text-gray-500 hover:bg-gray-100 rounded hidden sm:block" title="Zoom Out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-gray-500 hidden sm:block w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} className="p-2 text-gray-500 hover:bg-gray-100 rounded hidden sm:block" title="Zoom In">
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-gray-300 mx-2 hidden sm:block"></div>

          <button className="p-2 text-gray-500 hover:bg-gray-100 rounded">
            <Share className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Floating Action Menu (Text Selection) */}
      {selectionMenu && (
        <div
          className="fixed z-50 flex items-center bg-gray-900 text-white rounded-lg shadow-xl py-1 px-2 transform -translate-x-1/2 -translate-y-full animate-in fade-in zoom-in-95 duration-150"
          style={{ top: selectionMenu.y, left: selectionMenu.x }}
        >
          <button className="p-2 hover:bg-gray-700 rounded transition-colors flex flex-col items-center gap-0.5 group" title="Highlight">
            <Highlighter className="w-4 h-4 text-yellow-400" />
          </button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <button className="p-2 hover:bg-gray-700 rounded transition-colors flex flex-col items-center gap-0.5 group" title="Add Note">
            <StickyNote className="w-4 h-4 text-blue-400" />
          </button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <button onClick={handleCopy} className="p-2 hover:bg-gray-700 rounded transition-colors flex flex-col items-center gap-0.5 group" title="Copy Text">
            <Copy className="w-4 h-4 text-gray-300" />
          </button>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
        </div>
      )}

      {/* PDF View Area */}
      <div ref={containerRef} className="flex-1 overflow-y-scroll p-4 md:p-8 flex justify-center bg-gray-200/50 scroll-smooth">
        <Document
          file={paper.pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          className="flex flex-col items-center gap-8 outline-none"
          loading={
            <div className="flex flex-col items-center gap-6">
              <div className="w-[600px] h-[800px] bg-white flex flex-col items-center justify-center text-gray-400 gap-3 rounded-sm shadow-sm">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <span>Loading Document...</span>
              </div>
            </div>
          }
          error={
            <div className="w-[600px] h-[800px] bg-white flex flex-col items-center justify-center text-red-400 gap-3 p-12 text-center rounded shadow-lg">
              <p className="font-bold">Failed to load PDF.</p>
              <p className="text-sm text-gray-500">
                {paper.pdfUrl ? 'Could not load file from server.' : 'No PDF source found.'}
                <br />
                {paper.pdfUrl && <span className="text-xs break-all mt-2 block">{paper.pdfUrl}</span>}
              </p>
            </div>
          }
        >
          {numPages && Array.from(new Array(numPages), (el, index) => (
            <Page
              key={`page_${index + 1}`}
              pageNumber={index + 1}
              scale={zoom}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="shadow-xl bg-white"
              loading={
                <div className="w-[600px] h-[800px] bg-white flex items-center justify-center text-gray-300 shadow-md">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              }
            />
          ))}
        </Document>
      </div>
    </div>
  );
};
