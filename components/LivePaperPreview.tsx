/**
 * Live Paper Preview Component
 * Shows formatted paper with citation format applied
 */

import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';

interface LivePaperPreviewProps {
  content: string;
  citationFormat: 'IEEE' | 'APA' | 'Chicago' | 'MLA';
}

interface FormattedCitation {
  authors: string[];
  year: number;
  title: string;
  source: string;
}

/**
 * Format citations to IEEE style
 * IEEE: [#] Author et al., "Title," Source, year.
 */
const formatIEEE = (content: string): string => {
  // Add [#] before citations like [1], [2], etc.
  return content.replace(/\[\d+\]/g, match => {
    return `<span class="citation-ieee">${match}</span>`;
  });
};

/**
 * Format citations to APA style
 * APA: (Author, Year) or Author (Year)
 */
const formatAPA = (content: string): string => {
  return content.replace(/\(([^,]+),\s*(\d{4})\)/g, (match, author, year) => {
    return `<span class="citation-apa">(${author}, ${year})</span>`;
  });
};

/**
 * Format citations to Chicago style
 * Chicago: Superscript numbers or Author (Year)
 */
const formatChicago = (content: string): string => {
  return content.replace(/\[(\d+)\]/g, (match, num) => {
    return `<span class="citation-chicago"><sup>${num}</sup></span>`;
  });
};

/**
 * Format citations to MLA style
 * MLA: (Author Page) inline with text
 */
const formatMLA = (content: string): string => {
  return content.replace(/\(([^)]+)\)/g, (match) => {
    return `<span class="citation-mla">${match}</span>`;
  });
};

export const LivePaperPreview: React.FC<LivePaperPreviewProps> = ({
  content,
  citationFormat
}) => {
  const [formattedContent, setFormattedContent] = useState('');

  useEffect(() => {
    let formatted = content;

    // Apply citation formatting based on selected format
    switch (citationFormat) {
      case 'IEEE':
        formatted = formatIEEE(formatted);
        break;
      case 'APA':
        formatted = formatAPA(formatted);
        break;
      case 'Chicago':
        formatted = formatChicago(formatted);
        break;
      case 'MLA':
        formatted = formatMLA(formatted);
        break;
    }

    setFormattedContent(formatted);
  }, [content, citationFormat]);

  return (
    <div className="h-full bg-gray-50 overflow-y-auto">
      {/* Preview Styles */}
      <style>{`
        .paper-preview {
          max-width: 8.5in;
          height: auto;
          margin: 0.5in auto;
          padding: 1in;
          background: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          font-family: 'Georgia', serif;
          line-height: 1.6;
          color: #333;
        }

        .paper-preview h1 {
          font-size: 1.5em;
          font-weight: bold;
          text-align: center;
          margin: 0 0 1em 0;
        }

        .paper-preview h2 {
          font-size: 1.2em;
          font-weight: bold;
          margin: 1em 0 0.5em 0;
          border-bottom: 1px solid #ccc;
          padding-bottom: 0.25em;
        }

        .paper-preview h3 {
          font-size: 1.1em;
          font-weight: bold;
          margin: 0.75em 0 0.5em 0;
        }

        .paper-preview p {
          margin: 0.5em 0;
          text-align: justify;
        }

        .paper-preview ul, .paper-preview ol {
          margin: 0.5em 0 0.5em 2em;
        }

        .paper-preview li {
          margin: 0.25em 0;
        }

        .citation-ieee {
          color: #0066cc;
          font-weight: 500;
        }

        .citation-apa {
          color: #0066cc;
          font-style: italic;
        }

        .citation-chicago {
          color: #0066cc;
        }

        .citation-chicago sup {
          font-size: 0.8em;
          vertical-align: super;
        }

        .citation-mla {
          color: #0066cc;
        }

        .paper-preview blockquote {
          margin: 1em 2em;
          padding-left: 1em;
          border-left: 3px solid #ddd;
          font-style: italic;
          color: #666;
        }

        .paper-preview code {
          background: #f4f4f4;
          padding: 0.2em 0.4em;
          border-radius: 3px;
          font-family: 'Courier New', monospace;
          font-size: 0.9em;
        }

        .paper-preview pre {
          background: #f4f4f4;
          padding: 1em;
          border-radius: 5px;
          overflow-x: auto;
          margin: 0.5em 0;
        }

        .paper-preview pre code {
          background: none;
          padding: 0;
        }

        .paper-preview table {
          width: 100%;
          border-collapse: collapse;
          margin: 1em 0;
        }

        .paper-preview th, .paper-preview td {
          border: 1px solid #ddd;
          padding: 0.5em;
          text-align: left;
        }

        .paper-preview th {
          background: #f9f9f9;
          font-weight: bold;
        }

        .paper-preview img {
          max-width: 100%;
          height: auto;
          margin: 1em 0;
        }

        .empty-state {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #999;
          font-style: italic;
        }
      `}</style>

      {content.trim() ? (
        <div
          className="paper-preview"
          dangerouslySetInnerHTML={{
            __html: formattedContent
              .split('\n')
              .map(line => {
                // Basic markdown-style formatting
                if (line.startsWith('# ')) {
                  return `<h1>${line.substring(2)}</h1>`;
                }
                if (line.startsWith('## ')) {
                  return `<h2>${line.substring(3)}</h2>`;
                }
                if (line.startsWith('### ')) {
                  return `<h3>${line.substring(4)}</h3>`;
                }
                if (line.startsWith('- ')) {
                  return `<li>${line.substring(2)}</li>`;
                }
                if (line.startsWith('> ')) {
                  return `<blockquote>${line.substring(2)}</blockquote>`;
                }
                // Apply inline bold and italic
                let formatted = line
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\*(.*?)\*/g, '<em>$1</em>')
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                return formatted ? `<p>${formatted}</p>` : '';
              })
              .join('\n')
          }}
        />
      ) : (
        <div className="empty-state">
          <div>Start drafting to see live preview...</div>
        </div>
      )}
    </div>
  );
};

export default LivePaperPreview;
