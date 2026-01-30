/**
 * API Client for ScholarFlow Backend
 * Axios-based client with typed API functions
 */

import axios from 'axios';
import type { 
  Project, 
  ProjectAsset, 
  Paper,
  OutlineSection 
} from '../types';

// Create axios instance
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// ===== PROJECT ENDPOINTS =====

export interface ProjectCreatePayload {
  title: string;
  description: string;
  mode: 'RESEARCH' | 'MANUSCRIPT';
  methodology?: string;
  findings?: string;
}

export const fetchProjects = async (): Promise<Project[]> => {
  const { data } = await apiClient.get('/projects');
  // Map backend response to frontend Project type
  return data.map((p: any) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    type: p.mode, // Maps 'RESEARCH' | 'MANUSCRIPT'
    lastModified: new Date(p.updated_at), // Convert string to Date
    wordCount: 0, // Default as backend doesn't send this yet
    papers: [], // Default
    files: [], // Default
    assets: [], // Default
    methodology: p.methodology,
    findings: p.findings
  }));
};

export const fetchProject = async (id: string): Promise<Project> => {
  const { data } = await apiClient.get(`/projects/${id}`);
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    type: data.mode,
    lastModified: new Date(data.updated_at),
    wordCount: 0,
    papers: (data.library_items || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        authors: p.authors || [],
        year: p.year,
        summary: p.abstract || '',
        tags: [],
        pdfUrl: p.pdf_path 
            ? `${(apiClient.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '')}/uploads/${p.pdf_path.split(/[/\\]/).pop()}` 
            : (p.url || (p.arxiv_id ? `https://arxiv.org/pdf/${p.arxiv_id}.pdf` : undefined))
    })),
    files: [],
    assets: [],
    methodology: data.methodology,
    findings: data.findings
  };
};

export const createProject = async (payload: ProjectCreatePayload): Promise<Project> => {
  const { data } = await apiClient.post('/projects', payload);
  // Map backend response
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    type: data.mode,
    lastModified: new Date(data.created_at), // Use created_at for new projects
    wordCount: 0,
    papers: [],
    files: [],
    assets: [],
    methodology: data.methodology,
    findings: data.findings
  };
};

export const generateProject = async (paperIds: string[]): Promise<Project> => {
  const { data } = await apiClient.post('/projects/generate', { paper_ids: paperIds });
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    type: data.mode,
    lastModified: new Date(data.created_at),
    wordCount: 0,
    papers: [],
    files: [],
    assets: [],
    methodology: data.methodology,
    findings: data.findings
  };
};

export const deleteProject = async (id: string): Promise<void> => {
  await apiClient.delete(`/projects/${id}`);
};

// ===== LAB ASSET ENDPOINTS =====

export const uploadLabAsset = async (
  projectId: string,
  file: File,
  name: string,
  assetType: 'image' | 'data' | 'code'
): Promise<ProjectAsset> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name);
  formData.append('asset_type', assetType);

  const { data } = await apiClient.post<any>(
    `/lab/projects/${projectId}/upload`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  );

  // Map backend response to frontend format
  const normalized = data.file_path.replace(/\\/g, '/');
  const suffix = normalized.split('uploads/').pop() || '';
  const rootUrl = (apiClient.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '');
  
  return {
    id: data.id,
    name: data.name,
    type: data.asset_type,
    url: `${rootUrl}/uploads/${suffix}`
  };
};

export const fetchLabAssets = async (projectId: string): Promise<ProjectAsset[]> => {
  const { data } = await apiClient.get<any[]>(`/lab/projects/${projectId}`);
  
  const rootUrl = (apiClient.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '');
  
  return data.map(asset => {
    const normalized = asset.file_path.replace(/\\/g, '/');
    const suffix = normalized.split('uploads/').pop() || '';
    return {
      id: asset.id,
      name: asset.name,
      type: asset.asset_type,
      url: `${rootUrl}/uploads/${suffix}`
    };
  });
};

export const reanalyzeAsset = async (
  assetId: string,
  customPrompt?: string
): Promise<{ asset_id: string; ai_description: string }> => {
  const formData = new FormData();
  if (customPrompt) {
    formData.append('custom_prompt', customPrompt);
  }

  const { data } = await apiClient.post(
    `/lab/assets/${assetId}/reanalyze`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  );

  return data;
};

export const deleteLabAsset = async (assetId: string): Promise<void> => {
  await apiClient.delete(`/lab/assets/${assetId}`);
};

// ===== CHAT/WORKFLOW ENDPOINTS =====

export interface ChatStreamPayload {
  project_id: string;
  message: string;
  selected_paper_ids: string[];
  lab_asset_ids: string[];
}

/**
 * Stream chat workflow using Server-Sent Events
 * Returns an async generator that yields events
 */
