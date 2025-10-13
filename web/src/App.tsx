import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchChatMessages, fetchChatSummaries } from './api';
import type { ChatMessage, ChatSummary } from './types';

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

const MIN_SEARCH_LENGTH = 3;
const SUMMARY_LIMIT = 25;

const App = () => {
  const [chatSummaries, setChatSummaries] = useState<ChatSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [summariesError, setSummariesError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [includeSystemMessages, setIncludeSystemMessages] = useState(true);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Record<string, boolean>>({});
  const [searchSessionId, setSearchSessionId] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const loadSummaries = useCallback(
    async (searchTerm: string) => {
      const trimmedSearch = searchTerm.trim();

      if (!trimmedSearch) {
        setChatSummaries([]);
        setSelectedSessionId(null);
        return [];
      }

      setLoadingChats(true);
      setSummariesError(null);

      try {
        const data = await fetchChatSummaries({
          search: trimmedSearch,
          limit: SUMMARY_LIMIT
        });
        setChatSummaries(data);

        if (data.length === 0) {
          setSelectedSessionId(null);
          setSummariesError('No chat sessions found. Try searching with the beginning of the id.');
          return data;
        }

        const lowerSearch = trimmedSearch.toLowerCase();
        const exactMatch = data.find(
          (chat) => chat.sessionId.toLowerCase() === lowerSearch
        );

        if (exactMatch) {
          setSelectedSessionId(exactMatch.sessionId);
        } else {
          setSelectedSessionId(data[0].sessionId);
        }

        return data;
      } catch (error) {
        console.error('Failed to load chat summaries', error);
        setChatSummaries([]);
        setSelectedSessionId(null);
        setSummariesError(error instanceof Error ? error.message : 'Unknown error');
        throw error;
      } finally {
        setLoadingChats(false);
      }
    },
    []
  );

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

  const handleFindSession = useCallback(async () => {
    const trimmedSearch = searchSessionId.trim();

    if (!trimmedSearch) {
      setChatSummaries([]);
      setSelectedSessionId(null);
      setSummariesError('Enter a session id to search.');
      return;
    }

    if (trimmedSearch.length < MIN_SEARCH_LENGTH) {
      setChatSummaries([]);
      setSelectedSessionId(null);
      setSummariesError(`Enter at least ${MIN_SEARCH_LENGTH} characters to search.`);
      return;
    }

    setHasSearched(true);

    try {
      await loadSummaries(trimmedSearch);
    } catch {
      // error handled in loadSummaries
    }
  }, [loadSummaries, searchSessionId]);

  const handleToggleMessageRaw = (messageId: string) => {
    setExpandedMessageIds((prev) => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  const selectedSummary = selectedSessionId
    ? chatSummaries.find((chat) => chat.sessionId === selectedSessionId)
    : undefined;

  const visibleMessages = useMemo(
    () =>
      includeSystemMessages
        ? messages
        : messages.filter((message) => message.payload.type !== 'system'),
    [includeSystemMessages, messages]
  );

  return (
    <div className="app single-column">
      <section className="search-panel">
        <div className="search-header">
          <h1 className="search-panel-title">Chat Sessions</h1>
          <button
            type="button"
            className="refresh-button"
            disabled={loadingChats || !hasSearched}
            onClick={() => void handleFindSession()}
          >
            {loadingChats ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <form
          className="search-input-row"
          onSubmit={(event) => {
            event.preventDefault();
            void handleFindSession();
          }}
        >
          <div className="search-input-wrapper">
            <input
              type="text"
              value={searchSessionId}
              placeholder="Search session id..."
              onChange={(event) => setSearchSessionId(event.target.value)}
            />
            {searchSessionId && (
              <button
                type="button"
                className="clear-search"
                onClick={() => {
                  setSearchSessionId('');
                  setHasSearched(false);
                  setChatSummaries([]);
                  setSelectedSessionId(null);
                  setSummariesError(null);
                }}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <button type="submit" className="search-button">
            Find
          </button>
        </form>
        {summariesError && <div className="error-banner">{summariesError}</div>}
      </section>

      <main className="main">
        {selectedSessionId ? (
          <>
            <div className="main-header">
              <span className="session-id">{selectedSessionId}</span>
              <div className="main-header-meta">
                <span className="message-count">
                  {selectedSummary
                    ? includeSystemMessages
                      ? `${selectedSummary.messageCount} messages`
                      : `${visibleMessages.length} of ${selectedSummary.messageCount} messages`
                    : ''}
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
                  return (
                    <article
                      key={message.id}
                      className={`message-card type-${messageType.toLowerCase()}`}
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
            <strong>Search for a chat session</strong>
            <span>Enter a session id above and press Find to load messages.</span>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
