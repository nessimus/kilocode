import React from "react"

import ChatHubChatView, { type ChatHubChatViewProps } from "./ChatHubChatView"

const ChatsHubView: React.FC<ChatHubChatViewProps> = (props) => (
	<div data-testid="chats-hub-view">
		<ChatHubChatView {...props} />
	</div>
)

export default ChatsHubView
