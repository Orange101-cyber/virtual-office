const API_KEY = import.meta.env.VITE_IDEOGRAM_API_KEY;
const BASE_URL = 'https://api.ideogram.ai';

export function isConfigured() {
  return !!API_KEY;
}

/**
 * Generate an image using Ideogram API
 * @param {string} prompt - Text description of the image
 * @param {object} options - { aspect_ratio, style, magic_prompt }
 * @returns {Promise<{url: string, prompt: string}>}
 */
export async function generateImage(prompt, options = {}) {
  if (!API_KEY) throw new Error('Ideogram API key not configured. Add VITE_IDEOGRAM_API_KEY to .env');

  const {
    aspect_ratio = 'ASPECT_1_1',
    style = 'REALISTIC',
    magic_prompt = 'AUTO',
  } = options;

  const res = await fetch(`${BASE_URL}/generate`, {
    method: 'POST',
    headers: {
      'Api-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_request: {
        prompt,
        aspect_ratio,
        model: 'V_2',
        style_type: style,
        magic_prompt_option: magic_prompt,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Ideogram error ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const image = data.data?.[0];
  if (!image?.url) throw new Error('No image returned from Ideogram');

  return {
    url: image.url,
    prompt: image.prompt || prompt,
    resolution: image.resolution,
  };
}

// Platform-specific aspect ratios
export const PLATFORM_SPECS = {
  'Meta Feed': { aspect: 'ASPECT_1_1', dimensions: '1080x1080', label: 'Square (1:1)' },
  'Meta Story': { aspect: 'ASPECT_9_16', dimensions: '1080x1920', label: 'Vertical (9:16)' },
  'Meta Carousel': { aspect: 'ASPECT_1_1', dimensions: '1080x1080', label: 'Square (1:1)' },
  'Google Display': { aspect: 'ASPECT_16_9', dimensions: '1200x628', label: 'Landscape (16:9)' },
  'Google Square': { aspect: 'ASPECT_1_1', dimensions: '1200x1200', label: 'Square (1:1)' },
  'LinkedIn Feed': { aspect: 'ASPECT_1_1', dimensions: '1200x1200', label: 'Square (1:1)' },
  'LinkedIn Banner': { aspect: 'ASPECT_16_9', dimensions: '1200x627', label: 'Landscape (16:9)' },
  'TikTok': { aspect: 'ASPECT_9_16', dimensions: '1080x1920', label: 'Vertical (9:16)' },
};

// Character limits per platform
export const COPY_LIMITS = {
  Meta: { headline: 40, primary_text: 125, description: 30, cta_options: ['Learn More', 'Shop Now', 'Sign Up', 'Book Now', 'Contact Us', 'Get Offer', 'Apply Now'] },
  Google: { headline: 30, description: 90, cta_options: ['Learn More', 'Shop Now', 'Get Quote', 'Call Now', 'Sign Up', 'Book Now'] },
  LinkedIn: { headline: 70, primary_text: 150, description: 100, cta_options: ['Learn More', 'Apply Now', 'Download', 'Sign Up', 'Register', 'Get Quote'] },
  TikTok: { headline: 40, primary_text: 100, cta_options: ['Learn More', 'Shop Now', 'Sign Up', 'Download', 'Contact Us'] },
};
