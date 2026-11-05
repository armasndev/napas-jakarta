"use client";

import type { EveMessage } from "eve/react";
import { useEveAgent } from "eve/react";
import {
  AlertCircleIcon,
  BookOpenIcon,
  BrainIcon,
  ChevronDownIcon,
  MapIcon,
  MapPinIcon,
  RadioTowerIcon,
  SendHorizontalIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollAccessibility,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputButton,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { localizeChatError } from "@/lib/chat-errors";
import { getUiCopy, localizedCategory, localizedDistrict, replaceCopy, type Language } from "@/lib/i18n";
import { trackNapasEvent } from "@/lib/analytics";
import { recordChatFailure, recordChatTurn } from "@/lib/telemetry";
import {
  buildNapasClientContext,
  findTopic,
  getLocalizedTopicCopy,
  getLocalizedTopicGroupCopy,
  getTopicSourceLabels,
  TOPIC_GROUPS,
  type TopicCopy,
  type TopicOption,
} from "@/lib/topics";
import { getSuggestedQuestions } from "@/lib/suggestions";
import { EN_GUIDE_PATH, ID_GUIDE_PATH } from "@/lib/site";
import { shouldShowPendingThinking, shouldShowSuggestedQuestions } from "@/lib/chat-state";
import type { DemoStation } from "@/lib/napas";
import { PACED_TEXT_START_BUFFER } from "@/lib/paced-text";
import { MAX_CHAT_CHARACTERS, validateChatInput } from "@/lib/user-input-limits";
import { AgentMessage } from "./agent-message";

export function AgentChat({
  language,
  isLegendOpen,
  isMapOpen,
  onMapToggle,
  onLegendOpen,
  onStationClear,
  onStationSelect,
  prefillPrompt,
  selectedStation,
  selectedStationId,
  stationOptions,
}: {
  readonly language: Language;
  readonly isLegendOpen: boolean;
  readonly isMapOpen: boolean;
  readonly onMapToggle: () => void;
  readonly onLegendOpen: () => void;
  readonly onStationClear: (source: "map_detail" | "chat_context") => void;
  readonly onStationSelect: (station: DemoStation, source: "map_marker" | "station_list" | "chat_picker") => void;
  readonly prefillPrompt?: { readonly id: number; readonly text: string };
  readonly selectedStation?: string;
  readonly selectedStationId?: string;
  readonly stationOptions: readonly DemoStation[];
}) {
  const copy = getUiCopy(language);
  const [cancellationError, setCancellationError] = useState<string>();
  const [inputError, setInputError] = useState<string>();
  const [isSending, setIsSending] = useState(false);
  const [hasInputText, setHasInputText] = useState(false);
  const [inputText, setInputText] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string>();
  const [stationMenuOpen, setStationMenuOpen] = useState(false);
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  const stationPickerRef = useRef<HTMLDivElement>(null);
  const topicPickerRef = useRef<HTMLDivElement>(null);
  const appliedPrefillId = useRef<number | undefined>(undefined);
  const agent = useEveAgent();
  const selectedTopic = findTopic(selectedTopicId);
  const localizedTopic = selectedTopic ? getLocalizedTopicCopy(selectedTopic, language) : undefined;
  const suggestedQuestions = getSuggestedQuestions(localizedTopic, selectedStation, language);

  const isBusy = isSending || agent.status === "submitted" || agent.status === "streaming";
  const isResuming = agent.status === "resuming";
  const isEmpty = agent.data.messages.length === 0;
  const lastMessage = agent.data.messages.at(-1);
  const hasStreamingAnswer =
    agent.status === "streaming" &&
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some(
      (part) => part.type === "text" && part.text.trim().length >= PACED_TEXT_START_BUFFER,
    );
  const showPendingThinking = shouldShowPendingThinking({ isBusy, isResuming }) && !hasStreamingAnswer;
  const turnFailure = isBusy || isResuming ? undefined : getLatestTurnFailure(agent.events, language);
  const errorMessage = cancellationError ?? localizeAgentError(agent.error?.message, language) ?? turnFailure;
  const anonymousSessionId = useRef(createAnonymousSessionId());
  const telemetrySessionId = anonymousSessionId.current;
  const recordedTurnIds = useRef(new Set<string>());
  const recordedFailureIds = useRef(new Set<string>());
  const latestUserMessage = [...agent.data.messages].reverse().find((message) => message.role === "user");
  const latestAssistantMessage = lastMessage?.role === "assistant" ? lastMessage : undefined;
  const latestQuestion = latestUserMessage ? messageText(latestUserMessage) : "";
  const latestAnswer = latestAssistantMessage ? messageText(latestAssistantMessage) : "";
  const showSuggestedQuestions = shouldShowSuggestedQuestions({
    hasAssistantAnswer: latestAnswer.length > 0,
    isBusy,
    isEmpty,
    isResuming,
  });

  const closeTopicPicker = useCallback(() => {
    if (topicMenuOpen) trackNapasEvent("topic_picker_closed");
    setTopicMenuOpen(false);
  }, [topicMenuOpen]);

  const closeStationPicker = useCallback(() => {
    if (stationMenuOpen) trackNapasEvent("station_picker_closed");
    setStationMenuOpen(false);
  }, [stationMenuOpen]);

  const openTopicPicker = useCallback((source: "header" | "selected_topic") => {
    closeStationPicker();
    if (!topicMenuOpen) trackNapasEvent("topic_picker_opened", { source });
    setTopicMenuOpen(true);
  }, [closeStationPicker, topicMenuOpen]);

  const toggleTopicPicker = useCallback(() => {
    closeStationPicker();
    if (topicMenuOpen) {
      trackNapasEvent("topic_picker_closed");
      setTopicMenuOpen(false);
    } else {
      trackNapasEvent("topic_picker_opened", { source: "header" });
      setTopicMenuOpen(true);
    }
  }, [closeStationPicker, topicMenuOpen]);

  const toggleStationPicker = useCallback(() => {
    closeTopicPicker();
    if (stationMenuOpen) {
      trackNapasEvent("station_picker_closed");
      setStationMenuOpen(false);
    } else {
      trackNapasEvent("station_picker_opened");
      setStationMenuOpen(true);
    }
  }, [closeTopicPicker, stationMenuOpen]);

  useEffect(() => {
    if (!prefillPrompt || appliedPrefillId.current === prefillPrompt.id) return;

    appliedPrefillId.current = prefillPrompt.id;
    setInputText(prefillPrompt.text);
    setHasInputText(true);

    const frame = window.requestAnimationFrame(() => {
      const textarea = document.getElementById("napas-composer-input");
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [prefillPrompt]);

  useEffect(() => {
    if (isBusy || isResuming || latestAssistantMessage === undefined || latestQuestion.length === 0 || latestAnswer.length === 0) {
      return;
    }
    if (recordedTurnIds.current.has(latestAssistantMessage.id)) {
      return;
    }

    recordedTurnIds.current.add(latestAssistantMessage.id);
    recordChatTurn({
      answer: latestAnswer,
      conversation_turn: agent.data.messages.filter((message) => message.role === "user").length,
      history_messages: agent.data.messages.length,
      interaction_id: latestAssistantMessage.id,
      question: latestQuestion,
      session_id: telemetrySessionId,
    });
  }, [
    agent.data.messages,
    isBusy,
    isResuming,
    latestAnswer,
    latestAssistantMessage,
    latestQuestion,
    telemetrySessionId,
  ]);

  useEffect(() => {
    let failureIndex: number | undefined;
    for (let index = agent.events.length - 1; index >= 0; index -= 1) {
      const event = agent.events[index];
      if (event.type === "turn.failed") {
        failureIndex = index;
        break;
      }
      if (event.type === "turn.completed" || event.type === "turn.cancelled" || event.type === "message.received") {
        return;
      }
    }
    if (failureIndex === undefined) return;

    const failure = agent.events[failureIndex];
    if (failure?.type !== "turn.failed") return;

    const errorCode = typeof failure.data.code === "string" ? failure.data.code : "UNKNOWN";
    const failureId = `${failureIndex}:${latestUserMessage?.id ?? "none"}:${errorCode}`;
    if (recordedFailureIds.current.has(failureId)) return;

    recordedFailureIds.current.add(failureId);
    recordChatFailure({
      context_messages: agent.data.messages.length,
      conversation_turn: agent.data.messages.filter((message) => message.role === "user").length,
      error_code: errorCode,
      input_chars: latestQuestion.length,
      interaction_id: latestUserMessage?.id ?? failureId,
      session_id: telemetrySessionId,
    });
  }, [agent.data.messages, agent.events, latestQuestion, latestUserMessage, telemetrySessionId]);

  useEffect(() => {
    if (!topicMenuOpen && !stationMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !topicPickerRef.current?.contains(event.target) &&
        !stationPickerRef.current?.contains(event.target)
      ) {
        closeTopicPicker();
        closeStationPicker();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeTopicPicker();
        closeStationPicker();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeStationPicker, closeTopicPicker, stationMenuOpen, topicMenuOpen]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateKeyboardOffset = () => {
      // On iOS the layout viewport stays at its full height while the visual
      // viewport is reduced by the software keyboard. Android browsers often
      // resize both viewports, so this naturally resolves to zero there.
      const keyboardOffset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      document.documentElement.style.setProperty("--napas-keyboard-offset", `${keyboardOffset}px`);
    };

    updateKeyboardOffset();
    viewport.addEventListener("resize", updateKeyboardOffset);
    viewport.addEventListener("scroll", updateKeyboardOffset);

    return () => {
      viewport.removeEventListener("resize", updateKeyboardOffset);
      viewport.removeEventListener("scroll", updateKeyboardOffset);
      document.documentElement.style.removeProperty("--napas-keyboard-offset");
    };
  }, []);

  const handleMapToggle = () => {
    closeStationPicker();
    closeTopicPicker();
    trackNapasEvent(isMapOpen ? "mobile_map_closed" : "mobile_map_opened");
    onMapToggle();
  };

  const handleStationSelect = (station: DemoStation) => {
    closeStationPicker();
    onStationSelect(station, "chat_picker");
  };

  const requestCancellation = () => {
    setCancellationError(undefined);
    void agent.cancel().catch((error: unknown) => {
      setCancellationError(toErrorMessage(error, language));
    });
  };

  const sendText = async (text: string) => {
    const normalizedText = text.trim();
    if (normalizedText.length === 0 || isResuming) return;

    if (validateChatInput(normalizedText)) {
      setInputError(copy.chat.inputTooLong);
      return;
    }

    setInputError(undefined);
    setCancellationError(undefined);
    setIsSending(true);

    try {
      trackNapasEvent("assistant_question_submitted");
      await agent.send(normalizedText, buildSendOptions());
      setInputText("");
      setHasInputText(false);
    } catch (error: unknown) {
      setCancellationError(toErrorMessage(error, language));
    } finally {
      setIsSending(false);
    }
  };

  const buildSendOptions = () => ({
    ...(isBusy ? { turnPolicy: "steer" as const } : {}),
    clientContext: buildNapasClientContext(selectedTopic, selectedStation, language),
  });

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if (text.length === 0 || isResuming) return;
    await sendText(text);
  };

  const composer = (
    <PromptInput allowAttachments={false} onSubmit={handleSubmit}>
      <PromptInputTextarea
        className="napas-prompt-textarea"
        disabled={isResuming}
        id="napas-composer-input"
        aria-describedby={inputError ? "napas-composer-error" : undefined}
        aria-invalid={inputError ? true : undefined}
        maxLength={MAX_CHAT_CHARACTERS}
        onChange={(event) => {
          setInputError(undefined);
          setInputText(event.currentTarget.value);
          setHasInputText(event.currentTarget.value.trim().length > 0);
        }}
        placeholder={copy.chat.placeholder}
        value={inputText}
      />
      <ComposerAction
        hasInputText={hasInputText}
        isBusy={isBusy}
        isResuming={isResuming}
        language={language}
        onCancel={requestCancellation}
      />
    </PromptInput>
  );

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground napas-chat-shell"
      data-suggestions-visible={showSuggestedQuestions ? "true" : undefined}
    >
      <header className="chat-head">
        <div className="chat-title-row">
          <span className="chat-brand-mark" aria-hidden="true">
            <img alt="" height={1254} src="/napas-jakarta-air-icon.png" width={1254} />
          </span>
          <div className="chat-title-copy">
            <div className="chat-heading-line">
            <h2 id="chat-heading">{copy.chat.heading}</h2>
            </div>
            <div className="chat-meta-line">
              <p className="connection">
                <span className="connection-dot" aria-hidden="true" />
                <span className="connection-copy">{copy.chat.tagline}</span>
              </p>
            </div>
          </div>
          {isMapOpen ? (
            <button
              aria-controls="mobile-legend-dialog"
              aria-expanded={isLegendOpen}
              aria-label={copy.chat.openLegend}
              className="mobile-legend-toggle"
              onClick={() => {
                trackNapasEvent("map_legend_opened");
                onLegendOpen();
              }}
              title={copy.chat.mapLegend}
              type="button"
            >
              <BookOpenIcon aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="assistant-guidance">
          <div className="assistant-guidance-copy">
            <p className="assistant-guidance-title">{copy.chat.guidanceTitle}</p>
            <p className="assistant-guidance-description">{copy.chat.guidanceDescription}</p>
          </div>
        </div>
        <div className="chat-context-controls">
          <div className="chat-selection-controls">
            <StationPicker
              language={language}
              onClear={() => {
                closeStationPicker();
                onStationClear("chat_context");
              }}
              onSelect={handleStationSelect}
              onToggle={toggleStationPicker}
              open={stationMenuOpen}
              pickerRef={stationPickerRef}
              selectedStation={selectedStation}
              selectedStationId={selectedStationId}
              stations={stationOptions}
            />
            <div className="napas-topic-picker" ref={topicPickerRef}>
              <button
                aria-controls="napas-topic-menu"
                aria-expanded={topicMenuOpen}
                aria-haspopup="dialog"
                className="napas-topic-trigger"
                onClick={toggleTopicPicker}
                type="button"
              >
                <BookOpenIcon aria-hidden="true" className="size-3.5" />
                <span>{localizedTopic?.label ?? copy.chat.topics}</span>
                <ChevronDownIcon aria-hidden="true" className="size-3.5" />
              </button>
              {topicMenuOpen ? (
                <TopicMenu
                  language={language}
                  onClear={() => {
                    trackNapasEvent("topic_cleared");
                    setSelectedTopicId(undefined);
                    closeTopicPicker();
                  }}
                  onSelect={(topic) => {
                    trackNapasEvent("topic_selected");
                    setSelectedTopicId(topic.id);
                    closeTopicPicker();
                  }}
                  selectedTopic={selectedTopic}
                />
              ) : null}
            </div>
          </div>
          <button
            aria-controls="map-panel"
            aria-expanded={isMapOpen}
            aria-label={isMapOpen ? copy.chat.closeMap : copy.chat.openMap}
            className="mobile-map-toggle"
            onClick={handleMapToggle}
            type="button"
          >
            {isMapOpen ? <XIcon aria-hidden="true" /> : <MapIcon aria-hidden="true" />}
            {isMapOpen ? null : <span>{copy.chat.map}</span>}
          </button>
        </div>
      </header>

      <Conversation aria-label={copy.chat.conversation} className="min-h-0 flex-1 napas-chat-scroll" resize="smooth" tabIndex={0}>
        <ConversationContent className="mx-auto w-full gap-6 px-4 sm:px-6 napas-chat-content max-w-none pt-4 pb-5">
          {isEmpty ? <EmptyChatState language={language} /> : null}
          {agent.data.messages.map((message, index) =>
            showPendingThinking && message.role === "assistant" && message.id === lastMessage?.id ? null : (
              <AgentMessage
                canRespond={!isBusy && !isResuming}
                isLatest={index === agent.data.messages.length - 1}
                isStreaming={
                  agent.status === "streaming" && index === agent.data.messages.length - 1
                }
                key={message.id}
                message={message}
                language={language}
                sessionId={telemetrySessionId}
                onInputResponses={(inputResponses) => {
                  setCancellationError(undefined);
                  return agent.respond(inputResponses);
                }}
              />
            ),
          )}
          {showPendingThinking ? <PendingThinking language={language} /> : null}
          {errorMessage ? <ErrorMessage language={language} message={errorMessage} /> : null}
        </ConversationContent>
        <ConversationScrollAccessibility label={copy.chat.conversation} />
        <ConversationScrollButton aria-label={copy.chat.scrollToBottom} />
      </Conversation>

      <div className="mx-auto w-full px-4 sm:px-6 napas-chat-dock">
        <ChatUtilityRow
          contextOpen={contextOpen}
          isBusy={isBusy || isResuming}
          onStationClear={() => {
            setContextOpen(false);
            onStationClear("chat_context");
          }}
          onTopicClear={() => {
            trackNapasEvent("topic_cleared");
            setSelectedTopicId(undefined);
          }}
          onTopicOpen={() => openTopicPicker("selected_topic")}
          onContextToggle={() => setContextOpen((open) => !open)}
          onPrompt={(prompt) => void sendText(prompt)}
          language={language}
          selectedTopic={localizedTopic}
          selectedStation={selectedStation}
          suggestions={suggestedQuestions}
          showSuggestions={showSuggestedQuestions}
        />
      {inputError ? (
        <p className="px-1 pb-1 text-destructive text-xs" id="napas-composer-error" role="alert">
          {inputError}
        </p>
      ) : null}
      <div className="w-full napas-composer-wrap">{composer}</div>
      </div>
    </div>
  );
}

function EmptyChatState({ language }: { readonly language: Language }) {
  const copy = getUiCopy(language);

  return (
    <div className="napas-empty-state" aria-label={copy.chat.emptyTitle}>
      <div className="napas-empty-mark"><img alt="" src="/napas-jakarta-air-icon.png" /></div>
      <p>{copy.chat.emptyTitle}</p>
      <span>{copy.chat.emptyDescription}</span>
      <a className="napas-guide-link" href={language === "id" ? ID_GUIDE_PATH : EN_GUIDE_PATH} lang={language}>
        {copy.chat.guideLink}
      </a>
    </div>
  );
}

function ChatUtilityRow({
  contextOpen,
  isBusy,
  language,
  onContextToggle,
  onPrompt,
  onStationClear,
  onTopicClear,
  onTopicOpen,
  selectedTopic,
  selectedStation,
  suggestions,
  showSuggestions,
}: {
  readonly contextOpen: boolean;
  readonly isBusy: boolean;
  readonly language: Language;
  readonly onContextToggle: () => void;
  readonly onPrompt: (prompt: string) => void;
  readonly onStationClear: () => void;
  readonly onTopicClear: () => void;
  readonly onTopicOpen: () => void;
  readonly selectedTopic?: TopicCopy;
  readonly selectedStation?: string;
  readonly suggestions: readonly string[];
  readonly showSuggestions: boolean;
}) {
  const copy = getUiCopy(language);

  return (
    <div className="napas-chat-utility-row">
      {showSuggestions ? (
        <div aria-label={copy.chat.suggestedQuestions} className="napas-suggestions-overlay">
          {suggestions.map((prompt) => (
            <button
              className="prompt-chip"
              disabled={isBusy}
              key={prompt}
              onClick={() => {
                trackNapasEvent("suggested_question_selected");
                onPrompt(prompt);
              }}
              type="button"
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : null}
      <div className="napas-context-stack">
        {selectedTopic ? (
          <div className="napas-selected-context napas-selected-topic" role="group">
            <button
              aria-label={`${copy.chat.selectedTopic}${selectedTopic.label}`}
              className="napas-context-main"
              onClick={onTopicOpen}
              type="button"
              title={selectedTopic.label}
            >
              <BookOpenIcon aria-hidden="true" className="size-3.5" />
              <span>{selectedTopic.label}</span>
              <small>{copy.chat.topic}</small>
            </button>
            <button
              aria-label={copy.chat.clearSelectedTopic}
              className="napas-context-clear"
              onClick={onTopicClear}
              type="button"
            >
              <XIcon aria-hidden="true" className="size-3" />
            </button>
          </div>
        ) : null}
        <div className="napas-context-wrap">
          {selectedStation ? (
            <div className="napas-selected-context napas-selected-location" role="group">
              <button
                aria-expanded={contextOpen}
                aria-label={copy.chat.selectedLocation}
                className="napas-context-main"
                onClick={onContextToggle}
                type="button"
              >
                <MapPinIcon aria-hidden="true" className="size-3.5" />
                <span>{selectedStation}</span>
                <small>{copy.chat.selected}</small>
              </button>
              <button
                aria-label={copy.chat.clearSelectedLocation}
                className="napas-context-clear"
                onClick={onStationClear}
                type="button"
              >
                <XIcon aria-hidden="true" className="size-3" />
              </button>
            </div>
          ) : null}
          {contextOpen && selectedStation ? (
            <div className="napas-context-menu" role="dialog" aria-label={copy.chat.messageContext}>
              <strong>{copy.chat.messageContext}</strong>
              <span><MapPinIcon aria-hidden="true" className="size-3" />{replaceCopy(copy.chat.includeLocation, { station: selectedStation })}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StationPicker({
  language,
  onClear,
  onSelect,
  onToggle,
  open,
  pickerRef,
  selectedStation,
  selectedStationId,
  stations,
}: {
  readonly language: Language;
  readonly onClear: () => void;
  readonly onSelect: (station: DemoStation) => void;
  readonly onToggle: () => void;
  readonly open: boolean;
  readonly pickerRef: RefObject<HTMLDivElement | null>;
  readonly selectedStation?: string;
  readonly selectedStationId?: string;
  readonly stations: readonly DemoStation[];
}) {
  const selected = stations.find((station) => station.id === selectedStationId);
  const copy = getUiCopy(language);

  return (
    <div className="napas-station-picker" ref={pickerRef}>
      <button
        aria-controls="napas-station-menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="napas-station-trigger"
        onClick={onToggle}
        type="button"
      >
        <RadioTowerIcon aria-hidden="true" className="size-3.5" />
        <span>{selected?.name ?? selectedStation ?? copy.chat.station}</span>
        <ChevronDownIcon aria-hidden="true" className="size-3.5" />
      </button>
      {open ? (
        <StationMenu
          language={language}
          onClear={onClear}
          onSelect={onSelect}
          selectedStationId={selectedStationId}
          stations={stations}
        />
      ) : null}
    </div>
  );
}

function StationMenu({
  language,
  onClear,
  onSelect,
  selectedStationId,
  stations,
}: {
  readonly language: Language;
  readonly onClear: () => void;
  readonly onSelect: (station: DemoStation) => void;
  readonly selectedStationId?: string;
  readonly stations: readonly DemoStation[];
}) {
  const copy = getUiCopy(language);

  return (
    <div aria-label={copy.chat.chooseStation} className="napas-station-menu" id="napas-station-menu" role="dialog">
      <div className="napas-station-menu-head">
        <div>
          <strong>{copy.chat.chooseStation}</strong>
          <span>{copy.chat.stationMenuDescription}</span>
        </div>
        {selectedStationId ? (
          <button className="napas-station-clear" onClick={onClear} type="button">
            <XIcon aria-hidden="true" className="size-3" />
            {copy.chat.clear}
          </button>
        ) : null}
      </div>
      <div className="napas-station-list">
        {stations.length > 0 ? stations.map((station) => {
          const isSelected = station.id === selectedStationId;
          return (
            <button
              aria-pressed={isSelected}
              className={`napas-station-option${isSelected ? " is-selected" : ""}`}
              key={station.id}
              onClick={() => onSelect(station)}
              type="button"
            >
              <span className="napas-station-option-topline">
                <strong>{station.name}</strong>
                {isSelected ? <small>{copy.chat.selectedOption}</small> : null}
              </span>
              <span>{localizedDistrict(station.district, language)} · {localizedCategory(station.category, language)}</span>
            </button>
          );
        }) : (
          <p className="napas-station-empty">{copy.chat.stationLocationsLoading}</p>
        )}
      </div>
    </div>
  );
}

function TopicMenu({
  language,
  onClear,
  onSelect,
  selectedTopic,
}: {
  readonly language: Language;
  readonly onClear: () => void;
  readonly onSelect: (topic: TopicOption) => void;
  readonly selectedTopic?: TopicOption;
}) {
  const copy = getUiCopy(language);

  return (
    <div aria-label={copy.chat.chooseTopic} className="napas-topic-menu" id="napas-topic-menu" role="dialog">
      <div className="napas-topic-menu-head">
        <div>
          <strong>{copy.chat.chooseTopic}</strong>
          <span>{copy.chat.topicMenuDescription}</span>
        </div>
        {selectedTopic ? (
          <button className="napas-topic-clear" onClick={onClear} type="button">
            <XIcon aria-hidden="true" className="size-3" />
            {copy.chat.clear}
          </button>
        ) : null}
      </div>
      <p className="napas-topic-menu-note">{copy.chat.topicMenuNote}</p>
      <div className="napas-topic-list">
        {TOPIC_GROUPS.map((group) => {
          const localizedGroup = getLocalizedTopicGroupCopy(group, language);

          return (
          <section aria-labelledby={`topic-group-${group.id}`} className="napas-topic-group" key={group.id}>
            <div className="napas-topic-group-head">
              <h2 id={`topic-group-${group.id}`}>{localizedGroup.label}</h2>
              <p>{localizedGroup.description}</p>
            </div>
            <div className="napas-topic-options">
              {group.topics.map((topic) => {
                const localizedTopic = getLocalizedTopicCopy(topic, language);
                const sourceLabels = getTopicSourceLabels(topic, language);
                const sourceSummary = sourceLabels.length > 2
                  ? `${sourceLabels.slice(0, 2).join(" · ")} +${sourceLabels.length - 2} ${copy.chat.more}`
                  : sourceLabels.join(" · ");
                return (
                  <button
                    aria-pressed={selectedTopic?.id === topic.id}
                    className={`napas-topic-option${selectedTopic?.id === topic.id ? " is-selected" : ""}`}
                    key={topic.id}
                    onClick={() => onSelect(topic)}
                    type="button"
                  >
                    <span className="napas-topic-option-topline">
                      <strong>{localizedTopic.label}</strong>
                      {selectedTopic?.id === topic.id ? <span className="napas-topic-selected-label">{copy.chat.selectedOption}</span> : null}
                    </span>
                    <span className="napas-topic-option-description">{localizedTopic.description}</span>
                    <span className="napas-topic-option-question"><em>{copy.chat.ask}</em> {localizedTopic.suggestedQuestion}</span>
                    <span className="napas-topic-option-source"><BookOpenIcon aria-hidden="true" className="size-3" />{sourceSummary}</span>
                    {topic.reviewStatus === "clinical-review-required" ? (
                      <span className="napas-topic-review-note">{copy.chat.clinicalReview}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
          );
        })}
      </div>
    </div>
  );
}

function ComposerAction({
  hasInputText,
  isBusy,
  isResuming,
  language,
  onCancel,
}: {
  readonly hasInputText: boolean;
  readonly isBusy: boolean;
  readonly isResuming: boolean;
  readonly language: Language;
  readonly onCancel: () => void;
}) {
  const copy = getUiCopy(language);
  const canSubmit = hasInputText;

  if (!isBusy || canSubmit) {
    return (
      <PromptInputSubmit
        aria-label={copy.chat.sendMessage}
        className="napas-send-action absolute right-2.5 top-1/2"
        disabled={isResuming}
      >
        <SendHorizontalIcon aria-hidden="true" className="size-4" />
        <span className="napas-send-label">{copy.chat.send}</span>
      </PromptInputSubmit>
    );
  }

  return (
    <PromptInputButton
      aria-label={copy.chat.stop}
      className="napas-send-action napas-stop-action absolute right-2.5 top-1/2"
      onClick={onCancel}
      variant="outline"
    >
      <SquareIcon className="size-3 fill-current" />
    </PromptInputButton>
  );
}

function ErrorMessage({ language, message }: { readonly language: Language; readonly message: string }) {
  const copy = getUiCopy(language);

  return (
    <Message className="max-w-full" from="assistant">
      <MessageContent>
        <div
          className="flex w-full items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm"
          role="alert"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">{copy.chat.requestFailed}</p>
            <p className="mt-0.5 text-muted-foreground">{message}</p>
          </div>
        </div>
      </MessageContent>
    </Message>
  );
}

function PendingThinking({ language }: { readonly language: Language }) {
  const copy = getUiCopy(language);

  return (
    <Message aria-live="polite" className="napas-thinking-message" from="assistant">
      <MessageContent>
        <div className="mb-4 flex w-full items-center gap-2 text-muted-foreground text-sm">
          <BrainIcon className="size-4" />
          <Shimmer duration={1}>{copy.chat.thinking}</Shimmer>
        </div>
      </MessageContent>
    </Message>
  );
}

function toErrorMessage(error: unknown, language: Language): string {
  return localizeAgentError(error instanceof Error ? error.message : undefined, language) ?? getUiCopy(language).chat.unableToCancel;
}

function localizeAgentError(message: string | undefined, language: Language): string | undefined {
  return localizeChatError(message, language);
}

function getLatestTurnFailure(
  events: ReturnType<typeof useEveAgent>["events"],
  language: Language,
): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event.type === "turn.failed") {
      return event.data.code === "MODEL_CALL_FAILED"
        ? getUiCopy(language).chat.modelUnavailable
        : getUiCopy(language).chat.requestFailedDetail;
    }

    if (event.type === "turn.completed" || event.type === "turn.cancelled") {
      return undefined;
    }

    if (event.type === "message.received") {
      return undefined;
    }
  }

  return undefined;
}

function messageText(message: EveMessage): string {
  return message.parts
    .filter((part): part is Extract<EveMessage["parts"][number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}

function createAnonymousSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `anonymous-${crypto.randomUUID()}`;
  }
  return `anonymous-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
