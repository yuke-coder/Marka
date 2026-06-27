import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleAiMarkdownRequest } from '../server/aiMarkdown';

export const config = {
    maxDuration: 60,
};

export default function handler(req: IncomingMessage, res: ServerResponse) {
    return handleAiMarkdownRequest(req, res);
}
