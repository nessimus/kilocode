export const defaultOuterGateIntegrations = [
    {
        id: "notion",
        name: "Notion",
        status: "not_connected",
        providerIcon: "codicon-book",
        description: "Connected workspace wiki for organizing docs and projects across your team.",
    },
    {
        id: "miro",
        name: "Miro",
        status: "not_connected",
        providerIcon: "codicon-layout",
        description: "Collaborative whiteboarding platform for brainstorming, mapping, and planning.",
    },
    {
        id: "life-hq",
        name: "Life HQ",
        status: "coming_soon",
        providerIcon: "codicon-organization",
        description: "LifeHQ stream placeholder — this will light up once their API opens later this quarter.",
    },
    {
        id: "drive",
        name: "Google Drive",
        status: "coming_soon",
        providerIcon: "codicon-cloud-upload",
        description: "Google Drive connector is in progress. Use Notion, Miro, or ZIP uploads for now.",
    },
    {
        id: "chatgpt",
        name: "OpenAI ChatGPT",
        status: "not_connected",
        providerIcon: "codicon-hubot",
        description: "Import your chat history from OpenAI's ChatGPT.",
    },
    {
        id: "zip-file",
        name: "Zip File",
        status: "not_connected",
        providerIcon: "codicon-archive",
        description: "Drop a .zip archive of notes, transcripts, or research to ingest them manually.",
    },
];
export const defaultOuterGateState = {
    analysisPool: {
        totalCaptured: 0,
        processing: 0,
        ready: 0,
        assignedThisWeek: 0,
        lastUpdatedIso: new Date().toISOString(),
    },
    recentInsights: [],
    suggestions: [
        "Map my latest journal entries into themes",
        "Draft a venture brief around eco retreats",
        "Surface which idea deserves a dedicated workspace",
    ],
    quickActions: [
        {
            slug: "create-company",
            title: "Create Company",
            description: "Launch a new company space with AI teammates and templates tuned to your mission.",
            icon: "codicon-building",
        },
        {
            slug: "import-data",
            title: "Import Data",
            description: "Bring in Notion, Miro, ChatGPT exports, or manual ZIPs so Clover can learn your world.",
            icon: "codicon-cloud-upload",
        },
        {
            slug: "capture-thought",
            title: "Quick Capture",
            description: "Drop an idea, voice note, or inspiration to file it into the analysis pool.",
            icon: "codicon-mic",
        },
    ],
    integrations: defaultOuterGateIntegrations.map((integration) => ({ ...integration })),
    cloverMessages: [],
    isCloverProcessing: false,
    cloverSessions: {
        entries: [],
        hasMore: false,
        cursor: undefined,
        isLoading: false,
        isInitialFetchComplete: false,
    },
    activeCloverSessionId: undefined,
    passionMap: {
        status: "idle",
        points: [],
        clusters: [],
        generatedAtIso: undefined,
        lastRequestedIso: undefined,
        summary: undefined,
        error: undefined,
    },
};
export const isOuterGateState = (value) => {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value;
    return (candidate.analysisPool !== undefined &&
        candidate.recentInsights !== undefined &&
        candidate.suggestions !== undefined &&
        candidate.quickActions !== undefined &&
        candidate.integrations !== undefined &&
        candidate.cloverMessages !== undefined &&
        candidate.cloverSessions !== undefined &&
        candidate.passionMap !== undefined);
};
//# sourceMappingURL=outerGate.js.map