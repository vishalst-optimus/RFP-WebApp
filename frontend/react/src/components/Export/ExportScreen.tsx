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
  FormControl,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  LinearProgress,
  Alert,
} from '@mui/material';
import {
  CheckCircle as CompleteIcon,
  Download as DownloadIcon,
  Description as DocumentIcon,
  GetApp as ExportIcon,
  Assignment as AssignmentIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import type { SectionDraft } from '../../types';

interface ExportScreenProps {
  projectName: string;
  completionStatus: string;
  documentCount: number;
  averageScore: number;
  avgConfidence: number;
  sectionDrafts: Record<string, SectionDraft>;
  onExportDocument: (format: 'docx' | 'pdf') => void;
  onExportProfessionalDocument?: () => void;
  onStartNewRFP: () => void;
  onBackToPreview: () => void;
  isExporting?: boolean;
  exportProgress?: number;
  isProfessionalExporting?: boolean;
  professionalExportProgress?: string;
  documentStats?: {
    processingTime: string;
    documentSize: string;
    sectionsProcessed: string;
  };
}

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

const getSectionConfidence = (draft: SectionDraft): number => {
  return getEnhancedConfidence(draft.original_section.confidence_score, draft.original_section.name);
};

const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 80) return '#4CAF50';
  if (confidence >= 60) return '#FF9800';
  return '#F44336';
};

const getConfidenceLabel = (confidence: number): string => {
  if (confidence >= 80) return 'High';
  if (confidence >= 60) return 'Medium';
  return 'Low';
};

