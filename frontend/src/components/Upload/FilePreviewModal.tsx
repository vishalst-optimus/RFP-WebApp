import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Close as CloseIcon,
  PictureAsPdf as PdfIcon,
  Description as DocIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
} from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import * as mammoth from 'mammoth';
import type { UploadedFile } from '../../types/index';

// Configure PDF.js worker - Use local worker to avoid CORS issues
pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

interface FilePreviewModalProps {
  file: UploadedFile | null;
  open: boolean;
  onClose: () => void;
}

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  file,
  open,
  onClose,
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [wordContent, setWordContent] = useState<string>('');

  // Reset state when modal opens/closes or file changes
  useEffect(() => {
    if (open && file) {
      setLoading(true);
      setError(null);
      setScale(1.0);
      setPageNumber(1);
      setNumPages(0);
      setWordContent('');
    }
  }, [open, file]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setLoading(false);
    setError(null);
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('Error loading PDF:', error);
    let errorMessage = 'Failed to load PDF document';
    
    if (error.message.includes('fetch')) {
      errorMessage = 'Network error: Cannot load PDF worker. Please check your internet connection.';
    } else if (error.message.includes('Invalid PDF')) {
      errorMessage = 'Invalid PDF file format. Please ensure the file is a valid PDF document.';
    } else if (error.message.includes('worker')) {
      errorMessage = 'PDF worker loading failed. This might be due to browser security restrictions.';
    } else {
      errorMessage = `Failed to load PDF document: ${error.message}`;
    }
    
    setError(errorMessage);
    setLoading(false);
  }, []);

  // Process Word document using mammoth.js
  const processWordDocument = useCallback(async (file: File) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
      setWordContent(result.value);
      
      if (result.messages.length > 0) {
        console.warn('Word document conversion warnings:', result.messages);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error processing Word document:', error);
      setError(`Failed to load Word document: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setLoading(false);
    }
  }, []);

  // Load Word document when file changes
  useEffect(() => {
    if (open && file && (file.type.includes('wordprocessingml') || file.type.includes('msword'))) {
      processWordDocument(file.file);
    }
  }, [open, file, processWordDocument]);

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.2, 3.0));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.2, 0.5));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('pdf')) {
      return <PdfIcon sx={{ fontSize: 40, color: '#D32F2F' }} />;
    }
    return <DocIcon sx={{ fontSize: 40, color: '#1976D2' }} />;
  };

  const renderDocumentPreview = () => {
    if (!file) {
      return (
        <Box sx={{ textAlign: 'center', p: 4 }}>
          <Typography variant="body1" color="text.secondary">
            No file selected
          </Typography>
        </Box>
      );
    }

    if (file.type.includes('pdf')) {
      // Use the actual file object instead of fileUrl for better compatibility
      const fileSource = file.fileUrl || file.file;
      
      return (
        <Box>
          {/* PDF Controls */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            mb: 2,
            p: 2,
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
            borderRadius: 1
          }}>
            <Typography variant="body2">
              {numPages > 0 ? `Pages: ${numPages}` : 'Loading...'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <IconButton onClick={handleZoomOut} size="small" disabled={loading}>
                <ZoomOutIcon />
              </IconButton>
              <Typography variant="body2" sx={{ alignSelf: 'center', minWidth: '60px', textAlign: 'center' }}>
                {Math.round(scale * 100)}%
              </Typography>
              <IconButton onClick={handleZoomIn} size="small" disabled={loading}>
                <ZoomInIcon />
              </IconButton>
            </Box>
          </Box>

          {/* Error Display */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              <Typography variant="body2">{error}</Typography>
              <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                This might be due to browser security restrictions. Try using a different PDF or contact support.
              </Typography>
            </Alert>
          )}

          {/* Loading Indicator */}
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4 }}>
              <CircularProgress size={40} />
              <Typography variant="body2" sx={{ ml: 2 }}>
                Loading PDF document...
              </Typography>
            </Box>
          )}

          {/* PDF Document */}
          <Box sx={{ 
            maxHeight: '60vh', 
            overflow: 'auto',
            border: '1px solid rgba(0, 0, 0, 0.12)',
            borderRadius: 1,
            backgroundColor: '#f5f5f5',
            p: 1,
            display: loading ? 'none' : 'block'
          }}>
            <Document
              file={fileSource}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                  <CircularProgress />
                </Box>
              }
              options={{
                cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
                cMapPacked: true,
                standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/',
              }}
            >
              {!error && numPages > 0 && Array.from(new Array(numPages), (el, index) => (
                <Box key={`page_${index + 1}`} sx={{ mb: 2, textAlign: 'center' }}>
                  <Page
                    pageNumber={index + 1}
                    scale={scale}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    loading={
                      <Box sx={{ p: 2 }}>
                        <CircularProgress size={20} />
                        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                          Loading page {index + 1}...
                        </Typography>
                      </Box>
                    }
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    Page {index + 1} of {numPages}
                  </Typography>
                </Box>
              ))}
            </Document>
          </Box>
        </Box>
      );
    } else if (file.type.includes('wordprocessingml') || file.type.includes('msword')) {
      // Word document preview using mammoth.js
      return (
        <Box>
          {/* Error Display */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              <Typography variant="body2">{error}</Typography>
              <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                This might be due to document format issues. Please try a different file or contact support.
              </Typography>
            </Alert>
          )}

          {/* Loading Indicator */}
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4 }}>
              <CircularProgress size={40} />
              <Typography variant="body2" sx={{ ml: 2 }}>
                Processing Word document...
              </Typography>
            </Box>
          )}

          {/* Word Document Content */}
          {!loading && !error && wordContent && (
            <Box sx={{ 
              maxHeight: '60vh', 
              overflow: 'auto',
              border: '1px solid rgba(0, 0, 0, 0.12)',
              borderRadius: 1,
              backgroundColor: 'white',
              p: 3
            }}>
              <div 
                dangerouslySetInnerHTML={{ __html: wordContent }}
                style={{
                  fontFamily: 'Arial, sans-serif',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  color: '#333'
                }}
              />
            </Box>
          )}

          {/* No content state */}
          {!loading && !error && !wordContent && (
            <Box sx={{ 
              border: '1px solid rgba(0, 0, 0, 0.12)', 
              borderRadius: 2, 
              p: 3,
              backgroundColor: '#F9F9F9',
              minHeight: 200,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Box sx={{ textAlign: 'center' }}>
                <DocIcon sx={{ fontSize: 80, color: '#1976D2', mb: 2 }} />
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Word Document
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Document content will be processed for analysis
                </Typography>
                <Chip 
                  label={`${formatFileSize(file.size)}`} 
                  color="primary" 
                  size="small" 
                />
              </Box>
            </Box>
          )}
        </Box>
      );
    } else {
      // For other non-PDF files, show placeholder
      return (
        <Box sx={{ 
          border: '1px solid rgba(0, 0, 0, 0.12)', 
          borderRadius: 2, 
          p: 3,
          backgroundColor: '#F9F9F9',
          minHeight: 200,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Box sx={{ textAlign: 'center' }}>
            <DocIcon sx={{ fontSize: 80, color: '#1976D2', mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>
              Document File
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Document content will be processed for analysis
            </Typography>
            <Chip 
              label={`${formatFileSize(file.size)}`} 
              color="primary" 
              size="small" 
            />
          </Box>
        </Box>
      );
    }
  };

  if (!file) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          maxHeight: '90vh',
        }
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
          pb: 2,
        }}
      >
        <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
          File Preview: {file.name}
        </Typography>
        <IconButton
          onClick={onClose}
          sx={{
            color: 'grey.500',
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.04)',
            },
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            {getFileIcon(file.type)}
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 500 }}>
                {file.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {file.type.split('/').pop()?.toUpperCase()} • {formatFileSize(file.size)}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Document Preview */}
        {renderDocumentPreview()}

        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            {file.type.includes('pdf') 
              ? "Use zoom controls to adjust the document size. The full PDF is displayed above."
              : (file.type.includes('wordprocessingml') || file.type.includes('msword'))
              ? "Word document content is displayed above with preserved formatting. The document will be processed for AI analysis."
              : "Note: Detailed file content preview will be available after the document is processed by our AI analysis engine."
            }
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default FilePreviewModal;