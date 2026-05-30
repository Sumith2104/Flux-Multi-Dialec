import { ai } from '@/ai/genkit';
import { z } from 'zod';

export const ClassificationSchema = z.object({
    intent: z.enum(['bug', 'feature_request', 'question', 'compliment', 'other']),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    intent_confidence: z.number().min(0).max(1),
    priority_confidence: z.number().min(0).max(1),
    flagged: z.boolean()
});

export type ClassificationResult = z.infer<typeof ClassificationSchema>;

export async function classifyFeedbackMessage(message: string): Promise<ClassificationResult> {
    const prompt = `You are a customer feedback classifier. Analyze the user's feedback message and classify it.
    
Feedback Message: "${message}"

Classification fields:
1. intent: Must be one of: bug, feature_request, question, compliment, other.
2. priority: Must be one of: low, medium, high, critical. Assign 'high' or 'critical' if the user reports a broken system, crash, data loss, or high frustration. Assign 'low' or 'medium' for questions, compliment, or general suggestions.
3. intent_confidence: Float score between 0.0 and 1.0.
4. priority_confidence: Float score between 0.0 and 1.0.
5. flagged: Boolean. True if the feedback contains spam, abusive/offensive language, gibberish, or sensitive personal identifiable information (PII).

Provide your response in JSON matching the requested schema.`;

    try {
        const response = await ai.generate({
            prompt,
            output: {
                schema: ClassificationSchema
            }
        });
        
        if (response.output) {
            return response.output as ClassificationResult;
        }
        
        // Fallback manually parsing raw text if response.output is empty
        const parsed = JSON.parse(response.text.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim());
        return ClassificationSchema.parse(parsed);
    } catch (e: any) {
        console.error('[AI Classifier Error]: Failed to classify feedback. Error:', e.message || e);
        // Return a default classification if it completely fails
        return {
            intent: 'other',
            priority: 'medium',
            intent_confidence: 0.0,
            priority_confidence: 0.0,
            flagged: false
        };
    }
}
