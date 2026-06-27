import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleAiMarkdownRequest } from '../server/aiMarkdown';

export default function handler(req: IncomingMessage, res: ServerResponse) {
    return handleAiMarkdownRequest(req, res);
}
