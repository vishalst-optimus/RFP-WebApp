import React, { useState } from 'react';
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
} from '@mui/material';
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  AttachMoney as MoneyIcon,
  CloudUpload as UploadIcon,
} from '@mui/icons-material';

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
  onInsert
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [currency, setCurrency] = useState('USD ($)');
  const [taxRate, setTaxRate] = useState(10);
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

  const handleInsert = () => {
    const pricingData = {
      currency,
      items: pricingItems,
      subtotal: calculateSubtotal(),
      taxRate,
      tax: calculateTax(),
      total: calculateTotal(),
      notes
    };
    onInsert(pricingData);
    onClose();
  };

  const handleClose = () => {
    onClose();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // TODO: Process the uploaded file
      console.log('File selected:', file.name);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          minHeight: '70vh',
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
          <MoneyIcon sx={{ color: '#6B7280', fontSize: '1.25rem' }} />
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#1F2937' }}>
            Pricing Builder
          </Typography>
        </Box>
        <IconButton onClick={handleClose} sx={{ color: '#9CA3AF' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, height: '600px', overflow: 'hidden' }}>
        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: '#E5E7EB', px: 3, pt: 1 }}>
          <Tabs 
            value={activeTab} 
            onChange={handleTabChange}
            sx={{
              '& .MuiTabs-indicator': {
                backgroundColor: '#1976D2'
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
                color: activeTab === 0 ? '#1976D2' : '#6B7280',
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
                color: activeTab === 1 ? '#1976D2' : '#6B7280',
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
                  <Typography variant="body1" sx={{ fontWeight: 500, color: '#374151' }}>
                    Currency:
                  </Typography>
                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <Select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      sx={{ 
                        backgroundColor: 'white',
                        '& .MuiOutlinedInput-notchedOutline': {
                          borderColor: '#D1D5DB'
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
                    color: '#374151',
                    borderColor: '#D1D5DB',
                    '&:hover': {
                      borderColor: '#9CA3AF',
                      backgroundColor: '#F9FAFB'
                    }
                  }}
                >
                  Add Row
                </Button>
              </Box>

              {/* Pricing Table */}
              <TableContainer component={Paper} sx={{ mb: 3, border: '1px solid #E5E7EB', boxShadow: 'none' }}>
                <Table>
                  <TableHead sx={{ backgroundColor: '#F9FAFB' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 500, color: '#9CA3AF', fontSize: '0.875rem', py: 2 }}>Category</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: '#9CA3AF', fontSize: '0.875rem' }}>Description</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: '#9CA3AF', fontSize: '0.875rem', textAlign: 'center' }}>Quantity</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: '#9CA3AF', fontSize: '0.875rem', textAlign: 'center' }}>Unit Price</TableCell>
                      <TableCell sx={{ fontWeight: 500, color: '#9CA3AF', fontSize: '0.875rem', textAlign: 'center' }}>Total</TableCell>
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
                                  borderColor: '#E5E7EB'
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
                                  borderColor: '#E5E7EB'
                                },
                                '& input': {
                                  py: 1,
                                  color: '#6B7280'
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
                                  borderColor: '#E5E7EB'
                                },
                                '& input': {
                                  py: 1,
                                  color: '#374151'
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
                                  borderColor: '#E5E7EB'
                                },
                                '& input': {
                                  py: 1,
                                  color: '#374151'
                                }
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ width: 100, textAlign: 'center', py: 1.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, color: '#374151' }}>
                            {formatCurrency(item.total)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ width: 40, py: 1.5 }}>
                          <IconButton
                            size="small"
                            onClick={() => deleteRow(item.id)}
                            sx={{ color: '#EF4444' }}
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
                  <Typography variant="body1" sx={{ fontWeight: 500, color: '#374151', fontSize: '1rem' }}>
                    Subtotal:
                  </Typography>
                  <Typography variant="body1" sx={{ color: '#374151', fontSize: '1rem' }}>
                    {formatCurrency(calculateSubtotal())}
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body1" sx={{ fontWeight: 500, color: '#374151', fontSize: '1rem' }}>
                      Tax:
                    </Typography>
                    <TextField
                      size="small"
                      type="number"
                      value={taxRate}
                      onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                      InputProps={{
                        endAdornment: <InputAdornment position="end" sx={{ color: '#6B7280' }}>%</InputAdornment>,
                      }}
                      sx={{ 
                        width: 90,
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': {
                            borderColor: '#E5E7EB'
                          },
                          '& input': {
                            py: 0.75,
                            color: '#374151',
                            textAlign: 'center'
                          }
                        }
                      }}
                    />
                  </Box>
                  <Typography variant="body1" sx={{ color: '#374151', fontSize: '1rem' }}>
                    {formatCurrency(calculateTax())}
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', fontSize: '1.125rem' }}>
                    Total:
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#3B82F6', fontSize: '1.125rem' }}>
                    {formatCurrency(calculateTotal())}
                  </Typography>
                </Box>
              </Box>

              {/* Notes Section */}
              <Box>
                <Typography variant="body1" sx={{ fontWeight: 500, mb: 1.5, color: '#374151' }}>
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
                        borderColor: '#E5E7EB'
                      },
                      '& textarea': {
                        color: '#6B7280',
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
              py: 0
            }}>
              <Box sx={{
                border: '2px dashed #E5E7EB',
                borderRadius: 3,
                p: 4,
                textAlign: 'center',
                width: '100%',
                maxWidth: '400px',
                backgroundColor: '#FAFBFC'
              }}>
                <UploadIcon sx={{ 
                  fontSize: '3rem', 
                  color: '#9CA3AF',
                  mb: 2
                }} />
                <Typography variant="h6" sx={{ 
                  fontWeight: 600, 
                  color: '#374151',
                  mb: 1.5
                }}>
                  Upload Cost Card
                </Typography>
                <Typography variant="body1" sx={{ 
                  color: '#6B7280',
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
                      backgroundColor: '#3B82F6',
                      color: 'white',
                      textTransform: 'none',
                      fontWeight: 500,
                      px: 4,
                      py: 1.5,
                      '&:hover': {
                        backgroundColor: '#2563EB'
                      }
                    }}
                  >
                    Select File
                  </Button>
                </label>
                <Typography variant="caption" sx={{ 
                  display: 'block',
                  color: '#9CA3AF',
                  mt: 2,
                  fontSize: '0.8rem'
                }}>
                  Supports: .csv, .xlsx, .xls (Mock upload - will use sample data)
                </Typography>
                {selectedFile && (
                  <Typography variant="body2" sx={{ 
                    color: '#059669',
                    mt: 1.5,
                    fontWeight: 500
                  }}>
                    File selected: {selectedFile.name}
                  </Typography>
                )}
              </Box>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ 
        p: 3, 
        borderTop: '1px solid #E5E7EB',
        gap: 2,
        justifyContent: 'flex-end'
      }}>
        <Button
          onClick={handleClose}
          variant="outlined"
          sx={{ 
            textTransform: 'none',
            fontWeight: 500,
            px: 4,
            py: 1,
            color: '#374151',
            borderColor: '#D1D5DB',
            '&:hover': {
              borderColor: '#9CA3AF',
              backgroundColor: '#F9FAFB'
            }
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleInsert}
          variant="contained"
          sx={{ 
            textTransform: 'none',
            fontWeight: 500,
            px: 4,
            py: 1,
            backgroundColor: '#3B82F6',
            '&:hover': {
              backgroundColor: '#2563EB'
            }
          }}
        >
          Insert into RFP
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PricingBuilderDialog;