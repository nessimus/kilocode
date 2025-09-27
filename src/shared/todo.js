export function getLatestTodo(clineMessages) {
    const todos = clineMessages
        .filter((msg) => (msg.type === "ask" && msg.ask === "tool") || (msg.type === "say" && msg.say === "user_edit_todos"))
        .map((msg) => {
        try {
            return JSON.parse(msg.text ?? "{}");
        }
        catch {
            return null;
        }
    })
        .filter((item) => item && item.tool === "updateTodoList" && Array.isArray(item.todos))
        .map((item) => item.todos)
        .pop();
    if (todos) {
        return todos;
    }
    else {
        return [];
    }
}
//# sourceMappingURL=todo.js.map