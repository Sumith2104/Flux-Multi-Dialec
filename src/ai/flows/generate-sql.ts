'use server';

/**
 * @fileOverview Flow for converting user input into SQL queries.
 *
 * - generateSQL - A function that takes user input and generates an SQL query.
 * - GenerateSQLInput - The input type for the generateSQL function.
 * - GenerateSQLOutput - The return type for the generateSQL function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

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
  input: { schema: GenerateSQLInputSchema },
  output: { schema: GenerateSQLOutputSchema },
  prompt: `You are an expert SQL query generator.
STRICT RULES:
1. Do NOT use WITH RECURSIVE or CTEs.
2. To insert mocked data into a table, use CALL GENERATE_DATA('table_name', count). Do NOT use INSERT statements with GENERATE_SERIES.
3. Use CAST(expr AS type) for casting. Do NOT use ::type syntax.
4. Use CONCAT(a, b) for string concatenation.
5. For date arithmetic, use ADD_DAYS(date, number) (e.g. ADD_DAYS('2023-01-01', i)). Do NOT use intervals.
6. If creating a table and inserting data, use multiple statements. E.g. CREATE TABLE ...; CALL GENERATE_DATA('users', 100);

Given a user question and a table schema, you will generate the SQL query that answers the question.

Ignore any lines in the user input that are SQL comments (i.e., lines starting with '--').

User Question: {{{userInput}}}
Table Schema: {{{tableSchema}}}
(If schema is empty you can still generate CREATE TABLE queries.)

SQL Query:`,
});

const generateSQLFlow = ai.defineFlow(
  {
    name: 'generateSQLFlow',
    inputSchema: GenerateSQLInputSchema,
    outputSchema: GenerateSQLOutputSchema,
  },
  async input => {
    const { output } = await prompt(input);
    return output!;
  }
);
