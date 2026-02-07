'use server';

/**
 * @fileOverview Flow for converting user input into SQL queries.
 *
 * - generateSQL - A function that takes user input and generates an SQL query.
 * - GenerateSQLInput - The input type for the generateSQL function.
 * - GenerateSQLOutput - The return type for the generateSQL function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateSQLInputSchema = z.object({
  userInput: z.string().describe('The user question in plain English.'),
  tableSchema: z.string().describe('The schema of the SQL table.'),
});
export type GenerateSQLInput = z.infer<typeof GenerateSQLInputSchema>;

const GenerateSQLOutputSchema = z.object({
  sqlQuery: z.string().describe('The generated SQL query.'),
});
export type GenerateSQLOutput = z.infer<typeof GenerateSQLOutputSchema>;

export async function generateSQL(input: GenerateSQLInput): Promise<GenerateSQLOutput> {
  return generateSQLFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateSQLPrompt',
  input: {schema: GenerateSQLInputSchema},
  output: {schema: GenerateSQLOutputSchema},
  prompt: `You are an expert SQL query generator. Given a user question and a table schema, you will generate the SQL query that answers the question.

Ignore any lines in the user input that are SQL comments (i.e., lines starting with '--').

User Question: {{{userInput}}}
Table Schema: {{{tableSchema}}}

SQL Query:`,
});

const generateSQLFlow = ai.defineFlow(
  {
    name: 'generateSQLFlow',
    inputSchema: GenerateSQLInputSchema,
    outputSchema: GenerateSQLOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
