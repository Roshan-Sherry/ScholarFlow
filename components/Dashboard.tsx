
import React, { useState } from 'react';
import { BookOpen, FileText, Plus, Clock, ArrowRight, Upload, Microscope, Sparkles, X, Check, FileImage, Trash2 } from 'lucide-react';
import { Project, ProjectType, ProjectAsset } from '../types';
import { useDeleteProject } from '../hooks/useProjects';
import { useToastStore } from '../stores/toastStore';

interface DashboardProps {
  projects: Project[];
  onCreateProject: (
    title: string,
    type: ProjectType,
    description: string,
    methodology?: string,
    findings?: string,
    initialAssets?: ProjectAsset[]
  ) => void;
  onOpenProject: (projectId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ projects, onCreateProject, onOpenProject }) => {
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [selectedType, setSelectedType] = useState<ProjectType>(ProjectType.LIT_REVIEW);
  const deleteProject = useDeleteProject();
  const { addToast } = useToastStore();

  // Wizard State
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [methodology, setMethodology] = useState('');
  const [findings, setFindings] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string, type: 'image' | 'data' }[]>([]);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

  const handleDeleteProject = (projectId: string) => {
    if (window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      deleteProject.mutate(projectId, {
        onSuccess: () => {
          addToast('Project deleted successfully', 'success');
        },
        onError: () => {
          addToast('Failed to delete project', 'error');
        }
      });
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setMethodology('');
    setFindings('');
    setUploadedFiles([]);
    setStep(1);
  };

  const handleCreate = () => {
    if (!title) return;

    // Convert uploads to mock assets
    const assets: ProjectAsset[] = uploadedFiles.map((f, i) => ({
      id: `asset-${Date.now()}-${i}`,
      name: f.name,
      type: f.type
    }));

    onCreateProject(title, selectedType, description, methodology, findings, assets);
    setShowNewProjectModal(false);
    resetForm();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const type = file.type.includes('image') ? 'image' : 'data';
      setUploadedFiles(prev => [...prev, { name: file.name, type }]);
    }
  };

  const handleContinueLitReview = (project: Project) => {
    // Logic to continue drafting based on a lit review
    // For this demo, we can duplicate the project as a Manuscript type or just open it
    // but let's assume we create a "Part 2" project
    onCreateProject(
      `${project.title} - Draft`,
      ProjectType.MANUSCRIPT,
      `Drafting based on lit review: ${project.title}`
    );
  };

  const openModal = (type: ProjectType) => {
    setSelectedType(type);
    setStep(1);
    setShowNewProjectModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <header className="mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">Welcome back, Jane.</h1>
          <p className="text-gray-500">Select a workflow to begin your research session.</p>
        </header>

        {/* Workflow Starters */}
        <section className="mb-12">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Start New</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            {/* Card 1: Literature Review */}
            <button
              onClick={() => openModal(ProjectType.LIT_REVIEW)}
              className="group text-left bg-white p-6 rounded-xl border border-gray-200 hover:border-indigo-400 hover:shadow-lg transition-all relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <BookOpen className="w-24 h-24 text-indigo-600" />
              </div>
              <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-indigo-600 transition-colors">
                <BookOpen className="w-6 h-6 text-indigo-600 group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Literature Review</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">
                Start with discovery. Find papers, extract insights, and build a reference library before drafting.
              </p>
              <div className="flex items-center text-xs font-semibold text-indigo-600 group-hover:translate-x-1 transition-transform">
                Start Discovery <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </button>

            {/* Card 2: Experimental Paper */}
            <button
              onClick={() => openModal(ProjectType.EXPERIMENTAL)}
              className="group text-left bg-white p-6 rounded-xl border border-gray-200 hover:border-emerald-400 hover:shadow-lg transition-all relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Microscope className="w-24 h-24 text-emerald-600" />
              </div>
              <div className="w-12 h-12 bg-emerald-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-emerald-600 transition-colors">
                <Upload className="w-6 h-6 text-emerald-600 group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Experimental Paper</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">
                Skip straight to drafting. Upload your results (charts, CSVs), explain your findings, and write.
              </p>
              <div className="flex items-center text-xs font-semibold text-emerald-600 group-hover:translate-x-1 transition-transform">
                Upload & Draft <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </button>

            {/* Card 3: Manuscript */}
            <button
              onClick={() => openModal(ProjectType.MANUSCRIPT)}
              className="group text-left bg-white p-6 rounded-xl border border-gray-200 hover:border-purple-400 hover:shadow-lg transition-all relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Sparkles className="w-24 h-24 text-purple-600" />
              </div>
              <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-purple-600 transition-colors">
                <FileText className="w-6 h-6 text-purple-600 group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">General Manuscript</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">
                Standard LaTeX environment with agent assistance. Best for essays, reviews, or general writing.
              </p>
              <div className="flex items-center text-xs font-semibold text-purple-600 group-hover:translate-x-1 transition-transform">
                Open Studio <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </button>

          </div>
        </section>

        {/* Recent Projects */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Recent Work</h2>
            <button className="text-xs text-gray-500 hover:text-indigo-600">View All</button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {projects.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No projects yet. Start one above.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {projects.map(project => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors group"
                  >
                    <div
                      onClick={() => onOpenProject(project.id)}
                      className="flex items-center gap-4 cursor-pointer flex-1"
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${project.type === ProjectType.LIT_REVIEW ? 'bg-indigo-100 text-indigo-600' :
                        project.type === ProjectType.EXPERIMENTAL ? 'bg-emerald-100 text-emerald-600' : 'bg-purple-100 text-purple-600'
                        }`}>
                        {project.type === ProjectType.LIT_REVIEW && <BookOpen className="w-5 h-5" />}
                        {project.type === ProjectType.EXPERIMENTAL && <Microscope className="w-5 h-5" />}
                        {project.type === ProjectType.MANUSCRIPT && <FileText className="w-5 h-5" />}
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{project.title}</h4>
                        <p className="text-xs text-gray-500">{project.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-6 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>
                            {project.lastModified instanceof Date && !isNaN(project.lastModified.getTime())
                              ? project.lastModified.toLocaleDateString()
                              : 'Just now'}
                          </span>
                        </div>
                        <div className="w-24 text-right">
                          {project.wordCount} words
                        </div>
                      </div>

                      {project.type === ProjectType.LIT_REVIEW && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleContinueLitReview(project); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded text-xs font-medium flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3" /> Draft Paper
                        </button>
                      )}

                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.id); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Delete project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <button onClick={() => onOpenProject(project.id)} className="p-2 text-gray-300 hover:text-indigo-600">
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

      </div>

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-300">

            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  {selectedType === ProjectType.LIT_REVIEW && <BookOpen className="w-5 h-5 text-indigo-600" />}
                  {selectedType === ProjectType.EXPERIMENTAL && <Microscope className="w-5 h-5 text-emerald-600" />}
                  {selectedType === ProjectType.MANUSCRIPT && <Sparkles className="w-5 h-5 text-purple-600" />}

                  {selectedType === ProjectType.LIT_REVIEW && "New Literature Review"}
                  {selectedType === ProjectType.EXPERIMENTAL && "New Experimental Paper"}
                  {selectedType === ProjectType.MANUSCRIPT && "New Manuscript"}
                </h3>
                <div className="text-sm text-gray-500 mt-1">
                  Step {step} of {selectedType === ProjectType.EXPERIMENTAL ? 2 : 1}: {step === 1 ? 'Basic Info' : 'Research Context'}
                </div>
              </div>
              <button onClick={() => setShowNewProjectModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {/* Step 1: Basics */}
              {step === 1 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Project Title</label>
                    <input
                      autoFocus
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g., Efficiency in Transformers"
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Description / Goal</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Briefly describe what you want to achieve..."
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 h-32 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Context (Experimental Only) */}
              {step === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Methodology / Protocol</label>
                      <textarea
                        value={methodology}
                        onChange={(e) => setMethodology(e.target.value)}
                        placeholder="Briefly explain your methods (e.g., 'Fine-tuned Llama 2 on 4 A100s using QLoRA...')"
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 h-40 resize-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Key Findings</label>
                      <textarea
                        value={findings}
                        onChange={(e) => setFindings(e.target.value)}
                        placeholder="List your main results (e.g., 'Reduced memory usage by 40% with no accuracy loss...')"
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 h-40 resize-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">Upload Results & Figures</label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center bg-gray-50 hover:bg-white hover:border-emerald-500 transition-all group cursor-pointer relative">
                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} />
                      <Upload className="w-8 h-8 text-gray-400 group-hover:text-emerald-500 mb-2 transition-colors" />
                      <span className="text-sm text-gray-500 group-hover:text-gray-700">Drop charts (PNG) or data (CSV) here</span>
                    </div>

                    {/* Upload List */}
                    {uploadedFiles.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {uploadedFiles.map((file, i) => (
                          <div key={i} className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded-md text-sm">
                            <div className="flex items-center gap-2">
                              <FileImage className="w-4 h-4 text-emerald-500" />
                              <span>{file.name}</span>
                            </div>
                            <Check className="w-4 h-4 text-green-500" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>

              <div className="flex gap-2">
                {step === 2 && (
                  <button
                    onClick={() => setStep(1)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Back
                  </button>
                )}

                {selectedType === ProjectType.EXPERIMENTAL && step === 1 ? (
                  <button
                    onClick={() => setStep(2)}
                    disabled={!title}
                    className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    Next: Research Context <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleCreate}
                    disabled={!title}
                    className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2
                              ${selectedType === ProjectType.LIT_REVIEW ? 'bg-indigo-600 hover:bg-indigo-500' :
                        selectedType === ProjectType.EXPERIMENTAL ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-purple-600 hover:bg-purple-500'}
                          `}
                  >
                    <Plus className="w-4 h-4" /> Create Project
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
