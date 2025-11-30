/**
 * Query Transformation Service
 *
 * Implements contextual query transformation with confidence scoring.
 * This service acts as an intermediary layer between user input and the VLM/RAG system,
 * ensuring queries are specific, structured, and complete before retrieval.
 *
 * Flow:
 * 1. TransformQuery: Convert vague query to structured search object with confidence score
 * 2. RefineQuery: After user responds, create final high-confidence query
 * 3. Proceed to RAG/VLM execution with optimized query
 */

import { llmService } from './llm';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Structured query output from transformation
 */
export interface TransformedQuery {
  /** Specific search terms for RAG retrieval */
  search_keywords: string;
  /** Descriptive visual attributes to look for */
  visual_cues: string;
  /** Confidence score from 0.0 to 1.0 */
  confidence_score: number;
  /** Original query */
  original_query: string;
  /** Guidance for how to craft the final response */
  response_guidance: string;
}

/**
 * Context for query transformation
 */
export interface QueryContext {
  /** The user's current query (may be vague) */
  current_query: string;
  /** Recent conversation history (last 3-5 turns) */
  conversation_history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

// ============================================================================
// Constants
// ============================================================================

const LOW_CONFIDENCE_THRESHOLD = 0.6;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse JSON from LLM response, handling markdown code blocks
 */
function parseJSONFromLLM(response: string): any {
  try {
    // Try direct parse first
    return JSON.parse(response);
  } catch {
    // Try to extract JSON from markdown code block
    const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }

    // Try to find JSON object in the response
    const objectMatch = response.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }

    throw new Error('Failed to extract JSON from LLM response');
  }
}

/**
 * Build conversation history string from messages
 */
function buildConversationHistory(messages: Array<{ role: string; content: string }>): string {
  if (messages.length === 0) return 'No conversation history.';

  return messages
    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');
}

// ============================================================================
// Phase 1: Transform Query
// ============================================================================

/**
 * Transform a vague user query into a structured, searchable object
 * with confidence scoring.
 *
 * @param context - Query context including current query and conversation history
 * @returns Transformed query with confidence score
 */
export async function transformQuery(context: QueryContext): Promise<TransformedQuery> {
  const { current_query, conversation_history } = context;

  // Build the prompt for the LLM
  const conversationHistoryStr = buildConversationHistory(conversation_history);

  const prompt = `You are a query transformation assistant. Your job is to analyze a potentially vague user query and convert it into a highly specific search object optimized for screen recording retrieval.

**Context:**
Conversation History (last 3 turns):
${conversationHistoryStr}

**User's Current Query:**
"${current_query}"

**Your Task:**
Analyze the query and provide a structured JSON output with the following fields:

1. **search_keywords**: Highly specific terms for RAG retrieval (e.g., "Nike, Air Jordan 1, basketball shoe")
2. **visual_cues**: Descriptive image attributes (e.g., "blue and white color scheme, high-top shoe")
3. **confidence_score**: A float from 0.0 to 1.0 indicating your certainty that the transformed query will lead to successful retrieval
   - 0.0-0.3: Very uncertain, major information missing
   - 0.3-0.6: Low confidence, clarification needed
   - 0.6-0.8: Moderate confidence, likely to succeed
   - 0.8-1.0: High confidence, very specific query
4. **response_guidance**: Instructions for how to craft the final response after retrieval (e.g., "User wants to recall a red Nike shoe they viewed. Answer to the user query by referencing the retrieved data.")

**Important Guidelines:**
- If the query is already specific, confidence should be high (>0.8)
- If the query is vague and critical information is missing, confidence should be low (<0.6)
- Use conversation history to infer context
- Be conservative with confidence scores - it's better to ask for clarification than to return poor results
- response_guidance should be 1-2 sentences instructing the LLM what the user needs from the response

**Output Format (JSON only, no explanation):**
{
  "search_keywords": "...",
  "visual_cues": "...",
  "confidence_score": 0.0,
  "response_guidance": "..."
}`;

  try {
    // Get response from LLM
    const response = await llmService.sendMessage(prompt, {
      temperature: 0.3, // Low temperature for consistent structured output
      maxTokens: 500,
    });

    // Parse JSON response
    const parsed = parseJSONFromLLM(response);

    // Validate and return transformed query
    const transformed: TransformedQuery = {
      search_keywords: parsed.search_keywords || '',
      visual_cues: parsed.visual_cues || '',
      confidence_score: typeof parsed.confidence_score === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence_score))
        : 0.5,
      original_query: current_query,
      response_guidance: parsed.response_guidance || `Help the user with their query about ${parsed.search_keywords || current_query}. Be specific and cite sources from the retrieved data.`,
    };

    console.log('[QueryTransform] Transformed query:', transformed);
    return transformed;
  } catch (error) {
    console.error('[QueryTransform] Failed to transform query:', error);
    // Return low-confidence fallback
    return {
      search_keywords: current_query,
      visual_cues: '',
      confidence_score: 0.4,
      original_query: current_query,
      response_guidance: `Help the user with their query: "${current_query}". Be specific and reference the retrieved data.`,
    };
  }
}



// ============================================================================
// Main Orchestration
// ============================================================================

/**
 * Get optimized search query for chat/text search (DRAGON embeddings)
 * Focuses on keywords with action context
 */
export function getChatSearchQuery(transformedQuery: TransformedQuery): string {
    return transformedQuery.search_keywords
}

/**
 * Get optimized search query for video/screen search (CLIP embeddings)
 * Focuses on keywords with visual descriptions
 */
export function getVideoSearchQuery(transformedQuery: TransformedQuery): string {
  const parts: string[] = [];

  // Primary search terms
  parts.push(transformedQuery.search_keywords);

  // Add visual characteristics (critical for video/image search)
  if (transformedQuery.visual_cues) {
    parts.push(`visual: ${transformedQuery.visual_cues}`);
  }

  return parts.join('. ');
}

/**
 * Get the optimal search query from transformed query (legacy method)
 * @deprecated Use getChatSearchQuery or getVideoSearchQuery instead
 */
export function getSearchQuery(transformedQuery: TransformedQuery): string {
  // Default to chat query for backwards compatibility
  return getChatSearchQuery(transformedQuery);
}

// ============================================================================
// Export Service
// ============================================================================

export const queryTransformationService = {
  transformQuery,
  getChatSearchQuery,
  getVideoSearchQuery,
  LOW_CONFIDENCE_THRESHOLD,
};
