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
  dialect: z.string().default('PostgreSQL').describe('The SQL dialect to format the query in (e.g., PostgreSQL, MySQL).'),
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
  prompt: `You are an expert SQL database administrator. The current database engine is explicitly {{dialect}}.
STRICT RULES:
1. ONLY return valid, executable SQL code. NO preamble, NO explanation.
2. The target SQL dialect is {{dialect}}. If dialect contains "postgres" or "PostgreSQL", you MUST use proper PostgreSQL syntax (e.g., SERIAL or UUID for primary keys, TIMESTAMP, text, double quotes for identifiers). If dialect is MySQL, use MySQL syntax.
3. If creating a table and inserting data, use multiple valid SQL statements separated by a semicolon (;).
4. Do NOT use fake wrapper functions like CALL GENERATE_DATA. Use standard INSERT INTO statements if the user asks for mock data.
5. NEVER enclose the SQL query inside markdown blocks like \\\`\\\`\\\`sql ... \\\`\\\`\\\`. Start immediately with the SQL command.

Given a user question and a table schema, generate the SQL query that answers the question.
Ignore any lines in the user input that are SQL comments (i.e., lines starting with '--').

User Question: {{userInput}}
Table Schema: {{tableSchema}}
(If schema is empty you can still generate CREATE TABLE or logic queries.)

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
