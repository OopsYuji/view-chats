import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchChatList, fetchChatMessages, UnauthorizedError } from './api';
import { initializeAuthToken, persistAuthToken } from './auth';
import type { ChatListCursor, ChatListItem, ChatMessage } from './types';

type GoogleCredentialResponse = {
  credential?: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: { theme?: string; size?: string; width?: number }
          ): void;
          prompt(): void;
          disableAutoSelect?: () => void;
        };
      };
    };
  }
}

const formatDateTime = (value: string | null) => {
  if (!value) {
    return 'Unknown';
  }

  return new Date(value).toLocaleString();
};

const formatMessageContent = (message: ChatMessage) => {
  const { content } = message.payload;

  if (content == null) {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (
          item &&
          typeof item === 'object' &&
          'text' in item &&
          typeof item.text === 'string'
        ) {
          return item.text;
        }

        return JSON.stringify(item, null, 2);
      })
      .join('\n\n');
  }

  return JSON.stringify(content, null, 2);
};

const decodeEmailFromToken = (token: string): string | null => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }

    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized));
    return typeof decoded.email === 'string' ? decoded.email : null;
  } catch {
    return null;
  }
};

const initialAuthToken = typeof window === 'undefined' ? null : initializeAuthToken();

const CHAT_PAGE_SIZE = 50;
const MIN_CHAT_SEARCH_LENGTH = 3;

