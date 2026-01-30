/**
 * AgentPanel - Displays proactive suggestions and agent insights
 */

import React, { useEffect, useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
});

interface Suggestion {
  type: 'citation' | 'content' | 'workflow' | 'search';
  priority: 'high' | 'medium' | 'low';
  message: string;
  action: string;
}

interface QualityFeedback {
  overall_quality: string;
  suggestions: Array<{
    area: string;
    message: string;
  }>;
  detailed_feedback: string;
}

interface ProactiveSuggestionsResponse {
  suggestions: Suggestion[];
  quality_feedback?: QualityFeedback;
}

interface MemoryInsights {
  key_findings: string[];
  methodologies: string[];
  gaps_identified: string[];
  conversation_summary: string;
}

export const AgentPanel: React.FC = () => {
  const activeProject = useProjectStore((state) => state.activeProject);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [qualityFeedback, setQualityFeedback] = useState<QualityFeedback | null>(null);
  const [insights, setInsights] = useState<MemoryInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'suggestions' | 'insights' | 'quality'>('suggestions');

  useEffect(() => {
    if (activeProject?.id) {
      loadProactiveSuggestions();
      loadMemoryInsights();
    }
  }, [activeProject?.id]);

  const loadProactiveSuggestions = async () => {
    if (!activeProject?.id) return;
    
    setLoading(true);
    try {
      const response = await apiClient.post<ProactiveSuggestionsResponse>(
        '/agents/proactive-suggestions',
        {
          project_id: activeProject.id,
          selected_paper_ids: [], // TODO: Get from context
          current_draft: {} // TODO: Get from Studio
        }
      );
      
      setSuggestions(response.data.suggestions);
      if (response.data.quality_feedback) {
        setQualityFeedback(response.data.quality_feedback);
      }
    } catch (error) {
      console.error('Failed to load proactive suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMemoryInsights = async () => {
    if (!activeProject?.id) return;
    
    try {
      const response = await apiClient.post<MemoryInsights>(
        '/agents/memory-insights',
        {
          project_id: activeProject.id
        }
      );
      
      setInsights(response.data);
    } catch (error) {
      console.error('Failed to load memory insights:', error);
    }
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    // TODO: Implement action handlers
    console.log('Suggestion clicked:', suggestion);
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return '🔴';
      case 'medium':
        return '🟡';
      case 'low':
        return '🟢';
      default:
        return '⚪';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'citation':
        return '📚';
      case 'content':
        return '📝';
      case 'workflow':
        return '🔄';
      case 'search':
        return '🔍';
      default:
        return '💡';
    }
  };

  if (!activeProject) {
    return (
      <div className="agent-panel-empty">
        <p>Select a project to see agent suggestions</p>
      </div>
    );
  }

  return (
    <div className="agent-panel">
      <div className="agent-panel-header">
        <h3>🤖 Agent Insights</h3>
        <button
          onClick={() => {
            loadProactiveSuggestions();
            loadMemoryInsights();
          }}
          className="refresh-button"
          disabled={loading}
        >
          {loading ? '⏳' : '🔄'}
        </button>
      </div>

      <div className="agent-tabs">
        <button
          className={`agent-tab ${activeTab === 'suggestions' ? 'active' : ''}`}
          onClick={() => setActiveTab('suggestions')}
        >
          💡 Suggestions
          {suggestions.length > 0 && (
            <span className="badge">{suggestions.length}</span>
          )}
        </button>
        <button
          className={`agent-tab ${activeTab === 'insights' ? 'active' : ''}`}
          onClick={() => setActiveTab('insights')}
        >
          💭 Insights
        </button>
        <button
          className={`agent-tab ${activeTab === 'quality' ? 'active' : ''}`}
          onClick={() => setActiveTab('quality')}
        >
          ✨ Quality
        </button>
      </div>

      <div className="agent-content">
        {activeTab === 'suggestions' && (
          <div className="suggestions-panel">
            {loading ? (
              <div className="loading">Loading suggestions...</div>
            ) : suggestions.length === 0 ? (
              <div className="empty">
                <p>No suggestions at the moment</p>
                <p className="hint">Keep working and the agent will provide proactive guidance</p>
              </div>
            ) : (
              <div className="suggestions-list">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className={`suggestion-card priority-${suggestion.priority}`}
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    <div className="suggestion-header">
                      <span className="suggestion-icons">
                        {getPriorityIcon(suggestion.priority)}
                        {getTypeIcon(suggestion.type)}
                      </span>
                      <span className="suggestion-type">{suggestion.type}</span>
                    </div>
                    <div className="suggestion-message">
                      {suggestion.message}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="insights-panel">
            {insights ? (
              <>
                {insights.key_findings.length > 0 && (
                  <div className="insight-section">
                    <h4>🔍 Key Findings</h4>
                    <ul>
                      {insights.key_findings.map((finding, index) => (
                        <li key={index}>{finding}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {insights.methodologies.length > 0 && (
                  <div className="insight-section">
                    <h4>🧪 Methodologies</h4>
                    <ul>
                      {insights.methodologies.map((method, index) => (
                        <li key={index}>{method}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {insights.gaps_identified.length > 0 && (
                  <div className="insight-section">
                    <h4>❓ Research Gaps</h4>
                    <ul>
                      {insights.gaps_identified.map((gap, index) => (
                        <li key={index}>{gap}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {insights.conversation_summary && (
                  <div className="insight-section">
                    <h4>📊 Summary</h4>
                    <p>{insights.conversation_summary}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="empty">
                <p>Building your research context...</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'quality' && (
          <div className="quality-panel">
            {qualityFeedback ? (
              <>
                <div className="quality-score">
                  <h4>Overall Quality</h4>
                  <div className={`score score-${qualityFeedback.overall_quality}`}>
                    {qualityFeedback.overall_quality.toUpperCase()}
                  </div>
                </div>

                {qualityFeedback.suggestions.length > 0 && (
                  <div className="quality-suggestions">
                    <h4>Improvement Areas</h4>
                    {qualityFeedback.suggestions.map((sug, index) => (
                      <div key={index} className="quality-item">
                        <strong>{sug.area}:</strong> {sug.message}
                      </div>
                    ))}
                  </div>
                )}

                {qualityFeedback.detailed_feedback && (
                  <div className="quality-feedback">
                    <h4>Detailed Feedback</h4>
                    <p>{qualityFeedback.detailed_feedback}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="empty">
                <p>No draft to analyze yet</p>
                <p className="hint">Start writing to get quality feedback</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
