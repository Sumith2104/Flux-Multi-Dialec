const r = /UPDATE\s+(?:["'`]?[a-zA-Z0-9_]+["'`]?\.)?["'`]?([a-zA-Z0-9_]+)["'`]?/i;
const queries = [
    'UPDATE "project_123"."plans" SET ...',
    'UPDATE project_123.plans SET ...',
    'UPDATE plans SET ...',
    'UPDATE public.plans SET ...',
    'update `project_123`.`plans` SET ...',
];
queries.forEach(q => console.log(q, '->', q.match(r)[1]));
