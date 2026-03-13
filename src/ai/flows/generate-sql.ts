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
  isDangerous: z.boolean().describe('Set to true ONLY if the user prompt implies a destructive or modifying command (e.g., DELETE, DROP, TRUNCATE, ALTER).'),
  userMessage: z.string().describe('If you block the query because it is dangerous, kindly explain to the user why you cannot process their request. Otherwise, leave empty.'),
  sqlQuery: z.string().describe('The generated SQL query. Leave completely empty if isDangerous is true.'),
});
export type GenerateSQLOutput = z.infer<typeof GenerateSQLOutputSchema>;

export async function generateSQL(input: GenerateSQLInput): Promise<GenerateSQLOutput> {
  return generateSQLFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateSQLPrompt',
  input: { schema: GenerateSQLInputSchema },
  output: { schema: GenerateSQLOutputSchema },
  prompt: `You are an expert, highly secure SQL database administrator. The current database engine is explicitly {{dialect}}.
STRICT ARCHITECTURAL RULES:
1. DANGEROUS QUERY RECOGNITION: Analyze the prompt. If the user is asking to modify or destroy data (e.g., DELETE, DROP, TRUNCATE, UPDATE, INSERT, CREATE, ALTER), you MUST flag the query as dangerous. Set \`isDangerous\` to true and provide a polite \`userMessage\` warning them of the consequences. HOWEVER, YOU MUST STILL GENERATE THE \`sqlQuery\`. Do not leave it blank. You are an assistant, you provide the code and let the user decide whether to execute it.
2. SYNTAX: The target SQL dialect is {{dialect}}. If PostgreSQL, use strict PG syntax (double quotes for identifiers). If MySQL, use strict MySQL syntax.
3. If creating a table and inserting data, use multiple valid SQL statements separated by a semicolon (;).
4. NEVER enclose the SQL query inside markdown blocks like \\\`\\\`\\\`sql ... \\\`\\\`\\\`. Make the \`sqlQuery\` perfectly valid raw SQL code.

Given a user question and a table schema, generate the SQL query that answers the question.
Ignore any lines in the user input that are SQL comments (i.e., lines starting with '--').

User Question: {{userInput}}
Table Schema: {{tableSchema}}
(If schema is empty you can still generate CREATE TABLE or generic queries.)`,
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
