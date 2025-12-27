// Core RFP Types

export interface RFPQuestion {
  question_number: number;
  question_text: string;
  question_type: 'direct_question' | 'requirement' | 'compliance' | 'experience' | 'technical' | 'pricing' | 'implementation' | 'timeline' | 'support';
  section_source: string;
  priority: 'high' | 'medium' | 'low';
  response_length: 'short' | 'medium' | 'long';
  keywords: string[];
  requires_specific_details: boolean;
}

export interface QuestionsAnalysis {
  questions_section_found: boolean;
  questions_section_name: string;
  total_questions: number;
  individual_questions: RFPQuestion[];
  section_importance?: 'high' | 'medium' | 'low';
}

export interface RFPSection {
  name: string;
  type: 'client_information' | 'executive_summary' | 'rfp_questions_responses' | 'technical_approach' | 'company_overview' | 'project_team' | 'past_experience' | 'timeline' | 'pricing' | 'other';
  content: string;
  word_count: number;
  completion_status: 'empty' | 'partial' | 'complete' | 'needs_company_content' | 'needs_detailed_responses';
  needs_response: boolean;
  confidence_score?: number;
  completion_notes?: string;
  content_gaps?: string[];
  response_priority?: 'critical' | 'high' | 'medium' | 'low';
  section_order?: number;
  
  // Questions-specific fields
  individual_questions?: RFPQuestion[];
  total_questions?: number;
  questions_section_name?: string;
}

export interface AnalysisData {
  session_id: string;
  file_name: string;
  status: string;
  processing_time: number;
  rfp_structure: 'refactored_3_section' | 'fallback' | 'minimal_fallback';
  table_of_contents: string;
  total_sections: number;
  sections_needing_response: number;
  sections: RFPSection[];
  questions_analysis: QuestionsAnalysis;
  submission_info?: {
    format_requirements?: string;
    deadline?: string;
    delivery_method?: string;
  };
  refactored?: boolean;
}

export interface SectionDraft {
  content: string;
  isEdited?: boolean;
  isGenerating?: boolean;
  original_section: RFPSection;
  wordCount?: number;
  last_edited?: number;
  edit_history?: Array<{
    action: 'edit' | 'regenerate' | 'manual_edit';
    request: string;
    timestamp: number;
  }>;
  
  // Individual question tracking
  questionResponses?: {
    [questionNumber: number]: {
      content: string;
      isGenerated: boolean;
      isEdited: boolean;
      question: RFPQuestion;
    };
  };
  questionGenerationProgress?: {
    currentQuestion: number;
    totalQuestions: number;
    completedQuestions: number[];
  };
}

export interface AppState {
  flowStep: 'upload' | 'analyzing' | 'analyzed' | 'generating_drafts' | 'editing' | 'submitting' | 'complete';
  sessionId: string;
  userId: string;
  fileName?: string;
  analysisData?: AnalysisData;
  sectionDrafts: Record<string, SectionDraft>;
  isUploading?: boolean;
  isAnalyzing?: boolean;
  isGenerating?: boolean;
  isLoading?: boolean;
  error?: string;
}

// API Response Types
export interface StreamingResponse {
  headers: {
    'is-individual-question'?: string;
    'question-number'?: string;
    'total-questions'?: string;
    'question-context'?: string;
    'section-name'?: string;
    'section-type'?: string;
    'action'?: string;
    'version'?: string;
  };
}

// Individual Question Handling Types
export interface QuestionGenerationConfig {
  sectionName: string;
  questions: RFPQuestion[];
  mode: 'individual' | 'batch';
  currentQuestion?: number;
}

export interface QuestionProgress {
  questionNumber: number;
  totalQuestions: number;
  isGenerating: boolean;
  isComplete: boolean;
  content: string;
  question: RFPQuestion;
}