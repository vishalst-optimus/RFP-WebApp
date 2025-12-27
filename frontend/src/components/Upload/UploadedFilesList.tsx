import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Close as CloseIcon,
  PictureAsPdf as PdfIcon,
  Description as DocIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  NavigateNext as NextIcon,
  NavigateBefore as PrevIcon,
} from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import * as mammoth from 'mammoth';
import type { UploadedFile } from '../../types/index';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

interface UploadedFilesListProps {
  files: UploadedFile[];
  onRemoveFile: (fileId: string) => void;
  title?: string;
  showTitle?: boolean;
}

const UploadedFilesList: React.FC<UploadedFilesListProps> = ({
  files,
  onRemoveFile,
  title = 'Main RFP Documents',
  showTitle = true,
}) => {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [previewStates, setPreviewStates] = useState<Record<string, {
    numPages: number;
    currentPage: number;
    scale: number;
    loading: boolean;
    error: string | null;
    wordContent?: string;
  }>>({});

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('pdf')) {
      return <PdfIcon sx={{ fontSize: 24, color: 'error.main' }} />;
    }
    if (fileType.includes('wordprocessingml') || fileType.includes('msword')) {
      return <DocIcon sx={{ fontSize: 24, color: '#2B579A' }} />; // Word blue color
    }
    return <DocIcon sx={{ fontSize: 24, color: 'primary.main' }} />;
  };

  const handlePreviewClick = (file: UploadedFile) => {
    if (expandedFile === file.id) {
      setExpandedFile(null);
    } else {
      setExpandedFile(file.id);
      if (!previewStates[file.id]) {
        setPreviewStates(prev => ({
          ...prev,
          [file.id]: {
            numPages: 0,
            currentPage: 1,
            scale: 1.0,
            loading: true,
            error: null,
            wordContent: '',
          }
        }));
        
        // Process Word document if it's a Word file
        if (file.type.includes('wordprocessingml') || file.type.includes('msword')) {
          processWordDocument(file);
        }
      }
    }
  };

  // Process Word document using mammoth.js
  const processWordDocument = async (file: UploadedFile) => {
    try {
      updatePreviewState(file.id, { loading: true, error: null });
      
      const result = await mammoth.convertToHtml({ arrayBuffer: await file.file.arrayBuffer() });
      
      updatePreviewState(file.id, { 
        loading: false, 
        wordContent: result.value 
      });
      
      if (result.messages.length > 0) {
        console.warn('Word document conversion warnings:', result.messages);
      }
      
    } catch (error) {
      console.error('Error processing Word document:', error);
      updatePreviewState(file.id, { 
        loading: false, 
        error: `Failed to load Word document: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
    }
  };

  const updatePreviewState = (fileId: string, updates: Partial<typeof previewStates[string]>) => {
    setPreviewStates(prev => ({
      ...prev,
      [fileId]: { ...prev[fileId], ...updates }
    }));
  };

  const onDocumentLoadSuccess = (fileId: string) => ({ numPages }: { numPages: number }) => {
    updatePreviewState(fileId, { numPages, loading: false });
  };

  const onDocumentLoadError = (fileId: string) => (error: Error) => {
    console.error('PDF load error:', error);
    updatePreviewState(fileId, { loading: false, error: 'Failed to load PDF' });
  };

  const changePage = (fileId: string, direction: 'next' | 'prev') => {
    const state = previewStates[fileId];
    if (!state) return;

    const newPage = direction === 'next' 
      ? Math.min(state.currentPage + 1, state.numPages)
      : Math.max(state.currentPage - 1, 1);
    
    updatePreviewState(fileId, { currentPage: newPage });
  };

  const changeZoom = (fileId: string, direction: 'in' | 'out') => {
    const state = previewStates[fileId];
    if (!state) return;

    const newScale = direction === 'in' 
      ? Math.min(state.scale + 0.2, 2.0)
      : Math.max(state.scale - 0.2, 0.5);
    
    updatePreviewState(fileId, { scale: newScale });
  };

  if (files.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mb: 3 }}>
      {showTitle && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {title} ({files.length})
          </Typography>
          <Chip
            label="Primary"
            color="primary"
            size="small"
            sx={{ fontSize: '0.75rem' }}
          />
        </Box>
      )}

      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        p: 2,
        backgroundColor: 'background.paper'
      }}>
        {files.map((file, index) => {
          const isExpanded = expandedFile === file.id;
          const previewState = previewStates[file.id];
          
          return (
            <Box key={file.id}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 1.5,
                  borderRadius: 1,
                  backgroundColor: isExpanded ? 'action.selected' : 'transparent',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                  border: isExpanded ? '1px solid' : 'none',
                  borderColor: isExpanded ? 'primary.main' : 'transparent',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
                  {getFileIcon(file.type)}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {file.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {file.type.split('/').pop()?.toUpperCase()} • {formatFileSize(file.size)}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <IconButton
                    size="small"
                    onClick={() => handlePreviewClick(file)}
                    sx={{
                      color: isExpanded ? 'primary.dark' : 'text.secondary',
                      '&:hover': {
                        color: 'primary.main',
                      },
                    }}
                    aria-label={isExpanded ? "Hide preview" : "Show preview"}
                  >
                    {isExpanded ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => onRemoveFile(file.id)}
                    sx={{
                      color: 'text.secondary',
                      '&:hover': {
                        color: 'error.main',
                      },
                    }}
                    aria-label="Remove file"
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>

              {/* Inline PDF Preview */}
              {isExpanded && (
                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                  {file.type.includes('pdf') ? (
                    <Box>
                      {/* Preview Header */}
                      <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        mb: 2,
                        p: 1.5,
                        backgroundColor: 'grey.50',
                        borderRadius: 1
                      }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 1 }}>
                          <PdfIcon sx={{ color: 'error.main', fontSize: 20 }} />
                          File Preview: {file.name}
                        </Typography>
                        
                        {previewState && !previewState.loading && !previewState.error && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {/* Zoom Controls */}
                            <IconButton 
                              size="small" 
                              onClick={() => changeZoom(file.id, 'out')}
                              disabled={previewState.scale <= 0.5}
                            >
                              <ZoomOutIcon fontSize="small" />
                            </IconButton>
                            <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'center' }}>
                              {Math.round(previewState.scale * 100)}%
                            </Typography>
                            <IconButton 
                              size="small" 
                              onClick={() => changeZoom(file.id, 'in')}
                              disabled={previewState.scale >= 2.0}
                            >
                              <ZoomInIcon fontSize="small" />
                            </IconButton>

                            {/* Page Navigation */}
                            {previewState.numPages > 1 && (
                              <>
                                <Box sx={{ width: 1, height: 16, backgroundColor: 'divider', mx: 1 }} />
                                <IconButton 
                                  size="small" 
                                  onClick={() => changePage(file.id, 'prev')}
                                  disabled={previewState.currentPage <= 1}
                                >
                                  <PrevIcon fontSize="small" />
                                </IconButton>
                                <Typography variant="caption" sx={{ minWidth: 60, textAlign: 'center' }}>
                                  {previewState.currentPage} / {previewState.numPages}
                                </Typography>
                                <IconButton 
                                  size="small" 
                                  onClick={() => changePage(file.id, 'next')}
                                  disabled={previewState.currentPage >= previewState.numPages}
                                >
                                  <NextIcon fontSize="small" />
                                </IconButton>
                              </>
                            )}
                          </Box>
                        )}
                      </Box>

                      {/* PDF Content */}
                      <Box sx={{ 
                        textAlign: 'center',
                        backgroundColor: 'grey.100',
                        borderRadius: 1,
                        p: 2,
                        overflow: 'auto',
                        maxHeight: '700px',
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'center'
                      }}>
                        {previewState?.loading && (
                          <Box sx={{ py: 3 }}>
                            <CircularProgress size={30} />
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              Loading PDF...
                            </Typography>
                          </Box>
                        )}

                        {previewState?.error && (
                          <Alert severity="error" sx={{ mb: 2 }}>
                            {previewState.error}
                          </Alert>
                        )}

                        {file.fileUrl && (
                          <Document
                            file={file.fileUrl}
                            onLoadSuccess={onDocumentLoadSuccess(file.id)}
                            onLoadError={onDocumentLoadError(file.id)}
                            loading={<CircularProgress size={30} />}
                          >
                            <Page 
                              pageNumber={previewState?.currentPage || 1}
                              scale={previewState?.scale || 1.0}
                              renderTextLayer={true}
                              renderAnnotationLayer={true}
                            />
                          </Document>
                        )}
                      </Box>

                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
                        Full content analysis and extraction will begin after upload
                      </Typography>
                    </Box>
                  ) : (file.type.includes('wordprocessingml') || file.type.includes('msword')) ? (
                    <Box>
                      {/* Preview Header for Word */}
                      <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        mb: 2,
                        p: 1.5,
                        backgroundColor: 'grey.50',
                        borderRadius: 1
                      }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 1 }}>
                          <DocIcon sx={{ color: '#2B579A', fontSize: 20 }} />
                          Word Document Preview: {file.name}
                        </Typography>
                      </Box>

                      {/* Word Content */}
                      <Box sx={{ 
                        backgroundColor: 'white',
                        borderRadius: 1,
                        p: 3,
                        overflow: 'auto',
                        maxHeight: '700px',
                        width: '100%',
                        border: '1px solid #E0E0E0'
                      }}>
                        {previewState?.loading && (
                          <Box sx={{ py: 3, textAlign: 'center' }}>
                            <CircularProgress size={30} />
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              Processing Word document...
                            </Typography>
                          </Box>
                        )}

                        {previewState?.error && (
                          <Alert severity="error" sx={{ mb: 2 }}>
                            {previewState.error}
                          </Alert>
                        )}

                        {!previewState?.loading && !previewState?.error && previewState?.wordContent && (
                          <Box 
                            dangerouslySetInnerHTML={{ __html: previewState.wordContent }}
                            sx={{
                              fontFamily: 'Arial, sans-serif',
                              fontSize: '14px',
                              lineHeight: '1.6',
                              color: '#333',
                              textAlign: 'left',
                              width: '100%',
                              '& *': {
                                textAlign: 'inherit !important',
                              },
                              '& p': {
                                textAlign: 'left !important',
                                margin: '0 0 1em 0',
                              },
                              '& h1, & h2, & h3, & h4, & h5, & h6': {
                                textAlign: 'left !important',
                                margin: '1em 0 0.5em 0',
                              },
                              '& ul, & ol': {
                                textAlign: 'left !important',
                                paddingLeft: '1.5em',
                              },
                              '& li': {
                                textAlign: 'left !important',
                              },
                              '& table': {
                                width: '100%',
                                borderCollapse: 'collapse',
                                textAlign: 'left !important',
                              },
                              '& td, & th': {
                                textAlign: 'left !important',
                                padding: '8px',
                                border: '1px solid #ddd',
                              },
                              '& div': {
                                textAlign: 'left !important',
                              }
                            }}
                          />
                        )}

                        {!previewState?.loading && !previewState?.error && !previewState?.wordContent && (
                          <Box sx={{ textAlign: 'center', py: 3 }}>
                            <DocIcon sx={{ fontSize: 36, color: 'text.secondary', mb: 1 }} />
                            <Typography variant="body2" color="text.secondary">
                              Unable to preview document content
                            </Typography>
                          </Box>
                        )}
                      </Box>

                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
                        Document content is displayed with preserved formatting. Full analysis will begin after upload.
                      </Typography>
                    </Box>
                  ) : (
                    <Box sx={{ textAlign: 'center', py: 3 }}>
                      <DocIcon sx={{ fontSize: 36, color: 'text.secondary', mb: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        Preview not available for this file type
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default UploadedFilesList;