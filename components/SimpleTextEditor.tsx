/**
 * Simple Text Editor for Paper Drafting
 * Basic textarea with live preview support
 */

import React, { useRef, useEffect, useState } from 'react';
import { Type, Copy, Download, FileText, Check } from 'lucide-react';
import Markdown from 'react-markdown';

interface SimpleTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  onPreviewUpdate?: (preview: string) => void;
  citationFormat?: 'IEEE' | 'APA' | 'Chicago' | 'MLA';
  onFormatChange?: (format: 'IEEE' | 'APA' | 'Chicago' | 'MLA') => void;
  isStreaming?: boolean;
}

export const SimpleTextEditor: React.FC<SimpleTextEditorProps> = ({
  content,
  onChange,
  onPreviewUpdate,
  citationFormat = 'IEEE',
  onFormatChange,
  isStreaming = false
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [wordCount, setWordCount] = useState(0);
  const [characterCount, setCharacterCount] = useState(0);
  const [copied, setCopied] = useState(false);

  // Update stats on content change
  useEffect(() => {
    setCharacterCount(content.length);
    setWordCount(content.trim().split(/\s+/).filter(w => w.length > 0).length);
    
    if (onPreviewUpdate) {
      onPreviewUpdate(content);
    }
  }, [content, onPreviewUpdate]);

  // Auto-scroll textarea to bottom while streaming
  useEffect(() => {
    if (textareaRef.current && isStreaming) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [content, isStreaming]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'paper.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="bg-gray-100 border-b border-gray-300 p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Type size={16} className="text-gray-600" />
            <span className="text-sm text-gray-700 font-medium">Citation Format:</span>
          </div>
          <select
            value={citationFormat}
            onChange={(e) => onFormatChange?.(e.target.value as any)}
            className="px-3 py-1 text-sm border border-gray-300 rounded bg-white text-gray-900 hover:border-gray-400"
          >
            <option value="IEEE">IEEE</option>
            <option value="APA">APA</option>
            <option value="Chicago">Chicago</option>
            <option value="MLA">MLA</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span>{wordCount} words</span>
          <span>•</span>
          <span>{characterCount} characters</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Copy text"
          >
            {copied ? (
              <Check size={16} className="text-green-600" />
            ) : (
              <Copy size={16} className="text-gray-600" />
            )}
          </button>
          <button
            onClick={handleDownload}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Download as text file"
          >
            <Download size={16} className="text-gray-600" />
          </button>
        </div>
      </div>

      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 p-6 font-serif text-gray-900 resize-none focus:outline-none bg-white"
        placeholder="Start drafting your paper here. Sections will stream in word-by-word as you generate them..."
        spellCheck="true"
      />

      {/* Streaming indicator */}
      {isStreaming && (
        <div className="bg-blue-50 border-t border-blue-200 px-4 py-2 flex items-center gap-2 text-sm text-blue-700">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
          </div>
          <span>Drafting in progress...</span>
        </div>
      )}
    </div>
  );
};

export default SimpleTextEditor;
