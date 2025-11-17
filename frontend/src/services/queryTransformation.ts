/**
 * Query Transformation Service
 *
 * Implements contextual query transformation with confidence scoring.
 * This service acts as an intermediary layer between user input and the VLM/RAG system,
 * ensuring queries are specific, structured, and complete before retrieval.
 *
 * Flow:
 * 1. TransformQuery: Convert vague query to structured search object with confidence score
 * 2. Confidence Check: If score > threshold (0.65), proceed to RAG. Otherwise, ask for clarification
 * 3. GenerateClarification: Create targeted question to gather missing information
 * 4. RefineQuery: After user responds, create final high-confidence query
 * 5. Proceed to RAG/VLM execution with optimized query
 */

import { llmService } from './llm';
import type { ChatMessage } from '@/types/chat';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Structured query output from transformation
 */
export interface TransformedQuery {
  /** Highly specific search terms for RAG retrieval */
  search_keywords: string;
  /** Descriptive visual attributes to look for */
  visual_cues: string;
  /** Confidence score from 0.0 to 1.0 */
  confidence_score: number;
  /** Original vague query */
  original_query: string;
  /** Guidance for how to craft the final response */
  response_guidance: string;
}

/**
 * Clarification prompt generated for low-confidence queries
 */
export interface ClarificationPrompt {
  /** The generated clarifying question */
  question: string;
  /** The transformed query that led to low confidence */
  transformed_query: TransformedQuery;
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

const LOW_CONFIDENCE_THRESHOLD = 0.65;

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
   - 0.3-0.65: Low confidence, clarification needed
   - 0.65-0.85: Moderate confidence, likely to succeed
   - 0.85-1.0: High confidence, very specific query
4. **response_guidance**: Instructions for how to craft the final response after retrieval (e.g., "User wants to recall a red Nike shoe they viewed. Reference the specific product from screen recordings.")

**Important Guidelines:**
- If the query is already specific, confidence should be high (>0.8)
- If the query is vague and critical information is missing, confidence should be low (<0.65)
- Use conversation history to infer context
- Be conservative with confidence scores - it's better to ask for clarification than to return poor results
- response_guidance should be 1-2 sentences explaining what the user wants and how to respond with retrieved data

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
      response_guidance: `Help the user with their query: "${current_query}". Be specific and cite sources from the retrieved data.`,
    };
  }
}

// ============================================================================
// Phase 2: Generate Clarification
// ============================================================================

/**
 * Generate a clarifying question for low-confidence queries.
 *
 * @param transformedQuery - The low-confidence transformed query
 * @param context - Original query context
 * @returns Clarification prompt with targeted question
 */
export async function generateClarification(
  transformedQuery: TransformedQuery,
  context: QueryContext
): Promise<ClarificationPrompt> {
  const conversationHistoryStr = buildConversationHistory(context.conversation_history);

  const prompt = `You are a clarification assistant. The user's query was transformed but the confidence score is low (${transformedQuery.confidence_score.toFixed(2)}), indicating missing information.

**Original User Query:**
"${transformedQuery.original_query}"

**Current Transformation:**
- Search Keywords: ${transformedQuery.search_keywords}
- Visual Cues: ${transformedQuery.visual_cues}

**Conversation History:**
${conversationHistoryStr}

**Your Task:**
Generate a single, highly relevant, concrete, and engaging question to elicit the necessary detail from the user. The question should:
1. Be specific and focused on the missing information
2. Provide context from what we know (e.g., mention specific timeframes if available)
3. Give examples or options to make it easy for the user to respond
4. Be natural and conversational

**Example Format:**
"Did you mean the red high-top shoe you scrolled past at 5:20, or the blue low-top shoe you clicked on at 5:45?"

**Output (just the question, no JSON):**`;

  try {
    const response = await llmService.sendMessage(prompt, {
      temperature: 0.7, // Higher temperature for more natural questions
      maxTokens: 150,
    });

    // Clean up response
    const question = response.trim().replace(/^["']|["']$/g, ''); // Remove quotes if present

    console.log('[QueryTransform] Generated clarification:', question);
    return {
      question,
      transformed_query: transformedQuery,
    };
  } catch (error) {
    console.error('[QueryTransform] Failed to generate clarification:', error);
    // Return generic fallback
    return {
      question: `Could you please provide more details about "${transformedQuery.original_query}"? For example, when did you see it or what did it look like?`,
      transformed_query: transformedQuery,
    };
  }
}

// ============================================================================
// Phase 3: Refine Query
// ============================================================================

/**
 * Refine the query after receiving user's clarification response.
 * This combines the original query, clarification, and user's response
 * to create a high-confidence final query.
 *
 * @param originalQuery - The original vague query
 * @param clarificationQuestion - The clarification question that was asked
 * @param userResponse - The user's response to the clarification
 * @param context - Original query context
 * @returns Refined high-confidence query
 */
export async function refineQuery(
  originalQuery: string,
  clarificationQuestion: string,
  userResponse: string,
  context: QueryContext
): Promise<TransformedQuery> {
  const conversationHistoryStr = buildConversationHistory(context.conversation_history);

  const prompt = `You are a query refinement assistant. You previously asked for clarification, and the user has responded.

**Original User Query:**
"${originalQuery}"

**Clarification Question Asked:**
"${clarificationQuestion}"

**User's Clarification Response:**
"${userResponse}"

**Conversation History:**
${conversationHistoryStr}

**Your Task:**
Combine all this information to generate a final, highly specific structured search object. The confidence_score should be near 1.0 (0.85-1.0) due to the added information. Also generate response_guidance explaining what the user wants and how to respond.

**Output Format (JSON only, no explanation):**
{
  "search_keywords": "...",
  "visual_cues": "...",
  "confidence_score": 0.9,
  "response_guidance": "..."
}`;

  try {
    const response = await llmService.sendMessage(prompt, {
      temperature: 0.3,
      maxTokens: 500,
    });

    const parsed = parseJSONFromLLM(response);

    const refined: TransformedQuery = {
      search_keywords: parsed.search_keywords || userResponse,
      visual_cues: parsed.visual_cues || '',
      confidence_score: typeof parsed.confidence_score === 'number'
        ? Math.max(0.85, Math.min(1, parsed.confidence_score)) // Ensure high confidence after clarification
        : 0.9,
      original_query: `${originalQuery} [clarified: ${userResponse}]`,
      response_guidance: parsed.response_guidance || `User clarified they want: ${userResponse}. Reference the specific item from screen recordings and be detailed.`,
    };

    console.log('[QueryTransform] Refined query:', refined);
    return refined;
  } catch (error) {
    console.error('[QueryTransform] Failed to refine query:', error);
    // Return high-confidence fallback using user's clarification
    return {
      search_keywords: `${originalQuery} ${userResponse}`,
      visual_cues: userResponse,
      confidence_score: 0.85,
      original_query: `${originalQuery} [clarified: ${userResponse}]`,
      response_guidance: `User clarified they want: ${userResponse}. Reference the specific item from screen recordings and be detailed.`,
    };
  }
}

// ============================================================================
// Main Orchestration
// ============================================================================

/**
 * Check if a transformed query needs clarification
 */
export function needsClarification(transformedQuery: TransformedQuery): boolean {
  return transformedQuery.confidence_score <= LOW_CONFIDENCE_THRESHOLD;
}

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
  generateClarification,
  refineQuery,
  needsClarification,
  getChatSearchQuery,
  getVideoSearchQuery,
  getSearchQuery, // Keep for backwards compatibility
  LOW_CONFIDENCE_THRESHOLD,
};
