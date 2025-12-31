
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Menu, MessageSquare, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, X, Upload, Activity, GripVertical } from 'lucide-react';
import { AppMode, ViewState, Project, ProjectType, ProjectAsset, Paper, AgentState, AgentLog, ResearchTurn, ProjectFile } from './types';
import { SidebarLeft } from './components/SidebarLeft';
import { SidebarRight } from './components/SidebarRight';
import { WorkspaceDiscovery } from './components/WorkspaceDiscovery';
import { WorkspaceReading } from './components/WorkspaceReading';
import { WorkspaceStudio } from './components/WorkspaceStudio';
import { Dashboard } from './components/Dashboard';
import { INITIAL_PROJECT_FILES } from './constants';

export default function App() {
  // Global State
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [appMode, setAppMode] = useState<AppMode>(AppMode.RESEARCH);
  const [viewState, setViewState] = useState<ViewState>(ViewState.DASHBOARD);
  const [activePaper, setActivePaper] = useState<string | null>(null);
  const [selectedContextIds, setSelectedContextIds] = useState<Set<string>>(new Set());

  // File System State
  const [activeFileId, setActiveFileId] = useState<string>('main.md');

  // History State for Undo/Redo
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  
  // Responsive & Layout State
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(false); // Mobile Drawer Left
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(false); // Mobile Drawer Right
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false); // Desktop Collapse
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false); // Desktop Collapse

  // Resizable Sidebar State
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(320);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarResizingRef = useRef({ left: false, right: false });

  // Discovery Persistence State
  const [discoveryTurns, setDiscoveryTurns] = useState<ResearchTurn[]>([]);
  const [discoverySelectedResultIds, setDiscoverySelectedResultIds] = useState<Set<string>>(new Set());

  // Shared Agent State
  const [agentState, setAgentState] = useState<AgentState>(AgentState.IDLE);
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  
  // Agent Trigger State
  const [pendingAgentMessage, setPendingAgentMessage] = useState<string | null>(null);

  // Modals State
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  
  // Asset Modal Data
  const [importType, setImportType] = useState<'data' | 'image'>('data');
  const [importName, setImportName] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [analyzeImmediately, setAnalyzeImmediately] = useState(false);

  // PDF Modal Data
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // Projects Store
  const [projects, setProjects] = useState<Project[]>([
    {
        id: '1',
        title: 'Transformer Efficiency Review',
        description: 'A comprehensive review of efficient transformer architectures including LoRA and QLoRA.',
        type: ProjectType.LIT_REVIEW,
        lastModified: new Date(Date.now() - 86400000), // 1 day ago
        papers: ['p1', 'p2'],
        files: [...INITIAL_PROJECT_FILES],
        assets: [],
        wordCount: 1240
    }
  ]);

  // Manage Dark Mode
  useEffect(() => {
    const root = document.documentElement;
    if (appMode === AppMode.STUDIO && viewState !== ViewState.DASHBOARD) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [appMode, viewState]);

  // Close sidebars on navigation
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setIsLeftDrawerOpen(false);
      setIsRightDrawerOpen(false);
    }
  }, [viewState, activePaper, appMode]);

  // Handle Resizing Events
  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (!sidebarResizingRef.current.left && !sidebarResizingRef.current.right) return;

          if (sidebarResizingRef.current.left) {
              const newWidth = Math.min(Math.max(e.clientX, 240), 600);
              setLeftSidebarWidth(newWidth);
          }
          if (sidebarResizingRef.current.right) {
              const newWidth = Math.min(Math.max(window.innerWidth - e.clientX, 240), 800);
              setRightSidebarWidth(newWidth);
          }
      };

      const handleMouseUp = () => {
          if (sidebarResizingRef.current.left || sidebarResizingRef.current.right) {
              sidebarResizingRef.current = { left: false, right: false };
              setIsResizing(false);
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
          }
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
      };
  }, []);

  const startResizingLeft = useCallback(() => {
      sidebarResizingRef.current.left = true;
      setIsResizing(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
  }, []);

  const startResizingRight = useCallback(() => {
      sidebarResizingRef.current.right = true;
      setIsResizing(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
  }, []);

  // Initial System Check Log
  useEffect(() => {
    if (agentLogs.length === 0) {
        const timer = setTimeout(() => {
            addAgentLog('System', 'Research Agent System Initialized.', 'success');
        }, 500);
        return () => clearTimeout(timer);
    }
  }, []);

  const addAgentLog = (source: AgentLog['source'], message: string, status: AgentLog['status'] = 'success') => {
      setAgentLogs(prev => [...prev, {
          id: Date.now().toString() + Math.random(),
          source,
          message,
          timestamp: new Date(),
          status
      }]);
  };

  const handleCreateProject = (
      title: string, 
      type: ProjectType, 
      description: string,
      methodology?: string,
      findings?: string,
      initialAssets: ProjectAsset[] = []
  ) => {
    const newProject: Project = {
        id: Date.now().toString(),
        title,
        description,
        type,
        lastModified: new Date(),
        papers: [],
        files: [...INITIAL_PROJECT_FILES],
        assets: initialAssets,
        wordCount: 0,
        methodology,
        findings
    };
    setProjects(prev => [newProject, ...prev]);
    handleOpenProject(newProject.id);
  };

  const handleCreateProjectFromDiscovery = (selectedPapers: Paper[]) => {
    const title = `Lit Review: ${selectedPapers[0].tags[0] || 'General'} Analysis`;
    const newProject: Project = {
        id: Date.now().toString(),
        title: title,
        description: `Automated literature review collection based on ${selectedPapers.length} sources.`,
        type: ProjectType.LIT_REVIEW,
        lastModified: new Date(),
        papers: selectedPapers.map(p => p.id),
        files: [...INITIAL_PROJECT_FILES],
        assets: [],
        wordCount: 0,
        methodology: 'Automated synthesis of selected discovery sources.',
        findings: 'Pending analysis.'
    };
    
    setProjects(prev => [newProject, ...prev]);
    setActiveProject(newProject);
    setAppMode(AppMode.STUDIO);
    setViewState(ViewState.STUDIO);
  };

  const handleOpenProject = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    setActiveProject(project);
    setActiveFileId('main.md'); // Default file
    setSelectedContextIds(new Set()); 
    setAgentLogs([]); 

    if (project.type === ProjectType.LIT_REVIEW) {
        setAppMode(AppMode.RESEARCH);
        setViewState(ViewState.DISCOVERY);
    } else {
        setAppMode(AppMode.STUDIO);
        setViewState(ViewState.STUDIO);
    }
  };

  // --- FILE SYSTEM ACTIONS & HISTORY ---

  const pushToHistory = (content: string) => {
      setHistoryStack(prev => {
          const newStack = [...prev, content];
          if (newStack.length > 50) return newStack.slice(1);
          return newStack;
      });
      setRedoStack([]); 
  };

  const handleCreateFile = (name: string, parentId?: string) => {
      if (!activeProject) return;
      const newFile: ProjectFile = {
          id: `file-${Date.now()}-${Math.floor(Math.random()*10000)}`,
          name: name,
          type: 'file',
          content: '',
          parentId: parentId,
          extension: name.split('.').pop()
      };
      
      const updatedProject = {
          ...activeProject,
          files: [...activeProject.files, newFile]
      };
      setActiveProject(updatedProject);
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
      setActiveFileId(newFile.id);
  };

  const handleCreateFolder = (name: string, parentId?: string) => {
      if (!activeProject) return;
      const newFolder: ProjectFile = {
          id: `folder-${Date.now()}-${Math.floor(Math.random()*10000)}`,
          name: name,
          type: 'folder',
          content: '',
          parentId: parentId
      };
      const updatedProject = { ...activeProject, files: [...activeProject.files, newFolder] };
      setActiveProject(updatedProject);
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
  };

  const handleDeleteFile = (fileId: string) => {
      if (!activeProject) return;
      const updatedFiles = activeProject.files.filter(f => f.id !== fileId && f.parentId !== fileId);
      const updatedProject = { ...activeProject, files: updatedFiles };
      
      setActiveProject(updatedProject);
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
      
      if (activeFileId === fileId) {
          setActiveFileId('main.md'); // Fallback
      }
  };

  const handleUpdateFileContent = (newContent: string, saveHistory: boolean = false) => {
      if (!activeProject) return;
      
      if (saveHistory) {
          pushToHistory(activeFileContent);
      } 

      const updatedFiles = activeProject.files.map(f => 
          f.id === activeFileId ? { ...f, content: newContent } : f
      );
      
      const updatedProject = { ...activeProject, files: updatedFiles };
      setActiveProject(updatedProject);
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
  };

  const handleUndo = () => {
      if (historyStack.length === 0) return;
      const previousState = historyStack[historyStack.length - 1];
      const newHistory = historyStack.slice(0, -1);
      
      setRedoStack(prev => [...prev, activeFileContent]); 
      setHistoryStack(newHistory);
      
      handleUpdateFileContent(previousState, false);
      addAgentLog('System', 'Undoing last action.', 'success');
  };

  const handleRedo = () => {
      if (redoStack.length === 0) return;
      const nextState = redoStack[redoStack.length - 1];
      const newRedo = redoStack.slice(0, -1);

      setHistoryStack(prev => [...prev, activeFileContent]);
      setRedoStack(newRedo);

      handleUpdateFileContent(nextState, false);
      addAgentLog('System', 'Redoing action.', 'success');
  };

  // --- CO-AUTHOR / AGENTIC ACTIONS ---

  const handleUpdateSection = (sectionTitle: string, content: string, mode: 'append' | 'replace' = 'append') => {
    if (!activeProject) return;
    
    // Don't push to history for every streamed chunk, only if manually replacing or starting
    // Ideally we debounce history pushes for streaming, but for simplicity we rely on 'saveHistory=false' in stream
    
    const regex = new RegExp(`(## ${sectionTitle}\\n)([^#]*)`, 'i');
    const match = activeFileContent.match(regex);
    
    let newFullContent = activeFileContent;
    if (match) {
        if (mode === 'replace') {
            newFullContent = activeFileContent.replace(regex, `$1${content}\n`);
        } else {
            // Check if content already ends with this chunk to avoid duplication if streaming loosely
            const currentSectionContent = match[2];
            if (!currentSectionContent.trim().endsWith(content.trim())) {
                 newFullContent = activeFileContent.replace(regex, `$1$2\n${content}\n`);
            }
        }
    } else {
        newFullContent = activeFileContent + `\n\n## ${sectionTitle}\n${content}`;
    }
    
    handleUpdateFileContent(newFullContent, false); 
  };

  const activeFile = activeProject?.files.find(f => f.id === activeFileId) || activeProject?.files[0];
  const activeFileContent = activeFile?.content || '';

  // --- NAVIGATION ACTIONS ---

  const handleBackToDashboard = () => {
    setViewState(ViewState.DASHBOARD);
    setActiveProject(null);
    setAppMode(AppMode.RESEARCH);
    setDiscoveryTurns([]);
    setDiscoverySelectedResultIds(new Set());
  };

  const handleModeSwitch = (mode: AppMode) => {
    setAppMode(mode);
    if (mode === AppMode.STUDIO) {
      setViewState(ViewState.STUDIO);
    } else {
      setViewState(activePaper ? ViewState.READING : ViewState.DISCOVERY);
    }
  };

  const handleOpenPaper = (paperId: string) => {
    setActivePaper(paperId);
    setViewState(ViewState.READING);
  };

  const handleBackToDiscovery = () => {
    setViewState(ViewState.DISCOVERY);
  };

  const handleAddToProject = (paperId: string) => {
      if (!activeProject) return;
      if (activeProject.papers.includes(paperId)) return;

      const updatedProject = { ...activeProject, papers: [...activeProject.papers, paperId] };
      setActiveProject(updatedProject);
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
      setSelectedContextIds(prev => new Set(prev).add(paperId));
  };

  const handleImportAsset = (asset: ProjectAsset) => {
      if (!activeProject) return;
      const updatedProject = { ...activeProject, assets: [...activeProject.assets, asset] };
      setActiveProject(updatedProject);
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
      addAgentLog('System', `Imported new asset: ${asset.name}`);
  };

  const handleTriggerAgent = (message: string) => {
      setPendingAgentMessage(message);
      // Determine which sidebar to open based on mode
      if (appMode === AppMode.STUDIO) {
          if (isRightSidebarCollapsed) setIsRightSidebarCollapsed(false);
      }
  };

  const handleAnalyzeAsset = (asset: ProjectAsset) => {
      handleTriggerAgent(`Analyze the dataset "${asset.name}". Identify key trends, outliers, and suggest how to incorporate this into the methodology section.`);
  };

  const toggleContext = (id: string) => {
    const newSet = new Set(selectedContextIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedContextIds(newSet);
  };

  // --- MODAL SUBMISSIONS ---

  const handleAssetImportSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!importName) return;
      
      const newAsset: ProjectAsset = {
          id: `asset-${Date.now()}`,
          name: importName,
          type: importType,
          url: importFile ? URL.createObjectURL(importFile) : undefined
      };
      
      handleImportAsset(newAsset);
      
      if (analyzeImmediately) {
          handleAnalyzeAsset(newAsset);
      }
      
      setIsAssetModalOpen(false);
      setImportName('');
      setImportFile(null);
      setAnalyzeImmediately(false);
  };

  const handlePdfImportSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!pdfFile) return;

      // Mock PDF Import - In real app, this would parse the PDF metadata
      addAgentLog('System', `Uploading PDF: ${pdfFile.name}...`);
      
      setTimeout(() => {
          addAgentLog('System', `Successfully added ${pdfFile.name} to Library.`, 'success');
          // Since we don't have a real PDF parser here, we just log it. 
          // Ideally we'd add to activeProject.papers or create a new Paper object.
      }, 1000);

      setIsPdfModalOpen(false);
      setPdfFile(null);
  };

  if (viewState === ViewState.DASHBOARD) {
    return (
        <Dashboard 
            projects={projects} 
            onCreateProject={handleCreateProject}
            onOpenProject={(id) => handleOpenProject(id)}
        />
    );
  }

  // --- DYNAMIC COMPONENT PROPS ---
  
  const sidebarLeftProps = {
    appMode,
    viewState,
    setAppMode: handleModeSwitch,
    onBackToDiscovery: handleBackToDiscovery,
    onBackToDashboard: handleBackToDashboard,
    activeProject: activeProject,
    onOpenPaper: handleOpenPaper,
    selectedContextIds: selectedContextIds,
    onToggleContext: toggleContext,
    // Mobile close logic depends on which side it is mounted, handled below
    onCloseMobile: () => {}, 
    onOpenAssetModal: () => setIsAssetModalOpen(true),
    onOpenPdfModal: () => setIsPdfModalOpen(true),
    onAnalyzeAsset: handleAnalyzeAsset,
    // Collapse logic handled in render
    onCollapse: () => {},
    isCollapsed: false,
    files: activeProject?.files || [],
    activeFileId: activeFileId,
    onFileSelect: setActiveFileId,
    onCreateFile: handleCreateFile,
    onCreateFolder: handleCreateFolder,
    onDeleteFile: handleDeleteFile,
    activeFileContent: activeFileContent,
    onUpdateActiveFileContent: handleUpdateFileContent,
    onUpdateSection: handleUpdateSection,
    onTriggerAgent: handleTriggerAgent,
    agentState: agentState,
    setAgentState: setAgentState,
    addAgentLog: addAgentLog,
    logs: agentLogs, // Passing logs for monitor display
    pendingMessage: pendingAgentMessage,
    onClearPendingMessage: () => setPendingAgentMessage(null)
  };

  const sidebarRightProps = {
    appMode,
    viewState, // Added Prop
    activePaper, // Added Prop
    agentState,
    setAgentState,
    addAgentLog,
    logs: agentLogs,
    onCloseMobile: () => {},
    onCollapse: () => {},
    // New Props for Co-Author in Studio Mode
    activeProject,
    activeFileContent,
    onUpdateSection: handleUpdateSection,
    onAnalyzeAsset: handleAnalyzeAsset,
    pendingMessage: pendingAgentMessage,
    onClearPendingMessage: () => setPendingAgentMessage(null)
  };

  // Helper for conditional classes vs styles
  const transitionClass = isResizing ? '' : 'transition-all duration-300 ease-in-out';
  const isStudio = appMode === AppMode.STUDIO;

  return (
    <div className={`flex h-screen w-full overflow-hidden transition-colors duration-500 ${isStudio ? 'bg-[#050505]' : 'bg-gray-50'}`}>
      
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white dark:bg-academic-950 border-b border-gray-200 dark:border-gray-800 z-40 flex items-center justify-between px-4 shadow-sm">
          <button onClick={() => setIsLeftDrawerOpen(true)} className="p-2 -ml-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
             {isStudio ? <Activity className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="font-semibold text-sm text-gray-900 dark:text-gray-200 tracking-tight">ScholarFlow</span>
          <button onClick={() => setIsRightDrawerOpen(true)} className="p-2 -mr-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg">
             {isStudio ? <MessageSquare className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
          </button>
      </div>

      {/* --- LEFT CONTAINER --- */}
      <div 
          className={`
            fixed inset-y-0 left-0 z-50 bg-white dark:bg-academic-950 shadow-2xl transform lg:relative lg:translate-x-0 lg:shadow-none
            ${transitionClass}
            ${isLeftDrawerOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
          style={{ width: isLeftSidebarCollapsed ? 0 : (window.innerWidth >= 1024 ? leftSidebarWidth : '18rem') }}
      >
          {!isLeftSidebarCollapsed && (
              <div 
                className="hidden lg:block absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500 z-50 transition-colors group"
                onMouseDown={startResizingLeft}
              >
                  <div className="absolute top-1/2 -translate-y-1/2 -right-2 opacity-0 group-hover:opacity-100 bg-indigo-500 text-white rounded-full p-0.5 shadow-md pointer-events-none">
                      <GripVertical className="w-3 h-3" />
                  </div>
              </div>
          )}

          <div className="h-full w-full overflow-hidden">
             {/* Always render SidebarLeft, it will adapt based on appMode */}
             <SidebarLeft 
                {...sidebarLeftProps}
                position="left"
                onCloseMobile={() => setIsLeftDrawerOpen(false)}
                onCollapse={() => setIsLeftSidebarCollapsed(true)}
                isCollapsed={isLeftSidebarCollapsed}
             />
          </div>
      </div>
      
      {isLeftDrawerOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsLeftDrawerOpen(false)} />
      )}

      {/* --- CENTER STAGE --- */}
      <main className="flex-1 flex flex-col relative h-full overflow-hidden pt-14 lg:pt-0">
        
        {/* Desktop Sidebar Toggles */}
        <div className="hidden lg:flex absolute top-3 left-3 z-50 gap-2 print:hidden">
            {isLeftSidebarCollapsed && (
                <button 
                  onClick={() => setIsLeftSidebarCollapsed(false)}
                  className={`p-1.5 rounded-md shadow-md border transition-all ${isStudio ? 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-900'}`}
                  title="Expand Left"
                >
                    <PanelLeftOpen className="w-4 h-4" />
                </button>
            )}
        </div>
        
        {/* Toggle for Right Sidebar */}
        <div className="hidden lg:flex absolute top-3 right-3 z-50 gap-2 print:hidden">
            {isRightSidebarCollapsed && (
                <button 
                onClick={() => setIsRightSidebarCollapsed(false)}
                className={`p-1.5 rounded-md shadow-md border transition-all ${isStudio ? 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-900'}`}
                title="Expand Right"
                >
                    <PanelRightOpen className="w-4 h-4" />
                </button>
            )}
        </div>

        {viewState === ViewState.DISCOVERY && (
          <WorkspaceDiscovery 
            onOpenPaper={handleOpenPaper} 
            onCreateCollection={handleCreateProjectFromDiscovery}
            onAddToProject={handleAddToProject}
            activeProjectPapers={activeProject?.papers || []}
            selectedContextIds={selectedContextIds}
            setAgentState={setAgentState}
            addAgentLog={addAgentLog}
            turns={discoveryTurns}
            setTurns={setDiscoveryTurns}
            selectedResultIds={discoverySelectedResultIds}
            setSelectedResultIds={setDiscoverySelectedResultIds}
          />
        )}
        {viewState === ViewState.READING && (
          <WorkspaceReading 
            paperId={activePaper} 
            onAddToProject={handleAddToProject}
            isSaved={activeProject?.papers.includes(activePaper || '')}
          />
        )}
        {viewState === ViewState.STUDIO && (
          <WorkspaceStudio 
            activeProject={activeProject} 
            content={activeFileContent}
            onChange={(c) => handleUpdateFileContent(c, false)} 
            activeFileName={activeFile?.name || 'Untitled'}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={historyStack.length > 0}
            canRedo={redoStack.length > 0}
          />
        )}
      </main>

      {/* --- RIGHT CONTAINER --- */}
      {/* In Studio Mode, we DO show the right sidebar now (Co-Author) */}
      <div 
        className={`
            fixed inset-y-0 right-0 z-50 bg-white dark:bg-academic-950 shadow-2xl transform lg:relative lg:translate-x-0 lg:shadow-none
            ${transitionClass}
            ${isRightDrawerOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        style={{ width: isRightSidebarCollapsed ? 0 : (window.innerWidth >= 1024 ? rightSidebarWidth : '18rem') }}
      >
        {!isRightSidebarCollapsed && (
            <div 
                className="hidden lg:block absolute top-0 left-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500 z-50 transition-colors group"
                onMouseDown={startResizingRight}
            >
                <div className="absolute top-1/2 -translate-y-1/2 -left-2 opacity-0 group-hover:opacity-100 bg-indigo-500 text-white rounded-full p-0.5 shadow-md pointer-events-none">
                    <GripVertical className="w-3 h-3" />
                </div>
            </div>
        )}

        <div className="h-full w-full overflow-hidden">
            <SidebarRight 
                {...sidebarRightProps}
                position="right"
                onCloseMobile={() => setIsRightDrawerOpen(false)}
                onCollapse={() => setIsRightSidebarCollapsed(true)}
            />
        </div>
      </div>

      {isRightDrawerOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsRightDrawerOpen(false)} />
      )}
      
      {/* ... MODALS ... */}
      {/* (Modals code remains unchanged) */}
      {isAssetModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-academic-900 dark:text-gray-100 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                      <h3 className="font-bold text-lg">Import Project Asset</h3>
                      <button onClick={() => setIsAssetModalOpen(false)}><X className="w-5 h-5 opacity-50 hover:opacity-100"/></button>
                  </div>
                  <form onSubmit={handleAssetImportSubmit} className="p-6 space-y-4">
                      {/* ... (Import form content stays same) ... */}
                      <div>
                          <label className="block text-xs font-bold uppercase tracking-wider mb-2 opacity-70">Asset Name</label>
                          <input 
                            autoFocus
                            type="text" 
                            className="w-full bg-gray-50 dark:bg-black/30 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="e.g. Experiment A Results"
                            value={importName}
                            onChange={e => setImportName(e.target.value)}
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold uppercase tracking-wider mb-2 opacity-70">Type</label>
                          <div className="flex gap-2">
                              <button 
                                type="button"
                                onClick={() => setImportType('data')}
                                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${importType === 'data' ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-gray-200 dark:border-gray-700'}`}
                              >
                                  Dataset (CSV/JSON)
                              </button>
                              <button 
                                type="button"
                                onClick={() => setImportType('image')}
                                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${importType === 'image' ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-gray-200 dark:border-gray-700'}`}
                              >
                                  Image / Figure
                              </button>
                          </div>
                      </div>
                      <div>
                          <label className="block text-xs font-bold uppercase tracking-wider mb-2 opacity-70">File</label>
                          <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-8 flex flex-col items-center justify-center text-gray-400 hover:border-indigo-500 hover:text-indigo-500 transition-colors cursor-pointer relative">
                              <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setImportFile(e.target.files?.[0] || null)} />
                              <Upload className="w-6 h-6 mb-2" />
                              <span className="text-xs">{importFile ? importFile.name : 'Click to Upload'}</span>
                          </div>
                      </div>
                      
                      <button 
                        type="submit"
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-500/20"
                      >
                          Import Asset
                      </button>
                  </form>
              </div>
          </div>
      )}

      {/* PDF IMPORT MODAL */}
      {isPdfModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                      <h3 className="font-bold text-lg text-gray-900">Upload PDF</h3>
                      <button onClick={() => setIsPdfModalOpen(false)}><X className="w-5 h-5 text-gray-500 hover:text-gray-900"/></button>
                  </div>
                  <form onSubmit={handlePdfImportSubmit} className="p-6 space-y-4">
                      <div>
                          <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-gray-500">Select PDF</label>
                          <div className="border-2 border-dashed border-gray-200 rounded-lg p-10 flex flex-col items-center justify-center text-gray-400 hover:border-indigo-500 hover:text-indigo-500 transition-colors cursor-pointer relative">
                              <input 
                                type="file" 
                                accept=".pdf"
                                className="absolute inset-0 opacity-0 cursor-pointer" 
                                onChange={e => setPdfFile(e.target.files?.[0] || null)} 
                              />
                              <Upload className="w-8 h-8 mb-2" />
                              <span className="text-sm font-medium">{pdfFile ? pdfFile.name : 'Drop PDF here or click'}</span>
                          </div>
                      </div>
                      
                      <button 
                        type="submit"
                        disabled={!pdfFile}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          Add to Library
                      </button>
                  </form>
              </div>
          </div>
      )}

    </div>
  );
}
