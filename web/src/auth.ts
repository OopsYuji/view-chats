const STORAGE_KEY = 'view-chats.googleIdToken';

let authToken: string | null = null;

export const initializeAuthToken = (): string | null => {
  if (typeof window === 'undefined') {
    authToken = null;
    return null;
  }

  authToken = window.localStorage.getItem(STORAGE_KEY);
  return authToken;
};

export const persistAuthToken = (token: string | null): void => {
  authToken = token;

  if (typeof window === 'undefined') {
    return;
  }

  if (token) {
    window.localStorage.setItem(STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
};

export const getAuthHeaders = (): HeadersInit => {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
};