const App = () => {
  const [authToken, setAuthTokenState] = useState<string | null>(initialAuthToken);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(Boolean(initialAuthToken));
  const [chatList, setChatList] = useState<ChatListItem[]>([]);
  const [listCursor, setListCursor] = useState<ChatListCursor | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [includeSystemMessages, setIncludeSystemMessages] = useState(true);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Record<string, boolean>>({});
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const [showSalesOnly, setShowSalesOnly] = useState(false);
  const [showWhatsappOnly, setShowWhatsappOnly] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  useEffect(() => {
    persistAuthToken(authToken);
    if (authToken) {
      setUserEmail(decodeEmailFromToken(authToken));
    } else {
      setUserEmail(null);
    }
  }, [authToken]);

  useEffect(() => {
    if (authToken) {
      setAuthReady(true);
      return;
    }

    if (!googleClientId) {
      setAuthError('Missing Google client ID (VITE_GOOGLE_CLIENT_ID).');
      return;
    }

    let mounted = true;
    let script: HTMLScriptElement | null = null;

    const initialize = () => {
      if (!mounted) {
        return;
      }

      const google = window.google?.accounts?.id;

      if (!google) {
        setAuthError('Google Identity Services unavailable.');
        return;
      }

      google.initialize({
        client_id: googleClientId,
        callback: (response) => {
          if (!response.credential) {
            setAuthError('Google Sign-In failed. Please try again.');
            return;
          }

          setAuthTokenState(response.credential);
          setAuthError(null);
        }
      });

      if (googleButtonRef.current) {
        google.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          width: 280
        });
      }

      google.prompt();
      setAuthReady(true);
    };

    if (window.google?.accounts?.id) {
      initialize();
    } else {
      script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initialize;
      script.onerror = () => {
        if (mounted) {
          setAuthError('Failed to load Google Sign-In. Refresh and try again.');
        }
      };
      document.head.appendChild(script);
    }

    return () => {
      mounted = false;
      if (script) {
        document.head.removeChild(script);
      }
    };
  }, [authToken, googleClientId]);

  const handleSignOut = useCallback(() => {
    setAuthTokenState(null);
    setAuthReady(false);
    setAuthError(null);
    setChatList([]);
    setListCursor(null);
    setSelectedSessionId(null);
    setMessages([]);
    setMessagesError(null);
    setListError(null);
    setExpandedMessageIds({});
    setSearchInput('');
    setAppliedSearch('');
    setShowSalesOnly(false);
    setShowWhatsappOnly(false);
    window.google?.accounts?.id?.disableAutoSelect?.();
  }, []);

  const handleUnauthorized = useCallback(() => {
    handleSignOut();
    setAuthError('Session expired. Please sign in again.');
  }, [handleSignOut]);

  const loadChatList = useCallback(
    async ({ reset, cursor }: { reset: boolean; cursor?: ChatListCursor | null }) => {
      if (!authToken) {
        if (reset) {
          setChatList([]);
          setListCursor(null);
          setSelectedSessionId(null);
        }

        return;
      }

      setListLoading(true);
      setListError(null);

      try {
        const response = await fetchChatList({
          limit: CHAT_PAGE_SIZE,
          ...(reset ? {} : cursor ? { cursor } : {}),
          ...(appliedSearch ? { search: appliedSearch } : {}),
          ...(showSalesOnly ? { onlySales: true } : {}),
          ...(showWhatsappOnly ? { onlyWhatsapp: true } : {})
        });

        setChatList((prev) => (reset ? response.items : [...prev, ...response.items]));
        setListCursor(response.nextCursor ?? null);

        setSelectedSessionId((prev) => {
          if (reset) {
            if (prev && response.items.some((item) => item.sessionId === prev)) {
              return prev;
            }

            return response.items[0]?.sessionId ?? null;
          }

          return prev ?? response.items[0]?.sessionId ?? null;
        });
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          handleUnauthorized();
          return;
        }

        console.error('Failed to load chats', error);
        setListError(error instanceof Error ? error.message : 'Unknown error');
        if (reset) {
          setChatList([]);
          setListCursor(null);
          setSelectedSessionId(null);
        }
      } finally {
        setListLoading(false);
      }
    },
    [appliedSearch, authToken, handleUnauthorized, showSalesOnly, showWhatsappOnly]
  );

  useEffect(() => {
    if (!authToken) {
      return;
    }

    void loadChatList({ reset: true });
  }, [authToken, loadChatList]);

  useEffect(() => {
    if (!selectedSessionId || !authToken) {
      setMessages([]);
      setMessagesError(null);
      setExpandedMessageIds({});
      return;
    }

    let isCancelled = false;

    const loadMessages = async () => {
      setLoadingMessages(true);
      setMessagesError(null);

      try {
        const data = await fetchChatMessages(selectedSessionId);
        if (!isCancelled) {
          setMessages(data);
        }
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          handleUnauthorized();
          return;
        }

        console.error('Failed to load chat messages', error);
        if (!isCancelled) {
          setMessages([]);
          setMessagesError(error instanceof Error ? error.message : 'Unknown error');
        }
      } finally {
        if (!isCancelled) {
          setLoadingMessages(false);
        }
      }
    };

    void loadMessages();

    return () => {
      isCancelled = true;
    };
  }, [selectedSessionId, authToken, handleUnauthorized]);

  useEffect(() => {
    setExpandedMessageIds({});
  }, [selectedSessionId, includeSystemMessages]);

  const handleSearchSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = searchInput.trim();

      if (trimmed && trimmed.length < MIN_CHAT_SEARCH_LENGTH) {
        setSearchFeedback(`Enter at least ${MIN_CHAT_SEARCH_LENGTH} characters to search.`);
        return;
      }

      setSearchFeedback(null);
      setAppliedSearch(trimmed);
    },
    [searchInput]
  );

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    setAppliedSearch('');
    setSearchFeedback(null);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (listLoading || !listCursor) {
      return;
    }

    void loadChatList({ reset: false, cursor: listCursor });
  }, [listCursor, listLoading, loadChatList]);

  const handleToggleMessageRaw = (messageId: string) => {
    setExpandedMessageIds((prev) => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  const emptyFilterMessage = useMemo(() => {
    if (showSalesOnly && showWhatsappOnly) {
      return 'Try relaxing the Sales or WhatsApp filters, or load more results.';
    }
    if (showSalesOnly) {
      return 'Try disabling the Sales filter or load more results.';
    }
    if (showWhatsappOnly) {
      return 'Try disabling the WhatsApp filter or load more results.';
    }
    return 'Adjust your search to see results.';
  }, [showSalesOnly, showWhatsappOnly]);

  useEffect(() => {
    if (chatList.length === 0) {
      if (selectedSessionId !== null) {
        setSelectedSessionId(null);
      }
      return;
    }

    if (selectedSessionId && chatList.some((chat) => chat.sessionId === selectedSessionId)) {
      return;
    }

    setSelectedSessionId(chatList[0].sessionId);
  }, [chatList, selectedSessionId]);

  const visibleMessages = useMemo(
    () =>
      includeSystemMessages
        ? messages
        : messages.filter((message) => message.payload.type !== 'system'),
    [includeSystemMessages, messages]
  );

  if (!authToken) {
    return (
      <div className="auth-gate">
        <div className="auth-card">
          <div className="auth-card-header">
            <h1>View Chats</h1>
            <p>Review conversations securely using your Google workspace account.</p>
          </div>
          <div className="auth-card-body">
            <span className="auth-card-badge">Internal access</span>
            {authError && <div className="error-banner">{authError}</div>}
            {!authError && !authReady && <div className="spinner" />}
            <div className="google-button-anchor" ref={googleButtonRef} />
            <small>Only approved company email addresses can sign in.</small>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-user">
            <h1 className="sidebar-title">Chats</h1>
            {userEmail && <span className="sidebar-user-email">{userEmail}</span>}
          </div>
          <button type="button" className="sign-out-button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
        <form className="sidebar-search" onSubmit={handleSearchSubmit}>
          <div className="search-input-wrapper">
            <input
              type="text"
              value={searchInput}
              placeholder="Search session id..."
              onChange={(event) => setSearchInput(event.target.value)}
            />
            {searchInput && (
              <button
                type="button"
                className="clear-search"
                onClick={handleClearSearch}
                aria-label="Clear search"
              >
                x
              </button>
            )}
          </div>
          <button type="submit" className="search-button">
            Search
          </button>
        </form>
        <div className="sidebar-controls">
          <label className="toggle">
            <input
              type="checkbox"
              checked={showSalesOnly}
              onChange={(event) => setShowSalesOnly(event.target.checked)}
            />
            <span>Sales</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showWhatsappOnly}
              onChange={(event) => setShowWhatsappOnly(event.target.checked)}
            />
            <span>WhatsApp</span>
          </label>
        </div>
        {searchFeedback && <div className="info-banner">{searchFeedback}</div>}
        {listError && <div className="error-banner">{listError}</div>}
        <ul className="chat-list">
          {chatList.length === 0 && !listLoading ? (
            <li className="chat-empty">
              <div className="empty-state">
                <strong>No chats found</strong>
                <span>{emptyFilterMessage}</span>
              </div>
            </li>
          ) : (
            chatList.map((chat) => {
              const isActive = chat.sessionId === selectedSessionId;
              return (
                <li key={chat.sessionId} className="chat-item">
                  <button
                    type="button"
                    className={`chat-button${isActive ? ' active' : ''}`}
                    onClick={() => setSelectedSessionId(chat.sessionId)}
                  >
                    <span className="chat-session-id">{chat.sessionId}</span>
                    <span className="chat-meta">
                      {formatDateTime(chat.lastMessageAt)}
                      {` · ${chat.messageCount} msgs`}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="sidebar-footer">
          {listLoading ? (
            <div className="spinner" />
          ) : listCursor ? (
            <button
              type="button"
              className="load-more"
              onClick={handleLoadMore}
              disabled={listLoading}
            >
              Load more
            </button>
          ) : (
            <span className="sidebar-end">End of results</span>
          )}
        </div>
      </aside>

      <main className="main">
        {selectedSessionId ? (
          <>
            <div className="main-header">
              <span className="session-id">{selectedSessionId}</span>
              <div className="main-header-meta">
                <span className="message-count">
                  {includeSystemMessages
                    ? `${messages.length} messages`
                    : `${visibleMessages.length} of ${messages.length} messages`}
                </span>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={includeSystemMessages}
                    onChange={(event) => setIncludeSystemMessages(event.target.checked)}
                  />
                  <span>Show system messages</span>
                </label>
              </div>
              {messagesError && <div className="error-banner">{messagesError}</div>}
            </div>
            <div className="messages-container">
              {loadingMessages ? (
                <div className="spinner" />
              ) : visibleMessages.length === 0 ? (
                <div className="empty-state">
                  <strong>No messages yet</strong>
                  <span>
                    {includeSystemMessages
                      ? 'This chat session does not have any stored messages.'
                      : 'No messages remain after filtering out system messages.'}
                  </span>
                </div>
              ) : (
                visibleMessages.map((message) => {
                  const content = formatMessageContent(message);
                  const messageType = message.payload.type ?? 'unknown';
                  const isExpanded = !!expandedMessageIds[message.id];
                  const normalizedType = messageType.toLowerCase();
                  const alignmentClass =
                    normalizedType === 'ai' || normalizedType === 'system'
                      ? 'align-right'
                      : 'align-left';
                  return (
                    <article
                      key={message.id}
                      className={`message-card type-${normalizedType} ${alignmentClass}`}
                    >
                      <header className="message-meta">
                        <span>{messageType.toUpperCase()}</span>
                        <span>{formatDateTime(message.createdAt)}</span>
                      </header>
                      <section className="message-content">{content}</section>
                      <button
                        type="button"
                        className="message-json-toggle"
                        onClick={() => handleToggleMessageRaw(message.id)}
                      >
                        {isExpanded ? 'Hide raw message' : 'Show raw message'}
                      </button>
                      {isExpanded && (
                        <pre className="message-json">
                          {JSON.stringify(message.payload, null, 2)}
                        </pre>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <strong>Select a chat</strong>
            <span>Choose a chat from the sidebar to load its messages.</span>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
