
export interface ExamMeta {
  title: string;
  grade: number;
  durationMinutes: number;
  schoolYear: string;
  totalPoints: number;
}

// GRADE 4 & 5 SHARED/SPECIFIC TYPES
export interface PictureItem {
  id: string;
  picturePrompt: string;
  label?: string;
  imageUrl?: string;
}

export interface MatchingItem {
  id: string;
  name: string;
  picturePrompt: string;
  imageUrl?: string;
}

export interface MCQOption {
  key: 'A' | 'B' | 'C' | 'D';
  text?: string;
  picturePrompt?: string;
  imageUrl?: string;
}

export interface MCQItem {
  id: string;
  question: string;
  options: MCQOption[];
  correct: string;
  audioScript?: string;
}

export interface FillBlankItem {
  id: string;
  sentenceWithBlank: string;
  acceptedAnswers: string[];
}

export interface ReadingPronunciationItem {
  id: string;
  words: { key: string; text: string; underlined: string }[];
  correct: string;
}

export interface WritingItem {
  id: string;
  prompt?: string;
  picturePrompt?: string;
  imageUrl?: string;
  correct: string | string[];
  words?: string[]; // for reordering
}

export interface ExamSections {
  listening: {
    points: number;
    part1: {
      type: 'numbering' | 'matching';
      instructions: string;
      items: any[];
      audioScript: string;
      answerOrder?: number[]; // for numbering
      correctMatches?: Record<string, string>; // for matching
    };
    part2: {
      type: 'fill' | 'mcq';
      instructions: string;
      items: any[];
      audioScript: string;
    };
    part3: {
      type: 'mcq_picture';
      instructions: string;
      items: MCQItem[];
    };
  };
  reading: {
    points: number;
    part1: {
      type: 'yesNo' | 'pronunciation';
      instructions: string;
      items: any[];
    };
    part2: {
      type: 'cloze' | 'mcq';
      instructions: string;
      wordBox?: string[];
      textWithNumberedBlanks?: string;
      items?: MCQItem[];
      answers?: Record<string, string>;
    };
    part3: {
      type: 'trueFalse' | 'mcq_passage';
      instructions: string;
      passage: string;
      items: any[];
    };
  };
  writing: {
    points: number;
    part1: {
      type: 'unscramble' | 'picture_complete';
      instructions: string;
      items: WritingItem[];
    };
    part2: {
      type: 'picture_complete' | 'reorder';
      instructions: string;
      items: WritingItem[];
    };
    part3: {
      type: 'reorder' | 'open_questions';
      instructions: string;
      items: WritingItem[];
    };
  };
}

export interface ExamData {
  meta: ExamMeta;
  sections: ExamSections;
  rubric: {
    scoring: string;
    pedagogicalNotes: string;
  };
}

export interface UserAnswers {
  grade: number;
  listening: { part1: any; part2: any; part3: any };
  reading: { part1: any; part2: any; part3: any };
  writing: { part1: any; part2: any; part3: any };
}
