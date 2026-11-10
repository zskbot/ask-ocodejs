import { auth } from "./firebase-client";

const MAX_V0_PROMPT_CHARS = 12_000;

export async function requestV0Chat({
  message,
  chat,
  fetchImpl = fetch,
  apiBase = "",
}) {
  const trimmed = typeof message === "string" ? message.trim() : "";
  if (!trimmed) throw new Error("Nhập yêu cầu trước khi gửi.");
  if (trimmed.length > MAX_V0_PROMPT_CHARS) throw new Error(`Prompt v0 tối đa ${MAX_V0_PROMPT_CHARS} ký tự.`);
  const user = auth.currentUser;
  if (!user) throw new Error("Đăng nhập GitHub, Google hoặc email trước khi dùng v0 Builder.");

  const idToken = await user.getIdToken();
  const base = typeof apiBase === "string" ? apiBase.trim().replace(/\/$/, "") : "";
  const isNewChat = !chat?.chatId || !chat?.chatToken;
  const url = isNewChat
    ? `${base}/api/v0/chats`
    : `${base}/api/v0/chats/${encodeURIComponent(chat.chatId)}/messages`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${idToken}`,
  };
  if (!isNewChat) headers["X-OCodeJS-Chat-Token"] = chat.chatToken;

  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ message: trimmed }),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Backend v0 trả về dữ liệu không hợp lệ.");
  }
  if (!response.ok) {
    const error = data?.error?.message || "Không thể gọi v0 Builder.";
    if (response.status === 401) throw new Error("Phiên đăng nhập hết hạn. Hãy đăng nhập lại.");
    throw new Error(error);
  }
  if (typeof data?.response !== "string" || !data.response.trim()) {
    throw new Error("v0 đã phản hồi nhưng không có nội dung hợp lệ.");
  }
  return {
    response: data.response,
    chat: isNewChat ? { chatId: data.chatId, chatToken: data.chatToken } : chat,
    webUrl: data.webUrl,
  };
}