const ExportScreen: React.FC<ExportScreenProps> = ({
  projectName,
  completionStatus,
  documentCount,
  averageScore,
  avgConfidence,
  sectionDrafts,
  onExportDocument,
  onExportProfessionalDocument,
  onStartNewRFP,
  onBackToPreview,
  isExporting = false,
  exportProgress = 0,
  isProfessionalExporting = false,
  professionalExportProgress = 'Initializing...',
  documentStats,
}) => {
  const [exportFormat, setExportFormat] = useState<'docx' | 'pdf'>('docx');
  const [showNewRFPDialog, setShowNewRFPDialog] = useState(false);

  const handleExport = () => {
    onExportDocument(exportFormat);
  };

  const isDocumentReady = completionStatus === 'complete' || Object.keys(sectionDrafts).length > 0;

  return (
    <Box sx={{ 
      maxWidth: 1200, 
      mx: 'auto', 
      p: { xs: 2, sm: 3, md: 4 },
      width: '100%'
    }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <CompleteIcon sx={{ fontSize: 64, color: '#4CAF50', mb: 2 }} />
        <Typography variant="h3" sx={{ mb: 2, fontWeight: 700 }}>
          ✓ RFP Response Ready
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          Your RFP response is complete and ready for export. Review and 
          download your document.
        </Typography>
      </Box>

      {/* Project Status Card */}
      <Card sx={{ mb: 4, border: '2px solid #4CAF50' }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <AssignmentIcon sx={{ fontSize: 32, color: '#4CAF50' }} />
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {projectName}
              </Typography>
              <Chip 
                label={`Completed on ${new Date().toLocaleDateString()}`}
                color="success"
                sx={{ mt: 1 }}
              />
            </Box>
          </Box>

          <Grid container spacing={{ xs: 2, md: 3 }} sx={{ mt: 2 }}>
            <Grid item xs={6} sm={6} md={3}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography 
                  variant="h4" 
                  sx={{ 
                    color: '#4CAF50', 
                    fontWeight: 700,
                    fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' }
                  }}
                >
                  {Object.keys(sectionDrafts).length}
                </Typography>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    fontWeight: 600,
                    fontSize: { xs: '0.75rem', sm: '0.875rem' }
                  }}
                >
                  Total Sections
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6} sm={6} md={3}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography 
                  variant="h4" 
                  sx={{ 
                    color: '#2196F3', 
                    fontWeight: 700,
                    fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' }
                  }}
                >
                  {documentCount}
                </Typography>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    fontWeight: 600,
                    fontSize: { xs: '0.75rem', sm: '0.875rem' }
                  }}
                >
                  Documents
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6} sm={6} md={3}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography 
                  variant="h4" 
                  sx={{ 
                    color: '#FF9800', 
                    fontWeight: 700,
                    fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' }
                  }}
                >
                  {averageScore}
                </Typography>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    fontWeight: 600,
                    fontSize: { xs: '0.75rem', sm: '0.875rem' }
                  }}
                >
                  Quality
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={6} sm={6} md={3}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography 
                  variant="h4" 
                  sx={{ 
                    color:'#888887ff',
                    fontWeight: 700,
                    fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' }
                  }}
                >
                  {avgConfidence}%
                </Typography>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    fontWeight: 600,
                    fontSize: { xs: '0.75rem', sm: '0.875rem' }
                  }}
                >
                  Avg Confidence
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={{ xs: 2, sm: 3, md: 4 }} sx={{ justifyContent: 'center' }}>
        {/* Export Options */}
        <Grid item xs={12} md={6} lg={6} xl={6} sx={{ flex: 1, width: '100%' }}>
          <Card sx={{ width: '100%' }}>
            <CardContent sx={{ textAlign: 'left' }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center', width: '100%' }}>
                <ExportIcon /> Export Options
              </Typography>

              <Typography variant="body2" sx={{ mb: 2, fontWeight: 600, textAlign: 'center' }}>
                Export Format
              </Typography>
              <FormControl fullWidth sx={{ mb: 3 }}>
                <Select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as 'docx' | 'pdf')}
                >
                  <MenuItem value="docx">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <DocumentIcon sx={{ color: '#2196F3' }} />
                      Microsoft Word (.docx)
                    </Box>
                  </MenuItem>
                  <MenuItem value="pdf" disabled>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <DocumentIcon sx={{ color: '#F44336' }} />
                      PDF Document (.pdf) - Coming Soon
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>

              {/* Professional Word Export */}
              <Typography variant="body2" sx={{ mb: 2, fontWeight: 600, textAlign: 'center' }}>
                Agent-Enhanced Professional Export
              </Typography>
              <Box sx={{ mb: 3, p: 2, backgroundColor: '#E3F2FD', borderRadius: 1, border: '1px solid #2196F3', textAlign: 'center' }}>
                <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#1976D2', textAlign: 'left' }}>
                  Professional Word Document Features:
                </Typography>
                <Typography variant="caption" component="div" sx={{ textAlign: 'left' }}>
                  • Agent-enhanced formatting and professional styling
                </Typography>
                <Typography variant="caption" component="div" sx={{ textAlign: 'left' }}>
                  • Improved content structure and flow
                </Typography>
                <Typography variant="caption" component="div" sx={{ textAlign: 'left' }}>
                  • Proper headings, bullet points, and spacing
                </Typography>
                <Typography variant="caption" component="div" sx={{ textAlign: 'left' }}>
                  • Professional business document layout
                </Typography>
              </Box>

              {isProfessionalExporting && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, textAlign: 'center' }}>
                    {professionalExportProgress}
                  </Typography>
                  <Box sx={{ width: '100%', maxWidth: 400, mx: 'auto' }}>
                    <LinearProgress sx={{ height: 8, borderRadius: 4 }} />
                  </Box>
                </Box>
              )}

              <Button
                variant="contained"
                size="large"
                fullWidth
                startIcon={<DownloadIcon />}
                onClick={onExportProfessionalDocument}
                disabled={!isDocumentReady || isProfessionalExporting || !onExportProfessionalDocument}
                sx={{ 
                  height: 56,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  backgroundColor: '#2196F3',
                  mb: 2,
                  '&:hover': {
                    backgroundColor: '#1976D2',
                  },
                }}
              >
                {isProfessionalExporting ? 'Generating Professional Document...' : '🤖 Generate Professional Word Document'}
              </Button>

              {documentStats && (
                <Box sx={{ mb: 3, p: 2, backgroundColor: '#E8F5E8', borderRadius: 1 }}>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#2E7D32', textAlign: 'left' }}>
                    Last Export Statistics:
                  </Typography>
                  <Typography variant="caption" component="div" sx={{ textAlign: 'left' }}>
                    • Processing Time: {documentStats.processingTime}s
                  </Typography>
                  <Typography variant="caption" component="div" sx={{ textAlign: 'left' }}>
                    • Document Size: {Math.round(parseInt(documentStats.documentSize) / 1024 / 1024 * 100) / 100} MB
                  </Typography>
                  <Typography variant="caption" component="div" sx={{ textAlign: 'left' }}>
                    • Sections Processed: {documentStats.sectionsProcessed}
                  </Typography>
                </Box>
              )}

              {/* Simple Export Divider */}
              <Box sx={{ display: 'flex', alignItems: 'center', my: 3 }}>
                <Box sx={{ flexGrow: 1, height: 1, backgroundColor: '#E0E0E0' }} />
                <Typography variant="caption" sx={{ px: 2, color: 'text.secondary' }}>
                  OR
                </Typography>
                <Box sx={{ flexGrow: 1, height: 1, backgroundColor: '#E0E0E0' }} />
              </Box>

              <Typography variant="body2" sx={{ mb: 2, fontWeight: 600, textAlign: 'center' }}>
                📄 Simple Text Export
              </Typography>
              <Box sx={{ mb: 3, p: 2, backgroundColor: '#F5F5F5', borderRadius: 1, textAlign: 'center' }}>
                <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, textAlign: 'left' }}>
                  Basic Text Document Features:
                </Typography>
                <Typography variant="caption" component="div" sx={{ textAlign: 'left' }}>
                  • Basic text formatting
                </Typography>
                <Typography variant="caption" component="div" sx={{ textAlign: 'left' }}>
                  • Section headers and structure
                </Typography>
                <Typography variant="caption" component="div" sx={{ textAlign: 'left' }}>
                  • Compatible with all text editors
                </Typography>
                <Typography variant="caption" component="div" sx={{ textAlign: 'left' }}>
                  • Fast and lightweight
                </Typography>
              </Box>

              {isExporting && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, textAlign: 'center' }}>
                    Generating Document... {exportProgress}%
                  </Typography>
                  <Box sx={{ width: '100%', maxWidth: 400, mx: 'auto' }}>
                    <LinearProgress 
                      variant="determinate" 
                      value={exportProgress}
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>
                </Box>
              )}

              <Button
                variant="outlined"
                size="large"
                fullWidth
                startIcon={<DownloadIcon />}
                onClick={handleExport}
                disabled={!isDocumentReady || isExporting || isProfessionalExporting}
                sx={{ 
                  height: 48,
                  fontSize: '1rem',
                  fontWeight: 600,
                }}
              >
                {isExporting ? 'Generating...' : 'Export Simple Text'}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Final Response Summary */}
        <Grid item xs={12} md={6} lg={6} xl={6} sx={{ flex: 1, width: '100%' }}>
          <Card sx={{ width: '100%' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'center' }}>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center', width: '100%' }}>
                Final Response Summary
              </Typography>

              <List sx={{ width: '100%', maxWidth: 420, mx: 'auto', textAlign: 'left' }}>
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
                  .map(([sectionName, draft]) => {
                    const confidence = getSectionConfidence(draft);
                    return (
                      <ListItem 
                        key={sectionName} 
                        sx={{ 
                          backgroundColor: '#E8F5E8', // light green
                          borderRadius: 1,
                          mb: 1,
                          border: '1px solid #4CAF5020',
                          borderLeftColor: '#4CAF50',
                          borderLeftWidth: 4,
                          justifyContent: 'left',
                          textAlign: 'left',
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 36, display: 'flex', justifyContent: 'left' }}>
                          <CompleteIcon sx={{ color: '#4CAF50' }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'left', width: '100%', color: '#4CAF50' }}>
                              {sectionName}
                            </Typography>
                          }
                          secondary={
                            <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'left', width: '100%' }}>
                              {draft.content.length} characters
                            </Typography>
                          }
                        />
                      </ListItem>
                    );
                  })}
              </List>

              {!isDocumentReady && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Document is not ready for download. Please ensure all sections are completed.
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Action Buttons */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'center', 
        gap: 2, 
        mt: 4,
        px: { xs: 1, sm: 0 }
      }}>
        <Button
          variant="outlined"
          onClick={onBackToPreview}
          sx={{ 
            minWidth: { xs: 'auto', sm: 150 },
            order: { xs: 2, sm: 1 }
          }}
        >
          ← Back
        </Button>
        <Button
          variant="outlined"
          onClick={() => setShowNewRFPDialog(true)}
          startIcon={<RefreshIcon />}
          sx={{ 
            minWidth: { xs: 'auto', sm: 150 },
            order: { xs: 1, sm: 2 }
          }}
        >
          Start New RFP
        </Button>
      </Box>

      {/* New RFP Dialog */}
      <Dialog
        open={showNewRFPDialog}
        onClose={() => setShowNewRFPDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Start New RFP Project
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            This will clear your current session and start a new RFP analysis. 
            Make sure you have exported your current work if needed.
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Your current project: <strong>{projectName}</strong>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowNewRFPDialog(false)}>Cancel</Button>
          <Button
            onClick={() => {
              setShowNewRFPDialog(false);
              onStartNewRFP();
            }}
            variant="contained"
            color="primary"
          >
            Start New Project
          </Button>
        </DialogActions>
      </Dialog>

      {/* Footer Note */}
      <Box sx={{ textAlign: 'center', mt: 4, p: 3, backgroundColor: '#F8F9FA', borderRadius: 2 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Document ready for download.<br />
          <strong>Format:</strong> DOCX • <strong>Size:</strong> ~{Math.round(Object.keys(sectionDrafts).length * 2.5)}KB estimated
        </Typography>
      </Box>
    </Box>
  );
};

export default ExportScreen;