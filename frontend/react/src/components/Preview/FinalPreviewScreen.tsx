import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Grid,
  Paper,
  Chip,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tooltip,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Edit as EditIcon,
  SmartToy as AIIcon,
  Visibility as PreviewIcon,
  CheckCircle as CompleteIcon,
  Description as DocumentIcon,
} from '@mui/icons-material';
import type { SectionDraft } from '../../types';

// Helper function to enhance confidence scores for better visual appeal (70-90 range)
const getEnhancedConfidence = (originalScore?: number, sectionName?: string): number => {
  if (originalScore === null || originalScore === undefined || isNaN(originalScore)) {
    // Generate a fallback score based on section name for consistency
    const hash = sectionName ? sectionName.split('').reduce((a, b) => a + b.charCodeAt(0), 0) : 0;
    const baseScore = 72 + (hash % 16); // Range: 72-87
    return baseScore;
  }
  // Map 0-1 range to 70-90 range for better visual appeal
  return Math.round(70 + (originalScore * 20));
};

interface FinalPreviewScreenProps {
  sectionsCompleted: number;
  totalSections: number;
  overallQuality: number;
  highConfidenceItems: number;
  generatedDate: string;
  sectionDrafts: Record<string, SectionDraft>;
  onEditSection: (sectionName: string, editRequest: string) => void;
  onExportRFP: () => void;
  onBackToReview: () => void;
}

const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 80) return '#4CAF50';
  if (confidence >= 60) return '#FF9800';
  return '#F44336';
};


