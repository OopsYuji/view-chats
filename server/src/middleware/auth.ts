import type { RequestHandler } from 'express';
import { config } from '../config';

interface GoogleTokenInfo {
  aud: string;
  email?: string;
  email_verified?: string;
  name?: string;
  picture?: string;
}

const verifyGoogleIdToken = async (token: string): Promise<GoogleTokenInfo> => {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`
  );

  if (!response.ok) {
    throw new Error(`Token validation failed with status ${response.status}`);
  }

  return (await response.json()) as GoogleTokenInfo;
};

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = header.slice('Bearer '.length).trim();

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const payload = await verifyGoogleIdToken(token);

    if (payload.aud !== config.auth.googleClientId) {
      throw new Error('Audience mismatch');
    }

    if (payload.email_verified !== 'true') {
      throw new Error('Email is not verified');
    }

    const email = payload.email?.toLowerCase();

    if (!email || !email.endsWith(`@${config.auth.allowedDomain}`)) {
      throw new Error('Email domain not allowed');
    }

    (req as typeof req & { authUser?: { email: string; name?: string; picture?: string } }).authUser =
      {
        email,
        name: payload.name,
        picture: payload.picture
      };

    next();
  } catch (error) {
    console.error('[auth] verification failed', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
};
