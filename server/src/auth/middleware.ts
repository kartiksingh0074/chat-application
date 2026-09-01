import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from './jwt.js';

export interface AuthedRequest extends Request {
  userId?: string;
  username?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  if (!token) {
    res.status(401).json({ code: 'unauthorized', message: 'Missing bearer token' });
    return;
  }
  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch {
    res.status(401).json({ code: 'unauthorized', message: 'Invalid or expired token' });
  }
}
