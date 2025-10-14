import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchChatList, fetchChatMessages } from './api';
import type { ChatListCursor, ChatListItem, ChatMessage } from './types';

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

const CHAT_PAGE_SIZE = 50;
const MIN_CHAT_SEARCH_LENGTH = 3;

const App = () => {
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
  const [showOnlyWhatsapp, setShowOnlyWhatsapp] = useState(false);

  const loadChatList = useCallback(
    async ({ reset, cursor }: { reset: boolean; cursor?: ChatListCursor | null }) => {
      setListLoading(true);
      setListError(null);

      try {
        const response = await fetchChatList({
          limit: CHAT_PAGE_SIZE,
          ...(reset ? {} : cursor ? { cursor } : {}),
          ...(appliedSearch ? { search: appliedSearch } : {})
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
    [appliedSearch]
  );

  useEffect(() => {
    void loadChatList({ reset: true });
  }, [loadChatList]);

  useEffect(() => {
    if (!selectedSessionId) {
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
  }, [selectedSessionId]);

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

  const displayedChats = useMemo(
    () =>
      showOnlyWhatsapp
        ? chatList.filter((chat) => chat.sessionId.split('_').length === 2)
        : chatList,
    [chatList, showOnlyWhatsapp]
  );

  useEffect(() => {
    if (displayedChats.length === 0) {
      if (selectedSessionId !== null) {
        setSelectedSessionId(null);
      }
      return;
    }

    if (selectedSessionId && displayedChats.some((chat) => chat.sessionId === selectedSessionId)) {
      return;
    }

    setSelectedSessionId(displayedChats[0].sessionId);
  }, [displayedChats, selectedSessionId]);

  const visibleMessages = useMemo(
    () =>
      includeSystemMessages
        ? messages
        : messages.filter((message) => message.payload.type !== 'system'),
    [includeSystemMessages, messages]
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-title">Chats</h1>
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
              checked={showOnlyWhatsapp}
              onChange={(event) => setShowOnlyWhatsapp(event.target.checked)}
            />
            <span>Show only WhatsApp</span>
          </label>
        </div>
        {searchFeedback && <div className="info-banner">{searchFeedback}</div>}
        {listError && <div className="error-banner">{listError}</div>}
        <ul className="chat-list">
          {displayedChats.length === 0 && !listLoading ? (
            <li className="chat-empty">
              <div className="empty-state">
                <strong>No chats found</strong>
                <span>
                  {showOnlyWhatsapp
                    ? 'Try disabling the WhatsApp filter or load more results.'
                    : 'Adjust your search to see results.'}
                </span>
              </div>
            </li>
          ) : (
            displayedChats.map((chat) => {
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
