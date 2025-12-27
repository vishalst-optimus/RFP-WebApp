import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  Typography,
  Grid,
  IconButton,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Divider,
  InputAdornment,
  useTheme,
} from '@mui/material';
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  AttachMoney as MoneyIcon,
  CloudUpload as UploadIcon,
} from '@mui/icons-material';
import { rfpApi, SubscriptionRequiredError } from '../../services/api';
import SectionSelectionDialog from './SectionSelectionDialog';

// Types
interface PricingSection {
  id: string;
  name: string;
  content?: string;
  isPricingRelated: boolean;
}

interface PricingTableData {
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
  sectionName?: string;
}

interface PricingItem {
  id: string;
  category: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface PricingBuilderDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (pricingData: any) => void;
  rfpName: string;
  sessionId?: string;
}

const CATEGORY_OPTIONS = [
  'Setup',
  'Hourly', 
  'Annual',
  'Equipment',
  'One-Time'
];

const PricingBuilderDialog: React.FC<PricingBuilderDialogProps> = ({
  open,
  onClose,
  onInsert,
  rfpName,
  sessionId
}) => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const [currency, setCurrency] = useState('USD ($)');
  const [taxRate, setTaxRate] = useState(10);
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [fileData, setFileData] = useState<any[] | null>(null);
  
  // Section selection state
  const [showSectionDialog, setShowSectionDialog] = useState(false);
  const [availableSections, setAvailableSections] = useState<PricingSection[]>([]);
  const [isLoadingSections, setIsLoadingSections] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  
  const [pricingItems, setPricingItems] = useState<PricingItem[]>([
    {
      id: '1',
      category: 'Setup',
      description: 'Initial Setup & Training',
      quantity: 0,
      unitPrice: 5000,
      total: 0
    },
    {
      id: '2',
      category: 'Hourly',
      description: 'Service or item description',
      quantity: 1,
      unitPrice: 0,
      total: 0
    }
  ]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    
    // Clear relevant state when switching tabs to prevent data crossover
    if (newValue === 0) {
      // Switching to Manual Entry tab - clear file-related states
      setFileData(null);
      setSelectedFile(null);
      setIsProcessingFile(false);
      setSubmitError(null);
    } else if (newValue === 1) {
      // Switching to Upload File tab - clear manual entry error states
      setSubmitError(null);
    }
  };

  const addNewRow = () => {
    const newItem: PricingItem = {
      id: Date.now().toString(),
      category: 'Setup',
      description: '',
      quantity: 1,
      unitPrice: 0,
      total: 0
    };
    setPricingItems([...pricingItems, newItem]);
  };

  const updatePricingItem = (id: string, field: keyof PricingItem, value: any) => {
    setPricingItems(items => 
      items.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };
          
          // Recalculate total when quantity or unitPrice changes
          if (field === 'quantity' || field === 'unitPrice') {
            updatedItem.total = updatedItem.quantity * updatedItem.unitPrice;
          }
          
          return updatedItem;
        }
        return item;
      })
    );
  };

  const deleteRow = (id: string) => {
    setPricingItems(items => items.filter(item => item.id !== id));
  };

  const calculateSubtotal = () => {
    return pricingItems.reduce((sum, item) => sum + item.total, 0);
  };

  const calculateTax = () => {
    return (calculateSubtotal() * taxRate) / 100;
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const handleInsert = async () => {
    if (!sessionId) {
      setSubmitError('Session ID is required. Please refresh the page and try again.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setIsLoadingSections(true);
    
    try {
      // First, fetch pricing sections
      console.log('🔍 Fetching pricing sections...');
      const sectionsResponse = await rfpApi.getPricingSections(sessionId, rfpName);
      
      setAvailableSections(sectionsResponse.sections);
      setIsLoadingSections(false);
      setIsSubmitting(false);
      setShowSectionDialog(true);
      
    } catch (error: any) {
      console.error('Error fetching pricing sections:', error);
      setIsLoadingSections(false);
      
      if (error instanceof SubscriptionRequiredError) {
        setSubmitError('Subscription required to add pricing tables to RFP documents.');
      } else {
        setSubmitError(error.message || 'Failed to fetch sections. Please try again.');
      }
      setIsSubmitting(false);
    }
  };

  const handleSectionSelection = async (selectedSectionIds: string[], customSectionName?: string) => {
    setShowSectionDialog(false);
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      let result;
      
      // Debug logging to track which path is taken
      console.log('🔄 handleSectionSelection called:', {
        hasFileData: !!fileData,
        fileDataLength: fileData?.length || 0,
        activeTab,
        selectedFile: selectedFile?.name || 'none'
      });
      
      if (fileData) {
        // Use file data API for Excel/CSV uploads - preserves all columns
        const fileTableData = {
          rfpName,
          sessionId: sessionId!,
          selectedSections: selectedSectionIds,
          sectionName: customSectionName,
          fileName: selectedFile?.name,
          tableData: fileData, // Raw JSON from xlsx library - no column transformation
          notes
        };
        
        console.log('📁 Submitting file table data:', fileTableData);
        result = await rfpApi.submitFileTable(fileTableData);
      } else {
        // Use manual entry API for manually entered data
        const pricingData: PricingTableData = {
          rfpName,
          currency,
          items: pricingItems,
          subtotal: calculateSubtotal(),
          taxRate,
          tax: calculateTax(),
          total: calculateTotal(),
          notes,
          sessionId: sessionId!,
          selectedSections: selectedSectionIds,
          sectionName: customSectionName
        };
        
        console.log('📊 Submitting pricing table with sections:', selectedSectionIds);
        result = await rfpApi.submitPricingTable(pricingData);
      }
      
      // Call the original onInsert for any local state updates
      onInsert({
        ...(fileData ? { fileData, fileName: selectedFile?.name } : { pricingData: pricingItems }),
        result
      });
      
      onClose();
    } catch (error: any) {
      console.error('Error submitting table:', error);
      
      if (error instanceof SubscriptionRequiredError) {
        setSubmitError('Subscription required to add pricing tables to RFP documents.');
      } else {
        setSubmitError(error.message || 'Failed to submit table. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSectionDialogClose = () => {
    setShowSectionDialog(false);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    onClose();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsProcessingFile(true);
    setSubmitError(null);
    
    try {
      const jsonData = await processExcelFile(file);
      setFileData(jsonData);
      
      // Count sheets processed
      const sheetsProcessed = [...new Set(jsonData.map((row: any) => row._sheetName))];
      console.log(`📄 File processed successfully: ${sheetsProcessed.length} sheet(s) processed`, {
        sheets: sheetsProcessed,
        totalRows: jsonData.length,
        data: jsonData
      });
    } catch (error: any) {
      console.error('Error processing file:', error);
      setSubmitError(error.message || 'Failed to process file. Please check the file format.');
    } finally {
      setIsProcessingFile(false);
    }
  };

  const processExcelFile = async (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          
          // Process all sheets in the workbook
          const allSheetData: any[] = [];
          
          workbook.SheetNames.forEach((sheetName, index) => {
            const worksheet = workbook.Sheets[sheetName];
            
            // Convert to JSON - preserve all columns and structure
            const sheetJsonData = XLSX.utils.sheet_to_json(worksheet);
            
            if (sheetJsonData.length > 0) {
              // Add sheet metadata to each row for identification
              const dataWithSheetInfo = sheetJsonData.map((row: any) => ({
                ...row,
                _sheetName: sheetName,
                _sheetIndex: index
              }));
              
              allSheetData.push(...dataWithSheetInfo);
            }
          });
          
          if (allSheetData.length === 0) {
            throw new Error('File appears to be empty or has no valid data across all sheets.');
          }
          
          resolve(allSheetData);
        } catch (error) {
          reject(new Error('Failed to parse file. Please ensure it is a valid Excel or CSV file.'));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file.'));
      };
      
      reader.readAsBinaryString(file);
    });
  };

  const handleUploadFileData = async () => {
    if (!fileData || !sessionId) {
      setSubmitError('No file data or session ID available.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setIsProcessingFile(true);
    
    try {
      // First, fetch pricing sections
      console.log('🔍 Fetching pricing sections...');
      const sectionsResponse = await rfpApi.getPricingSections(sessionId, rfpName);
      
      setAvailableSections(sectionsResponse.sections);
      setIsProcessingFile(false);
      setIsSubmitting(false);
      setShowSectionDialog(true);
      
    } catch (error: any) {
      console.error('Error fetching pricing sections:', error);
      setIsProcessingFile(false);
      
      if (error instanceof SubscriptionRequiredError) {
        setSubmitError('Subscription required to add pricing tables to RFP documents.');
      } else {
        setSubmitError(error.message || 'Failed to fetch sections. Please try again.');
      }
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="lg"
        fullWidth
        key={theme.palette.mode}
        PaperProps={{
          sx: {
            borderRadius: 3,
            minHeight: '70vh',
            backgroundColor: theme.palette.background.paper,
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: 'none',
          pb: 1,
          pt: 2
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MoneyIcon sx={{ color: theme.palette.text.secondary, fontSize: '1.25rem' }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              Pricing Builder
            </Typography>
          </Box>
          <IconButton onClick={handleClose} sx={{ color: theme.palette.text.secondary }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

      <DialogContent sx={{ p: 0, height: '600px', overflow: 'hidden', backgroundColor: theme.palette.background.default }}>
        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: theme.palette.divider, px: 3, pt: 1 }}>
          <Tabs 
            value={activeTab} 
            onChange={handleTabChange}
            sx={{
              '& .MuiTabs-indicator': {
                backgroundColor: theme.palette.primary.main
              },
              '& .MuiTab-root': {
                '&:focus': {
                  outline: 'none'
                },
                '&:focus-visible': {
                  outline: 'none'
                },
                '&.Mui-focusVisible': {
                  outline: 'none'
                }
              }
            }}
          >
            <Tab 
              label="Manual Entry" 
              sx={{ 
                textTransform: 'none',
                fontWeight: 500,
                color: activeTab === 0 ? theme.palette.primary.main : theme.palette.text.secondary,
                '&:focus': {
                  outline: 'none'
                },
                '&:focus-visible': {
                  outline: 'none'
                },
                '&.Mui-focusVisible': {
                  outline: 'none'
                }
              }} 
            />
            <Tab 
              label="Upload Cost Card" 
              sx={{ 
                textTransform: 'none',
                fontWeight: 500,
                color: activeTab === 1 ? theme.palette.primary.main : theme.palette.text.secondary,
                '&:focus': {
                  outline: 'none'
                },
                '&:focus-visible': {
                  outline: 'none'
                },
                '&.Mui-focusVisible': {
                  outline: 'none'
                }
              }} 
            />
          </Tabs>
        </Box>

        <Box sx={{ height: 'calc(600px - 80px)', overflow: 'auto' }}>
          {/* Manual Entry Tab Content */}
          {activeTab === 0 && (
            <Box sx={{ p: 3 }}>
              {/* Currency and Add Row Section */}
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                mb: 2,
                mt: 2
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="body1" sx={{ fontWeight: 500, color: theme.palette.text.primary }}>
                    Currency:
                  </Typography>
                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <Select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      sx={{ 
                        backgroundColor: theme.palette.background.paper,
                        '& .MuiOutlinedInput-notchedOutline': {
                          borderColor: theme.palette.divider
                        }
                      }}
                    >
                      <MenuItem value="USD ($)">USD ($)</MenuItem>
                      <MenuItem value="EUR (€)">EUR (€)</MenuItem>
                      <MenuItem value="GBP (£)">GBP (£)</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={addNewRow}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 500,
                    color: theme.palette.text.primary,
                    borderColor: theme.palette.divider,
                    '&:hover': {
                      borderColor: theme.palette.text.secondary,
                      backgroundColor: theme.palette.action.hover
                    }
                  }}
                >
                  Add Row
                </Button>
              </Box>

              {/* Pricing Table */}
              <TableContainer component={Paper} sx={{ mb: 3, border: `1px solid ${theme.palette.divider}`, boxShadow: 'none' }}>
                <Table>
                  <TableHead sx={{ backgroundColor: theme.palette.action.hover }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 500, color: theme.palette.text.secondary, fontSize: '0.875rem', py: 2 }}>Category</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: theme.palette.text.secondary, fontSize: '0.875rem' }}>Description</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: theme.palette.text.secondary, fontSize: '0.875rem', textAlign: 'center' }}>Quantity</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: theme.palette.text.secondary, fontSize: '0.875rem', textAlign: 'center' }}>Unit Price</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: theme.palette.text.secondary, fontSize: '0.875rem', textAlign: 'center' }}>Total</TableCell>
                      <TableCell sx={{ width: 40 }}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pricingItems.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell sx={{ width: 140, py: 1.5 }}>
                          <FormControl fullWidth size="small">
                            <Select
                              value={item.category}
                              onChange={(e) => updatePricingItem(item.id, 'category', e.target.value)}
                              sx={{
                                '& .MuiOutlinedInput-notchedOutline': {
                                  borderColor: theme.palette.divider
                                },
                                '& .MuiSelect-select': {
                                  py: 1
                                }
                              }}
                            >
                              {CATEGORY_OPTIONS.map((category) => (
                                <MenuItem key={category} value={category}>
                                  {category}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell sx={{ py: 1.5 }}>
                          <TextField
                            fullWidth
                            size="small"
                            value={item.description}
                            onChange={(e) => updatePricingItem(item.id, 'description', e.target.value)}
                            placeholder="Service or item description"
                            variant="outlined"
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                '& fieldset': {
                                  borderColor: theme.palette.divider
                                },
                                '& input': {
                                  py: 1,
                                  color: theme.palette.text.primary
                                }
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ width: 80, py: 1.5 }}>
                          <TextField
                            size="small"
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updatePricingItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                            inputProps={{ min: 0, style: { textAlign: 'center' } }}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                '& fieldset': {
                                  borderColor: theme.palette.divider
                                },
                                '& input': {
                                  py: 1,
                                  color: theme.palette.text.primary
                                }
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ width: 140, py: 1.5 }}>
                          <TextField
                            size="small"
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => updatePricingItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                            inputProps={{ min: 0, style: { textAlign: 'center' } }}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                '& fieldset': {
                                  borderColor: theme.palette.divider
                                },
                                '& input': {
                                  py: 1,
                                  color: theme.palette.text.primary
                                }
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ width: 100, textAlign: 'center', py: 1.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, color: theme.palette.text.primary }}>
                            {formatCurrency(item.total)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ width: 40, py: 1.5 }}>
                          <IconButton
                            size="small"
                            onClick={() => deleteRow(item.id)}
                            sx={{ color: theme.palette.error.main }}
                            disabled={pricingItems.length === 1}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Totals Section */}
              <Box sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="body1" sx={{ fontWeight: 500, color: theme.palette.text.primary, fontSize: '1rem' }}>
                    Subtotal:
                  </Typography>
                  <Typography variant="body1" sx={{ color: theme.palette.text.primary, fontSize: '1rem' }}>
                    {formatCurrency(calculateSubtotal())}
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body1" sx={{ fontWeight: 500, color: theme.palette.text.primary, fontSize: '1rem' }}>
                      Tax:
                    </Typography>
                    <TextField
                      size="small"
                      type="number"
                      value={taxRate}
                      onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                      InputProps={{
                        endAdornment: <InputAdornment position="end" sx={{ color: theme.palette.text.secondary }}>%</InputAdornment>,
                      }}
                      sx={{ 
                        width: 90,
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': {
                            borderColor: theme.palette.divider
                          },
                          '& input': {
                            py: 0.75,
                            color: theme.palette.text.primary,
                            textAlign: 'center'
                          }
                        }
                      }}
                    />
                  </Box>
                  <Typography variant="body1" sx={{ color: theme.palette.text.primary, fontSize: '1rem' }}>
                    {formatCurrency(calculateTax())}
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.text.primary, fontSize: '1.125rem' }}>
                    Total:
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.primary.main, fontSize: '1.125rem' }}>
                    {formatCurrency(calculateTotal())}
                  </Typography>
                </Box>
              </Box>

              {/* Notes Section */}
              <Box>
                <Typography variant="body1" sx={{ fontWeight: 500, mb: 1.5, color: theme.palette.text.primary }}>
                  Notes (optional)
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about pricing, payment terms, or special conditions..."
                  variant="outlined"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      '& fieldset': {
                        borderColor: theme.palette.divider
                      },
                      '& textarea': {
                        color: theme.palette.text.primary,
                        fontSize: '0.875rem'
                      }
                    }
                  }}
                />
              </Box>
            </Box>
          )}

          {/* Upload Cost Card Tab Content */}
          {activeTab === 1 && (
            <Box sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: 'calc(600px - 80px)', // Dialog content height minus tabs
              py: 0,
              backgroundColor: theme.palette.background.default,
            }}>
              <Box sx={{
                border: `2px dashed ${theme.palette.divider}`,
                borderRadius: 3,
                p: 4,
                textAlign: 'center',
                width: '100%',
                maxWidth: '400px',
                backgroundColor: theme.palette.background.paper
              }}>
                <UploadIcon sx={{ 
                  fontSize: '3rem', 
                  color: theme.palette.text.secondary,
                  mb: 2
                }} />
                <Typography variant="h6" sx={{ 
                  fontWeight: 600, 
                  color: theme.palette.text.primary,
                  mb: 1.5
                }}>
                  Upload Cost Card
                </Typography>
                <Typography variant="body1" sx={{ 
                  color: theme.palette.text.secondary,
                  mb: 3,
                  lineHeight: 1.6
                }}>
                  Upload your predefined cost card in CSV or Excel format
                </Typography>
                <input
                  accept=".csv,.xlsx,.xls"
                  style={{ display: 'none' }}
                  id="file-upload"
                  type="file"
                  onChange={handleFileUpload}
                />
                <label htmlFor="file-upload">
                  <Button
                    variant="contained"
                    component="span"
                    startIcon={<UploadIcon />}
                    sx={{
                      backgroundColor: theme.palette.primary.main,
                      color: theme.palette.primary.contrastText,
                      textTransform: 'none',
                      fontWeight: 500,
                      px: 4,
                      py: 1.5,
                      '&:hover': {
                        backgroundColor: theme.palette.primary.dark,
                      }
                    }}
                  >
                    Select File
                  </Button>
                </label>
                <Typography variant="caption" sx={{ 
                  display: 'block',
                  color: theme.palette.text.secondary,
                  mt: 2,
                  fontSize: '0.8rem'
                }}>
                  Supports: .csv, .xlsx, .xls (multi-sheet Excel files supported)
                </Typography>
                {selectedFile && (
                  <Box sx={{ mt: 3, p: 2, backgroundColor: theme.palette.action.hover, borderRadius: 1, border: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="body2" sx={{ 
                      color: theme.palette.success.main,
                      fontWeight: 500,
                      mb: 1
                    }}>
                      File selected: {selectedFile.name}
                    </Typography>
                    {isProcessingFile && (
                      <Typography variant="body2" sx={{ color: theme.palette.primary.main, mb: 1 }}>
                        Processing file...
                      </Typography>
                    )}
                    {fileData && (
                      <>
                        <Typography variant="body2" sx={{ color: theme.palette.success.main, mb: 2 }}>
                          ✓ File processed successfully! Found {fileData.length} rows
                          {fileData.length > 0 && fileData[0]._sheetName && (
                            ` from ${[...new Set(fileData.map((row: any) => row._sheetName))].length} sheet(s)`
                          )}.
                        </Typography>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={handleUploadFileData}
                          disabled={isSubmitting}
                          sx={{
                            backgroundColor: theme.palette.success.main,
                            color: theme.palette.success.contrastText,
                            textTransform: 'none',
                            fontWeight: 500,
                            '&:hover': {
                              backgroundColor: theme.palette.success.dark
                            },
                            '&:disabled': {
                              backgroundColor: theme.palette.action.disabled
                            }
                          }}
                        >
                          {isSubmitting ? 'Uploading...' : 'Upload Table Data'}
                        </Button>
                      </>
                    )}
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ 
        p: 3, 
        borderTop: `1px solid ${theme.palette.divider}`,
        gap: 2,
        justifyContent: 'space-between',
        flexDirection: submitError ? 'column' : 'row',
        alignItems: submitError ? 'stretch' : 'center'
      }}>
        {submitError && (
          <Box sx={{ 
            width: '100%',
            p: 2,
            backgroundColor: theme.palette.error.light,
            borderRadius: 1,
            border: `1px solid ${theme.palette.error.main}`,
            mb: 2
          }}>
            <Typography variant="body2" sx={{ color: theme.palette.error.main, fontWeight: 500 }}>
              {submitError}
            </Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', width: '100%' }}>
          <Button
            onClick={handleClose}
            variant="outlined"
            disabled={isSubmitting}
            sx={{ 
              textTransform: 'none',
              fontWeight: 500,
              px: 4,
              py: 1,
              color: theme.palette.text.primary,
              borderColor: theme.palette.divider,
              '&:hover': {
                borderColor: theme.palette.text.secondary,
                backgroundColor: theme.palette.action.hover
              }
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleInsert}
            variant="contained"
            disabled={isSubmitting}
            sx={{ 
              textTransform: 'none',
              fontWeight: 500,
              px: 4,
              py: 1,
              backgroundColor: theme.palette.primary.main,
              color: theme.palette.primary.contrastText,
              '&:hover': {
                backgroundColor: theme.palette.primary.dark
              },
              '&:disabled': {
                backgroundColor: theme.palette.action.disabled
              }
            }}
          >
            {isSubmitting ? (isLoadingSections ? 'Loading Sections...' : 'Inserting...') : 'Insert into RFP'}
          </Button>
        </Box>
      </DialogActions>
      </Dialog>

      {/* Section Selection Dialog */}
      <SectionSelectionDialog
        open={showSectionDialog}
        onClose={handleSectionDialogClose}
        onConfirm={handleSectionSelection}
        sections={availableSections}
        isLoading={isLoadingSections}
      />
    </>
  );
};

export default PricingBuilderDialog;