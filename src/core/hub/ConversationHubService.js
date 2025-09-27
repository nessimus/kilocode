import EventEmitter from "events";
import { v4 as uuidv4 } from "uuid";
import { HubSnapshotSchema, HubRoomSettingsSchema, } from "../../shared/hub";
import { HubAgentSession } from "./HubAgentSession";
import { HubTurnCoordinator } from "./HubTurnCoordinator";
const HUMAN_DISPLAY_NAME = "You";
const HUMAN_COLOR = "#94A3B8";
const AGENT_COLORS = ["#7C3AED", "#EC4899", "#6366F1", "#22C55E", "#F97316", "#0EA5E9", "#F59E0B", "#14B8A6"];
const HUB_STORAGE_KEY = "kilocode.conversationHub.snapshot.v1";
const HUB_STORAGE_VERSION = 1;
export class ConversationHubService extends EventEmitter {
    provider;
    rooms = new Map();
    agentSessions = new Map();
    roomQueues = new Map();
    turnCoordinator = new HubTurnCoordinator();
    activeRuns = new Map();
    roomsBeingStopped = new Set();
    persistTimer;
    isRestoring = false;
    activeRoomId;
    constructor(provider) {
        super();
        this.provider = provider;
        this.isRestoring = true;
        try {
            this.restoreFromStorage();
        }
        finally {
            this.isRestoring = false;
        }
    }
    getSnapshot() {
        return {
            rooms: Array.from(this.rooms.values()).map((room) => this.cloneRoom(room)),
            activeRoomId: this.activeRoomId,
        };
    }
    createRoom(options = {}) {
        const now = Date.now();
        const id = uuidv4();
        const settings = HubRoomSettingsSchema.parse({
            autonomous: options.autonomous ?? false,
        });
        const room = {
            id,
            title: options.title?.trim() || `Hub Session ${this.rooms.size + 1}`,
            description: options.description,
            createdAt: now,
            updatedAt: now,
            messages: [],
            participants: [],
            settings,
            active: true,
            followUps: [],
        };
        this.rooms.set(room.id, room);
        this.setActiveRoom(room.id);
        // Ensure the human participant exists for every room.
        this.ensureHumanParticipant(room);
        if (options.participants?.length) {
            for (const participant of options.participants) {
                void this.addAgent(room.id, participant);
            }
        }
        this.emitRoomUpdated(room);
        return room;
    }
    setActiveRoom(roomId) {
        if (this.activeRoomId === roomId) {
            return;
        }
        this.activeRoomId = roomId;
        for (const room of this.rooms.values()) {
            room.active = room.id === roomId;
        }
        this.emitState();
    }
    async addAgent(roomId, blueprint) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return undefined;
        }
        const displayName = blueprint.displayName.trim() || `Agent ${room.participants.length}`;
        const resolvedMode = blueprint.mode ?? blueprint.persona?.baseModeSlug ?? "code";
        const participant = {
            id: uuidv4(),
            displayName,
            type: "agent",
            mode: resolvedMode,
            color: this.nextAgentColor(room),
            icon: "codicon-robot",
            persona: blueprint.persona,
        };
        room.participants.push(participant);
        room.updatedAt = Date.now();
        const session = new HubAgentSession(participant, this.provider);
        this.agentSessions.set(participant.id, session);
        this.emitRoomUpdated(room);
        return participant;
    }
    removeParticipant(roomId, participantId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return;
        }
        const index = room.participants.findIndex((participant) => participant.id === participantId);
        if (index === -1) {
            return;
        }
        const [removed] = room.participants.splice(index, 1);
        if (removed.type === "agent") {
            this.agentSessions.delete(removed.id);
        }
        room.updatedAt = Date.now();
        this.emitRoomUpdated(room);
    }
    sendUserMessage(roomId, text) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return;
        }
        const trimmed = text.trim();
        if (!trimmed) {
            return;
        }
        const human = this.ensureHumanParticipant(room);
        const message = this.appendMessage(room, human.id, trimmed, "final");
        room.followUps = [];
        this.emitRoomUpdated(room);
        this.turnCoordinator.handleUserMessage(room, trimmed);
        this.enqueueAgentTurns(room.id, message.participantId);
    }
    updateSettings(roomId, partial) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return;
        }
        const previousAutonomous = room.settings.autonomous;
        room.settings = HubRoomSettingsSchema.parse({
            ...room.settings,
            ...partial,
        });
        room.updatedAt = Date.now();
        this.emitRoomUpdated(room);
        if (previousAutonomous && !room.settings.autonomous) {
            room.followUps = [];
            this.stopRoom(roomId);
        }
    }
    stopRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return;
        }
        room.followUps = [];
        this.turnCoordinator.clearPending(room);
        this.roomsBeingStopped.add(roomId);
        this.emitRoomUpdated(room);
        const active = this.activeRuns.get(roomId);
        if (active) {
            active.requestStop();
        }
        else {
            this.roomsBeingStopped.delete(roomId);
        }
    }
    triggerAgent(roomId, agentId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return;
        }
        room.followUps = room.followUps?.filter((suggestion) => suggestion.agentId !== agentId);
        room.updatedAt = Date.now();
        this.turnCoordinator.enqueueAgent(room, agentId);
        this.emitRoomUpdated(room);
        this.enqueueAgentTurns(roomId);
    }
    dispose() {
        this.clearPersistTimer();
        const snapshot = this.getSnapshot();
        void this.persistState(snapshot);
        this.agentSessions.clear();
        this.roomQueues.clear();
        this.rooms.clear();
        this.removeAllListeners();
    }
    enqueueAgentTurns(roomId, initiatorId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return;
        }
        const initiator = initiatorId
            ? room.participants.find((participant) => participant.id === initiatorId)
            : undefined;
        const shouldRun = !initiator || initiator.type !== "agent" || room.settings.autonomous;
        if (!shouldRun) {
            return;
        }
        const existing = this.roomQueues.get(roomId) ?? Promise.resolve();
        const next = existing
            .catch(() => {
            // Errors are handled downstream, we just prevent unhandled promise rejections here.
        })
            .then(() => this.runAgentTurns(roomId));
        this.roomQueues.set(roomId, next);
    }
    async runAgentTurns(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return;
        }
        while (true) {
            if (this.roomsBeingStopped.has(roomId)) {
                break;
            }
            const nextAgentId = this.turnCoordinator.getNextAgent(room);
            if (!nextAgentId) {
                break;
            }
            const agent = room.participants.find((participant) => participant.id === nextAgentId);
            if (!agent || agent.type !== "agent") {
                continue;
            }
            const session = this.agentSessions.get(agent.id);
            if (!session) {
                continue;
            }
            const context = this.buildContextSnapshot(room);
            const newMessage = this.createStreamingMessage(room, agent.id);
            this.activeRuns.set(room.id, session);
            await session.respond(context, (update) => {
                newMessage.content = update.content;
                newMessage.status = update.status;
                newMessage.updatedAt = Date.now();
                if (update.error) {
                    newMessage.error = update.error;
                }
                room.lastSpeakerId = agent.id;
                room.updatedAt = Date.now();
                this.emitRoomUpdated(room);
            });
            if (newMessage.status === "streaming") {
                newMessage.status = "final";
                newMessage.updatedAt = Date.now();
                this.emitRoomUpdated(room);
            }
            if (newMessage.status === "final") {
                this.turnCoordinator.handleAgentMessage(room, agent.id, newMessage.content ?? "");
            }
            this.activeRuns.delete(room.id);
            const deferredAgentIds = this.turnCoordinator.consumeDeferred(room);
            if (deferredAgentIds.length > 0) {
                room.followUps = deferredAgentIds
                    .map((agentId) => room.participants.find((participant) => participant.id === agentId && participant.type === "agent"))
                    .filter((participant) => Boolean(participant))
                    .map((participant) => ({
                    id: `${room.id}-${participant.id}-${Date.now()}`,
                    agentId: participant.id,
                    displayName: participant.displayName,
                    prompt: `Hear from ${participant.displayName}`,
                }));
                this.emitRoomUpdated(room);
                break;
            }
            if (!room.settings.autonomous) {
                break;
            }
        }
        this.roomsBeingStopped.delete(roomId);
    }
    buildContextSnapshot(room) {
        const clonedRoom = this.cloneRoom(room);
        return {
            room: clonedRoom,
            messages: clonedRoom.messages,
            participants: clonedRoom.participants,
        };
    }
    createStreamingMessage(room, participantId) {
        const now = Date.now();
        const message = {
            id: uuidv4(),
            participantId,
            content: "",
            createdAt: now,
            updatedAt: now,
            status: "streaming",
        };
        room.messages.push(message);
        room.updatedAt = now;
        room.lastSpeakerId = participantId;
        this.emitRoomUpdated(room);
        return message;
    }
    appendMessage(room, participantId, content, status) {
        const now = Date.now();
        const message = {
            id: uuidv4(),
            participantId,
            content,
            createdAt: now,
            updatedAt: now,
            status,
        };
        room.messages.push(message);
        room.updatedAt = now;
        room.lastSpeakerId = participantId;
        return message;
    }
    ensureHumanParticipant(room) {
        let participant = room.participants.find((entry) => entry.type === "user");
        if (!participant) {
            participant = {
                id: `${room.id}-human`,
                displayName: HUMAN_DISPLAY_NAME,
                type: "user",
                color: HUMAN_COLOR,
                icon: "codicon-account",
            };
            room.participants.unshift(participant);
        }
        return participant;
    }
    nextAgentColor(room) {
        const used = new Set(room.participants
            .filter((participant) => participant.type === "agent")
            .map((participant) => participant.color));
        const available = AGENT_COLORS.find((color) => !used.has(color));
        return available ?? AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)];
    }
    cloneRoom(room) {
        return {
            ...room,
            messages: room.messages.map((message) => ({ ...message })),
            participants: room.participants.map((participant) => ({ ...participant })),
            settings: { ...room.settings },
            active: room.id === this.activeRoomId,
            followUps: room.followUps ? room.followUps.map((suggestion) => ({ ...suggestion })) : undefined,
        };
    }
    emitRoomUpdated(room) {
        this.emitState();
        this.emit("roomUpdated", this.cloneRoom(room));
    }
    emitState() {
        this.emit("stateChanged", this.getSnapshot());
        this.schedulePersist();
    }
    schedulePersist() {
        if (this.isRestoring) {
            return;
        }
        this.clearPersistTimer();
        this.persistTimer = setTimeout(() => {
            this.persistTimer = undefined;
            void this.persistState();
        }, 250);
    }
    async persistState(snapshot) {
        const contextProxy = this.provider.contextProxy;
        const context = contextProxy.rawContext;
        if (!context) {
            return;
        }
        try {
            const stateToPersist = snapshot ?? this.getSnapshot();
            const payload = {
                version: HUB_STORAGE_VERSION,
                snapshot: stateToPersist,
            };
            await contextProxy.updateWorkspaceState(context, HUB_STORAGE_KEY, payload);
        }
        catch (error) {
            this.provider.log(`[ConversationHubService] Failed to persist hub state: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    restoreFromStorage() {
        const contextProxy = this.provider.contextProxy;
        const context = contextProxy.rawContext;
        if (!context) {
            return;
        }
        let stored;
        try {
            stored = context.workspaceState.get(HUB_STORAGE_KEY);
        }
        catch (error) {
            this.provider.log(`[ConversationHubService] Failed to load hub state: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }
        if (!stored) {
            return;
        }
        const snapshot = this.parseStoredSnapshot(stored);
        if (!snapshot) {
            return;
        }
        this.hydrateFromSnapshot(snapshot);
    }
    parseStoredSnapshot(stored) {
        try {
            if (stored && typeof stored === "object" && "version" in stored && "snapshot" in stored) {
                const payload = stored;
                return HubSnapshotSchema.parse(payload.snapshot);
            }
            return HubSnapshotSchema.parse(stored);
        }
        catch (error) {
            this.provider.log(`[ConversationHubService] Ignoring persisted hub state due to schema mismatch: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }
    hydrateFromSnapshot(snapshot) {
        this.rooms.clear();
        this.agentSessions.clear();
        this.roomQueues.clear();
        for (const room of snapshot.rooms) {
            const clonedRoom = {
                ...room,
                messages: room.messages.map((message) => ({ ...message })),
                participants: room.participants.map((participant) => ({ ...participant })),
                settings: HubRoomSettingsSchema.parse({ ...room.settings }),
                active: false,
            };
            // Ensure the human participant exists in restored rooms.
            this.ensureHumanParticipant(clonedRoom);
            this.rooms.set(clonedRoom.id, clonedRoom);
            for (const participant of clonedRoom.participants) {
                if (participant.type === "agent") {
                    const session = new HubAgentSession(participant, this.provider);
                    this.agentSessions.set(participant.id, session);
                }
            }
        }
        if (snapshot.activeRoomId && this.rooms.has(snapshot.activeRoomId)) {
            this.activeRoomId = snapshot.activeRoomId;
        }
        else {
            this.activeRoomId = snapshot.rooms[0]?.id;
        }
        for (const room of this.rooms.values()) {
            room.active = room.id === this.activeRoomId;
        }
    }
    clearPersistTimer() {
        if (this.persistTimer) {
            clearTimeout(this.persistTimer);
            this.persistTimer = undefined;
        }
    }
}
//# sourceMappingURL=ConversationHubService.js.map