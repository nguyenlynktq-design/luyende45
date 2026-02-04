
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

  const getPrompt = (g: number) => {
    if (g === 5) {
      return `You are a SENIOR ENGLISH EDUCATOR. Create a COMPLETE English Grade 5 Semester 1 exam.
Topics: travel, holidays (Lunar New Year), school subjects, hobbies, frequency adverbs (A1-A2 level).

Return ONLY valid JSON with this EXACT structure (replace all placeholders with real content):
{
  "selectedGrade": 5,
  "meta": {"title": "English Grade 5 Exam", "grade": 5, "durationMinutes": 35, "totalPoints": 10},
  "sections": {
    "listening": {
      "points": 2.5,
      "part1": {
        "id": "l1", "type": "matching",
        "instructions": "Listen and match the names to pictures.",
        "audioScript": "WRITE FULL LISTENING SCRIPT HERE with names: Ella, Matt, Vy, Tony, Jake, Kim",
        "items": [
          {"id": "A", "picturePrompt": "a person traveling by plane", "name": "Scene A"},
          {"id": "B", "picturePrompt": "children celebrating Lunar New Year", "name": "Scene B"},
          {"id": "C", "picturePrompt": "a student doing homework", "name": "Scene C"},
          {"id": "D", "picturePrompt": "family eating together", "name": "Scene D"}
        ],
        "correctMatches": {"Ella": "A", "Matt": "B", "Vy": "C", "Tony": "D", "Jake": "A", "Kim": "B"}
      },
      "part2": {
        "id": "l2", "type": "fill",
        "instructions": "Listen and fill in the blanks.",
        "audioScript": "WRITE SENTENCES WITH ANSWERS",
        "items": [
          {"id": "l2_1", "sentenceWithBlank": "We ___ to the beach last summer.", "acceptedAnswers": ["went", "go"]},
          {"id": "l2_2", "sentenceWithBlank": "I ___ visit my grandparents every month.", "acceptedAnswers": ["always", "often"]},
          {"id": "l2_3", "sentenceWithBlank": "Lunar New Year is in ___.", "acceptedAnswers": ["January", "February"]}
        ]
      },
      "part3": {
        "id": "l3", "type": "mcq_picture",
        "instructions": "Listen and choose the correct picture.",
        "items": [
          {"id": "l3_1", "question": "Where did they go for vacation?", "options": [{"key": "A", "picturePrompt": "beach"}, {"key": "B", "picturePrompt": "mountain"}, {"key": "C", "picturePrompt": "city"}], "correct": "A"},
          {"id": "l3_2", "question": "What is the boy doing?", "options": [{"key": "A", "picturePrompt": "studying"}, {"key": "B", "picturePrompt": "playing"}, {"key": "C", "picturePrompt": "sleeping"}], "correct": "A"},
          {"id": "l3_3", "question": "What do they eat for Tet?", "options": [{"key": "A", "picturePrompt": "banh chung"}, {"key": "B", "picturePrompt": "pizza"}, {"key": "C", "picturePrompt": "hamburger"}], "correct": "A"}
        ]
      }
    },
    "reading": {
      "points": 2.5,
      "part1": {
        "id": "r1", "type": "pronunciation",
        "instructions": "Choose the word with different underlined sound.",
        "items": [
          {"id": "r1_1", "words": [{"key": "A", "text": "head", "underlined": "ea"}, {"key": "B", "text": "bread", "underlined": "ea"}, {"key": "C", "text": "great", "underlined": "ea"}, {"key": "D", "text": "read", "underlined": "ea"}], "correct": "C"},
          {"id": "r1_2", "words": [{"key": "A", "text": "book", "underlined": "oo"}, {"key": "B", "text": "food", "underlined": "oo"}, {"key": "C", "text": "good", "underlined": "oo"}, {"key": "D", "text": "moon", "underlined": "oo"}], "correct": "C"},
          {"id": "r1_3", "words": [{"key": "A", "text": "cat", "underlined": "a"}, {"key": "B", "text": "hat", "underlined": "a"}, {"key": "C", "text": "car", "underlined": "a"}, {"key": "D", "text": "mat", "underlined": "a"}], "correct": "C"},
          {"id": "r1_4", "words": [{"key": "A", "text": "think", "underlined": "th"}, {"key": "B", "text": "this", "underlined": "th"}, {"key": "C", "text": "that", "underlined": "th"}, {"key": "D", "text": "math", "underlined": "th"}], "correct": "B"}
        ]
      },
      "part2": {
        "id": "r2", "type": "mcq",
        "instructions": "Choose the correct answer.",
        "items": [
          {"id": "r2_1", "question": "She ___ to school every day.", "options": [{"key": "A", "text": "go"}, {"key": "B", "text": "goes"}, {"key": "C", "text": "going"}], "correct": "B"},
          {"id": "r2_2", "question": "They ___ playing football now.", "options": [{"key": "A", "text": "is"}, {"key": "B", "text": "are"}, {"key": "C", "text": "am"}], "correct": "B"},
          {"id": "r2_3", "question": "I have ___ apple.", "options": [{"key": "A", "text": "a"}, {"key": "B", "text": "an"}, {"key": "C", "text": "the"}], "correct": "B"},
          {"id": "r2_4", "question": "He ___ breakfast at 7 AM.", "options": [{"key": "A", "text": "have"}, {"key": "B", "text": "has"}, {"key": "C", "text": "having"}], "correct": "B"}
        ]
      },
      "part3": {
        "id": "r3", "type": "mcq_passage",
        "instructions": "Read and answer.",
        "passage": "WRITE A 50-80 WORD PASSAGE about Lunar New Year or travel here.",
        "items": [
          {"id": "r3_1", "question": "WRITE A QUESTION ABOUT THE PASSAGE", "options": [{"key": "A", "text": "option A"}, {"key": "B", "text": "option B"}], "correct": "A"},
          {"id": "r3_2", "question": "WRITE A QUESTION ABOUT THE PASSAGE", "options": [{"key": "A", "text": "option A"}, {"key": "B", "text": "option B"}], "correct": "B"},
          {"id": "r3_3", "question": "WRITE A QUESTION ABOUT THE PASSAGE", "options": [{"key": "A", "text": "option A"}, {"key": "B", "text": "option B"}], "correct": "A"},
          {"id": "r3_4", "question": "WRITE A QUESTION ABOUT THE PASSAGE", "options": [{"key": "A", "text": "option A"}, {"key": "B", "text": "option B"}], "correct": "B"}
        ]
      }
    },
    "writing": {
      "points": 2.5,
      "part1": {
        "id": "w1", "type": "picture_complete",
        "instructions": "Look at the picture and write the word.",
        "items": [
          {"id": "w1_1", "picturePrompt": "an airplane", "prompt": "I travel by ___.", "correct": ["airplane", "plane"]},
          {"id": "w1_2", "picturePrompt": "a camera", "prompt": "I use a ___ to take photos.", "correct": ["camera"]},
          {"id": "w1_3", "picturePrompt": "a suitcase", "prompt": "I pack my ___ for the trip.", "correct": ["suitcase", "bag"]},
          {"id": "w1_4", "picturePrompt": "banh chung", "prompt": "We eat ___ on Tet.", "correct": ["banh chung", "Banh Chung"]}
        ]
      },
      "part2": {
        "id": "w2", "type": "reorder",
        "instructions": "Put the words in order to make sentences.",
        "items": [
          {"id": "w2_1", "words": ["I", "always", "visit", "my", "grandparents"], "correct": ["I always visit my grandparents."]},
          {"id": "w2_2", "words": ["She", "often", "goes", "to", "the", "beach"], "correct": ["She often goes to the beach."]},
          {"id": "w2_3", "words": ["We", "celebrate", "Lunar", "New", "Year", "in", "January"], "correct": ["We celebrate Lunar New Year in January."]},
          {"id": "w2_4", "words": ["They", "never", "eat", "fast", "food"], "correct": ["They never eat fast food."]}
        ]
      },
      "part3": {
        "id": "w3", "type": "open_questions",
        "instructions": "Answer the questions about yourself.",
        "items": [
          {"id": "w3_1", "prompt": "Where do you want to travel? Write a complete sentence.", "sampleAnswer": "I want to travel to Da Nang."},
          {"id": "w3_2", "prompt": "What do you do on Lunar New Year? Write a complete sentence.", "sampleAnswer": "I visit my grandparents on Lunar New Year."}
        ]
      }
    }
  },
  "rubric": {"scoring": "Listening 2.5, Reading 2.5, Writing 2.5 = 10 points", "pedagogicalNotes": "Great work!"}
}

IMPORTANT: Replace ALL placeholder text with real, educational content.`;
    } else {
      return `You are a SENIOR ENGLISH EDUCATOR. Create a COMPLETE English Grade 4 Semester 1 exam.
Topics: weather, daily activities, school, family, colors, animals, food (A1 beginner level).

Return ONLY valid JSON with this EXACT structure (replace all placeholders with real content):
{
  "selectedGrade": 4,
  "meta": {"title": "English Grade 4 Exam", "grade": 4, "durationMinutes": 35, "totalPoints": 10},
  "sections": {
    "listening": {
      "points": 2.5,
      "part1": {
        "id": "l1", "type": "numbering",
        "instructions": "Listen and number the pictures.",
        "audioScript": "WRITE FULL LISTENING SCRIPT: Number 1. It is sunny today. Number 2. The boy is reading...",
        "items": [
          {"id": "1", "picturePrompt": "a sunny day with blue sky"},
          {"id": "2", "picturePrompt": "a boy reading a book"},
          {"id": "3", "picturePrompt": "children playing soccer"},
          {"id": "4", "picturePrompt": "a family eating dinner"}
        ],
        "answerOrder": [2, 4, 1, 3]
      },
      "part2": {
        "id": "l2", "type": "fill",
        "instructions": "Listen and fill in the blanks.",
        "audioScript": "WRITE SENTENCES",
        "items": [
          {"id": "l2_1", "sentenceWithBlank": "The weather is ___ today.", "acceptedAnswers": ["sunny", "hot"]},
          {"id": "l2_2", "sentenceWithBlank": "I go to ___ every morning.", "acceptedAnswers": ["school"]},
          {"id": "l2_3", "sentenceWithBlank": "My favorite color is ___.", "acceptedAnswers": ["blue", "red", "green"]}
        ]
      },
      "part3": {
        "id": "l3", "type": "mcq_picture",
        "instructions": "Listen and choose the correct picture.",
        "items": [
          {"id": "l3_1", "question": "What is the weather like?", "options": [{"key": "A", "picturePrompt": "sunny day"}, {"key": "B", "picturePrompt": "rainy day"}, {"key": "C", "picturePrompt": "cloudy day"}], "correct": "A"},
          {"id": "l3_2", "question": "What is the boy doing?", "options": [{"key": "A", "picturePrompt": "reading"}, {"key": "B", "picturePrompt": "playing"}, {"key": "C", "picturePrompt": "sleeping"}], "correct": "A"},
          {"id": "l3_3", "question": "Where is the girl?", "options": [{"key": "A", "picturePrompt": "at home"}, {"key": "B", "picturePrompt": "at school"}, {"key": "C", "picturePrompt": "at park"}], "correct": "B"}
        ]
      }
    },
    "reading": {
      "points": 2.5,
      "part1": {
        "id": "r1", "type": "yesNo",
        "instructions": "Read and write YES or NO.",
        "items": [
          {"id": "r1_1", "statement": "Fish can fly.", "correct": "NO"},
          {"id": "r1_2", "statement": "Dogs can swim.", "correct": "YES"},
          {"id": "r1_3", "statement": "The sun is hot.", "correct": "YES"},
          {"id": "r1_4", "statement": "Ice is cold.", "correct": "YES"}
        ]
      },
      "part2": {
        "id": "r2", "type": "cloze",
        "instructions": "Fill in with words from the box.",
        "wordBox": ["sunny", "play", "school", "happy", "friends"],
        "textWithNumberedBlanks": "Today is (1). I go to (2) with my (3). We (4) together. I am very (5).",
        "answers": {"1": "sunny", "2": "school", "3": "friends", "4": "play", "5": "happy"}
      },
      "part3": {
        "id": "r3", "type": "trueFalse",
        "instructions": "Read and answer True or False.",
        "passage": "WRITE A 50-80 WORD PASSAGE about daily life of a child here.",
        "items": [
          {"id": "r3_1", "statement": "WRITE TRUE/FALSE STATEMENT 1 ABOUT THE PASSAGE", "correct": "True"},
          {"id": "r3_2", "statement": "WRITE TRUE/FALSE STATEMENT 2 ABOUT THE PASSAGE", "correct": "False"},
          {"id": "r3_3", "statement": "WRITE TRUE/FALSE STATEMENT 3 ABOUT THE PASSAGE", "correct": "True"},
          {"id": "r3_4", "statement": "WRITE TRUE/FALSE STATEMENT 4 ABOUT THE PASSAGE", "correct": "True"}
        ]
      }
    },
    "writing": {
      "points": 2.5,
      "part1": {
        "id": "w1", "type": "picture_complete",
        "instructions": "Look at the picture and write the word.",
        "items": [
          {"id": "w1_1", "picturePrompt": "a red apple", "prompt": "What is this? It is an ___.", "correct": ["apple"]},
          {"id": "w1_2", "picturePrompt": "a yellow banana", "prompt": "What is this? It is a ___.", "correct": ["banana"]},
          {"id": "w1_3", "picturePrompt": "a brown dog", "prompt": "What animal is this? It is a ___.", "correct": ["dog"]},
          {"id": "w1_4", "picturePrompt": "a blue car", "prompt": "What is this? It is a ___.", "correct": ["car"]}
        ]
      },
      "part2": {
        "id": "w2", "type": "reorder",
        "instructions": "Put the words in order to make sentences.",
        "items": [
          {"id": "w2_1", "words": ["I", "like", "to", "play", "soccer"], "correct": ["I like to play soccer."]},
          {"id": "w2_2", "words": ["She", "goes", "to", "school", "every", "day"], "correct": ["She goes to school every day."]},
          {"id": "w2_3", "words": ["My", "favorite", "color", "is", "blue"], "correct": ["My favorite color is blue."]},
          {"id": "w2_4", "words": ["We", "have", "breakfast", "at", "seven"], "correct": ["We have breakfast at seven."]}
        ]
      },
      "part3": {
        "id": "w3", "type": "open_questions",
        "instructions": "Answer the questions about yourself.",
        "items": [
          {"id": "w3_1", "prompt": "What is your favorite color? Write a complete sentence.", "sampleAnswer": "My favorite color is blue."},
          {"id": "w3_2", "prompt": "What do you like to do after school? Write a complete sentence.", "sampleAnswer": "I like to play with my friends after school."}
        ]
      }
    }
  },
  "rubric": {"scoring": "Listening 2.5, Reading 2.5, Writing 2.5 = 10 points", "pedagogicalNotes": "Good effort!"}
}

IMPORTANT: Replace ALL placeholder text with real, educational content.`;
    }
  };

  const prompt = getPrompt(grade);

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

