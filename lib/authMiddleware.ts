import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from './auth';
import { validateApiKey } from './database';

export async function requireAuth(
  req: NextApiRequest,
  res: NextApiResponse,
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  // Check API Key or internal secret for MCP agents / automation
  const authHeader = req.headers.authorization;
  const apiKeyHeader = (req.headers['x-api-key'] || req.headers['x-loopstream-key']) as string | undefined;
  const internalSecret = req.headers['x-loopstream-internal-key'];

  if (internalSecret === 'loopstream-internal-mcp-key') {
    (req as any).session = { user: { username: 'mcp-agent', isLoggedIn: true } };
    return handler(req, res);
  }

  const token = apiKeyHeader || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null);

  if (token) {
    const isValid = await validateApiKey(String(token));
    if (isValid) {
      (req as any).session = { user: { username: 'mcp-agent', isLoggedIn: true } };
      return handler(req, res);
    }
  }

  const session = await getSession(req, res);
  
  if (!session.user?.isLoggedIn) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Attach session to request for convenience
  (req as any).session = session;
  
  return handler(req, res);
}