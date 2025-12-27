import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AppState, AnalysisData, SectionDraft } from '../types';
import { rfpApi, SubscriptionRequiredError } from '../services/api';

// Helper function to generate profe// Helper function to generate professional filename with project name, date, and time in Pacific Time
const generateFileName = (projectName: string, fileExtension: string = 'docx'): string => {
  // Get current time in Pacific Time (PST/PDT)
  const now = new Date();
  const pacificTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
  
  // Format date properly in Pacific Time
  const year = pacificTime.getFullYear();
  const month = String(pacificTime.getMonth() + 1).padStart(2, '0');
  const day = String(pacificTime.getDate()).padStart(2, '0');
  const date = `${year}-${month}-${day}`; // YYYY-MM-DD
  
  const time = pacificTime.toTimeString().slice(0, 5).replace(':', '-'); // HH-MM
  
  // Sanitize project name: remove special characters, replace spaces with underscores, limit length
  const sanitizedProjectName = projectName
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
    .trim()
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .substring(0, 50) // Limit length to 50 characters
    || 'Unnamed_Project'; // Fallback if empty
  
  return `${sanitizedProjectName}_RFP_Response_${date}_${time}.${fileExtension}`;
};

export const useRFPFlow = () => {
  const [state, setState] = useState<AppState>({
    sessionId: uuidv4(),
    userId: uuidv4(),
    flowStep: 'upload',
    sectionDrafts: {},
    isLoading: false,
    showSubscriptionDialog: false,
  } as AppState);
  
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentGeneratingSection, setCurrentGeneratingSection] = useState<string | null>(null);
  
  // Parallel processing state
  const [activeSections, setActiveSections] = useState<string[]>([]);
  const [completedSections, setCompletedSections] = useState<string[]>([]);
  const [batchSize] = useState(3); // Process 3 sections concurrently
  
  // Individual section editing state
  const [editingSections, setEditingSections] = useState<string[]>([]);
  
  // Professional document export state
  const [isProfessionalExporting, setIsProfessionalExporting] = useState(false);
  const [professionalExportProgress, setProfessionalExportProgress] = useState('Initializing...');
  const [documentStats, setDocumentStats] = useState<{
    processingTime: string;
    documentSize: string;
    sectionsProcessed: string;
  } | null>(null);

  const updateState = useCallback((updates: Partial<AppState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const handleFileUpload = useCallback(async (file: File, projectName: string) => {
    updateState({ isLoading: true, error: undefined, flowStep: 'analyzing', fileName: file.name });
    
    try {
      const analysisData = await rfpApi.analyzeRFP(file, state.sessionId, projectName);
      
      // Simulate processing time like in Streamlit
      setTimeout(() => {
        updateState({
          analysisData,
          fileName: file.name,
          flowStep: 'analyzed',
          isLoading: false,
        });
      }, 1000);
      
    } catch (error) {
      console.error('Analysis error:', error);
      
      // Handle subscription errors specifically
      if (error instanceof SubscriptionRequiredError) {
        updateState({ 
          showSubscriptionDialog: true,
          isLoading: false,
          flowStep: 'upload',
        } as Partial<AppState>);
        return;
      }
      
      let errorMessage = 'Analysis failed';
      
      if (error instanceof Error) {
        if (error.message.includes('CORS')) {
          errorMessage = 'CORS Error: Please add CORS headers to your backend server. The API is being blocked.';
        } else {
          errorMessage = error.message;
        }
      }
      
      updateState({ 
        error: errorMessage,
        isLoading: false,
        flowStep: 'upload',
      });
    }
  }, [state.sessionId, updateState]);

  const generateAllDrafts = useCallback(async () => {
    if (!state.analysisData) return;

    updateState({ flowStep: 'generating_drafts', isLoading: true });
    setGenerationProgress(0);
    setActiveSections([]);
    setCompletedSections([]);
    setCurrentGeneratingSection(null);
    
    const sections = state.analysisData.sections;
    // Filter out client_information sections from AI generation - they're pre-completed
    const sectionsNeedingGeneration = sections.filter(section => 
      section.needs_response && section.type !== 'client_information'
    );
    const totalSections = sections.length; // Keep total for progress calculation
    const newDrafts: Record<string, SectionDraft> = {};
    
    // Initialize all sections with their proper order first
    sections
      .sort((a, b) => (a.section_order || 999) - (b.section_order || 999))
      .forEach((section, index) => {
        // Ensure section_order is set if missing
        if (section.section_order === undefined) {
          section.section_order = index + 1;
        }
        
        if (section.type === 'client_information') {
          // Pre-populate client information sections
          newDrafts[section.name] = {
            content: section.content || '',
            isEdited: false,
            isGenerating: false,
            original_section: section,
            wordCount: section.word_count || 0,
            last_edited: Date.now(),
            edit_history: []
          };
        } else if (section.needs_response) {
          // Initialize placeholder for sections that need generation
          newDrafts[section.name] = {
            content: '',
            isEdited: false,
            isGenerating: true,
            original_section: section,
            wordCount: 0,
            last_edited: Date.now(),
            edit_history: []
          };
        }
      });

    console.log(`Starting parallel generation for ${sectionsNeedingGeneration.length} sections (${sections.length - sectionsNeedingGeneration.length} pre-completed)`);

    // Helper function to generate a single section
    const generateSectionDraft = async (section: any, sectionIndex: number): Promise<void> => {
      const contentPart = section.content || 'No existing content - create from scratch';
      const prompt = `Generate a comprehensive response for this RFP section: '${section.name}'

Section Type: ${section.type}
Existing Content: ${contentPart}

Instructions:
- Generate a complete, professional RFP response for this section
- Use our company's capabilities and experience from knowledge base
- Make it competitive and compelling
- Include specific details, metrics, and examples
- Ensure it directly addresses what this RFP section requires

Generate the actual response content for the RFP.`;

      let generatedContent = '';
      
      try {
        console.log(`Starting generation for section ${sectionIndex + 1}/${totalSections}: ${section.name}`);
        
        // Add to active sections
        setActiveSections(prev => [...prev, section.name]);

        await rfpApi.generateDraft(
          state.sessionId,
          state.userId,
          prompt,
          section.name,
          section.type,
          'generate',
          (chunk) => {
            generatedContent += chunk;
          }
        );

        // Update the existing placeholder with generated content
        newDrafts[section.name] = {
          ...newDrafts[section.name],
          content: generatedContent.trim() || 'No content generated - please edit manually',
          isGenerating: false,
          wordCount: generatedContent.trim().split(/\s+/).length,
          last_edited: Date.now(),
        };
        
        console.log(`Completed section: ${section.name} (${generatedContent.length} chars)`);
        
        // Move from active to completed
        setActiveSections(prev => prev.filter(name => name !== section.name));
        setCompletedSections(prev => {
          const updated = [...prev, section.name];
          // Update overall progress
          setGenerationProgress(updated.length);
          // Update state with accumulated drafts
          updateState({ sectionDrafts: { ...newDrafts } });
          return updated;
        });

      } catch (error) {
        console.error(`Error generating section ${section.name}:`, error);
        
        // Handle subscription errors specifically
        if (error instanceof SubscriptionRequiredError) {
          console.log('Subscription required for draft generation');
          updateState({ 
            showSubscriptionDialog: true,
            isLoading: false,
            flowStep: 'analyzed',
          } as Partial<AppState>);
          return;
        }
        
        const errorDraft = {
          ...newDrafts[section.name],
          content: `Failed to generate draft: ${error instanceof Error ? error.message : 'Unknown error'}`,
          isGenerating: false,
          last_edited: Date.now(),
        };

        newDrafts[section.name] = errorDraft;
        
        // Move from active to completed (even on error)
        setActiveSections(prev => prev.filter(name => name !== section.name));
        setCompletedSections(prev => {
          const updated = [...prev, section.name];
          setGenerationProgress(updated.length);
          updateState({ sectionDrafts: { ...newDrafts } });
          return updated;
        });
      }
    };

    // Process sections in parallel batches (only sections needing generation)
    try {
      for (let i = 0; i < sectionsNeedingGeneration.length; i += batchSize) {
        const batch = sectionsNeedingGeneration.slice(i, i + batchSize);
        console.log(`Processing ${batch.length} sections: ${batch.map(s => s.name).join(', ')}`);
        
        // Update current section display
        setCurrentGeneratingSection(`Processing ${batch.length} sections`);
      
        // Process sections in parallel
        const sectionPromises = batch.map((section, batchIndex) => 
          generateSectionDraft(section, i + batchIndex)
        );
        
        // Wait for all sections to complete
        await Promise.allSettled(sectionPromises);
        
        console.log(`Completed processing ${batch.length} sections`);
      }

      console.log('All drafts generated, transitioning to editing phase');
      
      // Final cleanup and transition
      setActiveSections([]);
      setCurrentGeneratingSection(null);
      updateState({
        sectionDrafts: newDrafts,
        flowStep: 'editing',
        isLoading: false,
      });

    } catch (error) {
      console.error('Critical error in parallel generation:', error);
      updateState({
        error: `Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isLoading: false,
        flowStep: 'analyzed', // Go back to allow retry
      });
    }
  }, [state.analysisData, state.sessionId, state.userId, updateState, batchSize]);

  const editSection = useCallback(async (
    sectionName: string, 
    editRequest: string, 
    action: 'edit' | 'regenerate' = 'edit'
  ) => {
    const draft = state.sectionDrafts[sectionName];
    if (!draft) return;

    console.log(`${action}ing section: ${sectionName}`);
    
    // Add to editing sections list
    setEditingSections(prev => [...prev, sectionName]);

    const prompt = action === 'regenerate' 
      ? `Regenerate the response for RFP section: '${sectionName}'

Original RFP Requirements:
${draft.original_section.content || 'No specific requirements provided'}

Current Draft:
${draft.content}

User Request: ${editRequest}

Generate a completely new response that addresses the user's request while maintaining professional RFP standards.`
      : `Edit the existing response for RFP section: '${sectionName}'

Current Draft:
${draft.content}

Edit Request: ${editRequest}

Provide the improved version that incorporates the requested changes.`;

    let newContent = '';
    
    try {
      // Use different API endpoints based on action
      if (action === 'edit' || action === 'regenerate') {
        await rfpApi.regenerateSection(
          state.sessionId,
          state.userId,
          prompt,
          sectionName,
          draft.original_section.type,
          action,
          (chunk) => {
            newContent += chunk;
          }
        );
      } else {
        await rfpApi.generateDraft(
          state.sessionId,
          state.userId,
          prompt,
          sectionName,
          draft.original_section.type,
          action,
          (chunk) => {
            newContent += chunk;
          }
        );
      }

      const updatedDrafts = {
        ...state.sectionDrafts,
        [sectionName]: {
          ...draft,
          content: newContent.trim() || draft.content,
          last_edited: Date.now(),
          edit_history: [
            ...(draft.edit_history || []),
            {
              action,
              request: editRequest,
              timestamp: Date.now(),
            },
          ],
        },
      };

      console.log(`Successfully ${action}ed section: ${sectionName} (${newContent.length} chars)`);
      updateState({
        sectionDrafts: updatedDrafts,
      });
      
      // Remove from editing sections list
      setEditingSections(prev => prev.filter(name => name !== sectionName));
    } catch (error) {
      console.error(`Error ${action}ing section ${sectionName}:`, error);
      
      // Handle subscription errors specifically
      if (error instanceof SubscriptionRequiredError) {
        updateState({ 
          showSubscriptionDialog: true,
        } as Partial<AppState>);
        // Remove from editing sections list
        setEditingSections(prev => prev.filter(name => name !== sectionName));
        return;
      }
      
      updateState({ 
        error: error instanceof Error ? error.message : `${action} failed`,
      });
      
      // Remove from editing sections list even on error
      setEditingSections(prev => prev.filter(name => name !== sectionName));
    }
  }, [state.sectionDrafts, state.sessionId, state.userId, updateState]);

  const exportDocument = useCallback((format: 'docx' | 'pdf', projectName: string = 'Unnamed Project') => {
    // Create document content
    const documentContent = `# RFP Response - ${state.fileName}

Generated on: ${new Date().toLocaleString()}
Session ID: ${state.sessionId}

---

${Object.entries(state.sectionDrafts).map(([sectionName, draft]) => `
## ${sectionName}

${draft.content}

---
`).join('\n')}`;

    // Download as text file (in a real app, this would generate DOCX/PDF)
    const blob = new Blob([documentContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generateFileName(projectName, format === 'docx' ? 'txt' : 'txt');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    updateState({ flowStep: 'complete' });
  }, [state.fileName, state.sessionId, state.sectionDrafts, updateState]);

  const exportProfessionalDocument = useCallback(async (projectName: string = 'Unnamed Project') => {
    if (!state.fileName || !state.sectionDrafts) return;

    setIsProfessionalExporting(true);
    setProfessionalExportProgress('🤖 Preparing document data and initializing AI formatting...');

    try {
      // Calculate total content size for progress estimation
      const totalContent = Object.values(state.sectionDrafts).reduce((sum, draft) => sum + draft.content.length, 0);
      
      if (totalContent > 50000) {
        setProfessionalExportProgress('📊 Large document detected. Using advanced chunk-wise processing...');
      }

      setProfessionalExportProgress('🔄 Generating professional Word document with AI enhancement...');

      const result = await rfpApi.generateDocument(
        state.sessionId,
        state.fileName,
        state.sectionDrafts
      );

      // Create download for the Word document
      const blob = new Blob([result.content], { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = generateFileName(projectName, 'docx');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Store document stats for display
      setDocumentStats(result.stats);

      setProfessionalExportProgress('✅ Professional Word document generated successfully!');
      
      // Reset state after a brief success message
      setTimeout(() => {
        setIsProfessionalExporting(false);
        setProfessionalExportProgress('Initializing...');
      }, 3000);

    } catch (error) {
      console.error('Professional export error:', error);
      
      // Handle subscription errors specifically
      if (error instanceof SubscriptionRequiredError) {
        updateState({ 
          showSubscriptionDialog: true,
        } as Partial<AppState>);
        // Reset export state
        setIsProfessionalExporting(false);
        setProfessionalExportProgress('Initializing...');
        return;
      }
      
      let errorMessage = '❌ Failed to generate professional Word document';
      
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          errorMessage = '⏱️ Document generation timed out. Please try again or contact support.';
        } else {
          errorMessage = `❌ Error: ${error.message}`;
        }
      }
      
      setProfessionalExportProgress(errorMessage);
      
      // Reset state after showing error
      setTimeout(() => {
        setIsProfessionalExporting(false);
        setProfessionalExportProgress('Initializing...');
      }, 5000);
    }
  }, [state.sessionId, state.fileName, state.sectionDrafts]);

  const saveDraftContent = useCallback((sectionName: string, newContent: string, onComplete?: () => void) => {
    const draft = state.sectionDrafts[sectionName];
    if (!draft) {
      console.log('Draft not found for section:', sectionName);
      onComplete?.();
      return;
    }

    console.log('Saving draft content:', {
      sectionName,
      newContentLength: newContent.length,
      currentContentLength: draft.content?.length || 0,
      hasChanged: newContent !== draft.content
    });

    const updatedDrafts = {
      ...state.sectionDrafts,
      [sectionName]: {
        ...draft,
        content: newContent,
        isEdited: true,  // Mark as edited when content is saved
        wordCount: newContent.trim().split(/\s+/).filter(word => word.length > 0).length,
        last_edited: Date.now(),
        edit_history: [
          ...(draft.edit_history || []),
          {
            action: 'manual_edit' as const,
            request: 'Direct content modification',
            timestamp: Date.now(),
          },
        ],
      },
    };

    updateState({ sectionDrafts: updatedDrafts });
    console.log(`Saved direct edit for section: ${sectionName} (${newContent.length} chars)`);
    
    // Call completion callback after state update with a small delay to ensure state propagation
    setTimeout(() => {
      console.log('Save complete callback executed for:', sectionName);
      onComplete?.();
    }, 100);
  }, [state.sectionDrafts, updateState]);

  const resetFlow = useCallback(() => {
    setState({
      sessionId: uuidv4(),
      userId: uuidv4(),
      flowStep: 'upload',
      sectionDrafts: {},
      isLoading: false,
    });
  }, []);

  const setShowSubscriptionDialog = useCallback((show: boolean) => {
    updateState({ showSubscriptionDialog: show } as Partial<AppState>);
  }, [updateState]);

  return {
    state,
    generationProgress,
    currentGeneratingSection,
    handleFileUpload,
    generateAllDrafts,
    editSection,
    saveDraftContent,
    exportDocument,
    exportProfessionalDocument,
    resetFlow,
    updateState,
    setShowSubscriptionDialog,
    // Professional export state
    isProfessionalExporting,
    professionalExportProgress,
    documentStats,
    // Parallel processing state
    activeSections,
    completedSections,
    // Individual editing state
    editingSections,
  };
};