// Simple emoji icons mapping for fast fallback
const getEmojiIcon = (prompt: string): string => {
  const p = prompt.toLowerCase();
  const emojiMap: Record<string, string> = {
    'weather': '🌤️', 'sunny': '☀️', 'rain': '🌧️', 'cloudy': '☁️', 'snow': '❄️', 'wind': '💨',
    'school': '🏫', 'classroom': '📚', 'teacher': '👩‍🏫', 'student': '👨‍🎓', 'book': '📖', 'pencil': '✏️',
    'family': '👨‍👩‍👧‍👦', 'mother': '👩', 'father': '👨', 'sister': '👧', 'brother': '👦', 'baby': '👶',
    'play': '⚽', 'run': '🏃', 'swim': '🏊', 'read': '📖', 'write': '✍️', 'sing': '🎤', 'dance': '💃',
    'eat': '🍽️', 'drink': '🥤', 'sleep': '😴', 'wake': '⏰', 'walk': '🚶', 'jump': '🦘',
    'happy': '😊', 'sad': '😢', 'angry': '😠', 'tired': '😴', 'hungry': '🤤', 'thirsty': '💧',
    'cat': '🐱', 'dog': '🐕', 'bird': '🐦', 'fish': '🐟', 'elephant': '🐘', 'lion': '🦁',
    'apple': '🍎', 'banana': '🍌', 'orange': '🍊', 'cake': '🎂', 'pizza': '🍕', 'ice cream': '🍦',
    'house': '🏠', 'park': '🏞️', 'beach': '🏖️', 'mountain': '⛰️', 'city': '🏙️', 'farm': '🚜',
    'car': '🚗', 'bus': '🚌', 'bike': '🚲', 'plane': '✈️', 'train': '🚂', 'boat': '⛵',
    'morning': '🌅', 'afternoon': '☀️', 'evening': '🌆', 'night': '🌙', 'clock': '🕐', 'time': '⏰',
    'music': '🎵', 'sport': '⚽', 'art': '🎨', 'math': '➕', 'science': '🔬', 'english': '📝',
    'boy': '👦', 'girl': '👧', 'man': '👨', 'woman': '👩', 'child': '🧒', 'people': '👥',
    'hot': '🥵', 'cold': '🥶', 'big': '🐘', 'small': '🐜', 'tall': '🦒', 'short': '🐕',
  };

  for (const [key, emoji] of Object.entries(emojiMap)) {
    if (p.includes(key)) return emoji;
  }
  return '📷';
};

