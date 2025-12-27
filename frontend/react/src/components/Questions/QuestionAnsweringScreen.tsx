import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  LinearProgress,
  Chip,
  Paper,
  Alert,
  Stepper,
  Step,
  StepLabel,
  Divider,
  CircularProgress,
  IconButton,
} from '@mui/material';
import {
  PlayArrow as StartIcon,
  Pause as PauseIcon,
  SkipNext as NextIcon,
  Psychology as BrainIcon,
  CheckCircle as CompleteIcon,
  Error as ErrorIcon,
  Refresh as RegenerateIcon,
} from '@mui/icons-material';
import type { RFPQuestion, QuestionProgress } from '../../types';

interface QuestionAnsweringScreenProps {
  sectionName: string;
  questions: RFPQuestion[];
  onQuestionComplete: (questionNumber: number, content: string) => void;
  onAllComplete: () => void;
  onBack: () => void;
}

const QuestionAnsweringScreen: React.FC<QuestionAnsweringScreenProps> = ({
  sectionName,
  questions,
  onQuestionComplete,
  onAllComplete,
  onBack,
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questionProgress, setQuestionProgress] = useState<Record<number, QuestionProgress>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoMode, setAutoMode] = useState(false);

  const currentQuestion = questions[currentQuestionIndex];
  const totalQuestions = questions.length;
  const completedCount = Object.values(questionProgress).filter(p => p.isComplete).length;

  // Initialize progress tracking
  useEffect(() => {
    const initialProgress: Record<number, QuestionProgress> = {};
    questions.forEach((question, index) => {
      initialProgress[index] = {
        questionNumber: index + 1,
        totalQuestions: totalQuestions,
        isGenerating: false,
        isComplete: false,
        content: '',
        question: question,
      };
    });
    setQuestionProgress(initialProgress);
  }, [questions, totalQuestions]);

  const generateQuestionResponse = async (questionIndex: number) => {
    const question = questions[questionIndex];
    if (!question) return;

    console.log(`Generating response for question ${questionIndex + 1}`);

    setIsGenerating(true);
    setQuestionProgress(prev => ({
      ...prev,
      [questionIndex]: {
        ...prev[questionIndex],
        isGenerating: true,
      }
    }));

    try {
      // Create form data for API call
      const formData = new FormData();
      formData.append('prompt', question.question_text);
      formData.append('session_id', 'rfp-session-' + Date.now());
      formData.append('prompt_id', 'question-' + question.question_number);
      formData.append('user_id', 'user-' + Date.now());
      formData.append('action', 'generate');
      formData.append('section_name', sectionName);
      formData.append('section_type', 'rfp_questions_responses');
      
      // Individual question parameters
      formData.append('question_number', (questionIndex + 1).toString());
      formData.append('total_questions', totalQuestions.toString());

      const response = await fetch('/api/v1/rfp/populate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      let content = '';

      if (reader) {
        const decoder = new TextDecoder();
        let done = false;

        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;

          if (value) {
            const chunk = decoder.decode(value);
            content += chunk;
            
            // Update progress with partial content
            setQuestionProgress(prev => ({
              ...prev,
              [questionIndex]: {
                ...prev[questionIndex],
                content: content,
              }
            }));
          }
        }
      }

      // Mark as complete
      setQuestionProgress(prev => ({
        ...prev,
        [questionIndex]: {
          ...prev[questionIndex],
          isGenerating: false,
          isComplete: true,
          content: content,
        }
      }));

      // Notify parent component
      onQuestionComplete(questionIndex + 1, content);

      // Auto-advance to next question if in auto mode
      if (autoMode && questionIndex < questions.length - 1) {
        setTimeout(() => {
          setCurrentQuestionIndex(questionIndex + 1);
          generateQuestionResponse(questionIndex + 1);
        }, 1000);
      } else if (questionIndex >= questions.length - 1) {
        // All questions completed
        onAllComplete();
      }

    } catch (error) {
      console.error('Error generating question response:', error);
      setQuestionProgress(prev => ({
        ...prev,
        [questionIndex]: {
          ...prev[questionIndex],
          isGenerating: false,
        }
      }));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartAutoGeneration = async () => {
    setAutoMode(true);
    await generateQuestionResponse(0);
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, sm: 3, md: 4 } }}>
      {/* Header */}
      <Card sx={{ mb: 4, backgroundColor: '#E8F4FD' }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <BrainIcon sx={{ fontSize: 32, color: '#2196F3' }} />
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Individual Question Answering
            </Typography>
          </Box>
          <Typography variant="body1" sx={{ mb: 2 }}>
            <strong>Section:</strong> {sectionName}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Chip 
              label={`${totalQuestions} Questions Total`}
              sx={{ backgroundColor: '#2196F3', color: 'white' }}
            />
            <Chip 
              label={`${completedCount} Completed`}
              sx={{ backgroundColor: '#4CAF50', color: 'white' }}
            />
            <Chip 
              label={`${totalQuestions - completedCount} Remaining`}
              sx={{ backgroundColor: '#FF9800', color: 'white' }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Progress Overview */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Progress Overview
          </Typography>
          <LinearProgress
            variant="determinate"
            value={(completedCount / totalQuestions) * 100}
            sx={{
              height: 8,
              borderRadius: 4,
              mb: 2,
              '& .MuiLinearProgress-bar': {
                backgroundColor: '#4CAF50',
              },
            }}
          />
          <Typography variant="body2" sx={{ textAlign: 'center' }}>
            {completedCount} of {totalQuestions} questions answered ({Math.round((completedCount / totalQuestions) * 100)}%)
          </Typography>
        </CardContent>
      </Card>

      {/* Control Buttons */}
      <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={<StartIcon />}
          onClick={handleStartAutoGeneration}
          disabled={isGenerating || autoMode}
          sx={{ backgroundColor: '#4CAF50' }}
        >
          Generate All Questions
        </Button>
        <Button
          variant="outlined"
          onClick={() => generateQuestionResponse(currentQuestionIndex)}
          disabled={isGenerating}
        >
          Generate Current Question
        </Button>
        <Button
          variant="outlined"
          onClick={handlePrevQuestion}
          disabled={currentQuestionIndex === 0}
        >
          ← Previous
        </Button>
        <Button
          variant="outlined"
          onClick={handleNextQuestion}
          disabled={currentQuestionIndex >= questions.length - 1}
        >
          Next →
        </Button>
      </Box>

      {/* Current Question Display */}
      <Card sx={{ mb: 4, border: '2px solid #2196F3' }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Question {currentQuestionIndex + 1} of {totalQuestions}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Chip 
                label={currentQuestion?.question_type?.replace('_', ' ').toUpperCase() || 'GENERAL'}
                size="small"
                variant="outlined"
              />
              <Chip 
                label={currentQuestion?.priority?.toUpperCase() || 'MEDIUM'}
                size="small"
                color={
                  currentQuestion?.priority === 'high' ? 'error' :
                  currentQuestion?.priority === 'medium' ? 'warning' : 'success'
                }
              />
            </Box>
          </Box>
          
          <Paper sx={{ p: 3, backgroundColor: '#F5F5F5', mb: 3 }}>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>
              {currentQuestion?.question_text}
            </Typography>
          </Paper>

          {/* Question Keywords */}
          {currentQuestion?.keywords && currentQuestion.keywords.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                Keywords:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {currentQuestion.keywords.map((keyword, index) => (
                  <Chip 
                    key={index}
                    label={keyword}
                    size="small"
                    variant="outlined"
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Response Area */}
          <Divider sx={{ my: 2 }} />
          
          {questionProgress[currentQuestionIndex]?.isGenerating && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 3 }}>
              <CircularProgress size={24} />
              <Typography>Generating comprehensive response...</Typography>
            </Box>
          )}

          {questionProgress[currentQuestionIndex]?.content && (
            <Paper sx={{ p: 3, backgroundColor: '#F9F9F9' }}>
              <Typography variant="h6" sx={{ mb: 2, color: '#4CAF50' }}>
                Generated Response:
              </Typography>
              <Typography 
                variant="body1" 
                sx={{ 
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6
                }}
              >
                {questionProgress[currentQuestionIndex].content}
              </Typography>
              <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                <IconButton
                  onClick={() => generateQuestionResponse(currentQuestionIndex)}
                  color="primary"
                  size="small"
                >
                  <RegenerateIcon />
                </IconButton>
                <Typography variant="body2" sx={{ alignSelf: 'center', ml: 1 }}>
                  Click to regenerate this response
                </Typography>
              </Box>
            </Paper>
          )}

          {questionProgress[currentQuestionIndex]?.isComplete && (
            <Alert severity="success" sx={{ mt: 2 }}>
              <Typography variant="body2">
                ✅ Question {currentQuestionIndex + 1} completed successfully!
              </Typography>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Questions Overview */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            All Questions Overview
          </Typography>
          <Stepper 
            activeStep={currentQuestionIndex} 
            alternativeLabel
            sx={{ mb: 3 }}
          >
            {questions.map((question, index) => (
              <Step key={index}>
                <StepLabel
                  StepIconComponent={() => (
                    questionProgress[index]?.isComplete ? (
                      <CompleteIcon sx={{ color: '#4CAF50' }} />
                    ) : questionProgress[index]?.isGenerating ? (
                      <CircularProgress size={20} />
                    ) : (
                      <Box sx={{ 
                        width: 24, 
                        height: 24, 
                        borderRadius: '50%', 
                        backgroundColor: index === currentQuestionIndex ? '#2196F3' : '#E0E0E0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Typography sx={{ 
                          color: index === currentQuestionIndex ? 'white' : '#666',
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}>
                          {index + 1}
                        </Typography>
                      </Box>
                    )
                  )}
                >
                  Q{index + 1}
                </StepLabel>
              </Step>
            ))}
          </Stepper>

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 4 }}>
            <Button
              variant="outlined"
              onClick={onBack}
            >
              Back to Sections
            </Button>
            {completedCount === totalQuestions && (
              <Button
                variant="contained"
                onClick={onAllComplete}
                sx={{ backgroundColor: '#4CAF50' }}
              >
                Continue to Next Step
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default QuestionAnsweringScreen;