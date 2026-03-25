import { useState } from 'react';
import { analyzeArticle } from '../lib/api';

export function useAnalysis() {
  const [analyzing, setAnalyzing] = useState(false);
  const [statusText, setStatusText] = useState('');

  const analyze = async ({ content, focusKw, secKws, url, title, meta }) => {
    if (!content) throw new Error('Please paste the article content first.');
    if (!focusKw) throw new Error('Please enter a focus keyphrase.');

    setAnalyzing(true);
    setStatusText('AI is reading the article...');

    try {
      const result = await analyzeArticle({ content, focusKw, secKws, url, title, meta });
      setStatusText('Done!');
      setTimeout(() => {
        setAnalyzing(false);
        setStatusText('');
      }, 2500);
      return result;
    } catch (err) {
      setAnalyzing(false);
      setStatusText('');
      throw err;
    }
  };

  return { analyze, analyzing, statusText };
}
