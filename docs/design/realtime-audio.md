# Realtime Audio and Screen Sharing for One-on-One Chat

## Summary

We want the one-on-one chat view to support a live audio conversation with the selected employee and optionally stream the user’s screen to the agent. The feature should reuse the existing OpenAI integration so users do not need to configure a separate API key, and it must honour the same shared system prompt logic that already governs text interactions.

## Goals

- Provide a “Go Live” experience inside the one-on-one chat view that starts a realtime audio session with the current agent.
- Capture the user’s microphone (and optionally screen) from the webview UI and stream it to the agent using OpenAI’s realtime WebRTC API.
- Play the agent’s audio responses in real time and surface a running transcript back into the chat log.
- Reuse the existing system prompt, mode selection, and API configuration so audio sessions behave consistently with text chats.
- Allow the agent to request and receive screen visuals with minimal setup friction while keeping user consent explicit.

## Non-Goals

- Conferencing with multiple agents or human participants (focus is one user ↔ one agent).
- Recording or storing audio/video artifacts beyond the live session.
- Implementing full-duplex remote control; we only mirror visuals for now.
- Supporting providers that do not expose a realtime WebRTC endpoint (we will guard the UI behind provider capability checks).

## External References

- OpenAI Realtime API general availability announcement (Aug 28 2025) describes WebRTC support, image inputs, and shared memory for tool calling.
- September 2025 OpenAI docs outline the `OpenAIRealtimeWebRTC` helper in the `agents-js` SDK and how to attach media tracks plus tool events.
- Azure OpenAI realtime docs show the same `POST /realtime/sessions` + WebRTC SDP flow, confirming how we mint ephemeral session keys with our existing server-side credentials.

## High-Level Architecture

1. **User action** – The user presses “Start live audio” in the one-on-one chat panel.
2. **Webview request** – The webview posts `startRealtimeSession` to the extension host.
3. **Extension host** – The host validates provider capability, resolves the active system prompt + mode, and calls the OpenAI `realtime/sessions` endpoint with the stored API key to mint an ephemeral access token and default session configuration.
4. **Credential handoff** – The extension returns the token, target model (e.g. `gpt-4o-mini-realtime-preview`), and initial instructions to the webview via a `realtimeSessionCredentials` message.
5. **WebRTC setup** – The webview creates a `OpenAIRealtimeWebRTC` client, requests microphone (and optional screen) media, attaches the outbound tracks, and completes the SDP offer/answer handshake against OpenAI using the ephemeral token.
6. **Live loop** – Audio flows bidirectionally. The SDK’s data channel emits transcript deltas and tool events, which we bridge back into the existing chat timeline as assistant messages. The extension continues to handle non-audio tool calls (filesystem, MCP) like today.
7. **End session** – When the user hangs up or navigates away, the webview sends `stopRealtimeSession`; the extension invalidates local session state and the SDK closes the peer connection.

## Component Responsibilities

- **Webview UI (React):** Adds live session controls (start/stop, mute, screen-share toggle), renders call status, and pipes transcript updates into the chat timeline. Manages browser APIs (`getUserMedia`, `getDisplayMedia`) and the realtime SDK instance.
- **Extension Host (Node/VSC):** Owns API credentials, mints ephemeral realtime tokens, injects the shared system prompt, and relays live transcription snippets into the persisted task history. It also tracks session lifecycle to prevent orphaned peer connections.
- **Realtime Session Manager (new):** A thin service layer in the extension that exposes `createSession`, `updateSessionInstructions`, and `closeSession` so other parts of the extension can interact with realtime state without duplicating OpenAI API calls.
- **Existing Task/Message Pipeline:** Receives transcript events as structured assistant/user messages so that after the call the conversation history remains searchable and exportable.

## UI Touchpoint

- Place a phone toggle between the attachment and send buttons inside the chat input. Idle state launches permission prompts for microphone and screen share; connecting shows a spinner; active state flips to hang-up (`phone-off`) styling. Tooltips communicate "Start live audio" or "Stop live audio" depending on state.

## Screen Sharing Strategy

- The webview requests screen capture via `navigator.mediaDevices.getDisplayMedia` only after explicit user consent.
- We attach the resulting video track to the realtime peer connection if the provider advertises video support; otherwise we fall back to capturing periodic still frames (e.g. one frame every 2 s) and sending them as `input_image` events.
- The agent is notified through the data channel when screen share starts/stops so the prompt can adapt.
- Screen capture state is reflected in the UI with a clear indicator and a “Stop sharing” button that also tears down the track.

## Prompt Handling

- We reuse the existing `getSystemPrompt` flow to fetch the fully expanded system prompt (mode + custom overrides).
- On session creation the extension sends the prompt in the session payload (`session.instructions`). If the user edits instructions mid-call we propagate updates via a `session.update` event on the data channel.

## State & Telemetry

- Session state (active, muted, sharing) lives in React state and is mirrored to the extension so it can restore UI if the webview reloads.
- We extend telemetry events to capture session duration, screen-share usage, and failure categories without logging audio content.

## Error Handling

- UI exposes toast/banner messaging when permissions are denied, the realtime handshake fails, or bandwidth runs low.
- The extension falls back gracefully: if realtime token minting fails we log the error, show a toast, and do not expose the “Go Live” button.

## Security Considerations

- The permanent API key never leaves the extension host. Webview receives only short-lived tokens (≤60 s TTL) and no refresh capability.
- Screen capture requests are initiated only from direct user interaction, and we immediately stop tracks when the session ends or the user toggles sharing off.
- We gate the feature behind policy checks (e.g. enterprise settings that forbid audio capture).

## Implementation Roadmap (MVP)

1. **Backend scaffolding:** Create `RealtimeSessionManager` in the extension, handle capability detection, and expose `start/stop/update` commands.
2. **Message plumbing:** Add new webview ↔ extension message types for session control and transcript delivery.
3. **UI controls:** Implement the live session widget in `ChatView`, including microphone permission flow and status indicators.
4. **WebRTC integration:** Add the `@openai/agents` dependency for the webview bundle, wire up microphone streaming, and play remote audio.
5. **Transcripts & history:** Map realtime transcript deltas into chat messages so the conversation log stays coherent.
6. **Screen share MVP:** Provide opt-in screen sharing, initially using still-frame uploads if video track support is unavailable.
7. **QA & fallback:** Add feature flags, analytics, and automated tests where feasible (React component tests + mocked session manager).

## Stretch Follow-Ups

- Adaptive bitrate management for screen capture.
- Live captions for accessibility.
- Recording opt-in with secure storage.
- Support for additional realtime-capable providers when available.

## Open Questions

- Do all target deployment environments (desktop VS Code, web, VSCodium) permit `getDisplayMedia` inside webviews?
- Which models will we allow for realtime sessions (OpenAI-only at launch, or can we proxy other providers)?
- How should we surface agent-initiated tool calls that arrive via the realtime data channel (inline vs. existing queued tool UI)?
