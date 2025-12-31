
import { GoogleGenAI, Type } from "@google/genai";
import { Paper, OutlineSection, ProjectAsset } from '../types';

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// --- UTILS ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- INTENT DETECTION ---

export const analyzeQueryIntent = async (query: string): Promise<'QUESTION' | 'KEYWORD_SEARCH'> => {
    if (!process.env.API_KEY) {
        await sleep(600);
        return query.includes('?') ? 'QUESTION' : 'KEYWORD_SEARCH';
    }
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Classify the following query into either "QUESTION" (informational/QA) or "KEYWORD_SEARCH" (looking for papers). Return only the label.\n\nQuery: "${query}"`
        });
        const text = response.text?.trim().toUpperCase();
        return (text === 'QUESTION' || text === 'KEYWORD_SEARCH') ? text : 'KEYWORD_SEARCH';
    } catch (e) {
        return 'KEYWORD_SEARCH';
    }
};

// --- GENERATION ---

export const generateAgentResponse = async (prompt: string, context?: string): Promise<string> => {
  try {
    const model = 'gemini-3-flash-preview';
    const contents = context 
      ? `Context: ${context}\n\nUser Question: ${prompt}`
      : prompt;

    const response = await ai.models.generateContent({
      model,
      contents,
    });

    return response.text || "I couldn't generate a response.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "I am currently offline or simulated mode is active. Please check API Key.";
  }
};

export const generateResearchSynthesis = async (query: string, availablePapers: any[]): Promise<string> => {
    if (!process.env.API_KEY) {
        await sleep(1500); // Simulate synthesis time
        return `**Research Synthesis (Simulated):**\n\nBased on your query "${query}", I've analyzed the local papers.\n\n1. **Key Theme**: Efficiency in Transformers.\n2. **Consensus**: Low-rank adaptation is effective.\n\n*Note: Add API Key for live synthesis.*`;
    }

    try {
        const context = availablePapers.map(p => `Title: ${p.title}\nSummary: ${p.summary}`).join('\n\n');
        const prompt = `You are a sophisticated academic research engine. 
        The user has asked: "${query}".
        Answer by synthesizing the papers provided below. Structure your answer with bold points and a conclusion.
        
        Papers:
        ${context}`;
        
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
        return response.text || "Unable to synthesize answer.";
    } catch (e) { return "Error connecting to research engine."; }
};

// --- NEW CO-AUTHOR FUNCTIONS ---

const generateMockOutline = (papers: Paper[], assets: ProjectAsset[], style: string): OutlineSection[] => {
     return [
        {
            id: 'sec-1',
            title: 'Introduction',
            description: `Contextualize the research using ${papers[0]?.title || 'references'}. Define the problem scope and contributions.`,
            status: 'pending',
            relevantPaperIds: papers.slice(0, 1).map(p => p.id)
        },
        {
            id: 'sec-2',
            title: 'Related Work',
            description: 'Survey the existing literature, categorizing by methodology.',
            status: 'pending',
            relevantPaperIds: papers.map(p => p.id)
        },
        {
            id: 'sec-3',
            title: 'Methodology',
            description: 'Detail the proposed system architecture.',
            status: 'pending',
            relevantPaperIds: []
        },
        {
            id: 'sec-4',
            title: 'Results',
            description: 'Present experimental findings.',
            status: 'pending',
            relevantPaperIds: [],
            recommendedAssetTypes: assets.length > 0 ? ['data'] : undefined
        },
        {
            id: 'sec-5',
            title: 'Conclusion',
            description: 'Summarize impacts and future work.',
            status: 'pending',
            relevantPaperIds: papers.map(p => p.id)
        }
    ];
}

