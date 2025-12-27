export interface RFPSection {
  name: string;
  type: string;
  content: string;
  completion_status: 'empty' | 'partial' | 'complete';
  confidence_score: number;
  word_count: number;
  completion_notes?: string;
  needs_response?: boolean;
  section_order?: number;
}

export interface AnalysisData {
  total_sections: number;
  sections_needing_response: number;
  processing_time: number;
  table_of_contents: string;
  sections: RFPSection[];
}

export interface SectionDraft {
  content: string;
  original_section: RFPSection;
  last_edited: number;
  edit_history: EditHistoryItem[];
  isEdited?: boolean;
  isGenerating?: boolean;
  wordCount?: number;
}

export interface EditHistoryItem {
  action: 'edit' | 'regenerate' | 'generate';
  request: string;
  timestamp: number;
}

export interface AppState {
  sessionId: string;
  userId: string;
  flowStep: 'upload' | 'analyzing' | 'analyzed' | 'generating_drafts' | 'editing' | 'submitting' | 'complete';
  fileName?: string;
  analysisData?: AnalysisData;
  sectionDrafts: Record<string, SectionDraft>;
  isLoading: boolean;
  error?: string;
  showSubscriptionDialog?: boolean;
}

export interface ProjectInfo {
  name: string;
  description?: string;
}