// Create SVG icon from emoji for consistent display - use URL encoding for Unicode support
const createEmojiSvg = (emoji: string, bgColor: string = '#E8F4FD'): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <rect width="300" height="300" fill="${bgColor}" rx="20"/>
    <text x="150" y="180" font-size="100" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
  </svg>`;
  // Use encodeURIComponent for Unicode emoji support (btoa fails with Unicode)
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

// ALWAYS use emoji icons for instant loading (no slow AI image generation)
export const generateImage = async (prompt: string): Promise<string> => {
  try {
    const emoji = getEmojiIcon(prompt);
    return createEmojiSvg(emoji);
  } catch (e) {
    console.error('Image generation failed:', e);
    return createEmojiSvg('📷'); // Fallback
  }
};

export const generateAudio = async (text: string): Promise<string | null> => {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Read this English text slowly and clearly with an American English accent.Pronounce all numbers in English words(for example: 1 as "one", 2 as "two", 3 as "three", 4 as "four"): ${text} ` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio ? `data: audio / pcm; base64, ${base64Audio} ` : null;
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
- Grammar correctness(0.3)
  - Appropriate content / meaning(0.4)
    - Spelling(0.3)

Be encouraging but fair.Give partial credit.

Respond in JSON format:
{
  "score": <number 0 - 1 >,
    "explanation": "<brief feedback in Vietnamese, max 50 words>"
} `;

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
