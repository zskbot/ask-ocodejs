import { createV0Client } from "v0";
import {
  authenticateFirebaseRequest,
  authorizeV0User,
  enforceV0RateLimit,
  issueV0ChatToken,
  V0HttpError,
} from "../../src/server/v0-security.js";

const MAX_PROMPT_CHARS = 12_000;

function sendError(res, status, code, message) {
  return res.status(status).json({ success: false, error: { code, message } });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  }

  const apiKey = process.env.V0_API_KEY;
  if (!apiKey) return sendError(res, 503, "V0_NOT_CONFIGURED", "v0 Builder đang tắt vì máy chủ chưa có V0_API_KEY.");

  try {
    const user = await authenticateFirebaseRequest(req);
    authorizeV0User(user);
    const ip = String(req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown").slice(0, 128);
    await enforceV0RateLimit(`ocodejs:v0:create:user:${user.uid}`, { max: 5 });
    await enforceV0RateLimit(`ocodejs:v0:create:ip:${ip}`, { max: 20 });

    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) return sendError(res, 400, "INVALID_PROMPT", "Nhập yêu cầu trước khi gửi.");
    if (message.length > MAX_PROMPT_CHARS) return sendError(res, 413, "PROMPT_TOO_LARGE", `Prompt tối đa ${MAX_PROMPT_CHARS} ký tự.`);

    const client = createV0Client({ auth: apiKey });
    const result = await client.chats.create({
      message,
      privacy: "private",
      modelConfiguration: { modelId: "v0-pro", imageGenerations: false },
    });
    if (result.error) {
      console.error("v0 chat creation failed", { status: result.error.status, code: result.error.code });
      return sendError(res, 502, "V0_PROVIDER_FAILED", "v0 không thể tạo chat lúc này.");
    }

    const chatId = result.data?.chat?.id;
    if (typeof chatId !== "string" || !chatId) {
      return sendError(res, 502, "V0_INVALID_RESPONSE", "v0 trả về dữ liệu chat không hợp lệ.");
    }

    const chatToken = issueV0ChatToken({ uid: user.uid, chatId, secret: apiKey });
    let responseText = "v0 đã nhận yêu cầu và tạo chat riêng tư. Có thể gửi yêu cầu tiếp theo để tiếp tục.";
    try {
      const messagesResult = await client.messages.list({ chatId });
      if (!messagesResult.error) {
        const assistantMessage = messagesResult.data?.messages?.find(message => message.role === "assistant");
        const parts = Array.isArray(assistantMessage?.parts) ? assistantMessage.parts : [];
        const partsText = parts.filter(part => part?.type === "text" && typeof part.text === "string")
          .map(part => part.text)
          .join("\\n")
          .trim();
        const generatedText = partsText || (typeof assistantMessage?.content === "string" ? assistantMessage.content.trim() : "");
        if (generatedText) responseText = generatedText;
      }
    } catch {
      // Chat creation succeeded; the first response can be fetched by sending a follow-up.
    }
    return res.status(201).json({
      success: true,
      chatId,
      chatToken,
      response: responseText,
      webUrl: result.data?.chat?.webUrl,
    });
  } catch (error) {
    if (error instanceof V0HttpError) {
      if (error.status === 429) res.setHeader("Retry-After", "60");
      return sendError(res, error.status, error.code, error.message);
    }
    console.error("v0 chat endpoint failed", { name: error?.name || "Error" });
    return sendError(res, 502, "V0_PROVIDER_FAILED", "Không thể hoàn tất yêu cầu v0. Hãy thử lại sau.");
  }
}
