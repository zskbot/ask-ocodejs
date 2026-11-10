import { createV0Client } from "v0";
import {
  authenticateFirebaseRequest,
  consumeV0RateLimit,
  verifyV0ChatToken,
  V0HttpError,
} from "../../../../src/server/v0-security.js";

const MAX_PROMPT_CHARS = 12_000;

function sendError(res, status, code, message) {
  return res.status(status).json({ success: false, error: { code, message } });
}

function messageText(data) {
  const message = data?.message || data;
  if (typeof message?.content === "string" && message.content.trim()) return message.content;
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  return parts.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n").trim();
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  }

  const apiKey = process.env.V0_API_KEY;
  if (!apiKey) return sendError(res, 503, "V0_NOT_CONFIGURED", "v0 Builder đang tắt vì máy chủ chưa có V0_API_KEY.");

  try {
    const user = await authenticateFirebaseRequest(req);
    const chatId = String(req.query?.chatId || "");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(chatId)) return sendError(res, 400, "INVALID_CHAT_ID", "Chat ID không hợp lệ.");

    const token = req.headers["x-ocodejs-chat-token"];
    if (!verifyV0ChatToken(token, { uid: user.uid, chatId, secret: apiKey })) {
      return sendError(res, 403, "CHAT_ACCESS_DENIED", "Bạn không có quyền truy cập chat này.");
    }

    const uidLimit = consumeV0RateLimit(`message:user:${user.uid}`, { max: 20 });
    const ip = String(req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown").slice(0, 128);
    const ipLimit = consumeV0RateLimit(`message:ip:${ip}`, { max: 40 });
    if (!uidLimit.allowed || !ipLimit.allowed) {
      const retryAfter = Math.max(uidLimit.retryAfter, ipLimit.retryAfter);
      res.setHeader("Retry-After", String(retryAfter));
      return sendError(res, 429, "RATE_LIMITED", "Đã đạt giới hạn gửi tin nhắn v0. Hãy thử lại sau.");
    }

    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) return sendError(res, 400, "INVALID_PROMPT", "Nhập yêu cầu trước khi gửi.");
    if (message.length > MAX_PROMPT_CHARS) return sendError(res, 413, "PROMPT_TOO_LARGE", `Prompt tối đa ${MAX_PROMPT_CHARS} ký tự.`);

    const client = createV0Client({ auth: apiKey });
    const result = await client.messages.send({ chatId, message });
    if (result.error) {
      console.error("v0 message failed", { status: result.error.status, code: result.error.code });
      return sendError(res, 502, "V0_PROVIDER_FAILED", "v0 không thể xử lý tin nhắn lúc này.");
    }

    const response = messageText(result.data);
    if (!response) return sendError(res, 502, "V0_INVALID_RESPONSE", "v0 trả về phản hồi rỗng hoặc không hợp lệ.");
    return res.status(200).json({ success: true, chatId, response });
  } catch (error) {
    if (error instanceof V0HttpError) return sendError(res, error.status, error.code, error.message);
    console.error("v0 message endpoint failed", { name: error?.name || "Error" });
    return sendError(res, 502, "V0_PROVIDER_FAILED", "Không thể hoàn tất yêu cầu v0. Hãy thử lại sau.");
  }
}
