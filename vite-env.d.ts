/// <reference types="vite/client" />

// Declare URL imports for Vite
declare module '*.mjs?url' {
  const url: string;
  export default url;
}

declare module '*?url' {
  const url: string;
  export default url;
}

// PDF.js worker type
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const url: string;
  export default url;
}
