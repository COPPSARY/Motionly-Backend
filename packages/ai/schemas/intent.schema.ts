import { z } from 'zod';

export const intentSchema = z.object({
    intent: z.enum(['CHAT', 'PLAN', 'CREATE', 'EDIT', 'FIX']),
}).strict();

export type Intent = z.infer<typeof intentSchema>['intent'];
