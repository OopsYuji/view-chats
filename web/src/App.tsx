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

  const loadSummaries = useCallback(async () => {
    setLoadingChats(true);
    setSummariesError(null);

    try {
      const data = await fetchChatSummaries();
      setChatSummaries(data);

      const trimmedSearch = searchSessionId.trim();

      if (trimmedSearch) {
        const exactMatch = data.find(
          (chat) => chat.sessionId.toLowerCase() === trimmedSearch.toLowerCase()
        );

        if (exactMatch) {
          setSelectedSessionId(exactMatch.sessionId);
        } else {
          const partial = data.find((chat) =>
            chat.sessionId.toLowerCase().includes(trimmedSearch.toLowerCase())
          );
          setSelectedSessionId(partial ? partial.sessionId : null);
        }
      } else {
        setSelectedSessionId(null);
      }

      return data;
    } catch (error) {
      console.error('Failed to load chat summaries', error);
      setSummariesError(error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      setLoadingChats(false);
    }
  }, [searchSessionId]);

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

  const handleFindSession = async () => {
    setHasSearched(true);
    try {
      await loadSummaries();
    } catch {
      // error handled in loadSummaries
    }
  };

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
            onClick={() => void loadSummaries()}
          >
            {loadingChats ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <form
          className="search-input-row"
          onSubmit={(event) => {
            event.preventDefault();
            handleFindSession();
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
                onClick={() => setSearchSessionId('')}
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