export async function* streamChatWorkflow(
  payload: ChatStreamPayload
): AsyncGenerator<{
  type: string; // broadened from specific union to allow new event types
  data?: any;
  message?: string;
  count?: number; // added for 'found' event
  answer?: any;   // added for mock answer
}> {
  const response = await fetch(`${apiClient.defaults.baseURL}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            yield data;
          } catch (e) {
            console.warn('Failed to parse SSE data:', line);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export const fetchChatHistory = async (projectId: string): Promise<any[]> => {
    try {
        const { data } = await apiClient.get<any[]>(`/projects/${projectId}/chat`);
        return data.map(msg => ({
            id: `msg-${Math.random()}`, // Backend doesn't store IDs per message in JSON yet
            role: msg.role === 'user' ? 'user' : 'agent',
            content: msg.content,
            sources: msg.sources || [],
            timestamp: msg.timestamp
        }));
    } catch (error) {
        console.error('Error fetching chat history:', error);
        return [];
    }
};

/**
 * Stream section drafting
 */
export async function* streamSectionDraft(
  payload: ChatStreamPayload
): AsyncGenerator<{
  type: 'start' | 'text_chunk' | 'complete' | 'error';
  data?: string;
  message?: string;
}> {
  const response = await fetch(`${apiClient.defaults.baseURL}/chat/draft-section`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            yield data;
          } catch (e) {
            console.warn('Failed to parse SSE data:', line);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ===== MOCK/PLACEHOLDER ENDPOINTS =====
// These will be implemented as backend grows

export const searchPapers = async (
  query: string,
  maxResults: number = 10
): Promise<Paper[]> => {
  try {
    const { data } = await apiClient.get('/papers/search', {
      params: {
        query,
        max_results: maxResults
      }
    });
    
    // Map backend PaperSearchResult to frontend Paper type
    return data.results.map((paper: any) => ({
      id: paper.arxiv_id || paper.doi || `paper-${Math.random().toString(36).substr(2, 9)}`,
      title: paper.title,
      authors: paper.authors || [],
      year: paper.year || new Date().getFullYear(),
      summary: paper.abstract || '',
      tags: [],
      pdfUrl: paper.url
    }));
  } catch (error) {
    console.error('Error searching papers:', error);
    // Return empty array on error instead of throwing
    return [];
  }
};

export const generateOutline = async (
  projectId: string,
  paperIds: string[],
  assetIds: string[],
  style: string = 'IEEE'
): Promise<OutlineSection[]> => {
  try {
    const { data } = await apiClient.post('/research/outline', {
      project_id: projectId,
      paper_ids: paperIds,
      asset_ids: assetIds,
      style
    });
    
    return data.sections || [];
  } catch (error) {
    console.error('Error generating outline:', error);
    throw error;
  }
};

export const uploadPaper = async (
  projectId: string,
  file: File
): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await apiClient.post(
    `/papers/upload?project_id=${projectId}`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  );

  return data;
};

export const addPaperToLibrary = async (
  projectId: string,
  paper: Paper
): Promise<any> => {
  try {
    const { data } = await apiClient.post(
      `/papers/add-to-library?project_id=${projectId}`,
      {
        id: paper.id,
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        summary: paper.summary,
        pdfUrl: paper.pdfUrl,
        arxiv_id: paper.id.includes('arxiv') ? paper.id : undefined,
        doi: paper.id.includes('doi') ? paper.id : undefined
      }
    );
    return data;
  } catch (error) {
    console.error('Error adding paper to library:', error);
    throw error;
  }
};

export const fetchPaper = async (id: string): Promise<Paper> => {
   try {
       const { data } = await apiClient.get<any>(`/papers/${id}`);
       
       // Construct PDF URL
       let pdfUrl = '';
       
       if (data.pdf_path) {
           // Local PDF file
           const filename = data.pdf_path.split('\\').pop().split('/').pop();
           const rootUrl = (apiClient.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '');
           pdfUrl = `${rootUrl}/uploads/${filename}`;
       } else if (data.url) {
           // External URL (ArXiv, etc.)
           pdfUrl = data.url;
       } else if (data.arxiv_id) {
           // Construct ArXiv PDF URL
           pdfUrl = `https://arxiv.org/pdf/${data.arxiv_id}.pdf`;
       }
       
       return {
            id: data.id,
            title: data.title,
            authors: Array.isArray(data.authors) ? data.authors : [],
            year: data.year,
            summary: data.abstract || '',
            tags: [],
            pdfUrl: pdfUrl
       };
   } catch (error) {
       console.warn(`Failed to fetch paper ${id} from API:`, error);
       // Fallback
       return {
            id: id,
            title: 'Unknown Paper',
            authors: [],
            year: 2024,
            summary: 'Could not load paper details.',
            tags: [],
            pdfUrl: '' 
       };
   }
};

export default apiClient;

