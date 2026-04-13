// Image generation via Fal.ai
// Uses the Fal.ai REST API for Flux or other models

const FAL_KEY = import.meta.env.VITE_FAL_API_KEY;

export function isConfigured() {
  return !!FAL_KEY;
}

// Available Fal.ai models
export const MODELS = [
  { id: 'fal-ai/flux/schnell', name: 'Flux Schnell', desc: 'Fast, good quality (recommended)' },
  { id: 'fal-ai/flux/dev', name: 'Flux Dev', desc: 'Higher quality, slower' },
  { id: 'fal-ai/flux-pro/v1.1', name: 'Flux Pro 1.1', desc: 'Best quality, production-grade' },
  { id: 'fal-ai/stable-diffusion-v35-large', name: 'SD 3.5 Large', desc: 'Stable Diffusion 3.5, versatile' },
  { id: 'fal-ai/recraft-v3', name: 'Recraft v3', desc: 'Great for design/illustration' },
  { id: 'fal-ai/ideogram/v2', name: 'Ideogram v2', desc: 'Best for text-in-image (logos, ads)' },
];

/**
 * Generate an image using Fal.ai
 * @param {string} prompt - Text description of the image
 * @param {object} options - { width, height, model }
 * @returns {Promise<{url: string, prompt: string}>}
 */
export async function generateImage(prompt, options = {}) {
  if (!FAL_KEY) throw new Error('Fal.ai API key not configured. Add VITE_FAL_API_KEY to .env');

  const {
    width = 1024,
    height = 1024,
    model = 'fal-ai/flux/schnell', // Fast model, good quality
  } = options;

  // Fal.ai uses a queue-based system
  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size: { width, height },
      num_images: 1,
      enable_safety_checker: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Fal.ai error ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const image = data.images?.[0];
  if (!image?.url) throw new Error('No image returned from Fal.ai');

  return {
    url: image.url,
    prompt,
    width: image.width || width,
    height: image.height || height,
  };
}

/**
 * Image-to-image: transform an existing image with a prompt
 * @param {string} imageUrl - Source image (data URL or http URL)
 * @param {string} prompt - What to turn it into
 * @param {object} options - { width, height, strength, model }
 * @returns {Promise<{url: string, prompt: string}>}
 */
export async function remixImage(imageUrl, prompt, options = {}) {
  if (!FAL_KEY) throw new Error('Fal.ai API key not configured. Add VITE_FAL_API_KEY to .env');

  const {
    width = 1024,
    height = 1024,
    strength = 0.65,
    model = 'fal-ai/flux/dev/image-to-image',
  } = options;

  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_url: imageUrl,
      strength,
      image_size: { width, height },
      num_images: 1,
      enable_safety_checker: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Fal.ai error ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const image = data.images?.[0];
  if (!image?.url) throw new Error('No image returned from Fal.ai');

  return {
    url: image.url,
    prompt,
    width: image.width || width,
    height: image.height || height,
  };
}

/**
 * Convert a File to a base64 data URL for the API
 */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Platform-specific dimensions
export const PLATFORM_SPECS = {
  'Meta Feed': { width: 1080, height: 1080, label: 'Square (1:1)' },
  'Meta Story': { width: 1080, height: 1920, label: 'Vertical (9:16)' },
  'Meta Carousel': { width: 1080, height: 1080, label: 'Square (1:1)' },
  'Google Display': { width: 1200, height: 628, label: 'Landscape (16:9)' },
  'Google Square': { width: 1200, height: 1200, label: 'Square (1:1)' },
  'LinkedIn Feed': { width: 1200, height: 1200, label: 'Square (1:1)' },
  'LinkedIn Banner': { width: 1200, height: 627, label: 'Landscape (16:9)' },
  'TikTok': { width: 1080, height: 1920, label: 'Vertical (9:16)' },
};

// Character limits per platform (kept from ideogram.js)
export const COPY_LIMITS = {
  Meta: { headline: 40, primary_text: 125, description: 30, cta_options: ['Learn More', 'Shop Now', 'Sign Up', 'Book Now', 'Contact Us', 'Get Offer', 'Apply Now'] },
  Google: { headline: 30, description: 90, cta_options: ['Learn More', 'Shop Now', 'Get Quote', 'Call Now', 'Sign Up', 'Book Now'] },
  LinkedIn: { headline: 70, primary_text: 150, description: 100, cta_options: ['Learn More', 'Apply Now', 'Download', 'Sign Up', 'Register', 'Get Quote'] },
  TikTok: { headline: 40, primary_text: 100, cta_options: ['Learn More', 'Shop Now', 'Sign Up', 'Download', 'Contact Us'] },
};
