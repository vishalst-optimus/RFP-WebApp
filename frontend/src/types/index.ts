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

export interface PricingSection {
  id: string;
  name: string;
  content?: string;
  isPricingRelated: boolean;
}

export interface PricingSectionResponse {
  sections: PricingSection[];
  success: boolean;
}

export interface PricingTableData {
  rfpName: string;
  currency: string;
  items: Array<{
    id: string;
    category: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  notes?: string;
  sessionId?: string;
  selectedSections?: string[];
}

export interface PricingTableResponse {
  message: string;
  success: boolean;
  sectionId?: string;
  content?: string;
}

export interface AppState {
  sessionId: string;
  userId: string;
  flowStep: 'upload' | 'analyzing' | 'analyzed' | 'generating_drafts' | 'editing' | 'submitting' | 'complete';
  fileName?: string;
  rfpName?: string;
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

export interface UploadedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: 'primary' | 'secondary' | 'uploaded';
  preview?: string; // Base64 encoded content for preview
  fileUrl?: string; // Object URL for file preview
}