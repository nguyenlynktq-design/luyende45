
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ExamData,
  UserAnswers
} from './types';
import {
  generateExamContent,
  generateImage,
  generateAudio,
  decodePCM,
  playPCM,
  gradeWritingAnswer
} from './services/geminiService';

// Types for feedback
interface AnswerFeedback {
  [key: string]: {
    isCorrect: boolean;
    correctAnswer: string;
    explanation: string;
  };
}

interface WritingGrade {
  score: number;
  maxScore: number;
  explanation: string;
}

const INITIAL_ANSWERS = (grade: number): UserAnswers => ({
  grade,
  listening: {
    part1: grade === 5 ? {} : [0, 0, 0, 0],
    part2: ['', '', '', ''],
    part3: ['', '', '', '']
  },
  reading: {
    part1: ['', '', '', ''],
    part2: grade === 5 ? ['', '', '', ''] : {},
    part3: ['', '', '', '']
  },
  writing: {
    part1: ['', '', '', ''],
    part2: ['', '', '', ''],
    part3: ['', '', '', '']
  }
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const App: React.FC = () => {
  const [selectedGrade, setSelectedGrade] = useState<number>(4);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [answers, setAnswers] = useState<UserAnswers>(INITIAL_ANSWERS(4));
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(35 * 60);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [score, setScore] = useState(0);

  // New states
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [feedback, setFeedback] = useState<AnswerFeedback>({});
  const [writingGrades, setWritingGrades] = useState<{ [key: string]: WritingGrade }>({});
  const [isGrading, setIsGrading] = useState(false);
  const [detailedScore, setDetailedScore] = useState({ listening: 0, reading: 0, writing: 0 });

  const timerRef = useRef<any>(null);

  // Load API key on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key') || '';
    setApiKey(savedKey);
    if (!savedKey) {
      setShowSettings(true);
    }
  }, []);

  const saveApiKey = () => {
    localStorage.setItem('gemini_api_key', apiKey);
    setShowSettings(false);
  };

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const generateNewExam = async (gradeOverride?: number) => {
    const grade = gradeOverride || selectedGrade;

    if (!localStorage.getItem('gemini_api_key')) {
      setShowSettings(true);
      return;
    }

    setIsLoading(true);
    setLoadingStep(`Designing Grade ${grade} Exam content...`);
    setFeedback({});
    setWritingGrades({});

    try {
      const examData = await generateExamContent(grade);

      if (!examData || !examData.sections) {
        throw new Error("Invalid AI response structure");
      }

      setExam(examData);
      setAnswers(INITIAL_ANSWERS(grade));
      setIsSubmitted(false);
      setTimeLeft(35 * 60);

      setLoadingStep("Preparing visual aids... (Avoiding rate limits)");

      const sections = examData.sections;

      // Sequential image generation
      const l1Items = sections.listening?.part1?.items || [];
      for (const item of l1Items) {
        if (item.picturePrompt) {
          setLoadingStep(`Generating icon: ${item.picturePrompt.substring(0, 20)}...`);
          item.imageUrl = await generateImage(item.picturePrompt);
          await sleep(1500);
        }
      }

      const l3Items = sections.listening?.part3?.items || [];
      for (const item of l3Items) {
        const opts = item.options || [];
        for (const opt of opts) {
          if (opt.picturePrompt) {
            setLoadingStep(`Choice icon: ${opt.picturePrompt.substring(0, 20)}...`);
            opt.imageUrl = await generateImage(opt.picturePrompt);
            await sleep(1500);
          }
        }
      }

      const writingParts = [sections.writing?.part1, sections.writing?.part2];
      for (const part of writingParts) {
        const items = part?.items || [];
        for (const item of items) {
          if (item.picturePrompt) {
            setLoadingStep(`Writing visual: ${item.picturePrompt.substring(0, 20)}...`);
            item.imageUrl = await generateImage(item.picturePrompt);
            await sleep(1500);
          }
        }
      }

      setExam({ ...examData });
      startTimer();
    } catch (error: any) {
      console.error(error);
      alert(`Exam generation failed: ${error.message || 'Unknown error'}. Please check your API key and try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayAudio = async (text: string) => {
    if (!text) return;
    const audioBase64 = await generateAudio(text);
    if (audioBase64) {
      const pcm = decodePCM(audioBase64.split(',')[1]);
      await playPCM(pcm);
    } else {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.8;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSubmit = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsSubmitted(true);
    setIsGrading(true);
    await calculateResults();
    setIsGrading(false);
  };

  const calculateResults = async () => {
    if (!exam) return;

    const newFeedback: AnswerFeedback = {};
    let listeningScore = 0;
    let readingScore = 0;
    let writingScore = 0;

    const sections = exam.sections;

    // ===== LISTENING (2.5 points) =====
    // Part 1 (1.0 points) - 4 items = 0.25 each
    const l1Items = sections.listening?.part1?.items || [];
    const l1AnswerOrder = sections.listening?.part1?.answerOrder || [];
    const l1CorrectMatches = sections.listening?.part1?.correctMatches || {};

    if (sections.listening?.part1?.type === 'matching') {
      // Grade 5 matching
      Object.entries(l1CorrectMatches).forEach(([name, correctScene]) => {
        const userAnswer = answers.listening.part1[name];
        const isCorrect = userAnswer === correctScene;
        if (isCorrect) listeningScore += 0.167; // ~1.0/6
        newFeedback[`l1_${name}`] = {
          isCorrect,
          correctAnswer: `Scene ${correctScene}`,
          explanation: isCorrect ? '✓ Đúng!' : `✗ Sai. Đáp án đúng: Scene ${correctScene}`
        };
      });
    } else {
      // Grade 4 numbering
      l1Items.forEach((item: any, idx: number) => {
        const userAnswer = answers.listening.part1[idx];
        const correctAnswer = l1AnswerOrder[idx];
        const isCorrect = userAnswer === correctAnswer;
        if (isCorrect) listeningScore += 0.25;
        newFeedback[`l1_${idx}`] = {
          isCorrect,
          correctAnswer: String(correctAnswer),
          explanation: isCorrect ? '✓ Đúng!' : `✗ Sai. Đáp án đúng: ${correctAnswer}`
        };
      });
    }

    // Part 2 (0.75 points) - 3 items = 0.25 each
    const l2Items = sections.listening?.part2?.items || [];
    l2Items.forEach((item: any, idx: number) => {
      const userAnswer = (answers.listening.part2[idx] || '').toLowerCase().trim();
      const accepted = (item.acceptedAnswers || []).map((a: string) => a.toLowerCase().trim());
      const isCorrect = accepted.includes(userAnswer);
      if (isCorrect) listeningScore += 0.25;
      newFeedback[`l2_${idx}`] = {
        isCorrect,
        correctAnswer: item.acceptedAnswers?.[0] || '',
        explanation: isCorrect ? '✓ Đúng!' : `✗ Sai. Đáp án đúng: ${item.acceptedAnswers?.[0] || ''}`
      };
    });

    // Part 3 (0.75 points) - 3 items = 0.25 each
    const l3Items = sections.listening?.part3?.items || [];
    l3Items.forEach((item: any, idx: number) => {
      const userAnswer = answers.listening.part3[idx];
      const isCorrect = userAnswer === item.correct;
      if (isCorrect) listeningScore += 0.25;
      newFeedback[`l3_${idx}`] = {
        isCorrect,
        correctAnswer: item.correct,
        explanation: isCorrect ? '✓ Đúng!' : `✗ Sai. Đáp án đúng: ${item.correct}`
      };
    });

    // ===== READING (2.5 points) =====
    // Part 1 
    const r1Items = sections.reading?.part1?.items || [];
    const r1PointsEach = 1.0 / r1Items.length;
    r1Items.forEach((item: any, idx: number) => {
      const userAnswer = answers.reading.part1[idx];
      const isCorrect = userAnswer === item.correct;
      if (isCorrect) readingScore += r1PointsEach;
      newFeedback[`r1_${idx}`] = {
        isCorrect,
        correctAnswer: item.correct,
        explanation: isCorrect ? '✓ Đúng!' : `✗ Sai. Đáp án đúng: ${item.correct}`
      };
    });

    // Part 2
    if (sections.reading?.part2?.type === 'cloze') {
      const r2Answers = sections.reading?.part2?.answers || {};
      const r2PointsEach = 1.0 / Object.keys(r2Answers).length;
      Object.entries(r2Answers).forEach(([key, correct]) => {
        const userAnswer = answers.reading.part2[key];
        const isCorrect = userAnswer === correct;
        if (isCorrect) readingScore += r2PointsEach;
        newFeedback[`r2_${key}`] = {
          isCorrect,
          correctAnswer: String(correct),
          explanation: isCorrect ? '✓ Đúng!' : `✗ Sai. Đáp án đúng: ${correct}`
        };
      });
    } else {
      const r2Items = sections.reading?.part2?.items || [];
      const r2PointsEach = 1.0 / r2Items.length;
      r2Items.forEach((item: any, idx: number) => {
        const userAnswer = answers.reading.part2[idx];
        const isCorrect = userAnswer === item.correct;
        if (isCorrect) readingScore += r2PointsEach;
        newFeedback[`r2_${idx}`] = {
          isCorrect,
          correctAnswer: item.correct,
          explanation: isCorrect ? '✓ Đúng!' : `✗ Sai. Đáp án đúng: ${item.correct}`
        };
      });
    }

    // Part 3
    const r3Items = sections.reading?.part3?.items || [];
    const r3PointsEach = 0.5 / r3Items.length;
    r3Items.forEach((item: any, idx: number) => {
      const userAnswer = answers.reading.part3[idx];
      const isCorrect = userAnswer === item.correct;
      if (isCorrect) readingScore += r3PointsEach;
      newFeedback[`r3_${idx}`] = {
        isCorrect,
        correctAnswer: item.correct,
        explanation: isCorrect ? '✓ Đúng!' : `✗ Sai. Đáp án đúng: ${item.correct}`
      };
    });

    // ===== WRITING (2.5 points) =====
    // Part 1 (1.0 points)
    const w1Items = sections.writing?.part1?.items || [];
    const w1PointsEach = 1.0 / w1Items.length;
    w1Items.forEach((item: any, idx: number) => {
      const userAnswer = (answers.writing.part1[idx] || '').toLowerCase().trim();
      const correctAnswers = Array.isArray(item.correct)
        ? item.correct.map((c: string) => c.toLowerCase().trim())
        : [String(item.correct || '').toLowerCase().trim()];
      const isCorrect = correctAnswers.includes(userAnswer);
      if (isCorrect) writingScore += w1PointsEach;
      newFeedback[`w1_${idx}`] = {
        isCorrect,
        correctAnswer: Array.isArray(item.correct) ? item.correct[0] : item.correct,
        explanation: isCorrect ? '✓ Đúng!' : `✗ Sai. Đáp án đúng: ${Array.isArray(item.correct) ? item.correct[0] : item.correct}`
      };
    });

    // Part 2 (1.0 points)
    const w2Items = sections.writing?.part2?.items || [];
    const w2PointsEach = 1.0 / w2Items.length;
    w2Items.forEach((item: any, idx: number) => {
      const userAnswer = (answers.writing.part2[idx] || '').toLowerCase().trim().replace(/[.,!?]/g, '');
      const correctAnswers = Array.isArray(item.correct)
        ? item.correct.map((c: string) => c.toLowerCase().trim().replace(/[.,!?]/g, ''))
        : [String(item.correct || '').toLowerCase().trim().replace(/[.,!?]/g, '')];
      const isCorrect = correctAnswers.some(c => userAnswer.includes(c) || c.includes(userAnswer));
      if (isCorrect) writingScore += w2PointsEach;
      newFeedback[`w2_${idx}`] = {
        isCorrect,
        correctAnswer: Array.isArray(item.correct) ? item.correct[0] : item.correct,
        explanation: isCorrect ? '✓ Đúng!' : `✗ Sai. Đáp án đúng: ${Array.isArray(item.correct) ? item.correct[0] : item.correct}`
      };
    });

    // Part 3 - AI Grading (0.5 points)
    const w3Items = sections.writing?.part3?.items || [];
    const w3PointsEach = 0.5 / w3Items.length;
    const newWritingGrades: { [key: string]: WritingGrade } = {};

    for (let idx = 0; idx < w3Items.length; idx++) {
      const item = w3Items[idx];
      const userAnswer = answers.writing.part3[idx] || '';
      const grade = await gradeWritingAnswer(
        item.prompt || item.question || '',
        userAnswer,
        item.correct
      );
      newWritingGrades[`w3_${idx}`] = grade;
      writingScore += grade.score * w3PointsEach;
    }

    setWritingGrades(newWritingGrades);
    setFeedback(newFeedback);
    setDetailedScore({
      listening: Math.round(listeningScore * 10) / 10,
      reading: Math.round(readingScore * 10) / 10,
      writing: Math.round(writingScore * 10) / 10
    });

    const totalScore = Math.round((listeningScore + readingScore + writingScore) * 10) / 10;
    setScore(Math.min(10, totalScore));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Feedback badge component
  const FeedbackBadge = ({ feedbackKey }: { feedbackKey: string }) => {
    const fb = feedback[feedbackKey];
    if (!isSubmitted || !fb) return null;
    return (
      <div className={`mt-2 p-3 rounded-xl text-sm font-medium ${fb.isCorrect ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
        {fb.explanation}
      </div>
    );
  };

  // Writing Grade component
  const WritingGradeBadge = ({ gradeKey }: { gradeKey: string }) => {
    const wg = writingGrades[gradeKey];
    if (!isSubmitted || !wg) return null;
    const percentage = Math.round(wg.score * 100);
    return (
      <div className={`mt-2 p-3 rounded-xl text-sm font-medium ${percentage >= 70 ? 'bg-green-100 text-green-700 border border-green-200' : percentage >= 40 ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold">Điểm: {wg.score}/{wg.maxScore}</span>
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div className={`h-2 rounded-full ${percentage >= 70 ? 'bg-green-500' : percentage >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${percentage}%` }}></div>
          </div>
        </div>
        <p>{wg.explanation}</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center max-w-6xl mx-auto pb-24">
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl">
            <h2 className="text-2xl font-black text-gray-800 mb-4">⚙️ Cài đặt API Key</h2>
            <p className="text-gray-600 mb-4">
              Nhập API Key từ Google AI Studio để sử dụng app.{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-bold">
                Lấy API Key tại đây →
              </a>
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Nhập API Key..."
              className="w-full p-4 border-2 border-gray-200 rounded-xl mb-4 focus:border-blue-500 focus:outline-none font-mono"
            />
            <div className="flex gap-3">
              <button
                onClick={saveApiKey}
                disabled={!apiKey.trim()}
                className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Lưu
              </button>
              {localStorage.getItem('gemini_api_key') && (
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-6 py-3 rounded-xl font-bold border-2 border-gray-200 hover:bg-gray-50"
                >
                  Đóng
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <header className="w-full text-center mb-10">
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-md hover:shadow-lg transition-all border border-gray-100"
          >
            <span>⚙️</span>
            <span className="text-red-500 font-bold text-sm">Cài đặt API Key</span>
          </button>
        </div>

        <h1 className="text-4xl font-black text-blue-600 mb-4 drop-shadow-sm">
          🇻🇳 TIÊU HỌC ENGLISH HUB
        </h1>

        <div className="flex justify-center bg-white p-1 rounded-2xl shadow-md mb-8 inline-flex">
          {[4, 5].map(g => (
            <button
              key={g}
              onClick={() => {
                setSelectedGrade(g);
                setExam(null);
                setIsSubmitted(false);
              }}
              className={`px-8 py-3 rounded-xl font-bold transition-all ${selectedGrade === g ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-blue-500'}`}
            >
              Grade {g}
            </button>
          ))}
        </div>

        <div className="flex flex-col md:flex-row justify-center items-center gap-6">
          <button
            onClick={() => generateNewExam()}
            disabled={isLoading}
            className="bg-green-500 hover:bg-green-600 text-white font-black py-4 px-10 rounded-2xl shadow-xl transition-all disabled:opacity-50 text-xl"
          >
            {isLoading ? "Generating..." : `🚀 GENERATE GRADE ${selectedGrade} EXAM`}
          </button>
          {exam && !isSubmitted && (
            <div className="bg-orange-100 text-orange-700 px-8 py-4 rounded-2xl border-4 border-orange-200 font-black text-2xl shadow-inner">
              ⏱️ {formatTime(timeLeft)}
            </div>
          )}
        </div>
      </header>

      {isLoading && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center z-50 p-8 text-center">
          <div className="w-20 h-20 border-8 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
          <p className="text-2xl font-black text-blue-900 animate-pulse">{loadingStep}</p>
        </div>
      )}

      {isGrading && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center z-50 p-8 text-center">
          <div className="w-20 h-20 border-8 border-purple-500 border-t-transparent rounded-full animate-spin mb-6"></div>
          <p className="text-2xl font-black text-purple-900 animate-pulse">Đang chấm điểm với AI...</p>
        </div>
      )}

      {exam ? (
        <main className="w-full space-y-12 pb-32">
          {/* LISTENING SECTION */}
          <Section title="PART A. LISTENING (2.5 Points)" color="blue">
            <Part title="1. Listen and respond" points="1.0">
              <p className="text-gray-600 italic mb-4">{exam.sections.listening?.part1?.instructions || 'Listen carefully.'}</p>
              <button
                onClick={() => handlePlayAudio(exam.sections.listening?.part1?.audioScript || '')}
                className="mb-6 bg-blue-600 text-white px-6 py-2 rounded-full font-bold shadow-md hover:bg-blue-700 transition-colors"
              >
                🔊 PLAY AUDIO
              </button>

              {exam.sections.listening.part1.type === 'matching' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="grid grid-cols-2 gap-4">
                    {(exam.sections.listening.part1.items || []).map((it: any) => (
                      <div key={it.id} className="bg-white p-2 rounded-xl shadow-sm border border-gray-100">
                        <div className="w-full h-32 bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center">
                          {it.imageUrl ? (
                            <img src={it.imageUrl} className="w-full h-full object-cover" alt="scene" />
                          ) : (
                            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
                          )}
                        </div>
                        <p className="text-center font-bold mt-2 text-blue-500">Scene {it.id}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-3">
                    {['Ella', 'Matt', 'Vy', 'Tony', 'Jake', 'Kim'].map(name => (
                      <div key={name}>
                        <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                          <span className="font-bold w-16 text-gray-700">{name}</span>
                          <select
                            disabled={isSubmitted}
                            value={answers.listening.part1[name] || ""}
                            onChange={(e) => setAnswers({ ...answers, listening: { ...answers.listening, part1: { ...answers.listening.part1, [name]: e.target.value } } })}
                            className="flex-1 border-b-2 border-blue-200 p-1 focus:outline-none focus:border-blue-500 bg-transparent font-medium"
                          >
                            <option value="">Select Scene...</option>
                            {(exam.sections.listening.part1.items || []).map((it: any) => <option key={it.id} value={it.id}>Scene {it.id}</option>)}
                          </select>
                        </div>
                        <FeedbackBadge feedbackKey={`l1_${name}`} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(exam.sections.listening.part1.items || []).map((item: any, idx: number) => (
                    <div key={item.id}>
                      <div className="bg-white p-4 rounded-xl border border-gray-200 text-center shadow-sm">
                        <div className="w-full h-32 bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center mb-3">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} className="w-full h-full object-contain" alt="pic" />
                          ) : (
                            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
                          )}
                        </div>
                        <select
                          disabled={isSubmitted}
                          value={answers.listening.part1[idx] || 0}
                          onChange={(e) => {
                            const newP1 = Array.isArray(answers.listening.part1) ? [...answers.listening.part1] : [0, 0, 0, 0];
                            newP1[idx] = Number(e.target.value);
                            setAnswers({ ...answers, listening: { ...answers.listening, part1: newP1 } });
                          }}
                          className="w-full p-2 rounded-lg border-2 border-blue-100 bg-white font-bold text-blue-600 focus:border-blue-400 focus:outline-none"
                        >
                          <option value="0">-</option>
                          {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                      <FeedbackBadge feedbackKey={`l1_${idx}`} />
                    </div>
                  ))}
                </div>
              )}
            </Part>

            <Part title="2. Listen and write/complete" points="0.75">
              <p className="text-gray-600 italic mb-4">{exam.sections.listening.part2?.instructions || 'Fill in the blanks.'}</p>
              <button onClick={() => handlePlayAudio(exam.sections.listening.part2?.audioScript || '')} className="mb-4 bg-blue-100 text-blue-700 px-4 py-1 rounded-full text-sm font-bold hover:bg-blue-200 transition-colors">🔊 PLAY PART 2</button>
              <div className="space-y-4">
                {(exam.sections.listening.part2.items || []).map((item: any, idx: number) => (
                  <div key={item.id || idx}>
                    <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-xl shadow-sm border border-gray-50">
                      <span className="font-bold text-blue-500">{idx + 1}.</span>
                      <p className="text-lg text-gray-700">{item.sentenceWithBlank?.replace('___', '__________') || '...'}</p>
                      <input
                        disabled={isSubmitted}
                        value={answers.listening.part2[idx] || ""}
                        onChange={(e) => {
                          const newP2 = [...answers.listening.part2];
                          newP2[idx] = e.target.value;
                          setAnswers({ ...answers, listening: { ...answers.listening, part2: newP2 } });
                        }}
                        className="border-b-2 border-blue-400 focus:outline-none px-2 py-1 min-w-[150px] font-bold text-blue-600"
                        placeholder="Type word..."
                      />
                    </div>
                    <FeedbackBadge feedbackKey={`l2_${idx}`} />
                  </div>
                ))}
              </div>
            </Part>

            <Part title="3. Listen and choose correct picture" points="0.75">
              {(exam.sections.listening.part3.items || []).map((item: any, qIdx: number) => (
                <div key={item.id || qIdx} className="mb-8">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <p className="font-bold text-lg mb-4 text-gray-800">{qIdx + 1}. {item.question || 'Choose the correct picture.'}</p>
                    <div className="grid grid-cols-3 gap-6">
                      {(item.options || []).map((opt: any) => (
                        <button
                          key={opt.key}
                          disabled={isSubmitted}
                          onClick={() => {
                            const newP3 = [...answers.listening.part3];
                            newP3[qIdx] = opt.key;
                            setAnswers({ ...answers, listening: { ...answers.listening, part3: newP3 } });
                          }}
                          className={`p-3 rounded-2xl border-4 transition-all flex flex-col items-center ${answers.listening.part3[qIdx] === opt.key ? 'border-blue-500 bg-blue-50' : 'border-gray-50 hover:border-blue-200'}`}
                        >
                          <div className="w-full h-24 bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center mb-2">
                            {opt.imageUrl ? (
                              <img src={opt.imageUrl} className="w-full h-full object-contain" alt={opt.key} />
                            ) : (
                              <div className="w-6 h-6 border-2 border-blue-100 border-t-blue-400 rounded-full animate-spin"></div>
                            )}
                          </div>
                          <span className="font-black text-xl text-blue-800">{opt.key}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <FeedbackBadge feedbackKey={`l3_${qIdx}`} />
                </div>
              ))}
            </Part>
          </Section>

          {/* READING SECTION */}
          <Section title="PART B. READING (2.5 Points)" color="green">
            {exam.sections.reading.part1.type === 'pronunciation' ? (
              <Part title="1. Odd One Out (Pronunciation)" points="0.5">
                {(exam.sections.reading.part1.items || []).map((item: any, idx: number) => (
                  <div key={item.id || idx} className="mb-4">
                    <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                      <p className="font-bold text-gray-700 mb-4">{idx + 1}. Choose the word with a different sound:</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {(item.words || []).map((w: any) => (
                          <button
                            key={w.key}
                            disabled={isSubmitted}
                            onClick={() => {
                              const newP1 = [...answers.reading.part1];
                              newP1[idx] = w.key;
                              setAnswers({ ...answers, reading: { ...answers.reading, part1: newP1 } });
                            }}
                            className={`p-3 rounded-xl border-2 text-lg font-bold transition-all ${answers.reading.part1[idx] === w.key ? 'bg-green-600 border-green-600 text-white shadow-lg' : 'bg-gray-50 border-gray-100 text-gray-600 hover:border-green-300'}`}
                          >
                            {w.key}. {w.text.split(w.underlined || '').map((part: string, i: number, arr: string[]) => (
                              <span key={i}>
                                {part}
                                {i < arr.length - 1 && <span className={`underline font-black ${answers.reading.part1[idx] === w.key ? 'text-white' : 'text-red-500'}`}>{w.underlined}</span>}
                              </span>
                            ))}
                          </button>
                        ))}
                      </div>
                    </div>
                    <FeedbackBadge feedbackKey={`r1_${idx}`} />
                  </div>
                ))}
              </Part>
            ) : (
              <Part title="1. Look and read. Write YES or NO" points="1.0">
                {(exam.sections.reading.part1.items || []).map((item: any, idx: number) => (
                  <div key={item.id || idx} className="mb-2">
                    <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-100">
                      <p className="text-lg font-medium">{idx + 1}. {item.dialogue || item.statement}</p>
                      <div className="flex gap-2">
                        {['YES', 'NO'].map(val => (
                          <button
                            key={val}
                            disabled={isSubmitted}
                            onClick={() => {
                              const newP1 = [...answers.reading.part1];
                              newP1[idx] = val;
                              setAnswers({ ...answers, reading: { ...answers.reading, part1: newP1 } });
                            }}
                            className={`px-6 py-2 rounded-full font-bold border-2 transition-all ${answers.reading.part1[idx] === val ? 'bg-green-600 text-white border-green-600' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                    <FeedbackBadge feedbackKey={`r1_${idx}`} />
                  </div>
                ))}
              </Part>
            )}

            <Part title="2. Read and complete/choose" points="1.0">
              {exam.sections.reading.part2.type === 'mcq' ? (
                <div className="space-y-6">
                  {(exam.sections.reading.part2.items || []).map((item: any, idx: number) => (
                    <div key={item.id || idx}>
                      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                        <p className="font-bold text-lg mb-4 text-gray-800">{idx + 1}. {item.question}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {(item.options || []).map((opt: any) => (
                            <button
                              key={opt.key}
                              disabled={isSubmitted}
                              onClick={() => {
                                const newP2 = Array.isArray(answers.reading.part2) ? [...answers.reading.part2] : ['', '', '', ''];
                                newP2[idx] = opt.key;
                                setAnswers({ ...answers, reading: { ...answers.reading, part2: newP2 } });
                              }}
                              className={`p-4 rounded-xl border-2 text-left transition-all ${answers.reading.part2[idx] === opt.key ? 'border-green-600 bg-green-50 text-green-800' : 'border-gray-50 text-gray-600 hover:border-green-200'}`}
                            >
                              <span className="font-black mr-2 text-green-600">{opt.key}.</span> {opt.text}
                            </button>
                          ))}
                        </div>
                      </div>
                      <FeedbackBadge feedbackKey={`r2_${idx}`} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white p-8 rounded-3xl shadow-inner border border-green-100 leading-loose text-xl">
                  <div className="bg-green-50 p-4 rounded-2xl mb-8 flex flex-wrap gap-3 justify-center border-2 border-dashed border-green-200">
                    {(exam.sections.reading.part2.wordBox || []).map(w => (
                      <span key={w} className="bg-white px-4 py-1 rounded-lg shadow-sm font-bold text-green-700">{w}</span>
                    ))}
                  </div>
                  <div className="text-gray-700">
                    {exam.sections.reading.part2.textWithNumberedBlanks?.split(/(\(\d\))/g).map((part, i) => {
                      const match = part.match(/\((\d)\)/);
                      if (match) {
                        const num = match[1];
                        return (
                          <span key={num}>
                            <select
                              disabled={isSubmitted}
                              value={answers.reading.part2[num] || ""}
                              onChange={(e) => setAnswers({ ...answers, reading: { ...answers.reading, part2: { ...answers.reading.part2, [num]: e.target.value } } })}
                              className={`mx-1 p-1 border-b-2 font-bold bg-transparent focus:outline-none ${isSubmitted && feedback[`r2_${num}`] ? (feedback[`r2_${num}`].isCorrect ? 'border-green-500 text-green-700' : 'border-red-500 text-red-700') : 'border-green-400 text-green-700'}`}
                            >
                              <option value="">...</option>
                              {(exam.sections.reading.part2.wordBox || []).map(w => <option key={w} value={w}>{w}</option>)}
                            </select>
                            {isSubmitted && feedback[`r2_${num}`] && !feedback[`r2_${num}`].isCorrect && (
                              <span className="text-xs text-red-500 ml-1">({feedback[`r2_${num}`].correctAnswer})</span>
                            )}
                          </span>
                        );
                      }
                      return <span key={i}>{part}</span>;
                    })}
                  </div>
                </div>
              )}
            </Part>

            <Part title="3. Reading Comprehension" points="1.0">
              <div className="bg-white p-10 rounded-[40px] border-2 border-green-100 shadow-lg mb-8 italic text-xl text-gray-700 leading-relaxed relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-bl-full"></div>
                <h4 className="font-black text-center text-3xl mb-6 not-italic uppercase text-green-800 tracking-wider">
                  {exam.selectedGrade === 5 ? "Lunar New Year in Vietnam" : "A Special Day"}
                </h4>
                {exam.sections.reading.part3.passage || 'Read the text carefully.'}
              </div>
              {(exam.sections.reading.part3.items || []).map((item: any, idx: number) => (
                <div key={item.id || idx} className="mb-4">
                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <p className="font-bold text-lg mb-4 text-gray-800">{idx + 1}. {item.question || item.statement}</p>
                    <div className="flex flex-wrap gap-4">
                      {item.options ? (item.options || []).map((opt: any) => (
                        <button
                          key={opt.key}
                          disabled={isSubmitted}
                          onClick={() => {
                            const newP3 = [...answers.reading.part3];
                            newP3[idx] = opt.key;
                            setAnswers({ ...answers, reading: { ...answers.reading, part3: newP3 } });
                          }}
                          className={`px-8 py-3 rounded-2xl border-2 font-bold transition-all ${answers.reading.part3[idx] === opt.key ? 'bg-green-600 text-white border-green-600 shadow-lg' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-green-300'}`}
                        >
                          <span className="mr-2 opacity-50">{opt.key}.</span> {opt.text}
                        </button>
                      )) : (
                        ['True', 'False'].map(tf => (
                          <button
                            key={tf}
                            disabled={isSubmitted}
                            onClick={() => {
                              const newP3 = [...answers.reading.part3];
                              newP3[idx] = tf;
                              setAnswers({ ...answers, reading: { ...answers.reading, part3: newP3 } });
                            }}
                            className={`px-12 py-3 rounded-full border-2 font-black transition-all ${answers.reading.part3[idx] === tf ? 'bg-green-600 text-white border-green-600 shadow-lg' : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-green-300'}`}
                          >
                            {tf.toUpperCase()}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                  <FeedbackBadge feedbackKey={`r3_${idx}`} />
                </div>
              ))}
            </Part>
          </Section>

          {/* WRITING SECTION */}
          <Section title="PART C. WRITING (2.5 Points)" color="purple">
            <Part title="1. Look, read and complete" points="1.0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {(exam.sections.writing.part1.items || []).map((item: any, idx: number) => (
                  <div key={item.id || idx}>
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center">
                      <div className="w-full h-40 bg-gray-50 rounded-2xl mb-4 overflow-hidden flex items-center justify-center">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} className="w-full h-full object-contain" alt="prompt" />
                        ) : (
                          <div className="w-10 h-10 border-4 border-purple-100 border-t-purple-500 rounded-full animate-spin"></div>
                        )}
                      </div>
                      <p className="font-bold text-gray-800 mb-4">{idx + 1}. {item.prompt || 'What is this?'}</p>
                      <input
                        disabled={isSubmitted}
                        value={answers.writing.part1[idx] || ""}
                        onChange={(e) => {
                          const newW1 = [...answers.writing.part1];
                          newW1[idx] = e.target.value;
                          setAnswers({ ...answers, writing: { ...answers.writing, part1: newW1 } });
                        }}
                        className="w-full border-b-2 border-purple-300 p-2 focus:outline-none focus:border-purple-600 text-center font-bold text-purple-700 bg-transparent"
                        placeholder="Type your answer..."
                      />
                    </div>
                    <FeedbackBadge feedbackKey={`w1_${idx}`} />
                  </div>
                ))}
              </div>
            </Part>

            <Part title="2. Reorder the words to make correct sentences" points="1.0">
              {(exam.sections.writing.part2.items || []).map((item: any, idx: number) => (
                <div key={item.id || idx} className="mb-6">
                  <div className="bg-white p-8 rounded-3xl shadow-sm border border-purple-50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="bg-purple-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">{idx + 1}</div>
                      <p className="text-purple-600 font-bold italic text-lg leading-relaxed">
                        / {(item.words || []).join(' / ')} /
                      </p>
                    </div>
                    <input
                      disabled={isSubmitted}
                      value={answers.writing.part2[idx] || ""}
                      onChange={(e) => {
                        const newW2 = [...answers.writing.part2];
                        newW2[idx] = e.target.value;
                        setAnswers({ ...answers, writing: { ...answers.writing, part2: newW2 } });
                      }}
                      className="w-full border-2 border-purple-100 rounded-2xl p-4 focus:border-purple-500 transition-all focus:outline-none font-medium text-gray-700 text-xl"
                      placeholder="Rewrite the sentence here..."
                    />
                  </div>
                  <FeedbackBadge feedbackKey={`w2_${idx}`} />
                </div>
              ))}
            </Part>

            <Part title="3. Answer the Questions (AI Grading)" points="0.5">
              {(exam.sections.writing.part3.items || []).map((item: any, idx: number) => (
                <div key={item.id || idx} className="mb-6">
                  <div className="bg-white p-8 rounded-3xl border-2 border-purple-50 shadow-sm">
                    <p className="font-black text-xl text-purple-900 mb-4">{idx + 1}. {item.prompt || 'Your answer?'}</p>
                    <textarea
                      disabled={isSubmitted}
                      value={answers.writing.part3[idx] || ""}
                      onChange={(e) => {
                        const newW3 = [...answers.writing.part3];
                        newW3[idx] = e.target.value;
                        setAnswers({ ...answers, writing: { ...answers.writing, part3: newW3 } });
                      }}
                      className="w-full h-32 border-2 border-purple-50 bg-gray-50/50 p-6 rounded-2xl focus:outline-none focus:border-purple-300 focus:bg-white transition-all text-xl text-gray-700 font-medium"
                      placeholder="Write your personal answer here..."
                    />
                  </div>
                  <WritingGradeBadge gradeKey={`w3_${idx}`} />
                </div>
              ))}
            </Part>
          </Section>

          {isSubmitted && (
            <div className="bg-gradient-to-br from-blue-600 to-purple-600 text-white p-12 rounded-[50px] text-center shadow-2xl animate-in zoom-in-95 mt-10 border-[10px] border-white ring-4 ring-blue-500">
              <h2 className="text-5xl font-black mb-4 uppercase tracking-tighter">EXAM COMPLETED! 🎓</h2>
              <div className="flex justify-center items-baseline gap-2 mb-6">
                <p className="text-9xl font-black">{score}</p>
                <p className="text-4xl opacity-50">/ 10</p>
              </div>

              {/* Detailed Score Breakdown */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-white/20 p-4 rounded-2xl">
                  <p className="text-sm opacity-75">🎧 Listening</p>
                  <p className="text-3xl font-black">{detailedScore.listening}<span className="text-lg opacity-50">/2.5</span></p>
                </div>
                <div className="bg-white/20 p-4 rounded-2xl">
                  <p className="text-sm opacity-75">📖 Reading</p>
                  <p className="text-3xl font-black">{detailedScore.reading}<span className="text-lg opacity-50">/2.5</span></p>
                </div>
                <div className="bg-white/20 p-4 rounded-2xl">
                  <p className="text-sm opacity-75">✏️ Writing</p>
                  <p className="text-3xl font-black">{detailedScore.writing}<span className="text-lg opacity-50">/2.5</span></p>
                </div>
              </div>

              <div className="bg-white/10 p-6 rounded-3xl mb-10 text-left border border-white/20">
                <h5 className="font-bold text-xl mb-2 text-blue-100">Teacher's Note:</h5>
                <p className="text-lg opacity-90 italic">"{exam.rubric?.pedagogicalNotes || 'Great effort! Review the missed questions to improve.'}"</p>
              </div>
              <button
                onClick={() => {
                  setExam(null);
                  setIsSubmitted(false);
                  setFeedback({});
                  setWritingGrades({});
                }}
                className="bg-white text-blue-600 px-16 py-5 rounded-2xl font-black text-2xl hover:scale-105 transition-all shadow-xl active:scale-95"
              >
                TRY ANOTHER TEST
              </button>
            </div>
          )}

          {!isSubmitted && (
            <div className="fixed bottom-10 left-0 right-0 flex justify-center z-40 pointer-events-none">
              <button
                onClick={handleSubmit}
                className="bg-red-600 text-white px-20 py-6 rounded-full font-black text-3xl shadow-[0_20px_50px_rgba(220,38,38,0.3)] hover:bg-red-700 hover:scale-110 transition-all border-8 border-white pointer-events-auto active:scale-95"
              >
                SUBMIT EXAM 📜
              </button>
            </div>
          )}
        </main>
      ) : (
        <div className="text-center py-24 px-10 bg-white rounded-[60px] shadow-2xl max-w-2xl border-4 border-dashed border-blue-200 mt-10 relative">
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-blue-500 w-24 h-24 rounded-full flex items-center justify-center text-5xl shadow-lg">🚀</div>
          <h2 className="text-5xl font-black text-blue-900 mb-6 tracking-tight">Grade {selectedGrade} Semester 1</h2>
          <p className="text-gray-500 text-2xl mb-12 leading-relaxed font-medium">
            Generate a full practice exam with listening audio, colorful icons, and real-time grading.
            Fresh questions every time you click!
          </p>
          <div className="grid grid-cols-3 gap-6">
            <div className="bg-blue-50 p-6 rounded-[30px] border border-blue-100">
              <div className="text-3xl mb-2">🎧</div>
              <div className="font-black text-blue-800 text-sm">AUDIO</div>
            </div>
            <div className="bg-green-50 p-6 rounded-[30px] border border-green-100">
              <div className="text-3xl mb-2">🖼️</div>
              <div className="font-black text-green-800 text-sm">ICONS</div>
            </div>
            <div className="bg-purple-50 p-6 rounded-[30px] border border-purple-100">
              <div className="text-3xl mb-2">🎓</div>
              <div className="font-black text-purple-800 text-sm">GRADE</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Section: React.FC<{ title: string, color: string, children: React.ReactNode }> = ({ title, color, children }) => {
  const styles: Record<string, string> = {
    blue: "border-blue-500 bg-blue-50/40",
    green: "border-green-500 bg-green-50/40",
    purple: "border-purple-500 bg-purple-50/40"
  };
  return (
    <section className={`rounded-[50px] border-4 shadow-2xl overflow-hidden ${styles[color]}`}>
      <div className="p-10 border-b-4 border-current bg-white/90 backdrop-blur-sm">
        <h2 className="text-4xl font-black uppercase tracking-tight text-gray-800">{title}</h2>
      </div>
      <div className="p-10 space-y-20">
        {children}
      </div>
    </section>
  );
};

const Part: React.FC<{ title: string, points: string, children: React.ReactNode }> = ({ title, points, children }) => {
  return (
    <div className="relative pt-6">
      <div className="absolute top-0 right-0 bg-white px-8 py-3 rounded-2xl shadow-md border-2 font-black text-blue-600 transform -translate-y-1/2 text-lg">
        {points} Points
      </div>
      <h3 className="text-3xl font-black mb-10 flex items-center gap-4 text-gray-800">
        <div className="w-4 h-12 bg-blue-600 rounded-full shadow-sm"></div>
        {title}
      </h3>
      <div className="relative z-10">{children}</div>
    </div>
  );
};

export default App;
