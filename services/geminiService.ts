
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ExamData } from "../types";

// Get API key from localStorage
const getApiKey = (): string => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('gemini_api_key') || '';
  }
  return process.env.API_KEY || '';
};

// Model fallback list (fastest first)
const CONTENT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];

export const generateExamContent = async (grade: number): Promise<ExamData> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('API key not found. Please set your API key in Settings.');
  
  const ai = new GoogleGenAI({ apiKey });
  
  const grade4Prompt = `Generate a full English Grade 4 Semester 1 exam for Vietnamese students.
  Themes: weather, activities, school, family.
  Structure: 
  Listening: Part 1 Numbering (4 pics), Part 2 MCQ Choose Pic (3 items), Part 3 Fill Blank (3 items).
  Reading: Part 1 Yes/No (4 items), Part 2 Cloze with Word Box (4 blanks - ensure wordBox is non-empty), Part 3 True/False Passage (4 items).
  Writing: Part 1 Unscramble letters (3 items), Part 2 Picture Complete (3 items), Part 3 Reorder words (4 items).`;

  const grade5Prompt = `Generate a full English Grade 5 Semester 1 exam for Vietnamese students.
  Themes: travel, holidays (Lunar New Year), school subjects, frequency of activities.
  Structure:
  Listening: Part 1 Matching (6 names to 4 pictures - ensure items array has 4 items with unique ids), Part 2 Fill word in passage (3 items), Part 3 MCQ with Pictures (4 items).
  Reading: Part 1 Pronunciation (2 items - odd one out), Part 2 Grammar MCQs (4 items), Part 3 Passage about Lunar New Year with MCQs (4 items).
  Writing: Part 1 Picture Complete (4 items), Part 2 Reorder words (4 items), Part 3 Answer personal questions (2 items).`;

  const prompt = `Generate a full English Grade ${grade} First Semester (HK1) exam for Vietnamese primary students.
  ${grade === 5 ? grade5Prompt : grade4Prompt}
  
  Format the output as a JSON object strictly following this schema:
  - meta: { title, grade, durationMinutes: 35, schoolYear: "2025 - 2026", totalPoints: 10 }
  - sections: {
      listening: { points: 2.5, 
        part1: { id: "l1", type: "${grade === 5 ? 'matching' : 'numbering'}", instructions, items[4]{id, picturePrompt, name}, audioScript, answerOrder[], correctMatches{} },
        part2: { id: "l2", type: "fill", instructions, items[3]{id, sentenceWithBlank, acceptedAnswers[]}, audioScript },
        part3: { id: "l3", type: "mcq_picture", instructions, items[3]{id, question, options[3]{key, picturePrompt}} }
      },
      reading: { points: 2.5,
        part1: { id: "r1", type: "${grade === 5 ? 'pronunciation' : 'yesNo'}", instructions, items[] },
        part2: { id: "r2", type: "${grade === 5 ? 'mcq' : 'cloze'}", instructions, wordBox[], textWithNumberedBlanks, items[], answers{} },
        part3: { id: "r3", type: "${grade === 5 ? 'mcq_passage' : 'trueFalse'}", instructions, passage, items[] }
      },
      writing: { points: 2.5,
        part1: { id: "w1", type: "${grade === 5 ? 'picture_complete' : 'unscramble'}", instructions, items[] },
        part2: { id: "w2", type: "${grade === 5 ? 'reorder' : 'picture_complete'}", instructions, items[] },
        part3: { id: "w3", type: "${grade === 5 ? 'open_questions' : 'reorder'}", instructions, items[] }
      }
  }
  - rubric: { scoring, pedagogicalNotes }
  
  Important: 
  - ALWAYS include "id" for every item in every array.
  - For Grade 5 Pronunciation, provide 4 words per item, specify which sound is underlined.
  - Ensure all picturePrompts are descriptive for AI image generation.`;

  // Try each model until one works
  for (const model of CONTENT_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 16000 }
        }
      });
      return JSON.parse(response.text || "{}") as ExamData;
    } catch (e: any) {
      console.warn(`Model ${model} failed, trying next...`, e.message);
      if (model === CONTENT_MODELS[CONTENT_MODELS.length - 1]) throw e;
    }
  }
  throw new Error('All models failed');
};

export const generateImage = async (prompt: string): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) return `https://picsum.photos/seed/${encodeURIComponent(prompt)}/300/300`;
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp-image-generation',
      contents: {
        parts: [{ text: `A cute, colorful, high-quality 2D digital illustration for a children's English textbook, white background, simple vector style: ${prompt}` }]
      },
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (e) {
    console.error("Image generation failed", e);
  }
  return `https://picsum.photos/seed/${encodeURIComponent(prompt)}/300/300`;
};

export const generateAudio = async (text: string): Promise<string | null> => {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Read slowly and very clearly as a teacher for Vietnamese primary students: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio ? `data:audio/pcm;base64,${base64Audio}` : null;
  } catch (e) {
    console.error("Audio generation failed", e);
    return null;
  }
};

// AI Grading for Writing Part 3 (Open Questions)
export const gradeWritingAnswer = async (
  question: string, 
  studentAnswer: string,
  expectedAnswer?: string
): Promise<{ score: number; maxScore: number; explanation: string }> => {
  const apiKey = getApiKey();
  if (!apiKey || !studentAnswer.trim()) {
    return { score: 0, maxScore: 1, explanation: 'No answer provided.' };
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `You are a kind English teacher grading a Vietnamese primary student's answer.
  
Question: "${question}"
Student's Answer: "${studentAnswer}"
${expectedAnswer ? `Expected Answer (reference): "${expectedAnswer}"` : ''}

Grade the answer from 0 to 1 point based on:
- Grammar correctness (0.3)
- Appropriate content/meaning (0.4)
- Spelling (0.3)

Be encouraging but fair. Give partial credit.

Respond in JSON format:
{
  "score": <number 0-1>,
  "explanation": "<brief feedback in Vietnamese, max 50 words>"
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    
    const result = JSON.parse(response.text || '{}');
    return {
      score: Math.min(1, Math.max(0, result.score || 0)),
      maxScore: 1,
      explanation: result.explanation || 'Evaluated by AI.'
    };
  } catch (e) {
    console.error("Grading failed", e);
    return { score: 0.5, maxScore: 1, explanation: 'Could not grade this answer automatically.' };
  }
};

export const decodePCM = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export const playPCM = async (pcmData: Uint8Array) => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const dataInt16 = new Int16Array(pcmData.buffer);
  const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
};