export const generateResearchOutline = async (papers: Paper[], assets: ProjectAsset[], style: string = 'IEEE'): Promise<OutlineSection[]> => {
    if (!process.env.API_KEY) {
        await sleep(1500);
        return generateMockOutline(papers, assets, style);
    }

    const paperContext = papers.map(p => `ID: ${p.id} | Title: ${p.title} | Abstract: ${p.summary}`).join('\n');
    const assetContext = assets.map(a => `Type: ${a.type} | Name: ${a.name}`).join('\n');

    const prompt = `Act as a senior academic co-author. Create a detailed research paper outline.
    
    Format Style: ${style}
    
    Available Source Material:
    ${paperContext}
    
    Available Data Assets:
    ${assetContext}
    
    Task:
    Generate a logical sequence of sections for this paper.
    For each section, provide a 'title' and a 'description' (instructions for the writer).
    Map relevant paper IDs to each section if they should be cited there.
    Check if any data assets should be discussed in a section.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            description: { type: Type.STRING },
                            relevantPaperIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                            recommendedAssetTypes: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ["title", "description"]
                    }
                }
            }
        });
        
        const rawSections = JSON.parse(response.text || "[]");
        
        return rawSections.map((s: any, i: number) => ({
            id: `sec-gen-${i}-${Date.now()}`,
            title: s.title,
            description: s.description,
            status: 'pending',
            relevantPaperIds: s.relevantPaperIds || [],
            recommendedAssetTypes: s.recommendedAssetTypes || []
        }));

    } catch (e) {
        console.error("Outline generation failed:", e);
        return generateMockOutline(papers, assets, style);
    }
};

export const streamSectionDraft = async function* (section: OutlineSection, contextPapers: Paper[], assetContexts: string[] = []) {
    yield `% --- CO-AUTHOR LOG: Planning section "${section.title}"... ---\n`;
    await sleep(400);
    
    if (contextPapers.length > 0) {
        yield `% --- CO-AUTHOR LOG: Reviewing ${contextPapers.length} citations... ---\n`;
    }
    if (assetContexts.length > 0) {
        yield `% --- CO-AUTHOR LOG: Integrating data from ${assetContexts.length} assets... ---\n`;
    }
    await sleep(600);

    // Yield a header just in case, though the app might handle insertion logic
    // We intentionally do NOT yield the header here if the app inserts it via 'handleUpdateSection' logic which adds ##
    // But for stream safety, we assume body text only.

    if (!process.env.API_KEY) {
        // Mock Streaming
        const mockText = `This is a generated draft for **${section.title}**. \n\nThe research indicates significant improvements in efficiency [1]. As shown in the data, our method outperforms baselines by 15%. \n\nWe observe that this trend is consistent across multiple trials.`;
        const words = mockText.split(' ');
        for (const word of words) {
            await sleep(50);
            yield word + " ";
        }
        return;
    }

    try {
        const contextStr = contextPapers.map(p => `"${p.title}": ${p.summary}`).join('\n\n');
        let prompt = `You are writing the "${section.title}" section of an academic paper.
        
        System Instruction: ${section.description}
        
        Source Material:
        ${contextStr}
        
        Assets to Reference:
        ${assetContexts.join(', ')}
        
        Write 2-4 paragraphs of high-quality academic text in Markdown. 
        Use numerical citation markers [1] if papers are referenced.
        Do not include the Section Title/Header, just the body text.
        `;

        const response = await ai.models.generateContentStream({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });

        for await (const chunk of response) {
            yield chunk.text || "";
        }
    } catch (e) {
        yield "\n% Error: Could not generate content from AI service.\n";
    }
};

export const rewriteSection = async function* (currentContent: string, instruction: string) {
    if (!process.env.API_KEY) {
        await sleep(800);
        yield currentContent + "\n\n(Edited for clarity)";
        return;
    }

    try {
        const prompt = `You are an academic editor.
        
        Original Text:
        "${currentContent}"
        
        Instruction: ${instruction}
        
        Return the rewritten text in Markdown. Maintain academic tone.`;
        
        const response = await ai.models.generateContentStream({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });
        for await (const chunk of response) {
            yield chunk.text || "";
        }
    } catch (e) {
        yield "Error processing revision.";
    }
};

export const streamDraft = async function* (topic: string, context?: string) {
    yield `Deprecated.`;
};
