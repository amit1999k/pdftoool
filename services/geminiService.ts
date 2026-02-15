
import { GoogleGenAI, Type } from "@google/genai";

export const detectContentBounds = async (imageDataUrl: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const base64Data = imageDataUrl.split(',')[1];

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/png', data: base64Data } },
        { text: "Detect the bounding box of the main content area in this document page. Return as JSON with x, y, width, height as percentages (0-100)." },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          x: { type: Type.NUMBER },
          y: { type: Type.NUMBER },
          width: { type: Type.NUMBER },
          height: { type: Type.NUMBER },
        },
        required: ["x", "y", "width", "height"],
      },
    },
  });

  try {
    // Correctly accessing .text property and trimming as per guidelines
    const jsonStr = response.text?.trim();
    return jsonStr ? JSON.parse(jsonStr) : null;
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return null;
  }
};

/**
 * Finds the Y coordinate where the 'Tax Invoice' section starts in a shipping label.
 */
export const findTaxInvoiceAnchor = async (imageDataUrl: string): Promise<number | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const base64Data = imageDataUrl.split(',')[1];

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/png', data: base64Data } },
        { text: "Look for the text 'Tax Invoice' or the horizontal line that separates the shipping label from the invoice. Return the exact vertical Y-coordinate where this section starts. Return ONLY a JSON object with a single field 'anchorY' as a percentage of total height (0-100)." },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          anchorY: { 
            type: Type.NUMBER,
            description: "The vertical percentage (0-100) from the top where the Tax Invoice section begins."
          },
        },
        required: ["anchorY"],
      },
    },
  });

  try {
    // Correctly accessing .text property and trimming as per guidelines
    const jsonStr = response.text?.trim();
    if (!jsonStr) return null;
    const result = JSON.parse(jsonStr);
    return result.anchorY;
  } catch (e) {
    console.error("Failed to detect invoice anchor", e);
    return null;
  }
};