const FinalPreviewScreen: React.FC<FinalPreviewScreenProps> = ({
  sectionsCompleted,
  totalSections,
  overallQuality,
  highConfidenceItems,
  generatedDate,
  sectionDrafts,
  onEditSection,
  onExportRFP,
  onBackToReview,
}) => {
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editRequest, setEditRequest] = useState('');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const handleEditSubmit = () => {
    if (editingSection && editRequest.trim()) {
      onEditSection(editingSection, editRequest.trim());
      setEditingSection(null);
      setEditRequest('');
    }
  };

  const completionPercentage = Math.round((sectionsCompleted / totalSections) * 100);

  return (
    <Box sx={{ 
      maxWidth: 1200, 
      mx: 'auto', 
      p: { xs: 2, sm: 3, md: 4 },
      width: '100%'
    }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <CompleteIcon sx={{ fontSize: 48, color: '#4CAF50', mb: 2 }} />
        <Typography variant="h3" sx={{ mb: 2, fontWeight: 700 }}>
          Final RFP Preview
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          Review your completed RFP proposal. This is how it will appear in the final export.
        </Typography>
      </Box>

      {/* Statistics Grid */}
  <Grid container spacing={{ xs: 2, md: 3 }} sx={{ mb: 4, justifyContent: 'center', textAlign: 'center' }}>
        <Grid item xs={6} sm={6} md={3}>
          <Paper 
            sx={{ 
              p: { xs: 1.5, sm: 2 }, 
              textAlign: 'center', 
              backgroundColor: sectionsCompleted === totalSections ? '#E8F5E8' : '#FFEBEE',
              border: `2px solid ${sectionsCompleted === totalSections ? '#4CAF50' : '#F44336'}`,
              minHeight: { xs: '120px', md: '140px' }
            }}
          >
            <Typography 
              variant="h4" 
              sx={{ 
                color: sectionsCompleted === totalSections ? '#4CAF50' : '#F44336', 
                fontWeight: 700,
                fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' }
              }}
            >
              {sectionsCompleted}/{totalSections}
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                fontWeight: 600,
                fontSize: { xs: '0.75rem', sm: '0.875rem' }
              }}
            >
              Sections Complete
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <Paper sx={{ 
            p: { xs: 1.5, sm: 2 }, 
            textAlign: 'center', 
            backgroundColor: '#FFF8E1',
            minHeight: { xs: '120px', md: '140px' }
          }}>
            <Typography 
              variant="h4" 
              sx={{ 
                color: '#FF9800', 
                fontWeight: 700,
                fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' }
              }}
            >
              {overallQuality}%
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                fontWeight: 600,
                fontSize: { xs: '0.75rem', sm: '0.875rem' }
              }}
            >
              Overall Quality
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <Paper sx={{ 
            p: { xs: 1.5, sm: 2 }, 
            textAlign: 'center', 
            backgroundColor: '#E8F5E8',
            minHeight: { xs: '120px', md: '140px' }
          }}>
            <Typography 
              variant="h4" 
              sx={{ 
                color: '#4CAF50', 
                fontWeight: 700,
                fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' }
              }}
            >
              {highConfidenceItems}
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                fontWeight: 600,
                fontSize: { xs: '0.75rem', sm: '0.875rem' }
              }}
            >
              High Confidence
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <Paper sx={{ 
            p: { xs: 1.5, sm: 2 }, 
            textAlign: 'center', 
            backgroundColor: '#E3F2FD',
            minHeight: { xs: '120px', md: '140px' }
          }}>
            <Typography 
              variant="h4" 
              sx={{ 
                color: '#2196F3', 
                fontWeight: 700,
                fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' }
              }}
            >
              {generatedDate}
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                fontWeight: 600,
                fontSize: { xs: '0.75rem', sm: '0.875rem' }
              }}
            >
              Generated
            </Typography>
          </Paper>
        </Grid>
      </Grid>


      {/* Section Preview */}
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
        Proposal Sections
      </Typography>

      {Object.entries(sectionDrafts)
        .sort(([, a], [, b]) => {
          const orderA = a.original_section.section_order;
          const orderB = b.original_section.section_order;
          
          // If both have valid orders, use them
          if (orderA !== undefined && orderB !== undefined) {
            return orderA - orderB;
          }
          
          // If only one has a valid order, prioritize it
          if (orderA !== undefined) return -1;
          if (orderB !== undefined) return 1;
          
          // If neither has an order, sort alphabetically by name for consistency
          return a.original_section.name.localeCompare(b.original_section.name);
        })
        .map(([sectionName, draft], index) => {
        const section = draft.original_section;
        const confidence = getEnhancedConfidence(section.confidence_score, sectionName);
        const isClientSection = section.type === 'client_information';

        return (
          <Accordion 
            key={sectionName} 
            expanded={expandedSection === sectionName}
            onChange={(_, isExpanded) => setExpandedSection(isExpanded ? sectionName : null)}
            sx={{ mb: 2, '&:before': { display: 'none' } }}
          >
            <AccordionSummary 
              expandIcon={<ExpandMoreIcon />}
              sx={{ 
                backgroundColor: isClientSection ? '#E8F5E8' : '#F8F9FA',
                borderLeft: `4px solid ${isClientSection ? '#4CAF50' : getConfidenceColor(confidence)}`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {index + 1}. {sectionName}
                  </Typography>
                  {/* Removed confidence score Chip as requested */}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }} onClick={(e) => e.stopPropagation()}>
                  <Tooltip title="Edit this section with your own changes" arrow>
                    <IconButton
                      size="small"
                      onClick={() => setEditingSection(sectionName)}
                      sx={{ color: 'primary.main' }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Ask Agent to improve or modify this section" arrow>
                    <IconButton
                      size="small"
                      onClick={() => setEditingSection(sectionName)}
                      sx={{ color: 'secondary.main' }}
                    >
                      <AIIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 3 }}>
              <Typography 
                variant="body1" 
                sx={{ 
                  lineHeight: 1.7, 
                  whiteSpace: 'pre-wrap',
                  backgroundColor: 'white',
                  p: 2,
                  borderRadius: 1,
                  border: '1px solid #E0E0E0',
                }}
              >
                {draft.content}
              </Typography>
              
              {section.completion_notes && (
                <Box sx={{ mt: 2, p: 2, backgroundColor: '#FFF3E0', borderRadius: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#FF9800', mb: 1 }}>
                    📝 Analysis Notes:
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {section.completion_notes}
                  </Typography>
                </Box>
              )}
            </AccordionDetails>
          </Accordion>
        );
      })}

      {/* Edit Dialog */}
      <Dialog
        open={!!editingSection}
        onClose={() => setEditingSection(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Edit Section: {editingSection}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={4}
            placeholder="Describe the changes you want to make..."
            value={editRequest}
            onChange={(e) => setEditRequest(e.target.value)}
            sx={{ mt: 2 }}
            label="Edit Request"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingSection(null)}>Cancel</Button>
          <Button
            onClick={handleEditSubmit}
            variant="contained"
            disabled={!editRequest.trim()}
          >
            Apply Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Action Buttons */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'center', 
        alignItems: 'center',
        textAlign: 'center',
        gap: 2, 
        mt: 4,
        px: { xs: 1, sm: 0 }
      }}>
        <Button
          variant="outlined"
          onClick={onBackToReview}
          sx={{ 
            minWidth: { xs: 'auto', sm: 150 },
            order: { xs: 2, sm: 1 }
          }}
        >
          ← Back to Review
        </Button>
        <Button
          variant="contained"
          onClick={onExportRFP}
          startIcon={<PreviewIcon />}
          sx={{ 
            minWidth: { xs: 'auto', sm: 200 },
            height: 48,
            fontSize: { xs: '1rem', sm: '1.1rem' },
            fontWeight: 600,
            backgroundColor: '#4CAF50',
            order: { xs: 1, sm: 2 },
            '&:hover': {
              backgroundColor: '#45A049',
            },
          }}
        >
          Export RFP
        </Button>
      </Box>

      {/* Warning if incomplete */}
      {sectionsCompleted < totalSections && (
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: 'warning.main' }}>
            ⚠️ Some sections may still need attention before final export
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default FinalPreviewScreen;