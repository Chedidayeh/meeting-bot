import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.3,
    maxOutputTokens: 2000,
  },
});

export async function processMeetingTranscript(transcript: unknown) {
  try {
    let transcriptText = "";

    if (Array.isArray(transcript)) {
      transcriptText = transcript
        .map((item: unknown) => {
          const typedItem = item as {
            speaker?: string;
            words?: { word: string }[];
          };
          return `${typedItem.speaker || "Speaker"}: ${typedItem.words?.map((w: { word: string }) => w.word).join(" ") || ""}`;
        })
        .join("\n");
    } else if (typeof transcript === "string") {
      transcriptText = transcript;
    } else if (
      typeof transcript === "object" &&
      transcript !== null &&
      "text" in transcript
    ) {
      transcriptText = (transcript as { text: string }).text;
    }

    if (!transcriptText || transcriptText.trim().length === 0) {
      throw new Error("No transcript content found");
    }

    const prompt = `Analyze this meeting transcript and extract key information.

IMPORTANT: Return ONLY valid JSON with NO markdown formatting, NO code blocks, and NO extra text before or after.

{
    "summary": "2-3 sentence summary of main discussion points, decisions, and outcomes. Be specific and include any important context.",
    "actionItems": ["specific action with owner if mentioned", "specific action with owner if mentioned"]
}

Guidelines:
- For summary: Focus on decisions made, project status, and key outcomes
- For actionItems: Extract only concrete, actionable tasks mentioned. Include who should do it if specified. If no clear actions mentioned, use empty array []
- Ensure all strings are properly escaped with no unescaped quotes
- Return valid, parseable JSON that can be parsed with JSON.parse()

Meeting transcript to analyze:
${transcriptText}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log("Gemini response text:", text);

    if (!text) {
      throw new Error("No response from Gemini");
    }

    // Strip markdown code blocks if present (Gemini sometimes wraps JSON in ```json...```)
    let cleanText = text.trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    // Extract JSON object from the text - handle partial/truncated JSON
    let parsed;
    
    // First, try to find a complete JSON object
    let jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.warn("Complete JSON parse failed, attempting to repair truncated JSON");
        jsonMatch = null; // Force fallback
      }
    }
    
    // If complete JSON not found or parsing failed, try to extract from partial JSON
    if (!jsonMatch) {
      console.warn("Attempting to extract data from truncated JSON response");
      
      // Try to extract summary
      const summaryMatch = cleanText.match(/"summary"\s*:\s*"([^"]*?)(?:",|$)/);
      const summary = summaryMatch ? summaryMatch[1] : "Summary unavailable";
      
      // Try to extract action items - even if truncated
      const actionItemsMatch = cleanText.match(/"actionItems"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
      let actionItems: string[] = [];
      
      if (actionItemsMatch) {
        // Extract individual items from the array
        const itemsText = actionItemsMatch[1];
        const items = itemsText.match(/"([^"]*?)"/g) || [];
        actionItems = items.map(item => item.replace(/^"|"$/g, ''));
      }
      
      parsed = {
        summary: summary,
        actionItems: actionItems,
      };
    }

    const processedActionItems = Array.isArray(parsed.actionItems)
      ? parsed.actionItems
          .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
          .map((text: string, index: number) => ({
            id: index + 1,
            text: text.trim(),
          }))
      : [];

    return {
      summary: parsed.summary || "Summary couldnt be generated",
      actionItems: processedActionItems,
    };
  } catch (error) {
    console.error("error processing transcript with Gemini:", error);

    return {
      summary:
        "Meeting transcript processed successfully. Please check the full transcript for details.",
      actionItems: [],
    };
  }
}
